from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginRequest, TokenResponse, UserOut, UserCreate
from ..security import create_access_token, get_current_user, verify_password, create_refresh_token, verify_refresh_token, revoke_refresh_token, get_password_hash

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    user_exists = db.query(User).filter(User.email == payload.email).first()
    if user_exists:
        raise HTTPException(status_code=400, detail="Email ini sudah terdaftar")
    
    hashed_pwd = get_password_hash(payload.password)
    
    new_user = User(
        email=payload.email,
        hashed_password=hashed_pwd
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Email atau password salah")
    
    # 1. Buat access token (JWT) berdurasi pendek (misal 15-30 menit)
    access_token = create_access_token(payload={"sub": str(user.id)})
    
    # 2. Buat refresh token riil dan simpan ke database (berdurasi 7 hari)
    refresh_token = create_refresh_token(db, user_id=user.id)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post("/refresh", response_model=TokenResponse)
def refresh(refresh_token: str, db: Session = Depends(get_db)):
    # 1. Validasi token dari database
    db_token = verify_refresh_token(db, refresh_token)
    if not db_token:
        raise HTTPException(status_code=401, detail="Refresh token tidak valid atau sudah kedaluwarsa")
    
    # 2. Mekanisme Rotasi: Cabut token lama, terbitkan token baru
    revoke_refresh_token(db, refresh_token)
    new_refresh_token = create_refresh_token(db, user_id=db_token.user_id)
    
    # 3. Buat access token baru
    new_access_token = create_access_token(data={"sub": str(db_token.user_id)})
    
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }

@router.post("/logout", status_code=200)
def logout(refresh_token: str, db: Session = Depends(get_db)):
    success = revoke_refresh_token(db, token=refresh_token)
    if not success:
        raise HTTPException(status_code=400, detail="Refresh token tidak valid atau sudah mati")
    return {"detail": "Berhasil keluar"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
