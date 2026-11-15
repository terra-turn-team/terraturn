import logging
import secrets
import time
from datetime import datetime, timezone

from app.database import SessionLocal
from app.db_models import AiStudy, Property, User
from app.security import hash_password

logger = logging.getLogger("terraturn.demo")
DEMO_EMAIL = "demo@terraturn.work"
DEMO_NAME = "TerraTurn Demo"
HALF = 0.004

FARMS = [
    {"slug": "demo-north-para", "name": "North · Pará", "state": "Pará", "country": "Brasil", "point": (-3.5579336371350903, -48.64693953925579),
     "crop": "Soja", "previous_crop": "Milho", "planting_month": 11, "goals": ["water"]},
    {"slug": "demo-northeast-bahia", "name": "Northeast · Western Bahia", "state": "Bahia", "country": "Brasil", "point": (-12.4410, -45.7890),
     "crop": "Soja", "previous_crop": "Milho", "planting_month": 10, "goals": ["yield"]},
    {"slug": "demo-southeast-sao-paulo", "name": "Southeast · São Paulo", "state": "São Paulo", "country": "Brasil", "point": (-22.2155, -47.7685),
     "crop": "Soja", "previous_crop": "Braquiária", "planting_month": 10, "goals": ["soil"]},
    {"slug": "demo-center-west-mato-grosso", "name": "Center-West · Mato Grosso", "state": "Mato Grosso", "country": "Brasil",
     "point": (-13.476743708024967, -58.89937692739597), "crop": "Soja", "previous_crop": "Milho", "planting_month": 10, "goals": ["resilience"]},
    {"slug": "demo-south-rio-grande-do-sul", "name": "South · Rio Grande do Sul", "state": "Rio Grande do Sul", "country": "Brasil",
     "point": (-30.918010035468342, -54.79330880597324), "crop": "Soja", "previous_crop": "", "planting_month": 11, "goals": ["yield"]},
    {"slug": "demo-uberaba-a", "name": "Uberaba A · Minas Gerais", "municipality": "Uberaba", "state": "Minas Gerais", "country": "Brasil",
     "point": (-19.56025585465233, -47.97707805316747), "crop": "Soja", "previous_crop": "Milho", "planting_month": 10, "goals": ["water"]},
    {"slug": "demo-uberaba-b", "name": "Uberaba B · Minas Gerais", "municipality": "Uberaba", "state": "Minas Gerais", "country": "Brasil",
     "point": (-19.72264807226605, -48.033074121347155), "crop": "Soja", "previous_crop": "Milho", "planting_month": 10, "goals": ["soil"]},
    {"slug": "demo-pergamino-argentina", "name": "Pergamino · Argentina", "municipality": "Pergamino", "state": "Buenos Aires", "country": "Argentina",
     "point": (-33.9500, -60.6500), "crop": "Soja", "previous_crop": "Trigo", "planting_month": 11, "goals": ["yield"]},
    {"slug": "demo-iowa-usa", "name": "Iowa · United States", "municipality": "Boone County", "state": "Iowa", "country": "United States",
     "point": (42.1000, -93.8000), "crop": "Milho", "previous_crop": "Soja", "planting_month": 5, "goals": ["resilience"]},
]


def is_demo(user) -> bool:
    return bool(user) and user.email == DEMO_EMAIL


def _square(lat: float, lon: float) -> dict:
    ring = [[lon - HALF, lat - HALF], [lon + HALF, lat - HALF], [lon + HALF, lat + HALF], [lon - HALF, lat + HALF], [lon - HALF, lat - HALF]]
    return {"type": "Polygon", "coordinates": [ring]}


def seed() -> None:
    from app.geo import analyze_polygon
    from app.schemas import PlanningDetails

    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if user is None:
            user = User(nome=DEMO_NAME, email=DEMO_EMAIL, hashed_password=hash_password(secrets.token_urlsafe(32)),
                        token_version=0, created_at=now)
            db.add(user)
            db.commit()
            db.refresh(user)
        existing = {p.property_id_slug for p in db.query(Property).filter(Property.user_id == user.id).all()}
        for i, f in enumerate(FARMS):
            if f["slug"] in existing:
                continue
            lat, lon = f["point"]
            geometry = _square(lat, lon)
            area, (clon, clat) = analyze_polygon(geometry)
            db.add(Property(
                user_id=user.id, property_id_slug=f["slug"], nome_propriedade=f["name"], municipio=f.get("municipality", ""),
                locality="", state=f["state"], country=f["country"], crop=f["crop"], previous_crop=f["previous_crop"],
                planting_month=f["planting_month"], soil={"texture": "unknown", "ph": None, "organic_matter_percent": None, "irrigation": "rainfed"},
                tipo_solo="unknown", priorities=f["goals"],
                indicators=["rainfall", "temperature", "water_balance", "soil_moisture", "ndvi", "cover"],
                planning={**PlanningDetails().model_dump(), "horizon_months": 24},
                notes="Demo farm: fictional producer, real NASA data for this location.",
                geometry=geometry, tamanho_hectares=area, latitude=clat, longitude=clon,
                created_at=now, updated_at=datetime.fromtimestamp(now.timestamp() - i, timezone.utc)))
        db.commit()


def generate_missing_studies() -> None:
    from app.ia import service

    if "anthropic" not in service.motor().CLIENTES:
        logger.info("Demo studies skipped: no AI key")
        return
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if user is None:
            return
        pending = []
        for prop in db.query(Property).filter(Property.user_id == user.id).all():
            done = db.query(AiStudy).filter(AiStudy.property_id == prop.id, AiStudy.status == "complete").first()
            busy = db.query(AiStudy).filter(AiStudy.property_id == prop.id, AiStudy.status.in_(["queued", "running"])).first()
            if done is None and busy is None:
                study = AiStudy(user_id=user.id, property_id=prop.id, status="queued", stage="queued", language="en",
                                priority=service.priority_from_goals(prop.priorities or []))
                db.add(study)
                db.commit()
                pending.append(study.id)
    for sid in pending:
        service.run_study(sid)
        time.sleep(1)
