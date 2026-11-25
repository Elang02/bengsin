// Bengsin — frontend. One page, two views: hitung (public) and garage (account).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const rp = (n) => "Rp " + nf0.format(Math.round(Number(n) || 0));
const dec = (n, d = 1) => (d === 1 ? nf1.format(Number(n) || 0) : nf0.format(Number(n) || 0));

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const LS = { token: "bs.token", refresh: "bs.refresh", email: "bs.email", prefs: "bs.prefs" };

const S = {
  token: localStorage.getItem(LS.token),
  refresh: localStorage.getItem(LS.refresh),
  email: localStorage.getItem(LS.email) || "",
  page: "hitung",

  cities: [],
  presets: [],
  prices: [],

  city: null,
  distance: 10,
  dpw: 5,
  workdaysOverride: null,

  a: null,
  b: null,
  compareMode: false,
  query: "",
  vtype: "all",

  vehicles: [],
  expenses: [],
  selectedVehicleId: null,
  confirmDelete: null,
  confirmExpense: null,

  roOpen: false,
  lastFigure: null,
  loadError: null,
  eSyncing: false,
};

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(LS.prefs) || "{}") || {};
  } catch {
    return {};
  }
}

function savePrefs() {
  try {
    localStorage.setItem(LS.prefs, JSON.stringify({
      cityId: S.city?.id || null,
      distance: S.distance,
      dpw: S.dpw,
      wd: S.workdaysOverride,
      a: S.a?.id || null,
      b: S.b?.id || null,
    }));
  } catch { /* storage full or blocked */ }
}

// ---------------------------------------------------------------------------
// api
// ---------------------------------------------------------------------------

