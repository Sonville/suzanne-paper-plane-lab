from pathlib import Path
p=Path(r'C:\Users\user\Desktop\1028\suzanne-paper-plane-lab-B1229058\src\main.jsx')
s=p.read_text(encoding='utf-8')
def replace(old,new):
    global s
    assert old in s, old[:150]
    s=s.replace(old,new)
replace("import './styles.css';", """import './styles.css';
import { DEFAULT_SETTINGS, BIOMES, MODELS, clamp, simulateFlight, getCg } from './simulation.js';
import { makePlane, updatePlane, clearance, makeLauncher, updateLauncher, makeBiome, animateBiome, disposeObject, loadModel, normalizeModel, playSound } from './lab-scene.js';
import LabControls from './LabControls.jsx';""")
start=s.index('const clamp ='); end=s.index('function makeClip()')
s=s[:start]+"const WORLD_X_SCALE = 1.25;\nconst WORLD_Y_SCALE = 1.1;\nconst WORLD_Z_SCALE = 1.35;\n\n"+s[end:]
# Remove old static environment generators; replacement contains all five biomes.
start=s.index('function makeTree('); end=s.index('function makeGrassTexture(')
s=s[:start]+s[end:]
start=s.index('function makeEnvironment('); end=s.index('function FlightScene(')
s=s[:start]+s[end:]
replace('showForces, cameraMode }) {','showForces, cameraMode, focusRequest, creaseRequest, assetRequest, onAssetStatus, onCustomPlane, restoreRequest, resetRequest }) {')
replace('const cameraModeRef = useRef(cameraMode);', '''const cameraModeRef = useRef(cameraMode);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const assetEpoch = useRef(0);''')
replace('0.1, 180);', '0.1, 2000);')
replace('controls.maxDistance = 34;', 'controls.maxDistance = 500;')
replace('const environment = makeEnvironment();', 'const environment = makeBiome(settings.biome);')
replace('const plane = makePlane();', 'const plane = makePlane(settings);')
replace('const clips = new THREE.Group();', 'const clips = new THREE.Group();\n    clips.userData.clips = true;')
replace('scene.add(environment);', '''scene.add(environment);
    const launcher = makeLauncher(settings); scene.add(launcher);
    const customObjects = new THREE.Group(); scene.add(customObjects);''')
replace('hemisphere, sun, ground, trees,', '''hemisphere, sun, ground, trees, environment, launcher, customObjects, customBackground: null,
      tuning: settings, focusActive: false, assetEpoch: 0,''')
replace('const look = weatherLooks[state.weather];', '''const look = weatherLooks[state.weather];
      const tuning = settingsRef.current;
      updatePlane(state.plane, tuning, delta, now);
      updateLauncher(state.launcher, tuning, now);
      animateBiome(state.environment, delta);
      if (!state.isFlying && !state.hasResult) {
        state.plane.rotation.set(0, 0, 0);
        state.plane.userData.paperModel.rotation.x = -Math.PI / 2;
        state.plane.position.set(0, tuning.initialAltitude * WORLD_Y_SCALE + clearance(state.plane), 0);
      }''')
