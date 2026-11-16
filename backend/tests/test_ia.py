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
    assert s["status"] == "failed" and s["error"] == "AI is temporarily unavailable. Please try again later."


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
    assert chamado["prio"] == ["agua"] and chamado["idioma"] == "pt"
    assert "<alternatives_rule>" in chamado["pedido"]
    assert "<agronomy_rules>" in chamado["pedido"] and "<land_use_check>" in chamado["pedido"]
    assert res["land_use_warning"]["cover_pct"] > 90
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


def test_farm_keeps_planning_fields(client):
    register(client)
    planning = {"start_month": "2026-11", "horizon_months": 24, "crop_status": "established", "crop_start_month": "2026-10", "crop_end_month": "2027-02"}
    farm = client.post("/api/v1/farms", json=farm_payload(geometry=TOCA, goals=["erosion", "water"], indicators=["rainfall", "ndvi"], planning=planning), headers=ORIGIN)
    assert farm.status_code == 201, farm.text
    body = farm.json()
    assert body["planning"]["horizon_months"] == 24 and body["indicators"] == ["rainfall", "ndvi"] and body["goals"] == ["erosion", "water"]


def test_agronomy_context_uses_nasa_cache(client):
    register(client)
    farm = client.post("/api/v1/farms", json=farm_payload(geometry=TOCA, indicators=["rainfall", "temperature", "water_balance", "soil_moisture", "ndvi", "cover"]), headers=ORIGIN).json()
    ctx = client.get(f"/api/v1/farms/{farm['id']}/agronomy").json()
    assert ctx["status"] in ("partial", "ready")
    months = [m["month"] for m in ctx["history"]["monthly"]]
    assert months == sorted(months) and len(months) == len(set(months)) and len(months) > 30
    assert ctx["history"]["start_date"][:7] <= months[0] and months[-1] <= ctx["history"]["end_date"][:7]
    ids = {m["id"] for m in ctx["metrics"]}
    assert {"rainfall", "temperature", "ndvi"} <= ids
    assert ctx["plan"]["status"] == "not_connected"


def test_simulation_builds_plan_from_study(client, motor, monkeypatch):
    monkeypatch.setattr(motor, "CLIENTES", {"anthropic": object()})
    monkeypatch.setattr(motor, "rodar", lambda *a, **k: (SAMPLE, "tool", [], 1.0, 1, 1, 0.0, 0, []))
    register(client)
    planning = {"start_month": "2026-11", "horizon_months": 24, "crop_status": "unspecified", "crop_start_month": None, "crop_end_month": None}
    farm = client.post("/api/v1/farms", json=farm_payload(geometry=TOCA, planning=planning), headers=ORIGIN).json()
    r = client.post(f"/api/v1/farms/{farm['id']}/simulations", json={"scenario": {"rainfall_percent": 0, "temperature_delta_c": 0}}, headers=ORIGIN)
    assert r.status_code == 200 and r.json()["status"] in ("processing", "ready")
    fim = time.time() + 30
    while time.time() < fim:
        plan = client.get(f"/api/v1/farms/{farm['id']}/agronomy").json()["plan"]
        if plan["status"] == "ready":
            break
        time.sleep(0.2)
    assert plan["status"] == "ready" and plan["model_version"] and plan["generated_at"]
    cycles = plan["cycles"]
    assert cycles, plan
    last = None
    for c in cycles:
        assert "2026-11" <= c["start_month"] <= c["end_month"] <= "2028-10"
        assert last is None or c["start_month"] >= last
        last = c["end_month"]



def _auth_error():
    import httpx
    import openai

    resp = httpx.Response(401, request=httpx.Request("POST", "https://api.anthropic.com/v1/chat/completions"))
    return openai.AuthenticationError("Error code: 401 - invalid x-api-key", response=resp, body=None)


def test_study_invalid_key_shows_friendly_message(client, motor, monkeypatch):
    def boom(*a, **k):
        raise _auth_error()

    monkeypatch.setattr(motor, "CLIENTES", {"anthropic": object()})
    monkeypatch.setattr(motor, "rodar", boom)
    register(client)
    farm = client.post("/api/v1/farms", json=farm_payload(geometry=TOCA), headers=ORIGIN).json()
    s = wait_study(client, client.post("/api/v1/ai/studies", json={"farm_id": farm["id"]}, headers=ORIGIN).json()["id"])
    assert s["status"] == "failed"
    assert s["error"] == "AI is temporarily unavailable. Please try again later." and "401" not in s["error"]


def test_chat_invalid_key_shows_friendly_message(client, motor, monkeypatch):
    class Bad:
        def create(self, **kw):
            raise _auth_error()

    monkeypatch.setattr(motor, "CLIENTES", {"anthropic": SimpleNamespace(chat=SimpleNamespace(completions=Bad()))})
    register(client)
    r = client.post("/api/v1/ai/chat", json={"message": "Hello"}, headers=ORIGIN)
    assert r.status_code == 503 and "401" not in r.json()["detail"]


