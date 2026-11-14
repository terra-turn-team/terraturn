import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from argon2 import PasswordHasher, exceptions as argon_errors
from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.db_models import RateLimit, User

hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
COOKIE_NAME = "terraturn_session"
SESSION_HOURS = 8


def normalize_email(email: str) -> str:
    return email.lower().strip()


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(stored: str, attempt: str) -> bool:
    try:
        return hasher.verify(stored, attempt)
    except (argon_errors.VerifyMismatchError, argon_errors.VerificationError, argon_errors.InvalidHashError):
        return False


def create_token(user_id: str, token_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(hours=SESSION_HOURS),
        "type": "session",
        "ver": token_version,
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def current_user(
    session: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
    db: Session = Depends(get_db),
) -> User:
    if not session:
        raise HTTPException(status_code=401, detail="Sign in required")
    try:
        data = jwt.decode(session, settings.jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub", "iat"]})
        if data.get("type") != "session":
            raise ValueError("invalid token type")
        user = db.get(User, data["sub"])
        if user is None or data.get("ver") != user.token_version:
            raise ValueError("session revoked or user not found")
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Session invalid or expired")


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if forwarded:
        return forwarded
    return request.client.host if request.client else "unknown"


def rate_limit(db: Session, request: Request, action: str, identifier: str, limit: int = 8, minutes: int = 15) -> None:
    now = datetime.now(timezone.utc)
    window = int(now.timestamp()) // (minutes * 60)
    key = hashlib.sha256(f"{action}:{client_ip(request)}:{identifier}:{window}".encode()).hexdigest()
    row = db.get(RateLimit, key)
    if row is None:
        row = RateLimit(key=key, count=0, expires_at=now + timedelta(minutes=minutes * 2))
        db.add(row)
    row.count += 1
    db.commit()
    if row.count > limit:
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")


def purge_expired(db: Session) -> None:
    from app.db_models import ResetToken

    now = datetime.now(timezone.utc)
    db.query(RateLimit).filter(RateLimit.expires_at < now).delete(synchronize_session=False)
    db.query(ResetToken).filter(ResetToken.expires_at < now).delete(synchronize_session=False)
    db.commit()
