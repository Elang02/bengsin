# Bengsin, product truth

A fuel-cost calculator for Indonesian drivers. You enter a city, a daily distance, and
how many days a week you drive; it tells you what the month costs in rupiah, using the
cheapest fuel that fits your engine. Sign in and it also keeps a garage and a fill-up
ledger.

Live: https://bengsin.vercel.app

## Who it is for

Someone deciding between two cars, or checking whether a 25 km commute is affordable.
They are on a phone, in a hurry, and they distrust numbers with no source. They are not
a fleet manager; there is no dashboard, no report export, no team.

## Surfaces

1. **Hitung**: the calculator. No account needed. City, vehicle, distance, workdays,
   result, price board, and a 3D comparison stage where the chosen vehicles stand side by
   side and can be turned by dragging. The stage is decoration with a job: it makes the
   two numbers feel like two vehicles.
2. **Garage**: vehicles and fill-ups for signed-in users. Ledger, not analytics.
3. **Auth**: a modal dialog over the current page, never a separate route.

## What the numbers mean

- Monthly km = distance × 2 (there and back) × workdays per month.
- Workdays per month = ⌈30 × days-per-week ÷ 7⌉, 22 for a 5-day week. Overridable.
- Litres = km ÷ km/L. Cost = litres × price of the cheapest fuel that fits.
- A fuel fits when `fuel_type` matches `engine_type` and its octane is at least the
  vehicle's `min_octane`. Diesel never fits a petrol engine.
- Prices are per city, per litre, and come from a daily sync of a public MyPertamina
  mirror (cron `0 22 * * *` UTC, 05.00 WIB). Prices change a few times a month.

## Data the app reads

- `GET /cities`: 118 rows, one per city or province group.
- `GET /fuel-prices`: 818 rows across 3 brands (Pertamina, BP, Shell). Two source
  datasets overlap; the client de-duplicates by brand + product name, preferring the
  mixed-case rows.
- `GET /presets`: 97 vehicles, 68 cars and 29 motorbikes, official-ish consumption.
  `vehicle_type` casing is inconsistent (`Car` / `CAR` / `Motorcycle` / `MOTORBIKE`);
  legacy motorbike rows have an empty `brand`.
- `GET /garage/`, `POST /garage/`, `DELETE /garage/{id}`
- `GET /expenses/`, `POST /expenses/`, `DELETE /expenses/{id}`; the server stamps
  `log_date` as today; no date can be sent.

## Constraints we do not fight

- `engine_type` accepts only `GASOLINE` and `DIESEL`. Electric vehicles have no fuel
  price to compare, so they are not offered.
- A fill-up has no date input, because the API has none.
- The 3D models are four CC BY 3.0 assets: a sedan, a small car, a tall wagon and a naked
  bike. The body follows the vehicle's type, so a hatchback row never shows a sedan and
  an MPV row never shows a coupe; that also means Avanza, Xpander and Innova share one
  silhouette, which is the point. The stage never claims to show your exact car, and the
  copy never says it does. Models whose panels are flat triangles were dropped even when
  their silhouette matched better: no lighting makes faceted bodywork read as sheet
  metal, and a cartoon van parked beside a real body reads as two different products in
  one picture.
- Prices are a mirror, not a live Pertamina feed. The UI says the price is "ditarik dari
  MyPertamina tiap hari" and never claims real-time.

## Non-goals

Trip planning, route cost, tolls, EV charging, receipts, multi-user households,
notifications. The calculation is the whole product; everything else is bookkeeping.

## Voice

Indonesian, plain, second person, no exclamation marks. Numbers are formatted
`Rp 303.448` (dot thousands, no decimals for money, comma for litres and km/L). Empty
states say what to do next, not that something went wrong. Errors are one sentence and
never blame the user.

## Success

The first viewport answers "how much per month" without scrolling on a 390 px phone.
The price board is trustworthy enough to screenshot. Nothing on the page is decoration.
