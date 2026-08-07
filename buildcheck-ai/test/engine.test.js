import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBlueprint } from '../src/core/blueprint.js';
import { InspectionEngine, StateError } from '../src/core/engine.js';
import { STATES, PRE_CHECKS, BUTTONS } from '../src/core/constants.js';

const PLAN = {
  building: 'A',
  floor: 1,
  apartment: 1,
  rooms: [{ name: 'חדר רחצה הורים', overrides: { sink_center: 45 } }],
};

function makeEngine() {
  let tick = 0;
  return new InspectionEngine(parseBlueprint(PLAN), {
    managerName: 'אוהד',
    now: () => `t${tick++}`,
  });
}

const ALL_YES = Object.fromEntries(PRE_CHECKS.map((c) => [c.id, true]));

test('engine starts at PRE_CHECK_GATE with a 5-question prompt', () => {
  const engine = makeEngine();
  assert.equal(engine.state, STATES.PRE_CHECK_GATE);
  const prompt = engine.prompt();
  assert.equal(prompt.inputs.length, 5);
  assert.equal(prompt.buttons[0].id, BUTTONS.SUBMIT_PRECHECKS);
});

test('engine requires a normalized plan with rooms', () => {
  assert.throws(() => new InspectionEngine({}), TypeError);
});

test('all five yes answers open the laser calibration state', () => {
  const engine = makeEngine();
  const result = engine.submitPreChecks(ALL_YES);
  assert.equal(result.ok, true);
  assert.equal(engine.state, STATES.LASER_CALIBRATION);
});

test('any "no" answer HALTS immediately and records the failure', () => {
  const engine = makeEngine();
  const result = engine.submitPreChecks({ ...ALL_YES, clean_floor: false });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed.map((c) => c.id), ['clean_floor']);
  assert.equal(engine.state, STATES.HALTED);
  assert.deepEqual(engine.records.haltHistory[0].failed, ['clean_floor']);
});

test('missing pre-check answers are rejected (all five are mandatory)', () => {
  const engine = makeEngine();
  assert.throws(() => engine.submitPreChecks({ risers_pressure: true }), TypeError);
  assert.equal(engine.state, STATES.PRE_CHECK_GATE);
});

test('restartAfterHalt returns to the gate; halt history is preserved', () => {
  const engine = makeEngine();
  engine.submitPreChecks({ ...ALL_YES, pipes_plugged: false });
  engine.restartAfterHalt();
  assert.equal(engine.state, STATES.PRE_CHECK_GATE);
  assert.equal(engine.records.haltHistory.length, 1);
  assert.equal(engine.submitPreChecks(ALL_YES).ok, true);
});

test('out-of-order actions throw StateError — gates cannot be skipped', () => {
  const engine = makeEngine();
  assert.throws(() => engine.confirmLaser(), StateError);
  assert.throws(() => engine.submitStation({ confirmOk: true }), StateError);
  assert.throws(() => engine.submitSlopes({ confirmOk: true }), StateError);
  assert.throws(() => engine.approveRoom(), StateError);
  assert.equal(engine.state, STATES.PRE_CHECK_GATE);
});

test('full happy path reaches APPROVED with a clean report', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();
  assert.equal(engine.state, STATES.STATION_INSPECTION);
  assert.equal(engine.currentStation.id, 'sink');

  engine.submitStation({ measurements: { sink_center: 47, sink_water_height: 60, sink_drain_height: 50 } });
  assert.equal(engine.currentStation.id, 'shower');
  engine.submitStation({
    measurements: {
      interpuck_center: 42,
      shower_water_offset: 22,
      shower_water_height: 110.5,
      shower_drain_center: { x: 42, y: 45 },
    },
  });
  engine.submitStation({ measurements: { toilet_outlet: true }, confirmOk: true });
  assert.equal(engine.state, STATES.SLOPE_CHECK);

  engine.submitSlopes([{ name: 'קו ראשי', dropCm: 3, runCm: 200 }]);
  assert.equal(engine.state, STATES.APPROVAL);

  const result = engine.approveRoom({ approvedBy: 'אוהד' });
  assert.equal(result.approved, true);
  assert.equal(engine.state, STATES.APPROVED);

  const report = engine.report();
  assert.equal(report.approved, true);
  assert.equal(report.deviations.length, 0);
  assert.equal(report.stations.length, 3);
  assert.equal(report.slopes.lines[0].percent, 1.5);
  assert.equal(report.project.room, 'חדר רחצה הורים');
});

