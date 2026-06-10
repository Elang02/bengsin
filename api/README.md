# Bengsin Backend API

FastAPI backend untuk aplikasi Bengsin - Kalkulator & Perbandingan Biaya BBM.

## 🚀 Features

- **Authentication & Authorization** - JWT-based login system
- **Vehicle Management** - CRUD operations untuk garage
- **Expense Tracking** - Pencatatan pengisian BBM
- **Fuel Price API** - Harga BBM per kota dengan zone-based pricing
- **Vehicle Presets** - 100 preset kendaraan (65 mobil, 23 motor)
- **City Coverage** - 31 kota dengan distribusi SPBU realistis

## 📋 Prerequisites

- Python 3.11+
- PostgreSQL database (Supabase recommended)

## 🔧 Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Setup environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL
```

## ⚙️ Configuration

Create `.env` file:

```env
DATABASE_URL=postgresql://user:password@host:port/database
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## 🏃 Running

```bash
# Development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## 📚 API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 🗄️ Database

Database schema managed by SQLAlchemy ORM. Models include:
- `User` - User accounts
- `Vehicle` - User vehicles in garage
- `Expense` - Fuel expense records
- `VehiclePreset` - Vehicle database (100 presets)
- `FuelPrice` - Fuel prices by city
- `City` - City list (31 cities)
- `CarBrand` / `MotorBrand` - Vehicle brands

Run migrations (if needed):
```bash
alembic upgrade head
```

## 🔗 CORS Configuration

Backend configured for cross-origin requests. Update `allow_origins` in `main.py` for production:

```python
allow_origins=["https://yourdomain.com"]  # Replace * with actual domain
```

## 📁 Project Structure

```
bengsin-backend/
├── app/
│   ├── main.py           # FastAPI app & CORS setup
│   ├── config.py         # Environment configuration
│   ├── database.py       # Database connection
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic schemas
│   └── routers/          # API route modules
│       ├── auth.py       # Authentication endpoints
│       ├── garage.py     # Vehicle management
│       ├── expenses.py   # Expense tracking
│       ├── brands.py     # Brand listings
│       └── vehicles.py   # Vehicle presets & fuel prices
├── requirements.txt      # Python dependencies
└── .env                  # Environment variables
```

## 🌐 Endpoints

### Public Endpoints
- `GET /` - API info
- `GET /health` - Health check
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /cities` - List cities
- `GET /cities/{city_id}/fuel-prices` - Fuel prices by city
- `GET /vehicle-presets` - List vehicle presets

### Protected Endpoints (Require JWT)
- `GET /garage/vehicles` - User vehicles
- `POST /garage/vehicles` - Add vehicle
- `PUT /garage/vehicles/{id}` - Update vehicle
- `DELETE /garage/vehicles/{id}` - Delete vehicle
- `GET /expenses` - Expense history
- `POST /expenses` - Add expense

## 🔐 Authentication

JWT-based authentication. Include token in requests:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:8000/garage/vehicles
```

## 📊 Database Seeding

Database pre-seeded with:
- ✅ 100 vehicle presets
- ✅ 31 cities (30 major + "Kota Lain")
- ✅ 262 fuel prices with zone-based Pertamina pricing
- ✅ 9 car brands, 4 motorcycle brands

## 🧪 Testing

```bash
# Run tests (if test suite exists)
pytest

# With coverage
pytest --cov=app tests/
```

## 📦 Deployment

### Supabase PostgreSQL
Backend configured for Supabase PostgreSQL. Get connection string from Supabase dashboard.

### Production Checklist
- [ ] Update `allow_origins` in CORS config
- [ ] Set secure `SECRET_KEY` in .env
- [ ] Use production PostgreSQL database
- [ ] Enable HTTPS
- [ ] Configure rate limiting (optional)
- [ ] Setup monitoring & logging

## 🤝 Frontend Integration

Backend designed to work with separate frontend. Frontend should:
1. Set `API_BASE` to backend URL (e.g., `http://localhost:8000`)
2. Include JWT token in Authorization header
3. Handle CORS preflight requests

Example frontend config:
```javascript
const API_BASE = "http://localhost:8000";  // or production URL
```

## 📝 License

Proprietary - Bengsin Project

## 👥 Author

Developed by Elang with Hermes AI Agent
