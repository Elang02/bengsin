#!/usr/bin/env python3
"""
Bengsin - Pertamina Fuel Price Scraper (Live API)
Fetches prices directly from Pertamina Patra Niaga API
and inserts into Bengsin SQLite database.
"""
import requests
import json
import sys
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import create_engine, text, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import Session, DeclarativeBase, Mapped, mapped_column

# ─── Database setup (direct SQLite, bypass .env) ───
DB_URL = "sqlite:////home/ubuntu/bengsin-backend/bengsin.db"

class Base(DeclarativeBase):
    pass

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class City(Base):
    __tablename__ = "cities"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    country: Mapped[str] = mapped_column(String(50), default="Indonesia")

class FuelPrice(Base):
    __tablename__ = "fuel_prices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city_id: Mapped[str] = mapped_column(String(20), ForeignKey("cities.id", ondelete="CASCADE"), nullable=False)
    brand: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    fuel_type: Mapped[str] = mapped_column(String(15), nullable=False)
    octane_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

# ─── Pertamina API config ───
API_URL = "https://pertaminapatraniaga.com/api/api/v1/post/get-by-slug/page/harga-terbaru-bbm"

HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,ru;q=0.8,id;q=0.7',
    'priority': 'u=1, i',
    'referer': 'https://pertaminapatraniaga.com/page/harga-terbaru-bbm',
    'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
}

PARAMS = {'language': 'id'}

# ─── Product mapping: image URL fragment → (brand, name, fuel_type, octane) ───
PRODUCT_MAP = {
    "pertamax-turbo":       ("Pertamina", "Pertamax Turbo",        "gasoline", 98),
    "pertamax-green-95":    ("Pertamina", "Pertamax Green 95",     "gasoline", 95),
    "pertamax.png":         ("Pertamina", "Pertamax",              "gasoline", 92),
    "pertamax-pertashop":   ("Pertamina", "Pertamax (Pertashop)",  "gasoline", 92),
    "pertalite":            ("Pertamina", "Pertalite",             "gasoline", 90),
    "pertamina-dex":        ("Pertamina", "Pertamina DEX",         "diesel",   53),
    "dexlite":              ("Pertamina", "Dexlite",               "diesel",   51),
    "bio-solar-non":        ("Pertamina", "Bio Solar Non-Subsidi", "diesel",   48),
    "bio-solar-subsidi":    ("Pertamina", "Bio Solar Subsidi",     "diesel",   48),
}

# ─── Province → Cities mapping ───
PROVINCE_CITIES = {
    "Prov. Aceh":                    ["Banda Aceh", "Lhokseumawe", "Langsa"],
    "Free Trade Zone (FTZ) Sabang":  ["Sabang"],
    "Prov. Sumatera Utara":          ["Medan", "Binjai", "Pematang Siantar"],
    "Prov. Sumatera Barat":          ["Padang", "Bukittinggi", "Payakumbuh"],
    "Prov. Riau":                    ["Pekanbaru", "Dumai"],
    "Prov. Jambi":                   ["Jambi"],
    "Prov. Sumatera Selatan":        ["Palembang", "Prabumulih"],
    "Prov. Lampung":                 ["Bandar Lampung", "Metro"],
    "Prov. Kep. Bangka Belitung":    ["Pangkal Pinang"],
    "Prov. Kepulauan Riau":          ["Batam", "Tanjung Pinang"],
    "Prov. Bengkulu":                ["Bengkulu"],
    "Prov. DKI Jakarta":             ["Jakarta Pusat", "Jakarta Selatan", "Jakarta Barat", "Jakarta Timur", "Jakarta Utara"],
    "Prov. Jawa Barat":              ["Bandung", "Bekasi", "Depok", "Bogor", "Cimahi", "Karawang"],
    "Prov. Jawa Tengah":             ["Semarang", "Solo", "Magelang", "Pekalongan"],
    "Prov. DI Yogyakarta":           ["Yogyakarta", "Sleman", "Bantul"],
    "Prov. Jawa Timur":              ["Surabaya", "Malang", "Sidoarjo", "Kediri", "Madiun"],
    "Prov. Banten":                  ["Serang", "Cilegon", "Tangerang", "Tangerang Selatan"],
    "Prov. Bali":                    ["Denpasar", "Singaraja"],
    "Prov. NTB":                     ["Mataram", "Lombok"],
    "Prov. NTT":                     ["Kupang"],
    "Prov. Kalimantan Barat":        ["Pontianak", "Singkawang"],
    "Prov. Kalimantan Tengah":       ["Palangkaraya"],
    "Prov. Kalimantan Selatan":      ["Banjarmasin", "Banjarbaru"],
    "Prov. Kalimantan Timur":        ["Samarinda", "Balikpapan"],
    "Prov. Kalimantan Utara":        ["Tanjung Selor", "Tarakan"],
    "Prov. Sulawesi Utara":          ["Manado", "Bitung", "Tomohon"],
    "Prov. Sulawesi Tengah":         ["Palu"],
    "Prov. Sulawesi Selatan":        ["Makassar", "Palopo"],
    "Prov. Sulawesi Tenggara":       ["Kendari", "Bau-Bau"],
    "Prov. Gorontalo":               ["Gorontalo"],
    "Prov. Sulawesi Barat":          ["Mamuju"],
    "Prov. Maluku":                  ["Ambon", "Tual"],
    "Prov. Maluku Utara":            ["Ternate", "Tidore"],
    "Prov. Papua":                   ["Jayapura"],
    "Prov. Papua Barat":             ["Manokwari", "Sorong"],
    "Prov. Papua Selatan":           ["Merauke"],
    "Prov. Papua Tengah":            ["Nabire"],
    "Prov. Papua Pegunungan":        ["Wamena"],
    "Prov. Papua Barat Daya":        ["Sorong"],
}


