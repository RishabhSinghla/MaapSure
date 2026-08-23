const CLASS_LIMITS = {
  I: [50000, 200000], II: [5000, 20000], III: [500, 2000], IIII: [50, 200],
};
const CLASS_MAX_INTERVALS = { I: Infinity, II: 100000, III: 10000, IIII: 1000 };
const EPSILON = Number.EPSILON * 100;
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));
const numeric = (value) => value === '' || value === null || value === undefined ? NaN : Number(value);
const finite = (value) => Number.isFinite(numeric(value));

export const RULE_PROFILE = Object.freeze({
  id: 'oiml-r76-2006-india-2026-v1',
  name: 'NAWI model and verification assessment',
  version: '1.0.0',
  status: 'Published',
  effectiveFrom: '2026-08-23',
  standard: 'OIML R 76-1:2006',
  reportFormat: 'OIML R 76-2:2007',
  jurisdictionNote: 'India Legal Metrology deployment profile - expert approval required before statutory use',
  automatedSections: ['performance', 'repeatability', 'eccentricity', 'zeroReturn', 'temperatureZero', 'discrimination', 'creep', 'warmUp', 'voltageVariation'],
  conditionalSections: ['sensitivity', 'stability', 'tare', 'tilting', 'dampHeat', 'electricalDisturbances', 'spanStability', 'endurance', 'construction', 'checklist'],
});

export const CONDITIONAL_TESTS = Object.freeze([
  { id: 'sensitivity', name: 'Sensitivity', clause: 'R 76-2, 5.4' },
  { id: 'stability', name: 'Stability of equilibrium', clause: 'R 76-2, 5.8' },
  { id: 'tare', name: 'Tare weighing', clause: 'R 76-2, 5.9' },
  { id: 'tilting', name: 'Tilting', clause: 'R 76-2, 5.10' },
  { id: 'dampHeat', name: 'Damp heat, steady state', clause: 'R 76-2, 8.2' },
  { id: 'electricalDisturbances', name: 'Electrical disturbances', clause: 'R 76-2, 7' },
  { id: 'spanStability', name: 'Span stability', clause: 'R 76-2, 8.3' },
  { id: 'endurance', name: 'Endurance', clause: 'R 76-2, 8.4' },
  { id: 'construction', name: 'Examination of construction', clause: 'R 76-2, 9' },
  { id: 'checklist', name: 'Conformity checklist', clause: 'R 76-2, 10' },
]);

export function getMpe(load, verificationInterval, accuracyClass = 'III', serviceMode = false) {
  const e = numeric(verificationInterval);
  if (!Number.isFinite(e) || e <= 0) throw new Error('Verification interval must be greater than zero.');
  const intervals = Math.abs(Number(load)) / e;
  const limits = CLASS_LIMITS[accuracyClass] || CLASS_LIMITS.III;
  const multiplier = intervals <= limits[0] ? 0.5 : intervals <= limits[1] ? 1 : 1.5;
  return round(multiplier * e * (serviceMode ? 2 : 1));
}

function section(name, clause, complete, passed, summary, details = {}) {
  return { name, clause, complete, passed: complete && passed, summary, ...details };
}

function evaluatePerformance(rows, instrument) {
  const source = Array.isArray(rows) ? rows : [];
  const complete = source.length >= 3 && source.every((row) => finite(row.load) && finite(row.indication));
  const results = source.map((row, index) => {
    const load = numeric(row.load); const indication = numeric(row.indication);
    if (!Number.isFinite(load) || !Number.isFinite(indication)) return { id: row.id || `performance-${index + 1}`, load, indication, error: null, mpe: null, passed: false };
    const error = round(indication - load); const mpe = getMpe(load, instrument.verificationInterval, instrument.accuracyClass);
    return { id: row.id || `performance-${index + 1}`, load, indication, correctedError: error, error, mpe, passed: Math.abs(error) <= mpe + EPSILON };
  });
  return section('Weighing performance', '3.5.1, Table 6', complete, results.every((row) => row.passed), complete ? `${results.filter((row) => row.passed).length}/${results.length} load points within permitted error` : 'At least three complete load points are required', { results });
}

function evaluateRepeatability(value, instrument) {
  const load = numeric(value?.load);
  const readings = Array.isArray(value?.readings) ? value.readings.map(numeric).filter(Number.isFinite) : [];
  const complete = Number.isFinite(load) && readings.length >= 3;
  const spread = readings.length ? round(Math.max(...readings) - Math.min(...readings)) : null;
  const mpe = Number.isFinite(load) ? getMpe(load, instrument.verificationInterval, instrument.accuracyClass) : null;
  const passed = complete && spread <= mpe + EPSILON && readings.every((reading) => Math.abs(reading - load) <= mpe + EPSILON);
  return section('Repeatability', '3.6.1', complete, passed, complete ? `Spread ${spread} ${instrument.unit}; limit ${mpe} ${instrument.unit}; every reading also checked` : 'At least three readings and the applied load are required', { load, readings, spread, mpe });
}

