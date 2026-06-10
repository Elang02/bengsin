from __future__ import annotations
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Integer, String, Numeric, ForeignKey, Date, DateTime, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class City(Base):
    __tablename__ = "cities"
    
    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    country: Mapped[str] = mapped_column(String(50), default="Indonesia")
    
    fuels: Mapped[list["FuelPrice"]] = relationship(back_populates="city", cascade="all, delete-orphan")


class FuelPrice(Base):
    __tablename__ = "fuel_prices"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    city_id: Mapped[str] = mapped_column(String(10), ForeignKey("cities.id", ondelete="CASCADE"), nullable=False)
    brand: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    fuel_type: Mapped[str] = mapped_column(String(15), nullable=False)
    octane_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    
    city: Mapped["City"] = relationship(back_populates="fuels")


class VehiclePreset(Base):
    __tablename__ = "vehicle_presets"
    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    vehicle_type: Mapped[str] = mapped_column(String(15)) # e.g., 'Car', 'Motorcycle'
    model: Mapped[str] = mapped_column(String(50))
    trim_variant: Mapped[str | None] = mapped_column(String(50), nullable=True)
    engine_type: Mapped[str] = mapped_column(String(15))
    min_octane: Mapped[int] = mapped_column(Integer)
    kmpl: Mapped[Decimal] = mapped_column(Numeric(4, 1))

    # Foreign Keys yang bisa dikosongkan (nullable=True)
    car_brand_id: Mapped[int | None] = mapped_column(ForeignKey("car_brands.id"), nullable=True)
    motor_brand_id: Mapped[int | None] = mapped_column(ForeignKey("motorbike_brands.id"), nullable=True)

    # Relationships
    car_brand: Mapped["CarBrand"] = relationship(back_populates="presets")
    motor_brand: Mapped["MotorbikeBrand"] = relationship(back_populates="presets")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    
    garage_vehicles: Mapped[list["UserGarage"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    expenses: Mapped[list["ExpenseLog"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserGarage(Base):
    __tablename__ = "user_garage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    vehicle_type: Mapped[str] = mapped_column(String(15), nullable=False)
    brand: Mapped[str] = mapped_column(String(30), nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    engine_type: Mapped[str] = mapped_column(String(15), nullable=False)
    min_octane: Mapped[int] = mapped_column(Integer, nullable=False)
    kmpl: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    
    user: Mapped["User"] = relationship(
        "User", 
        back_populates="garage_vehicles"
    )
    
    expense_logs: Mapped[list["ExpenseLog"]] = relationship(
        "ExpenseLog", 
        back_populates="vehicle", 
        cascade="all, delete-orphan"
    )

class ExpenseLog(Base):
    __tablename__ = "expense_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    # 1. KUNCI UTAMA YANG DICARI SQLALCHEMY:
    vehicle_id: Mapped[int] = mapped_column(Integer, ForeignKey("user_garage.id", ondelete="CASCADE"))
    
    # Kolom opsional tambahan (asumsi dari endpoint sebelumnya)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id")) 
    cost: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    volume: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    log_date: Mapped[date] = mapped_column(Date)

    # 2. NAMA BACK_POPULATES HARUS SAMA PERSIS DENGAN VARIABEL DI USERGARAGE
    vehicle: Mapped["UserGarage"] = relationship("UserGarage", back_populates="expense_logs")
    
    # Relasi ke user (jika Anda butuh menarik data user yang menginput)
    user: Mapped["User"] = relationship("User")
    # Catatan: skema Supabase tidak punya fuel_price_id. Bengsin mencatat nominal
    # langsung (immutable), tidak mereferensikan tabel harga.
    
    
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")
    
class CarBrand(Base):
    __tablename__ = "car_brands"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    # Relasi ke preset mobil
    presets: Mapped[list["VehiclePreset"]] = relationship(back_populates="car_brand")

class MotorbikeBrand(Base):
    __tablename__ = "motorbike_brands"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    # Relasi ke preset motor
    presets: Mapped[list["VehiclePreset"]] = relationship(back_populates="motor_brand")