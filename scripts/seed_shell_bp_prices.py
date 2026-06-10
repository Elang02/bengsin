#!/usr/bin/env python3
"""
Bengsin - Shell & BP Fuel Price Scraper
Fetches prices from Shell (.model.json) and BP (HTML table)
and inserts into Bengsin database.
"""
import requests
import re
import json
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from seed_pertamina_prices import Base, City, FuelPrice, DB_URL

# ─── Shell config ───
SHELL_API_URL = "https://www.shell.co.id/in_id/pengendara-bermotor/bahan-bakar-shell/harga-bahan-bakar-shell.model.json"
SHELL_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "accept": "application/json",
}

# ─── BP config ───
BP_URL = "https://www.bp.com/id_id/indonesia/home/produk-dan-layanan/spbu/harga.html"
BP_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "accept": "text/html",
}

# ─── Region → city_ids mapping ───
# Shell regions
SHELL_REGION_CITIES = {
    "Jakarta": ["jakarta_pusat", "jakarta_selatan", "jakarta_barat", "jakarta_timur", "jakarta_utara"],
    "Banten": ["serang", "cilegon", "tangerang", "tangerang_selatan"],
    "Jawa Barat": ["bandung", "bekasi", "depok", "bogor", "cimahi", "karawang"],
    "Jawa Timur": ["surabaya", "malang", "sidoarjo", "kediri", "madiun"],
}

# BP regions
BP_REGION_CITIES = {
    "JABODETABEK": ["jakarta_pusat", "jakarta_selatan", "jakarta_barat", "jakarta_timur", "jakarta_utara",
                     "bogor", "depok", "tangerang", "tangerang_selatan", "bekasi"],
    "JAWA TIMUR": ["surabaya", "malang", "sidoarjo", "kediri", "madiun"],
}


def parse_price_idr(raw: str) -> Decimal:
    """Convert 'IDR 17,240' or 'Rp24.490' to Decimal."""
    cleaned = re.sub(r"[^\d]", "", raw)
    return Decimal(cleaned)


def find_text_model(node, target_organism="PromoSimple.Text"):
    """Recursively find the PromoSimple.Text model in AEM JSON."""
    if isinstance(node, dict):
        if node.get("organism") == target_organism:
            return node.get("model", {})
        for v in node.values():
            result = find_text_model(v, target_organism)
            if result:
                return result
    elif isinstance(node, list):
        for v in node:
            result = find_text_model(v, target_organism)
            if result:
                return result
    return None