replace('scene.background.lerp(look.sky, 0.035);', "if (!state.customBackground) scene.background.lerp(new THREE.Color(BIOMES[tuning.biome].sky).lerp(look.sky, tuning.biome === 'moon' ? 0 : state.weather === 'clear' ? 0 : 0.4), 0.035);")
replace('state.ground.material.color.lerp(look.ground, 0.035);', 'state.ground.material.color.lerp(new THREE.Color(BIOMES[tuning.biome].ground), 0.035);')
replace('if (sceneRef.current.cameraGoal) {', "if (sceneRef.current.cameraGoal && (cameraModeRef.current !== 'overview' || state.focusActive)) {")
replace('renderer.dispose();', 'assetEpoch.current += 1;\n      disposeObject(scene);\n      renderer.dispose();')
replace("if (!sceneRef.current || sceneRef.current.isFlying) return;", "if (!sceneRef.current || sceneRef.current.isFlying) return;\n    sceneRef.current.focusActive = false;")
replace("sceneRef.current.windSpeed = settings.wind;", "sceneRef.current.windSpeed = settings.biome === 'moon' ? 0 : settings.wind;")
replace('}, [settings.wind, settings.windDirection]);', '}, [settings.wind, settings.windDirection, settings.biome]);')
start=s.index('  useEffect(() => {\n    if (!sceneRef.current) return;\n    const state = sceneRef.current;\n    state.weather')
end=s.index('  useEffect(() => {\n    if (!sceneRef.current) return;\n    const { clips }', start)
s=s[:start]+'''  useEffect(() => {
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
    state.hasResult = false; onCustomPlane('');
  }, [settings.model, restoreRequest]);

  useEffect(() => {
    const state = sceneRef.current; if (!state || !resetRequest) return;
    assetEpoch.current += 1;
    state.hasResult = false; state.focusActive = false;
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
    state.targetGoal.copy(center); state.controls.enabled = true; state.focusActive = true;
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
          if (!/\\.(jpe?g|png)$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new Error('背景需為 10 MB 以內的 JPG 或 PNG。');
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

''' + s[end:]
replace('clips.clear();', 'disposeObject(clips); clips.clear();')
replace('clip.position.set(x, side === 0 ? spread : side * wingOffset + spread, 0.11 + i * 0.025);', 'clip.userData.targetZ = 0.11 + i * 0.025;\n        clip.position.set(x, side === 0 ? spread : side * wingOffset + spread, 1.4 + i * 0.025);')
replace('const result = isReplay ? replayResult : simulateFlight(settings);', 'const result = isReplay ? replayResult : simulateFlight(settings);\n    const flightSettings = result.settings;\n    const state = sceneRef.current;\n    state.focusActive = false; state.launcher.userData.fired = performance.now();\n    state.hasResult = false;')
replace('const coords = result.points.map(p => new THREE.Vector3(p.x * WORLD_X_SCALE, p.y * WORLD_Y_SCALE, p.z * WORLD_Z_SCALE));', '''plane.rotation.set(0, 0, 0);
    plane.userData.paperModel.rotation.x = -Math.PI / 2;
    const restClearance = clearance(plane);
    const coords = result.points.map(p => new THREE.Vector3(p.x * WORLD_X_SCALE, p.y * WORLD_Y_SCALE + restClearance, p.z * WORLD_Z_SCALE));''')
replace('controls.enabled = false;', "controls.enabled = cameraModeRef.current === 'overview';")
replace('if (isReplay && eventIndex < result.events.length', 'if (eventIndex < result.events.length')
replace('Math.abs(settings.wind) * 0.006', 'Math.abs(flightSettings.wind) * 0.006')
replace("const stormShake = settings.weather === 'typhoon'", "const stormShake = flightSettings.biome !== 'moon' && flightSettings.weather === 'typhoon'")
replace('const roll = (p.roll || 0) + naturalMotion + stormShake;', "const roll = flightSettings.biome === 'moon' ? 0 : (p.roll || 0) + naturalMotion + stormShake;")
replace("      } else {\n        cameraGoal.set(midpoint + 2", "      } else if (cameraModeRef.current === 'tower') {\n        cameraGoal.set(-8, 7 + flightSettings.initialAltitude, 12);\n        targetGoal.copy(point);\n      } else {\n        cameraGoal.set(midpoint + 2")
replace('      const landingProgress = clamp', "      if (!result.landed) { sceneRef.current.isFlying = false; state.hasResult = true; forceGroup.visible = false; if (!isReplay) onResult(result); onFlightState(false); return; }\n      const landingProgress = clamp")
replace('THREE.MathUtils.lerp(endPoint.y, 0.12, settle)', 'THREE.MathUtils.lerp(endPoint.y, restClearance, settle)')
replace('sceneRef.current.isFlying = false;\n        forceGroup.visible', 'sceneRef.current.isFlying = false;\n        state.hasResult = true;\n        forceGroup.visible')
replace('      const paperModel = plane.userData.paperModel;', '      const paperModel = plane.userData.paperModel;') if '      const paperModel = plane.userData.paperModel;' in s else None
# Enable free orbit during flight; do not force the user's camera back to a programmed path.
replace('      plane.position.copy(point);', "      plane.position.copy(point);\n      controls.enabled = cameraModeRef.current === 'overview';\n      if (controls.enabled) { const offset = point.clone().sub(controls.target); state.camera.position.add(offset); controls.target.copy(point); }")
# Do not replay with a changed aircraft/environment: restore the recorded settings first.
old="{ goal: 'far', clipCount: 1, clipPosition: 22, clipPlacement: 'body', throwAngle: 10, throwPower: 55, wind: 0, windDirection: 'front', weather: 'clear' }"
replace(old, '{ ...DEFAULT_SETTINGS }')
replace("  const [flightEvent, setFlightEvent] = useState(null);", '''  const [flightEvent, setFlightEvent] = useState(null);
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
  const restorePlane = () => setRestoreRequest(v => v + 1);''')
