"""Sinkronisasi harga BBM harian ke tabel fuel_prices.

Sumber data: feed publik nasgunawann/bensin-api (GitHub Pages), yang mengambil data
resmi MyPertamina lewat GitHub Actions tiap jam. Feed dipilih, bukan pertamina.com
langsung, karena situs resmi memakai Blazor yang tidak bisa dibaca tanpa browser,
sedangkan fungsi Vercel hanya punya 10 detik dan tanpa Chromium.

Tiga batasan skema menentukan bentuk modul ini:

1. Kolom cities.id hanya String(10), sedangkan slug provinsi bisa 26 karakter
   ("free-trade-zone-ftz-sabang"). Id kota diturunkan dari hash slug,
   "p" + 8 heksadesimal, sehingga deterministik dan tidak pernah terpotong.
2. Nama provinsi disimpan pada kolom nama, jadi UI tetap menampilkan teks asli.
3. Sinkronisasi memakai tiga query: satu baca kota, satu baca harga, satu commit.
   Versi pertama menembak satu SELECT per baris dan butuh 71 detik di Supabase
   sampai Vercel memutus fungsi dengan 502.

Jalankan manual:
    .venv/bin/python -c "from app.services.fuel_sync import run_sync; print(run_sync())"
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from decimal import Decimal

from ..database import SessionLocal
from ..models import City, FuelPrice

FUEL_PRICE_URL = os.getenv(
    "FUEL_PRICE_URL",
    "https://raw.githubusercontent.com/nasgunawann/bensin-api/main/v1/nasional.json",
)

# (fuel_type, oktan). Solar memakai angka setana pada kolom oktan agar skema tetap.
PRODUCT_MAP = {
    "PERTALITE": ("gasoline", 88),
    "PERTAMAX": ("gasoline", 92),
    "PERTAMAX TURBO": ("gasoline", 98),
    "PERTAMAX GREEN 95": ("gasoline", 95),
    "PERTAMAX PERTASHOP": ("gasoline", 92),
    "DEXLITE": ("diesel", 51),
    "PERTAMINA DEX": ("diesel", 53),
    "PERTAMINA BIOSOLAR NON SUBSIDI": ("diesel", 51),
    "PERTAMINA BIOSOLAR SUBSIDI": ("diesel", 51),
}


def _city_id(slug: str) -> str:
    """Id 9 karakter, plafon kolom 10 karakter."""
    return "p" + hashlib.md5(slug.encode()).hexdigest()[:8]


def _parse_price(raw) -> Decimal | None:
    """Feed memakai campuran format: 24200 (int), 'Rp 10.000' (string), None."""
    if raw in (None, ""):
        return None
    text = str(raw).replace("Rp", "").replace(" ", "").replace(".", "").strip()
    try:
        value = Decimal(text)
    except Exception:
        return None
    return value if value > 0 else None


def _fetch_payload(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "bengsin-fuel-sync/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def run_sync(url: str = FUEL_PRICE_URL) -> dict:
    payload = _fetch_payload(url)
    provinces = payload.get("provinces") or []

    wanted: list[tuple[str, str, list[dict]]] = []
    for prov in provinces:
        slug = (prov.get("province_slug") or "").strip()
        name = (prov.get("province") or "").strip()
        if slug and name:
            wanted.append((_city_id(slug), name, prov.get("products") or []))

    db = SessionLocal()
    try:
        ids = [cid for cid, _, _ in wanted]
        known_cities = {c.id: c for c in db.query(City).filter(City.id.in_(ids)).all()}
        known_prices = {
            (p.city_id, p.name): p
            for p in db.query(FuelPrice).filter(FuelPrice.city_id.in_(ids)).all()
        } if ids else {}

        cities_new = cities_renamed = rows_new = rows_changed = 0
        for cid, name, products in wanted:
            city = known_cities.get(cid)
            if city is None:
                db.add(City(id=cid, name=name))
                cities_new += 1
            elif city.name != name:
                city.name = name
                cities_renamed += 1

            for entry in products:
                product = (entry.get("product") or "").strip().upper()
                meta = PRODUCT_MAP.get(product)
                price = _parse_price(entry.get("price_rupiah"))
                if meta is None or price is None:
                    continue
                fuel_type, octane = meta
                row = known_prices.get((cid, product))
                if row is None:
                    db.add(FuelPrice(
                        city_id=cid, brand="Pertamina", name=product,
                        fuel_type=fuel_type, octane_rating=octane, price=price,
                    ))
                    rows_new += 1
                else:
                    if row.price != price:
                        row.price = price
                        rows_changed += 1
                    row.fuel_type = fuel_type
                    row.octane_rating = octane
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return {
        "provinces": len(wanted),
        "cities_new": cities_new,
        "cities_renamed": cities_renamed,
        "rows_new": rows_new,
        "rows_changed": rows_changed,
        "source": url,
    }
