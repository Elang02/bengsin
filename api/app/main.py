# app/main.py
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    try:
        from .database import engine, Base
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified")
    except Exception as e:
        logger.warning(f"Database setup skipped: {e}")
    yield


app = FastAPI(title="Bengsin API - Monolithic", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    # Auth rides on the Authorization header, not cookies, so credentials are off:
    # a wildcard origin plus credentials is rejected by browsers anyway.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from .routers import auth, garage, expenses, brands, vehicles, cron
app.include_router(auth.router)
app.include_router(garage.router)
app.include_router(expenses.router)
app.include_router(brands.router)
app.include_router(vehicles.router)
app.include_router(cron.router)

# Health check
@app.get("/health")
def health():
    return {"status": "ok", "message": "Bengsin API running"}


# Frontend: the whole app lives in /public and is served from the same origin,
# so /app.js, /styles.css and /fonts/* resolve without a build step.
# Two layouts: api/public/ when the bundle carries the assets itself, and the
# repo-root public/ for local runs.
_HERE = Path(__file__).resolve()
FRONTEND_DIR = next(
    (p for p in (_HERE.parent.parent / "public", _HERE.parent.parent.parent / "public") if p.is_dir()),
    None,
)

if FRONTEND_DIR:
    logger.info("Serving frontend from: %s", FRONTEND_DIR)
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:

    @app.get("/")
    async def root():
        return {"error": "Frontend not found", "checked": str(_HERE.parent.parent / "public")}
