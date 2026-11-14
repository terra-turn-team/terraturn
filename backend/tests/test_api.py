import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

ORIGIN = {"Origin": "http://localhost:5173"}
POLYGON = {"type": "Polygon", "coordinates": [[[-47.935, -19.755], [-47.93, -19.755], [-47.93, -19.75], [-47.935, -19.75], [-47.935, -19.755]]]}


def farm_payload(**extra):
    return {
        "name": "Fazenda Teste",
        "municipality": "Uberaba",
        "state": "MG",
        "country": "Brasil",
        "crop": "Soja",
        "previous_crop": "Milho",
        "planting_month": 10,
        "soil": {"texture": "clayey", "ph": 5.8, "organic_matter_percent": 3.1, "irrigation": "rainfed"},
        "goals": ["water", "soil"],
        "geometry": POLYGON,
        **extra,
    }


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def register(client, email=None, password="a-strong-password"):
    email = email or f"{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/v1/auth/register", json={"name": "Seu João", "email": email, "password": password, "acknowledge_privacy": True}, headers=ORIGIN)
    assert r.status_code == 201, r.text
    return email, password


def test_register_login_me_logout(client):
    email, password = register(client)
    assert client.get("/api/v1/auth/me").json()["email"] == email
    assert client.post("/api/v1/auth/logout", headers=ORIGIN).status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"}, headers=ORIGIN).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": email.upper(), "password": password}, headers=ORIGIN).status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 200


def test_password_is_hashed(client):
    from app.database import SessionLocal
    from app.db_models import User

    email, password = register(client)
    with SessionLocal() as db:
        stored = db.query(User).filter(User.email == email).one().hashed_password
    assert stored != password and stored.startswith("$argon2id$")


def test_duplicate_email(client):
    email, _ = register(client)
    r = client.post("/api/v1/auth/register", json={"name": "Outro", "email": email, "password": "another-password", "acknowledge_privacy": True}, headers=ORIGIN)
    assert r.status_code == 409


def test_farm_crud_and_isolation(client):
    register(client)
    r = client.post("/api/v1/farms", json=farm_payload(), headers=ORIGIN)
    assert r.status_code == 201, r.text
    farm = r.json()
    assert 20 < farm["area_ha"] < 40
    assert farm["goals"] == ["water", "soil"] and farm["soil"]["texture"] == "clayey"
    assert client.get("/api/v1/farms").json()[0]["id"] == farm["id"]

    r = client.put(f"/api/v1/farms/{farm['id']}", json=farm_payload(name="Renomeada", crop="Milho"), headers=ORIGIN)
    assert r.json()["name"] == "Renomeada" and r.json()["crop"] == "Milho"

    r = client.put(f"/api/v1/farms/{farm['id']}/history", json=[{"ano_safra": "2024/25", "cultura_verao": "soja", "cultura_safrinha": "milho"}], headers=ORIGIN)
    assert r.status_code == 200 and r.json()[0]["cultura_safrinha"] == "milho"

    client.post("/api/v1/auth/logout", headers=ORIGIN)
    register(client)
    assert client.get("/api/v1/farms").json() == []
    assert client.get(f"/api/v1/farms/{farm['id']}").status_code == 404
    assert client.delete(f"/api/v1/farms/{farm['id']}", headers=ORIGIN).status_code == 404


def test_invalid_polygon_rejected(client):
    register(client)
    bad = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]]}
    assert client.post("/api/v1/farms", json=farm_payload(geometry=bad), headers=ORIGIN).status_code == 422


def test_foreign_origin_blocked(client):
    r = client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "x"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_export_and_delete_account(client):
    email, password = register(client)
    client.post("/api/v1/farms", json=farm_payload(), headers=ORIGIN)
    exported = client.get("/api/v1/privacy/export").json()
    assert exported["user"]["email"] == email and len(exported["farms"]) == 1
    r = client.request("DELETE", "/api/v1/privacy/account", json={"email": email, "password": "wrong-password"}, headers=ORIGIN)
    assert r.status_code == 403
    r = client.request("DELETE", "/api/v1/privacy/account", json={"email": email, "password": password}, headers=ORIGIN)
    assert r.status_code == 204
    assert client.post("/api/v1/auth/login", json={"email": email, "password": password}, headers=ORIGIN).status_code == 401


def test_settings_accept_origin_list():
    from app.config import Settings

    s = Settings(frontend_origin="https://terraturn.work, https://www.terraturn.work/", jwt_secret="x" * 40)
    assert s.allowed_origins == ["https://terraturn.work", "https://www.terraturn.work"]
    assert s.primary_origin == "https://terraturn.work"


def test_brazil_locations_are_local(client):
    register(client)
    states = client.get("/api/v1/locations/states?country=BR").json()
    assert len(states) == 27 and {"code": "MG", "name": "Minas Gerais"} in states
    cities = client.get("/api/v1/locations/cities?country=BR&state=mg").json()
    assert {"code": "3170107", "name": "Uberaba"} in cities and len(cities) == 853
    assert client.get("/api/v1/locations/cities?country=BR&state=XX").status_code == 422
