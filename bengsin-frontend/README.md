# Bengsin Frontend

Frontend SPA untuk aplikasi Bengsin - Kalkulator & Perbandingan Biaya BBM.

## 🎨 Tech Stack

- **HTML5** - Structure
- **Vanilla JavaScript** - Logic & API calls
- **Tailwind CSS** - Styling (CDN)

## 🚀 Quick Start

### Option 1: Python HTTP Server
```bash
cd bengsin-frontend
python3 -m http.server 8080
```

Visit: http://localhost:8080

### Option 2: Node.js serve
```bash
npm install -g serve
serve -s . -p 8080
```

### Option 3: Any Static Server
Serve `index.html` and `app.js` with any static file server.

## ⚙️ Configuration

**Backend API URL:**

Edit `app.js` line 25:
```javascript
const API_BASE = "http://localhost:8000";  // Change to your backend URL
```

For production:
```javascript
const API_BASE = "https://api.yourdomain.com";
```

**Current default:** `window.location.origin` (same server as frontend)

## 📁 File Structure

```
bengsin-frontend/
├── index.html    # Main SPA layout (256 lines)
└── app.js        # Frontend logic (1,027 lines)
```

## 🔗 Backend Integration

Frontend expects backend API at the configured `API_BASE` with these endpoints:

### Public Endpoints
- `GET /cities` - City list
- `GET /cities/{id}/fuel-prices` - Fuel prices
- `GET /vehicle-presets` - Vehicle database
- `POST /auth/register` - Register
- `POST /auth/login` - Login

### Protected Endpoints (JWT Required)
- `GET /garage/vehicles` - User vehicles
- `POST /garage/vehicles` - Add vehicle
- `GET /expenses` - Expense history
- `POST /expenses` - Log expense

## 🎯 Features

### Public Features (No Login)
- ✅ Kalkulator perbandingan biaya BBM antar kendaraan
- ✅ Parameter perjalanan (jarak, hari kerja)
- ✅ Pilih kota untuk harga BBM
- ✅ Search & compare vehicle presets
- ✅ Cost estimation & comparison

### Protected Features (Login Required)
- ✅ Garage - kelola kendaraan milik sendiri
- ✅ Expense tracking - pencatatan pengisian BBM
- ✅ Monthly summary - total biaya per bulan

## 🔐 Authentication

JWT token stored in `localStorage`:
```javascript
localStorage.getItem("token")  // Get token
localStorage.setItem("token", jwt)  // Store token
```

## 🎨 Theming

Color scheme (OKLCH):
- **Bordeaux:** `oklch(0.30 0.11 12)` - Deep burgundy
- **Gold:** `oklch(0.76 0.13 85)` - Champagne gold
- **Ink:** `oklch(0.18 0.01 60)` - Dark text
- **Muted:** `oklch(0.55 0.01 60)` - Secondary text

## 📱 Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6+ JavaScript required
- Fetch API required

## 🧪 Testing

```bash
# Test backend connection
curl http://localhost:8000/health

# Then load frontend
open http://localhost:8080
```

## 📦 Production Deployment

### Static Hosting Options
- **Vercel** - `vercel deploy`
- **Netlify** - Drag & drop or CLI
- **Cloudflare Pages** - Git integration
- **AWS S3 + CloudFront** - Static site hosting
- **Nginx** - Traditional web server

### Build Steps
No build required - pure HTML + JS.

Just configure `API_BASE` in `app.js` to point to production backend.

### Environment-Specific Config
```javascript
// Development
const API_BASE = "http://localhost:8000";

// Production
const API_BASE = "https://api.bengsin.com";
```

## 🔧 CORS Requirements

Backend must allow frontend origin:
```python
# Backend main.py
allow_origins=["https://bengsin.com"]  # Your frontend domain
```

## 📝 Notes

- **No build process** - pure vanilla JS
- **SPA routing** - single page, client-side state management
- **localStorage** for auth token persistence
- **Tailwind CSS CDN** for styling

## 👥 Author

Developed by Elang with Hermes AI Agent
