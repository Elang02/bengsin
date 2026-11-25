// A small three.js stage for the comparison band: two vehicles on a dark
// forecourt, drag to turn them, wheels turn with the distance you set.
// Loaded lazily from app.js the first time a comparison appears.
import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

const GLASS = 0x22241d;
const TYRE = 0x0e0f0b;
const HUB = 0x9a9c90;
const TONES = [0x8b1538, 0xd9d6c6];

// Metres, not vibes: a 4.5 m car with 0.32 m wheels. Real ratios are what stop
// a low-poly vehicle from reading as a toy.
const CAR = { len: 4.5, width: 1.8, roof: 1.44, belt: 0.95, sill: 0.3, wheel: 0.32, base: 2.6 };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.08,
    ...opts,
  });
}

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

// A flat silhouette pushed into thickness: reads as a shaped object instead of
// stacked boxes, which is what keeps the stage from looking like block toys.
function slab(shape, depth, m, bevel = 0.035) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, m);
}

function wheel(r, width, tyreM, hubM) {
  const group = new THREE.Group();
  // torus tyre: round shoulders catch light along a curve, not a hard rim
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r - width * 0.42, width * 0.42, 10, 26), tyreM);
  group.add(tyre);

  const rimGeo = new THREE.CylinderGeometry(r * 0.93, r * 0.93, width * 0.7, 24);
  rimGeo.rotateX(Math.PI / 2);
  group.add(new THREE.Mesh(rimGeo, hubM));

  const hubGeo = new THREE.CylinderGeometry(r * 0.2, r * 0.2, width * 0.86, 12);
  hubGeo.rotateX(Math.PI / 2);
  group.add(new THREE.Mesh(hubGeo, tyreM));
  return group;
}

function carBodyShape() {
  const s = new THREE.Shape();
  const hx = CAR.len / 2;
  s.moveTo(-hx + 0.04, 0.3);
  s.lineTo(-hx, 0.62);
  s.quadraticCurveTo(-hx, 0.96, -hx + 0.22, 0.99);
  s.lineTo(-1.6, 1.03);
  s.lineTo(-1.16, 1.42);
  s.quadraticCurveTo(-1.12, 1.45, -1.02, 1.45);
  s.lineTo(0.12, 1.45);
  s.quadraticCurveTo(0.22, 1.45, 0.3, 1.39);
  s.lineTo(0.62, 1.02);
  s.lineTo(1.5, 0.94);
  s.quadraticCurveTo(2.16, 0.9, 2.2, 0.82);
  s.lineTo(hx, 0.66);
  s.quadraticCurveTo(hx, 0.34, hx - 0.1, 0.3);
  s.lineTo(-hx + 0.04, 0.3);
  s.closePath();

  for (const x of [CAR.base / 2, -CAR.base / 2]) {
    const hole = new THREE.Path();
    hole.absarc(x, CAR.wheel, CAR.wheel - 0.008, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return s;
}

// The car is a die-cut figure, not a sculpt: a 34 cm thick extrusion of the
// side profile, with the glass painted as a band through the greenhouse. It
// reads as a designed object from every angle the stage allows.
function cabinBandShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.34, 1.03);
  s.lineTo(-1.1, 1.4);
  s.quadraticCurveTo(-1.06, 1.43, -0.98, 1.43);
  s.lineTo(0.02, 1.43);
  s.quadraticCurveTo(0.12, 1.42, 0.2, 1.36);
  s.lineTo(0.46, 1.03);
  s.closePath();
  return s;
}

