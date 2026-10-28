import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { BIOMES, MODELS, getCg } from './simulation.js';

const rad = THREE.MathUtils.degToRad;
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
function mesh(geometry, material, position = [0, 0, 0]) {
  const obj = new THREE.Mesh(geometry, material); obj.position.set(...position); obj.castShadow = true; obj.receiveShadow = true; return obj;
}
const box = (w, h, d, color, position) => mesh(new THREE.BoxGeometry(w, h, d), mat(color), position);
function polygon(points, material) {
  const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  return mesh(new THREE.ShapeGeometry(shape), material);
}
export function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
  for (const m of materials) { for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); m.dispose(); }
  for (const g of geometries) g.dispose(); for (const t of textures) t.dispose();
}
export function makePlane(s) {
  const carrier = new THREE.Group(), paperModel = new THREE.Group(), geometry = new THREE.Group();
  paperModel.rotation.x = -Math.PI / 2;
  carrier.add(paperModel); paperModel.add(geometry);
  const paper = mat('#fff8e7', { roughness: s.roughness, side: THREE.DoubleSide });
  const edges = mat('#b4ccbe', { side: THREE.DoubleSide });
  const spec = MODELS[s.model], hinges = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.add(polygon([[5.35, 0], [-4.6, side * 0.55], [spec.tail, side * spec.span], [1.8, side * spec.span * 0.32]], paper));
    geometry.add(wing); hinges.push({ obj: wing, property: 'dihedral', side, axis: 'x' });
    const tip = new THREE.Group(); tip.position.set(spec.tail, side * spec.span, 0);
    tip.add(polygon([[0, 0], [1.4, 0], [0.8, side * 0.65], [0, side * 0.65]], edges));
    wing.add(tip); hinges.push({ obj: tip, property: 'winglet', side, axis: 'x' });
    const flap = new THREE.Group(); flap.position.set(-3.3, side * 0.55, 0.02);
    flap.add(polygon([[0, 0], [-1.3, 0], [-1.3, side * 1.0], [0, side * 1.0]], edges));
    wing.add(flap); hinges.push({ obj: flap, property: 'elevon', side: 1, axis: 'y' });
    const reflex = new THREE.Group(); reflex.position.set(-2.7, side * 1.7, 0.025);
    reflex.add(polygon([[0, 0], [-0.7, 0], [-0.7, side * 0.85], [0, side * 0.85]], paper));
    wing.add(reflex); hinges.push({ obj: reflex, property: 'reflex', side: 1, axis: 'y' });
  }
  const keel = box(9, 0.12, 0.22, '#d8dfcf', [0, 0, -0.1]); geometry.add(keel);
  const marker = color => mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 24), new THREE.MeshBasicMaterial({ color }), [0, 0, 0.38]);
  const cgMarker = marker('#15966b'), cpMarker = marker('#2185d0');
  cpMarker.position.set(4.9 - 0.3 * 9.4, 0, 0.38); paperModel.add(cgMarker, cpMarker);
  const creaser = box(1.7, 0.28, 0.18, '#e4a72a', [4.8, 0, 0.5]); creaser.visible = false; paperModel.add(creaser);
  carrier.userData = { paperModel, geometry, hinges, cgMarker, creaser, tuning: { ...s }, paper, keel, custom: null };
  updatePlane(carrier, s, 1, 0);
  return carrier;
}
export function updatePlane(plane, s, delta, time) {
  const data = plane.userData, amount = Math.min(1, delta * 9);
  for (const hinge of data.hinges) hinge.obj.rotation[hinge.axis] = THREE.MathUtils.lerp(hinge.obj.rotation[hinge.axis], rad(s[hinge.property]) * hinge.side, amount);
  data.paper.roughness = s.roughness;
  data.keel.scale.z = 1.3 - s.seam / 100 * 0.6;
  data.cgMarker.position.x = THREE.MathUtils.lerp(data.cgMarker.position.x, 4.9 - getCg(s) / 100 * 9.4, amount);
  plane.scale.setScalar(0.3 * s.displayScale);
  if (data.creaseStarted) {
    const p = (time - data.creaseStarted) / 1800;
    data.creaser.visible = p < 1;
    data.creaser.position.x = 4.8 - Math.min(1, p) * 9;
    if (p >= 1) data.creaseStarted = 0;
  }
  const clips = data.paperModel.children.find(c => c.userData.clips);
  clips?.children.forEach(clip => { clip.position.z = THREE.MathUtils.lerp(clip.position.z, clip.userData.targetZ, amount); });
}
export function clearance(plane) {
  plane.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(plane);
  return Math.max(0.025, plane.position.y - bounds.min.y + 0.015);
}
export function makeLauncher(s) {
  const g = new THREE.Group();
  if (s.launcher === 'hand') return g;
  const top = s.initialAltitude * 1.1;
  // Deck surface is exactly the selected launch altitude; supports never protrude above it.
  g.add(box(4.1, 0.12, 4, '#526b76', [0, top - 0.06, 0]));
  if (top > 0.15) for (const z of [-1.6, 1.6]) g.add(box(0.15, top - 0.12, 0.15, '#647b85', [-1.5, (top - 0.12) / 2, z]));
  if (s.launcher === 'rail') for (const z of [-1.8, 1.8]) g.add(box(4.5, 0.12, 0.1, '#22a8bf', [0, top + 0.06, z]));
  if (s.launcher === 'slingshot') {
    for (const z of [-1.9, 1.9]) g.add(box(0.14, 1.0, 0.14, '#72888c', [1.4, top + 0.5, z]));
    const band = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#e54f39' })); g.add(band); g.userData.band = band;
  }
  return g;
}
export function updateLauncher(g, s, now) {
  const band = g.userData.band; if (!band) return;
  const progress = g.userData.fired ? Math.min(1, (now - g.userData.fired) / 650) : 0;
  const stretch = g.userData.fired ? (1 - progress) * Math.cos(progress * 15) : 1;
  const top = s.initialAltitude * 1.1 + 0.7;
  const points = [new THREE.Vector3(1.4, top, -1.9), new THREE.Vector3(1.4 - stretch * s.tension / 100 * 2.1, top, 0), new THREE.Vector3(1.4, top, 1.9)];
  band.geometry.dispose(); band.geometry = new THREE.BufferGeometry().setFromPoints(points);
}

