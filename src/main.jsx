import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Brain, CheckCircle2, CloudRain, Crosshair, Eye, EyeOff, Gauge, Info, Plane, Rewind, RotateCcw, Scale, Sparkles, Sun, Wind } from 'lucide-react';
import './styles.css';
import { DEFAULT_SETTINGS, BIOMES, MODELS, clamp, simulateFlight, getCg } from './simulation.js';
import { makePlane, updatePlane, clearance, makeLauncher, updateLauncher, makeBiome, animateBiome, disposeObject, loadModel, normalizeModel, playSound } from './lab-scene.js';
import LabControls from './LabControls.jsx';

const WORLD_X_SCALE = 1.25;
const WORLD_Y_SCALE = 1.1;
const WORLD_Z_SCALE = 1.35;

function makeClip() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.38, -0.12, 0), new THREE.Vector3(-0.45, 0.14, 0),
    new THREE.Vector3(-0.2, 0.3, 0), new THREE.Vector3(0.35, 0.28, 0),
    new THREE.Vector3(0.48, 0.03, 0), new THREE.Vector3(0.28, -0.26, 0),
    new THREE.Vector3(-0.18, -0.24, 0), new THREE.Vector3(-0.28, -0.08, 0),
    new THREE.Vector3(0.2, 0.08, 0)
  ]);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 42, 0.035, 6, false),
    new THREE.MeshStandardMaterial({ color: '#354944', metalness: 0.78, roughness: 0.25 })
  );
}

function makeGrassTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#7fb373';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 94721;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const patchColors = ['#73a969', '#8cbd7d', '#679b60', '#95c687'];
  for (let index = 0; index < 1100; index += 1) {
    context.fillStyle = patchColors[Math.floor(random() * patchColors.length)];
    const size = 1 + random() * 2.4;
    context.fillRect(random() * 256, random() * 256, size, size);
  }
  const bladeColors = ['#4f8950', '#5f9858', '#a4cd8f'];
  context.lineWidth = 0.7;
  for (let index = 0; index < 850; index += 1) {
    const x = random() * 256;
    const y = random() * 256;
    context.strokeStyle = bladeColors[Math.floor(random() * bladeColors.length)];
    context.beginPath();
    context.moveTo(x, y + 2.5);
    context.lineTo(x + (random() - 0.5) * 2, y - 2 - random() * 3);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(32, 14);
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeWindStreaks(isMobile) {
  const count = isMobile ? 60 : 130;
  const bases = new Float32Array(count * 3);
  const positions = new Float32Array(count * 6);
  let seed = 13579;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let index = 0; index < count; index += 1) {
    bases[index * 3] = -18 + random() * 88;
    bases[index * 3 + 1] = 0.45 + random() * 8.5;
    bases[index * 3 + 2] = -18 + random() * 36;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: '#d5f2ef', transparent: true, opacity: 0, depthWrite: false });
  const streaks = new THREE.LineSegments(geometry, material);
  streaks.visible = false;
  streaks.frustumCulled = false;
  streaks.userData.bases = bases;
  streaks.userData.count = count;
  return streaks;
}

function updateWindStreaks(streaks, wind, windDirection, delta) {
  const strength = Math.abs(wind);
  if (strength < 0.05) {
    streaks.visible = false;
    return;
  }
  streaks.visible = true;
  streaks.material.opacity = clamp(0.14 + strength * 0.065, 0.14, 0.8);
  const directionX = windDirection === 'front' ? Math.sign(wind) : 0;
  const directionZ = windDirection === 'left' ? 1 : windDirection === 'right' ? -1 : 0;
  const speed = strength * (1.2 + strength * 0.22);
  const length = 0.35 + strength * 0.22;
  const bases = streaks.userData.bases;
  const positions = streaks.geometry.attributes.position.array;
  for (let index = 0; index < streaks.userData.count; index += 1) {
    const offset = index * 3;
    bases[offset] += directionX * speed * delta;
    bases[offset + 2] += directionZ * speed * delta;
    if (bases[offset] > 70) bases[offset] = -18;
    if (bases[offset] < -18) bases[offset] = 70;
    if (bases[offset + 2] > 20) bases[offset + 2] = -20;
    if (bases[offset + 2] < -20) bases[offset + 2] = 20;
    const vertex = index * 6;
    positions[vertex] = bases[offset];
    positions[vertex + 1] = bases[offset + 1];
    positions[vertex + 2] = bases[offset + 2];
    positions[vertex + 3] = bases[offset] - directionX * length;
    positions[vertex + 4] = bases[offset + 1] + Math.sin(index * 1.7) * 0.035 * strength;
    positions[vertex + 5] = bases[offset + 2] - directionZ * length;
  }
  streaks.geometry.attributes.position.needsUpdate = true;
}

function makeRainStreaks(isMobile) {
  const count = isMobile ? 80 : 200;
  const bases = new Float32Array(count * 3);
  const positions = new Float32Array(count * 6);
  let seed = 86421;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let index = 0; index < count; index += 1) {
    bases[index * 3] = -18 + random() * 88;
    bases[index * 3 + 1] = 0.3 + random() * 13;
    bases[index * 3 + 2] = -20 + random() * 40;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: '#c7e4ea', transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(geometry, material);
  rain.visible = false;
  rain.frustumCulled = false;
  rain.userData.bases = bases;
  rain.userData.count = count;
  return rain;
}

