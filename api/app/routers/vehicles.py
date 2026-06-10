from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from ..database import get_db
from ..models import VehiclePreset, FuelPrice, City, CarBrand, MotorbikeBrand
from ..schemas import PresetCreate

router = APIRouter(tags=["Presets"])


def _preset_to_dict(p: VehiclePreset, car_map: dict, motor_map: dict) -> dict:
    if p.vehicle_type == "Motorcycle":
        brand = motor_map.get(p.motor_brand_id, "")
    else:
        brand = car_map.get(p.car_brand_id, "")
    return {
        "id": p.id,
        "vehicle_type": p.vehicle_type,
        "brand": brand,
        "model": p.model,
        "trim_variant": p.trim_variant,
        "engine_type": p.engine_type,
        "min_octane": p.min_octane,
        "kmpl": float(p.kmpl),
    }


@router.get("/presets")
def list_presets(
    vehicle_type: Optional[str] = Query(None, description="Filter: 'Car' atau 'Motorcycle'"),
    db: Session = Depends(get_db),
):
    """Daftar preset kendaraan (publik) untuk halaman perbandingan biaya."""
    car_map = {b.id: b.name for b in db.query(CarBrand).all()}
    motor_map = {b.id: b.name for b in db.query(MotorbikeBrand).all()}
    q = db.query(VehiclePreset)
    if vehicle_type:
        q = q.filter(VehiclePreset.vehicle_type == vehicle_type)
    presets = q.all()
    return [_preset_to_dict(p, car_map, motor_map) for p in presets]


@router.get("/cities")
def list_cities(db: Session = Depends(get_db)):
    """Daftar kota (publik)."""
    return [
        {"id": c.id, "name": c.name, "country": c.country}
        for c in db.query(City).order_by(City.name).all()
    ]


@router.get("/fuel-prices")
def list_fuel_prices(
    city_id: Optional[str] = Query(None, description="Filter harga BBM per kota"),
    db: Session = Depends(get_db),
):
    """Daftar harga BBM (publik). Tanpa city_id, kembalikan semua."""
    q = db.query(FuelPrice)
    if city_id:
        q = q.filter(FuelPrice.city_id == city_id)
    return [
        {
            "id": f.id, "city_id": f.city_id, "brand": f.brand, "name": f.name,
            "fuel_type": f.fuel_type, "octane_rating": f.octane_rating,
            "price": float(f.price),
        }
        for f in q.order_by(FuelPrice.price).all()
    ]


@router.post("/presets")
def create_preset(payload: PresetCreate, db: Session = Depends(get_db)):
    new_preset = VehiclePreset(
        id=payload.id,
        vehicle_type=payload.vehicle_type,
        model=payload.model,
        engine_type=payload.engine_type,
        min_octane=payload.min_octane,
        kmpl=payload.kmpl,
        car_brand_id=payload.car_brand_id,
        motor_brand_id=payload.motor_brand_id,
    )
    db.add(new_preset)
    db.commit()
    db.refresh(new_preset)
    return new_preset