function buildCar(tone) {
  const g = new THREE.Group();
  const paint = mat(TONES[tone], { roughness: 0.66, metalness: 0.06, envMapIntensity: 0.5 });
  const glass = mat(GLASS, { roughness: 0.45, metalness: 0.1, envMapIntensity: 0.4 });
  const tyre = mat(TYRE, { roughness: 0.94 });
  const hub = mat(HUB, { roughness: 0.5, metalness: 0.25 });

  g.add(slab(carBodyShape(), 0.34, paint, 0.05));
  g.add(slab(cabinBandShape(), 0.37, glass, 0.02));

  for (const x of [CAR.base / 2, -CAR.base / 2]) {
    for (const z of [0.19, -0.19]) {
      const w = wheel(CAR.wheel, 0.2, tyre, hub);
      w.position.set(x, CAR.wheel, z);
      g.add(w);
    }
  }

  const lampY = 0.76;
  g.add(box(0.03, 0.15, 0.36, mat(0xf8f3e2, { roughness: 0.5 }), 2.27, lampY, 0));
  g.add(box(0.03, 0.13, 0.32, mat(0x8f1a1a, { roughness: 0.6 }), -2.27, lampY + 0.06, 0));

  g.userData.wheels = g.children.filter((c) => c.type === "Group");
  return g;
}

// ---------------------------------------------------------------------------
// authored models (Quaternius, CC0), loaded once and cloned per slot
// ---------------------------------------------------------------------------
const SOURCES = {
  car: "/models/car-sedan.glb",
  suv: "/models/car-suv.glb",
  moto: "/models/moto.glb",
  sport: "/models/car-sport.glb",
};
const gltfLoader = new GLTFLoader();
const sourceCache = new Map();

function loadSource(key) {
  const url = SOURCES[key];
  if (!sourceCache.has(key)) {
    sourceCache.set(key, gltfLoader.loadAsync(url).then((g) => g.scene));
  }
  return sourceCache.get(key);
}

// Our palette, mapped onto whatever flat colours the asset ships with.
// The bike ships as one mesh wearing six flat colours; the body is "1a1a1a".
const MOTO_TINT = {
  "1a1a1a": 0x24261f,
  "455a64": 0x8b1538,
  "039be5": 0x2a2c24,
  f44336: 0x6f0f2d,
  ffeb3b: 0xf2eddb,
  cfd8dc: 0x9a9c90,
};

function tintModel(root, bodyColor, remap, bodyKey) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
      const c = m.clone();
      const key = (m.name || "").toLowerCase().replace("#", "");
      if (remap && key === bodyKey) c.color.setHex(bodyColor);
      else if (remap && remap[key] !== undefined) c.color.setHex(remap[key]);
      else if (!remap && !/window|black|grey|glass|head|tail|light/.test(key)) {
        c.color.setHex(bodyColor);
      }
      c.metalness = Math.min(c.metalness ?? 0, 0.22);
      c.roughness = Math.max(c.roughness ?? 0.5, 0.42);
      return c;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
}

function buildFromTemplate(template, tone, remap, targetLen) {
  const g = template.clone(true);
  tintModel(g, TONES[tone], remap, remap ? "455a64" : null);

  // longest horizontal axis becomes the length, then normalise and sit on y=0
  g.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  if (raw.z > raw.x) {
    g.rotation.y = Math.PI / 2;
    g.updateMatrixWorld(true);
  }
  const span = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  const k = targetLen / Math.max(span.x, 0.001);
  if (!Number.isFinite(k) || k <= 0) return g;
  g.scale.setScalar(k);
  g.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(g);
  g.position.y -= grounded.min.y;

  // Authored wheel nodes carry their own baked orientation; spinning them about
  // a guessed local axis tumbles them through the floor. They stay parked.
  g.userData.wheels = [];
  return g;
}

