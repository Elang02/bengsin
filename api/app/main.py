# app/main.py
import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import engine, Base
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, garage, expenses, brands, vehicles

logger = logging.getLogger("uvicorn.error")

# Buat tabel jika belum ada (skema Supabase sudah ada, ini idempotent)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Bengsin API - Monolithic")

# Konfigurasi CORS (optional untuk same-origin tapi ga masalah)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DAFTARKAN ROUTER MODULAR
app.include_router(auth.router)
app.include_router(garage.router)
app.include_router(expenses.router)
app.include_router(brands.router)
app.include_router(vehicles.router)

# Mount frontend static files
frontend_dir = Path(__file__).parent.parent.parent / "bengsin-frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")
    logger.info(f"✅ Serving frontend from: {frontend_dir}")
else:
    logger.warning(f"⚠️ Frontend directory not found: {frontend_dir}")


# Serve frontend at root
@app.get("/", response_class=FileResponse)
async def root():
    frontend_index = Path(__file__).parent.parent.parent / "bengsin-frontend" / "index.html"
    if frontend_index.exists():
        return str(frontend_index)
    return {"error": "Frontend not found"}


# Health check
@app.get("/health")
def health():
    return {"status": "ok", "message": "Bengsin API running"}