def parse_price(raw: str) -> Decimal | None:
    """Convert '21,200' → Decimal('21200.00'), ' -  ' → None"""
    cleaned = raw.strip().replace(",", "").replace(".", "")
    if not cleaned or cleaned == "-":
        return None
    try:
        return Decimal(cleaned)
    except Exception:
        return None


def detect_product(url: str) -> tuple | None:
    """Match image URL to product info via PRODUCT_MAP."""
    for fragment, info in PRODUCT_MAP.items():
        if fragment in url:
            return info
    return None


def fetch_api_data() -> list[dict]:
    """Fetch live data from Pertamina API and return flat list of price records."""
    print(f"Fetching from: {API_URL}")
    resp = requests.get(API_URL, params=PARAMS, headers=HEADERS, timeout=30)
    resp.raise_for_status()

    data = resp.json()
    if not data.get("succeeded"):
        raise ValueError(f"API error: {data.get('message')}")

    content = data["data"]["content"]

    # Find Product Table node
    pt_node = None
    for key, val in content.items():
        if isinstance(val, dict) and val.get("displayName") == "Product Table":
            pt_node = val
            break

    if not pt_node:
        raise ValueError("Product Table node not found in API response")

    results = []
    for group in pt_node["props"]["items"]:
        for entry in group["data"]:
            region = entry.get("REGION", "").strip()
            if not region:
                continue
            for col_key, price_raw in entry.items():
                if col_key == "REGION":
                    continue
                product = detect_product(col_key)
                if not product:
                    continue
                price = parse_price(str(price_raw))
                if price is None:
                    continue  # skip unavailable
                brand, name, fuel_type, octane = product
                results.append({
                    "region": region,
                    "brand": brand,
                    "name": name,
                    "fuel_type": fuel_type,
                    "octane": octane,
                    "price": price,
                })
    return results


def seed_database(records: list[dict]):
    """Insert cities + fuel prices into SQLite database."""
    engine = create_engine(DB_URL, echo=False)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        # Clear only Pertamina data (preserve Shell, BP, etc.)
        session.execute(text("DELETE FROM fuel_prices WHERE brand = 'Pertamina'"))
        session.commit()
        print("  Cleared old Pertamina data\n")

        cities_added = 0
        prices_added = 0

        for rec in records:
            region = rec["region"]
            city_names = PROVINCE_CITIES.get(region)
            if not city_names:
                # Try partial match
                for prov_key, prov_cities in PROVINCE_CITIES.items():
                    if prov_key.lower() in region.lower() or region.lower() in prov_key.lower():
                        city_names = prov_cities
                        break
            if not city_names:
                continue  # skip unknown provinces

            for city_name in city_names:
                city_id = city_name.lower().replace(" ", "_").replace(".", "")

                # Upsert city
                city = session.get(City, city_id)
                if not city:
                    city = City(id=city_id, name=city_name, country="Indonesia")
                    session.add(city)
                    cities_added += 1

                # Insert fuel price
                fp = FuelPrice(
                    city_id=city_id,
                    brand=rec["brand"],
                    name=rec["name"],
                    fuel_type=rec["fuel_type"],
                    octane_rating=rec["octane"],
                    price=rec["price"],
                    updated_at=datetime.now(timezone.utc),
                )
                session.add(fp)
                prices_added += 1

        session.commit()
        print(f"✅ Inserted {cities_added} cities")
        print(f"✅ Inserted {prices_added} fuel prices")

        # Verify
        result = session.execute(text("SELECT COUNT(*) FROM cities"))
        print(f"\n📊 Total cities: {result.scalar()}")
        result2 = session.execute(text("SELECT COUNT(*) FROM fuel_prices"))
        print(f"📊 Total fuel prices: {result2.scalar()}")

        # Show samples
        for city_id, city_name in [("jakarta_selatan", "Jakarta"), ("tangerang_selatan", "TangSel")]:
            print(f"\n=== {city_name} ===")
            rows = session.execute(text(
                "SELECT fp.name, fp.fuel_type, fp.octane_rating, fp.price "
                "FROM fuel_prices fp WHERE fp.city_id = :cid ORDER BY fp.octane_rating DESC"
            ), {"cid": city_id}).fetchall()
            for r in rows:
                print(f"  {r[0]:25s} | {r[1]:8s} | Oct:{r[2]} | Rp {r[3]:,.0f}")


def main():
    print("=" * 50)
    print("Bengsin - Pertamina Price Scraper")
    print("=" * 50)

    print("\n[1/2] Fetching live data from Pertamina API...")
    records = fetch_api_data()
    print(f"  Parsed {len(records)} price records")

    print("\n[2/2] Inserting into database...")
    seed_database(records)

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
