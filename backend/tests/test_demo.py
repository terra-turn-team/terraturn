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
