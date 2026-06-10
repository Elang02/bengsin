from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

# For PostgreSQL: use small pool for serverless (Vercel)
# For SQLite: no pool needed
if settings.database_url.startswith("sqlite"):
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
        future=True,
    )
else:
    # PostgreSQL on Vercel serverless - use minimal pool
    engine = create_engine(
        settings.database_url,
        pool_size=1,          # Keep 1 connection in pool
        max_overflow=0,       # No overflow connections
        pool_recycle=300,     # Recycle connections every 5 min
        pool_pre_ping=True,   # Verify connection before use
        future=True,
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