def test_ai_status_reports_key_state(client, motor, monkeypatch):
    from app.ia import service

    class Bad:
        def create(self, **kw):
            raise _auth_error()

    service._STATUS_CACHE.update(at=0.0, value=None)
    monkeypatch.setattr(motor, "CLIENTES", {})
    assert client.get("/api/v1/ai/status").json()["llm"] == "missing_api_key"
    monkeypatch.setattr(motor, "CLIENTES", {"anthropic": SimpleNamespace(chat=SimpleNamespace(completions=Bad()))})
    assert client.get("/api/v1/ai/status").json()["llm"] == "invalid_api_key"
    service._STATUS_CACHE.update(at=0.0, value=None)
    monkeypatch.setattr(motor, "CLIENTES", {"anthropic": SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))})
    assert client.get("/api/v1/ai/status").json()["llm"] == "ready"
    service._STATUS_CACHE.update(at=0.0, value=None)


def test_priorities_use_all_farm_goals():
    from app.ia import service

    assert service.priorities_from_goals(["soil", "yield", "erosion", "water"]) == ["solo", "renda", "erosao"]
    assert service.priorities_from_goals(["soil", "fertility"]) == ["solo"]
    assert service.priorities_from_goals([], first="risco") == ["risco"]
    assert service.priorities_from_goals(["soil", "yield"], first="renda") == ["renda", "solo"]
    assert service.priorities_from_goals(None) == ["agua"]
    assert service.priority_text("erosao", "pt").startswith("Prioridade:")


def test_regional_ranking_keeps_only_off_season_crops():
    from app.ia import service
    from app.ia.motor import motor

    motor()
    iowa = service.regional_ranking("boone_iowa_eua", ["solo", "risco"])
    assert iowa and "guandu" not in iowa and "feijao_caupi" not in iowa
    cerrado = service.regional_ranking("uberaba_fazenda_agronelli", ["solo", "risco"])
    assert cerrado[:2] == ["feijao_caupi", "guandu"]
    pedido = service.apply_regional_ranking("x\n<pre_ranked_crops>\n1. guandu\n</pre_ranked_crops>", "boone_iowa_eua", ["solo"])
    assert pedido.count("<pre_ranked_crops>") == 1 and "1. guandu" not in pedido


def test_clean_text_removes_engine_field_names():
    from app.ia.service import clean_text

    assert clean_text("Soja tolera pouco a seca (tolera_seca baixa).", "pt") == "Soja tolera pouco a seca."
    out = clean_text({"risks": ["tolera_seca is low", 3]}, "en")
    assert out == {"risks": ["drought tolerance is low", 3]}


def test_crop_traits_from_official_table():
    from app.ia.service import crop_traits

    t = crop_traits()
    assert t["soja"] == {"drought": "baixa", "cycle_days": 120, "market": "alto", "fixes_n": True, "cover": False}


def test_land_use_check_flags_only_always_green_fields():
    from app.ia import service
    from app.ia.motor import motor

    motor()
    itirapina = service.land_use_check("fazenda_da_toca_sudeste")
    assert itirapina and itirapina["cover_pct"] > 90 and itirapina["bare_months"] == 0
    assert service.land_use_check("uberaba_fazenda_agronelli") is None


def test_agronomy_rules_cover_audit_points():
    from app.ia import service

    for regra in ("~50 km grid", "rain onset", "February-April", "<land_use_check>", "Brachiaria"):
        assert regra in service.AGRONOMY_RULES
    assert service.AGRONOMY_RULES in service.CHAT_SYSTEM


def test_calendar_cycles_overlap_short_horizon():
    from types import SimpleNamespace

    from app.ia import agronomy
    from app.ia.motor import motor

    motor()
    rot = {"name": "Soja -> Sorgo", "is_current": False, "farmer_summary": "s", "why": "w", "uncertainty": "low",
           "temperature_fit": "ok", "calendar": [{"crop": "soja", "sow_month": 10, "harvest_month": 2},
                                                 {"crop": "sorgo", "sow_month": 2, "harvest_month": 6}]}
    result = {"analysis": {"rotations": [rot], "recommendation": {"rotation_name": "Soja -> Sorgo"}}}
    curto = SimpleNamespace(planning={"start_month": "2026-11", "horizon_months": 6})
    cycles, _ = agronomy._cycles(curto, result, "pt")
    # soja começou em outubro e o sorgo termina em junho: os dois aparecem, recortados em nov/2026-abr/2027
    assert [(c["start_month"], c["end_month"]) for c in cycles] == [("2026-11", "2027-02"), ("2027-02", "2027-04")]
    longo = SimpleNamespace(planning={"start_month": "2026-11", "horizon_months": 24})
    cycles, _ = agronomy._cycles(longo, result, "pt")
    datas = [(c["start_month"], c["end_month"]) for c in cycles]
    assert datas[0] == ("2026-11", "2027-02") and len(datas) == 5 and datas[-1] == ("2028-10", "2028-10")
    assert all(a[1] <= b[0] for a, b in zip(datas, datas[1:]))  # sem sobreposição
