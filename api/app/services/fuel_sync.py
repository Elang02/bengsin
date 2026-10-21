"""Sinkronisasi harga BBM harian ke tabel fuel_prices.

Sumber data: feed publik nasgunawann/bensin-api (GitHub Pages), yang mengambil data
resmi MyPertamina lewat GitHub Actions tiap jam. Feed dipilih, bukan pertamina.com
langsung, karena situs resmi memakai Blazor yang tidak bisa dibaca tanpa browser,
sedangkan fungsi Vercel hanya punya 10 detik dan tanpa Chromium.

Payload v1/nasional.json per provinsi: {province, province_slug, products: [{product,
price_rupiah, updatedDate}], synced_at, pertamina_updated_at}.

Pemetaan provinsi sebagai kota, bukan 31 kota seed lama. Id kota memakai slug
sehingga sinkronisasi idempoten tanpa bergantung pada isi seed dan bisa berjalan di
deployment mana pun.

Jalankan manual:
    .venv/bin/python -c "from app.services.fuel_sync import run_sync; print(run_sync())"
"""

from __future__ import annotations

import os
import urllib.request
from decimal import Decimal

from ..database import SessionLocal
from ..models import City, FuelPrice

FUEL_PRICE_URL = os.getenv(
    "FUEL_PRICE_URL",
    "https://raw.githubusercontent.com/nasgunawann/bensin-api/main/v1/nasional.json",
)

# (produk, fuel_type, oktan). Oktan untuk solar memakai angka setana pada kolom
# yang sama agar tabel tidak perlu kolom baru.
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
    req = urllib.request.Request(
        url, headers={"User-Agent": "bengsin-fuel-sync/1.0"}
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        import json

        return json.loads(resp.read().decode())


def run_sync(url: str = FUEL_PRICE_URL) -> dict:
    payload = _fetch_payload(url)
    provinces = payload.get("provinces") or []
    db = SessionLocal()
    cities_written = prices_written = prices_changed = 0
    try:
        for prov in provinces:
            slug = (prov.get("province_slug") or "").strip()
            name = (prov.get("province") or "").strip()
            if not slug or not name:
                continue

            city = db.query(City).filter(City.id == slug).first()
            if city is None:
                db.add(City(id=slug, name=name))
                cities_written += 1
            elif city.name != name:
                city.name = name

            for entry in prov.get("products") or []:
                product = (entry.get("product") or "").strip().upper()
                meta = PRODUCT_MAP.get(product)
                price = _parse_price(entry.get("price_rupiah"))
                if meta is None or price is None:
                    continue
                fuel_type, octane = meta

                row = (
                    db.query(FuelPrice)
                    .filter(FuelPrice.city_id == slug, FuelPrice.name == product)
                    .first()
                )
                if row is None:
                    db.add(FuelPrice(
                        city_id=slug, brand="Pertamina", name=product,
                        fuel_type=fuel_type, octane_rating=octane, price=price,
                    ))
                    prices_written += 1
                else:
                    if row.price != price:
                        row.price = price
                        prices_changed += 1
                    row.fuel_type = fuel_type
                    row.octane_rating = octane
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return {
        "provinces": len(provinces),
        "cities_upserted": cities_written,
        "price_rows": prices_written,
        "price_changed": prices_changed,
        "source": url,
    }
