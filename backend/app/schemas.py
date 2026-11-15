from datetime import datetime
from typing import Literal, Optional
from zoneinfo import ZoneInfo

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


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


Goal = Literal["water", "soil", "resilience", "yield", "cost", "fertility", "erosion", "phytosanitary", "diversity", "margin"]
Indicator = Literal["rainfall", "temperature", "water_balance", "soil_moisture", "ph", "organic_matter", "cover", "ndvi",
                    "erosion_risk", "pest_risk", "yield", "cost", "margin"]
MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"
DEFAULT_INDICATORS = ["rainfall", "temperature", "soil_moisture", "ph", "organic_matter", "cover"]


def current_month() -> str:
    return datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m")


class PlanningDetails(BaseModel):
    start_month: str = Field(default_factory=current_month, pattern=MONTH)
    horizon_months: int = Field(default=12, ge=1, le=24)
    crop_status: Literal["established", "planned", "unspecified"] = "unspecified"
    crop_start_month: Optional[str] = Field(default=None, pattern=MONTH)
    crop_end_month: Optional[str] = Field(default=None, pattern=MONTH)

    @model_validator(mode="after")
    def ordered(self):
        if self.crop_start_month and self.crop_end_month and self.crop_end_month < self.crop_start_month:
            raise ValueError("The area must be released after the crop starts.")
        return self


class FarmIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    locality: str = Field(default="", max_length=160)
    municipality: str = Field(default="", max_length=160)
    state: str = Field(default="", max_length=120)
    country: str = Field(default="Brasil", max_length=120)
    crop: str = Field(default="", max_length=100)
    previous_crop: str = Field(default="", max_length=100)
    planting_month: Optional[int] = Field(default=None, ge=1, le=12)
    soil: SoilDetails = Field(default_factory=SoilDetails)
    goals: list[Goal] = Field(default_factory=list, max_length=10)
    indicators: list[Indicator] = Field(default_factory=lambda: list(DEFAULT_INDICATORS), max_length=13)
    planning: PlanningDetails = Field(default_factory=PlanningDetails)
    notes: str = Field(default="", max_length=2000)
    geometry: GeoGeometry

    @field_validator("goals", "indicators")
    @classmethod
    def unique(cls, values):
        return list(dict.fromkeys(values))

    @field_validator("crop")
    @classmethod
    def legacy_crop(cls, value):
        return "" if value.strip().lower() in {"não informado", "não informada"} else value.strip()


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


class Scenario(BaseModel):
    rainfall_percent: float = Field(default=0, ge=-40, le=40)
    temperature_delta_c: float = Field(default=0, ge=-3, le=3)


class SimulationIn(BaseModel):
    scenario: Scenario = Field(default_factory=Scenario)
    language: str = Field(default="en", max_length=8)
