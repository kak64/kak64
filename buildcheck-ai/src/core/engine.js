// BuildCheck AI — State Engine (Section 5.3).
// Enforces the strict sequential inspection flow:
//   PRE_CHECK_GATE -> LASER_CALIBRATION -> STATION_INSPECTION -> SLOPE_CHECK -> APPROVAL
// Any "no" on the 5 mandatory pre-checks HALTS the session immediately.
// Out-of-order actions throw StateError — there is no way to skip a gate.

import { STATES, PRE_CHECKS, CHECK_KINDS } from './constants.js';
import {
  DATUM_CM,
  evaluateMeasurement,
  evaluateRange,
  evaluateSlope,
} from './calculator.js';
import { resolveStations } from './blueprint.js';
import { buildPrompt } from './script.js';

export class StateError extends Error {
  constructor(action, actual, expected) {
    super(`הפעולה "${action}" אינה חוקית במצב ${actual} — נדרש מצב ${expected}`);
    this.name = 'StateError';
    this.action = action;
    this.actual = actual;
    this.expected = expected;
  }
}

export class InspectionEngine {
  /**
   * @param {object} plan Normalized plan from parseBlueprint().
   * @param {object} [opts]
   * @param {number} [opts.roomIndex=0] Which wet room of the plan to inspect.
   * @param {number} [opts.toleranceCm=1] Allowed ± deviation on measurements.
   * @param {string} [opts.managerName] Site manager name for the script.
   * @param {() => string} [opts.now] Timestamp source (injectable for tests).
   */
  constructor(plan, { roomIndex = 0, toleranceCm = 1, managerName = 'מנהל העבודה', now = () => new Date().toISOString() } = {}) {
    if (!plan || !Array.isArray(plan.rooms) || !plan.rooms[roomIndex]) {
      throw new TypeError('נדרשת תוכנית מנורמלת עם לפחות חדר אחד (plan.rooms)');
    }
    this.plan = plan;
    this.room = plan.rooms[roomIndex];
    this.stations = resolveStations(this.room);
    this.toleranceCm = toleranceCm;
    this.managerName = managerName;
    this.datumCm = DATUM_CM;
    this.now = now;

    this._state = STATES.PRE_CHECK_GATE;
    this.stationIndex = 0;
    this.deviations = [];
    this.log = [];
    this.records = {
      preChecks: null,
      haltHistory: [],
      laserConfirmedAt: null,
      stations: [],
      slopes: null,
      approval: null,
    };
    this._logEvent('session_started', {
      building: plan.building,
      floor: plan.floor,
      apartment: plan.apartment,
      room: this.room.name,
    });
  }

  get state() {
    return this._state;
  }

  /** Current interactive prompt (message + buttons + inputs) for the UI. */
  prompt() {
    return buildPrompt(this);
  }

  // -------------------------------------------------------------------------
  // PRE_CHECK_GATE
  // -------------------------------------------------------------------------

  /**
   * Submit the 5 mandatory pre-check answers: { [preCheckId]: boolean }.
   * All five must be present. Any false answer HALTS the session.
   */
  submitPreChecks(answers) {
    this._require('submitPreChecks', STATES.PRE_CHECK_GATE);
    const missing = PRE_CHECKS.filter((c) => typeof answers?.[c.id] !== 'boolean');
    if (missing.length > 0) {
      throw new TypeError(`חסרות תשובות (כן/לא) לבדיקות: ${missing.map((c) => c.title).join(', ')}`);
    }
    const failed = PRE_CHECKS.filter((c) => answers[c.id] === false);
    this.records.preChecks = {
      answers: PRE_CHECKS.map((c) => ({ id: c.id, title: c.title, ok: answers[c.id] })),
      at: this.now(),
    };
    if (failed.length > 0) {
      this._state = STATES.HALTED;
      this.records.haltHistory.push({ at: this.now(), failed: failed.map((c) => c.id) });
      this._logEvent('halted', { failed: failed.map((c) => c.id) });
      return { ok: false, failed };
    }
    this._state = STATES.LASER_CALIBRATION;
    this._logEvent('prechecks_passed');
    return { ok: true, failed: [] };
  }

  /** After fixing the failed conditions, return from HALTED to the gate. */
  restartAfterHalt() {
    this._require('restartAfterHalt', STATES.HALTED);
    this._state = STATES.PRE_CHECK_GATE;
    this.records.preChecks = null;
    this._logEvent('restarted_after_halt');
  }

  // -------------------------------------------------------------------------
  // LASER_CALIBRATION
  // -------------------------------------------------------------------------

  /** Manager confirms the 1m שטיכמוס laser line is set up per Section 2. */
  confirmLaser() {
    this._require('confirmLaser', STATES.LASER_CALIBRATION);
    this.records.laserConfirmedAt = this.now();
    this._state = STATES.STATION_INSPECTION;
    this.stationIndex = 0;
    this._logEvent('laser_confirmed');
  }

  // -------------------------------------------------------------------------
  // STATION_INSPECTION
  // -------------------------------------------------------------------------

  get currentStation() {
    return this._state === STATES.STATION_INSPECTION ? this.stations[this.stationIndex] : null;
  }