function updateRainStreaks(rain, weather, wind, windDirection, delta) {
  if (weather === 'clear') {
    rain.visible = false;
    return;
  }
  const typhoon = weather === 'typhoon';
  rain.visible = true;
  rain.material.opacity = typhoon ? 0.62 : 0.38;
  const fallSpeed = typhoon ? 23 : 14;
  const slant = wind * (typhoon ? 0.16 : 0.08);
  const directionX = windDirection === 'front' ? 1 : 0;
  const directionZ = windDirection === 'left' ? 1 : windDirection === 'right' ? -1 : 0;
  const length = typhoon ? 1.7 : 0.9;
  const bases = rain.userData.bases;
  const positions = rain.geometry.attributes.position.array;
  for (let index = 0; index < rain.userData.count; index += 1) {
    const offset = index * 3;
    bases[offset] += directionX * wind * delta * (typhoon ? 0.72 : 0.25);
    bases[offset + 2] += directionZ * Math.abs(wind) * delta * (typhoon ? 0.72 : 0.25);
    bases[offset + 1] -= fallSpeed * delta;
    if (bases[offset + 1] < 0.15) bases[offset + 1] = 13;
    if (bases[offset] > 70) bases[offset] = -18;
    if (bases[offset] < -18) bases[offset] = 70;
    if (bases[offset + 2] > 20) bases[offset + 2] = -20;
    if (bases[offset + 2] < -20) bases[offset + 2] = 20;
    const vertex = index * 6;
    positions[vertex] = bases[offset];
    positions[vertex + 1] = bases[offset + 1];
    positions[vertex + 2] = bases[offset + 2];
    positions[vertex + 3] = bases[offset] - directionX * slant;
    positions[vertex + 4] = bases[offset + 1] + length;
    positions[vertex + 5] = bases[offset + 2] - directionZ * Math.abs(slant);
  }
  rain.geometry.attributes.position.needsUpdate = true;
}