function evaluateEccentricity(value, instrument) {
  const load = numeric(value?.load); const source = Array.isArray(value?.positions) ? value.positions : [];
  const complete = Number.isFinite(load) && source.length >= 4 && source.every((row) => finite(row.indication));
  const mpe = Number.isFinite(load) ? getMpe(load, instrument.verificationInterval, instrument.accuracyClass) : null;
  const positions = source.map((row, index) => {
    const indication = numeric(row.indication); const error = Number.isFinite(indication) && Number.isFinite(load) ? round(indication - load) : null;
    return { position: row.position || `Position ${index + 1}`, indication, error, mpe, passed: error !== null && Math.abs(error) <= mpe + EPSILON };
  });
  return section('Eccentric loading', '3.6.2', complete, positions.every((row) => row.passed), complete ? `${positions.filter((row) => row.passed).length}/${positions.length} positions within permitted error` : 'Applied load and at least four position readings are required', { load, positions, mpe });
}

function evaluateZeroReturn(value, instrument) {
  const reading = numeric(value?.reading); const complete = Number.isFinite(reading);
  const limit = round(0.5 * numeric(instrument.verificationInterval));
  return section('Return to zero', '3.9.4.2', complete, complete && Math.abs(reading) <= limit + EPSILON, complete ? `Zero change ${reading} ${instrument.unit}; limit ${limit} ${instrument.unit}` : 'Zero-return reading is required', { reading, limit });
}

function evaluateTemperatureZero(value, instrument) {
  const points = Array.isArray(value?.points) ? value.points.map((point) => ({ temperature: numeric(point.temperature), zero: numeric(point.zero) })).filter((point) => Number.isFinite(point.temperature) && Number.isFinite(point.zero)).sort((a, b) => a.temperature - b.temperature) : [];
  const interval = instrument.accuracyClass === 'I' ? 1 : 5;
  const complete = points.length >= 2;
  const comparisons = points.slice(1).map((point, index) => {
    const previous = points[index]; const temperatureChange = point.temperature - previous.temperature;
    const zeroChange = round(point.zero - previous.zero); const limit = round(numeric(instrument.verificationInterval) * Math.max(1, temperatureChange / interval));
    return { from: previous.temperature, to: point.temperature, zeroChange, limit, passed: Math.abs(zeroChange) < limit + EPSILON };
  });
  return section('Temperature effect on no-load indication', 'R 76-2, 5.2', complete, comparisons.every((item) => item.passed), complete ? `${comparisons.filter((item) => item.passed).length}/${comparisons.length} temperature transitions within limit` : 'At least two temperature and zero-indication pairs are required', { points, comparisons });
}

function evaluateDiscrimination(value, instrument) {
  const before = numeric(value?.before); const after = numeric(value?.after); const extraLoad = numeric(value?.extraLoad);
  const d = numeric(instrument.actualScaleInterval || instrument.verificationInterval);
  const complete = [before, after, extraLoad].every(Number.isFinite);
  const response = complete ? round(after - before) : null;
  const loadValid = complete && extraLoad >= 1.3 * d - EPSILON && extraLoad <= 1.5 * d + EPSILON;
  const passed = complete && response >= d - EPSILON && loadValid;
  return section('Discrimination (digital indication)', 'R 76-2, 5.3', complete, passed, complete ? `Response ${response} ${instrument.unit}; required at least ${d} after an extra load near 1.4d` : 'Before, after and extra-load values are required', { before, after, extraLoad, response, limit: d, loadValid });
}

function evaluateCreep(value, instrument) {
  const initial = numeric(value?.initial); const at15 = numeric(value?.at15); const at30 = numeric(value?.at30);
  const complete = [initial, at15, at30].every(Number.isFinite); const e = numeric(instrument.verificationInterval);
  const totalChange = complete ? round(at30 - initial) : null; const lateChange = complete ? round(at30 - at15) : null;
  const passed = complete && Math.abs(totalChange) <= 0.5 * e + EPSILON && Math.abs(lateChange) <= 0.2 * e + EPSILON;
  return section('Creep', 'R 76-2, 5.7', complete, passed, complete ? `30-minute change ${totalChange}; 15-to-30-minute change ${lateChange} ${instrument.unit}` : 'Initial, 15-minute and 30-minute indications are required', { initial, at15, at30, totalChange, lateChange, totalLimit: round(0.5 * e), lateLimit: round(0.2 * e) });
}

