from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database — Railway injects DATABASE_URL automatically
    database_url: str = "postgresql://user:pass@localhost/ikanfm_saas"

    # JWT
    secret_key: str = "CHANGE-THIS-IN-PRODUCTION"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480  # 8 hours

    # Super-admin (platform owner — you)
    superadmin_email: str = "admin@ikanfm.co.uk"
    superadmin_password: str = "SuperAdmin2026!"

    # Stripe (leave blank until ready to charge)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # App
    app_name: str = "ShiftPortal"
    app_url: str = "https://portal.ikanfm.co.uk"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