function FlightScene({ settings, flightRequest, replayResult, onResult, onFlightState, onFlightEvent, onTelemetry, showForces, cameraMode, focusRequest, creaseRequest, assetRequest, onAssetStatus, onCustomPlane, restoreRequest, resetRequest }) {
  const host = useRef(null);
  const sceneRef = useRef(null);
  const cameraModeRef = useRef(cameraMode);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const assetEpoch = useRef(0);

  useEffect(() => {
    const el = host.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dfeee8');
    scene.fog = new THREE.Fog('#dfeee8', 180, 1000);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 2000);
    camera.position.set(14, 9, 17);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(el.clientWidth < 760 ? 1 : Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = el.clientWidth >= 760;
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.addEventListener('start', () => {
      if (sceneRef.current) { sceneRef.current.manualOrbit = true; sceneRef.current.focusActive = false; }
    });
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 500;
    controls.target.set(2, 2.5, 0);

    const hemisphere = new THREE.HemisphereLight('#ffffff', '#789187', 2.3);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight('#fff6d6', 3.2);
    sun.position.set(-8, 14, 8);
    sun.castShadow = true;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 700),
      new THREE.MeshStandardMaterial({ map: makeGrassTexture(renderer), color: '#e5f0df', roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.position.x = 450;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(60, 60, '#6f9683', '#86ae98');
    grid.position.y = 0.005;
    grid.position.x = 20;
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    scene.add(grid);
    const environment = makeBiome(settings.biome);
    scene.add(environment);
    const launcher = makeLauncher(settings); scene.add(launcher);
    const customObjects = new THREE.Group(); scene.add(customObjects);
    const trees = [];
    environment.traverse(object => { if (object.userData.isTree) trees.push(object); });

    const plane = makePlane(settings);
    plane.scale.setScalar(0.3);
    plane.position.set(0, 1.35 * WORLD_Y_SCALE, 0);
    plane.traverse(obj => { if (obj.isMesh) obj.castShadow = true; });
    scene.add(plane);

    const clips = new THREE.Group();
    clips.userData.clips = true;
    plane.userData.paperModel.add(clips);

    const pathMaterial = new THREE.LineBasicMaterial({ color: '#e24e36', transparent: true, opacity: 0 });
    const pathLine = new THREE.Line(new THREE.BufferGeometry(), pathMaterial);
    scene.add(pathLine);
    const previousPathMaterial = new THREE.LineDashedMaterial({ color: '#596d66', dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0 });
    const previousPathLine = new THREE.Line(new THREE.BufferGeometry(), previousPathMaterial);
    scene.add(previousPathLine);

    const forceGroup = new THREE.Group();
    const forceArrows = {
      lift: new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, '#2185d0', 0.28, 0.15),
      weight: new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, '#e44f39', 0.28, 0.15),
      thrust: new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, '#15966b', 0.28, 0.15),
      drag: new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(), 1, '#d49a23', 0.28, 0.15)
    };
    Object.values(forceArrows).forEach(arrow => forceGroup.add(arrow));
    forceGroup.visible = false;
    scene.add(forceGroup);
    const windStreaks = makeWindStreaks(el.clientWidth < 760);
    scene.add(windStreaks);
    const rainStreaks = makeRainStreaks(el.clientWidth < 760);
    scene.add(rainStreaks);
    sceneRef.current = {
      scene, camera, renderer, controls, plane, clips, pathLine, pathMaterial,
      previousPathLine, previousPathMaterial, forceGroup, forceArrows,
      windStreaks, rainStreaks, windSpeed: 0, windDirection: 'front', weather: 'clear',
      hemisphere, sun, ground, trees, environment, launcher, customObjects, customBackground: null,
      tuning: settings, focusActive: false, assetEpoch: 0,
      cameraGoal: camera.position.clone(), targetGoal: controls.target.clone(),
      isFlying: false, raf: 0, flightRaf: 0
    };

    const resize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const weatherLooks = {
      clear: { sky: new THREE.Color('#dfeee8'), ground: new THREE.Color('#e5f0df'), sun: 3.2, hemisphere: 2.3, roughness: 1 },
      rain: { sky: new THREE.Color('#a9bec2'), ground: new THREE.Color('#c6d7c0'), sun: 1.45, hemisphere: 1.6, roughness: 0.72 },
      typhoon: { sky: new THREE.Color('#5d7076'), ground: new THREE.Color('#91a997'), sun: 0.65, hemisphere: 1.05, roughness: 0.48 }
    };
    let previousFrame = performance.now();
    const animate = () => {
      const now = performance.now();
      const delta = Math.min(0.05, (now - previousFrame) / 1000);
      previousFrame = now;
      const state = sceneRef.current;
      updateWindStreaks(state.windStreaks, state.windSpeed, state.windDirection, delta);
      updateRainStreaks(state.rainStreaks, state.weather, state.windSpeed, state.windDirection, delta);
      const look = weatherLooks[state.weather];
      const tuning = settingsRef.current;
      updatePlane(state.plane, tuning, delta, now);
      updateLauncher(state.launcher, tuning, now);
      animateBiome(state.environment, delta);
      if (!state.isFlying && !state.hasResult) {
        state.plane.rotation.set(0, 0, 0);
        state.plane.userData.paperModel.rotation.x = -Math.PI / 2;
        state.plane.position.set(0, tuning.initialAltitude * WORLD_Y_SCALE + clearance(state.plane), 0);
      }
      if (!state.customBackground) scene.background.lerp(new THREE.Color(BIOMES[tuning.biome].sky).lerp(look.sky, tuning.biome === 'moon' ? 0 : state.weather === 'clear' ? 0 : 0.4), 0.035);
      scene.fog.color.lerp(look.sky, 0.035);
      state.ground.material.color.lerp(new THREE.Color(BIOMES[tuning.biome].ground), 0.035);
      state.ground.material.roughness = THREE.MathUtils.lerp(state.ground.material.roughness, look.roughness, 0.04);
      state.sun.intensity = THREE.MathUtils.lerp(state.sun.intensity, look.sun, 0.04);
      state.hemisphere.intensity = THREE.MathUtils.lerp(state.hemisphere.intensity, look.hemisphere, 0.04);
      const swayStrength = state.weather === 'typhoon' ? 0.075 : state.weather === 'rain' ? 0.012 : 0;
      state.trees.forEach((tree, index) => {
        const windLean = state.weather === 'typhoon' ? state.windSpeed * 0.0035 : 0;
        const sway = windLean + Math.sin(now * 0.004 + tree.userData.swayPhase + index) * swayStrength;
        tree.rotation.z = THREE.MathUtils.lerp(tree.rotation.z, sway, 0.08);
      });
      if (sceneRef.current.cameraGoal && !state.manualOrbit && (cameraModeRef.current !== 'overview' || state.focusActive)) {
        camera.position.lerp(sceneRef.current.cameraGoal, 0.075);
        controls.target.lerp(sceneRef.current.targetGoal, 0.075);
      }
      controls.update();
      renderer.render(scene, camera);
      sceneRef.current.raf = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(sceneRef.current?.raf);
      cancelAnimationFrame(sceneRef.current?.flightRaf);
      controls.dispose();
      assetEpoch.current += 1;
      disposeObject(scene);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    if (!sceneRef.current || sceneRef.current.isFlying) return;
    sceneRef.current.focusActive = false;
    sceneRef.current.manualOrbit = false;
    const { cameraGoal, targetGoal, controls } = sceneRef.current;
    controls.enabled = cameraMode === 'overview';
    if (cameraMode === 'side') {
      cameraGoal.set(7, 6.5, 22);
      targetGoal.set(4, 2, 0);
    } else if (cameraMode === 'follow') {
      cameraGoal.set(-4, 4.2, 8);
      targetGoal.set(2, 1.5, 0);
    } else {
      cameraGoal.set(11, 11, 22);
      targetGoal.set(6, 1.8, 0);
    }
  }, [cameraMode]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.forceGroup.visible = showForces && sceneRef.current.isFlying;
  }, [showForces, flightRequest.id]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.windSpeed = settings.biome === 'moon' ? 0 : settings.wind;
      sceneRef.current.windDirection = settings.windDirection;
    }
  }, [settings.wind, settings.windDirection, settings.biome]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.weather = settings.biome === 'moon' ? 'clear' : settings.weather;
  }, [settings.weather, settings.biome]);

  useEffect(() => {
    const state = sceneRef.current; if (!state) return;
    disposeObject(state.environment); state.scene.remove(state.environment);
    state.environment = makeBiome(settings.biome); state.scene.add(state.environment);
    state.customBackground?.dispose(); state.customBackground = null;
    state.scene.background = new THREE.Color(BIOMES[settings.biome].sky);
    state.scene.fog.color.set(BIOMES[settings.biome].sky);
    state.ground.material.color.set(BIOMES[settings.biome].ground);
  }, [settings.biome]);

  useEffect(() => {
    const state = sceneRef.current; if (!state) return;
    disposeObject(state.launcher); state.scene.remove(state.launcher);
    state.launcher = makeLauncher(settings); state.scene.add(state.launcher);
    state.hasResult = false;
  }, [settings.launcher, settings.initialAltitude]);

  useEffect(() => {
    const state = sceneRef.current; if (!state) return;
    const oldPlane = state.plane;
    oldPlane.userData.paperModel.remove(state.clips);
    disposeObject(oldPlane); state.scene.remove(oldPlane);
    state.plane = makePlane(settings); state.plane.scale.setScalar(0.3 * settings.displayScale);
    state.plane.userData.paperModel.add(state.clips); state.scene.add(state.plane);
    state.plane.position.y = settings.initialAltitude * WORLD_Y_SCALE + clearance(state.plane);
    state.hasResult = false; onCustomPlane('');
  }, [settings.model, restoreRequest]);

  useEffect(() => {
    const state = sceneRef.current; if (!state || !resetRequest) return;
    assetEpoch.current += 1;
    state.hasResult = false; state.focusActive = false;
    state.manualOrbit = false;
    state.cameraGoal.set(7, 6.5, 22); state.targetGoal.set(4, 2, 0);
    state.pathMaterial.opacity = 0; state.previousPathMaterial.opacity = 0;
    state.customBackground?.dispose(); state.customBackground = null;
    state.scene.background = new THREE.Color(BIOMES[settings.biome].sky);
    disposeObject(state.customObjects); state.customObjects.clear();
    onAssetStatus({ message: '已重設參數與自訂素材。' });
  }, [resetRequest]);

  useEffect(() => {
    const state = sceneRef.current; if (!state || !focusRequest.id || state.isFlying) return;
    const key = focusRequest.target;
    const offsets = { overview: [5, 5, 7], nose: [4, 1.5, 3], tail: [-4, 2, 3], front: [7, 0.8, 0.2], wing: [0, 2, 5], cg: [0, 6, 0.5] };
    const center = state.plane.position;
    state.cameraGoal.copy(center).add(new THREE.Vector3(...(offsets[key] || offsets.overview)));
    state.targetGoal.copy(center); state.controls.enabled = true; state.focusActive = true; state.manualOrbit = false;
  }, [focusRequest.id]);

  useEffect(() => {
    if (sceneRef.current && creaseRequest) sceneRef.current.plane.userData.creaseStarted = performance.now();
  }, [creaseRequest]);

  useEffect(() => {
    if (!assetRequest.id || !sceneRef.current) return;
    const state = sceneRef.current, epoch = ++assetEpoch.current;
    const current = () => assetEpoch.current === epoch;
    async function run() {
      onAssetStatus({ busy: true, message: '正在解析檔案…' });
      try {
        if (assetRequest.kind === 'clear') {
          disposeObject(state.customObjects); state.customObjects.clear();
          state.customBackground?.dispose(); state.customBackground = null;
          state.scene.background = new THREE.Color(BIOMES[settingsRef.current.biome].sky);
          onAssetStatus({ message: '已清除自訂背景與地景。' }); return;
        }
        if (assetRequest.kind === 'sky') {
          const file = assetRequest.files[0];
          if (!/\.(jpe?g|png)$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new Error('背景需為 10 MB 以內的 JPG 或 PNG。');
          const image = await createImageBitmap(file);
          if (!current()) { image.close(); return; }
          if (image.width > 4096 || image.height > 2048 || Math.abs(image.width / image.height - 2) > 0.1) { image.close(); throw new Error('請使用 2:1 全景圖，最大 4096×2048。'); }
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').drawImage(image, 0, 0); image.close();
          const texture = new THREE.CanvasTexture(canvas); texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace;
          state.customBackground?.dispose(); state.customBackground = texture; state.scene.background = texture;
          onAssetStatus({ message: `已載入背景：${file.name}` }); return;
        }
        const { files, kind } = assetRequest;
        if (files.length > 10 || (kind === 'objects' && state.customObjects.children.length + files.length > 30)) throw new Error('一次最多 10 個，場景總數最多 30 個物件。');
        let loaded = 0; const errors = [];
        for (const file of files) {
          try {
            const model = await loadModel(file);
            if (!current()) { disposeObject(model); return; }
            if (kind === 'plane') {
              // Source +Z nose maps to +X world. Convert world Y-up to the paper's local Z-up frame.
              const wrapper = normalizeModel(model, 9.5); wrapper.rotation.y = Math.PI / 2;
              const oriented = new THREE.Group(); oriented.rotation.x = Math.PI / 2; oriented.add(wrapper);
              const data = state.plane.userData;
              if (data.custom) { data.paperModel.remove(data.custom); disposeObject(data.custom); }
              data.geometry.visible = false; data.custom = oriented; data.paperModel.add(oriented);
              state.hasResult = false; onCustomPlane(file.name);
            } else {
              const wrapper = normalizeModel(model, 3);
              const index = state.customObjects.children.length;
              wrapper.position.set(-4 + Math.floor(index / 2) * 6, 0, (index % 2 ? -1 : 1) * (17 + Math.random() * 2));
              wrapper.rotation.y = Math.random() * Math.PI * 2; state.customObjects.add(wrapper);
            }
            loaded++;
          } catch (error) { errors.push(`${file.name}：${error.message}`); }
        }
        if (current()) onAssetStatus({ error: errors.length > 0, message: `成功載入 ${loaded} 個模型；地景共 ${state.customObjects.children.length} 個。${errors.join('；')}` });
      } catch (error) { if (current()) onAssetStatus({ error: true, message: error.message }); }
    }
    run();
    return () => { assetEpoch.current += 1; };
  }, [assetRequest.id]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const { clips } = sceneRef.current;
    disposeObject(clips); clips.clear();
    const x = 4.9 - (settings.clipPosition / 100) * 9.4;
    const wingOffset = clamp(0.65 + (4.9 - x) * 0.35, 0.65, 3.4);
    const sides = settings.clipPlacement === 'both'
      ? [1, -1]
      : settings.clipPlacement === 'left'
        ? [1]
        : settings.clipPlacement === 'right'
          ? [-1]
          : [0];
    sides.forEach(side => {
      for (let i = 0; i < settings.clipCount; i += 1) {
        const clip = makeClip();
        const spread = (i - (settings.clipCount - 1) / 2) * 0.24;
        clip.userData.targetZ = 0.11 + i * 0.025;
        clip.position.set(x, side === 0 ? spread : side * wingOffset + spread, 1.4 + i * 0.025);
        clip.scale.setScalar(0.85);
        clips.add(clip);
      }
    });
  }, [settings.clipCount, settings.clipPosition, settings.clipPlacement]);

  useEffect(() => {
    if (!sceneRef.current || flightRequest.id === 0) return;
    const isReplay = flightRequest.mode === 'replay' && Boolean(replayResult);
    const result = isReplay ? replayResult : simulateFlight(settings);
    const flightSettings = result.settings;
    const state = sceneRef.current;
    state.focusActive = false; state.manualOrbit = false; state.launcher.userData.fired = performance.now();
    state.hasResult = false;
    onFlightState(true);
    onFlightEvent(isReplay ? { label: '慢動作重播', detail: '觀察姿態與路徑變化', tone: 'replay' } : null);
    const {
      plane, pathLine, pathMaterial, previousPathLine, previousPathMaterial,
      forceGroup, forceArrows, controls, cameraGoal, targetGoal
    } = sceneRef.current;
    cancelAnimationFrame(sceneRef.current.flightRaf);
    if (!isReplay && pathLine.geometry.getAttribute('position')) {
      previousPathLine.geometry.dispose();
      previousPathLine.geometry = pathLine.geometry.clone();
      previousPathLine.geometry.setDrawRange(0, Infinity);
      previousPathLine.computeLineDistances();
      previousPathMaterial.opacity = pathMaterial.opacity > 0 ? 0.58 : 0;
    }
    plane.rotation.set(0, 0, 0);
    plane.userData.paperModel.rotation.x = -Math.PI / 2;
    const restClearance = clearance(plane);
    const coords = result.points.map(p => new THREE.Vector3(p.x * WORLD_X_SCALE, p.y * WORLD_Y_SCALE + restClearance, p.z * WORLD_Z_SCALE));
    const flightCurve = new THREE.CatmullRomCurve3(coords, false, 'centripetal', 0.35);
    const trailPoints = flightCurve.getPoints(Math.max(140, coords.length * 2));
    pathLine.geometry.dispose();
    pathLine.geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
    pathLine.geometry.setDrawRange(0, 1);
    pathMaterial.opacity = 0.8;
    forceGroup.visible = showForces;
    sceneRef.current.isFlying = true;
    controls.enabled = cameraModeRef.current === 'overview';
    const paperModel = plane.userData.paperModel;
    const duration = clamp(result.airtime * 1050, 1900, 4400) * (isReplay ? 1.85 : 1);
    const landingDuration = isReplay ? 820 : 520;
    const endPoint = flightCurve.getPoint(1);
    const sceneDistance = result.distance * WORLD_X_SCALE;
    const scenePeak = result.peak * WORLD_Y_SCALE;
    const midpoint = sceneDistance * 0.5;
    const startTime = performance.now();
    let eventIndex = 0;
    let lastTelemetry = 0;

    const step = now => {
      const elapsed = now - startTime;
      const progress = clamp(elapsed / duration, 0, 1);
      const point = flightCurve.getPoint(progress);
      const tangent = flightCurve.getTangent(Math.min(0.999, progress + 0.002));
      const sourceIndex = Math.min(result.points.length - 1, Math.floor(progress * (result.points.length - 1)));
      const p = result.points[sourceIndex];
      if (now - lastTelemetry > 100) {
        onTelemetry({ distance: p.x, peak: p.y, airtime: p.t, speed: p.speed }); lastTelemetry = now;
      }
      if (eventIndex < result.events.length && progress >= result.events[eventIndex].progress) {
        onFlightEvent(result.events[eventIndex]);
        eventIndex += 1;
      }
      plane.position.copy(point);
      controls.enabled = cameraModeRef.current === 'overview';
      if (controls.enabled) { const offset = point.clone().sub(controls.target); state.camera.position.add(offset); controls.target.copy(point); }
      const targetPitch = Math.atan2(tangent.y, tangent.x);
      const targetYaw = -Math.atan2(tangent.z, tangent.x);
      plane.rotation.z = THREE.MathUtils.lerp(plane.rotation.z, targetPitch, 0.14);
      plane.rotation.y = THREE.MathUtils.lerp(plane.rotation.y, targetYaw, 0.12);
      const motionFade = Math.sin(progress * Math.PI);
      const rollStrength = clamp((1 - result.stability) * 0.075 + Math.abs(flightSettings.wind) * 0.006, 0.004, 0.075);
      const naturalMotion = Math.sin(progress * Math.PI * 3) * rollStrength * motionFade;
      const stormShake = flightSettings.biome !== 'moon' && flightSettings.weather === 'typhoon' ? (p.turbulence || 0) * 0.035 * motionFade : 0;
      const roll = flightSettings.biome === 'moon' ? 0 : (p.roll || 0) + naturalMotion + stormShake;
      paperModel.rotation.x = -Math.PI / 2 + roll;
      plane.position.y = Math.max(plane.position.y, clearance(plane));
      pathLine.geometry.setDrawRange(0, Math.max(2, Math.ceil(progress * trailPoints.length)));
      forceGroup.position.copy(plane.position);
      forceArrows.lift.setLength(clamp((p.lift || 0) * 0.16, 0.35, 2.2), 0.28, 0.15);
      forceArrows.weight.setLength(1.55, 0.28, 0.15);
      forceArrows.thrust.setLength(clamp((p.speed || 0) * 0.12, 0.35, 1.9), 0.28, 0.15);
      forceArrows.drag.setLength(clamp((p.drag || 0) * 0.28, 0.3, 1.7), 0.28, 0.15);

      if (cameraModeRef.current === 'follow') {
        cameraGoal.set(point.x - 5.2, point.y + 3.1, point.z + 13);
        targetGoal.set(point.x + 2.5, point.y + 0.1, point.z);
      } else if (cameraModeRef.current === 'side') {
        cameraGoal.set(midpoint + 1.5, Math.max(5.5, scenePeak + 3.5), Math.max(24, sceneDistance * 1.25));
        targetGoal.set(midpoint + 1.5, Math.max(1.5, scenePeak * 0.42), 0);
      } else if (cameraModeRef.current === 'tower') {
        cameraGoal.set(-8, 7 + flightSettings.initialAltitude, 12);
        targetGoal.copy(point);
      } else {
        cameraGoal.set(midpoint + 2, Math.max(10, scenePeak + 7), Math.max(19, sceneDistance * 0.78));
        targetGoal.set(midpoint, Math.max(1.2, scenePeak * 0.35), 0);
      }

      if (progress < 1) {
        sceneRef.current.flightRaf = requestAnimationFrame(step);
        return;
      }

      if (!result.landed) { sceneRef.current.isFlying = false; state.hasResult = true; forceGroup.visible = false; if (!isReplay) onResult(result); onFlightState(false); return; }
      const landingProgress = clamp((elapsed - duration) / landingDuration, 0, 1);
      const settle = 1 - Math.pow(1 - landingProgress, 3);
      plane.position.set(endPoint.x + settle * 0.48, THREE.MathUtils.lerp(endPoint.y, restClearance, settle), endPoint.z);
      plane.rotation.z = THREE.MathUtils.lerp(plane.rotation.z, 0, 0.12);
      paperModel.rotation.x = THREE.MathUtils.lerp(paperModel.rotation.x, -Math.PI / 2, 0.14);
      pathLine.geometry.setDrawRange(0, trailPoints.length);
      if (landingProgress < 1) {
        sceneRef.current.flightRaf = requestAnimationFrame(step);
      } else {
        sceneRef.current.isFlying = false;
        state.hasResult = true;
        forceGroup.visible = false;
        controls.enabled = cameraModeRef.current === 'overview';
        if (!isReplay) onResult(result);
        onFlightState(false);
        onFlightEvent(null);
      }
    };
    sceneRef.current.flightRaf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(sceneRef.current?.flightRaf);
      if (sceneRef.current) {
        sceneRef.current.isFlying = false;
        sceneRef.current.forceGroup.visible = false;
      }
      onFlightState(false);
      onFlightEvent(null);
    };
  }, [flightRequest.id]);

  return <div className="scene" ref={host} aria-label="Suzanne 紙飛機 3D 飛行模擬畫面" />;
}