function evaluateWarmUp(value, instrument) {
  const source = Array.isArray(value?.points) ? value.points : [];
  const points = source.map((point) => ({ minutes: numeric(point.minutes), zero: numeric(point.zero), load: numeric(point.load), indication: numeric(point.indication) }));
  const requiredMinutes = [0, 5, 15, 30];
  const complete = requiredMinutes.every((minutes) => points.some((point) => point.minutes === minutes && [point.zero, point.load, point.indication].every(Number.isFinite)));
  const results = points.filter((point) => [point.zero, point.load, point.indication].every(Number.isFinite)).map((point) => {
    const correctedError = round((point.indication - point.load) - point.zero); const mpe = getMpe(point.load, instrument.verificationInterval, instrument.accuracyClass);
    return { ...point, correctedError, mpe, passed: Math.abs(correctedError) <= mpe + EPSILON };
  });
  return section('Warm-up time', 'R 76-2, 5.11', complete, results.every((item) => item.passed), complete ? `${results.filter((item) => item.passed).length}/${results.length} timed readings within permitted error` : 'Complete readings at 0, 5, 15 and 30 minutes are required', { results });
}

function evaluateVoltage(value, instrument) {
  const source = Array.isArray(value?.points) ? value.points : [];
  const points = source.map((point) => ({ voltage: numeric(point.voltage), load: numeric(point.load), indication: numeric(point.indication) })).filter((point) => [point.voltage, point.load, point.indication].every(Number.isFinite));
  const complete = points.length >= 3;
  const results = points.map((point) => { const error = round(point.indication - point.load); const mpe = getMpe(point.load, instrument.verificationInterval, instrument.accuracyClass); return { ...point, error, mpe, passed: Math.abs(error) <= mpe + EPSILON }; });
  return section('Voltage variation', 'R 76-2, 6.2', complete, results.every((item) => item.passed), complete ? `${results.filter((item) => item.passed).length}/${results.length} voltage conditions within permitted error` : 'At least three voltage conditions are required', { results });
}

function evaluateConditionalTests(values) {
  const map = new Map((Array.isArray(values) ? values : []).map((item) => [item.id, item]));
  const results = CONDITIONAL_TESTS.map((definition) => {
    const value = map.get(definition.id) || {};
    const applicability = value.applicability === 'Applicable' ? 'Applicable' : value.applicability === 'Not applicable' ? 'Not applicable' : 'Not assessed';
    const result = value.result === 'PASS' || value.result === 'FAIL' ? value.result : 'NOT TESTED';
    const reason = String(value.reason || '').trim(); const evidenceNote = String(value.evidenceNote || '').trim();
    const complete = applicability === 'Applicable' ? result !== 'NOT TESTED' && evidenceNote.length >= 3 : applicability === 'Not applicable' && reason.length >= 3;
    return { ...definition, applicability, result, reason, evidenceNote, complete, passed: complete && (applicability === 'Not applicable' || result === 'PASS') };
  });
  return { complete: results.every((item) => item.complete), passed: results.every((item) => item.passed), results, summary: `${results.filter((item) => item.complete).length}/${results.length} conditional sections dispositioned` };
}

function diagnosticReview(sections, instrument) {
  const findings = [];
  const performance = sections.performance;
  const errors = performance.results.filter((row) => typeof row.error === 'number').map((row) => row.error);
  const sameDirection = errors.length > 2 && (errors.filter((error) => error > 0).length >= errors.length - 1 || errors.filter((error) => error < 0).length >= errors.length - 1);
  const risingErrors = errors.length > 2 && errors.slice(1).every((value, index) => Math.abs(value) >= Math.abs(errors[index]));
  if (!performance.passed && performance.complete && sameDirection) findings.push({ severity: 'high', title: 'Possible calibration bias', detail: 'Most load points drift in one direction. Check span calibration and traceable reference weights.' });
  if (!performance.passed && performance.complete && risingErrors) findings.push({ severity: 'high', title: 'Error increases with load', detail: 'The error grows with applied load. Inspect load-cell linearity, mounting and calibration.' });
  if (!sections.repeatability.passed && sections.repeatability.complete) findings.push({ severity: 'high', title: 'Unstable repeated readings', detail: 'Repeated application of the same load varied beyond the permitted spread.' });
  if (!sections.eccentricity.passed && sections.eccentricity.complete) findings.push({ severity: 'medium', title: 'Corner-load imbalance', detail: 'One or more load positions responded differently. Inspect platform alignment and corner adjustment.' });
  if (!sections.zeroReturn.passed && sections.zeroReturn.complete) findings.push({ severity: 'medium', title: 'Zero does not recover', detail: 'The instrument did not return sufficiently close to zero.' });
  if (!findings.length) findings.push({ severity: 'low', title: 'No critical pattern detected', detail: `No failure pattern was found in the completed automated checks for this Class ${instrument.accuracyClass} instrument.` });
  return { risk: findings.some((item) => item.severity === 'high') ? 'High' : findings.some((item) => item.severity === 'medium') ? 'Medium' : 'Low', findings, method: 'Explainable deterministic review only. AI does not make the statutory pass, fail or approval decision.' };
}