def fetch_shell_prices() -> list[dict]:
    """Fetch Shell fuel prices from .model.json endpoint."""
    print("[Shell] Fetching from .model.json endpoint...")
    resp = requests.get(SHELL_API_URL, headers=SHELL_HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    model = find_text_model(data)
    if not model:
        print("[Shell] No PromoSimple.Text found")
        return []

    html = model.get("text", "")
    date_match = re.search(r"<strong>(.*?)</strong>", html)
    effective_date = date_match.group(1) if date_match else "Unknown"
    print(f"[Shell] Effective date: {effective_date}")

    # Parse table rows
    results = []
    rows = re.findall(r"<tr>(.*?)</tr>", html, re.DOTALL)
    for row in rows:
        cells = re.findall(r"<td>(.*?)</td>", row, re.DOTALL)
        if len(cells) < 3:
            continue
        fuel_name = cells[0].strip()
        regions_str = cells[1].strip()
        price_raw = cells[2].strip()
        price_raw = re.sub(r"<[^>]+>", "", price_raw)  # strip HTML tags

        price = parse_price_idr(price_raw)
        regions = [r.strip() for r in regions_str.split(",")]

        # Determine fuel type and octane
        fuel_type = "diesel" if "diesel" in fuel_name.lower() else "gasoline"
        # Shell V-Power Diesel: cetane ~51
        octane = 51 if fuel_type == "diesel" else 95  # V-Power is RON 95

        for region in regions:
            city_ids = SHELL_REGION_CITIES.get(region, [])
            for city_id in city_ids:
                results.append({
                    "city_id": city_id,
                    "brand": "Shell",
                    "name": fuel_name,
                    "fuel_type": fuel_type,
                    "octane_rating": octane,
                    "price": price,
                })

    print(f"[Shell] Parsed {len(results)} price records")
    return results


def fetch_bp_prices() -> list[dict]:
    """Fetch BP fuel prices from HTML page."""
    print("[BP] Fetching from HTML page...")
    resp = requests.get(BP_URL, headers=BP_HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text

    # Extract effective date
    date_match = re.search(r"efektif\s+(\d+\s+\w+\s+\d+)", html)
    effective_date = date_match.group(1) if date_match else "Unknown"
    print(f"[BP] Effective date: {effective_date}")

    # Find table
    table_match = re.search(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)
    if not table_match:
        print("[BP] No table found")
        return []

    table_html = table_match.group(1)
    rows = re.findall(r"<tr>(.*?)</tr>", table_html, re.DOTALL)

    # First row is header: Jenis Produk, JABODETABEK, JAWA TIMUR
    if len(rows) < 2:
        print("[BP] Not enough rows in table")
        return []

    header_cells = re.findall(r"<td[^>]*>(.*?)</td>", rows[0], re.DOTALL)
    header_cells = [re.sub(r"<[^>]+>", "", c).strip() for c in header_cells]
    print(f"[BP] Header: {header_cells}")

    # Data rows
    results = []
    for row_html in rows[1:]:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.DOTALL)
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        if len(cells) < 2:
            continue

        fuel_name = cells[0]
        fuel_type = "diesel" if "diesel" in fuel_name.lower() else "gasoline"

        # BP Ultimate: RON 95, BP 92: RON 92, BP Ultimate Diesel: cetane 51
        if "ultimate" in fuel_name.lower() and fuel_type == "gasoline":
            octane = 95
        elif "92" in fuel_name:
            octane = 92
        else:  # diesel
            octane = 51

        # Prices per region (skip header column)
        for i, region_name in enumerate(header_cells[1:], start=1):
            if i >= len(cells):
                break
            price = parse_price_idr(cells[i])
            city_ids = BP_REGION_CITIES.get(region_name.upper(), [])
            for city_id in city_ids:
                results.append({
                    "city_id": city_id,
                    "brand": "BP",
                    "name": fuel_name,
                    "fuel_type": fuel_type,
                    "octane_rating": octane,
                    "price": price,
                })

    print(f"[BP] Parsed {len(results)} price records")
    return results


def seed_prices(records: list[dict]):
    """Insert Shell and BP prices into database (merge with existing Pertamina data)."""
    engine = create_engine(DB_URL, echo=False)

    with Session(engine) as session:
        # Delete only Shell and BP brands (preserve Pertamina)
        session.execute(text("DELETE FROM fuel_prices WHERE brand IN ('Shell', 'BP')"))
        session.commit()
        print("  Cleared old Shell/BP data")

        prices_added = 0
        for rec in records:
            # Ensure city exists
            city = session.get(City, rec["city_id"])
            if not city:
                # Create city with proper name
                city_name = rec["city_id"].replace("_", " ").title()
                city = City(id=rec["city_id"], name=city_name, country="Indonesia")
                session.add(city)
                print(f"  Created city: {city_name}")

            fp = FuelPrice(
                city_id=rec["city_id"],
                brand=rec["brand"],
                name=rec["name"],
                fuel_type=rec["fuel_type"],
                octane_rating=rec["octane_rating"],
                price=rec["price"],
                updated_at=datetime.now(timezone.utc),
            )
            session.add(fp)
            prices_added += 1

        session.commit()
        print(f"\n✅ Inserted {prices_added} Shell/BP price records")

        # Verify totals
        result = session.execute(text("SELECT brand, COUNT(*) FROM fuel_prices GROUP BY brand"))
        print("\n📊 Prices by brand:")
        for row in result:
            print(f"  {row[0]}: {row[1]} prices")


def main():
    print("=" * 50)
    print("Bengsin - Shell & BP Price Scraper")
    print("=" * 50)

    # Fetch Shell
    print("\n[1/3] Shell...")
    shell_records = fetch_shell_prices()

    # Fetch BP
    print("\n[2/3] BP...")
    bp_records = fetch_bp_prices()

    # Seed database
    print("\n[3/3] Inserting into database...")
    all_records = shell_records + bp_records
    if all_records:
        seed_prices(all_records)
    else:
        print("No records to insert")

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
