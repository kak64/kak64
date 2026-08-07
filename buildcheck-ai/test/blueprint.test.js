import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBlueprint, parseBlueprintText, resolveStations, WET_ROOM_TEMPLATE } from '../src/core/blueprint.js';
import { CHECK_KINDS } from '../src/core/constants.js';

const SAMPLE_TEXT = `
בניין: A
קומה: 1
דירה: 3
חדר: חדר רחצה הורים
כיור מרכז: 45
גובה מים מקלחת: 110
ניקוז מקלחת: 42x45
גובה ניקוז מזגן: 240
הערה חופשית מהתוכנית
`;

test('parseBlueprintText: plan header fields', () => {
  const plan = parseBlueprintText(SAMPLE_TEXT);
  assert.equal(plan.building, 'A');
  assert.equal(plan.floor, 1);
  assert.equal(plan.apartment, 3);
  assert.equal(plan.rooms.length, 1);
  assert.equal(plan.rooms[0].name, 'חדר רחצה הורים');
});

test('parseBlueprintText: overrides including x-on-y pairs, notes preserved', () => {
  const plan = parseBlueprintText(SAMPLE_TEXT);
  const room = plan.rooms[0];
  assert.equal(room.overrides.sink_center, 45);
  assert.equal(room.overrides.shower_water_height, 110);
  assert.deepEqual(room.overrides.shower_drain_center, { x: 42, y: 45 });
  assert.equal(room.overrides.ac_drain_height, 240);
  assert.ok(room.notes.includes('הערה חופשית מהתוכנית'));
});

test('parseBlueprint: object input is normalized, empty rooms get a default wet room', () => {
  const plan = parseBlueprint({ building: 'B', floor: 2 });
  assert.equal(plan.rooms.length, 1);
  assert.equal(plan.rooms[0].name, 'חדר רטוב');
});

test('parseBlueprint rejects null input', () => {
  assert.throws(() => parseBlueprint(null), TypeError);
});

test('resolveStations: defaults follow the Section 3 template, doorway-first order', () => {
  const stations = resolveStations({});
  assert.deepEqual(stations.map((s) => s.id), ['sink', 'shower', 'toilet']);
  assert.equal(stations.length, WET_ROOM_TEMPLATE.length);
});

test('resolveStations: derived plaster band and laser steps are pre-computed', () => {
  const stations = resolveStations({ overrides: { sink_center: 45 } });
  const sink = stations.find((s) => s.id === 'sink');

  const center = sink.checks.find((c) => c.id === 'sink_center');
  assert.equal(center.kind, CHECK_KINDS.WALL_OFFSET);
  assert.deepEqual(center.finished, { rawOffsetCm: 45, minCm: 47, maxCm: 48, nominalCm: 47 });

  const water = sink.checks.find((c) => c.id === 'sink_water_height');
  assert.equal(water.laser.distanceCm, 40);
  assert.equal(water.laser.direction, 'down');

  const drain = sink.checks.find((c) => c.id === 'sink_drain_height');
  assert.equal(drain.laser.distanceCm, 50);
  assert.equal(drain.laser.direction, 'down');
});

test('resolveStations: shower height 110 resolves to 10cm above the laser line', () => {
  const stations = resolveStations({});
  const shower = stations.find((s) => s.id === 'shower');
  const height = shower.checks.find((c) => c.id === 'shower_water_height');
  assert.equal(height.laser.distanceCm, 10);
  assert.equal(height.laser.direction, 'up');
});

test('resolveStations: numeric override moves the target and recomputes derivations', () => {
  const stations = resolveStations({ overrides: { sink_water_height: 65, sink_center: 50 } });
  const sink = stations.find((s) => s.id === 'sink');
  assert.equal(sink.checks.find((c) => c.id === 'sink_water_height').laser.distanceCm, 35);
  assert.equal(sink.checks.find((c) => c.id === 'sink_center').finished.nominalCm, 52);
});

test('resolveStations: ac drain height stays plan-dependent until overridden', () => {
  const noOverride = resolveStations({});
  const ac1 = noOverride.find((s) => s.id === 'toilet').checks.find((c) => c.id === 'ac_drain_height');
  assert.equal(ac1.laser, null);

  const withOverride = resolveStations({ overrides: { ac_drain_height: 240 } });
  const ac2 = withOverride.find((s) => s.id === 'toilet').checks.find((c) => c.id === 'ac_drain_height');
  assert.equal(ac2.laser.direction, 'up');
  assert.equal(ac2.laser.distanceCm, 140);
});

test('template is not mutated by overrides', () => {
  resolveStations({ overrides: { sink_center: 99 } });
  const templateSink = WET_ROOM_TEMPLATE[0].checks.find((c) => c.id === 'sink_center');
  assert.equal(templateSink.rawCm, 45);
});