// A strut between two points: the whole bike is built out of these, which is
// what separates a motorcycle from a stack of boxes.
function tube(a, b, radius, m, segments = 8) {
  const start = new THREE.Vector3(a[0], a[1], a[2] || 0);
  const end = new THREE.Vector3(b[0], b[1], b[2] || 0);
  const dir = end.clone().sub(start);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, segments), m);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function buildBike(tone) {
  const g = new THREE.Group();
  const paint = mat(TONES[tone], { roughness: 0.28, metalness: 0.45, envMapIntensity: 1.3 });
  const dark = mat(0x24261f, { roughness: 0.55, metalness: 0.4 });
  const chrome = mat(0x9c9e92, { roughness: 0.24, metalness: 0.75 });
  const tyre = mat(TYRE, { roughness: 0.94 });
  const rim = mat(0x2c2e26, { roughness: 0.6, metalness: 0.3 });

  const r = 0.32;
  const front = wheel(r, 0.09, tyre, rim);
  front.position.set(0.62, r, 0);
  const rear = wheel(r, 0.11, tyre, rim);
  rear.position.set(-0.58, r, 0);
  g.add(rear, front);

  // fork legs, two of them, angled to the axle
  for (const z of [0.07, -0.07]) {
    g.add(tube([0.5, 1.0, z], [0.62, r, z], 0.028, chrome));
  }
  g.add(box(0.06, 0.05, 0.16, dark, 0.51, 1.02, 0));            // triple clamp
  g.add(box(0.03, 0.03, 0.62, chrome, 0.46, 1.06, 0));          // bars
  g.add(box(0.12, 0.12, 0.16, mat(0xf6f1de, { roughness: 0.2 }), 0.54, 0.84, 0)); // headlight

  g.add(tube([0.46, 0.98], [0.0, 0.6], 0.03, dark));            // down tube
  g.add(tube([0.45, 0.97], [-0.22, 0.9], 0.03, dark));          // top tube
  g.add(tube([0.0, 0.6], [-0.24, 0.9], 0.03, dark));            // seat tube
  g.add(tube([-0.06, 0.62], [-0.58, r], 0.035, dark));          // swingarm

  g.add(box(0.36, 0.17, 0.28, paint, 0.12, 0.86, 0));            // tank
  g.add(box(0.4, 0.07, 0.24, dark, -0.36, 0.9, 0));             // seat
  g.add(box(0.12, 0.1, 0.2, paint, -0.56, 0.9, 0));            // tail
  g.add(box(0.3, 0.26, 0.3, dark, -0.02, 0.58, 0));             // engine
  g.add(tube([-0.14, 0.52, 0.13], [-0.62, 0.44, 0.13], 0.038, chrome)); // exhaust
  g.add(box(0.3, 0.03, 0.14, dark, 0.66, 0.56, 0));             // front fender

  g.userData.wheels = [rear, front];
  return g;
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const scene = new THREE.Scene();
  scene.environment = (() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 64;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, "#fbfbf4");
    grad.addColorStop(0.42, "#dcdfd4");
    grad.addColorStop(0.62, "#9ea294");
    grad.addColorStop(1, "#3d4038");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 120);
  camera.position.set(0, 2.4, 12);
  camera.lookAt(0, 0.9, 0);

  scene.add(new THREE.HemisphereLight(0xf2f2e6, 0x2a2c24, 1.35));
  const key = new THREE.DirectionalLight(0xfff6e2, 2.9);
  key.position.set(7, 11, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8b1538, 1.15);
  rim.position.set(-8, 3.5, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xdfe6e8, 0.6);
  fill.position.set(2, 2, 12);
  scene.add(fill);

  // contact shadow texture, reused by every vehicle
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, "rgba(0,0,0,0.5)");
    grad.addColorStop(0.42, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  function castShadow(width, depth) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    return mesh;
  }

  const root = new THREE.Group();
  scene.add(root);

  let slotA = null;
  let slotB = null;
  let fit = null;
  const templates = {};
  let speed = 0;
  let yaw = -0.5;
  let yawTarget = -0.5;
  let pitch = 0.02;
  let pitchTarget = 0.02;
  let lastInput = 0;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  function disposeObject(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        list.forEach((m) => m.dispose());
      }
    });
  }

  function frame() {
    if (!slotA || !fit) return;
    root.rotation.set(0, 0, 0);
    const { size, center } = fit;
    const fov = (camera.fov * Math.PI) / 180;
    const byHeight = size.y / 2 / Math.tan(fov / 2);
    const byWidth = size.x / 2 / (Math.tan(fov / 2) * Math.max(camera.aspect, 0.6));
    // narrow canvases have vertical room to spare, so the pair can sit closer
    const margin = camera.aspect < 2.2 ? 0.98 : 1.08;
    const dist = Math.max(byHeight, byWidth) * margin + size.z / 2;
    camera.position.set(center.x * 0.3, center.y + size.y * 0.55 + 0.25, center.z + dist);
    camera.lookAt(center.x * 0.3, center.y * 0.8, center.z);
  }

  function setVehicles(a, b) {
    for (const s of [slotA, slotB]) {
      if (s) {
        root.remove(s);
        disposeObject(s);
      }
    }
    slotA = slotB = null;

    const make = (v, tone) => {
      if (v.motor) {
        if (templates.moto) return buildFromTemplate(templates.moto, tone, MOTO_TINT, 2.15);
        return buildBike(tone);
      }
      // body style follows the model name, so two cars never look identical
      const styles = ["car", "suv", "sport"].filter((k) => templates[k]);
      const key = styles[(v.seed || 0) % Math.max(styles.length, 1)] || "car";
      if (templates[key]) return buildFromTemplate(templates[key], tone, null, CAR.len);
      return buildCar(tone);
    };

    if (a) {
      slotA = make(a, 0);
      root.add(slotA);
    }
    if (b) {
      slotB = make(b, 1);
      root.add(slotB);
    }
    // sit them side by side with a gap, measured, not guessed
    const gap = 0.62;
    const wa = slotA ? new THREE.Box3().setFromObject(slotA).getSize(new THREE.Vector3()).x : 0;
    const wb = slotB ? new THREE.Box3().setFromObject(slotB).getSize(new THREE.Vector3()).x : 0;
    if (slotA && slotB) {
      const total = wa + wb + gap;
      slotA.position.x = -total / 2 + wa / 2;
      slotB.position.x = total / 2 - wb / 2;
    }
    // measure the vehicles only, so the soft shadows do not zoom the camera out
    const box = new THREE.Box3();
    for (const slot of [slotA, slotB]) if (slot) box.expandByObject(slot);
    fit = box.isEmpty()
      ? null
      : { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };

    for (const slot of [slotA, slotB]) {
      if (!slot) continue;
      const bb = new THREE.Box3().setFromObject(slot);
      const b = bb.getSize(new THREE.Vector3());
      const c = bb.getCenter(new THREE.Vector3());
      const shadow = castShadow(b.x * 1.18, b.z * 1.25);
      shadow.position.set(c.x - slot.position.x, 0.012, c.z - slot.position.z);
      slot.add(shadow);
    }
    frame();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    frame();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      if (visible && running) loop(performance.now());
    },
    { threshold: 0.05 },
  );
  io.observe(canvas);

  function onDown(e) {
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
    lastInput = performance.now();
    canvas.setPointerCapture?.(e.pointerId);
    canvas.classList.add("is-dragging");
  }
  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    dragX = e.clientX;
    dragY = e.clientY;
    yawTarget = Math.max(-1.15, Math.min(0.55, yawTarget + dx * 0.006));
    pitchTarget = Math.max(-0.12, Math.min(0.24, pitchTarget + dy * 0.0025));
    lastInput = performance.now();
  }
  function onUp() {
    dragging = false;
    canvas.classList.remove("is-dragging");
    lastInput = performance.now();
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;

    if (!reduce.matches) {
      const idle = now - lastInput > 2600;
      if (idle && !dragging) {
        yawTarget = -0.5 + Math.sin(now / 3400) * 0.22;
      }
      yaw += (yawTarget - yaw) * Math.min(1, dt * 7);
      pitch += (pitchTarget - pitch) * Math.min(1, dt * 7);
      root.rotation.y = yaw;
      root.rotation.x = pitch;

      for (const slot of [slotA, slotB]) {
        if (!slot) continue;
        const spin = (slot === slotA ? speed : speed * 0.92) * dt;
        for (const w of slot.userData.wheels) w.rotation.z -= spin;
        slot.position.y = Math.sin(now / 260 + (slot === slotB ? 1.7 : 0)) * 0.004;
      }
    }

    renderer.render(scene, camera);
  }

  return {
    async prepare(kinds) {
      await Promise.all(
        kinds.map((k) =>
          loadSource(k).then(
            (t) => { templates[k] = t; },
            () => {},
          ),
        ),
      );
    },
    setVehicles,
    setSpeed(km) {
      speed = Math.max(0, Math.min(60, Number(km) || 0)) * 0.22;
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      resize();
      frame();
      loop(last);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      this.stop();
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      disposeObject(root);
      renderer.dispose();
    },
  };
}
