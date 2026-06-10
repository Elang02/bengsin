# app/main.py
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from .routers import auth, garage, expenses, brands, vehicles
app.include_router(auth.router)
app.include_router(garage.router)
app.include_router(expenses.router)
app.include_router(brands.router)
app.include_router(vehicles.router)

# Mount frontend static files
frontend_dir = Path(__file__).parent.parent.parent / "bengsin-frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")
    logger.info(f"Serving frontend from: {frontend_dir}")


# Serve frontend at root
@app.get("/", response_class=FileResponse)
async def root():
    frontend_index = Path(__file__).parent.parent.parent / "bengsin-frontend" / "index.html"
    if frontend_index.exists():
        return str(frontend_index)
    return {"error": "Frontend not found", "checked": str(frontend_index)}


# Health check
@app.get("/health")
def health():
    return {"status": "ok", "message": "Bengsin API running"}
