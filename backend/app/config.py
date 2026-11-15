from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./terraturn.db"
    jwt_secret: str = ""
    frontend_origin: str = "http://localhost:5173"
    cookie_secure: bool = False
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "TerraTurn <no-reply@localhost>"
    password_reset_enabled: bool = True
    resend_api_key: str = ""  # com a chave, o e-mail sai pela API do Resend; sem ela, por SMTP
    reverse_geocoding_enabled: bool = True
    ai_studies_per_day: int = 15
    ai_chat_per_day: int = 40
    demo_autogenerate: bool = True
    demo_editable: bool = False
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_origin.split(",") if o.strip()]

    @property
    def primary_origin(self) -> str:
        return self.allowed_origins[0]


settings = Settings()
