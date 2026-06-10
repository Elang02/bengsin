import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # On Vercel, env vars are injected directly


class Settings:
    def __init__(self):
        self.database_url = os.getenv("DATABASE_URL", "sqlite:///./bengsin.db")
        self.secret_key = os.getenv("SECRET_KEY", "aman-banget")
        self.token_expire_minutes = int(os.getenv("TOKEN_EXPIRE_MINUTES", "120"))
        self.refresh_token_expire_days = 7


settings = Settings()
