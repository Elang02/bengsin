from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional

from ..database import get_db
from ..models import ExpenseLog, UserGarage, User
from ..schemas import ExpenseLogCreate, ExpenseLogResponse
from ..security import get_current_user

router = APIRouter(prefix="/expenses", tags=["expenses"])

@router.post("/", response_model=ExpenseLogResponse, status_code=status.HTTP_201_CREATED)
def add_fuel_expense(payload: ExpenseLogCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    vehicle_exists = db.query(UserGarage).filter(
        UserGarage.id == payload.vehicle_id,
        UserGarage.user_id == current_user.id
    ).first()
    
    if not vehicle_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kendaraan tidak ditemukan di garasi Anda. Proses pencatatan dibatalkan."
        )
        
    db_expense = ExpenseLog(
        user_id=current_user.id,
        vehicle_id=payload.vehicle_id,
        cost=payload.cost,
        volume=payload.volume,
        log_date=date.today()
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense

@router.get("/", response_model=list[ExpenseLogResponse])
def get_fuel_expenses(
    vehicle_id: Optional[int] = Query(None, description="ID kendaraan untuk filter spesifik"),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = db.query(ExpenseLog).filter(ExpenseLog.user_id == current_user.id)
    
    # Jika parameter vehicle_id dikirim oleh frontend, lakukan filter
    if vehicle_id is not None:
        query = query.filter(ExpenseLog.vehicle_id == vehicle_id)
        
    return query.order_by(ExpenseLog.log_date.desc()).all()

@router.delete("/{expense_id}", status_code=status.HTTP_200_OK)
def delete_expense(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    expense = db.query(ExpenseLog).filter(
        ExpenseLog.id == expense_id,
        ExpenseLog.user_id == current_user.id
    ).first()
    
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Log pengeluaran tidak ditemukan atau Anda tidak memiliki akses"
        )
        
    db.delete(expense)
    db.commit()
    return {"message": "Log pengeluaran bensin berhasil dihapus"}

@router.get("/monthly-summary")
def get_monthly_expense_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    summary_query = db.query(
        func.extract('year', ExpenseLog.log_date).label("year"),
        func.extract('month', ExpenseLog.log_date).label("month"),
        func.sum(ExpenseLog.cost).label("total_cost"),
        func.sum(ExpenseLog.volume).label("total_volume")
    ).filter(
        ExpenseLog.user_id == current_user.id
    ).group_by(
        func.extract('year', ExpenseLog.log_date),
        func.extract('month', ExpenseLog.log_date)
    ).order_by(
        func.extract('year', ExpenseLog.log_date).desc(),
        func.extract('month', ExpenseLog.log_date).desc()
    ).all()
    
    return [
        {
            "periode": f"{int(row.year)}-{int(row.month):02d}",
            "total_pengeluaran_rp": float(row.total_cost or 0),
            "total_bensin_liter": float(row.total_volume or 0)
        }
        for row in summary_query
    ]