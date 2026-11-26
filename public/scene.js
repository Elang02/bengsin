// A small three.js stage for the comparison band: two vehicles on a dark
// forecourt, drag to turn them, wheels turn with the distance you set.
// Loaded lazily from app.js the first time a comparison appears.
import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

const GLASS = 0x22241d;
const TYRE = 0x0e0f0b;
const HUB = 0x9a9c90;
// Two paints for the pair: the brand's oxblood and a graphite that still reads as
// paint on paper. A near-black second car lost its shape entirely against the page.
const TONES = [0x9b2044, 0x4a4f45];

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
// authored models (three cars, one bike), loaded once and cloned per slot
// ---------------------------------------------------------------------------
// Each asset names its own surfaces, so the stage repaints by name instead of
// guessing: one paint slot, an optional glass slot, everything else untouched.
// `len` is the real overall length in metres, which is what keeps a hatchback
// from being drawn at the width of a full-size sedan.
// Three bodies, all authored with smooth normals. The faceted low-poly cars
// that poly.pizza offers in bulk were dropped: no light fixes a model whose
// panels are flat triangles.
const SOURCES = {
  sedan: { url: "/models/car-sedan.glb", paint: ["red_chasis"], glass: ["glass"], len: 5.0 },
  coupe: { url: "/models/car-sport.glb", paint: ["body_paint"], glass: ["glass"], len: 4.3 },
  sport: { url: "/models/car-gtr.glb", paint: ["chasis_none"], glass: ["glass"], len: 4.65 },
  // A naked bike: its panels are separate colour materials, so it takes the same
  // tone as the car beside it. `lift` brightens that tone, because the authored
  // body material is a very dark navy and reads as black under studio light.
  moto: { url: "/models/moto.glb", paint: ["455a64", "039be5"], glass: [], len: 1.98, lift: 2.2 },
};
const gltfLoader = new GLTFLoader();
const sourceCache = new Map();

function loadSource(key) {
  if (!sourceCache.has(key)) {
    sourceCache.set(key, gltfLoader.loadAsync(SOURCES[key].url).then((g) => g.scene));
  }
  return sourceCache.get(key);
}

// Paint, glass and rubber are three different surfaces; a single flat standard
// material makes every model look like a toy. Car paint gets clearcoat over a
// metallic base, glass gets a low-roughness skin, everything else stays matte.
function surface(kind, color) {
  if (kind === "glass") {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.06,
      metalness: 0.55,
      envMapIntensity: 1.6,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });
  }
  if (kind === "paint") {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.3,
      metalness: 0.42,
      envMapIntensity: 1.15,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
    });
  }
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04 });
}