function scenery(kind, type) {
  const g = new THREE.Group();
  const cylinder = (r, h, color, y = h / 2) => mesh(new THREE.CylinderGeometry(r, r, h, 10), mat(color), [0, y, 0]);
  const stone = (color, r = 1) => mesh(new THREE.DodecahedronGeometry(r), mat(color), [0, r * 0.85, 0]);
  const mast = () => g.add(cylinder(0.08, 3, '#6c7d83'));
  if (kind === 'lab') {
    if (type === 0) { mast(); const ring = mesh(new THREE.TorusGeometry(0.9, 0.1, 8, 24), mat('#657e85'), [0, 3, 0]); g.add(ring); const rotor = new THREE.Group(); rotor.position.y = 3; for (let i = 0; i < 4; i++) { const blade = box(0.15, 1.6, 0.05, '#36b5b0'); blade.rotation.z = i * Math.PI / 2; rotor.add(blade); } g.add(rotor); g.userData.rotor = rotor; }
    if (type === 1) { g.add(box(1, 2.5, 0.8, '#263b48', [0, 1.25, 0])); for (let i = 0; i < 5; i++) g.add(box(0.7, 0.05, 0.02, '#43d9b4', [0, 0.4 + i * 0.4, 0.42])); }
    if (type === 2) { g.add(cylinder(0.55, 2.4, '#b5c6cc')); g.add(cylinder(0.15, 0.3, '#df754e', 2.55)); }
    if (type === 3) { mast(); g.add(box(0.8, 0.35, 0.45, '#f2c14e', [0, 3.1, 0])); }
    if (type === 4) g.add(mesh(new THREE.ConeGeometry(0.55, 1.2, 12), mat('#e77d31'), [0, 0.6, 0]));
  } else if (kind === 'desert') {
    if (type === 0) { g.add(cylinder(0.22, 3, '#43844e')); g.add(box(1.4, 0.25, 0.25, '#43844e', [0, 1.5, 0])); }
    if (type === 1) { g.add(stone('#ae6742', 1.2)); g.add(mesh(new THREE.DodecahedronGeometry(0.75), mat('#bd7d55'), [0, 2, 0])); }
    if (type === 2) { const dune = stone('#dfbb80', 2); dune.scale.set(1.6, 0.35, 1); dune.position.y = 0.4; g.add(dune); }
    if (type === 3) g.add(stone('#817e47', 0.5));
    if (type === 4) { mast(); g.add(box(0.8, 0.5, 0.03, '#ec7548', [0.4, 2.6, 0])); }
  } else if (kind === 'grassland') {
    if (type === 0) { g.add(cylinder(0.15, 2, '#785c3a')); g.add(mesh(new THREE.ConeGeometry(1.2, 3, 8), mat('#3b8056'), [0, 2.4, 0])); }
    if (type === 1) g.add(stone('#589159', 0.8));
    if (type === 2) g.add(stone('#84928b', 1));
    if (type === 3) { mast(); const rotor = new THREE.Group(); rotor.position.y = 3.4; for (let i = 0; i < 3; i++) { const arm = new THREE.Group(); arm.rotation.z = i * Math.PI * 2 / 3; arm.add(box(0.14, 1.5, 0.08, '#e6eee7', [0, 0.65, 0])); rotor.add(arm); } g.add(rotor); g.userData.rotor = rotor; }
    if (type === 4) g.add(mesh(new THREE.ConeGeometry(1.3, 1.8, 4), mat('#e6ac55'), [0, 0.9, 0]));
  } else if (kind === 'cyber') {
    if (type === 0) { g.add(box(1.8, 7, 1.8, '#344761', [0, 3.5, 0])); for (let i = 0; i < 7; i++) g.add(box(1.5, 0.09, 0.03, '#55dfd7', [0, i + 0.5, 0.92])); }
    if (type === 1) { mast(); g.add(box(2, 1.1, 0.15, '#b24fbb', [0, 3, 0])); }
    if (type === 2) { mast(); g.add(mesh(new THREE.SphereGeometry(0.25), mat('#df6b91', { emissive: '#aa2244' }), [0, 3, 0])); }
    if (type === 3) { mast(); g.add(mesh(new THREE.TorusGeometry(1.1, 0.1, 8, 32), mat('#39d1da', { emissive: '#14777a' }), [0, 3, 0])); }
    if (type === 4) g.add(box(1.2, 1.1, 0.9, '#586880', [0, 0.55, 0]));
  } else {
    if (type === 0) { const crater = mesh(new THREE.TorusGeometry(1.6, 0.35, 8, 24), mat('#6e7480'), [0, 0.22, 0]); crater.rotation.x = Math.PI / 2; g.add(crater); }
    if (type === 1) g.add(stone('#646b77', 1.1));
    if (type === 2) { g.add(cylinder(0.85, 1.4, '#cbb16d', 1.1)); for (const x of [-1, 1]) g.add(box(0.12, 0.9, 0.12, '#ced2d5', [x, 0.45, 0])); }
    if (type === 3) { mast(); const panel = box(3.2, 0.08, 1.5, '#355a91', [0, 2.1, 0]); panel.rotation.z = 0.2; g.add(panel); }
    if (type === 4) { mast(); const dish = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#c8d0dc', { side: THREE.DoubleSide }), [0, 3, 0]); dish.rotation.z = Math.PI / 3; g.add(dish); }
  }
  return g;
}
export function makeBiome(kind) {
  const group = new THREE.Group();
  // Five of each prop type, with reproducible jitter and spacing; central flight corridor stays clear.
  let seed = 1847; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 50; i++) {
    const item = scenery(kind, i % 5);
    const row = Math.floor(i / 2), side = i % 2 ? -1 : 1;
    item.position.set(-8 + row * 7 + rand() * 1.5, 0, side * (8 + rand() * 4));
    item.rotation.y = rand() * Math.PI; group.add(item);
  }
  return group;
}
export function animateBiome(group, dt) { group.traverse(o => { if (o.userData.rotor) o.userData.rotor.rotation.z += dt * 1.4; }); }