async function api(path, { method = "GET", body, retry = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (S.token) headers.Authorization = "Bearer " + S.token;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    const err = new Error("Tidak bisa menghubungi server. Periksa koneksi.");
    err.offline = true;
    throw err;
  }

  if (res.status === 401 && retry && S.refresh) {
    const renewed = await renewToken();
    if (renewed) return api(path, { method, body, retry: false });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    let message = typeof data.detail === "string" ? data.detail : "";
    if (!message && Array.isArray(data.detail)) message = data.detail[0]?.msg || "";
    const err = new Error(message || `Permintaan gagal (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.status === 204 ? null : res.json();
}

async function renewToken() {
  try {
    const res = await fetch("/auth/refresh?refresh_token=" + encodeURIComponent(S.refresh), { method: "POST" });
    if (!res.ok) return false;
    const data = await res.json();
    S.token = data.access_token;
    S.refresh = data.refresh_token || S.refresh;
    localStorage.setItem(LS.token, S.token);
    localStorage.setItem(LS.refresh, S.refresh);
    return true;
  } catch {
    return false;
  }
}

function signOut() {
  S.token = null;
  S.refresh = null;
  S.email = "";
  S.vehicles = [];
  S.expenses = [];
  S.selectedVehicleId = null;
  localStorage.removeItem(LS.token);
  localStorage.removeItem(LS.refresh);
  localStorage.removeItem(LS.email);
  updateAccount();
  renderGarage();
}

// ---------------------------------------------------------------------------
// data shaping
// ---------------------------------------------------------------------------

const isMotor = (v) => /^mot/i.test(v.vehicle_type || "");
const typeLabel = (v) => (isMotor(v) ? "Motor" : "Mobil");
const vehicleName = (v) => [v.brand, v.model].filter(Boolean).join(" ").trim() || v.model || "Kendaraan";
const vehicleFull = (v) => [vehicleName(v), v.trim_variant].filter(Boolean).join(" ");

function octaneLabel(v) {
  return (v.engine_type || "").toUpperCase() === "DIESEL" ? "CN " + v.min_octane : "RON " + v.min_octane;
}

function prettyFuelName(name) {
  const raw = (name || "").trim();
  if (!raw) return "BBM";
  if (raw !== raw.toUpperCase()) return raw;
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w === "bp" ? "BP" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Two seed sets overlap: keep one row per product, preferring mixed-case names.
function cityFuels() {
  if (!S.city) return [];
  const rows = S.prices.filter((p) => p.city_id === S.city.id);
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.brand}|${(row.name || "").toLowerCase()}|${row.fuel_type}`;
    const prev = seen.get(key);
    const mixed = row.name !== row.name.toUpperCase() ? 1 : 0;
    const prevMixed = prev && prev.name !== prev.name.toUpperCase() ? 1 : 0;
    if (!prev || (mixed && !prevMixed)) seen.set(key, row);
  }
  const brandOrder = { Pertamina: 0, BP: 1, Shell: 2 };
  return Array.from(seen.values()).sort((x, y) => {
    const bx = brandOrder[x.brand] ?? 9;
    const by = brandOrder[y.brand] ?? 9;
    if (bx !== by) return bx - by;
    if (x.brand !== y.brand) return x.brand.localeCompare(y.brand);
    return Number(x.price) - Number(y.price);
  });
}

function fuelFits(f, v) {
  const engine = (v.engine_type || "GASOLINE").toUpperCase();
  const type = (f.fuel_type || "").toLowerCase();
  if (engine === "DIESEL") return type === "diesel";
  if (engine === "ELECTRIC") return false;
  return type === "gasoline" && Number(f.octane_rating) >= Number(v.min_octane);
}

// Same monthly cost, but priced on one specific fuel instead of the cheapest.
function calcWith(v, fuel) {
  const base = calc(v);
  if (!base || !fuel) return base;
  const cost = base.liters * Number(fuel.price);
  return { ...base, fuel, cost, perDay: base.wd > 0 ? cost / base.wd : null };
}

function cheapestFuel(v) {
  const fits = cityFuels().filter((f) => fuelFits(f, v));
  if (!fits.length) return null;
  return fits.reduce((best, f) => (Number(f.price) < Number(best.price) ? f : best), fits[0]);
}

function monthWorkdays() {
  if (S.workdaysOverride) return S.workdaysOverride;
  return Math.ceil((30 * S.dpw) / 7);
}

function calc(v) {
  if (!v) return null;
  const wd = monthWorkdays();
  const distance = Number(S.distance) || 0;
  const kmpl = Number(v.kmpl) || 0;
  const km = distance * 2 * wd;
  const liters = kmpl > 0 ? km / kmpl : 0;
  const fuel = cheapestFuel(v);
  const cost = fuel ? liters * Number(fuel.price) : null;
  return { km, liters, wd, fuel, cost, perDay: cost !== null && wd > 0 ? cost / wd : null };
}

// ---------------------------------------------------------------------------
// readout
// ---------------------------------------------------------------------------

function renderReadout() {
  const cityEl = $("#roCity");
  if (cityEl) cityEl.textContent = S.city ? S.city.name : "";
  const a = S.a;
  const b = S.b;
  const ca = calc(a);
  const cb = b ? calc(b) : null;

  const veh = $("#roVeh");
  const sub = $("#roSub");
  const chain = $("#roChain");
  const cmp = $("#roCmp");

  if (!a) {
    veh.textContent = "Belum ada kendaraan";
    setFigure("—", true);
    $("#copyBtn").disabled = true;
    sub.textContent = S.city ? `Harga ${S.city.name} siap dipakai.` : "Pilih kota dan kendaraan.";
    chain.innerHTML = "";
    cmp.hidden = true;
    return;
  }

  if (!ca || ca.cost === null) {
    veh.textContent = `${b ? "A · " : ""}${vehicleFull(a)}`;
    setFigure("—", true);
    $("#copyBtn").disabled = true;
    sub.textContent = ca
      ? `Tidak ada BBM di ${S.city?.name || "kota ini"} yang cocok. Coba kota lain.`
      : "Isi jarak untuk menghitung.";
    chain.innerHTML = "";
    cmp.hidden = true;
    return;
  }

  veh.textContent = `${b ? "A · " : ""}${vehicleFull(a)}`;
  setFigure(nf0.format(Math.round(ca.cost)), false);
  $("#copyBtn").disabled = false;
  sub.textContent = ca.perDay
    ? `≈ ${rp(ca.perDay)} per hari kerja · ${ca.wd} hari`
    : `${ca.wd} hari kerja`;

  chain.innerHTML = [
    ["Jarak tempuh", `${nf0.format(Math.round(ca.km))} km`],
    ["Bensin", `${dec(ca.liters)} L`],
    ["BBM", `${prettyFuelName(ca.fuel.name)} · ${rp(ca.fuel.price)}/L`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  if (!b || !cb || cb.cost === null) {
    cmp.hidden = true;
    return;
  }

  cmp.hidden = false;
  const rows = [
    { key: "A", v: a, c: ca },
    { key: "B", v: b, c: cb },
  ];
  const max = Math.max(ca.cost, cb.cost) || 1;
  const winner = ca.cost <= cb.cost ? "A" : "B";
  const diff = Math.abs(ca.cost - cb.cost);
  const pct = max > 0 ? (diff / max) * 100 : 0;
  const winnerName = vehicleFull(winner === "A" ? a : b);

  cmp.innerHTML =
    rows.map((r) => `
      <div class="cmp__row ${winner === r.key ? "cmp__row--win" : ""}">
        <div class="cmp__top">
          <span class="cmp__name">${r.key} · ${vehicleFull(r.v)}</span>
          <span class="cmp__val">${rp(r.c.cost)}</span>
        </div>
        <div class="cmp__bar"><div class="cmp__fill" style="width:${(r.c.cost / max) * 100}%"></div></div>
      </div>`).join("") +
    `<p class="cmp__note"><span class="cmp__win">${winnerName} lebih hemat ${rp(diff)}</span> · ${dec(pct)}% per bulan</p>`;
}

function setFigure(text, empty) {
  const numEl = $("#roNum");
  const fig = $("#roFigure");
  const changed = text !== S.lastFigure;
  numEl.textContent = text;
  fig.classList.toggle("is-empty", !!empty);
  if (changed && !empty && S.lastFigure !== null) {
    fig.classList.remove("is-tick");
    void fig.offsetWidth;
    fig.classList.add("is-tick");
  }
  S.lastFigure = text;
}

// ---------------------------------------------------------------------------
// city + price board
// ---------------------------------------------------------------------------

function renderCitySelect() {
  const sel = $("#city");
  sel.innerHTML = S.cities.length
    ? S.cities.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")
    : `<option value="">Harga kota belum termuat</option>`;
  if (S.city) sel.value = S.city.id;
}

// A four-price strip under the lede: the city's cheapest, before you scroll.
function renderTicker(rows) {
  const body = $("#tickerBody");
  const el = $("#ticker");
  if (!body || !el) return;
  if (!rows.length) { el.hidden = true; return; }
  el.hidden = false;
  $("#ticker").querySelector(".ticker__lab").textContent = S.city
    ? `Harga hari ini · ${S.city.name}`
    : "Harga hari ini";
  const pool = S.a ? rows.filter((f) => fuelFits(f, S.a)) : rows.filter((f) => (f.fuel_type || "").toLowerCase() !== "diesel");
  if (!pool.length) { el.hidden = true; return; }
  const html = [...pool]
    .sort((x, y) => Number(x.price) - Number(y.price))
    .slice(0, 4)
    .map((f) => `<span class="ticker__item">${prettyFuelName(f.name)} <b>${nf0.format(f.price)}</b><i>/L</i></span>`)
    .join("");
  if (html !== body.dataset.html) {
    body.innerHTML = html;
    body.dataset.html = html;
  }
}

function renderBoard() {
  const table = $("#boardTable");
  const meta = $("#boardMeta");
  const note = $("#boardNote");

  if (!S.city) {
    table.innerHTML = "";
    meta.textContent = "";
    note.textContent = "";
    $("#ticker").hidden = true;
    return;
  }

  const rows = cityFuels();
  const pick = S.a ? cheapestFuel(S.a) : null;
  const veh = S.a;

  renderTicker(rows);

  meta.textContent = `${S.city.name} · ${rows.length} produk · Pertamina, BP, Shell`;
  $("#cityMeta").textContent = `${rows.length} produk BBM`;

  if (!rows.length) {
    table.innerHTML = "";
    note.textContent = "Belum ada harga untuk kota ini. Sinkronisasi berjalan tiap hari.";
    return;
  }

  let lastBrand = null;
  let span = 0;
  const counts = rows.reduce((acc, f) => ((acc[f.brand] = (acc[f.brand] || 0) + 1), acc), {});

  const body = rows.map((f) => {
    const fits = veh ? fuelFits(f, veh) : null;
    const isPick = pick && pick.id === f.id;
    const oct = (f.fuel_type || "").toLowerCase() === "diesel" ? "CN " + f.octane_rating : "RON " + f.octane_rating;
    const c = veh && fits ? calcWith(veh, f) : null;
    const monthly = c && c.cost !== null ? `${rp(c.cost)}/bln` : "";
    const small = isPick
      ? `<small>dipakai ${vehicleName(veh)}</small>`
      : !fits && veh
        ? `<small>tidak cocok</small>`
        : "";
    const first = f.brand !== lastBrand;
    if (first) { lastBrand = f.brand; span = counts[f.brand]; }
    const brandCell = first
      ? `<td class="brand" rowspan="${span}">${f.brand}</td>`
      : "";
    const brandLine = first ? `<span class="brandline">${f.brand}</span>` : "";
    return `<tr class="${first ? "is-group" : ""} ${isPick ? "is-pick" : ""} ${fits === false ? "is-off" : ""}">
      ${brandCell}
      <td class="prod">${brandLine}${prettyFuelName(f.name)}${small}</td>
      <td>${oct}</td>
      <td class="price">${rp(f.price)}${monthly ? `<small class="price__mo">${monthly}</small>` : ""}</td>
    </tr>`;
  }).join("");

  table.innerHTML = `<table class="ftable">
    <caption>Harga per liter di ${S.city.name}, urut dari termurah per merek.</caption>
    <thead><tr><th>Merek</th><th>Produk</th><th>Oktan</th><th>Harga</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;

  note.textContent = veh
    ? "Baris pudar tidak cocok untuk kendaraan yang dipilih. Yang bertanda dipakai adalah BBM termurah yang memenuhi oktan minimum."
    : "Pilih kendaraan untuk melihat BBM mana yang cocok.";
}

// ---------------------------------------------------------------------------
// vehicle picker
// ---------------------------------------------------------------------------

function renderSlots() {
  const wrap = $("#slots");
  const a = S.a;
  const b = S.b;
  const parts = [];

  if (a) {
    parts.push(`<span class="slot"><span class="slot__key">A</span><span class="slot__name">${vehicleFull(a)}</span>
      <button class="slot__x" type="button" data-clear="a" aria-label="Hapus ${vehicleFull(a)}">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button></span>`);
  }

  if (b) {
    parts.push(`<span class="slot slot--b"><span class="slot__key">B</span><span class="slot__name">${vehicleFull(b)}</span>
      <button class="slot__x" type="button" data-clear="b" aria-label="Hapus ${vehicleFull(b)}">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button></span>`);
  }

  if (a && !b && !S.compareMode) {
    parts.push(`<button class="btn btn--line btn--sm" type="button" data-action="compare">Bandingkan</button>`);
  }

  if (S.compareMode) {
    parts.push(`<span class="slot slot--b"><span class="slot__key">B</span><span class="slot__name">pilih pembanding…</span></span>
      <button class="link" type="button" data-action="cancel-compare">Batal</button>`);
  }

  wrap.innerHTML = parts.join("");
}

function renderVehicles() {
  const list = $("#vlist");
  const q = S.query.trim().toLowerCase();
  const type = S.vtype;

  let rows = S.presets.filter((v) => type === "all" || (isMotor(v) ? "Motorcycle" : "Car") === type);

  if (q) {
    rows = rows.filter((v) =>
      [v.brand, v.model, v.trim_variant, typeLabel(v)].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }

  rows = rows.slice().sort((x, y) =>
    Number(isMotor(x)) - Number(isMotor(y)) ||
    vehicleName(x).localeCompare(vehicleName(y), "id") ||
    String(x.trim_variant || "").localeCompare(String(y.trim_variant || ""), "id")
  );

  $("#vMeta").textContent = q
    ? `${rows.length} dari ${S.presets.length} preset`
    : `${S.presets.length} preset · mobil dan motor`;

  if (!rows.length) {
    list.innerHTML = S.presets.length
      ? `<li class="none">Tidak ada yang cocok. Coba “avanza”, “beat”, atau “nmax”.</li>`
      : `<li class="none">Preset kendaraan belum termuat. Muat ulang halaman, atau tambah kendaraan sendiri di Garage.</li>`;
    return;
  }

  const selected = [S.a?.id, S.b?.id].filter(Boolean);

  list.innerHTML = rows.map((v) => `
    <li>
      <button class="vrow" type="button" data-veh="${v.id}" ${selected.includes(v.id) ? 'aria-current="true"' : ""}>
        <span class="vrow__name">
          ${selected.includes(v.id) ? '<span class="vrow__dot" aria-hidden="true"></span>' : ""}
          ${vehicleName(v)}
          ${v.trim_variant ? `<span class="vrow__trim">${v.trim_variant}</span>` : ""}
        </span>
        <svg class="vrow__go" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="vrow__meta">${typeLabel(v)} · ${dec(v.kmpl)} km/L · ${octaneLabel(v)}</span>
      </button>
    </li>`).join("");
}

function pickVehicle(id) {
  const v = S.presets.find((p) => p.id === id);
  if (!v) return;

  if (!S.a) {
    S.a = v;
    S.b = null;
  } else if (S.compareMode) {
    if (v.id === S.a.id) return;
    S.b = v;
    S.compareMode = false;
  } else if (v.id === S.a.id) {
    S.a = null;
    S.b = null;
  } else {
    S.b = v;
  }

  renderAll();
  savePrefs();
}

// ---------------------------------------------------------------------------
// form state
// ---------------------------------------------------------------------------

function setDistance(km, fromInput = false) {
  S.distance = Math.max(0, Number(km) || 0);
  const input = $("#distance");
  if (!fromInput) input.value = S.distance;
  const range = $("#distanceRange");
  if (range && document.activeElement !== range) {
    range.value = String(Math.min(60, Math.max(1, Math.round(S.distance))));
  }
  updateCar();
  renderReadout();
  renderBoard();
  savePrefs();
}

// The car sits at the distance, so the number becomes something you can see.
function updateCar() {
  const road = $("#road");
  if (!road) return;
  const km = Math.min(60, Math.max(0, S.distance));
  road.style.setProperty("--p", String(km / 60));
  road.dataset.zero = km === 0 ? "true" : "false";
}

function setDays(n) {
  S.dpw = n;
  const days = $$('input[name="days"]');
  days.forEach((r) => { r.checked = Number(r.value) === n; });
  $("#daysMeta").textContent = `${monthWorkdays()} hari/bulan`;
  renderReadout();
  savePrefs();
}

function setWorkdaysOverride(n) {
  S.workdaysOverride = n ? Math.min(31, Math.max(1, Number(n))) : null;
  $("#daysMeta").textContent = `${monthWorkdays()} hari/bulan`;
  renderReadout();
  savePrefs();
}

function renderAll() {
  renderSlots();
  renderVehicles();
  renderReadout();
  renderBoard();
  $("#vHint").textContent = S.compareMode
    ? "Pilih kendaraan kedua untuk dibandingkan."
    : "Preset berisi konsumsi resmi pabrikan. Angka konsumsi nyata biasanya lebih rendah.";
}

// ---------------------------------------------------------------------------
// garage
// ---------------------------------------------------------------------------

function renderGarage() {
  const out = $("#garageOut");
  const inside = $("#garageIn");
  const lede = $("#garageLede");

  if (!S.token) {
    out.hidden = false;
    inside.hidden = true;
    lede.textContent = "Kendaraan dan catatan pengisian BBM milikmu.";
    return;
  }

  out.hidden = true;
  inside.hidden = false;

  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = S.expenses.filter((e) => (e.log_date || "").startsWith(prefix));
  const total = thisMonth.reduce((sum, e) => sum + Number(e.cost || 0), 0);
  const liters = thisMonth.reduce((sum, e) => sum + Number(e.volume || 0), 0);

  lede.textContent = thisMonth.length
    ? `${MONTHS[now.getMonth()]}: ${rp(total)} untuk ${dec(liters)} liter dari ${thisMonth.length} pengisian.`
    : "Belum ada catatan bulan ini. Mulai dari pengisian berikutnya.";

  renderVehicleList();
  renderExpenseForm();
  renderExpenseList();
}

function renderVehicleList() {
  const list = $("#vehicleList");

  if (!S.vehicles.length) {
    list.innerHTML = `<li class="empty">Belum ada kendaraan. Tambah satu, lalu catat pengisian pertamamu.</li>`;
    return;
  }

  list.innerHTML = S.vehicles.map((v) => {
    const c = S.city ? calc(v) : null;
    const cost = c && c.cost !== null ? rp(c.cost) : "";
    const isOn = S.selectedVehicleId === v.id;
    const confirming = S.confirmDelete === v.id;

    return `<li class="veh ${isOn ? "is-on" : ""}">
      <button class="veh__btn" type="button" data-veh-select="${v.id}"
              aria-pressed="${isOn}" aria-label="Lihat riwayat ${v.nickname}">
        <span class="veh__name">${v.nickname}</span>
        <span class="veh__meta">${v.brand} ${v.model} · ${dec(v.kmpl)} km/L · ${octaneLabel(v)}</span>
        ${cost ? `<span class="veh__cost">${cost}<span class="veh__unit">/bln</span></span>` : ""}
      </button>
      <button class="icon-btn icon-btn--danger" type="button" data-veh-del="${v.id}" aria-label="Hapus ${v.nickname}">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      ${confirming ? `<div class="veh__confirm">
        <span>Hapus ${v.nickname}?</span>
        <button class="btn btn--sm" type="button" data-veh-del-yes="${v.id}">Hapus</button>
        <button class="btn btn--quiet btn--sm" type="button" data-veh-del-no="1">Batal</button>
      </div>` : ""}
    </li>`;
  }).join("");
}

function renderExpenseForm() {
  const vSel = $("#eVehicle");
  const fSel = $("#eFuel");

  if (!S.vehicles.length) {
    vSel.innerHTML = `<option value="">Belum ada kendaraan</option>`;
    vSel.disabled = true;
    fSel.innerHTML = `<option value="">Tambah kendaraan dulu</option>`;
    fSel.disabled = true;
    $("#expenseSubmit").disabled = true;
    return;
  }

  vSel.disabled = false;
  $("#expenseSubmit").disabled = false;
  const current = vSel.value;
  vSel.innerHTML = S.vehicles
    .map((v) => `<option value="${v.id}">${v.nickname} — ${v.brand} ${v.model}</option>`)
    .join("");
  if (current && S.vehicles.some((v) => String(v.id) === current)) vSel.value = current;

  renderFuelOptions();
}

function renderFuelOptions() {
  const vSel = $("#eVehicle");
  const fSel = $("#eFuel");
  const vehicle = S.vehicles.find((v) => String(v.id) === vSel.value);
  const fuels = vehicle ? cityFuels().filter((f) => fuelFits(f, vehicle)) : [];

  fSel.disabled = !fuels.length;
  if (!fuels.length) {
    fSel.innerHTML = `<option value="">${vehicle ? "Tidak ada BBM yang cocok" : "Pilih kendaraan dulu"}</option>`;
    return;
  }

  const previous = fSel.value;
  fSel.innerHTML = `<option value="">Pilih BBM</option>` + fuels
    .map((f) => `<option value="${f.id}" data-price="${f.price}">${prettyFuelName(f.name)} — ${rp(f.price)}/L</option>`)
    .join("");
  if (previous && fuels.some((f) => String(f.id) === previous)) fSel.value = previous;

  S.litersManual = false;
  updateExpenseHint();
  maybeFillLiters();
}

function updateExpenseHint() {
  const price = Number($("#eFuel").selectedOptions[0]?.dataset.price || 0);
  $("#eHint").textContent = price
    ? `Liter diisi otomatis: total bayar ÷ ${rp(price)}/L. Bisa diganti kalau strukmu beda.`
    : "Pilih BBM, liternya dihitung dari total bayar.";
}

function maybeFillLiters() {
  const price = Number($("#eFuel").selectedOptions[0]?.dataset.price || 0);
  const cost = Number($("#eCost").value);
  if (S.litersManual || !price || !cost) return;
  $("#eLiters").value = (cost / price).toFixed(2);
}

function selectedFuelPrice() {
  const opt = $("#eFuel").selectedOptions[0];
  return opt ? Number(opt.dataset.price || 0) : 0;
}

function syncLitersFromCost() {
  if (S.eSyncing) return;
  const price = selectedFuelPrice();
  const cost = Number($("#eCost").value);
  if (!price || !cost) return;
  S.eSyncing = true;
  $("#eLiters").value = (cost / price).toFixed(2);
  S.eSyncing = false;
}

function syncCostFromLiters() {
  if (S.eSyncing) return;
  const price = selectedFuelPrice();
  const liters = Number($("#eLiters").value);
  if (!price || !liters) return;
  S.eSyncing = true;
  $("#eCost").value = Math.round(liters * price);
  S.eSyncing = false;
}

function renderExpenseList() {
  const box = $("#expenseList");
  const all = S.expenses.slice().sort((x, y) => String(y.log_date).localeCompare(String(x.log_date)) || y.id - x.id);
  const rows = S.selectedVehicleId ? all.filter((e) => e.vehicle_id === S.selectedVehicleId) : all;

  const vehicle = S.vehicles.find((v) => v.id === S.selectedVehicleId);
  $("#histMeta").textContent = vehicle ? `Menampilkan ${vehicle.nickname}` : `${all.length} catatan`;

  if (!all.length) {
    box.innerHTML = `<p class="empty">Belum ada catatan pengisian. Setiap isi bensin bisa dicatat di sini, lengkap dengan harga per liternya.</p>`;
    return;
  }

  if (!rows.length) {
    box.innerHTML = `<p class="empty">Belum ada catatan untuk ${vehicle?.nickname || "kendaraan ini"}.</p>
      <button class="link" type="button" data-clear-filter="1">Tampilkan semua</button>`;
    return;
  }

  const groups = new Map();
  for (const e of rows) {
    const key = String(e.log_date).slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  box.innerHTML = Array.from(groups.entries()).map(([month, items]) => {
    const [y, m] = month.split("-");
    const sum = items.reduce((s, e) => s + Number(e.cost || 0), 0);
    const liters = items.reduce((s, e) => s + Number(e.volume || 0), 0);
    const label = `${MONTHS[Number(m) - 1]} ${y}`;

    const list = items.map((e) => {
      const v = S.vehicles.find((x) => x.id === e.vehicle_id);
      const day = String(e.log_date).slice(8, 10);
      const perL = Number(e.volume) > 0 ? Number(e.cost) / Number(e.volume) : 0;
      return `<div class="hist__row">
        <span class="hist__date">${day} ${SHORT_MONTHS[Number(m) - 1]}</span>
        <span class="hist__veh">${v ? v.nickname : "Kendaraan"}</span>
        <span class="hist__vol">${dec(e.volume)} L · ${rp(perL)}/L</span>
        <span class="hist__cost">${rp(e.cost)}</span>
        <button class="icon-btn icon-btn--danger hist__del" type="button" data-exp-del="${e.id}" aria-label="Hapus catatan ${day} ${SHORT_MONTHS[Number(m) - 1]}">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`;
    }).join("");

    return `<section class="hist__month">
      <div class="hist__head">
        <h3 class="hist__month-name">${label}</h3>
        <p class="hist__sum"><b>${rp(sum)}</b> · ${dec(liters)} L</p>
      </div>
      ${list}
    </section>`;
  }).join("");
}

async function loadGarage() {
  if (!S.token) {
    renderGarage();
    return;
  }
  try {
    const [vehicles, expenses] = await Promise.all([api("/garage/"), api("/expenses/")]);
    S.vehicles = vehicles;
    S.expenses = expenses;
    if (S.selectedVehicleId && !vehicles.some((v) => v.id === S.selectedVehicleId)) S.selectedVehicleId = null;
  } catch (err) {
    if (err.status === 401) {
      signOut();
      return;
    }
    S.loadError = err;
  }
  renderGarage();
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

function updateAccount() {
  const btn = $("#authBtn");
  const out = $("#logoutBtn");
  if (S.token) {
    btn.textContent = S.email ? S.email.split("@")[0] : "Akun";
    out.hidden = false;
  } else {
    btn.textContent = "Masuk";
    out.hidden = true;
  }
}

function openAuth(mode = "login") {
  const dlg = $("#authDialog");
  const radio = $(`input[name="authmode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  applyAuthMode(mode);
  $("#authError").hidden = true;
  $("#authEmail").value = "";
  $("#authPassword").value = "";
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
  setTimeout(() => $("#authEmail").focus(), 40);
}

function applyAuthMode(mode) {
  const isLogin = mode === "login";
  $("#authTitle").textContent = isLogin ? "Masuk" : "Buat akun";
  $("#authSubmit").textContent = isLogin ? "Masuk" : "Daftar";
  $("#authPassword").autocomplete = isLogin ? "current-password" : "new-password";
  $("#authNote").textContent = isLogin
    ? "Akun dipakai untuk menyimpan garage dan riwayat pengisian."
    : "Password minimal 8 karakter. Disimpan sebagai hash bcrypt, bukan teks biasa.";
}

async function submitAuth(e) {
  e.preventDefault();
  const mode = $('input[name="authmode"]:checked')?.value || "login";
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const err = $("#authError");
  const btn = $("#authSubmit");

  err.hidden = true;
  if (!email || !password) {
    err.textContent = "Email dan password perlu diisi.";
    err.hidden = false;
    return;
  }
  if (mode === "register" && password.length < 8) {
    err.textContent = "Password minimal 8 karakter.";
    err.hidden = false;
    return;
  }

  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = "Memproses…";

  try {
    if (mode === "register") {
      await api("/auth/register", { method: "POST", body: { email, password }, retry: false });
      const login = await api("/auth/login", { method: "POST", body: { email, password }, retry: false });
      applySession(login, email);
      closeAuth();
      toast("Akun dibuat. Kamu sudah masuk.");
      go("garage");
    } else {
      const data = await api("/auth/login", { method: "POST", body: { email, password }, retry: false });
      applySession(data, email);
      closeAuth();
      toast("Masuk. Garage dibuka.");
      go("garage");
    }
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function applySession(data, email) {
  S.token = data.access_token;
  S.refresh = data.refresh_token || null;
  S.email = email;
  localStorage.setItem(LS.token, S.token);
  if (S.refresh) localStorage.setItem(LS.refresh, S.refresh);
  localStorage.setItem(LS.email, email);
  updateAccount();
  loadGarage();
}

function closeAuth() {
  const dlg = $("#authDialog");
  if (typeof dlg.close === "function") dlg.close();
  else dlg.removeAttribute("open");
}

// ---------------------------------------------------------------------------
// navigation + ui chrome
// ---------------------------------------------------------------------------

function go(page) {
  if (page === S.page) return;
  S.page = page;

  $("#page-hitung").hidden = page !== "hitung";
  $("#page-garage").hidden = page !== "garage";

  $$(".tab").forEach((t) => {
    const on = t.dataset.nav === page;
    t.classList.toggle("is-on", on);
    t.setAttribute("aria-selected", String(on));
  });

  const shown = $(`#page-${page}`);
  shown.classList.remove("is-entering");
  void shown.offsetWidth;
  shown.classList.add("is-entering");

  window.scrollTo({ top: 0, behavior: "instant" });
  if (page === "garage") loadGarage();
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 2600);
}

function copySummary() {
  const a = S.a;
  const c = calc(a);
  if (!a || !c || c.cost === null) {
    toast("Belum ada angka untuk disalin.");
    return;
  }
  const lines = [
    `Bengsin — biaya bensin ${vehicleFull(a)}`,
    `${S.city.name} · ${S.distance} km sekali jalan · ${S.dpw} hari/minggu (${c.wd} hari)`,
    `${nf0.format(Math.round(c.km))} km/bulan · ${dec(c.liters)} L · ${prettyFuelName(c.fuel.name)} ${rp(c.fuel.price)}/L`,
    `${rp(c.cost)}/bulan`,
  ];
  if (S.b) {
    const cb = calc(S.b);
    if (cb && cb.cost !== null) {
      lines.push(`Bandingkan ${vehicleFull(S.b)}: ${rp(cb.cost)}/bulan (selisih ${rp(Math.abs(c.cost - cb.cost))})`);
    }
  }
  const text = lines.join("\n");

  const done = () => toast("Ringkasan disalin.");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch { toast("Tidak bisa menyalin. Pilih teksnya manual."); }
  ta.remove();
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function loadReference() {
  try {
    const [cities, presets, prices] = await Promise.all([
      api("/cities", { retry: false }),
      api("/presets", { retry: false }),
      api("/fuel-prices", { retry: false }),
    ]);
    S.cities = cities;
    // Drop EV rows: the engine enum has no ELECTRIC and their "km/L" is a placeholder,
  // so pricing them against petrol would be fiction.
  S.presets = presets.filter((v) => !/electric|listrik/i.test(`${v.trim_variant || ""} ${v.model || ""}`));
    S.prices = prices;
    S.loadError = null;
  } catch (err) {
    S.loadError = err;
  }
}

function restoreSelection(prefs) {
  const preferred = prefs.cityId && S.cities.find((c) => c.id === prefs.cityId);
  S.city = preferred
    || S.cities.find((c) => /jakarta pusat/i.test(c.name))
    || S.cities.find((c) => /jakarta/i.test(c.name))
    || S.cities[0]
    || null;

  if (typeof prefs.distance === "number") S.distance = prefs.distance;
  if (typeof prefs.dpw === "number" && prefs.dpw >= 1 && prefs.dpw <= 7) S.dpw = prefs.dpw;
  if (typeof prefs.wd === "number") S.workdaysOverride = prefs.wd;

  const byId = (id) => S.presets.find((p) => p.id === id) || null;
  S.a = prefs.a ? byId(prefs.a) : null;
  S.b = prefs.b ? byId(prefs.b) : null;

  if (!S.a) {
    S.a = S.presets.find((p) => /avanza/i.test(p.model) && p.vehicle_type.toLowerCase() === "car")
      || S.presets.find((p) => /avanza/i.test(p.model))
      || null;
  }
}

function renderErrorState() {
  const form = $(".form");
  if (!form) return;
  const box = document.createElement("div");
  box.className = "err";
  box.innerHTML = `Data kendaraan dan harga gagal dimuat. ${S.loadError?.message || ""}
    <button class="link" type="button" id="retryBtn">Coba lagi</button>`;
  form.prepend(box);
  $("#retryBtn").addEventListener("click", () => location.reload());
}

function bind() {
  // nav
  $$("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      go(el.dataset.nav);
    });
  });
  $$(".tab").forEach((tab) => {
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = tab.dataset.nav === "hitung" ? $("#tab-garage") : $("#tab-hitung");
      next.focus();
      go(next.dataset.nav);
    });
  });

  $("#authBtn").addEventListener("click", () => {
    if (S.token) go("garage");
    else openAuth("login");
  });
  $("#logoutBtn").addEventListener("click", () => {
    signOut();
    toast("Kamu sudah keluar.");
    go("hitung");
  });
  $("#authClose").addEventListener("click", closeAuth);
  $("#authForm").addEventListener("submit", submitAuth);
  $$('input[name="authmode"]').forEach((r) =>
    r.addEventListener("change", () => applyAuthMode(r.value))
  );
  $$("[data-open-auth]").forEach((b) =>
    b.addEventListener("click", () => openAuth(b.dataset.openAuth))
  );

  // city
  $("#city").addEventListener("change", (e) => {
    S.city = S.cities.find((c) => c.id === e.target.value) || null;
    $("#cityMeta").textContent = S.city ? S.city.name : "belum ada kota";
    renderReadout();
    renderBoard();
    renderFuelOptions();
    renderVehicleList();
    savePrefs();
  });

  // vehicle search + type
  $("#vsearch").addEventListener("input", (e) => {
    S.query = e.target.value;
    renderVehicles();
  });
  $$('input[name="vtype"]').forEach((r) =>
    r.addEventListener("change", () => {
      S.vtype = r.value;
      renderVehicles();
    })
  );
  $("#vlist").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-veh]");
    if (btn) pickVehicle(btn.dataset.veh);
  });

  // slots
  $("#slots").addEventListener("click", (e) => {
    const clear = e.target.closest("[data-clear]");
    if (clear) {
      if (clear.dataset.clear === "a") { S.a = S.b; S.b = null; }
      else S.b = null;
      S.compareMode = false;
      renderAll();
      savePrefs();
      return;
    }
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "compare") {
      S.compareMode = true;
      renderAll();
      $("#vsearch").focus();
    }
    if (action === "cancel-compare") {
      S.compareMode = false;
      renderAll();
    }
  });

  // distance: the road drives the number, the number drives the road
  $("#distance").addEventListener("input", (e) => setDistance(e.target.value, true));
  $("#distanceRange").addEventListener("input", (e) => setDistance(e.target.value));

  // days
  $$('input[name="days"]').forEach((r) =>
    r.addEventListener("change", () => {
      S.workdaysOverride = null;
      $("#workdays").value = "";
      setDays(Number(r.value));
    })
  );
  $("#advBtn").addEventListener("click", () => {
    const adv = $("#adv");
    const open = adv.hidden;
    adv.hidden = !open;
    $("#advBtn").setAttribute("aria-expanded", String(open));
    $("#advBtn").textContent = open ? "Sembunyikan" : "Pakai jumlah hari sendiri";
    if (open) $("#workdays").focus();
  });
  $("#workdays").addEventListener("input", (e) => setWorkdaysOverride(e.target.value));
  $("#advReset").addEventListener("click", () => {
    $("#workdays").value = "";
    setWorkdaysOverride(null);
  });

  // readout sheet (mobile)
  $("#roToggle").addEventListener("click", () => {
    S.roOpen = !S.roOpen;
    $("#readout").classList.toggle("is-open", S.roOpen);
    $("#roToggle").setAttribute("aria-expanded", String(S.roOpen));
    $("#roToggle span").textContent = S.roOpen ? "Tutup" : "Rincian";
    $("#roScrim").hidden = !S.roOpen;
  });
  $("#roScrim").addEventListener("click", () => {
    S.roOpen = false;
    $("#readout").classList.remove("is-open");
    $("#roToggle").setAttribute("aria-expanded", "false");
    $("#roToggle span").textContent = "Rincian";
    $("#roScrim").hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.roOpen) $("#roScrim").click();
  });

  $("#copyBtn").addEventListener("click", copySummary);

  // garage: add vehicle
  $("#addVehicleBtn").addEventListener("click", () => {
    const form = $("#vehicleForm");
    const open = form.hidden;
    form.hidden = !open;
    $("#addVehicleBtn").setAttribute("aria-expanded", String(open));
    $("#addVehicleBtn").textContent = open ? "Tutup" : "Tambah";
    if (open) $("#vNick").focus();
  });
  $("#vehicleCancel").addEventListener("click", () => {
    $("#vehicleForm").hidden = true;
    $("#addVehicleBtn").setAttribute("aria-expanded", "false");
    $("#addVehicleBtn").textContent = "Tambah";
  });
  $("#vType").addEventListener("change", (e) => populateBrands(e.target.value));
  $("#vehicleForm").addEventListener("submit", submitVehicle);

  // garage: expenses
  $("#eVehicle").addEventListener("change", () => {
    renderFuelOptions();
    $("#eCost").value = "";
    $("#eLiters").value = "";
  });
  $("#eFuel").addEventListener("change", syncLitersFromCost);
  $("#eCost").addEventListener("input", syncLitersFromCost);
  $("#eLiters").addEventListener("input", syncCostFromLiters);
  $("#expenseForm").addEventListener("submit", submitExpense);
  $("#eCost").addEventListener("input", maybeFillLiters);
  $("#eFuel").addEventListener("change", () => { S.litersManual = false; updateExpenseHint(); maybeFillLiters(); });
  $("#eLiters").addEventListener("input", () => { S.litersManual = $("#eLiters").value !== ""; });
  $("#eVehicle").addEventListener("change", () => { renderFuelOptions(); });

  // garage: list interactions
  $("#vehicleList").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-veh-del]");
    if (del) { S.confirmDelete = Number(del.dataset.vehDel); renderVehicleList(); return; }
    if (e.target.closest("[data-veh-del-no]")) { S.confirmDelete = null; renderVehicleList(); return; }
    const yes = e.target.closest("[data-veh-del-yes]");
    if (yes) { await deleteVehicle(Number(yes.dataset.vehDelYes)); return; }

    const sel = e.target.closest("[data-veh-select]");
    if (sel) {
      const id = Number(sel.dataset.vehSelect);
      S.selectedVehicleId = S.selectedVehicleId === id ? null : id;
      renderVehicleList();
      renderExpenseList();
    }
  });

  $("#expenseList").addEventListener("click", async (e) => {
    const clear = e.target.closest("[data-clear-filter]");
    if (clear) { S.selectedVehicleId = null; renderVehicleList(); renderExpenseList(); return; }
    const del = e.target.closest("[data-exp-del]");
    if (del) await deleteExpense(Number(del.dataset.expDel));
  });
}

