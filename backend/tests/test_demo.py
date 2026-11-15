import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_api import ORIGIN, farm_payload


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def demo_login(client):
    r = client.post("/api/v1/auth/demo", headers=ORIGIN)
    assert r.status_code == 200, r.text
    return r.json()


def test_demo_has_nine_cached_farms(client):
    from app.ia.motor import motor

    user = demo_login(client)
    assert user["email"] == "demo@terraturn.work"
    farms = client.get("/api/v1/farms").json()
    assert len(farms) == 9
    m = motor()
    for f in farms:
        lon, lat = f["centroid"]
        assert m.fazenda_mais_proxima(lat, lon) is not None, f["name"]


def test_demo_is_read_only(client):
    demo_login(client)
    farm = client.get("/api/v1/farms").json()[0]
    assert client.post("/api/v1/farms", json=farm_payload(), headers=ORIGIN).status_code == 403
    assert client.delete(f"/api/v1/farms/{farm['id']}", headers=ORIGIN).status_code == 403
    r = client.put(f"/api/v1/farms/{farm['id']}", json=farm_payload(), headers=ORIGIN)
    assert r.status_code == 403 and "demo" in r.json()["detail"].lower()
    assert client.get("/api/v1/auth/me").json()["can_edit_farms"] is False


def test_demo_farms_editable_when_enabled(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "demo_editable", True)
    assert demo_login(client)["can_edit_farms"] is True
    farm = client.get("/api/v1/farms").json()[0]
    payload = farm_payload() | {"name": farm["name"], "geometry": farm["geometry"], "previous_crop": "Milho"}
    r = client.put(f"/api/v1/farms/{farm['id']}", json=payload, headers=ORIGIN)
    assert r.status_code == 200, r.text
    assert client.get(f"/api/v1/farms/{farm['id']}").json()["previous_crop"] == "Milho"
    assert client.put(f"/api/v1/farms/{farm['id']}/history", json=[], headers=ORIGIN).status_code == 200
    assert client.post("/api/v1/farms", json=farm_payload(), headers=ORIGIN).status_code == 403
    assert client.delete(f"/api/v1/farms/{farm['id']}", headers=ORIGIN).status_code == 403


def test_demo_logout_keeps_other_sessions(client):
    demo_login(client)
    other = TestClient(app)
    other.post("/api/v1/auth/demo", headers=ORIGIN)
    client.post("/api/v1/auth/logout", headers=ORIGIN)
    assert other.get("/api/v1/auth/me").status_code == 200


def test_demo_visitor_can_run_new_analysis(client, monkeypatch):
    import time
    from app.ia.motor import motor
    from tests.test_ia import SAMPLE

    m = motor()
    calls = []
    monkeypatch.setattr(m, "CLIENTES", {"anthropic": object()})
    monkeypatch.setattr(m, "rodar", lambda *a, **k: calls.append(1) or (SAMPLE, "tool", [], 1.0, 1, 1, 0.0, 0, []))
    demo_login(client)
    farm = client.get("/api/v1/farms").json()[0]
    sid = client.post("/api/v1/ai/studies", json={"farm_id": farm["id"]}, headers=ORIGIN).json()["id"]
    end = time.time() + 30
    while client.get(f"/api/v1/ai/studies/{sid}").json()["status"] not in ("complete", "failed") and time.time() < end:
        time.sleep(0.2)
    again = client.post("/api/v1/ai/studies", json={"farm_id": farm["id"]}, headers=ORIGIN).json()
    assert again["id"] != sid and again["status"] in ("queued", "running", "complete")
    latest = client.get(f"/api/v1/farms/{farm['id']}/studies/latest").json()
    assert latest["id"] == again["id"]


def test_concurrent_demo_logins_do_not_fail():
    from concurrent.futures import ThreadPoolExecutor

    with TestClient(app) as c:
        with ThreadPoolExecutor(6) as ex:
            codes = list(ex.map(lambda _: c.post("/api/v1/auth/demo", headers=ORIGIN).status_code, range(12)))
    assert all(code == 200 for code in codes), codes


