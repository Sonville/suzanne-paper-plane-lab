export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const MODELS = {
  glider: { label: '蘇珊滑翔翼', area: 0.055, drag: 0.025, span: 5.2, tail: -3.2 },
  dart: { label: '經典飛鏢號', area: 0.032, drag: 0.021, span: 2.6, tail: -4.6 },
  falcon: { label: '獵鷹後掠型', area: 0.043, drag: 0.024, span: 4.2, tail: -4.8 },
  shuttle: { label: '太空梭型', area: 0.061, drag: 0.041, span: 4.8, tail: -4.5 },
};
export const BIOMES = {
  lab: { label: '風洞實驗室', sky: '#dce9ef', ground: '#8fa6ad', gravity: 9.81, density: 1.225, objects: '風扇、機櫃、儲氣罐、測量架、安全錐' },
  desert: { label: '烈日沙漠', sky: '#f1d5a8', ground: '#d6ae6f', gravity: 9.81, density: 1.15, objects: '仙人掌、砂岩、沙丘、灌木、標旗' },
  grassland: { label: '高原草原', sky: '#dfeee8', ground: '#91b97d', gravity: 9.81, density: 1.1, objects: '松樹、灌木、岩石、風車、帳篷' },
  cyber: { label: '霓虹都市', sky: '#11172c', ground: '#263149', gravity: 9.81, density: 1.225, objects: '摩天樓、廣告牌、天線、光環、配電箱' },
  moon: { label: '月球基地', sky: '#090e20', ground: '#858b98', gravity: 1.62, density: 0, objects: '環形山、月岩、登月艙、太陽能板、通訊碟' },
};
export const DEFAULT_SETTINGS = {
  goal: 'far', model: 'glider', clipCount: 1, clipPosition: 22, clipPlacement: 'body',
  throwAngle: 10, throwPower: 55, wind: 0, windDirection: 'front', weather: 'clear',
  biome: 'grassland', initialAltitude: 1.35, elevon: 2, reflex: 2, dihedral: 6,
  winglet: 15, seam: 65, roughness: 0.72, cgOffset: 0, displayScale: 1,
  launcher: 'hand', tension: 100,
};
export const clipMultiplier = placement => placement === 'both' ? 2 : 1;
export function getCg(s) {
  return clamp(37 - s.clipCount * clipMultiplier(s.clipPlacement) * (45 - s.clipPosition) * 0.11 + s.cgOffset, 5, 75);
}