export async function loadModel(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('模型上限為 20 MB。');
  const ext = file.name.split('.').pop().toLowerCase();
  const loader = new GLTFLoader();
  // Model files must be self-contained: never fetch arbitrary external model dependencies.
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => { if (/^(data:|blob:)/.test(url)) return url; throw new Error('請使用內嵌材質的 GLB／GLTF；不載入外部資源。'); });
  loader.manager = manager;
  let model;
  if (ext === 'obj') model = new OBJLoader().parse(await file.text());
  else if (ext === 'glb' || ext === 'gltf') {
    const data = ext === 'glb' ? await file.arrayBuffer() : await file.text();
    if (ext === 'gltf') {
      const json = JSON.parse(data);
      if ([...(json.buffers || []), ...(json.images || [])].some(x => x.uri && !x.uri.startsWith('data:'))) throw new Error('GLTF 引用了其他檔案，請改匯出為自包含 GLB。');
    }
    model = (await loader.parseAsync(data, '')).scene;
  } else throw new Error('請選擇 GLB、內嵌資源的 GLTF 或 OBJ 模型。');
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  if (bounds.isEmpty() || !Number.isFinite(size.length()) || size.length() < 0.00001) { disposeObject(model); throw new Error('模型沒有可顯示的有效幾何。'); }
  return model;
}
export function normalizeModel(model, length = 3) {
  const wrapper = new THREE.Group(); wrapper.add(model);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  const factor = length / Math.max(size.x, size.y, size.z);
  model.scale.multiplyScalar(factor); model.position.multiplyScalar(factor);
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper), center = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return wrapper;
}
let audioContext;
export function playSound(kind, enabled) {
  if (!enabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
    oscillator.type = kind === 'fold' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(kind === 'launch' ? 180 : kind === 'clip' ? 1200 : 350, now);
    oscillator.frequency.exponentialRampToValueAtTime(60, now + 0.18);
    gain.gain.setValueAtTime(0.035, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(now + 0.21);
  } catch { /* Sound is optional; blocked audio must not stop the experiment. */ }
}