test('station submission demands measurements or an explicit all-ok confirmation', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();
  assert.throws(() => engine.submitStation({}), TypeError);
});

test('deviations are recorded and block approval unless overridden', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();

  // 63cm measured vs 60cm target with ±1cm tolerance -> deviation of +3cm.
  engine.submitStation({ measurements: { sink_water_height: 63 }, confirmOk: true });
  assert.equal(engine.deviations.length, 1);
  assert.equal(engine.deviations[0].checkId, 'sink_water_height');
  assert.equal(engine.deviations[0].evaluation.deviationCm, 3);

  engine.submitStation({ confirmOk: true });
  engine.submitStation({ confirmOk: true });
  engine.submitSlopes({ confirmOk: true });

  const blocked = engine.approveRoom();
  assert.equal(blocked.approved, false);
  assert.equal(blocked.blocked, true);
  assert.equal(engine.state, STATES.APPROVAL);

  const approved = engine.approveRoom({ overrideDeviations: true, approvedBy: 'אוהד' });
  assert.equal(approved.approved, true);
  assert.equal(engine.report().approval.overrideUsed, true);
});

test('wall-offset measurements are judged against the plaster band 47-48 (+tolerance)', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();
  engine.submitStation({ measurements: { sink_center: 45 }, confirmOk: true }); // 2cm below band, tol 1
  assert.equal(engine.deviations.length, 1);
  assert.equal(engine.deviations[0].evaluation.deviationCm, -2);
});

test('position checks evaluate both axes', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();
  engine.submitStation({ confirmOk: true });
  engine.submitStation({ measurements: { shower_drain_center: { x: 42, y: 48 } }, confirmOk: true });
  assert.equal(engine.deviations.length, 1);
  assert.equal(engine.deviations[0].evaluation.y.ok, false);
});

test('plan_check answered "no" registers a deviation', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();
  engine.submitStation({ confirmOk: true });
  engine.submitStation({ confirmOk: true });
  engine.submitStation({ measurements: { toilet_outlet: false }, confirmOk: true });
  assert.equal(engine.deviations.length, 1);
  assert.equal(engine.deviations[0].checkId, 'toilet_outlet');
});

test('manual exception note on a station is recorded as a deviation', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();
  engine.submitStation({ confirmOk: true, note: 'צינור פגום ליד הכיור' });
  assert.equal(engine.deviations.length, 1);
  assert.match(engine.deviations[0].label, /צינור פגום/);
});

test('out-of-range slope is flagged and carried to the approval summary', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();
  engine.submitStation({ confirmOk: true });
  engine.submitStation({ confirmOk: true });
  engine.submitStation({ confirmOk: true });

  engine.submitSlopes([{ name: 'קו חדר רחצה', dropCm: 6, runCm: 200 }]); // 3%
  assert.equal(engine.deviations.length, 1);
  const prompt = engine.prompt();
  assert.equal(prompt.buttons[0].id, BUTTONS.APPROVE_OVERRIDE);
  assert.match(prompt.message, /3%/);
});

test('slope stage demands measurements or explicit spirit-level confirmation', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();
  engine.submitStation({ confirmOk: true });
  engine.submitStation({ confirmOk: true });
  engine.submitStation({ confirmOk: true });
  assert.throws(() => engine.submitSlopes({}), TypeError);
  assert.throws(() => engine.submitSlopes([]), TypeError);
});

test('prompt renders computed field steps for every station', () => {
  const engine = makeEngine();
  engine.submitPreChecks(ALL_YES);
  engine.confirmLaser();

  const sinkPrompt = engine.prompt();
  assert.match(sinkPrompt.message, /47–48 ס"מ/);
  assert.match(sinkPrompt.message, /40 ס"מ/);
  assert.match(sinkPrompt.message, /50 ס"מ/);
  assert.match(sinkPrompt.message, /מתחילים מהדלת/);

  engine.submitStation({ confirmOk: true });
  const showerPrompt = engine.prompt();
  assert.match(showerPrompt.message, /42 ס"מ/);
  assert.match(showerPrompt.message, /10 ס"מ מעל קו הלייזר/);
  assert.match(showerPrompt.message, /42 על 45 ס"מ/);
});