def test_demo_study_follows_viewer_language(client, monkeypatch):
    import time
    from app.ia.motor import motor
    from tests.test_ia import SAMPLE

    m = motor()
    langs = []
    monkeypatch.setattr(m, "CLIENTES", {"anthropic": object()})
    monkeypatch.setattr(m, "rodar", lambda *a, **k: langs.append(1) or (SAMPLE, "tool", [], 1.0, 1, 1, 0.0, 0, []))
    demo_login(client)
    farm = client.get("/api/v1/farms").json()[1]
    ids = {}
    for lang in ("en", "pt-BR"):
        ids[lang] = client.post("/api/v1/ai/studies", json={"farm_id": farm["id"], "language": lang}, headers=ORIGIN).json()["id"]
        end = time.time() + 30
        while client.get(f"/api/v1/ai/studies/{ids[lang]}").json()["status"] not in ("complete", "failed") and time.time() < end:
            time.sleep(0.2)
    assert client.get(f"/api/v1/farms/{farm['id']}/studies/latest?language=en").json()["id"] == ids["en"]
    assert client.get(f"/api/v1/farms/{farm['id']}/studies/latest?language=pt-BR").json()["id"] == ids["pt-BR"]
    assert client.get(f"/api/v1/farms/{farm['id']}/studies/latest?language=es").json()["id"] == ids["en"]
    plan_pt = client.get(f"/api/v1/farms/{farm['id']}/agronomy?language=pt-BR").json()["plan"]
    plan_en = client.get(f"/api/v1/farms/{farm['id']}/agronomy?language=en").json()["plan"]
    assert any(w.startswith("Recomendado:") for w in plan_pt["warnings"])
    assert any(w.startswith("Recommended:") for w in plan_en["warnings"])


def test_demo_autogenerate_queues_both_languages(monkeypatch):
    from app import demo
    from app.database import SessionLocal
    from app.db_models import AiStudy, Property, User
    from app.ia import service
    from app.ia.motor import motor

    demo.seed()
    monkeypatch.setattr(motor(), "CLIENTES", {"anthropic": object()})
    queued = []
    monkeypatch.setattr(service, "run_study", lambda sid: queued.append(sid))
    monkeypatch.setattr(demo.time, "sleep", lambda s: None)
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == demo.DEMO_EMAIL).first()
        db.query(AiStudy).filter(AiStudy.user_id == user.id).delete()
        db.commit()
        farms = db.query(Property).filter(Property.user_id == user.id).count()
    demo.generate_missing_studies()
    with SessionLocal() as db:
        rows = db.query(AiStudy).filter(AiStudy.id.in_(queued)).all()
        assert len(rows) == farms * 2
        assert {r.language for r in rows} == {"en", "pt"}
        db.query(AiStudy).filter(AiStudy.id.in_(queued)).delete()
        db.commit()


def test_farm_report_pdf(client):
    demo_login(client)
    farm = client.get("/api/v1/farms").json()[0]
    for lang in ("pt-BR", "en", "es"):
        r = client.get(f"/api/v1/farms/{farm['id']}/report.pdf?language={lang}")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF") and len(r.content) > 3000
        assert 'filename="terraturn-' in r.headers["content-disposition"]
    assert client.get("/api/v1/farms/nao-existe/report.pdf").status_code == 404


def test_demo_login_reuses_session_and_has_high_limit(client):
    from app import main

    first = demo_login(client)
    for _ in range(80):  # mais que o limite antigo de 60, mesma sessão: não conta
        assert client.post("/api/v1/auth/demo", headers=ORIGIN).json()["id"] == first["id"]
    assert main.DEMO_LOGINS_PER_15_MIN >= 1000
    others = [TestClient(main.app) for _ in range(70)]  # visitantes novos atrás do mesmo IP
    assert all(c.post("/api/v1/auth/demo", headers=ORIGIN).status_code == 200 for c in others)
