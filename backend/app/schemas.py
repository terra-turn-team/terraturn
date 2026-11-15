from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    acknowledge_privacy: bool


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=128)


class UserOut(BaseModel):
    id: str
    name: str
    email: str


class GeoGeometry(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[list[float]]]


class SoilDetails(BaseModel):
    texture: Literal["unknown", "sandy", "loamy", "clayey", "silty"] = "unknown"
    ph: Optional[float] = Field(default=None, ge=3.0, le=10.0)
    organic_matter_percent: Optional[float] = Field(default=None, ge=0, le=100)
    irrigation: Literal["rainfed", "irrigated", "mixed", "unknown"] = "unknown"


class FarmIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    locality: str = Field(default="", max_length=160)
    municipality: str = Field(default="", max_length=160)
    state: str = Field(default="", max_length=120)
    country: str = Field(default="Brasil", max_length=120)
    crop: str = Field(default="não informado", max_length=100)
    previous_crop: str = Field(default="", max_length=100)
    planting_month: Optional[int] = Field(default=None, ge=1, le=12)
    soil: SoilDetails = Field(default_factory=SoilDetails)
    goals: list[Literal["water", "soil", "resilience", "yield", "cost"]] = Field(default_factory=list, max_length=5)
    notes: str = Field(default="", max_length=2000)
    geometry: GeoGeometry


class FarmOut(FarmIn):
    id: str
    area_ha: float
    centroid: list[float]
    created_at: str
    updated_at: str


class CropHistoryIn(BaseModel):
    ano_safra: str = Field(pattern=r"^\d{4}/\d{2,4}$")
    cultura_verao: str = Field(min_length=2, max_length=100)
    cultura_safrinha: Optional[str] = Field(default=None, max_length=100)
    produtividade_estimada_sc_ha: Optional[float] = Field(default=None, ge=0, le=1000)


class CropHistoryOut(CropHistoryIn):
    id: int


class PublicStatus(BaseModel):
    status: str
    database: str
    ai_integration: str
    nasa_integration: str


class StudyIn(BaseModel):
    farm_id: str = Field(min_length=1, max_length=64)
    language: str = Field(default="en", max_length=8)
    priority: Optional[Literal["water", "soil", "resilience", "yield", "cost"]] = None


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1500)
    farm_id: Optional[str] = Field(default=None, max_length=64)
    language: str = Field(default="en", max_length=8)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
