import json
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_api import ORIGIN, farm_payload, register

SAMPLE = (Path(__file__).parent / "sample_result.json").read_text(encoding="utf-8")
TOCA = {"type": "Polygon", "coordinates": [[[-47.7720, -22.2190], [-47.7650, -22.2190], [-47.7650, -22.2120], [-47.7720, -22.2120], [-47.7720, -22.2190]]]}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def motor():
    from app.ia.motor import motor as carregar

    return carregar()


def wait_study(client, study_id, timeout=30):
    fim = time.time() + timeout
    while time.time() < fim:
        s = client.get(f"/api/v1/ai/studies/{study_id}").json()
        if s["status"] in ("complete", "failed"):
            return s
        time.sleep(0.2)
    raise AssertionError("study did not finish")


def test_demo_farms_loaded(motor):
    from app.ia.motor import DEMO_FARMS

    for nome in DEMO_FARMS:
        assert nome in motor.DADOS, nome
    assert len(motor.TABELA) == 31
    assert motor.INICIO_SAFRA["rio_campim_norte"] == 11
    assert motor.INICIO_SAFRA["boone_iowa_eua"] == 5


def test_overview_is_deterministic(motor):
    from app.ia import service

    ov = service.point_overview("fazenda_da_toca_sudeste")
    assert len(ov["monthly"]) == 12 and len(ov["phases"]) == 3
    assert ov["agro_indicators"]["status"] == "ok"
    assert "soja" in ov["suitable_crops"]


def test_priority_mapping():
    from app.ia import service

    assert service.priority_from_goals(["soil", "water"]) == "solo"
    assert service.priority_from_goals(["cost"]) == "renda"
    assert service.priority_from_goals([]) == "agua"
    assert service.motor_language("pt-BR") == "pt" and service.motor_language("es") == "en"


def test_study_without_key_fails_cleanly(client, motor, monkeypatch):
    monkeypatch.setattr(motor, "CLIENTES", {})
    register(client)
    farm = client.post("/api/v1/farms", json=farm_payload(geometry=TOCA), headers=ORIGIN).json()
    r = client.post("/api/v1/ai/studies", json={"farm_id": farm["id"]}, headers=ORIGIN)
    assert r.status_code == 202
    s = wait_study(client, r.json()["id"])
    assert s["status"] == "failed" and "ANTHROPIC_API_KEY" in s["error"]


def test_study_complete_with_mocked_llm(client, motor, monkeypatch):
    chamado = {}

    def fake_rodar(provedor, modelo, pedido, prio, descobertos, janelas, fatos, idioma, **kw):
        chamado.update(pedido=pedido, prio=prio, idioma=idioma)
        return SAMPLE, "tool", [], 1.0, 100, 50, 0.0, 0, []

    monkeypatch.setattr(motor, "CLIENTES", {"anthropic": object()})
    monkeypatch.setattr(motor, "rodar", fake_rodar)
    register(client)
    farm = client.post("/api/v1/farms", json=farm_payload(geometry=TOCA, goals=["water"]), headers=ORIGIN).json()
    r = client.post("/api/v1/ai/studies", json={"farm_id": farm["id"], "language": "pt-BR"}, headers=ORIGIN)
    s = wait_study(client, r.json()["id"])
    assert s["status"] == "complete", s
    res = s["result"]
    assert len(res["analysis"]["rotations"]) == 3
    assert res["analysis"]["recommendation"]["suggested_crop"]
    assert res["farm_data"]["point"] == "fazenda_da_toca_sudeste"
    assert res["priority"] == "water" and res["language"] == "pt"
    assert chamado["prio"] == "agua" and chamado["idioma"] == "pt"
    assert "<farm_phases>" in chamado["pedido"] and "<pre_ranked_crops>" in chamado["pedido"]
    assert "Soja" in chamado["pedido"] and "out" in chamado["pedido"]
    latest = client.get(f"/api/v1/farms/{farm['id']}/studies/latest").json()
    assert latest["id"] == s["id"]


def test_study_isolated_between_users(client, motor, monkeypatch):
    monkeypatch.setattr(motor, "CLIENTES", {})
    register(client)
    farm = client.post("/api/v1/farms", json=farm_payload(geometry=TOCA), headers=ORIGIN).json()
    sid = client.post("/api/v1/ai/studies", json={"farm_id": farm["id"]}, headers=ORIGIN).json()["id"]
    wait_study(client, sid)
    client.post("/api/v1/auth/logout", headers=ORIGIN)
    register(client)
    assert client.get(f"/api/v1/ai/studies/{sid}").status_code == 404
    assert client.post("/api/v1/ai/studies", json={"farm_id": farm["id"]}, headers=ORIGIN).status_code == 404


class FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kw):
        self.calls.append({**kw, "messages": [dict(m) for m in kw["messages"]]})
        if len(self.calls) == 1:
            tc = SimpleNamespace(id="t1", function=SimpleNamespace(
                name="analisar_fazenda", arguments=json.dumps({"lat": -22.2155, "lon": -47.7685, "mes_inicio": 10, "mes_fim": 2})))
            msg = SimpleNamespace(content="", tool_calls=[tc])
        else:
            msg = SimpleNamespace(content="Resposta de teste.", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg, finish_reason="stop")],
                               usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5))


def test_chat_uses_farm_data(client, motor, monkeypatch):
    fake = FakeCompletions()
    monkeypatch.setattr(motor, "CLIENTES", {"anthropic": SimpleNamespace(chat=SimpleNamespace(completions=fake))})
    register(client)
    farm = client.post("/api/v1/farms", json=farm_payload(geometry=TOCA), headers=ORIGIN).json()
    r = client.post("/api/v1/ai/chat", json={"farm_id": farm["id"], "message": "Quanto chove em janeiro?", "language": "pt-BR"}, headers=ORIGIN)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["answer"] == "Resposta de teste." and body["farm_data"] is True
    primeiro = fake.calls[0]["messages"][-1]["content"]
    assert "<farm_profile>" in primeiro and "Portuguese" in primeiro
    tool_msg = fake.calls[1]["messages"][-1]
    assert tool_msg["role"] == "tool" and '"status": "ok"' in tool_msg["content"]
    assert fake.calls[0]["max_tokens"] == 4000


def test_chat_without_key(client, motor, monkeypatch):
    monkeypatch.setattr(motor, "CLIENTES", {})
    register(client)
    r = client.post("/api/v1/ai/chat", json={"message": "Hello"}, headers=ORIGIN)
    assert r.status_code == 503
