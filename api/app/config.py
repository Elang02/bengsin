import os
from dataclasses import dataclass
from dotenv import load_dotenv

# Muat variabel dari file .env (DATABASE_URL Supabase, SECRET_KEY, dll)
load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./bengsin.db")
    secret_key: str = os.getenv("SECRET_KEY", "aman-banget")
    token_expire_minutes: int = int(os.getenv("TOKEN_EXPIRE_MINUTES", "120"))
    refresh_token_expire_days: int = 7


settings = Settings()