replace("    setSettings(current => ({ ...current, [key]: value }));", '''    if (isAnimating) return;
    setSettings(current => ({ ...current, [key]: value, ...(key === 'biome' && value === 'moon' ? { weather: 'clear', wind: 0 } : {}) }));
    const target = { model: 'overview', clipPosition: 'nose', clipCount: 'nose', cgOffset: 'cg', elevon: 'tail', reflex: 'tail', dihedral: 'front', winglet: 'wing' }[key];
    if (target) { focus(target); playSound(key.startsWith('clip') ? 'clip' : 'fold', sound); }''')
replace('    setFlightRequest(current => ({ id: current.id + 1, mode: \'launch\' }));', "    playSound('launch', sound);\n    setFlightRequest(current => ({ id: current.id + 1, mode: 'launch' }));")
replace("    setFlightRequest(current => ({ id: current.id + 1, mode: 'replay' }));", "    setSettings({ ...result.settings });\n    setFlightRequest(current => ({ id: current.id + 1, mode: 'replay' }));")
replace("    setFlightEvent(null);\n  };", "    setFlightEvent(null);\n    setResetRequest(v => v + 1); restorePlane();\n  };")
replace('showForces={showForces} cameraMode={cameraMode} />', 'showForces={showForces} cameraMode={cameraMode} focusRequest={focusRequest} creaseRequest={creaseRequest} assetRequest={assetRequest} onAssetStatus={setAssetStatus} onCustomPlane={setCustomPlane} restoreRequest={restoreRequest} resetRequest={resetRequest} />')
replace('<span>Suzanne <b>飛行實驗室</b></span>', '<span>Suzanne <b>探索實驗室</b></span>')
replace('<div className="record">世界紀錄機型 · 教學模擬</div>', '<div className="record">{BIOMES[settings.biome].label} · {MODELS[settings.model].label}</div>\n        <button className="force-toggle" onClick={() => setTab(\'import\')}>匯入模型</button>\n        <button className="force-toggle" aria-pressed={sound} onClick={() => setSound(v => !v)}>音效{sound ? \'開\' : \'關\'}</button>')
replace('className="icon-button" onClick={reset}', 'className="icon-button" disabled={assetStatus.busy} onClick={reset}')
replace("onClick={() => setCameraMode('overview')}>全景</button>", "onClick={() => setCameraMode('overview')}>自由環繞</button>\n        <button className={cameraMode === 'tower' ? 'active' : ''} onClick={() => setCameraMode('tower')}>塔台</button>")
replace('<div><small>任務 01</small><h1>調整 Suzanne</h1></div>', '<div><small>調整 · 預測 · 驗證</small><h1>紙飛機探索</h1></div>')
replace('        <div className="segmented" aria-label="飛行目標">', '''        <nav className="lab-tabs" aria-label="實驗室功能">{[['experiment', '試飛'], ['plane', '機身'], ['launcher', '發射'], ['environment', '場景'], ['import', '匯入']].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
        <fieldset className="lab-fieldset" disabled={isAnimating || assetStatus.busy}>
        <LabControls tab={tab} settings={settings} update={update} focus={focus} crease={() => { setCreaseRequest(v => v + 1); focus('overview'); playSound('fold', sound); }} importAsset={importAsset} assetStatus={assetStatus} busy={assetStatus.busy} customPlane={customPlane} restorePlane={restorePlane} />
        {tab === 'experiment' && <>
        <div className="segmented" aria-label="飛行目標">''')
replace('clamp(settings.clipCount - 1, 0, 3)', 'clamp(settings.clipCount - 1, 0, 5)')
replace('clamp(settings.clipCount + 1, 0, 3)', 'clamp(settings.clipCount + 1, 0, 5)')
replace('min={0} max={30} unit="°"', 'min={-10} max={35} unit="°"')
replace('          <Slider label="風速"', '          <fieldset className="lab-fieldset" disabled={settings.biome === \'moon\'}>\n          <Slider label="風速"')
replace('        {result && <section className="prediction-section">', '        </fieldset>\n        </section>\n        </>}\n        </fieldset>\n        {result && <section className="prediction-section">')
# Previous section closing tag before the inserted fieldset must remain nested correctly.
replace('        </section>\n\n        </fieldset>\n        </section>', '        </fieldset>\n        </section>')
replace('disabled={isAnimating || Boolean(result && !prediction)}', 'disabled={isAnimating || assetStatus.busy || Boolean(result && !prediction)}')
replace('className="replay" disabled={isAnimating}', 'className="replay" disabled={isAnimating || assetStatus.busy || Boolean(customPlane)}')
replace('      <div className="hint">全景模式可拖曳旋轉 · 雙指縮放</div>', '      <div className="hint">自由環繞可在飛行中旋轉 · 教學近似，非實測預報</div>')
p.write_text(s,encoding='utf-8')
