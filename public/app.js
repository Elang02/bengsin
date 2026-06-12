// Bengsin App — State Management, API, Comparison (Public), Garage (Login), Auth
const $ = (id) => document.getElementById(id);

// ============================================================
// STATE & CONFIG
// ============================================================
const state = {
  token: localStorage.getItem("token") || null,
  user: null,
  currentPage: "comparison", // 'comparison' | 'garage'
  
  // Comparison page
  cities: [],
  presets: [],
  fuelPrices: [],
  selectedCity: null,
  selectedVehicleA: null,
  selectedVehicleB: null,
  
  // Garage page
  vehicles: [],
  expenses: [],
};

// Backend API URL - monolithic deployment (same server)
const API_BASE = window.location.origin;

// ============================================================
// API HELPERS
// ============================================================
async function api(endpoint, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
  
  const res = await fetch(API_BASE + endpoint, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(page) {
  state.currentPage = page;
  $("comparisonPage").classList.toggle("hidden", page !== "comparison");
  $("garagePage").classList.toggle("hidden", page !== "garage");
  
  // Update nav
  document.querySelectorAll(".nav-link").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });
  
  if (page === "comparison") loadComparisonData();
  if (page === "garage") {
    if (!state.token) {
      alert("Silakan login terlebih dahulu untuk mengakses Garage");
      showPage("comparison");
    } else {
      loadGarageData();
    }
  }
}

