import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateFlight, DEFAULT_SETTINGS, BIOMES, MODELS, getCg } from '../src/simulation.js';
import { makePlane, updatePlane, clearance, makeBiome, makeLauncher, normalizeModel, disposeObject } from '../src/lab-scene.js';
import * as THREE from 'three';

test('All aircraft and biomes produce finite trajectories and valid ground contact', () => {
  for (const biome of Object.keys(BIOMES)) for (const model of Object.keys(MODELS)) for (const initialAltitude of [0, 1.35, 30]) {
    const result = simulateFlight({ ...DEFAULT_SETTINGS, biome, model, initialAltitude });
    assert.ok(result.landed, `${biome}/${model}/${initialAltitude}`);
    assert.equal(result.points.at(-1).y, 0);
    assert.ok(result.peak >= initialAltitude);
    assert.ok(result.points.every(p => Object.values(p).every(Number.isFinite) && p.y >= 0));
  }
});
test('Moon flight agrees with ballistic range and ignores wind, weather and aerodynamic tuning', () => {
  const s = { ...DEFAULT_SETTINGS, biome: 'moon', initialAltitude: 5, throwAngle: 25 };
  const flight = simulateFlight(s);
  const theta = s.throwAngle * Math.PI / 180;
  const vy = flight.speed0 * Math.sin(theta), vx = flight.speed0 * Math.cos(theta);
  const expected = vx * (vy + Math.sqrt(vy * vy + 2 * 1.62 * 5)) / 1.62;
  assert.ok(Math.abs(flight.distance - expected) / expected < 0.005);
  const storm = simulateFlight({ ...s, wind: 10, windDirection: 'left', weather: 'typhoon', winglet: 90, dihedral: 25, elevon: 20 });
  assert.deepEqual(flight.points, storm.points);
});
test('Display scaling and learning goal do not change physical results', () => {
  const a = simulateFlight(DEFAULT_SETTINGS);
  const b = simulateFlight({ ...DEFAULT_SETTINGS, displayScale: 1.8, goal: 'high' });
  assert.deepEqual(a.points, b.points);
});
test('Elastic tension increases launch energy and altitude extends lunar flight', () => {
  const low = simulateFlight({ ...DEFAULT_SETTINGS, launcher: 'slingshot', tension: 30 });
  const high = simulateFlight({ ...DEFAULT_SETTINGS, launcher: 'slingshot', tension: 150 });
  assert.ok(high.speed0 > low.speed0);
  assert.ok(simulateFlight({ ...DEFAULT_SETTINGS, biome: 'moon', initialAltitude: 30 }).airtime > simulateFlight({ ...DEFAULT_SETTINGS, biome: 'moon' }).airtime);
});
test('Clip balance and manual CG adjustments affect flight as intended', () => {
  const left = simulateFlight({ ...DEFAULT_SETTINGS, clipPlacement: 'left' });
  const right = simulateFlight({ ...DEFAULT_SETTINGS, clipPlacement: 'right' });
  assert.ok(left.deviation > 0 && right.deviation < 0);
  assert.ok(Math.abs(left.deviation + right.deviation) < 1e-9);
  assert.equal(getCg({ ...DEFAULT_SETTINGS, cgOffset: 5 }), getCg(DEFAULT_SETTINGS) + 5);
  assert.equal(simulateFlight({ ...DEFAULT_SETTINGS, clipCount: 0, clipPlacement: 'left' }).deviation, 0);
});
test('Extreme inputs remain finite including downward launches from ground', () => {
  for (const initialAltitude of [0, 30]) for (const throwAngle of [-10, 35]) for (const biome of ['moon', 'lab']) {
    const r = simulateFlight({ ...DEFAULT_SETTINGS, initialAltitude, throwAngle, biome, clipCount: 5, clipPlacement: 'both', cgOffset: -15, elevon: 20, reflex: 15, wind: 10, weather: 'typhoon', launcher: 'slingshot', tension: 150 });
    assert.ok(r.points.every(p => Object.values(p).every(Number.isFinite)));
    assert.ok(r.airtime >= 0 && r.airtime <= 60.02);
  }
});
test('Geometry rests above ground across all models and negative dihedral', () => {
  for (const model of Object.keys(MODELS)) {
    const s = { ...DEFAULT_SETTINGS, model, dihedral: -10, displayScale: 1.8, elevon: -20, reflex: -15 };
    const plane = makePlane(s); updatePlane(plane, s, 1, 0);
    plane.position.y = clearance(plane); plane.updateMatrixWorld(true);
    assert.ok(new THREE.Box3().setFromObject(plane).min.y >= 0.014);
    disposeObject(plane);
  }
});
test('Imported scenery is normalized and its bottom meets the ground', () => {
  const source = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 8)); source.position.set(40, -9, 2);
  const result = normalizeModel(source, 3), bounds = new THREE.Box3().setFromObject(result);
  assert.ok(Math.abs(bounds.min.y) < 1e-8);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x - 3) < 1e-8);
  disposeObject(result);
});
test('Five scene presets contain varied props and zero-height deck meets ground', () => {
  for (const biome of Object.keys(BIOMES)) { const group = makeBiome(biome); assert.equal(group.children.length, 50); assert.ok(group.children.every(c => Math.abs(c.position.z) >= 8)); disposeObject(group); }
  const deck = makeLauncher({ ...DEFAULT_SETTINGS, launcher: 'deck', initialAltitude: 0 });
  assert.ok(Math.abs(new THREE.Box3().setFromObject(deck).max.y) < 1e-7); disposeObject(deck);
});
