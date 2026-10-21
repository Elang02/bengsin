"""Endpoint cron untuk menarik harga BBM harian.

Vercel Cron memanggil path ini sekali sehari (lihat vercel.json). Kalau environment
CRON_SECRET diisi, Vercel mengirim header "Authorization: Bearer <CRON_SECRET>", dan
endpoint menolak panggilan tanpa header itu. Tanpa CRON_SECRET (misalnya saat
mengembangkan di lokal), endpoint terbuka supaya bisa diuji dengan curl.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException

from ..services.fuel_sync import run_sync

router = APIRouter(prefix="/cron", tags=["cron"])


@router.get("/fuel-sync")
@router.post("/fuel-sync")
def fuel_sync(authorization: str | None = Header(default=None)) -> dict:
    secret = os.getenv("CRON_SECRET")
    if secret and authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="cron secret salah atau tidak ada")
    try:
        return {"ok": True, **run_sync()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"sinkronisasi gagal: {type(exc).__name__}")
