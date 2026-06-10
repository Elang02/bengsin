from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

# Import yang diperlukan
from ..database import get_db
from ..models import CarBrand, MotorbikeBrand
from ..schemas import BrandResponse, BrandCreate


router = APIRouter(tags=["Brands"])

# Endpoint untuk Mobil
@router.get("/car-brands", response_model=List[BrandResponse])
def get_car_brands(db: Session = Depends(get_db)):
    return db.query(CarBrand).order_by(CarBrand.name.asc()).all()

# Endpoint untuk Motor
@router.get("/motorbike-brands", response_model=List[BrandResponse])
def get_motorbike_brands(db: Session = Depends(get_db)):
    return db.query(MotorbikeBrand).order_by(MotorbikeBrand.name.asc()).all()