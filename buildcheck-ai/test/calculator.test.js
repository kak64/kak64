import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DATUM_CM,
  laserOffset,
  finishedWallOffset,
  evaluateMeasurement,
  evaluateRange,
  slopePercent,
  evaluateSlope,
} from '../src/core/calculator.js';

test('laser offset: 60cm target -> 40cm down (spec Station A)', () => {
  assert.deepEqual(laserOffset(60), { targetHeightCm: 60, datumCm: 100, distanceCm: 40, direction: 'down' });
});

test('laser offset: 50cm drain -> 50cm down (spec Station A)', () => {
  const r = laserOffset(50);
  assert.equal(r.distanceCm, 50);
  assert.equal(r.direction, 'down');
});

test('laser offset: 110cm shower point -> 10cm ABOVE the line (spec Station B)', () => {
  const r = laserOffset(110);
  assert.equal(r.distanceCm, 10);
  assert.equal(r.direction, 'up');
});

test('laser offset: target at datum -> 0 down', () => {
  const r = laserOffset(DATUM_CM);
  assert.equal(r.distanceCm, 0);
  assert.equal(r.direction, 'down');
});

test('laser offset rejects non-numeric target', () => {
  assert.throws(() => laserOffset('60'), TypeError);
});

test('finished wall offset: blueprint 45cm -> nominal 47cm, range 47-48 (spec example)', () => {
  assert.deepEqual(finishedWallOffset(45), { rawOffsetCm: 45, minCm: 47, maxCm: 48, nominalCm: 47 });
});

test('evaluateMeasurement: within tolerance', () => {
  const r = evaluateMeasurement(60.8, 60, 1);
  assert.equal(r.ok, true);
  assert.equal(r.deviationCm, 0.8);
});

test('evaluateMeasurement: beyond tolerance flags deviation', () => {
  const r = evaluateMeasurement(63, 60, 1);
  assert.equal(r.ok, false);
  assert.equal(r.deviationCm, 3);
});

test('evaluateRange: inside plaster band is ok with zero deviation', () => {
  const r = evaluateRange(47.5, 47, 48);
  assert.equal(r.ok, true);
  assert.equal(r.deviationCm, 0);
});

test('evaluateRange: outside band beyond tolerance fails, deviation is signed', () => {
  const low = evaluateRange(45.8, 47, 48, 0.5);
  assert.equal(low.ok, false);
  assert.equal(low.deviationCm, -1.2);
  const high = evaluateRange(48.3, 47, 48, 0.5);
  assert.equal(high.ok, true);
});

test('slopePercent: 3cm over 200cm = 1.5%', () => {
  assert.equal(slopePercent(3, 200), 1.5);
});

test('slopePercent rejects non-positive run', () => {
  assert.throws(() => slopePercent(3, 0), RangeError);
});

test('evaluateSlope: 1.5%-2% band enforced (spec Station C)', () => {
  assert.equal(evaluateSlope({ dropCm: 4, runCm: 200 }).ok, true); // 2%
  assert.equal(evaluateSlope({ percent: 1.5 }).ok, true);
  assert.equal(evaluateSlope({ percent: 2.5 }).ok, false);
  assert.equal(evaluateSlope({ percent: 1.49 }).ok, false);
});
