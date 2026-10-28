export const PROGRESS_KEY = 'suzanne-challenges-v1';
export const DAILY_KEY = 'suzanne-daily-v1';

const weatherSets = ['clear', 'rain', 'snow', 'fog', 'typhoon', 'thunderstorm'];
const directions = ['front', 'left', 'right'];
const difficultyNames = ['初級', '中級', '高級'];

export const LEVELS = Array.from({ length: 30 }, (_, index) => {
  const difficulty = Math.floor(index / 10);
  const number = index % 10;
  const weather = difficulty === 0 ? ['clear', 'rain', 'clear', 'snow'][number % 4]
    : difficulty === 1 ? weatherSets[(number + 1) % weatherSets.length]
      : weatherSets[(number * 2 + 3) % weatherSets.length];
  const direction = directions[(number + difficulty) % directions.length];
  const wind = difficulty === 0 ? (number % 3) : difficulty === 1 ? 2 + (number % 4) : 5 + (number % 6);
  const obstacle = number < 2 && difficulty === 0 ? null : {
    x: 9 + (number % 5) * 2 + difficulty,
    y: 1.5 + (number % 3) * 0.7,
    z: number % 2 ? 1.1 : -1.1,
    width: difficulty === 0 ? 1.15 : difficulty === 1 ? 1.45 : 1.8,
    height: difficulty === 0 ? 1.6 : difficulty === 1 ? 2 : 2.4
  };
  const id = index + 1;
  const target = 8 + difficulty * 4 + number * 0.55;
  return {
    id, difficulty, difficultyName: difficultyNames[difficulty], name: `${difficultyNames[difficulty]}・第 ${number + 1} 關`,
    goal: 'far', weather, weatherLevel: Math.min(3, 1 + difficulty), wind,
    direction, target: Number(target.toFixed(1)), metric: 'distance', thresholds: [target, target + 2, target + 4], unit: '公尺',
    achievement: `${difficultyNames[difficulty]}飛行家 ${number + 1}`, obstacle,
    environment: `${weatherLabel(weather)}・${directionLabel(direction)} ${wind} m/s${obstacle ? '・有障礙物' : '・無障礙物'}`,
    instruction: obstacle ? `閃避障礙物，飛行距離至少 ${target.toFixed(1)} 公尺。` : `穩定飛行，達到目標距離 ${target.toFixed(1)} 公尺。`
  };
});

function weatherLabel(weather) { return ({ clear: '晴天', rain: '雨天', snow: '雪天', fog: '濃霧', typhoon: '颱風', thunderstorm: '雷雨' })[weather]; }
function directionLabel(direction) { return ({ front: '正面風', left: '左側風', right: '右側風' })[direction]; }

export function makeDailyChallenge(date = new Date()) {
  const day = typeof date === 'string' ? date : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  let seed = [...day].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const weather = weatherSets[Math.floor(random() * weatherSets.length)];
  const direction = directions[Math.floor(random() * directions.length)];
  const wind = 1 + Math.floor(random() * 9);
  const obstacle = { x: 11 + Math.floor(random() * 8), y: 1.5 + random() * 2, z: random() > 0.5 ? 1 : -1, width: 1.5, height: 2 };
  return { date: day, weather, weatherLevel: 1 + Math.floor(random() * 2), wind, direction, obstacle, target: Number((10 + random() * 12).toFixed(1)) };
}

export function rateFlight(level, result) {
  if (result.collision) return 0;
  const value = level.metric === 'deviation' ? Math.abs(result.deviation) : result[level.metric];
  if (!Number.isFinite(value)) return 0;
  return level.thresholds.filter(threshold => level.metric === 'deviation' ? value <= threshold : value >= threshold).length;
}

export const isUnlocked = (progress, id) => id === 1 || (progress[id - 1]?.stars ?? 0) >= 1;

export function recordFlight(progress, level, result, date = new Date().toISOString()) {
  const stars = rateFlight(level, result);
  const previous = progress[level.id] ?? {};
  const value = level.metric === 'deviation' ? Math.abs(result.deviation) : result[level.metric];
  const best = stars > 0 && (previous.best == null || (level.metric === 'deviation' ? value < previous.best : value > previous.best)) ? value : previous.best;
  return { ...progress, [level.id]: { ...previous, stars: Math.max(previous.stars ?? 0, stars), attempts: (previous.attempts ?? 0) + 1,
    ...(best != null ? { best } : {}), ...(stars >= 1 && !previous.completedAt ? { completedAt: date } : {}), ...(stars === 3 && !previous.masteredAt ? { masteredAt: date } : {}) } };
}

export function loadProgress(storage) {
  try {
    const data = JSON.parse(storage.getItem(PROGRESS_KEY) ?? '{}');
    const progress = {};
    for (const level of LEVELS) {
      const item = data?.[level.id];
      if (!item || !Number.isInteger(item.stars) || item.stars < 0 || item.stars > 3 || !isUnlocked(progress, level.id)) continue;
      progress[level.id] = { stars: item.stars, attempts: Number.isSafeInteger(item.attempts) && item.attempts >= 0 ? item.attempts : 0 };
      if (Number.isFinite(item.best) && item.best >= 0) progress[level.id].best = item.best;
      for (const key of ['completedAt', 'masteredAt']) if (typeof item[key] === 'string' && Number.isFinite(Date.parse(item[key])) && item.stars >= (key === 'masteredAt' ? 3 : 1)) progress[level.id][key] = item[key];
    }
    return progress;
  } catch { return {}; }
}

export function starRule(level, index) { return `${'★'.repeat(index + 1)} 距離 ≥ ${level.thresholds[index]} ${level.unit}`; }

export function collidesWithObstacle(points, obstacle) {
  if (!obstacle) return false;
  return points.some(point => Math.abs(point.x - obstacle.x) <= obstacle.width / 2 && Math.abs(point.y - obstacle.y) <= obstacle.height / 2 && Math.abs(point.z - obstacle.z) <= 0.9);
}