function updateNav() {
  const btn = $("authBtn");
  if (state.token && state.user) {
    btn.textContent = state.user.email.split("@")[0];
    btn.onclick = logout;
  } else {
    btn.textContent = "Login";
    btn.onclick = () => showAuthModal("login");
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("token");
  updateNav();
  showPage("comparison");
}

// ============================================================
// AUTH MODAL
// ============================================================
function showAuthModal(mode = "login") {
  $("authMode").value = mode;
  $("authModalTitle").textContent = mode === "login" ? "Login" : "Register";
  $("authSubmitBtn").textContent = mode === "login" ? "Login" : "Register";
  $("authToggle").innerHTML = mode === "login" 
    ? 'Belum punya akun? <a href="#" id="authToggleLink">Register</a>'
    : 'Sudah punya akun? <a href="#" id="authToggleLink">Login</a>';
  
  $("authModal").classList.remove("hidden");
  $("authEmail").value = "";
  $("authPassword").value = "";
  $("authError").classList.add("hidden");
  
  // Re-bind toggle
  setTimeout(() => {
    $("authToggleLink").onclick = (e) => {
      e.preventDefault();
      showAuthModal(mode === "login" ? "register" : "login");
    };
  }, 0);
}

function closeAuthModal() {
  $("authModal").classList.add("hidden");
}

async function handleAuth(e) {
  e.preventDefault();
  const mode = $("authMode").value;
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  
  $("authError").classList.add("hidden");
  $("authSubmitBtn").disabled = true;
  
  try {
    if (mode === "register") {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      alert("Registrasi berhasil! Silakan login.");
      showAuthModal("login");
    } else {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      state.token = data.access_token;
      state.user = { email };
      localStorage.setItem("token", state.token);
      closeAuthModal();
      updateNav();
      showPage("garage");
    }
  } catch (err) {
    $("authError").textContent = err.message;
    $("authError").classList.remove("hidden");
  } finally {
    $("authSubmitBtn").disabled = false;
  }
}

// ============================================================
// COMPARISON PAGE (PUBLIC)
// ============================================================
async function loadComparisonData() {
  try {
    const [cities, presets, prices] = await Promise.all([
      api("/cities"),
      api("/presets"),
      api("/fuel-prices"),
    ]);
    
    state.cities = cities;
    state.presets = presets;
    state.fuelPrices = prices;
    
    renderCityDropdown();
    
    // Show default vehicles in search
    renderSearchResults();
    
    // Set Jakarta as default
    const jakarta = cities.find(c => c.name.toLowerCase().includes('jakarta'));
    if (jakarta) {
      const citySelect = $("citySelect");
      citySelect.value = jakarta.id;
      citySelect.dispatchEvent(new Event('change'));
    }
    
    // Set Avanza as default vehicle (delayed to allow city to load)
    setTimeout(() => {
      const avanza = presets.find(p => p.model.toLowerCase().includes('avanza'));
      if (avanza) {
        selectVehicleForEstimate(avanza.id);
      }
    }, 300);
  } catch (err) {
    console.error("Load comparison data failed:", err);
  }
}

function renderCityDropdown() {
  const sel = $("citySelect");
  sel.innerHTML = '<option value="">Pilih Kota</option>';
  state.cities.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  
  sel.onchange = () => {
    state.selectedCity = state.cities.find(c => c.id === sel.value);
    renderFuelPrices();
  };
}

function renderFuelPrices() {
  const container = $("fuelPricesContainer");
  if (!state.selectedCity) {
    container.classList.add("hidden");
    return;
  }
  
  const prices = state.fuelPrices.filter(p => p.city_id === state.selectedCity.id);
  if (prices.length === 0) {
    container.innerHTML = "<p>Tidak ada data harga BBM untuk kota ini.</p>";
    container.classList.remove("hidden");
    return;
  }
  
  // Group by brand
  const byBrand = {};
  prices.forEach(p => {
    if (!byBrand[p.brand]) byBrand[p.brand] = [];
    byBrand[p.brand].push(p);
  });
  
  container.innerHTML = `
    <h3 class="text-lg font-semibold mb-3">Harga BBM di ${state.selectedCity.name}</h3>
    ${Object.entries(byBrand).map(([brand, items]) => `
      <div class="mb-4">
        <h4 class="font-semibold text-sm mb-2 opacity-80">${brand}</h4>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
          ${items.map(p => `
            <div class="card-sm">
              <div class="text-sm font-semibold">${p.name}</div>
              <div class="text-xs opacity-70">${p.fuel_type} • ${p.octane_rating} oktan</div>
              <div class="text-base font-bold mt-1">Rp ${Math.round(p.price).toLocaleString()}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;
  container.classList.remove("hidden");
}

function renderSearchResults() {
  const query = $("vehicleSearch").value.toLowerCase().trim();
  const container = $("searchResults");
  
  let filtered;
  
  if (!query) {
    // Show first 5 presets when empty
    filtered = state.presets.slice(0, 5);
  } else {
    // Filter presets by query (brand, model, vehicle_type)
    filtered = state.presets.filter(p => 
      p.brand.toLowerCase().includes(query) ||
      p.model.toLowerCase().includes(query) ||
      p.vehicle_type.toLowerCase().includes(query) ||
      (p.vehicle_type === 'Car' && 'mobil'.includes(query)) ||
      (p.vehicle_type === 'Motorcycle' && 'motor'.includes(query))
    ).slice(0, 5); // Max 5 results
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-sm opacity-60">Tidak ada kendaraan yang cocok.</p>';
    return;
  }
  
  container.innerHTML = filtered.map(p => `
    <div class="card-sm cursor-pointer hover:bg-gray-50" onclick="selectVehicleForEstimate('${p.id}')">
      <div class="flex justify-between items-center">
        <div>
          <div class="text-sm font-semibold">${p.brand} ${p.model}</div>
          <div class="text-xs opacity-70">${p.vehicle_type === 'Car' ? 'Mobil' : 'Motor'} • ${p.kmpl} km/L • Min. ${p.min_octane} oktan</div>
        </div>
        <div class="text-xs opacity-60">→</div>
      </div>
    </div>
  `).join("");
}

function selectVehicle(presetId) {
  const preset = state.presets.find(p => p.id === presetId);
  if (!preset) return;
  
  if (!state.selectedVehicleA) {
    state.selectedVehicleA = preset;
    renderComparison();
  } else if (!state.selectedVehicleB) {
    state.selectedVehicleB = preset;
    renderComparison();
  }
}

function selectVehicleForEstimate(presetId) {
  const preset = state.presets.find(p => p.id === presetId);
  if (!preset) return;
  
  // Check if we're selecting for comparison (second vehicle)
  if (window.isSelectingForComparison) {
    state.selectedVehicleB = preset;
    window.isSelectingForComparison = false;
    renderComparison();
  } else {
    // First vehicle selection
    state.selectedVehicleA = preset;
    state.selectedVehicleB = null;
    // Hide vehicle picker so user can focus on trip params
    const picker = $("vehiclePickerSection");
    if (picker) picker.classList.add("hidden");
    renderSingleVehicleCost();
  }
}

function renderSingleVehicleCost() {
  const container = $("singleVehicleCost");
  const v = state.selectedVehicleA;
  
  if (!v || !state.selectedCity) {
    container.classList.add("hidden");
    return;
  }
  
  // Calculate cost
  const distance = parseFloat($("distanceInput").value) || 10;
  const daysPerWeek = parseInt($("daysPerWeekInput").value) || 5;
  const workdaysMonthInput = $("workdaysMonthInput").value;
  const workdaysMonth = workdaysMonthInput ? parseInt(workdaysMonthInput) : Math.ceil(30 * daysPerWeek / 7);
  
  const roundTrip = 2; // Always round trip
  const monthlyKm = distance * roundTrip * workdaysMonth;
  const monthlyLiters = monthlyKm / v.kmpl;
  
  // Find cheapest fuel that matches engine type and meets octane requirement
  const suitableFuels = state.fuelPrices.filter(f => 
    f.city_id === state.selectedCity.id &&
    fuelMatchesVehicle(f, v)
  );
  
  if (suitableFuels.length === 0) {
    container.innerHTML = `<p class="text-sm opacity-60">Tidak ada BBM yang cocok untuk kendaraan ini di ${state.selectedCity.name}.</p>`;
    container.classList.remove("hidden");
    return;
  }
  
  const cheapestFuel = suitableFuels.sort((a, b) => a.price - b.price)[0];
  const monthlyCost = monthlyLiters * cheapestFuel.price;
  
  container.innerHTML = `
    <div style="background: white; padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem;">
      <h3 class="text-lg font-semibold mb-3">Estimasi Biaya</h3>
      <div class="card-sm mb-4" style="border-left: 4px solid var(--accent);">
        <div class="text-sm opacity-70">${v.brand}</div>
        <div class="text-xl font-bold">${v.model}</div>
        <div class="text-xs opacity-60 mt-1">${v.vehicle_type === 'Car' ? 'Mobil' : 'Motor'} • ${v.kmpl} km/L • Min. ${v.min_octane} oktan</div>
      </div>
      
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="card-sm">
          <div class="text-xs opacity-70">Jarak Bulanan</div>
          <div class="text-lg font-bold">${monthlyKm.toFixed(0)} km</div>
        </div>
        <div class="card-sm">
          <div class="text-xs opacity-70">Konsumsi BBM</div>
          <div class="text-lg font-bold">${monthlyLiters.toFixed(1)} L</div>
        </div>
      </div>
      
      <div class="card-sm mb-4" style="background: #8B1538; color: white;">
        <div class="text-sm opacity-90">Biaya BBM per Bulan</div>
        <div class="text-2xl font-bold">Rp ${Math.round(monthlyCost).toLocaleString()}</div>
        <div class="text-xs opacity-80 mt-1">Menggunakan ${cheapestFuel.name} (Rp ${Math.round(cheapestFuel.price).toLocaleString()}/L)</div>
      </div>
      
      <button onclick="startComparison()" class="btn-primary w-full">
        Bandingkan dengan Kendaraan Lain
      </button>
      <button onclick="resetComparison()" class="btn-secondary w-full mt-2">
        Ganti Kendaraan
      </button>
    </div>
  `;
  
  container.classList.remove("hidden");
  $("comparisonResult").classList.add("hidden");
}

function startComparison() {
  // Show 2-column layout: left = locked vehicle A, right = search for vehicle B
  const container = $("singleVehicleCost");
  const v = state.selectedVehicleA;
  
  if (!v || !state.selectedCity) return;
  
  // Calculate cost for vehicle A
  const distance = parseFloat($("distanceInput").value) || 10;
  const daysPerWeek = parseInt($("daysPerWeekInput").value) || 5;
  const workdaysMonthInput = $("workdaysMonthInput").value;
  const workdaysMonth = workdaysMonthInput ? parseInt(workdaysMonthInput) : Math.ceil(30 * daysPerWeek / 7);
  const roundTrip = 2;
  const monthlyKm = distance * roundTrip * workdaysMonth;
  const monthlyLiters = monthlyKm / v.kmpl;
  
  const suitableFuels = state.fuelPrices.filter(f => 
    f.city_id === state.selectedCity.id &&
    fuelMatchesVehicle(f, v)
  );
  
  if (suitableFuels.length === 0) return;
  
  const cheapestFuel = suitableFuels.sort((a, b) => a.price - b.price)[0];
  const monthlyCost = monthlyLiters * cheapestFuel.price;
  
  container.innerHTML = `
    <div style="background: white; padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem;">
      <h3 class="text-lg font-semibold mb-3">Bandingkan Kendaraan</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Left: Locked Vehicle A -->
        <div>
          <h4 class="text-sm font-semibold mb-2 opacity-70">Kendaraan Pertama</h4>
          <div class="card-sm" style="border-left: 4px solid var(--accent);">
            <div class="text-sm opacity-70">${v.brand}</div>
            <div class="text-xl font-bold mb-2">${v.model}</div>
            <div class="text-xs opacity-60 mb-3">${v.kmpl} km/L • Min. ${v.min_octane} oktan</div>
            <div class="text-sm opacity-70 mb-1">Biaya per Bulan</div>
            <div class="text-2xl font-bold text-primary">Rp ${Math.round(monthlyCost).toLocaleString()}</div>
            <div class="text-xs opacity-60 mt-2">${monthlyLiters.toFixed(1)}L ${cheapestFuel.name}</div>
          </div>
        </div>
        
        <!-- Right: Search for Vehicle B -->
        <div>
          <h4 class="text-sm font-semibold mb-2 opacity-70">Pilih Kendaraan Kedua</h4>
          <input 
            type="text" 
            id="comparisonSearch" 
            class="input mb-3" 
            placeholder="Cari kendaraan kedua..."
            style="width: 100%;"
          />
          <div id="comparisonSearchResults" class="space-y-2"></div>
        </div>
      </div>
      
      <button onclick="cancelComparison()" class="btn-secondary w-full mt-4">
        Batal
      </button>
    </div>
  `;
  
  container.classList.remove("hidden");
  $("comparisonResult").classList.add("hidden");
  
  // Wire up search for vehicle B
  $("comparisonSearch").addEventListener("input", renderComparisonSearch);
  $("comparisonSearch").focus();
  
  // Show default vehicles immediately
  renderComparisonSearch();
  
  // Set flag for comparison mode
  window.isSelectingForComparison = true;
}

function renderComparisonSearch() {
  const query = $("comparisonSearch").value.toLowerCase().trim();
  const container = $("comparisonSearchResults");
  
  let filtered;
  
  if (!query) {
    // Show first 5 presets when empty
    filtered = state.presets.slice(0, 5);
  } else {
    filtered = state.presets.filter(p => 
      p.brand.toLowerCase().includes(query) ||
      p.model.toLowerCase().includes(query) ||
      p.vehicle_type.toLowerCase().includes(query) ||
      (p.vehicle_type === 'Car' && 'mobil'.includes(query)) ||
      (p.vehicle_type === 'Motorcycle' && 'motor'.includes(query))
    ).slice(0, 5);
  }
  
  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-sm opacity-60">Tidak ada kendaraan yang cocok.</p>';
    return;
  }
  
  container.innerHTML = filtered.map(p => `
    <div class="card-sm cursor-pointer hover:bg-gray-50" onclick="selectVehicleForEstimate('${p.id}')">
      <div class="text-sm font-semibold">${p.brand} ${p.model}</div>
      <div class="text-xs opacity-70">${p.vehicle_type === 'Car' ? 'Mobil' : 'Motor'} • ${p.kmpl} km/L • Min. ${p.min_octane} oktan</div>
    </div>
  `).join("");
}

function cancelComparison() {
  // Return to single vehicle view
  state.selectedVehicleB = null;
  window.isSelectingForComparison = false;
  renderSingleVehicleCost();
}

function resetComparison() {
  state.selectedVehicleA = null;
  state.selectedVehicleB = null;
  window.isSelectingForComparison = false;
  $("comparisonResult").classList.add("hidden");
  $("singleVehicleCost").classList.add("hidden");
  // Show vehicle picker again
  const picker = $("vehiclePickerSection");
  if (picker) picker.classList.remove("hidden");
  $("vehicleSearch").value = "";
  renderSearchResults();
  $("vehicleSearch").focus();
}

function highlightCard(presetId, slot) {
  const card = $("presetGrid").querySelector(`[data-id="${presetId}"]`);
  if (!card) return;
  card.classList.add(slot === "A" ? "selected-a" : "selected-b");
}

function clearHighlights() {
  $("presetGrid").querySelectorAll(".preset-card").forEach(c => {
    c.classList.remove("selected-a", "selected-b");
  });
}

function renderComparison() {
  const result = $("comparisonResult");
  const a = state.selectedVehicleA;
  const b = state.selectedVehicleB;
  
  if (!a || !b || !state.selectedCity) {
    result.classList.add("hidden");
    return;
  }
  
  // Calculate costs
  const distance = parseFloat($("distanceInput").value) || 10;
  const daysPerWeek = parseInt($("daysPerWeekInput").value) || 5;
  const workdaysMonthInput = $("workdaysMonthInput").value;
  const workdaysMonth = workdaysMonthInput ? parseInt(workdaysMonthInput) : Math.ceil(30 * daysPerWeek / 7);
  
  const roundTrip = 2;
  const monthlyKm = distance * roundTrip * workdaysMonth;
  
  const calculateCost = (v) => {
    const monthlyLiters = monthlyKm / v.kmpl;
    const suitableFuels = state.fuelPrices.filter(f => 
      f.city_id === state.selectedCity.id &&
      fuelMatchesVehicle(f, v)
    );
    if (suitableFuels.length === 0) return null;
    const cheapestFuel = suitableFuels.sort((a, b) => a.price - b.price)[0];
    return {
      liters: monthlyLiters,
      fuel: cheapestFuel,
      cost: monthlyLiters * cheapestFuel.price
    };
  };
  
  const costA = calculateCost(a);
  const costB = calculateCost(b);
  
  if (!costA || !costB) {
    result.innerHTML = "<p class='text-sm opacity-60'>Tidak ada BBM yang cocok untuk salah satu kendaraan.</p>";
    result.classList.remove("hidden");
    return;
  }
  
  const cheaper = costA.cost < costB.cost ? 'A' : 'B';
  const savings = Math.abs(costA.cost - costB.cost);
  const savingsPercent = ((savings / Math.max(costA.cost, costB.cost)) * 100).toFixed(1);
  
  result.innerHTML = `
    <div style="background: white; padding: 1.5rem; border-radius: 0.75rem;">
      <h3 class="text-lg font-semibold mb-4">Hasil Perbandingan</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div class="card-sm ${cheaper === 'A' ? 'border-2 border-green-500' : ''}">
          <div class="text-sm opacity-70">${a.brand}</div>
          <div class="text-xl font-bold mb-2">${a.model}</div>
          <div class="text-xs opacity-60 mb-3">${a.kmpl} km/L • Min. ${a.min_octane} oktan</div>
          <div class="text-sm opacity-70 mb-1">Biaya per Bulan</div>
          <div class="text-2xl font-bold text-primary">Rp ${Math.round(costA.cost).toLocaleString()}</div>
          <div class="text-xs opacity-60 mt-2">${costA.liters.toFixed(1)}L ${costA.fuel.name}</div>
        </div>
        
        <div class="card-sm ${cheaper === 'B' ? 'border-2 border-green-500' : ''}">
          <div class="text-sm opacity-70">${b.brand}</div>
          <div class="text-xl font-bold mb-2">${b.model}</div>
          <div class="text-xs opacity-60 mb-3">${b.kmpl} km/L • Min. ${b.min_octane} oktan</div>
          <div class="text-sm opacity-70 mb-1">Biaya per Bulan</div>
          <div class="text-2xl font-bold text-primary">Rp ${Math.round(costB.cost).toLocaleString()}</div>
          <div class="text-xs opacity-60 mt-2">${costB.liters.toFixed(1)}L ${costB.fuel.name}</div>
        </div>
      </div>
      
      <div class="card-sm" style="background: var(--accent-light); border-left: 4px solid var(--accent);">
        <div class="font-semibold">
          ${cheaper === 'A' ? a.brand + ' ' + a.model : b.brand + ' ' + b.model} lebih hemat ${savingsPercent}%
        </div>
        <div class="text-sm opacity-70 mt-1">
          Penghematan: Rp ${Math.round(savings).toLocaleString()} per bulan
        </div>
      </div>
      
      <button onclick="resetComparison()" class="btn-secondary w-full mt-4">
        Bandingkan Kendaraan Lain
      </button>
    </div>
  `;
  
  result.classList.remove("hidden");
  $("singleVehicleCost").classList.add("hidden");
}

function fuelMatchesVehicle(f, v) {
  // Diesel cars use diesel fuel only; gasoline/hybrid use gasoline gated by octane.
  const engine = (v.engine_type || "GASOLINE").toUpperCase();
  if (engine === "DIESEL") return f.fuel_type === "diesel";
  if (engine === "ELECTRIC") return false; // no liquid fuel
  return f.fuel_type === "gasoline" && f.octane_rating >= v.min_octane;
}

function getFuelPrice(octane) {
  if (!state.selectedCity) return octane === 92 ? 7650 : 10000; // default
  
  // Map octane to fuel type
  const fuelType = octane === 90 ? "Pertalite" : octane === 92 ? "Pertamax" : "Pertamax Turbo";
  const price = state.fuelPrices.find(p => 
    p.city_id === state.selectedCity.id && p.fuel_type === fuelType
  );
  
  return price ? price.price : (octane === 92 ? 10000 : 13000);
}

// ============================================================
// GARAGE PAGE (AUTHENTICATED)
// ============================================================
async function loadGarageData() {
  try {
    const [vehicles, expenses] = await Promise.all([
      api("/garage/"),
      api("/expenses/"),
    ]);
    state.vehicles = vehicles;
    state.expenses = expenses;
    
    renderVehicleList();
    populateVehicleDropdown();
    
    // Set expense date to today
    const today = new Date().toISOString().split('T')[0];
    const dateField = $("eDate");
    if (dateField) dateField.value = today;
    
    // Populate fuel dropdown when vehicle selected
    populateFuelDropdown();
    
    renderExpenseList();
  } catch (err) {
    console.error("Load garage failed:", err);
    if (err.message.includes("401") || err.message.includes("403")) {
      logout();
    }
  }
}

function renderVehicleList() {
  const list = $("vehicleList");
  if (state.vehicles.length === 0) {
    list.innerHTML = '<p class="opacity-60">Belum ada kendaraan. Tambahkan kendaraan pertama Anda!</p>';
    return;
  }
  
  list.innerHTML = state.vehicles.map(v => {
    const isSelected = state.selectedVehicleId === v.id;
    const borderStyle = isSelected ? 'border: 2px solid #8B1538;' : 'border: 1px solid #e5e7eb;';
    const bgStyle = isSelected ? 'background: #fff5f7;' : 'background: white;';
    
    return `
    <div class="card-sm" style="${borderStyle} ${bgStyle} cursor: pointer; transition: all 0.2s;" 
         onclick="selectVehicleForHistory('${v.id}')">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-semibold">${v.nickname}</div>
          <div class="text-sm opacity-70">${v.brand} ${v.model}</div>
          <div class="text-xs opacity-60 mt-1">${v.engine_type} • Min. ${v.min_octane} oktan</div>
        </div>
        <button class="btn-icon" onclick="event.stopPropagation(); deleteVehicle('${v.id}');" title="Hapus">🗑️</button>
      </div>
    </div>
  `;
  }).join("");
}

function populateVehicleDropdown() {
  const select = $("eVehicle");
  if (!select) return;
  
  if (state.vehicles.length === 0) {
    select.innerHTML = '<option value="">Belum ada kendaraan</option>';
    select.disabled = true;
    return;
  }
  
  select.disabled = false;
  select.innerHTML = state.vehicles.map(v => 
    `<option value="${v.id}">${v.nickname} (${v.brand} ${v.model})</option>`
  ).join("");
}

function populateFuelDropdown() {
  const vehicleSelect = $("eVehicle");
  const fuelSelect = $("eFuelType");
  if (!vehicleSelect || !fuelSelect) return;
  
  const vehicleId = parseInt(vehicleSelect.value);
  if (!vehicleId) {
    fuelSelect.innerHTML = '<option value="">Pilih kendaraan dulu</option>';
    fuelSelect.disabled = true;
    return;
  }
  
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  // Filter fuel prices by engine type / octane and current city
  // Fallback: if no city selected yet (e.g. opened garage first), pick a real default
  let cityObj = state.selectedCity;
  if (!cityObj && state.cities && state.cities.length) {
    cityObj = state.cities.find(c => c.name.toLowerCase().includes('jakarta')) || state.cities[0];
  }
  const currentCityName = cityObj?.name || 'Jakarta';
  const currentCityId = cityObj?.id || (state.fuelPrices[0] && state.fuelPrices[0].city_id);
  const compatibleFuels = state.fuelPrices.filter(f => 
    fuelMatchesVehicle(f, vehicle) &&
    f.city_id === currentCityId
  );
  
  if (compatibleFuels.length === 0) {
    fuelSelect.innerHTML = '<option value="">Tidak ada BBM tersedia</option>';
    fuelSelect.disabled = true;
    return;
  }
  
  fuelSelect.disabled = false;
  fuelSelect.innerHTML = '<option value="">Pilih BBM</option>' + 
    compatibleFuels.map(f => 
      `<option value="${f.id}">${f.name} (RON ${f.octane_rating}) - Rp ${f.price.toLocaleString()}/L</option>`
    ).join("");
}

function selectVehicleForHistory(vehicleId) {
  state.selectedVehicleId = parseInt(vehicleId);
  renderVehicleList();
  renderExpenseList();
}

function clearVehicleFilter() {
  state.selectedVehicleId = null;
  renderVehicleList();
  renderExpenseList();
}

function autoCalculateCost() {
  const fuelSelect = $("eFuelType");
  const litersInput = $("eLiters");
  const costInput = $("eCost");
  
  if (!fuelSelect || !litersInput || !costInput) return;
  
  const fuelPriceId = parseInt(fuelSelect.value);
  const liters = parseFloat(litersInput.value);
  
  if (!fuelPriceId || !liters || isNaN(liters)) return;
  
  // Find fuel price
  const fuelPrice = state.fuelPrices.find(f => f.id === fuelPriceId);
  if (!fuelPrice) return;
  
  // Calculate total cost
  const totalCost = Math.round(liters * fuelPrice.price);
  costInput.value = totalCost;
}

function autoCalculateLiters() {
  const fuelSelect = $("eFuelType");
  const litersInput = $("eLiters");
  const costInput = $("eCost");
  
  if (!fuelSelect || !litersInput || !costInput) return;
  
  const fuelPriceId = parseInt(fuelSelect.value);
  const cost = parseFloat(costInput.value);
  
  if (!fuelPriceId || !cost || isNaN(cost)) return;
  
  // Find fuel price
  const fuelPrice = state.fuelPrices.find(f => f.id === fuelPriceId);
  if (!fuelPrice || !fuelPrice.price) return;
  
  // Convert money spent -> liters (people refuel by Rupiah, not liters)
  const liters = cost / fuelPrice.price;
  litersInput.value = liters.toFixed(2);
}

function renderExpenseList() {
  const list = $("expenseList");
  if (state.expenses.length === 0) {
    list.innerHTML = '<p class="opacity-60">Belum ada pencatatan.</p>';
    return;
  }
  
  // Filter by selected vehicle if any
  const filtered = state.selectedVehicleId 
    ? state.expenses.filter(e => e.vehicle_id === state.selectedVehicleId)
    : state.expenses;
  
  // Build header with filter info (always show if vehicle selected)
  let header = '';
  if (state.selectedVehicleId) {
    const selectedVehicle = state.vehicles.find(v => v.id === state.selectedVehicleId);
    header = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">';
    header += `<div class="text-sm opacity-70">Menampilkan: <strong>${selectedVehicle?.nickname || 'Kendaraan'}</strong></div>`;
    header += '<button onclick="clearVehicleFilter()" class="btn-secondary" style="padding: 0.25rem 0.75rem; font-size: 0.875rem;">Tampilkan Semua</button>';
    header += '</div>';
  }
  
  // If no expenses for this vehicle, show message but keep header
  if (filtered.length === 0) {
    const selectedVehicle = state.vehicles.find(v => v.id === state.selectedVehicleId);
    list.innerHTML = header + `<p class="opacity-60">Belum ada pencatatan untuk ${selectedVehicle?.nickname || 'kendaraan ini'}.</p>`;
    return;
  }
  
  // Group by month
  const grouped = {};
  filtered.forEach(e => {
    const month = e.log_date.substring(0, 7); // YYYY-MM
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(e);
  });
  
  // Add "show all" option to header if not already present
  if (!state.selectedVehicleId) {
    header = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">';
    header += '<div class="text-sm opacity-70">Menampilkan semua kendaraan</div>';
    header += '</div>';
  }
  
  list.innerHTML = header + Object.entries(grouped)
    .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    .map(([month, items]) => {
      const total = items.reduce((sum, e) => sum + parseFloat(e.cost), 0);
      const monthName = new Date(month + "-01").toLocaleDateString("id-ID", { year: "numeric", month: "long" });
      
      return `
        <div class="mb-4">
          <h4 class="font-semibold mb-2">${monthName} — Total: Rp ${total.toLocaleString()} (${items.length}x pengisian)</h4>
          <div class="space-y-2">
            ${items.map(e => {
              const v = state.vehicles.find(veh => veh.id === e.vehicle_id);
              const vName = v ? v.nickname : "Kendaraan";
              const date = new Date(e.log_date).toLocaleDateString("id-ID");
              const pricePerL = (parseFloat(e.cost) / parseFloat(e.volume)).toFixed(0);
              
              return `
                <div class="card-sm flex justify-between items-center">
                  <div>
                    <div class="text-sm font-semibold">${vName}</div>
                    <div class="text-xs opacity-70">${date} • ${e.volume}L @ Rp ${pricePerL}/L</div>
                  </div>
                  <div class="text-right">
                    <div class="font-bold">Rp ${parseFloat(e.cost).toLocaleString()}</div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }).join("");
}

async function handleVehicleSubmit(e) {
  e.preventDefault();
  const payload = {
    nickname: $("vNickname").value.trim(),
    vehicle_type: $("vType").value,
    brand: $("vBrand").value,
    model: $("vModel").value.trim(),
    engine_type: $("vEngine").value,
    min_octane: parseInt($("vOctane").value),
    kmpl: parseFloat($("vKmpl").value),
  };
  
  $("vehicleError").classList.add("hidden");
  const btn = $("vehicleSubmitBtn");
  btn.disabled = true;
  
  try {
    await api("/garage/", { method: "POST", body: JSON.stringify(payload) });
    $("vehicleForm").reset();
    await loadGarageData();
  } catch (err) {
    $("vehicleError").textContent = err.message;
    $("vehicleError").classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}

async function deleteVehicle(id) {
  if (!confirm("Yakin hapus kendaraan ini?")) return;
  try {
    await api(`/garage/${id}`, { method: "DELETE" });
    await loadGarageData();
  } catch (err) {
    alert("Gagal hapus: " + err.message);
  }
}

async function handleExpenseSubmit(e) {
  e.preventDefault();
  const payload = {
    vehicle_id: $("eVehicle").value,
    volume: parseFloat($("eLiters").value),
    cost: parseFloat($("eCost").value),
  };
  
  $("expenseError").classList.add("hidden");
  const btn = $("expenseSubmitBtn");
  btn.disabled = true;
  
  try {
    await api("/expenses/", { method: "POST", body: JSON.stringify(payload) });
    $("expenseForm").reset();
    await loadGarageData();
  } catch (err) {
    $("expenseError").textContent = err.message;
    $("expenseError").classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}

function renderVehicleOptions() {
  const sel = $("eVehicle");
  sel.innerHTML = '<option value="">Pilih Kendaraan</option>';
  state.vehicles.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.nickname} (${v.brand} ${v.model})`;
    sel.appendChild(opt);
  });
}

async function populateBrandDropdown(vehicleType) {
  const sel = $("vBrand");
  sel.innerHTML = '<option value="">Loading...</option>';
  
  try {
    const endpoint = vehicleType === "Car" ? "/car-brands" : "/motorbike-brands";
    const brands = await api(endpoint);
    
    sel.innerHTML = '<option value="">Pilih Merek</option>';
    brands.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.name;
      opt.textContent = b.name;
      sel.appendChild(opt);
    });
  } catch (err) {
    sel.innerHTML = '<option value="">Error loading brands</option>';
  }
}

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // Nav links
  document.querySelectorAll(".nav-link").forEach(link => {
    link.onclick = (e) => {
      e.preventDefault();
      showPage(link.dataset.page);
    };
  });
  
  // Auth
  $("authForm").addEventListener("submit", handleAuth);
  $("authModalClose").onclick = closeAuthModal;
  $("authModalOverlay").onclick = closeAuthModal;
  
  // Comparison
  $("vehicleSearch").addEventListener("input", renderSearchResults);
  $("distanceInput").addEventListener("input", () => {
    if (state.selectedVehicleA && !state.selectedVehicleB) renderSingleVehicleCost();
    if (state.selectedVehicleA && state.selectedVehicleB) renderComparison();
  });
  $("daysPerWeekInput").addEventListener("input", (e) => {
    // Auto-calculate workdays/month
    const daysPerWeek = parseInt(e.target.value) || 5;
    const autoWorkdays = Math.ceil(30 * daysPerWeek / 7);
    $("workdaysMonthInput").placeholder = `Auto: ${autoWorkdays}`;
    
    if (state.selectedVehicleA && !state.selectedVehicleB) renderSingleVehicleCost();
    if (state.selectedVehicleA && state.selectedVehicleB) renderComparison();
  });
  $("workdaysMonthInput").addEventListener("input", () => {
    if (state.selectedVehicleA && !state.selectedVehicleB) renderSingleVehicleCost();
    if (state.selectedVehicleA && state.selectedVehicleB) renderComparison();
  });
  
  // Garage
  $("vehicleForm").addEventListener("submit", handleVehicleSubmit);
  $("vType").addEventListener("change", (e) => populateBrandDropdown(e.target.value));
  $("expenseForm").addEventListener("submit", handleExpenseSubmit);
  $("eVehicle").addEventListener("change", populateFuelDropdown);
  
  // Auto-calculate total cost when liters or fuel type changes
  $("eLiters").addEventListener("input", autoCalculateCost);
  $("eFuelType").addEventListener("change", autoCalculateCost);
  // Auto-calculate liters when total cost is entered (people refuel by Rupiah)
  $("eCost").addEventListener("input", autoCalculateLiters);
  
  // Vehicle form toggle
  $("toggleVehicleFormBtn").onclick = () => {
    const form = $("vehicleForm");
    form.classList.toggle("hidden");
    $("toggleVehicleFormBtn").textContent = form.classList.contains("hidden") 
      ? "+ Tambah Kendaraan" 
      : "- Tutup Form";
  };
  
  $("cancelVehicleFormBtn").onclick = () => {
    $("vehicleForm").classList.add("hidden");
    $("vehicleForm").reset();
    $("toggleVehicleFormBtn").textContent = "+ Tambah Kendaraan";
  };
  
  // Initial load
  updateNav();
  showPage("comparison");
  renderSearchResults(); // Initialize search UI
  
  // Check token validity
  if (state.token) {
    api("/garage/").then(() => {
      state.user = { email: "user" }; // placeholder, backend doesn't return user info
      updateNav();
    }).catch(() => {
      logout();
    });
  }
});

// Expose for inline handlers
window.resetComparison = resetComparison;
window.startComparison = startComparison;
window.cancelComparison = cancelComparison;
window.selectVehicleForEstimate = selectVehicleForEstimate;
window.deleteVehicle = deleteVehicle;