export function evaluateTest(input, instrument, profile = RULE_PROFILE) {
  if (!instrument) throw new Error('Instrument is required.');
  const sections = {
    performance: evaluatePerformance(input.performance, instrument),
    repeatability: evaluateRepeatability(input.repeatability, instrument),
    eccentricity: evaluateEccentricity(input.eccentricity, instrument),
    zeroReturn: evaluateZeroReturn(input.zeroReturn, instrument),
    temperatureZero: evaluateTemperatureZero(input.temperatureZero, instrument),
    discrimination: evaluateDiscrimination(input.discrimination, instrument),
    creep: evaluateCreep(input.creep, instrument),
    warmUp: evaluateWarmUp(input.warmUp, instrument),
    voltageVariation: evaluateVoltage(input.voltageVariation, instrument),
  };
  const conditional = evaluateConditionalTests(input.conditionalTests);
  const complete = Object.values(sections).every((item) => item.complete) && conditional.complete;
  const passed = complete && Object.values(sections).every((item) => item.passed) && conditional.passed;
  const hasFailure = Object.values(sections).some((item) => item.complete && !item.passed) || conditional.results.some((item) => item.complete && !item.passed);
  return {
    complete, passed, status: !complete ? (hasFailure ? 'INCOMPLETE - FAILURES FOUND' : 'INCOMPLETE') : passed ? 'PASS' : 'FAIL',
    sections, conditional, diagnostic: diagnosticReview(sections, instrument),
    standard: profile.standard, reportFormat: profile.reportFormat, ruleProfileId: profile.id, ruleVersion: profile.version,
    scope: 'Controlled laboratory decision support', calculatedAt: new Date().toISOString(),
  };
}

export function validateInstrument(instrument) {
  const max = numeric(instrument.maxCapacity); const min = numeric(instrument.minCapacity); const e = numeric(instrument.verificationInterval); const d = numeric(instrument.actualScaleInterval || e);
  const n = e > 0 ? max / e : 0; const maxIntervals = CLASS_MAX_INTERVALS[instrument.accuracyClass] ?? CLASS_MAX_INTERVALS.III;
  const errors = [];
  if (!instrument.manufacturer?.trim()) errors.push('Manufacturer is required.');
  if (!instrument.model?.trim()) errors.push('Model is required.');
  if (!instrument.serialNumber?.trim()) errors.push('Serial number is required.');
  if (!['I', 'II', 'III', 'IIII'].includes(instrument.accuracyClass)) errors.push('Accuracy class must be I, II, III or IIII.');
  if (!Number.isFinite(max) || max <= 0) errors.push('Maximum capacity must be greater than zero.');
  if (!Number.isFinite(e) || e <= 0) errors.push('Verification interval must be greater than zero.');
  if (!Number.isFinite(d) || d <= 0) errors.push('Actual scale interval must be greater than zero.');
  if (!Number.isFinite(min) || min < 0 || min > max) errors.push('Minimum capacity must be between zero and maximum capacity.');
  if (Number.isFinite(n) && n > maxIntervals) errors.push(`Class ${instrument.accuracyClass} allows at most ${maxIntervals.toLocaleString()} verification intervals.`);
  if (instrument.unit && !['kg', 'g', 'mg', 't'].includes(instrument.unit)) errors.push('Unit must be kg, g, mg or t.');
  return { valid: errors.length === 0, errors, intervals: round(n || 0, 2) };
}

export const oimlReference = {
  title: 'OIML R 76-1:2006 with R 76-2:2007 test report structure',
  profile: RULE_PROFILE,
  clauses: { mpe: '3.5.1, Table 6', repeatability: '3.6.1', eccentricity: '3.6.2', zeroReturn: '3.9.4.2', temperatureZero: 'R 76-2, 5.2', discrimination: 'R 76-2, 5.3', creep: 'R 76-2, 5.7', warmUp: 'R 76-2, 5.11', voltageVariation: 'R 76-2, 6.2' },
};
