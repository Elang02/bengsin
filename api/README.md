# Bengsin API

FastAPI + SQLAlchemy di balik `public/`. Satu proses menyajikan API dan frontend, jadi
`/app.js` dan `/styles.css` datang dari origin yang sama.

## Menjalankan

```bash
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Tanpa `DATABASE_URL`, aplikasi memakai SQLite di `api/bengsin.db`. Di Vercel SQLite tidak
bertahan antar invocation, jadi produksi wajib Postgres.

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Postgres di produksi |
| `SECRET_KEY` | Kunci JWT |
| `TOKEN_EXPIRE_MINUTES` | Umur access token, default 120 |
| `CRON_SECRET` | Mengunci `/cron/fuel-sync`. Tanpa ini endpoint terbuka |
| `FUEL_PRICE_URL` | Menimpa sumber harga |

## Model

`User`, `Vehicle` (garage), `Expense`, `VehiclePreset`, `FuelPrice`, `City`, `CarBrand`,
`MotorBrand`. Tabel dibuat saat startup lewat `Base.metadata.create_all`. Tidak ada
migrasi Alembic.

## Endpoint

| Metode | Path | Catatan |
| --- | --- | --- |
| GET | `/health` | Status |
| POST | `/auth/register` | 201, mengembalikan user |
| POST | `/auth/login` | `{access_token, refresh_token}` |
| POST | `/auth/refresh` | `?refresh_token=…`, token dirotasi |
| POST | `/auth/logout` | Cabut refresh token |
| GET | `/auth/me` | Butuh `Authorization: Bearer` |
| GET | `/presets` · POST `/presets` | Preset kendaraan |
| GET | `/cities` | 118 baris |
| GET | `/fuel-prices` | `?city_id=`, 818 baris |
| GET | `/car-brands` · `/motorbike-brands` | Merek |
| GET, POST | `/garage/` | `vehicle_type`: `Car` atau `Motorcycle` |
| DELETE | `/garage/{vehicle_id}` | Hapus kendaraan |
| GET, POST | `/expenses/` | `log_date` diisi server dengan hari ini |
| DELETE | `/expenses/{expense_id}` | Hapus catatan |
| GET | `/expenses/monthly-summary` | Total per bulan |
| GET, POST | `/cron/fuel-sync` | Sinkronisasi harga |

Swagger di `/docs`, skema di `/openapi.json`.

## Harga BBM harian

Vercel Cron memanggil `GET /cron/fuel-sync` sekali sehari (`0 22 * * *` UTC, 05.00 WIB).
Sumbernya feed publik `nasgunawann/bensin-api` yang mengambil MyPertamina tiap jam
karena pertamina.com memakai Blazor dan tidak bisa dibaca tanpa browser.

- Isi `CRON_SECRET` di environment Vercel.
- Uji manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/cron/fuel-sync`
- Provinsi disimpan sebagai kota dengan slug (`aceh`, `sumatera-utara`, …) sehingga
  sinkronisasi berulang tidak menggandakan baris.