async function populateBrands(type) {
  const sel = $("#vBrand");
  sel.innerHTML = `<option value="">Memuat…</option>`;
  try {
    const brands = await api(type === "Motorcycle" ? "/motorbike-brands" : "/car-brands", { retry: false });
    sel.innerHTML = `<option value="">Pilih merek</option>` +
      brands.map((b) => `<option value="${b.name}">${b.name}</option>`).join("");
  } catch {
    sel.innerHTML = `<option value="">Gagal memuat merek</option>`;
  }
}

async function submitVehicle(e) {
  e.preventDefault();
  const err = $("#vehicleError");
  const btn = $("#vehicleSubmit");
  err.hidden = true;

  const payload = {
    nickname: $("#vNick").value.trim(),
    vehicle_type: $("#vType").value,
    brand: $("#vBrand").value,
    model: $("#vModel").value.trim(),
    engine_type: $("#vEngine").value,
    min_octane: Number($("#vOctane").value),
    kmpl: Number($("#vKmpl").value),
  };

  if (!payload.nickname || !payload.brand || !payload.model) {
    err.textContent = "Nama panggilan, merek, dan model perlu diisi.";
    err.hidden = false;
    return;
  }
  if (!payload.min_octane || !payload.kmpl) {
    err.textContent = "Oktan minimum dan konsumsi (km/L) perlu diisi.";
    err.hidden = false;
    return;
  }

  btn.disabled = true;
  try {
    await api("/garage/", { method: "POST", body: payload });
    $("#vehicleForm").reset();
    $("#vehicleForm").hidden = true;
    $("#addVehicleBtn").textContent = "Tambah";
    $("#addVehicleBtn").setAttribute("aria-expanded", "false");
    await loadGarage();
    toast("Kendaraan disimpan.");
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function deleteVehicle(id) {
  try {
    await api(`/garage/${id}`, { method: "DELETE" });
    S.confirmDelete = null;
    if (S.selectedVehicleId === id) S.selectedVehicleId = null;
    await loadGarage();
    toast("Kendaraan dihapus.");
  } catch (ex) {
    toast(ex.message);
  }
}

async function submitExpense(e) {
  e.preventDefault();
  const err = $("#expenseError");
  const btn = $("#expenseSubmit");
  err.hidden = true;

  maybeFillLiters();
  const payload = {
    vehicle_id: Number($("#eVehicle").value),
    volume: Number($("#eLiters").value),
    cost: Number($("#eCost").value),
  };

  if (!payload.vehicle_id) {
    err.textContent = "Pilih kendaraan dulu.";
    err.hidden = false;
    return;
  }
  if (!payload.volume || !payload.cost) {
    err.textContent = "Total bayar dan liter perlu diisi. Pilih BBM supaya liternya bisa dihitung.";
    err.hidden = false;
    return;
  }

  btn.disabled = true;
  try {
    await api("/expenses/", { method: "POST", body: payload });
    $("#expenseForm").reset();
    await loadGarage();
    toast("Catatan pengisian tersimpan.");
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function deleteExpense(id) {
  try {
    await api(`/expenses/${id}`, { method: "DELETE" });
    await loadGarage();
    toast("Catatan dihapus.");
  } catch (ex) {
    toast(ex.message);
  }
}

function skeletonRows(n = 4) {
  return Array.from({ length: n }, () =>
    `<li class="skel" aria-hidden="true"><span></span><span></span></li>`).join("");
}

async function boot() {
  bind();

  const prefs = loadPrefs();
  $("#vlist").innerHTML = skeletonRows();
  $("#vlist").setAttribute("aria-busy", "true");
  await loadReference();
  $("#vlist").removeAttribute("aria-busy");

  if (S.loadError) {
    renderErrorState();
    $("#cityMeta").textContent = "gagal dimuat";
    $("#vMeta").textContent = "gagal dimuat";
    updateAccount();
    return;
  }

  restoreSelection(prefs);
  renderCitySelect();
  $("#distance").value = S.distance;
  $$('input[name="days"]').forEach((r) => { r.checked = Number(r.value) === S.dpw; });
  $("#daysMeta").textContent = `${monthWorkdays()} hari/bulan`;
  if (S.workdaysOverride) {
    $("#workdays").value = S.workdaysOverride;
    $("#adv").hidden = false;
    $("#advBtn").setAttribute("aria-expanded", "true");
    $("#advBtn").textContent = "Sembunyikan";
  }
  $("#cityMeta").textContent = S.city ? "memuat harga…" : "belum ada kota";

  renderAll();
  setDistance(S.distance);
  updateAccount();
  renderGarage();

  if (S.token) {
    try {
      const me = await api("/auth/me");
      S.email = me.email;
      localStorage.setItem(LS.email, S.email);
      updateAccount();
    } catch (err) {
      if (err.status === 401) signOut();
    }
    loadGarage();
  }
}

document.addEventListener("DOMContentLoaded", boot);