// Educational approximation, not a calibrated aerodynamic solver. Coordinates: +X forward, +Y up.
// Visual scale and the chosen learning goal deliberately do not change the trajectory.
export function simulateFlight(input) {
  const s = { ...DEFAULT_SETTINGS, ...input };
  const env = BIOMES[s.biome];
  const model = MODELS[s.model];
  const vacuum = env.density === 0;
  const count = s.clipCount * clipMultiplier(s.clipPlacement);
  const cg = getCg(s);
  const stability = clamp(1 - Math.abs(cg - 30) / 32, 0.3, 1);
  const side = s.clipCount === 0 ? 0 : s.clipPlacement === 'left' ? 1 : s.clipPlacement === 'right' ? -1 : 0;
  const crossSign = s.windDirection === 'left' ? 1 : s.windDirection === 'right' ? -1 : 0;
  const windX = !vacuum && s.windDirection === 'front' ? s.wind : 0;
  const cross = vacuum ? 0 : crossSign * Math.abs(s.wind);
  const mass = 0.005 + count * 0.00045;
  const baseSpeed = 5.8 + s.throwPower * 0.12;
  // Illustrative spring: k=8 N/m, extension=0.15m at 100%, efficiency=25%.
  const springEnergy = s.launcher === 'slingshot' ? 0.5 * 8 * (0.15 * s.tension / 100) ** 2 * 0.25 : 0;
  const speed0 = Math.sqrt(baseSpeed ** 2 + 2 * springEnergy / mass);
  const angle = s.throwAngle * Math.PI / 180;
  let x = 0, y = s.initialAltitude, z = 0, t = 0;
  let vx = speed0 * Math.cos(angle), vy = speed0 * Math.sin(angle), vz = 0;
  let peak = y;
  const points = [{ x, y, z, t, roll: 0, lift: 0, drag: 0, speed: speed0, turbulence: 0 }];
  const dt = 0.02;
  while ((y > 0 || t === 0) && t < 60) {
    const old = { x, y, z, t };
    const relativeV = Math.max(0.2, vx - windX * 0.25);
    const trim = clamp(1 + (s.elevon + s.reflex) * 0.018, 0.5, 1.4);
    const stall = clamp(1 - Math.max(0, Math.abs(s.elevon + s.reflex) - 18) * 0.035, 0.35, 1);
    const lift = vacuum ? 0 : 8.65 * (relativeV / speed0) ** 2 * stability * clamp(0.00545 / mass, 0.6, 1.1)
      * model.area / 0.055 * trim * stall * env.density / 1.225;
    const drag = vacuum ? 0 : model.drag * relativeV ** 2 * (1 + (1 - stability) * 1.6)
      * (1 + s.roughness * 0.15) * (1.12 - s.seam * 0.0012) * (1 - s.winglet / 90 * 0.15)
      * (1 + Math.abs(s.elevon + s.reflex) * 0.008) * env.density / 1.225;
    const turbulence = !vacuum && s.weather === 'typhoon'
      ? (Math.sin(t * 5.1 + 0.7) * 0.56 + Math.sin(t * 11.7 + 1.9) * 0.3) * (0.7 + Math.abs(s.wind) * 0.075) : 0;
    const roll = vacuum ? 0 : (side * count * 0.07 + cross * 0.012 + turbulence * 0.085)
      * (1 - Math.exp(-t * 2.4)) / (1 + Math.max(-10, s.dihedral) * 0.018);
    vx = Math.max(0, vx + (windX * 0.3 - drag + turbulence * 0.12) * dt);
    vy += (lift - env.gravity - (vacuum ? 0 : clamp((30 - cg) / 13, -0.75, 0.75) * 2.5 + vy * 0.12) + turbulence * 1.25) * dt;
    vz += (vacuum ? 0 : Math.sin(roll) * lift * 1.8 + cross * 0.46 + turbulence * 2.2 - vz * 0.38) * dt;
    x += vx * dt; y += vy * dt; z += vz * dt; t += dt;
    if (y < 0) {
      const fraction = old.y > 0 ? old.y / (old.y - y) : 0;
      x = old.x + (x - old.x) * fraction; z = old.z + (z - old.z) * fraction;
      t = old.t + dt * fraction; y = 0;
    }
    peak = Math.max(peak, y);
    points.push({ x, y, z, t, roll, lift, drag, speed: Math.hypot(vx, vy, vz), turbulence });
    if (y === 0) break;
  }
  const landed = y === 0;
  const peakIndex = points.reduce((best, p, i) => p.y > points[best].y ? i : best, 0);
  const events = [{ progress: peakIndex / (points.length - 1), label: '到達最高點', detail: `${peak.toFixed(1)} 公尺`, tone: 'peak' }];
  if (!vacuum && s.weather === 'typhoon') events.push({ progress: 0.5, label: '陣風亂流', detail: '觀察姿態與側偏變化', tone: 'wind' });
  if (stability < 0.72 && !vacuum) events.push({ progress: 0.3, label: '重心不穩', detail: '嘗試調整配重位置', tone: 'warning' });
  events.sort((a, b) => a.progress - b.progress);
  const verdict = !landed ? '達到 60 秒模擬上限，尚未落地。' : vacuum ? '月球真空模式：沒有空氣升力、阻力或風，沿彈道落地。'
    : stability < 0.72 ? '重心偏離穩定區，請比較調整配重後的結果。' : '這是簡化教學估算，請一次改變一個參數進行比較。';
  return { settings: s, points, distance: x, peak, airtime: t, deviation: z, cg, stability, verdict, events, landed, speed0 };
}
