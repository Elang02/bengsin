from pydantic import BaseModel, EmailStr
from decimal import Decimal
from datetime import date, datetime
from enum import Enum
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class UserCreate(BaseModel):
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None 
    token_type: str

class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True


class CityResponse(BaseModel):
    id: str
    name: str
    country: str

    class Config:
        from_attributes = True 


class FuelPriceResponse(BaseModel):
    id: int
    city_id: str
    brand: str
    name: str
    fuel_type: str
    octane_rating: int
    price: Decimal
    updated_at: datetime

    class Config:
        from_attributes = True


class VehiclePresetResponse(BaseModel):
    id: str
    vehicle_type: str
    brand: str
    model: str
    trim_variant: str | None
    engine_type: str
    min_octane: int
    kmpl: Decimal

    class Config:
        from_attributes = True



class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True

class VehicleTypeEnum(str, Enum):
    CAR = "Car"
    MOTORCYCLE = "Motorcycle"

class EngineTypeEnum(str, Enum):
    GASOLINE = "GASOLINE"
    DIESEL = "DIESEL"

class UserGarageBase(BaseModel):
    nickname: str
    vehicle_type: VehicleTypeEnum
    brand: str
    model: str
    engine_type: EngineTypeEnum
    min_octane: int
    kmpl: Decimal

class UserGarageCreate(UserGarageBase):
    pass

class UserGarageResponse(UserGarageBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True


class ExpenseLogCreate(BaseModel):
    vehicle_id: int
    cost: Decimal
    volume: Decimal


class ExpenseLogResponse(ExpenseLogCreate):
    id: int
    user_id: int
    log_date: date

    class Config:
        from_attributes = True
        
        
class BrandResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True
        
class BrandCreate(BaseModel):
    name: str
    
class PresetCreate(BaseModel):
    id: str
    vehicle_type: VehicleTypeEnum
    model: str
    engine_type: EngineTypeEnum
    min_octane: int
    kmpl: float
    car_brand_id: Optional[int] = None
    motor_brand_id: Optional[int] = None

class PresetResponse(PresetCreate):
    class Config:
        from_attributes = True