// Repaint by name, not by guesswork. A model that names its paint slot gets the
// palette colour; named glass becomes glass; every other material is kept as
// authored, because those are the parts (tyres, grilles, rims) that carry the
// shape. Replacing them wholesale is what made the old set read as toys.
function dressModel(root, profile, tone) {
  const paint = (profile.paint || []).map((s) => s.toLowerCase());
  const glass = (profile.glass || []).map((s) => s.toLowerCase());
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      const key = (m.name || "").toLowerCase();
      const keep = m.clone();
      // Keep the authored material for paint: its normal and roughness maps are
      // what make the body read as sheet metal. Replacing it with a clean
      // physical shader turned every crease into a flat facet.
      if (paint.includes(key)) {
        if (keep.color) {
          keep.color.setHex(TONES[tone]);
          if (profile.lift) keep.color.multiplyScalar(profile.lift);
        }
        if ("metalness" in keep) keep.metalness = 0.22;
        if ("roughness" in keep) keep.roughness = 0.34;
        if ("clearcoat" in keep) keep.clearcoat = 0.8;
        keep.envMapIntensity = 1.15;
        return keep;
      }
      if (glass.includes(key)) {
        if (keep.color) keep.color.setHex(0x14160f);
        if ("metalness" in keep) keep.metalness = 0.5;
        if ("roughness" in keep) keep.roughness = 0.08;
        keep.envMapIntensity = 1.4;
        return keep;
      }
      keep.envMapIntensity = 0.9;
      return keep;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

function buildFromTemplate(template, tone, profile, targetLen) {
  const g = template.clone(true);
  dressModel(g, profile, tone);

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
  // centre the body on its own pivot: authored models often sit off-origin,
  // which reads as one car overlapping the other once they sit side by side
  const grounded = new THREE.Box3().setFromObject(g);
  const mid = grounded.getCenter(new THREE.Vector3());
  g.position.x -= mid.x;
  g.position.z -= mid.z;
  g.position.y -= grounded.min.y;

  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Light the paint with a lit room rather than a flat white sky: a dark shell
  // with a wide ceiling softbox and two strip lights gives the long highlights
  // that make sheet metal read as sheet metal. Built here instead of shipping an
  // HDRI, so the page keeps its single-file dependency on three.
  const studio = () => {
    const room = new THREE.Scene();
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(30, 16, 30),
      new THREE.MeshBasicMaterial({ color: 0x232520, side: THREE.BackSide }),
    );
    shell.position.y = 4;
    room.add(shell);
    const panel = (w, h, x, y, z, rx, ry, power) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power) }),
      );
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      room.add(m);
    };
    panel(14, 10, 0, 11.9, 0, Math.PI / 2, 0, 5.2);   // ceiling softbox
    panel(3, 12, -12.5, 5, 1, 0, Math.PI / 2, 3.4);   // left strip
    panel(1.6, 12, 12.5, 5, -2, 0, -Math.PI / 2, 2.2); // right strip
    panel(12, 3, 0, 3, -13, 0, 0, 0.9);               // low back bounce
    return room;
  };
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = studio();
  scene.environment = pmrem.fromScene(room, 0.02).texture;
  room.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 120);
  camera.position.set(0, 2.4, 12);
  camera.lookAt(0, 0.9, 0);

  scene.add(new THREE.HemisphereLight(0xf2f2e6, 0x2a2c24, 0.55));
  const key = new THREE.DirectionalLight(0xfff6e2, 3.1);
  key.position.set(7, 11, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 40;
  scene.add(key);
  scene.add(key.target);

  // The only thing drawn on the floor is its shadow: a ShadowMaterial plane
  // lets the page's own ground show through, so the pair sits on the paper
  // instead of on a grey rectangle.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ color: 0x1a1b17, opacity: 0.34 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const rim = new THREE.DirectionalLight(0xb4413f, 0.55);
  rim.position.set(-8, 3.5, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xdfe6e8, 0.3);
  fill.position.set(2, 2, 12);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);

  // The pair rests three-quarter on, turned so both profiles read at once.
  const REST_YAW = -0.36;

  let slotA = null;
  let slotB = null;
  let fit = null;
  const templates = {};
  let speed = 0;
  let yaw = REST_YAW;
  let yawTarget = REST_YAW;
  let pitch = 0.02;
  let pitchTarget = 0.02;
  let lastInput = 0;
  let running = false;
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

  // Where the camera wants to be; the loop eases toward it so the pair never
  // snaps when a vehicle changes or the canvas resizes.
  const camBase = new THREE.Vector3(0, 2.4, 12);
  const camLook = new THREE.Vector3(0, 0.9, 0);
  const camAt = new THREE.Vector3(0, 2.4, 12);
  let fitted = false;

  const probe = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
  const UP = new THREE.Vector3(0, 1, 0);

  function frame() {
    if (!slotA || !fit) return;
    measure();
    root.rotation.set(0, 0, 0);
    const { size, center } = fit;
    const fov = (camera.fov * Math.PI) / 180;
    const byHeight = size.y / 2 / Math.tan(fov / 2);
    const byWidth = size.x / 2 / (Math.tan(fov / 2) * Math.max(camera.aspect, 0.6));
    // narrow canvases have vertical room to spare, so the pair can sit closer
    const margin = camera.aspect < 2.2 ? 0.94 : 1.0;
    let dist = Math.max(byHeight, byWidth) * margin;

    const look = new THREE.Vector3(center.x, center.y * 0.74, center.z);
    const eye = new THREE.Vector3();
    // Rotate the measured corners into the resting pose before projecting:
    // a turned pair reaches wider than the box it was measured in.
    const corners = (fit.corners || []).map((c) => c.clone().applyAxisAngle(UP, REST_YAW));
    // Step back until every corner lands inside the frame: perspective makes the
    // near car wider than the flat estimate, which used to cut a wheel off.
    probe.fov = camera.fov;
    probe.aspect = camera.aspect;
    for (let i = 0; i < 20; i++) {
      eye.set(center.x, center.y + size.y * 0.44 + 0.18, center.z + dist);
      probe.position.copy(eye);
      probe.lookAt(look);
      probe.updateMatrixWorld(true);
      probe.updateProjectionMatrix();
      let inside = true;
      for (const c of corners) {
        const p = c.clone().project(probe);
        if (Math.abs(p.x) > 0.97 || Math.abs(p.y) > 0.97) { inside = false; break; }
      }
      if (inside) break;
      dist *= 1.04;
    }

    camBase.copy(eye);
    camLook.copy(look);
    if (!fitted) {
      camAt.copy(camBase);
      camera.position.copy(camBase);
      fitted = true;
    }
    camera.lookAt(camLook);
  }

  function setVehicles(a, b) {
    for (const s of [slotA, slotB]) {
      if (s) {
        root.remove(s);
        disposeObject(s);
      }
    }
    slotA = slotB = null;

    const styles = ["sedan", "coupe", "sport"].filter((k) => templates[k]);
    const indexOf = (v) => (styles.length ? Math.abs(v.seed || 0) % styles.length : -1);
    // Two cars side by side never wear the same body: the pair's seeds can land
    // on one style, so B steps to the next body when it collides with A.
    const indexA = a && !a.motor ? indexOf(a) : -1;
    const indexB = b && !b.motor ? indexOf(b) : -1;
    const styleB = indexB >= 0 && indexB === indexA ? (indexB + 1) % styles.length : indexB;

    const make = (v, tone, index) => {
      if (v.motor) {
        if (templates.moto) return buildFromTemplate(templates.moto, tone, SOURCES.moto, SOURCES.moto.len);
        return buildBike(tone);
      }
      // body style follows the model name, so the stage shows a mix of shapes
      const key = styles[index] || "sedan";
      if (templates[key]) return buildFromTemplate(templates[key], tone, SOURCES[key], SOURCES[key].len);
      return buildCar(tone);
    };

    if (a) {
      slotA = make(a, 0, Math.max(indexA, 0));
      root.add(slotA);
    }
    if (b) {
      slotB = make(b, 1, Math.max(styleB, 0));
      root.add(slotB);
    }
    // Sit them side by side with a measured gap. Each slot is reset first so a
    // previous vehicle's width cannot leave the pair overlapping.
    const gap = 0.7;
    // Only the horizontal placement is reset here: the built vehicle already
    // carries the offset that put its tyres on y=0, and clearing it dropped the
    // car through the floor.
    for (const slot of [slotA, slotB]) if (slot) {
      slot.position.x = 0;
      slot.position.z = 0;
    }
    root.updateMatrixWorld(true);
    const boxA = slotA ? new THREE.Box3().setFromObject(slotA) : null;
    const boxB = slotB ? new THREE.Box3().setFromObject(slotB) : null;
    const span = (b) => (b ? Math.max(0.001, b.max.x - b.min.x) : 0);
    const mid = (b) => (b ? (b.min.x + b.max.x) / 2 : 0);
    const wa = span(boxA);
    const wb = span(boxB);
    if (slotA) slotA.position.x = (slotB ? -gap / 2 - wa / 2 : 0) - mid(boxA);
    if (slotB) slotB.position.x = (slotA ? gap / 2 + wb / 2 : 0) - mid(boxB);
    // Measure the vehicles only, so the soft shadows do not zoom the camera out.
    // Measure them already turned by the resting yaw: a pair seen at an angle
    // takes up more room than the same pair head-on, and framing the head-on box
    // pushed the near car past the right edge once the idle turn settled.
    const box = new THREE.Box3();
    root.rotation.set(0, REST_YAW, 0);
    root.updateMatrixWorld(true);
    for (const slot of [slotA, slotB]) if (slot) box.expandByObject(slot);
    const size = box.getSize(new THREE.Vector3());
    size.x *= 1.04; // covers the idle swing without zooming out for a whole car
    // Corners taken in each car's own frame (measured before the yaw), so the
    // camera can be checked against the silhouette instead of an axis-aligned
    // box whose empty corners sit in mid-air.
    const corners = [];
    for (const slot of [slotA, slotB]) {
      // Measured after the pair is placed: boxes taken before the side-by-side
      // shift put every corner one slot too far left and the camera framed ghosts.
      const bb = slot ? new THREE.Box3().setFromObject(slot) : null;
      if (!bb || bb.isEmpty()) continue;
      for (const sx of [bb.min.x, bb.max.x]) {
        for (const sy of [bb.min.y, bb.max.y]) {
          for (const sz of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(sx, sy, sz));
        }
      }
    }
    fit = box.isEmpty() ? null : { size, center: box.getCenter(new THREE.Vector3()), corners };

    // The shadow map has to cover the pair, not the whole scene, or the tyres
    // lose their shadow to resolution. Aim the key light at the pair's centre.
    if (fit) {
      const reach = Math.max(size.x, size.z, size.y) * 1.05 + 2.4;
      key.target.position.copy(fit.center);
      key.position.set(fit.center.x + 6, fit.center.y + 9, fit.center.z + 7);
      key.shadow.camera.left = -reach;
      key.shadow.camera.right = reach;
      key.shadow.camera.top = reach;
      key.shadow.camera.bottom = -reach;
      key.shadow.camera.updateProjectionMatrix();
      key.target.updateMatrixWorld();
    }

    // One last ground check on the finished pair, whatever the assets claim
    // about their own origins.
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const grounded = new THREE.Box3();
    for (const slot of [slotA, slotB]) if (slot) grounded.expandByObject(slot);
    if (!grounded.isEmpty() && Math.abs(grounded.min.y) > 0.002) {
      for (const slot of [slotA, slotB]) if (slot) slot.position.y -= grounded.min.y;
      root.updateMatrixWorld(true);
    }
    for (const slot of [slotA, slotB]) if (slot) slot.userData.baseY = slot.position.y;
    frame();
    enterAt = performance.now();
  }

  // The canvas lives in a <section hidden> until a comparison exists, so its
  // first measured box can be 0×0 or stale. Re-measure before every framing.
  function measure() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
    const aspect = w / h;
    if (Math.abs(camera.aspect - aspect) > 0.0005) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    return true;
  }

  function resize() {
    if (!measure()) return;
    frame();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function onDown(e) {
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
    lastInput = performance.now();
    canvas.setPointerCapture?.(e.pointerId);
    canvas.classList.add("is-dragging");
  }
  let gazeX = 0;
  let gazeY = 0;
  let gazeTX = 0;
  let gazeTY = 0;
  let enterAt = 0;

  function onHover(e) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    gazeTX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    gazeTY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  }
  canvas.addEventListener("pointermove", onHover);
  canvas.addEventListener("pointerleave", () => { gazeTX = 0; gazeTY = 0; });

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
    const rect = canvas.getBoundingClientRect();
    const onScreen = rect.bottom > -40 && rect.top < window.innerHeight + 40 && rect.width > 0;
    if (!onScreen || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;

    if (!reduce.matches) {
      const idle = now - lastInput > 2600;
      if (idle && !dragging) {
        yawTarget = REST_YAW + Math.sin(now / 4200) * 0.13;
      }
      yaw += (yawTarget - yaw) * Math.min(1, dt * 7);
      pitch += (pitchTarget - pitch) * Math.min(1, dt * 7);
      root.rotation.y = yaw;
      root.rotation.x = pitch;

      for (const slot of [slotA, slotB]) {
        if (!slot) continue;
        const spin = (slot === slotA ? speed : speed * 0.92) * dt;
        for (const w of slot.userData.wheels) w.rotation.z -= spin;
        // The idle bob rides on top of the offset that seats the tyres, never
        // instead of it: overwriting y here dropped the car below the floor.
        const base = slot.userData.baseY || 0;
        slot.position.y = base + Math.sin(now / 260 + (slot === slotB ? 1.7 : 0)) * 0.004;
      }
    }

    // parallax: the camera leans toward the pointer, never past the stage.
    // Reduced motion keeps the exact same framing, just without the travel.
    if (reduce.matches) {
      gazeX = gazeY = 0;
      camAt.copy(camBase);
    } else {
      gazeX += (gazeTX - gazeX) * Math.min(1, dt * 2.4);
      gazeY += (gazeTY - gazeY) * Math.min(1, dt * 2.4);
      camAt.lerpVectors(camera.position, camBase, Math.min(1, dt * 3.2));
    }
    const settle = reduce.matches || !enterAt ? 1 : Math.min(1, (now - enterAt) / 900);
    const ease = 1 - Math.pow(1 - settle, 3);
    camera.position.set(
      camAt.x + gazeX * 0.42,
      camAt.y - gazeY * 0.16 + (1 - ease) * 0.3,
      camAt.z + (1 - ease) * 1.6,
    );
    camera.lookAt(camLook);
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
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      disposeObject(root);
      renderer.dispose();
    },
  };
}
