from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import UserGarage, User
from ..schemas import UserGarageCreate, UserGarageResponse
from ..security import get_current_user

router = APIRouter(prefix="/garage", tags=["garage"])

@router.post("/", response_model=UserGarageResponse, status_code=status.HTTP_201_CREATED)
def add_vehicle(payload: UserGarageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_vehicle = UserGarage(
        user_id=current_user.id,
        nickname=payload.nickname,
        vehicle_type=payload.vehicle_type,
        brand=payload.brand,
        model=payload.model,
        engine_type=payload.engine_type,
        min_octane=payload.min_octane,
        kmpl=payload.kmpl,
    )
    db.add(db_vehicle)
    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle

@router.get("/", response_model=list[UserGarageResponse])
def get_my_garage(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    vehicles = db.query(UserGarage).filter(UserGarage.user_id == current_user.id).all()
    return vehicles

@router.delete("/{vehicle_id}", status_code=status.HTTP_200_OK)
def delete_vehicle(vehicle_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    vehicle = db.query(UserGarage).filter(
        UserGarage.id == vehicle_id, 
        UserGarage.user_id == current_user.id
    ).first()
    
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Kendaraan tidak ditemukan atau Anda tidak memiliki akses"
        )
        
    db.delete(vehicle)
    db.commit()
    return {"message": f"Kendaraan '{vehicle.nickname}' berhasil dihapus dari garasi"}