// BuildCheck AI — Formula Calculator Module (Section 5.2).
// Converts blueprint final specifications into on-site measurement steps:
// laser-datum offsets (100cm - target), plaster allowances, tolerance and
// slope evaluations. Pure functions, isomorphic (Node + browser).

/** The שטיכמוס datum: laser line opened exactly 1.00m above the finished floor. */
export const DATUM_CM = 100;

/** Plaster + ceramic (טיח וקרמיקה) allowance added to raw-wall offsets. */
export const PLASTER_ALLOWANCE_CM = Object.freeze({ min: 2, max: 3 });

/** Valid waste-water slope range (שיפועים), in percent. */
export const SLOPE_RANGE_PCT = Object.freeze({ min: 1.5, max: 2 });

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Convert a target height (from finished floor) into a tape-measure step
 * relative to the 1-meter laser line:
 *   distance = |datum - target|, direction 'down' when target < datum,
 *   'up' when target is above the laser line.
 * Examples: 60cm -> 40cm down; 50cm -> 50cm down; 110cm -> 10cm up.
 */
export function laserOffset(targetHeightCm, datumCm = DATUM_CM) {
  assertFiniteNumber(targetHeightCm, 'targetHeightCm');
  const delta = round1(datumCm - targetHeightCm);
  return {
    targetHeightCm,
    datumCm,
    distanceCm: Math.abs(delta),
    direction: delta >= 0 ? 'down' : 'up',
  };
}

/**
 * Finished-wall target for an offset given on the RAW wall in the blueprint.
 * Example: blueprint 45cm -> nominal 47cm (range 47–48cm).
 */
export function finishedWallOffset(rawOffsetCm, allowance = PLASTER_ALLOWANCE_CM) {
  assertFiniteNumber(rawOffsetCm, 'rawOffsetCm');
  return {
    rawOffsetCm,
    minCm: round1(rawOffsetCm + allowance.min),
    maxCm: round1(rawOffsetCm + allowance.max),
    nominalCm: round1(rawOffsetCm + allowance.min),
  };
}

/** Compare a field measurement against a single target with a ± tolerance. */
export function evaluateMeasurement(measuredCm, targetCm, toleranceCm = 1) {
  assertFiniteNumber(measuredCm, 'measuredCm');
  assertFiniteNumber(targetCm, 'targetCm');
  const deviationCm = round1(measuredCm - targetCm);
  return {
    measuredCm,
    targetCm,
    toleranceCm,
    deviationCm,
    ok: Math.abs(deviationCm) <= toleranceCm,
  };
}

/**
 * Compare a measurement against an allowed band [minCm, maxCm] (e.g. the
 * plaster-allowance range). deviationCm is the signed distance outside the
 * band (0 when inside); ok allows an extra ± tolerance beyond the band.
 */
export function evaluateRange(measuredCm, minCm, maxCm, toleranceCm = 0) {
  assertFiniteNumber(measuredCm, 'measuredCm');
  let deviationCm = 0;
  if (measuredCm < minCm) deviationCm = round1(measuredCm - minCm);
  else if (measuredCm > maxCm) deviationCm = round1(measuredCm - maxCm);
  return { measuredCm, minCm, maxCm, toleranceCm, deviationCm, ok: Math.abs(deviationCm) <= toleranceCm };
}

/** Slope in percent from a vertical drop over a horizontal run. */
export function slopePercent(dropCm, runCm) {
  assertFiniteNumber(dropCm, 'dropCm');
  assertFiniteNumber(runCm, 'runCm');
  if (runCm <= 0) throw new RangeError('runCm חייב להיות גדול מאפס');
  return round2((dropCm / runCm) * 100);
}

/**
 * Evaluate a waste-line slope. Accepts either {percent} directly or
 * {dropCm, runCm}. Valid when 1.5% <= slope <= 2%.
 */
export function evaluateSlope({ dropCm, runCm, percent } = {}, range = SLOPE_RANGE_PCT) {
  const pct = percent != null ? round2(percent) : slopePercent(dropCm, runCm);
  return {
    dropCm: dropCm ?? null,
    runCm: runCm ?? null,
    percent: pct,
    minPct: range.min,
    maxPct: range.max,
    ok: pct >= range.min && pct <= range.max,
  };
}

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} חייב להיות מספר, התקבל: ${value}`);
  }
}