function Slider({ label, value, min, max, step = 1, unit, onChange }) {
  return (
    <label className="slider-row">
      <span>{label}<strong>{value}{unit}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}

function App() {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [flightRequest, setFlightRequest] = useState({ id: 0, mode: 'launch' });
  const [result, setResult] = useState(null);
  const [previousResult, setPreviousResult] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [predictionFeedback, setPredictionFeedback] = useState(null);
  const [showForces, setShowForces] = useState(true);
  const [cameraMode, setCameraMode] = useState('side');
  const [isAnimating, setIsAnimating] = useState(false);
  const [flightEvent, setFlightEvent] = useState(null);
  const [liveTelemetry, setLiveTelemetry] = useState(null);
  const [tab, setTab] = useState('experiment');
  const [focusRequest, setFocusRequest] = useState({ id: 0, target: 'overview' });
  const [creaseRequest, setCreaseRequest] = useState(0);
  const [assetRequest, setAssetRequest] = useState({ id: 0, kind: '', files: [] });
  const [assetStatus, setAssetStatus] = useState({});
  const [customPlane, setCustomPlane] = useState('');
  const [restoreRequest, setRestoreRequest] = useState(0);
  const [resetRequest, setResetRequest] = useState(0);
  const [sound, setSound] = useState(false);
  const focus = target => setFocusRequest(current => ({ id: current.id + 1, target }));
  const importAsset = (kind, files) => setAssetRequest(current => ({ id: current.id + 1, kind, files }));
  const restorePlane = () => setRestoreRequest(v => v + 1);
  const update = (key, value) => {
    if (isAnimating) return;
    setSettings(current => ({ ...current, [key]: value, ...(key === 'biome' && value === 'moon' ? { weather: 'clear', wind: 0 } : {}) }));
    const target = { model: 'overview', initialAltitude: 'overview', displayScale: 'overview', clipPosition: 'nose', clipCount: 'nose', cgOffset: 'cg', elevon: 'tail', reflex: 'tail', dihedral: 'front', winglet: 'wing' }[key];
    if (target) { focus(target); playSound(key.startsWith('clip') ? 'clip' : 'fold', sound); }
    setPrediction(null);
    setPredictionFeedback(null);
  };
  const liveCg = getCg(settings);
  const cgText = `${liveCg.toFixed(0)}%`;
  const score = useMemo(() => result ? (settings.goal === 'far' ? result.distance : result.peak) : null, [result, settings.goal]);
  const comparison = result && previousResult ? {
    distance: result.distance - previousResult.distance,
    peak: result.peak - previousResult.peak,
    airtime: result.airtime - previousResult.airtime,
    deviation: Math.abs(result.deviation) - Math.abs(previousResult.deviation)
  } : null;

  const handleResult = next => {
    if (result) {
      setPreviousResult(result);
      const correct = prediction === 'farther'
        ? next.distance > result.distance + 0.01
        : prediction === 'higher'
          ? next.peak > result.peak + 0.01
          : next.airtime > result.airtime + 0.01;
      setPredictionFeedback(correct ? '預測正確！你找到了參數與飛行的關係。' : '結果和預測不同，觀察力量箭頭找找原因。');
      setPrediction(null);
    }
    setResult(next);
  };

  const launch = () => {
    if (isAnimating || (result && !prediction)) return;
    playSound('launch', sound);
    setFlightRequest(current => ({ id: current.id + 1, mode: 'launch' }));
  };

  const replay = () => {
    if (isAnimating || !result) return;
    setSettings({ ...result.settings });
    setFlightRequest(current => ({ id: current.id + 1, mode: 'replay' }));
  };

  const setWindDirection = windDirection => {
    setSettings(current => ({
      ...current,
      windDirection,
      wind: windDirection === 'front' ? current.wind : Math.abs(current.wind) || 6
    }));
    setPrediction(null);
    setPredictionFeedback(null);
  };

  const setWeatherMode = weather => {
    setSettings(current => ({
      ...current,
      weather,
      wind: weather === 'typhoon' ? 10 : weather === 'clear' ? 0 : current.wind
    }));
    setPrediction(null);
    setPredictionFeedback(null);
  };

  const setClipFromPointer = (clientX, element) => {
    const rect = element.getBoundingClientRect();
    const position = clamp(5 + ((clientX - rect.left) / rect.width) * 70, 5, 75);
    update('clipPosition', Math.round(position));
  };

  const reset = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    setResult(null);
    setPreviousResult(null);
    setPrediction(null);
    setPredictionFeedback(null);
    setCameraMode('side');
    setIsAnimating(false);
    setFlightRequest({ id: 0, mode: 'launch' });
    setFlightEvent(null);
    setLiveTelemetry(null);
    setResetRequest(v => v + 1); restorePlane();
  };

  return (
    <main className="app-shell">
      <FlightScene settings={settings} flightRequest={flightRequest} replayResult={result} onResult={handleResult} onFlightState={setIsAnimating} onFlightEvent={setFlightEvent} onTelemetry={setLiveTelemetry} showForces={showForces} cameraMode={cameraMode} focusRequest={focusRequest} creaseRequest={creaseRequest} assetRequest={assetRequest} onAssetStatus={setAssetStatus} onCustomPlane={setCustomPlane} restoreRequest={restoreRequest} resetRequest={resetRequest} />
      <header className="topbar">
        <div className="brand"><Plane size={22} /><span>Suzanne <b>探索實驗室</b></span></div>
        <div className="record">{BIOMES[settings.biome].label} · {MODELS[settings.model].label}</div>
        <button className="force-toggle" onClick={() => setTab('import')}>匯入模型</button>
        <button className="force-toggle" aria-pressed={sound} onClick={() => setSound(v => !v)}>音效{sound ? '開' : '關'}</button>
        <button className="force-toggle" aria-pressed={showForces} onClick={() => setShowForces(value => !value)}>
          {showForces ? <Eye size={17} /> : <EyeOff size={17} />}受力
        </button>
        <button className="icon-button" disabled={assetStatus.busy} onClick={reset} title="重設所有參數" aria-label="重設所有參數"><RotateCcw size={19} /></button>
      </header>

      {showForces && <div className="force-legend" aria-label="飛行力量圖例">
        <span><i className="lift-dot" />升力</span><span><i className="weight-dot" />重力</span>
        <span><i className="thrust-dot" />前進</span><span><i className="drag-dot" />阻力</span>
      </div>}

      <div className="view-modes" aria-label="觀看模式">
        <button className={cameraMode === 'side' ? 'active' : ''} onClick={() => setCameraMode('side')}>側視</button>
        <button className={cameraMode === 'follow' ? 'active' : ''} onClick={() => setCameraMode('follow')}>跟隨</button>
        <button className={cameraMode === 'overview' ? 'active' : ''} onClick={() => setCameraMode('overview')}>自由環繞</button>
        <button className={cameraMode === 'tower' ? 'active' : ''} onClick={() => setCameraMode('tower')}>塔台</button>
      </div>

      {flightEvent && <div className={`flight-event ${flightEvent.tone}`} role="status">
        <strong>{flightEvent.label}</strong><span>{flightEvent.detail}</span>
      </div>}

      <aside className={`control-panel ${isAnimating ? 'is-flying' : ''}`} aria-busy={isAnimating}>
        <div className="panel-head">
          <div><small>調整 · 預測 · 驗證</small><h1>紙飛機探索</h1></div>
          <Info size={19} />
        </div>

        <nav className="lab-tabs" aria-label="實驗室功能">{[['experiment', '試飛'], ['plane', '機身'], ['launcher', '發射'], ['environment', '場景'], ['import', '匯入']].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
        <fieldset className="lab-fieldset" disabled={isAnimating || assetStatus.busy}>
        <LabControls tab={tab} settings={settings} update={update} focus={focus} crease={() => { setCreaseRequest(v => v + 1); focus('overview'); playSound('fold', sound); }} importAsset={importAsset} assetStatus={assetStatus} busy={assetStatus.busy} customPlane={customPlane} restorePlane={restorePlane} />
        {tab === 'experiment' && <>
        <div className="segmented" aria-label="飛行目標">
          <button className={settings.goal === 'far' ? 'active' : ''} onClick={() => update('goal', 'far')}><Crosshair size={16} />飛更遠</button>
          <button className={settings.goal === 'high' ? 'active' : ''} onClick={() => update('goal', 'high')}><Sparkles size={16} />飛更高</button>
        </div>

        <section>
          <h2>迴紋針配重</h2>
          <div className="placement-options" aria-label="迴紋針放置區域">
            <button className={settings.clipPlacement === 'body' ? 'selected' : ''} onClick={() => update('clipPlacement', 'body')}>機身</button>
            <button className={settings.clipPlacement === 'left' ? 'selected' : ''} onClick={() => update('clipPlacement', 'left')}>左翼</button>
            <button className={settings.clipPlacement === 'right' ? 'selected' : ''} onClick={() => update('clipPlacement', 'right')}>右翼</button>
            <button className={settings.clipPlacement === 'both' ? 'selected' : ''} onClick={() => update('clipPlacement', 'both')}>左右對稱</button>
          </div>
          <div className="stepper-row"><span>{settings.clipPlacement === 'both' ? '每側數量' : '數量'}</span><div className="stepper"><button onClick={() => update('clipCount', clamp(settings.clipCount - 1, 0, 5))}>−</button><strong>{settings.clipCount}</strong><button onClick={() => update('clipCount', clamp(settings.clipCount + 1, 0, 5))}>＋</button></div></div>
          <Slider label="位置" value={settings.clipPosition} min={5} max={75} unit="%" onChange={v => update('clipPosition', v)} />
          <div className="plane-map"><span className="nose">機頭</span><div
            className="mini-plane"
            role="slider"
            tabIndex={0}
            aria-label="拖曳迴紋針位置"
            aria-valuemin={5}
            aria-valuemax={75}
            aria-valuenow={settings.clipPosition}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setClipFromPointer(e.clientX, e.currentTarget); }}
            onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setClipFromPointer(e.clientX, e.currentTarget); }}
            onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft') update('clipPosition', clamp(settings.clipPosition - 1, 5, 75));
              if (e.key === 'ArrowRight') update('clipPosition', clamp(settings.clipPosition + 1, 5, 75));
            }}
          >
            <span className="safe-zone" title="建議重心區" />
            <i className="clip-marker" style={{ left: `${((settings.clipPosition - 5) / 70) * 100}%` }} />
            <i className={`cg-marker ${liveCg < 23 || liveCg > 36 ? 'warning' : ''}`} style={{ left: `${liveCg}%` }} />
          </div><span>機尾</span></div>
          <div className={`cg-status ${liveCg < 23 || liveCg > 36 ? 'warning' : ''}`}>
            <Scale size={15} /><span>重心 {liveCg.toFixed(0)}%</span><strong>{liveCg < 23 ? '機頭偏重' : liveCg > 36 ? '機尾偏重' : '穩定區'}</strong>
          </div>
          <div className={`balance-status ${settings.clipPlacement === 'left' || settings.clipPlacement === 'right' ? 'warning' : ''}`}>
            <Crosshair size={15} /><span>左右平衡</span><strong>{settings.clipPlacement === 'left' ? '左側較重' : settings.clipPlacement === 'right' ? '右側較重' : '平衡'}</strong>
          </div>
        </section>

        <section>
          <h2>投擲設定</h2>
          <Slider label="仰角" value={settings.throwAngle} min={-10} max={35} unit="°" onChange={v => update('throwAngle', v)} />
          <Slider label="力道" value={settings.throwPower} min={20} max={100} unit="%" onChange={v => update('throwPower', v)} />
          <fieldset className="lab-fieldset" disabled={settings.biome === 'moon'}>
          <Slider label="風速" value={settings.wind} min={settings.windDirection === 'front' ? -10 : 0} max={10} unit=" m/s" onChange={v => update('wind', v)} />
          <div className="wind-presets" aria-label="風速快速設定">
            {settings.windDirection === 'front' ? <>
              <button className={settings.wind === -6 ? 'selected' : ''} onClick={() => update('wind', -6)}>逆風 −6</button>
              <button className={settings.wind === 0 ? 'selected' : ''} onClick={() => update('wind', 0)}>無風</button>
              <button className={settings.wind === 6 ? 'selected' : ''} onClick={() => update('wind', 6)}>順風 ＋6</button>
            </> : <>
              <button className={settings.wind === 3 ? 'selected' : ''} onClick={() => update('wind', 3)}>微風 3</button>
              <button className={settings.wind === 6 ? 'selected' : ''} onClick={() => update('wind', 6)}>強風 6</button>
              <button className={settings.wind === 10 ? 'selected' : ''} onClick={() => update('wind', 10)}>烈風 10</button>
            </>}
          </div>
          <div className="wind-direction" aria-label="風向">
            <span>風向</span>
            <div>
              <button className={settings.windDirection === 'left' ? 'selected' : ''} onClick={() => setWindDirection('left')}>左側</button>
              <button className={settings.windDirection === 'front' ? 'selected' : ''} onClick={() => setWindDirection('front')}>正面</button>
              <button className={settings.windDirection === 'right' ? 'selected' : ''} onClick={() => setWindDirection('right')}>右側</button>
            </div>
          </div>
          {settings.windDirection !== 'front' && <p className="wind-note">側風使用風速的絕對值，會改變傾斜方向與落點。</p>}
          <h2 className="environment-title">環境</h2>
          <div className="weather-options" aria-label="環境模式">
            <button className={settings.weather === 'clear' ? 'selected' : ''} onClick={() => setWeatherMode('clear')}><Sun size={15} />晴天</button>
            <button className={settings.weather === 'rain' ? 'selected' : ''} onClick={() => setWeatherMode('rain')}><CloudRain size={15} />下雨</button>
            <button className={settings.weather === 'typhoon' ? 'selected' : ''} onClick={() => setWeatherMode('typhoon')}><Wind size={15} />颱風</button>
          </div>
          {settings.weather === 'typhoon' && <p className="typhoon-warning">颱風模式：強風 10 m/s、斜向暴雨、陣風亂流與不規則側翻。</p>}
        </fieldset>
        </section>
        </>}
        </fieldset>
        {result && <section className="prediction-section">
          <h2><Brain size={15} />先預測，再試飛</h2>
          <div className="prediction-options">
            <button className={prediction === 'farther' ? 'selected' : ''} onClick={() => setPrediction('farther')}>距離增加</button>
            <button className={prediction === 'higher' ? 'selected' : ''} onClick={() => setPrediction('higher')}>高度增加</button>
            <button className={prediction === 'longer' ? 'selected' : ''} onClick={() => setPrediction('longer')}>滯空增加</button>
          </div>
          {predictionFeedback && <p className="prediction-feedback"><CheckCircle2 size={15} />{predictionFeedback}</p>}
        </section>}

        <div className="flight-actions">
          <button className="launch" disabled={isAnimating || assetStatus.busy || Boolean(result && !prediction)} onClick={launch}><Plane size={20} />{isAnimating ? '飛行中…' : result && !prediction ? '請先選擇預測' : result ? '再次試飛' : '建立基準試飛'}</button>
          {result && <button className="replay" title={customPlane ? '自訂模型不保存重播快照，請恢復內建機型後試飛。' : '使用該次試飛參數重播'} disabled={isAnimating || assetStatus.busy || Boolean(customPlane)} onClick={replay}><Rewind size={18} />慢動作重播</button>}
        </div>
      </aside>

      <section className="telemetry" aria-live="polite">
        <div><Gauge size={17} /><span>{isAnimating ? '即時' : '預估'}{settings.goal === 'far' ? '距離' : '高度'}</span><strong>{isAnimating && liveTelemetry ? (settings.goal === 'far' ? liveTelemetry.distance : liveTelemetry.peak).toFixed(1) : score === null ? '--' : score.toFixed(1)}<small> m</small></strong></div>
        <div><Wind size={17} /><span>模擬滯空時間</span><strong>{isAnimating && liveTelemetry ? liveTelemetry.airtime.toFixed(1) : result ? result.airtime.toFixed(1) : '--'}<small> s</small></strong></div>
        <div><Crosshair size={17} /><span>重心位置</span><strong>{cgText}</strong></div>
        <p>{isAnimating && liveTelemetry ? `飛行中：高度 ${liveTelemetry.peak.toFixed(1)} m，速度 ${liveTelemetry.speed.toFixed(1)} m/s。動畫播放時間經過調整。` : comparison
          ? `和上次相比：距離 ${comparison.distance >= 0 ? '+' : ''}${comparison.distance.toFixed(1)} m，高度 ${comparison.peak >= 0 ? '+' : ''}${comparison.peak.toFixed(1)} m，側偏 ${comparison.deviation >= 0 ? '+' : ''}${comparison.deviation.toFixed(1)} m。`
          : result?.verdict ?? '先建立基準試飛，再修改一個參數並預測結果。'}</p>
      </section>

      <div className="hint">自由環繞可在飛行中旋轉 · 教學近似，非實測預報</div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