  /**
   * Submit results for the current station, then advance.
   * @param {object} [input]
   * @param {object} [input.measurements] { [checkId]: number | {x,y} | boolean }
   * @param {boolean} [input.confirmOk] Unmeasured checks are visually confirmed OK.
   * @param {string}  [input.note] Free-text note / exception description.
   */
  submitStation({ measurements = {}, confirmOk = false, note = '' } = {}) {
    this._require('submitStation', STATES.STATION_INSPECTION);
    const station = this.stations[this.stationIndex];
    const hasMeasurement = Object.keys(measurements).length > 0;
    if (!hasMeasurement && !confirmOk) {
      throw new TypeError('נדרשות מדידות בפועל או אישור "הכל תקין" לפני מעבר תחנה');
    }

    const results = station.checks.map((check) => this._evaluateCheck(station, check, measurements[check.id], confirmOk));
    if (note && note.trim()) {
      this.deviations.push({
        stationId: station.id,
        stationTitle: station.title,
        checkId: 'manual',
        label: `דיווח חריגה ידני: ${note.trim()}`,
        evaluation: null,
        at: this.now(),
      });
    }
    const record = { stationId: station.id, title: station.title, results, note, at: this.now() };
    this.records.stations.push(record);
    this._logEvent('station_submitted', { stationId: station.id, deviations: results.filter((r) => r.status === 'deviation').length });

    this.stationIndex += 1;
    if (this.stationIndex >= this.stations.length) {
      this._state = STATES.SLOPE_CHECK;
      this._logEvent('stations_completed');
    }
    return record;
  }

  _evaluateCheck(station, check, measured, confirmOk) {
    const base = { checkId: check.id, label: check.label, kind: check.kind };

    if (measured == null) {
      return { ...base, status: confirmOk ? 'confirmed' : 'skipped' };
    }

    let evaluation = null;
    switch (check.kind) {
      case CHECK_KINDS.WALL_OFFSET:
        evaluation = evaluateRange(measured, check.finished.minCm, check.finished.maxCm, this.toleranceCm);
        break;
      case CHECK_KINDS.FINISHED_OFFSET:
      case CHECK_KINDS.HEIGHT: {
        if (check.targetCm == null) {
          return { ...base, status: 'confirmed', measured };
        }
        evaluation = evaluateMeasurement(measured, check.targetCm, this.toleranceCm);
        break;
      }
      case CHECK_KINDS.POSITION: {
        const x = evaluateMeasurement(measured.x, check.targetXcm, this.toleranceCm);
        const y = evaluateMeasurement(measured.y, check.targetYcm, this.toleranceCm);
        evaluation = { x, y, ok: x.ok && y.ok };
        break;
      }
      case CHECK_KINDS.PLAN_CHECK:
        evaluation = { confirmedAgainstPlan: measured === true, ok: measured === true };
        break;
      default:
        throw new TypeError(`סוג בדיקה לא מוכר: ${check.kind}`);
    }

    const status = evaluation.ok ? 'ok' : 'deviation';
    const result = { ...base, status, evaluation };
    if (status === 'deviation') {
      this.deviations.push({
        stationId: station.id,
        stationTitle: station.title,
        checkId: check.id,
        label: check.label,
        evaluation,
        at: this.now(),
      });
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // SLOPE_CHECK
  // -------------------------------------------------------------------------

  /**
   * Validate waste-water slopes (1.5%–2%).
   * @param {object|Array} input Either { confirmOk: true } after a spirit-level
   *   verification, or an array of lines: [{ name, dropCm, runCm } | { name, percent }].
   */
  submitSlopes(input) {
    this._require('submitSlopes', STATES.SLOPE_CHECK);
    let lines = [];
    if (Array.isArray(input) && input.length > 0) {
      lines = input.map((line) => {
        const evaluation = evaluateSlope(line);
        if (!evaluation.ok) {
          this.deviations.push({
            stationId: 'slopes',
            stationTitle: 'שיפועים ודלוחין',
            checkId: line.name ?? 'slope',
            label: `שיפוע ${line.name ?? 'קו דלוחין'}`,
            evaluation,
            at: this.now(),
          });
        }
        return { name: line.name ?? 'קו דלוחין', ...evaluation };
      });
    } else if (!(input && input.confirmOk === true)) {
      throw new TypeError('נדרשות מדידות שיפוע או אישור "הכל תקין" לאחר בדיקה עם פלס');
    }
    this.records.slopes = { lines, confirmedOk: lines.length === 0, at: this.now() };
    this._state = STATES.APPROVAL;
    this._logEvent('slopes_submitted', { lines: lines.length, deviations: lines.filter((l) => !l.ok).length });
    return this.records.slopes;
  }

  // -------------------------------------------------------------------------
  // APPROVAL
  // -------------------------------------------------------------------------

  /**
   * Final room approval. Blocked while open deviations exist unless the
   * manager explicitly overrides (the override is recorded in the report).
   */
  approveRoom({ overrideDeviations = false, approvedBy } = {}) {
    this._require('approveRoom', STATES.APPROVAL);
    if (this.deviations.length > 0 && !overrideDeviations) {
      return { approved: false, blocked: true, deviations: this.deviations };
    }
    this.records.approval = {
      approvedBy: approvedBy ?? this.managerName,
      overrideUsed: this.deviations.length > 0,
      at: this.now(),
    };
    this._state = STATES.APPROVED;
    this._logEvent('room_approved', this.records.approval);
    return { approved: true, blocked: false, report: this.report() };
  }

  // -------------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------------

  report() {
    return {
      project: {
        building: this.plan.building,
        floor: this.plan.floor,
        apartment: this.plan.apartment,
        room: this.room.name,
      },
      state: this._state,
      datumCm: this.datumCm,
      toleranceCm: this.toleranceCm,
      preChecks: this.records.preChecks,
      haltHistory: this.records.haltHistory,
      laserConfirmedAt: this.records.laserConfirmedAt,
      stations: this.records.stations,
      slopes: this.records.slopes,
      deviations: this.deviations,
      approved: this._state === STATES.APPROVED,
      approval: this.records.approval,
      log: this.log,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  _require(action, expected) {
    if (this._state !== expected) throw new StateError(action, this._state, expected);
  }

  _logEvent(event, data = {}) {
    this.log.push({ at: this.now(), state: this._state, event, data });
  }
}
