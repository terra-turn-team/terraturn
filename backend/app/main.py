import asyncio
import hashlib
import json
import logging
import re
import secrets
import time
import unicodedata
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db, init_db
from app.db_models import AiStudy, CropHistory, GeocodeCache, Property, ResetToken, User
from app.emailer import send_password_reset
from app.geo import analyze_polygon
from app.schemas import (ChatIn, StudyIn, CropHistoryIn, CropHistoryOut, FarmIn, ForgotIn, LoginIn, PublicStatus,
                         RegisterIn, ResetIn, UserOut)
from app.security import (COOKIE_NAME, SESSION_HOURS, create_token, current_user, hash_password,
                          normalize_email, purge_expired, rate_limit, verify_password)

logger = logging.getLogger("terraturn")
if len(settings.jwt_secret) < 32 or "REPLACE" in settings.jwt_secret.upper():
    raise RuntimeError("Set JWT_SECRET to at least 32 random characters.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        purge_expired(db)
    from app.ia import service

    service.mark_interrupted()
    service.EXECUTOR.submit(service.motor)
    yield


app = FastAPI(title="TerraTurn API", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Accept"],
)


@app.middleware("http")
async def verify_origin(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") not in settings.allowed_origins:
            return Response(status_code=403, content="Origin not allowed")
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


BASE = "/api/v1"


def iso(value: datetime | None) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def session_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        COOKIE_NAME,
        create_token(user.id, user.token_version),
        max_age=SESSION_HOURS * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", secure=settings.cookie_secure, httponly=True, samesite="lax")


def output_user(user: User) -> dict:
    return {"id": user.id, "name": user.nome, "email": user.email}


def slugify(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")[:60] or "farm"
    return f"{slug}-{secrets.token_hex(3)}"


def farm_output(prop: Property) -> dict:
    return {
        "id": prop.id,
        "name": prop.nome_propriedade,
        "locality": prop.locality,
        "municipality": prop.municipio,
        "state": prop.state,
        "country": prop.country,
        "crop": prop.crop,
        "previous_crop": prop.previous_crop,
        "planting_month": prop.planting_month,
        "soil": prop.soil or {},
        "goals": prop.priorities or [],
        "notes": prop.notes,
        "geometry": prop.geometry,
        "area_ha": prop.tamanho_hectares,
        "centroid": [prop.longitude, prop.latitude],
        "created_at": iso(prop.created_at),
        "updated_at": iso(prop.updated_at),
    }


def apply_farm(prop: Property, payload: FarmIn) -> None:
    data = payload.model_dump()
    area, center = analyze_polygon(data["geometry"])
    prop.nome_propriedade = data["name"]
    prop.locality = data["locality"]
    prop.municipio = data["municipality"]
    prop.state = data["state"]
    prop.country = data["country"]
    prop.crop = data["crop"]
    prop.previous_crop = data["previous_crop"]
    prop.planting_month = data["planting_month"]
    prop.soil = data["soil"]
    prop.tipo_solo = data["soil"]["texture"]
    prop.priorities = data["goals"]
    prop.notes = data["notes"]
    prop.geometry = data["geometry"]
    prop.tamanho_hectares = area
    prop.longitude, prop.latitude = center
    prop.updated_at = now_utc()


def owned_farm(db: Session, farm_id: str, user: User) -> Property:
    prop = db.query(Property).filter(Property.id == farm_id, Property.user_id == user.id).first()
    if prop is None:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@app.get(BASE + "/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get(BASE + "/status", response_model=PublicStatus)
def status():
    engine_name = "postgresql" if settings.database_url.startswith("postgres") else "sqlite"
    return PublicStatus(status="online", database=engine_name, ai_integration="not_connected", nasa_integration="not_connected")


@app.post(BASE + "/auth/register", response_model=UserOut, status_code=201)
def register(payload: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    rate_limit(db, request, "register", email, limit=6)
    if not payload.acknowledge_privacy:
        raise HTTPException(status_code=422, detail="Please confirm you have read the privacy notice.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    now = now_utc()
    user = User(nome=payload.name.strip(), email=email, hashed_password=hash_password(payload.password),
                token_version=0, privacy_notice_at=now, created_at=now)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    db.refresh(user)
    session_cookie(response, user)
    return output_user(user)


@app.post(BASE + "/auth/login", response_model=UserOut)
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    rate_limit(db, request, "login", email, limit=10)
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(user.hashed_password, payload.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    session_cookie(response, user)
    return output_user(user)


@app.get(BASE + "/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return output_user(user)


@app.post(BASE + "/auth/logout", status_code=204)
def logout(response: Response, request: Request, db: Session = Depends(get_db)):
    try:
        user = current_user(request.cookies.get(COOKIE_NAME), db)
        user.token_version += 1
        db.commit()
    except HTTPException:
        pass
    response.status_code = 204
    clear_cookie(response)
    return response


@app.post(BASE + "/auth/forgot-password")
def forgot(payload: ForgotIn, request: Request, db: Session = Depends(get_db)):
    if not settings.password_reset_enabled:
        raise HTTPException(status_code=503, detail="Password reset is not available right now.")
    email = normalize_email(payload.email)
    rate_limit(db, request, "forgot", email, limit=4, minutes=30)
    user = db.query(User).filter(User.email == email).first()
    if user is not None:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        db.query(ResetToken).filter(ResetToken.user_id == user.id).delete()
        db.add(ResetToken(token_hash=token_hash, user_id=user.id, expires_at=now_utc() + timedelta(minutes=15)))
        db.commit()
        try:
            send_password_reset(email, token)
        except Exception:
            logger.exception("Failed to send password reset email")
            db.query(ResetToken).filter(ResetToken.token_hash == token_hash).delete()
            db.commit()
    return {"message": "If this email is registered, you will receive instructions."}


@app.post(BASE + "/auth/reset-password")
def reset_password(payload: ResetIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(db, request, "reset", "all", limit=12, minutes=15)
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    token = db.get(ResetToken, token_hash)
    expires = token.expires_at if token else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if token is None or expires <= now_utc():
        if token is not None:
            db.delete(token)
            db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    user = db.get(User, token.user_id)
    db.delete(token)
    if user is not None:
        user.hashed_password = hash_password(payload.password)
        user.token_version += 1
    db.commit()
    return {"message": "Password changed. Please sign in again."}


@app.get(BASE + "/farms")
def list_farms(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Property).filter(Property.user_id == user.id).order_by(Property.updated_at.desc()).limit(500).all()
    return [farm_output(p) for p in rows]


@app.post(BASE + "/farms", status_code=201)
def create_farm(payload: FarmIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    prop = Property(user_id=user.id, property_id_slug=slugify(payload.name), created_at=now_utc())
    apply_farm(prop, payload)
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return farm_output(prop)


@app.get(BASE + "/farms/{farm_id}")
def get_farm(farm_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return farm_output(owned_farm(db, farm_id, user))


@app.put(BASE + "/farms/{farm_id}")
def update_farm(farm_id: str, payload: FarmIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    prop = owned_farm(db, farm_id, user)
    apply_farm(prop, payload)
    db.commit()
    db.refresh(prop)
    return farm_output(prop)


@app.delete(BASE + "/farms/{farm_id}", status_code=204)
def delete_farm(farm_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned_farm(db, farm_id, user))
    db.commit()
    return Response(status_code=204)


@app.get(BASE + "/farms/{farm_id}/history", response_model=list[CropHistoryOut])
def get_history(farm_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    prop = owned_farm(db, farm_id, user)
    return sorted(prop.histories, key=lambda h: h.ano_safra)


@app.put(BASE + "/farms/{farm_id}/history", response_model=list[CropHistoryOut])
def replace_history(farm_id: str, payload: list[CropHistoryIn], user: User = Depends(current_user), db: Session = Depends(get_db)):
    if len(payload) > 30:
        raise HTTPException(status_code=422, detail="At most 30 seasons are allowed.")
    prop = owned_farm(db, farm_id, user)
    prop.histories.clear()
    for item in payload:
        prop.histories.append(CropHistory(**item.model_dump()))
    prop.updated_at = now_utc()
    db.commit()
    db.refresh(prop)
    return sorted(prop.histories, key=lambda h: h.ano_safra)


_GEO_LOCK = asyncio.Lock()
_GEO_LAST_CALL = 0.0
_WORLD = "https://countriesnow.space/api/v0.1/countries"
_COUNTRIES = json.loads((Path(__file__).parent / "countries.json").read_text(encoding="utf-8"))
_COUNTRY_CODES = {c["code"] for c in _COUNTRIES}
_BR = json.loads((Path(__file__).parent / "br_locations.json").read_text(encoding="utf-8"))
USER_AGENT = "TerraTurn/0.3 (NASA Space Apps 2026 project; https://terraturn.work)"


async def _cached_lookup(db: Session, key: str, loader):
    row = db.get(GeocodeCache, key)
    if row is not None:
        return row.result
    result = await loader()
    row = db.get(GeocodeCache, key)
    if row is None:
        db.add(GeocodeCache(key=key, result=result, updated_at=now_utc()))
    else:
        row.result = result
        row.updated_at = now_utc()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return result


async def _get_json(url: str, *, params=None, payload=None):
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as http:
        try:
            resp = await (http.post(url, json=payload) if payload is not None else http.get(url, params=params))
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Location service failed: %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail="Location service unavailable. Please try again.")


@app.get(BASE + "/locations/countries")
def countries(user: User = Depends(current_user)):
    return _COUNTRIES


async def _states(db: Session, country: str):
    country = country.upper()
    if country not in _COUNTRY_CODES:
        raise HTTPException(status_code=422, detail="Invalid country")

    async def fetch():
        en_name = next(c.get("en_name", c["name"]) for c in _COUNTRIES if c["code"] == country)
        result = await _get_json(_WORLD + "/states", payload={"country": en_name})
        if result.get("error"):
            return []
        return [{"code": x.get("state_code") or x["name"], "name": x["name"]} for x in result.get("data", {}).get("states", [])]

    if country == "BR":
        return _BR["states"]
    return await _cached_lookup(db, "states:" + country, fetch)


@app.get(BASE + "/locations/states")
async def states(country: str = "BR", user: User = Depends(current_user), db: Session = Depends(get_db)):
    return await _states(db, country)


@app.get(BASE + "/locations/cities")
async def cities(country: str = "BR", state: str = "MG", user: User = Depends(current_user), db: Session = Depends(get_db)):
    country = country.upper()
    if not state or len(state) > 150:
        raise HTTPException(status_code=422, detail="Invalid state")
    if country not in _COUNTRY_CODES:
        raise HTTPException(status_code=422, detail="Invalid country")

    async def fetch():
        c = next(v for v in _COUNTRIES if v["code"] == country)
        states_list = await _states(db, country)
        state_name = next((v["name"] for v in states_list if v["code"] == state or v["name"] == state), state)
        result = await _get_json(_WORLD + "/state/cities", payload={"country": c.get("en_name", c["name"]), "state": state_name})
        if result.get("error"):
            return []
        return [{"code": v, "name": v} for v in sorted(set(result.get("data", [])))]

    if country == "BR":
        cities_br = _BR["cities"].get(state.upper())
        if cities_br is None:
            raise HTTPException(status_code=422, detail="Invalid Brazilian state code")
        return cities_br
    return await _cached_lookup(db, "cities:" + country + ":" + state.lower(), fetch)


async def _nominatim(path: str, params: dict):
    global _GEO_LAST_CALL
    if not settings.reverse_geocoding_enabled:
        raise HTTPException(status_code=503, detail="Geocoding is disabled")
    async with _GEO_LOCK:
        delay = max(0.0, 1.05 - (time.monotonic() - _GEO_LAST_CALL))
        if delay:
            await asyncio.sleep(delay)
        _GEO_LAST_CALL = time.monotonic()
        async with httpx.AsyncClient(timeout=12) as http:
            try:
                response = await http.get(
                    "https://nominatim.openstreetmap.org/" + path,
                    params=params,
                    headers={"User-Agent": USER_AGENT, "Referer": settings.primary_origin, "Accept-Language": "en"},
                )
                response.raise_for_status()
                return response.json()
            except (httpx.HTTPError, ValueError):
                raise HTTPException(status_code=502, detail="Geocoding unavailable. Please try again.")


@app.get(BASE + "/geocode/reverse")
async def reverse_geocode(lon: float, lat: float, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise HTTPException(status_code=422, detail="Invalid coordinates")

    async def fetch():
        r = await _nominatim("reverse", {"lat": lat, "lon": lon, "format": "jsonv2", "addressdetails": 1, "zoom": 12})
        a = r.get("address", {})
        return {
            "municipality": a.get("city") or a.get("town") or a.get("municipality") or a.get("village") or a.get("county") or "",
            "state": a.get("state") or "",
            "country": a.get("country") or "",
            "country_code": a.get("country_code", "").upper(),
            "locality": a.get("suburb") or a.get("village") or a.get("hamlet") or "",
            "source": "OpenStreetMap Nominatim",
        }

    return await _cached_lookup(db, f"reverse:{lat:.4f}:{lon:.4f}", fetch)


@app.get(BASE + "/geocode/search")
async def forward_geocode(city: str, state: str, country: str = "BR", user: User = Depends(current_user), db: Session = Depends(get_db)):
    if len(city) < 2 or len(city) > 120 or len(state) > 120 or len(country) > 2:
        raise HTTPException(status_code=422, detail="Invalid location")
    cc = country.upper()
    if cc not in _COUNTRY_CODES:
        raise HTTPException(status_code=422, detail="Unknown country")
    cname = next(c["name"] for c in _COUNTRIES if c["code"] == cc)

    async def fetch():
        rows = await _nominatim("search", {"q": f"{city}, {state}, {cname}", "format": "jsonv2", "limit": 1, "addressdetails": 1})
        if not rows:
            raise HTTPException(status_code=404, detail="City not found on the map")
        row = rows[0]
        return {"lon": float(row["lon"]), "lat": float(row["lat"]), "label": row.get("display_name", city), "source": "OpenStreetMap Nominatim"}

    return await _cached_lookup(db, "search:" + cc + ":" + state.casefold() + ":" + city.casefold(), fetch)


@app.get(BASE + "/privacy/export")
def export_my_data(user: User = Depends(current_user), db: Session = Depends(get_db)):
    farms = db.query(Property).filter(Property.user_id == user.id).all()
    return {
        "user": output_user(user),
        "farms": [farm_output(p) | {"history": [CropHistoryOut.model_validate(h, from_attributes=True).model_dump() for h in p.histories]} for p in farms],
        "exported_at": iso(now_utc()),
    }


@app.delete(BASE + "/privacy/account", status_code=204)
def delete_account(payload: LoginIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if normalize_email(payload.email) != user.email or not verify_password(user.hashed_password, payload.password):
        raise HTTPException(status_code=403, detail="Please confirm your credentials")
    db.query(ResetToken).filter(ResetToken.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    response = Response(status_code=204)
    clear_cookie(response)
    return response


def study_output(s: AiStudy) -> dict:
    return {
        "id": s.id,
        "farm_id": s.property_id,
        "status": s.status,
        "stage": s.stage,
        "language": s.language,
        "error": s.error,
        "result": s.result if s.status == "complete" else None,
        "seconds": s.seconds,
        "created_at": iso(s.created_at),
        "updated_at": iso(s.updated_at),
    }


@app.get(BASE + "/ai/status")
def ai_status():
    from app.ia.motor import llm_disponivel

    return {"llm": "ready" if llm_disponivel() else "missing_api_key", "engine": "llm_v17", "crop_table": "v2"}


@app.post(BASE + "/ai/studies", status_code=202)
def create_study(payload: StudyIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.ia import service

    prop = owned_farm(db, payload.farm_id, user)
    running = db.query(AiStudy).filter(AiStudy.property_id == prop.id, AiStudy.status.in_(["queued", "running"])).first()
    if running is not None:
        return study_output(running)
    rate_limit(db, request, "study", user.id, limit=settings.ai_studies_per_day, minutes=1440)
    goals = [payload.priority] if payload.priority else (prop.priorities or [])
    study = AiStudy(user_id=user.id, property_id=prop.id, status="queued", stage="queued",
                    language=service.motor_language(payload.language), priority=service.priority_from_goals(goals),
                    created_at=now_utc(), updated_at=now_utc())
    db.add(study)
    db.commit()
    db.refresh(study)
    service.submit_study(study.id)
    return study_output(study)


@app.get(BASE + "/ai/studies/{study_id}")
def get_study(study_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.query(AiStudy).filter(AiStudy.id == study_id, AiStudy.user_id == user.id).first()
    if s is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return study_output(s)


@app.get(BASE + "/farms/{farm_id}/studies/latest")
def latest_study(farm_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    prop = owned_farm(db, farm_id, user)
    s = db.query(AiStudy).filter(AiStudy.property_id == prop.id).order_by(AiStudy.created_at.desc()).first()
    if s is None:
        raise HTTPException(status_code=404, detail="No analysis yet")
    return study_output(s)


@app.post(BASE + "/ai/chat")
def ai_chat(payload: ChatIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.ia import service

    prop = owned_farm(db, payload.farm_id, user) if payload.farm_id else None
    rate_limit(db, request, "chat", user.id, limit=settings.ai_chat_per_day, minutes=1440)
    try:
        return service.chat(prop, payload.message, payload.language, [h.model_dump() for h in payload.history])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        logger.exception("Chat failed")
        raise HTTPException(status_code=502, detail="The assistant could not answer right now. Please try again.")
