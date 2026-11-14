import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    token_version = Column(Integer, nullable=False, default=0)
    privacy_notice_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    properties = relationship("Property", back_populates="owner", cascade="all, delete-orphan")


class Property(Base):
    __tablename__ = "properties"

    id = Column(String(36), primary_key=True, default=_uuid)
    property_id_slug = Column(String, unique=True, index=True, nullable=False)
    nome_propriedade = Column(String, nullable=False)
    municipio = Column(String, nullable=False, default="")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    tamanho_hectares = Column(Float, nullable=False)
    tipo_solo = Column(String, nullable=True)
    priorities = Column(JSON, default=list)

    locality = Column(String, nullable=False, default="")
    state = Column(String, nullable=False, default="")
    country = Column(String, nullable=False, default="")
    crop = Column(String, nullable=False, default="")
    previous_crop = Column(String, nullable=False, default="")
    planting_month = Column(Integer, nullable=True)
    soil = Column(JSON, nullable=False, default=dict)
    notes = Column(Text, nullable=False, default="")
    geometry = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, index=True)

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    owner = relationship("User", back_populates="properties")

    histories = relationship("CropHistory", back_populates="property", cascade="all, delete-orphan")


class CropHistory(Base):
    __tablename__ = "crop_histories"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    ano_safra = Column(String, nullable=False)
    cultura_verao = Column(String, nullable=False)
    cultura_safrinha = Column(String, nullable=True)
    produtividade_estimada_sc_ha = Column(Float, nullable=True)

    property = relationship("Property", back_populates="histories")


class ResetToken(Base):
    __tablename__ = "reset_tokens"

    token_hash = Column(String(64), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)


class RateLimit(Base):
    __tablename__ = "rate_limits"

    key = Column(String(64), primary_key=True)
    count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    key = Column(String(300), primary_key=True)
    result = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now)
