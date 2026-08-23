import { applicability, coverageForInstrument, normalizeInstrument, REPORT_SECTIONS, REQUIREMENT_FAMILIES, RULE_PROFILE } from './r76Catalog.js';
import { ALL_CHECKLIST_REQUIREMENTS } from './r76Checklist.js';

export { REPORT_SECTIONS, REQUIREMENT_FAMILIES, RULE_PROFILE };
export const CONDITIONAL_TESTS = Object.freeze([]);

const CLASS_MPE_BANDS = { I: [50000, 200000], II: [5000, 20000], III: [500, 2000], IIII: [50, 200] };
const EPSILON = 1e-10;
const observedKeys = /^(indication|indications|printedValue|storedValue|zeroIndication|additionalLoad|zeroAdditionalLoad|zeroError|error|before|after|visibleDisplacement|permanentDisplacementMm|baseline|during|unloadedIndication|loadedIndication|referenceUnloaded|referenceLoaded|tiltedUnloaded|tiltedLoaded|tareError|highResolutionIndication)$/i;
const number = (value) => value === '' || value === null || value === undefined ? NaN : Number(value);
const finite = (value) => Number.isFinite(number(value));
const round = (value, digits = 9) => Number(Number(value).toFixed(digits));
const text = (value) => String(value ?? '').trim();
const unique = (values) => [...new Set(values.map((value) => round(value, 9)))];

function grams(value, unit = 'kg') {
  const multiplier = { mg: 0.001, g: 1, kg: 1000, t: 1000000, ct: 0.2 }[unit] || 1000;
  return number(value) * multiplier;
}

function fromGrams(value, unit = 'kg') {
  const multiplier = { mg: 0.001, g: 1, kg: 1000, t: 1000000, ct: 0.2 }[unit] || 1000;
  return value / multiplier;
}

function kilograms(value, unit = 'kg') { return grams(value, unit) / 1000; }
function closeTo(actual, expected, tolerance = EPSILON) { return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance + EPSILON; }
function validDate(value) { return text(value).length > 0 && Number.isFinite(Date.parse(value)); }
function staticReferenceTemperature(instrument) {
  const low = finite(instrument.temperatureMin) ? number(instrument.temperatureMin) : -10;
  const high = finite(instrument.temperatureMax) ? number(instrument.temperatureMax) : 40;
  if (instrument.accuracyClass === 'I' || 20 < low || 20 > high) return round((low + high) / 2);
  return 20;
}

export function getRanges(rawInstrument) {
  const instrument = normalizeInstrument(rawInstrument);
  return instrument.features.ranges.map((range, index) => ({
    id: range.id || `range-${index + 1}`, min: number(range.min ?? instrument.minCapacity), max: number(range.max ?? instrument.maxCapacity),
    e: number(range.e ?? instrument.verificationInterval), d: number(range.d ?? instrument.actualScaleInterval ?? range.e ?? instrument.verificationInterval),
  })).sort((a, b) => a.max - b.max);
}

export function rangeForLoad(load, rawInstrument, rangeId) {
  const ranges = getRanges(rawInstrument);
  if (rangeId) return ranges.find((range) => range.id === rangeId) || ranges[0];
  const absolute = Math.abs(number(load));
  return ranges.find((range) => absolute <= range.max + EPSILON) || ranges.at(-1);
}

export function getMpe(load, verificationInterval, accuracyClass = 'III', serviceMode = false) {
  const e = number(verificationInterval);
  if (!Number.isFinite(e) || e <= 0) throw new Error('Verification interval must be greater than zero.');
  const intervals = Math.abs(number(load)) / e;
  const limits = CLASS_MPE_BANDS[accuracyClass] || CLASS_MPE_BANDS.III;
  const multiplier = intervals <= limits[0] + EPSILON ? 0.5 : intervals <= limits[1] + EPSILON ? 1 : 1.5;
  return round(multiplier * e * (serviceMode ? 2 : 1));
}

export function calculateCorrectedError(row, rawInstrument) {
  const instrument = normalizeInstrument(rawInstrument); const ranges = getRanges(instrument); const requestedRangeId = text(row?.rangeId); const rangeIdValid = !requestedRangeId || ranges.some((item) => item.id === requestedRangeId); const rangeIdRequired = instrument.features.rangeType !== 'single';
  const range = rangeForLoad(row?.load, instrument, rangeIdValid ? requestedRangeId : undefined); const e = range.e;
  const load = number(row?.load); const indication = number(row?.indication); const additionalLoad = number(row?.additionalLoad);
  const highResolution = number(row?.highResolutionIndication);
  let error = NaN; let method = 'fractional-additional-load';
  if (Number.isFinite(highResolution) && number(row?.resolution) <= e / 5 + EPSILON) {
    error = highResolution - load; method = 'high-resolution-indication';
  } else if ([load, indication, additionalLoad].every(Number.isFinite)) {
    error = indication + 0.5 * e - additionalLoad - load;
  }
  let zeroError = number(row?.zeroError); let zeroLoad = number(row?.zeroLoad);
  if (!Number.isFinite(zeroError) && finite(row?.zeroIndication) && finite(row?.zeroAdditionalLoad) && Number.isFinite(zeroLoad)) zeroError = number(row.zeroIndication) + 0.5 * e - number(row.zeroAdditionalLoad) - zeroLoad;
  const correctedError = Number.isFinite(error) && Number.isFinite(zeroError) ? error - zeroError : NaN;
  const mpe = Number.isFinite(load) ? getMpe(load, e, instrument.accuracyClass) : NaN; const rangeTraceComplete = rangeIdValid && (!rangeIdRequired || Boolean(requestedRangeId));
  return {
    ...row, rangeId: range.id, e, load, indication: Number.isFinite(indication) ? indication : null,
    additionalLoad: Number.isFinite(additionalLoad) ? additionalLoad : null, error: Number.isFinite(error) ? round(error) : null,
    zeroLoad: Number.isFinite(zeroLoad) ? zeroLoad : null, zeroError: Number.isFinite(zeroError) ? round(zeroError) : null, correctedError: Number.isFinite(correctedError) ? round(correctedError) : null,
    mpe: Number.isFinite(mpe) ? mpe : null, method, rangeIdValid, rangeIdRequired, complete: Number.isFinite(correctedError) && rangeTraceComplete,
    passed: Number.isFinite(correctedError) && rangeTraceComplete && Math.abs(correctedError) <= mpe + EPSILON,
  };
}

function baseResult(definition, complete, passed, summary, details = {}) {
  return { id: definition.id, number: definition.number, name: definition.name, clause: definition.requirement, procedure: definition.procedure, complete, passed: complete && passed, outcome: !complete ? 'INCOMPLETE' : passed ? 'PASS' : 'FAIL', summary, ...details };
}

function notApplicable(definition, reason) {
  return { id: definition.id, number: definition.number, name: definition.name, clause: definition.requirement, procedure: definition.procedure, applicability: 'Not applicable', applicabilityReason: reason, complete: true, passed: true, outcome: 'NOT_APPLICABLE', summary: reason };
}

function withTraceability(result, sectionData, definition) {
  if (['requirements', 'checklist'].includes(definition.mode)) return result;
  const equipmentIds = Array.isArray(sectionData?.equipmentIds) ? sectionData.equipmentIds.filter(Boolean) : [];
  const evidenceNote = text(sectionData?.evidenceNote);
  const traceable = equipmentIds.length > 0 && evidenceNote.length >= 3;
  if (traceable) return { ...result, equipmentIds, evidenceNote };
  return { ...result, complete: false, passed: false, outcome: 'INCOMPLETE', equipmentIds, evidenceNote, summary: `${result.summary} Equipment link and evidence note are required.`.trim() };
}

function authorizedProtocol(data, expectedScope) {
  const value = data?.protocolAuthorization || {}; const evidenceIds = Array.isArray(value.evidenceIds) ? value.evidenceIds.map(text).filter(Boolean) : [];
  const complete = value.scope === expectedScope && text(value.authorityName).length >= 3 && text(value.authorityRole).length >= 3 && validDate(value.signedAt) && text(value.reference).length >= 3 && evidenceIds.length > 0;
  return { complete, scope: text(value.scope), authorityName: text(value.authorityName), authorityRole: text(value.authorityRole), signedAt: value.signedAt || '', reference: text(value.reference), evidenceIds };
}

function requiredTemperaturePlan(instrument) {
  const low = finite(instrument.temperatureMin) ? number(instrument.temperatureMin) : -10;
  const high = finite(instrument.temperatureMax) ? number(instrument.temperatureMax) : 40;
  const reference = staticReferenceTemperature(instrument);
  const plan = [{ id: 'initial', temperature: reference, minLoads: 10 }, { id: 'reference', temperature: reference, minLoads: 5 }, { id: 'high', temperature: high, minLoads: 5 }, { id: 'low', temperature: low, minLoads: 5 }];
  if (low <= 0) plan.push({ id: 'five', temperature: 5, minLoads: 5 });
  plan.push({ id: 'referenceFinal', temperature: reference, minLoads: 5 });
  return plan;
}

function transitionLoads(instrument) {
  const ranges = getRanges(instrument); const limits = CLASS_MPE_BANDS[instrument.accuracyClass] || CLASS_MPE_BANDS.III;
  return ranges.flatMap((range) => limits.map((limit) => limit * range.e).filter((load) => load >= range.min - EPSILON && load <= range.max + EPSILON));
}

function evaluatePerformance(data, instrument, definition) {
  const series = Array.isArray(data?.series) ? data.series : [];
  const plan = requiredTemperaturePlan(instrument); const requiredTransitions = transitionLoads(instrument);
  const evaluated = series.map((set) => {
    const rows = (Array.isArray(set.rows) ? set.rows : []).map((row) => calculateCorrectedError(row, instrument));
    const required = plan.find((item) => item.id === set.id); const minLoads = required?.minLoads || 5;
    const increasing = rows.filter((row) => row.direction === 'increasing'); const decreasing = rows.filter((row) => row.direction === 'decreasing');
    const distinctIncreasing = unique(increasing.map((row) => row.load).filter(Number.isFinite));
    const range = getRanges(instrument).at(-1);
    const includesMin = distinctIncreasing.some((load) => Math.abs(load - range.min) <= range.e + EPSILON);
    const includesMax = distinctIncreasing.some((load) => Math.abs(load - range.max) <= range.e + EPSILON);
    const transitionsPresent = requiredTransitions.every((target) => distinctIncreasing.some((load) => Math.abs(load - target) <= range.e + EPSILON));
    const temperatureMatches = Boolean(required) && closeTo(number(set.temperature), required.temperature, 1);
    const highHumidityReady = set.id !== 'high' || (finite(set.absoluteHumidityGm3) && number(set.absoluteHumidityGm3) <= 20 + EPSILON);
    const thermalReady = set.id === 'initial' || (number(set.stabilizationHours) >= 2 && number(set.temperatureRatePerMinute) <= 1 + EPSILON && highHumidityReady);
    const complete = Boolean(required) && increasing.length >= minLoads && decreasing.length >= minLoads && rows.every((row) => row.complete) && includesMin && includesMax && transitionsPresent && temperatureMatches && thermalReady;
    return { ...set, rows, minLoads, expectedTemperature: required?.temperature ?? null, complete, passed: complete && rows.every((row) => row.passed), includesMin, includesMax, transitionsPresent, temperatureMatches, highHumidityReady, thermalReady };
  });
  const ordered = plan.every((required, index) => evaluated[index]?.id === required.id);
  const complete = data?.preloaded === true && ordered && plan.every((required) => evaluated.some((set) => set.id === required.id && set.complete));
  const passed = complete && evaluated.filter((set) => plan.some((required) => required.id === set.id)).every((set) => set.passed);
  return baseResult(definition, complete, passed, complete ? `${evaluated.filter((set) => set.passed).length}/${plan.length} required intrinsic/static-temperature series comply.` : `${evaluated.filter((set) => set.complete).length}/${plan.length} required ordered loading/unloading series complete.`, { series: evaluated, requiredPlan: plan, ordered, preloaded: data?.preloaded === true });
}

function evaluateTemperatureZero(data, instrument, definition) {
  const points = Array.isArray(data?.points) ? data.points.map((point) => {
    const range = getRanges(instrument)[0]; const indication = number(point.zeroIndication); const additional = number(point.additionalLoad);
    const p = [indication, additional].every(Number.isFinite) ? round(indication + 0.5 * range.e - additional) : null;
    return { ...point, temperature: number(point.temperature), P: p };
  }) : [];
  const plan = requiredTemperaturePlan(instrument).filter((item) => item.id !== 'initial'); const step = instrument.accuracyClass === 'I' ? 1 : 5; const e = getRanges(instrument)[0].e;
  const comparisons = points.slice(1).map((point, index) => { const previous = points[index]; const deltaT = Math.abs(point.temperature - previous.temperature); const normalizedChange = point.P !== null && previous.P !== null && deltaT > 0 ? round(Math.abs(point.P - previous.P) * step / deltaT) : null; return { from: previous.id, to: point.id, deltaTemperature: deltaT, normalizedChange, limit: e, passed: normalizedChange !== null && normalizedChange <= e + EPSILON }; });
  const ordered = plan.every((required, index) => points[index]?.id === required.id && closeTo(points[index]?.temperature, required.temperature, 1));
  const complete = ordered && points.length === plan.length && points.every((point) => point.P !== null && number(point.stabilizationHours) >= 2 && number(point.temperatureRatePerMinute) <= 1 + EPSILON) && comparisons.length === plan.length - 1;
  return baseResult(definition, complete, complete && comparisons.every((item) => item.passed), complete ? `${comparisons.filter((item) => item.passed).length}/${comparisons.length} consecutive temperature changes are not more than e per ${step} C.` : 'The full stabilized ordered reference/high/low/5 C when applicable/final-reference zero sequence at the declared temperatures is required.', { points, comparisons, normalizationStep: step, requiredPlan: plan, ordered });
}

function evaluateEccentricity(data, instrument, definition, rolling = false) {
  const rows = (Array.isArray(data?.rows) ? data.rows : []).map((row) => calculateCorrectedError(row, instrument));
  const f = instrument.features; const supports = Math.max(1, Number(f.supportPoints || 4));
  const maxWithAdditiveTare = number(instrument.maxCapacity) + (finite(f.maximumAdditiveTare) ? number(f.maximumAdditiveTare) : 0); let layoutComplete; let loadPlanComplete;
  if (rolling) {
    const sections = Math.max(1, Number(data?.numberOfSections || 1)); const directions = f.bidirectionalRolling === false ? ['forward'] : ['forward', 'reverse'];
    layoutComplete = Array.from({ length: sections }, (_, i) => i + 1).every((receptorSection) => directions.every((direction) => ['beginning', 'middle', 'end'].every((position) => rows.some((row) => Number(row.section) === receptorSection && row.direction === direction && row.position === position))));
    const rollingTestLoad = number(data?.rollingTestLoad); loadPlanComplete = Number.isFinite(rollingTestLoad) && rollingTestLoad > 0 && rollingTestLoad <= 0.8 * maxWithAdditiveTare + EPSILON && rows.every((row) => closeTo(row.load, rollingTestLoad, rangeForLoad(row.load, instrument).e));
  } else {
    layoutComplete = rows.length >= (supports <= 4 ? 4 : supports);
    const specialMinimal = ['tank', 'hopper'].includes(f.loadReceptorType) && f.minimalOffCentreLoading === true; const requiredLoad = maxWithAdditiveTare * (specialMinimal ? 0.1 : supports <= 4 ? 1 / 3 : 1 / (supports - 1));
    loadPlanComplete = rows.every((row) => closeTo(row.load, requiredLoad, rangeForLoad(row.load, instrument).e));
  }
  const protocolAuthorization = authorizedProtocol(data, rolling ? 'eccentricity-rolling' : 'eccentricity-weights');
  const planComplete = text(data?.loadPlanApproval).length >= 5 && text(data?.layoutSketchReference).length >= 3 && data?.rezeroBeforeEachPositionConfirmed === true && protocolAuthorization.complete;
  const complete = rows.length > 0 && rows.every((row) => row.complete) && layoutComplete && loadPlanComplete && planComplete;
  return baseResult(definition, complete, complete && rows.every((row) => row.passed), complete ? `${rows.filter((row) => row.passed).length}/${rows.length} prescribed positions and eccentricity loads comply.` : 'Complete the signed authority-agreed sketch, re-zero confirmation, every required position and the prescribed support/receptor or rolling-load magnitude.', { rows, layoutComplete, loadPlanComplete, planComplete, protocolAuthorization });
}

function digitalMinimumInUnit(unit) { return fromGrams(0.005, unit); }

function evaluateDiscrimination(data, instrument, definition) {
  const f = instrument.features; const rows = Array.isArray(data?.rows) ? data.rows : []; const d = getRanges(instrument)[0].d;
  if (f.digitalIndication && !f.analogIndication && f.indicatingMode !== 'nonSelf' && d < digitalMinimumInUnit(instrument.unit) - EPSILON) return notApplicable(definition, 'A.4.8.2 applies to digital indication only when d is at least 5 mg.');
  const results = rows.map((row) => {
    const load = number(row.load); const mpe = Number.isFinite(load) ? getMpe(load, rangeForLoad(load, instrument, row.rangeId).e, instrument.accuracyClass) : null;
    if (f.indicatingMode === 'nonSelf') { const extraLoad = number(row.extraLoad); const requiredExtraLoad = Math.max(0.4 * mpe, fromGrams(0.001, instrument.unit)); const complete = Number.isFinite(load) && Number.isFinite(extraLoad) && typeof row.visibleDisplacement === 'boolean'; return { ...row, load, mpe, extraLoad, requiredExtraLoad, complete, passed: complete && row.visibleDisplacement && closeTo(extraLoad, requiredExtraLoad, Math.max(EPSILON, requiredExtraLoad * 1e-6)) }; }
    const before = number(row.before); const after = number(row.after); const extraLoad = number(row.extraLoad); const response = [before, after].every(Number.isFinite) ? round(after - before) : null;
    if (f.analogIndication) { const requiredExtraLoad = Math.max(mpe, fromGrams(0.001, instrument.unit)); const complete = [load, before, after, extraLoad].every(Number.isFinite); return { ...row, load, mpe, response, extraLoad, requiredExtraLoad, complete, passed: complete && closeTo(extraLoad, requiredExtraLoad, Math.max(EPSILON, requiredExtraLoad * 1e-6)) && response + EPSILON >= 0.7 * extraLoad }; }
    const complete = [load, before, after, extraLoad].every(Number.isFinite) && row.stepProcedureConfirmed === true;
    const requiredExtraLoad = 1.4 * d;
    return { ...row, load, mpe, response, extraLoad, requiredExtraLoad, complete, passed: complete && closeTo(extraLoad, requiredExtraLoad, Math.max(EPSILON, requiredExtraLoad * 1e-6)) && response + EPSILON >= d };
  });
  const max = number(instrument.maxCapacity); const min = number(instrument.minCapacity); const requiredLoads = [min, max * 0.5, max];
  const loadPlan = requiredLoads.every((target) => results.some((row) => Number.isFinite(row.load) && Math.abs(row.load - target) <= d + EPSILON));
  const complete = results.length >= 3 && results.every((row) => row.complete) && loadPlan;
  return baseResult(definition, complete, complete && results.every((row) => row.passed), complete ? `${results.filter((row) => row.passed).length}/3 discrimination loads comply.` : 'Complete Min, about half Max and Max using the correct indication method.', { results, indicationMethod: f.indicatingMode === 'nonSelf' ? 'non-self' : f.analogIndication ? 'analog' : 'digital', loadPlan });
}

function evaluateSensitivity(data, instrument, definition) {
  const rows = Array.isArray(data?.rows) ? data.rows : []; const limit = ['I', 'II'].includes(instrument.accuracyClass) ? 1 : kilograms(instrument.maxCapacity, instrument.unit) <= 30 ? 2 : 5;
  const results = rows.map((row) => { const load = number(row.load); const extraLoad = number(row.extraLoad); const displacement = number(row.permanentDisplacementMm); const mpe = Number.isFinite(load) ? getMpe(load, rangeForLoad(load, instrument, row.rangeId).e, instrument.accuracyClass) : null; const requiredExtraLoad = Math.max(mpe, fromGrams(0.001, instrument.unit)); const complete = [load, extraLoad, displacement].every(Number.isFinite); return { ...row, load, extraLoad, displacement, mpe, requiredExtraLoad, complete, passed: complete && closeTo(extraLoad, requiredExtraLoad, Math.max(EPSILON, requiredExtraLoad * 1e-6)) && displacement + EPSILON >= limit }; });
  const e = getRanges(instrument)[0].e; const max = number(instrument.maxCapacity); const loadPlan = [0, max].every((target) => results.some((row) => closeTo(row.load, target, e)));
  const complete = results.length >= 2 && results.every((row) => row.complete) && loadPlan;
  return baseResult(definition, complete, complete && results.every((row) => row.passed), complete ? `${results.filter((row) => row.passed).length}/${results.length} sensitivity points meet ${limit} mm.` : 'No-load and Max observations using exactly the prescribed sensitivity load are required.', { results, minimumDisplacementMm: limit, loadPlan });
}

function repeatabilitySeries(series, instrument) {
  const load = number(series?.load); const readings = Array.isArray(series?.readings) ? series.readings.map((row) => calculateCorrectedError({ load, ...row }, instrument)) : [];
  const required = kilograms(instrument.maxCapacity, instrument.unit) < 1000 ? 10 : 3; const errors = readings.map((row) => row.correctedError).filter(Number.isFinite); const spread = errors.length ? round(Math.max(...errors) - Math.min(...errors)) : null; const mpe = Number.isFinite(load) ? getMpe(load, rangeForLoad(load, instrument, series?.rangeId).e, instrument.accuracyClass) : null;
  const complete = Number.isFinite(load) && readings.length >= required && readings.every((row) => row.complete);
  return { ...series, load, readings, required, spread, mpe, complete, passed: complete && spread <= mpe + EPSILON && readings.every((row) => row.passed) };
}

function evaluateRepeatability(data, instrument, definition) {
  const series = (Array.isArray(data?.series) ? data.series : []).map((item) => repeatabilitySeries(item, instrument)); const max = number(instrument.maxCapacity); const tolerance = getRanges(instrument).at(-1).e;
  const hasHalf = series.some((item) => Math.abs(item.load - max * 0.5) <= tolerance); const hasMax = series.some((item) => Math.abs(item.load - max) <= tolerance);
  const complete = series.length >= 2 && series.every((item) => item.complete) && hasHalf && hasMax;
  return baseResult(definition, complete, complete && series.every((item) => item.passed), complete ? `${series.filter((item) => item.passed).length}/2 series comply for spread and every individual error.` : 'Two complete series near 50 percent and 100 percent Max are required.', { series, hasHalf, hasMax });
}

function evaluateZeroReturn(data, instrument, definition) {
  if (instrument.accuracyClass === 'I') return notApplicable(definition, 'The R 76-1 zero-return requirement applies to classes II, III and IIII.');
  const e = getRanges(instrument)[0].e; const readings = (Array.isArray(data?.readings) ? data.readings : []).map((row) => { const indication = number(row.zeroIndication); const additionalLoad = number(row.additionalLoad); return { ...row, timeMinutes: number(row.timeMinutes), P: [indication, additionalLoad].every(Number.isFinite) ? round(indication + 0.5 * e - additionalLoad) : null }; });
  const at = (minutes) => readings.find((row) => row.timeMinutes === minutes)?.P; const p0 = at(0); const p30 = at(30); const p35 = at(35); const change30 = [p0, p30].every(Number.isFinite) ? round(p30 - p0) : null; const change5 = [p30, p35].every(Number.isFinite) ? round(p35 - p30) : null;
  const multi = instrument.features.rangeType === 'multipleRange'; const protocolAuthorization = multi ? authorizedProtocol(data, 'multiple-range-zero-return') : { complete: true }; const complete = number(data?.loadDuring30Minutes) >= 0.8 * number(instrument.maxCapacity) && change30 !== null && (!multi || (change5 !== null && data?.rangeSwitchingSequenceConfirmed === true && protocolAuthorization.complete));
  const passed = complete && Math.abs(change30) <= 0.5 * e + EPSILON && (!multi || Math.abs(change5) <= e + EPSILON);
  return baseResult(definition, complete, passed, complete ? `30-minute return ${change30}; ${multi ? `following five-minute change ${change5}` : 'ordinary range'}.` : 'Record zero at 0 and 30 minutes after a near-Max load; a multiple-range instrument also needs the 35-minute value, confirmed switching sequence and signed protocol.', { readings, change30, change5, limit: 0.5 * e, protocolAuthorization });
}

function evaluateCreep(data, instrument, definition) {
  if (instrument.accuracyClass === 'I') return notApplicable(definition, 'The R 76-1 creep requirement applies to classes II, III and IIII.');
  const readings = (Array.isArray(data?.readings) ? data.readings : []).map((row) => ({ ...row, timeMinutes: number(row.timeMinutes), indication: number(row.indication) })).filter((row) => Number.isFinite(row.timeMinutes) && Number.isFinite(row.indication));
  const at = (minutes) => readings.find((row) => row.timeMinutes === minutes)?.indication; const initial = at(0); const at15 = at(15); const at30 = at(30); const e = getRanges(instrument).at(-1).e; const load = number(data?.load); const mpe = getMpe(load, e, instrument.accuracyClass);
  const earlyComplete = [initial, at15, at30].every(Number.isFinite); const earlyPass = earlyComplete && Math.abs(at30 - initial) < 0.5 * e - EPSILON && Math.abs(at30 - at15) < 0.2 * e - EPSILON;
  const full = readings.some((row) => row.timeMinutes >= 240); const fullPass = full && readings.every((row) => Math.abs(row.indication - initial) <= mpe + EPSILON);
  const complete = Number.isFinite(load) && load >= 0.8 * number(instrument.maxCapacity) && number(data?.temperatureRange) <= 2 + EPSILON && (earlyPass || full);
  return baseResult(definition, complete, complete && (earlyPass || fullPass), complete ? earlyPass ? 'Early-termination limits are strictly met.' : `${readings.length} readings through four hours remain within mpe.` : 'Record the 0, 15 and 30 minute readings; continue through four hours unless both strict early limits are met.', { readings, earlyPass, fullPass, mpe });
}

function evaluateStability(data, instrument, definition, printing) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const e = getRanges(instrument)[0].e;
  const results = rows.map((row) => {
    if (printing) {
      const indications = Array.isArray(row.indications) ? row.indications.map(number) : [];
      const capturedValue = finite(row.printedValue) ? number(row.printedValue) : finite(row.storedValue) ? number(row.storedValue) : NaN;
      const distinct = indications.every(Number.isFinite) ? unique(indications) : [];
      const adjacent = distinct.length > 0 && distinct.length <= 2 && Math.max(...distinct) - Math.min(...distinct) <= e + EPSILON;
      const capturedObserved = Number.isFinite(capturedValue) && distinct.some((value) => closeTo(value, capturedValue));
      const complete = indications.length >= 2 && indications.every(Number.isFinite) && number(row.observationDurationSeconds) >= 5 && Number.isFinite(capturedValue) && row.inhibitedBeforeStability === true;
      const passed = complete && adjacent && capturedObserved;
      return { ...row, indications, capturedValue: Number.isFinite(capturedValue) ? capturedValue : null, distinctValues: distinct, adjacent, capturedObserved, complete, passed };
    }
    const error = number(row.error); const complete = Number.isFinite(error) && row.inhibitedBeforeStability === true; return { ...row, error, complete, passed: complete && Math.abs(error) <= 0.25 * e + EPSILON };
  });
  const complete = results.length >= 5 && results.every((row) => row.complete) && text(data?.principleAndCriteria).length >= 5 && data?.parametersProtected === true;
  return baseResult(definition, complete, complete && results.every((row) => row.passed), complete ? `${results.filter((row) => row.passed).length}/5 stability attempts comply.` : printing ? 'Document the protected stability principle and five attempts with the full five-second indication sequence and the value actually printed or stored.' : 'Document the protected stability principle and complete five functional attempts.', { results });
}

function evaluateTilting(data, instrument, definition) {
  const rows = Array.isArray(data?.positions) ? data.positions : []; const e = getRanges(instrument)[0].e; const requiredPositions = ['reference', 'forward', 'backward', 'left', 'right']; const max = number(instrument.maxCapacity); const lowLoad = transitionLoads(instrument).sort((a, b) => a - b)[0] ?? number(instrument.minCapacity); const requiredLoads = [{ id: 'low', load: lowLoad }, { id: 'max', load: max }]; const declaredTilt = number(data?.declaredLimitingTiltPercent);
  const results = rows.map((row) => { const load = number(row.load); const referenceZero = number(row.referenceUnloaded); const referenceLoad = number(row.referenceLoaded); const tiltedZero = number(row.tiltedUnloaded); const tiltedLoad = number(row.tiltedLoaded); const actualTiltPercent = number(row.actualTiltPercent); const unloadedDifference = [referenceZero, tiltedZero].every(Number.isFinite) ? Math.abs(tiltedZero - referenceZero) : null; const loadedDifference = [referenceZero, referenceLoad, tiltedZero, tiltedLoad].every(Number.isFinite) ? Math.abs((tiltedLoad - tiltedZero) - (referenceLoad - referenceZero)) : null; const mpe = Number.isFinite(load) ? getMpe(load, rangeForLoad(load, instrument).e, instrument.accuracyClass) : null; const noLoadApplies = !(instrument.accuracyClass === 'II' && !instrument.features.directSales); const expectedTilt = row.position === 'reference' ? 0 : declaredTilt; const tiltMatches = Number.isFinite(expectedTilt) && closeTo(Math.abs(actualTiltPercent), expectedTilt, 0.05); const complete = [load, referenceZero, referenceLoad, tiltedZero, tiltedLoad, actualTiltPercent].every(Number.isFinite) && tiltMatches; return { ...row, load, actualTiltPercent, expectedTiltPercent: expectedTilt, tiltMatches, unloadedDifference, loadedDifference, mpe, complete, passed: complete && (!noLoadApplies || unloadedDifference <= 2 * e + EPSILON) && loadedDifference <= mpe + EPSILON }; });
  const loadPlanComplete = requiredPositions.every((position) => requiredLoads.every((point) => results.some((row) => row.position === position && row.loadPoint === point.id && closeTo(row.load, point.load, rangeForLoad(point.load, instrument).e) && row.complete)));
  const protocolAuthorization = authorizedProtocol(data, 'tilting'); const complete = Number.isFinite(declaredTilt) && declaredTilt > 0 && loadPlanComplete && text(data?.tiltPlanApproval).length >= 5 && protocolAuthorization.complete;
  return baseResult(definition, complete, complete && results.every((row) => row.passed), complete ? `${results.filter((row) => row.passed).length}/${results.length} actual-tilt observations at both prescribed loads comply.` : 'Complete the signed reference/four-direction plan at the actual declared tilt, at the lowest mpe-transition load and near Max.', { results, requiredLoads, declaredLimitingTiltPercent: Number.isFinite(declaredTilt) ? declaredTilt : null, loadPlanComplete, protocolAuthorization });
}

function evaluateTare(data, instrument, definition) {
  const runs = Array.isArray(data?.runs) ? data.runs : []; const requiredRuns = instrument.features.tareType === 'additive' ? 2 : 1;
  const ranges = getRanges(instrument); const results = runs.map((run) => { const rows = (Array.isArray(run.rows) ? run.rows : []).map((row) => calculateCorrectedError(row, instrument)); const increasing = rows.filter((row) => row.direction === 'increasing'); const decreasing = rows.filter((row) => row.direction === 'decreasing'); const distinctIncreasing = unique(increasing.map((row) => row.load).filter(Number.isFinite)); const rangeCoverage = instrument.features.rangeType === 'single' || ranges.every((range) => rows.some((row) => row.rangeId === range.id)); const complete = finite(run.tareLoad) && increasing.length >= 5 && decreasing.length >= 5 && distinctIncreasing.length >= 5 && rows.every((row) => row.complete) && finite(run.tareSettingError) && text(run.tareLoadPlanReference).length >= 3 && rangeCoverage; const e = getRanges(instrument)[0].e; const tareLimit = instrument.features.electronic || instrument.features.analogIndication ? 0.25 * e : 0.5 * getRanges(instrument)[0].d; return { ...run, rows, distinctIncreasingLoads: distinctIncreasing.length, rangeCoverage, complete, tareLimit, passed: complete && Math.abs(number(run.tareSettingError)) <= tareLimit + EPSILON && rows.every((row) => row.passed) }; });
  const protocolAuthorization = authorizedProtocol(data, 'tare-weighing'); const distinctTareLoads = unique(results.map((run) => number(run.tareLoad)).filter(Number.isFinite)); const complete = results.length >= requiredRuns && distinctTareLoads.length >= requiredRuns && results.every((run) => run.complete) && protocolAuthorization.complete;
  return baseResult(definition, complete, complete && results.every((run) => run.passed), complete ? `${results.filter((run) => run.passed).length}/${requiredRuns} signed tare loading/unloading runs comply.` : `Complete the signed tare protocol with ${requiredRuns} distinct tare run(s), at least five distinct net-load points in both directions and every applicable range.`, { runs: results, distinctTareLoads: distinctTareLoads.length, protocolAuthorization });
}

function evaluateWarmUp(data, instrument, definition) {
  const max = number(instrument.maxCapacity); const points = (Array.isArray(data?.points) ? data.points : []).map((row) => { const zero = calculateCorrectedError({ load: 0, indication: row.zeroIndication, additionalLoad: row.zeroAdditionalLoad, zeroError: 0 }, instrument); const loaded = calculateCorrectedError({ load: row.load, indication: row.indication, additionalLoad: row.additionalLoad, zeroError: zero.error }, instrument); const nearMaxLoad = finite(row.load) && number(row.load) >= 0.8 * max - EPSILON && number(row.load) <= max + EPSILON; return { ...row, minutes: number(row.minutes), zero, loaded, nearMaxLoad, complete: zero.error !== null && loaded.complete && nearMaxLoad, passed: loaded.passed && nearMaxLoad }; });
  const required = [0, 5, 15, 30]; const complete = number(data?.disconnectedHours) >= 8 && data?.weighingOutputInhibitedDuringWarmUp === true && required.every((minutes) => points.some((point) => point.minutes === minutes && point.complete));
  return baseResult(definition, complete, complete && points.every((point) => point.passed), complete ? `${points.filter((point) => point.passed).length}/4 timed near-Max errors comply.` : 'Confirm eight-hour disconnection, warm-up inhibition and complete 0/5/15/30-minute observations.', { points });
}

function requiredSupplyCategories(f) {
  const categories = []; if (f.mainsPower) categories.push('mainsAC'); if (f.externalDcPower) categories.push('externalPower'); if (f.batteryPower) categories.push('battery'); if (f.vehiclePower) categories.push('vehicle'); return categories;
}

function supplyLimits(category, features) {
  if (category === 'mainsAC') {
    const nominalLow = number(features.nominalVoltageMin ?? features.nominalVoltage); const nominalHigh = number(features.nominalVoltageMax ?? features.nominalVoltage);
    return { reference: number(features.nominalVoltage), lower: round(0.85 * nominalLow), upper: round(1.1 * nominalHigh), switchOffAllowedAtLower: false };
  }
  if (category === 'externalPower') {
    const nominal = number(features.externalNominalVoltage ?? features.nominalVoltage); const nominalHigh = number(features.externalNominalVoltageMax ?? features.externalNominalVoltage ?? features.nominalVoltage);
    return { reference: nominal, lower: number(features.externalMinimumOperatingVoltage ?? features.minVoltage), upper: round(1.2 * nominalHigh), switchOffAllowedAtLower: true };
  }
  if (category === 'battery') {
    const nominal = number(features.batteryNominalVoltage ?? features.nominalVoltage); const nominalHigh = number(features.batteryNominalVoltageMax ?? features.batteryNominalVoltage ?? features.nominalVoltage);
    return { reference: nominal, lower: number(features.batteryMinimumOperatingVoltage ?? features.minVoltage), upper: nominalHigh, switchOffAllowedAtLower: true };
  }
  const nominal = number(features.vehicleNominalVoltage ?? features.nominalVoltage); return { reference: nominal, lower: number(features.vehicleMinimumOperatingVoltage ?? features.minVoltage), upper: nominal <= 12 ? 16 : nominal <= 24 ? 32 : NaN, switchOffAllowedAtLower: true };
}

function evaluateVoltage(data, instrument, definition) {
  const categories = requiredSupplyCategories(instrument.features); const lowLoad = round(10 * getRanges(instrument)[0].e); const max = number(instrument.maxCapacity);
  const limits = Object.fromEntries(categories.map((category) => [category, supplyLimits(category, instrument.features)]));
  const rows = (Array.isArray(data?.rows) ? data.rows : []).map((row) => {
    const calculated = calculateCorrectedError(row, instrument); const expected = limits[row.category]?.[row.point]; const outcome = text(row.operatingOutcome).toUpperCase();
    const voltageMatches = closeTo(number(row.voltage), expected, Math.max(0.01, Math.abs(expected || 0) * 0.001));
    const permittedSwitchOff = outcome === 'SWITCHED_OFF' && row.point === 'lower' && limits[row.category]?.switchOffAllowedAtLower && row.shutdownIndicationConfirmed === true;
    const operated = outcome === 'OPERATED' && row.functionsOperated === true && calculated.complete;
    const complete = Number.isFinite(expected) && voltageMatches && (operated || permittedSwitchOff);
    return { ...calculated, category: row.category, point: row.point, voltage: finite(row.voltage) ? number(row.voltage) : null, expectedVoltage: Number.isFinite(expected) ? expected : null, operatingOutcome: outcome, voltageMatches, permittedSwitchOff, complete, passed: complete && (permittedSwitchOff || calculated.passed) };
  });
  const rowMatchesLoad = (row, kind) => kind === 'low' ? closeTo(row.load, lowLoad, getRanges(instrument)[0].e) : row.load >= 0.5 * max - EPSILON && row.load <= max + EPSILON;
  const complete = categories.length > 0 && categories.every((category) => ['reference', 'lower', 'upper'].every((point) => ['low', 'high'].every((kind) => rows.some((row) => row.category === category && row.point === point && rowMatchesLoad(row, kind) && row.complete))));
  const relevant = rows.filter((row) => categories.includes(row.category));
  return baseResult(definition, complete, complete && relevant.every((row) => row.passed), complete ? `${relevant.filter((row) => row.passed).length}/${relevant.length} prescribed voltage/load conditions comply.` : 'Each applicable supply needs its declared reference and exact R 76 lower/upper voltage, at 10e and at a load from half Max to Max, with an explicit operating or permitted shutdown outcome.', { rows, requiredCategories: categories, requiredLimits: limits, requiredLoads: { low: lowLoad, high: '0.5 Max to Max' } });
}

export const DISTURBANCE_PROTOCOLS = Object.freeze({
  acDips: ['0%-0.5', '0%-1', '40%-10', '70%-25', '80%-250', '0%-250'],
  burstsMains: ['positive', 'negative'], burstsIo: ['positive', 'negative'],
  surgesMains: ['positive-0', 'positive-90', 'positive-180', 'positive-270', 'negative-0', 'negative-90', 'negative-180', 'negative-270'],
  surgesOtherPower: ['positive', 'negative'],
  esdDirect: ['contact-2', 'contact-4', 'contact-6', 'air-2', 'air-4', 'air-8'],
  esdIndirect: ['horizontal-positive', 'horizontal-negative', 'vertical-positive', 'vertical-negative'],
  radiatedRf: ['front-vertical', 'front-horizontal', 'right-vertical', 'right-horizontal', 'rear-vertical', 'rear-horizontal', 'left-vertical', 'left-horizontal'],
  conductedRf: ['supply-or-interface'],
  vehicleTransientsSupply: ['2a', '2b', '3a', '3b', '4'], vehicleTransientsOther: ['a', 'b'],
});

function evaluateDisturbance(data, instrument, definition) {
  const required = DISTURBANCE_PROTOCOLS[definition.id] || []; const e = getRanges(instrument)[0].e; const rows = (Array.isArray(data?.rows) ? data.rows : []).map((row) => { const baseline = number(row.baseline); const during = number(row.during); const fault = [baseline, during].every(Number.isFinite) ? round(during - baseline) : null; const exception = (row.detectedAndActed === true || row.acceptedUnderT556 === true) && text(row.explanation).length >= 5; const protocolCountValid = definition.id === 'acDips' || definition.id.startsWith('esd') ? number(row.applicationCount) >= 10 && number(row.intervalSeconds) >= 10 : definition.id.startsWith('surges') ? number(row.applicationCount) >= 3 : true; const durationValid = definition.id.startsWith('bursts') ? number(row.durationSeconds) >= 60 : true; const complete = fault !== null && protocolCountValid && durationValid; return { ...row, baseline, during, fault, exception, complete, passed: complete && (Math.abs(fault) <= e + EPSILON || exception) }; });
  const protocolComplete = required.every((protocolId) => rows.some((row) => row.protocolId === protocolId && row.complete));
  const parametersComplete = data?.protocolConfirmed === true && text(data?.setupReference).length >= 3 && text(data?.referencedStandardEdition).length >= 3 && text(data?.severityReference).length >= 3 && data?.environmentRecorded === true && data?.peripheralsConfigured === true;
  const complete = protocolComplete && parametersComplete;
  return baseResult(definition, complete, complete && rows.every((row) => row.passed), complete ? `${rows.filter((row) => row.passed).length}/${rows.length} disturbance conditions comply or have an explained permitted significant-fault response.` : 'Complete every prescribed protocol condition, setup and severity reference, referenced-standard edition, environmental record, peripheral configuration and test count/duration.', { rows, requiredProtocols: required });
}

function evaluateCorrectedRows(data, instrument, definition) {
  const rows = (Array.isArray(data?.rows) ? data.rows : []).map((row) => calculateCorrectedError(row, instrument)); const complete = rows.length >= 5 && rows.every((row) => row.complete) && finite(data?.temperature) && finite(data?.humidity);
  return baseResult(definition, complete, complete && rows.every((row) => row.passed), complete ? `${rows.filter((row) => row.passed).length}/${rows.length} corrected load errors comply.` : 'At least five corrected load rows and the environmental conditions are required.', { rows });
}

function evaluateDampHeat(data, instrument, definition) {
  const stage = definition.id === 'dampHeatInitial' ? 'initial' : definition.id === 'dampHeatHigh' ? 'high' : 'final';
  const reference = staticReferenceTemperature(instrument); const expectedTemperature = stage === 'high' ? number(instrument.temperatureMax) : reference; const expectedHumidity = stage === 'high' ? 85 : 50;
  const rows = (Array.isArray(data?.rows) ? data.rows : []).map((row) => calculateCorrectedError(row, instrument)); const distinctLoads = unique(rows.map((row) => row.load).filter(Number.isFinite));
  const environmentComplete = closeTo(number(data?.temperature), expectedTemperature, 1) && closeTo(number(data?.humidity), expectedHumidity, 3);
  const stageComplete = data?.stage === stage && text(data?.protocolId).length >= 3 && validDate(data?.completedAt) && data?.conditionStabilized === true && data?.functionsOperated === true
    && (stage !== 'high' || number(data?.exposureDays) >= 2) && (stage !== 'final' || data?.recoveryComplete === true);
  const complete = rows.length >= 5 && distinctLoads.length >= 5 && rows.every((row) => row.complete) && environmentComplete && stageComplete;
  return baseResult(definition, complete, complete && rows.every((row) => row.passed), complete ? `${rows.filter((row) => row.passed).length}/${rows.length} corrected errors comply at the ${stage} B.2 stage.` : `The ${stage} B.2 stage requires its exact temperature/humidity condition, stable conditioning, operating functions, five distinct corrected loads${stage === 'high' ? ' and at least two days exposure' : ''}${stage === 'final' ? ' and completed recovery' : ''}.`, { rows, stage, protocolId: text(data?.protocolId), expectedTemperature, expectedHumidity, distinctLoads: distinctLoads.length, environmentComplete, stageComplete });
}

function evaluateEnduranceInitial(data, instrument, definition) {
  const rows = (Array.isArray(data?.rows) ? data.rows : []).map((row) => calculateCorrectedError(row, instrument)); const increasing = rows.filter((row) => row.direction === 'increasing'); const decreasing = rows.filter((row) => row.direction === 'decreasing');
  const distinctIncreasing = unique(increasing.map((row) => row.load).filter(Number.isFinite)); const complete = rows.every((row) => row.complete) && increasing.length >= 5 && decreasing.length >= 5 && distinctIncreasing.length >= 5 && text(data?.sequenceId).length >= 3 && validDate(data?.completedAt) && data?.performedAfterOtherTests === true;
  return baseResult(definition, complete, complete && rows.every((row) => row.passed), complete ? `${distinctIncreasing.length} linked initial endurance loads comply after the other Annex A/B tests.` : 'The initial endurance test needs linked loading/unloading observations at five or more loads, a completion time, and confirmation that the other Annex A/B tests were completed first.', { rows, sequenceId: text(data?.sequenceId), completedAt: data?.completedAt, performedAfterOtherTests: data?.performedAfterOtherTests === true });
}

function evaluateSpan(data, instrument, definition) {
  const load = number(data?.testLoad); const e = getRanges(instrument).at(-1).e; const mpe = Number.isFinite(load) ? getMpe(load, e, instrument.accuracyClass) : NaN; const limit = Math.max(0.5 * e, 0.5 * mpe);
  const rawMeasurements = Array.isArray(data?.measurements) ? data.measurements : [];
  const firstRaw = rawMeasurements[0]; const firstErrors = (Array.isArray(firstRaw?.readings) ? firstRaw.readings : []).map((row) => calculateCorrectedError(row, instrument).correctedError).filter(Number.isFinite); const firstSpread = firstErrors.length ? round(Math.max(...firstErrors) - Math.min(...firstErrors)) : null; const fiveReadingsRequiredThroughout = firstSpread !== null && firstSpread > 0.1 * e + EPSILON;
  const measurements = rawMeasurements.map((measurement, index) => {
    const readings = (Array.isArray(measurement.readings) ? measurement.readings : []).map((row) => calculateCorrectedError(row, instrument)); const errors = readings.map((row) => row.correctedError).filter(Number.isFinite); const averageError = errors.length ? round(errors.reduce((sum, value) => sum + value, 0) / errors.length) : null;
    const requiredReadings = index === 0 || fiveReadingsRequiredThroughout ? 5 : 1; const environmental = finite(measurement.temperature) && finite(measurement.humidity) && finite(measurement.barometricPressure) && text(measurement.location).length >= 2; const timestampComplete = validDate(measurement.dateTime); const stabilizationRequired = ['after-temperature', 'after-damp-heat'].includes(measurement.condition) ? 16 : 5;
    const sameLoad = readings.every((row) => closeTo(row.load, load, e)); const complete = readings.length >= requiredReadings && readings.every((row) => row.complete) && environmental && timestampComplete && number(measurement.stabilizationHours) >= stabilizationRequired && sameLoad;
    return { ...measurement, readings, averageError, requiredReadings, stabilizationRequired, environmental, timestampComplete, sameLoad, complete };
  });
  const errors = measurements.map((item) => item.averageError).filter(Number.isFinite); const variation = errors.length ? round(Math.max(...errors) - Math.min(...errors)) : null;
  const times = measurements.map((item) => Date.parse(item.dateTime)); const gapsDays = times.slice(1).map((value, index) => (value - times[index]) / 86400000); const timeOrdered = times.every(Number.isFinite) && gapsDays.every((gap) => gap >= 0.5 - EPSILON && gap <= 10 + EPSILON); const fairlyEven = gapsDays.length > 0 && Math.max(...gapsDays) - Math.min(...gapsDays) <= 2 + EPSILON;
  const targetDuration = Math.min(28, finite(data?.performanceTestsDurationDays) ? number(data.performanceTestsDurationDays) : 28); const durationComplete = closeTo(number(data?.durationDays), targetDuration, 0.5) && times.length >= 2 && closeTo((times.at(-1) - times[0]) / 86400000, number(data?.durationDays), 0.5);
  const disconnections = Array.isArray(data?.disconnections) ? data.disconnections : []; const disconnectionsComplete = disconnections.length >= 2 && disconnections.every((item) => number(item.durationHours) >= 8 && Number.isInteger(number(item.afterMeasurementNo)) && Number.isInteger(number(item.beforeMeasurementNo)) && number(item.beforeMeasurementNo) > number(item.afterMeasurementNo));
  const procedureComplete = data?.sameTestWeights === true && data?.automaticZeroTrackingDisabled === true && data?.spanAdjustmentStateRecorded === true && data?.trendResolutionConfirmed === true;
  const testLoadComplete = Number.isFinite(load) && load >= 0.8 * number(instrument.maxCapacity) - EPSILON && load <= number(instrument.maxCapacity) + EPSILON;
  const complete = measurements.length >= 8 && measurements.every((item) => item.complete) && firstErrors.length >= 5 && timeOrdered && fairlyEven && durationComplete && disconnectionsComplete && procedureComplete && testLoadComplete;
  return baseResult(definition, complete, complete && variation <= limit + EPSILON && measurements.every((item) => item.readings.every((row) => row.passed)), complete ? `Variation ${variation}; limit ${round(limit)} across ${measurements.length} protocol-complete measurements.` : 'B.4 requires eight or more dated measurements, five first readings (and five thereafter if the first spread exceeds 0.1e), near-Max use of the same weights, environmental records, 5/16-hour stabilization, two documented eight-hour disconnections, controlled zero/span functions and the prescribed duration/spacing.', { measurements, variation, limit, firstSpread, fiveReadingsRequiredThroughout, gapsDays, timeOrdered, fairlyEven, targetDuration, durationComplete, disconnections, disconnectionsComplete, procedureComplete, testLoadComplete });
}

function evaluateEndurance(data, instrument, definition, initialData = {}) {
  const initialRows = (Array.isArray(data?.initialRows) ? data.initialRows : []).map((row) => calculateCorrectedError(row, instrument));
  const finalRows = (Array.isArray(data?.finalRows) ? data.finalRows : []).map((row) => calculateCorrectedError(row, instrument));
  const pairs = initialRows.map((initial) => { const final = finalRows.find((row) => row.sequence === initial.sequence && row.direction === initial.direction); const durabilityError = Number.isFinite(final?.correctedError) && Number.isFinite(initial.correctedError) ? Math.abs(final.correctedError - initial.correctedError) : null; return { sequence: initial.sequence, direction: initial.direction, load: initial.load, initial: initial.correctedError, final: final?.correctedError ?? null, durabilityError, mpe: initial.mpe, passed: durabilityError !== null && durabilityError <= initial.mpe + EPSILON }; });
  const orderedTimes = [initialData?.completedAt, data?.cyclingStartedAt, data?.cyclingCompletedAt, data?.finalCompletedAt].map((value) => Date.parse(value)); const orderComplete = orderedTimes.every(Number.isFinite) && orderedTimes.every((value, index) => index === 0 || value >= orderedTimes[index - 1]);
  const initialRowsMatch = initialRows.length === (Array.isArray(initialData?.rows) ? initialData.rows.length : -1) && initialRows.every((row, index) => { const source = calculateCorrectedError(initialData.rows[index], instrument); return row.sequence === source.sequence && row.direction === source.direction && closeTo(row.load, source.load) && closeTo(row.correctedError, source.correctedError); });
  const linked = text(data?.initialSequenceId).length >= 3 && data.initialSequenceId === initialData?.sequenceId && text(data?.initialEvidenceReference).length >= 3 && initialRowsMatch;
  const cycleProtocolComplete = number(data?.numberOfLoadings) >= 100000 && Math.abs(number(data?.cycleLoad) - 0.5 * number(instrument.maxCapacity)) <= 0.1 * number(instrument.maxCapacity) && data?.normalLoadApplicationConfirmed === true && data?.equilibriumAchievedLoadedAndUnloaded === true;
  const complete = cycleProtocolComplete && linked && orderComplete && initialRows.length >= 10 && finalRows.length >= initialRows.length && initialRows.every((row) => row.complete) && finalRows.every((row) => row.complete) && pairs.every((row) => row.durabilityError !== null);
  return baseResult(definition, complete, complete && pairs.every((row) => row.passed) && finalRows.every((row) => row.passed), complete ? `${pairs.filter((row) => row.passed).length}/${pairs.length} durability comparisons comply after ${number(data.numberOfLoadings).toLocaleString('en-IN')} linked cycles.` : 'Record a time-ordered link to the exact initial test rows, before/after weighing rows, at least 100,000 approximately half-Max cycles, normal load application and equilibrium in both loaded and unloaded states.', { initialRows, finalRows, pairs, linked, initialRowsMatch, orderComplete, cycleProtocolComplete });
}

const automaticFamilySections = {
  '3.5': ['weighingPerformance', 'tare', 'dampHeatInitial', 'dampHeatHigh', 'dampHeatFinal'], '3.6': ['repeatability', 'eccentricityWeights', 'eccentricityRolling'],
  '3.8': ['discrimination'], '3.9': ['temperatureZero', 'zeroReturn', 'creep', 'tilting', 'warmUp', 'voltageVariation', 'enduranceFinal'],
  '3.10': REPORT_SECTIONS.filter((item) => !['construction', 'checklist'].includes(item.id)).map((item) => item.id),
  '5.2': Object.keys(DISTURBANCE_PROTOCOLS), '5.4': ['dampHeatInitial', 'dampHeatHigh', 'dampHeatFinal', ...Object.keys(DISTURBANCE_PROTOCOLS), 'spanStability'],
  '6.1': ['sensitivity'], '8.2': REPORT_SECTIONS.filter((item) => !['construction', 'checklist'].includes(item.id)).map((item) => item.id),
  'Annex A': REPORT_SECTIONS.filter((item) => item.procedure.startsWith('A.')).map((item) => item.id),
  'Annex B': REPORT_SECTIONS.filter((item) => item.procedure.startsWith('B.')).map((item) => item.id),
};

function evaluateMatrices(input, instrument, sectionResults) {
  const signedManualValue = (value, minimumNoteLength) => {
    const evidenceIds = Array.isArray(value?.evidenceIds) ? value.evidenceIds.map(text).filter(Boolean) : [];
    const authorityComplete = text(value?.examinerName).length >= 3 && text(value?.examinerRole).length >= 3 && validDate(value?.signedAt) && text(value?.authorityDecisionReference).length >= 3;
    const outcome = ['PASS', 'FAIL'].includes(value?.result) ? value.result : 'INCOMPLETE'; const complete = outcome !== 'INCOMPLETE' && text(value?.notes).length >= minimumNoteLength && evidenceIds.length > 0 && authorityComplete;
    return { outcome, complete, evidenceIds, authorityComplete };
  };
  const requirements = REQUIREMENT_FAMILIES.map((definition) => {
    const app = applicability(definition.applies, instrument); if (!app.applicable) return { ...definition, applicability: 'Not applicable', applicabilityReason: app.reason, complete: true, passed: true, outcome: 'NOT_APPLICABLE' };
    if (definition.evidence === 'automatic') { const ids = automaticFamilySections[definition.clause] || []; const linked = ids.map((id) => sectionResults[id]).filter((item) => item?.applicability === 'Applicable'); const complete = linked.length > 0 && linked.every((item) => item.complete); const passed = complete && linked.every((item) => item.passed); return { ...definition, applicability: 'Applicable', applicabilityReason: app.reason, complete, passed, outcome: !complete ? 'INCOMPLETE' : passed ? 'PASS' : 'FAIL', note: `Derived from ${linked.length} applicable test section(s).`, linkedSectionIds: linked.map((item) => item.id) }; }
    const value = input?.requirements?.[definition.clause] || {}; const signed = signedManualValue(value, 5); return { ...definition, applicability: 'Applicable', applicabilityReason: app.reason, complete: signed.complete, passed: signed.complete && signed.outcome === 'PASS', outcome: signed.complete ? signed.outcome : 'INCOMPLETE', note: text(value.notes), evidenceIds: signed.evidenceIds, examinerName: text(value.examinerName), examinerRole: text(value.examinerRole), signedAt: value.signedAt || '', authorityDecisionReference: text(value.authorityDecisionReference), authorityComplete: signed.authorityComplete };
  });
  const checklist = ALL_CHECKLIST_REQUIREMENTS.map((definition) => { const app = applicability(definition.applies, instrument); if (!app.applicable) return { ...definition, applicability: 'Not applicable', applicabilityReason: app.reason, complete: true, passed: true, outcome: 'NOT_APPLICABLE' }; const value = input?.checklist?.[definition.id] || {}; const signed = signedManualValue(value, 3); return { ...definition, applicability: 'Applicable', applicabilityReason: app.reason, complete: signed.complete, passed: signed.complete && signed.outcome === 'PASS', outcome: signed.complete ? signed.outcome : 'INCOMPLETE', note: text(value.notes), evidenceIds: signed.evidenceIds, examinerName: text(value.examinerName), examinerRole: text(value.examinerRole), signedAt: value.signedAt || '', authorityDecisionReference: text(value.authorityDecisionReference), authorityComplete: signed.authorityComplete }; });
  return { requirements, checklist };
}

function evaluateConstruction(data, matrices, definition) {
  const manual = matrices.requirements.filter((item) => item.applicability === 'Applicable' && item.evidence !== 'automatic'); const complete = text(data?.description).length >= 10 && text(data?.mainComponents).length >= 5 && text(data?.submittedDocuments).length >= 5 && text(data?.examinerConclusion).length >= 5 && manual.every((item) => item.complete); const passed = complete && manual.every((item) => item.passed);
  return baseResult(definition, complete, passed, complete ? `${manual.filter((item) => item.passed).length}/${manual.length} applicable R 76-1 clause families examined.` : `${manual.filter((item) => item.complete).length}/${manual.length} applicable manual clause families complete.`, { requirementResults: manual });
}

function evaluateChecklist(_data, matrices, definition) {
  const applicable = matrices.checklist.filter((item) => item.applicability === 'Applicable'); const complete = applicable.every((item) => item.complete); const passed = complete && applicable.every((item) => item.passed);
  return baseResult(definition, complete, passed, complete ? `${applicable.filter((item) => item.passed).length}/${applicable.length} applicable detailed checklist requirements pass.` : `${applicable.filter((item) => item.complete).length}/${applicable.length} applicable detailed checklist requirements complete.`, { checklistResults: matrices.checklist });
}

function specialApplicability(definition, instrument) {
  if (['zeroReturn', 'creep'].includes(definition.id) && instrument.accuracyClass === 'I') return { applicable: false, reason: `Section ${definition.number} applies to classes II, III and IIII.` };
  if (definition.id === 'tilting' && (instrument.accuracyClass === 'I' || instrument.features.installedFixed || instrument.features.freelySuspended) && !instrument.features.mobile && !instrument.features.portableRoadVehicle) return { applicable: false, reason: 'The declared instrument is exempt from the tilt test because it is class I, permanently installed or freely suspended and is not mobile.' };
  return applicability(definition.applies, instrument);
}

function evaluateSection(definition, data, instrument, allSectionData = {}) {
  switch (definition.id) {
    case 'weighingPerformance': return evaluatePerformance(data, instrument, definition);
    case 'temperatureZero': return evaluateTemperatureZero(data, instrument, definition);
    case 'eccentricityWeights': return evaluateEccentricity(data, instrument, definition, false);
    case 'eccentricityRolling': return evaluateEccentricity(data, instrument, definition, true);
    case 'discrimination': return evaluateDiscrimination(data, instrument, definition);
    case 'sensitivity': return evaluateSensitivity(data, instrument, definition);
    case 'repeatability': return evaluateRepeatability(data, instrument, definition);
    case 'zeroReturn': return evaluateZeroReturn(data, instrument, definition);
    case 'creep': return evaluateCreep(data, instrument, definition);
    case 'stabilityPrinting': return evaluateStability(data, instrument, definition, true);
    case 'stabilityZeroTare': return evaluateStability(data, instrument, definition, false);
    case 'tilting': return evaluateTilting(data, instrument, definition);
    case 'tare': return evaluateTare(data, instrument, definition);
    case 'warmUp': return evaluateWarmUp(data, instrument, definition);
    case 'voltageVariation': return evaluateVoltage(data, instrument, definition);
    case 'spanStability': return evaluateSpan(data, instrument, definition);
    case 'enduranceInitial': return evaluateEnduranceInitial(data, instrument, definition);
    case 'enduranceFinal': return evaluateEndurance(data, instrument, definition, allSectionData.enduranceInitial || {});
    case 'dampHeatInitial': case 'dampHeatHigh': case 'dampHeatFinal': return evaluateDampHeat(data, instrument, definition);
    default: if (definition.mode === 'disturbance') return evaluateDisturbance(data, instrument, definition); return baseResult(definition, false, false, 'Structured observations are required.');
  }
}

function diagnosticReview(sections) {
  const failed = Object.values(sections).filter((item) => item.applicability === 'Applicable' && item.complete && !item.passed);
  const incomplete = Object.values(sections).filter((item) => item.applicability === 'Applicable' && !item.complete);
  const findings = [];
  if (failed.length) findings.push({ severity: 'high', title: `${failed.length} technical section(s) failed`, detail: failed.map((item) => `${item.number} ${item.name}`).join(', ') });
  if (incomplete.length) findings.push({ severity: 'medium', title: `${incomplete.length} applicable section(s) incomplete`, detail: incomplete.slice(0, 6).map((item) => `${item.number} ${item.name}`).join(', ') });
  if (!findings.length) findings.push({ severity: 'low', title: 'No unresolved section result', detail: 'Every rules-derived applicable section is complete and within its deterministic limit or signed examination outcome.' });
  return { risk: failed.length ? 'High' : incomplete.length ? 'Medium' : 'Low', findings, method: 'Deterministic calculations plus explicitly recorded expert examination. AI does not decide statutory conformity.' };
}

export function evaluateTest(rawInput = {}, rawInstrument, profile = RULE_PROFILE) {
  if (!rawInstrument) throw new Error('Instrument is required.'); const instrument = normalizeInstrument(rawInstrument); const input = rawInput || {}; const sections = {};
  for (const definition of REPORT_SECTIONS.filter((item) => !['construction', 'checklist'].includes(item.id))) {
    const app = specialApplicability(definition, instrument); let evaluated;
    if (!app.applicable) evaluated = notApplicable(definition, app.reason);
    else { evaluated = evaluateSection(definition, input.sections?.[definition.id] || {}, instrument, input.sections || {}); if (evaluated.applicability !== 'Not applicable') evaluated = { ...withTraceability(evaluated, input.sections?.[definition.id], definition), applicability: 'Applicable', applicabilityReason: app.reason }; }
    sections[definition.id] = evaluated;
  }
  const dampIds = ['dampHeatInitial', 'dampHeatHigh', 'dampHeatFinal']; const applicableDamp = dampIds.every((id) => sections[id]?.applicability === 'Applicable');
  if (applicableDamp) {
    const dampData = dampIds.map((id) => input.sections?.[id] || {}); const protocolIds = dampData.map((item) => text(item.protocolId)); const times = dampData.map((item) => Date.parse(item.completedAt));
    const protocolLinked = protocolIds.every((id) => id.length >= 3 && id === protocolIds[0]); const stageOrderComplete = times.every(Number.isFinite) && times.every((value, index) => index === 0 || value >= times[index - 1]);
    if (!protocolLinked || !stageOrderComplete) for (const id of dampIds) sections[id] = { ...sections[id], complete: false, passed: false, outcome: 'INCOMPLETE', protocolLinked, stageOrderComplete, summary: `${sections[id].summary} All three B.2 stages must share one protocol ID and have ordered completion times.`.trim() };
    else for (const id of dampIds) sections[id] = { ...sections[id], protocolLinked, stageOrderComplete };
  }
  const matrices = evaluateMatrices(input, instrument, sections);
  const constructionDef = REPORT_SECTIONS.find((item) => item.id === 'construction'); const checklistDef = REPORT_SECTIONS.find((item) => item.id === 'checklist');
  sections.construction = { ...evaluateConstruction(input.sections?.construction || {}, matrices, constructionDef), applicability: 'Applicable', applicabilityReason: 'Required construction examination.' };
  sections.checklist = { ...evaluateChecklist(input.sections?.checklist || {}, matrices, checklistDef), applicability: 'Applicable', applicabilityReason: 'Required detailed checklist and R 76-1 supplement.' };
  const applicableSections = Object.values(sections).filter((item) => item.applicability === 'Applicable'); const complete = applicableSections.every((item) => item.complete); const passed = complete && applicableSections.every((item) => item.passed); const hasFailure = applicableSections.some((item) => item.complete && !item.passed);
  const applicableRequirements = matrices.requirements.filter((item) => item.applicability === 'Applicable'); const applicableChecklist = matrices.checklist.filter((item) => item.applicability === 'Applicable');
  const totalChecks = applicableSections.length + applicableRequirements.length + applicableChecklist.length; const completedChecks = applicableSections.filter((item) => item.complete).length + applicableRequirements.filter((item) => item.complete).length + applicableChecklist.filter((item) => item.complete).length;
  const blockers = [...applicableSections, ...applicableRequirements, ...applicableChecklist].filter((item) => !item.complete).map((item) => `${item.number || item.clause}: ${item.name || item.title || item.text}`);
  return {
    complete, passed, status: !complete ? hasFailure ? 'INCOMPLETE - FAILURES FOUND' : 'INCOMPLETE' : passed ? 'PASS' : 'FAIL', sections,
    requirements: matrices.requirements, checklist: matrices.checklist,
    coverage: { totalReportSections: REPORT_SECTIONS.length, applicableReportSections: applicableSections.length, completedReportSections: applicableSections.filter((item) => item.complete).length, totalRequirementFamilies: REQUIREMENT_FAMILIES.length, applicableRequirementFamilies: applicableRequirements.length, totalDetailedChecklistRows: ALL_CHECKLIST_REQUIREMENTS.length, applicableDetailedChecklistRows: applicableChecklist.length, totalChecks, completedChecks, percent: totalChecks ? Math.round(completedChecks * 100 / totalChecks) : 0, blockers },
    diagnostic: diagnosticReview(sections), standard: profile.standard, reportFormat: profile.reportFormat, ruleProfileId: profile.id, ruleVersion: profile.version,
    assessmentType: 'TYPE_EVALUATION', scope: 'OIML R 76 model approval / type evaluation decision support', calculatedAt: new Date().toISOString(),
  };
}

function intervalFormValid(value) {
  if (!Number.isFinite(value) || value <= 0) return false; const exponent = Math.floor(Math.log10(value)); const normalized = value / (10 ** exponent); return [1, 2, 5].some((candidate) => Math.abs(normalized - candidate) < 1e-8);
}

function classLimits(instrument, range) {
  const eGrams = grams(range.e, instrument.unit); const cls = instrument.accuracyClass;
  if (cls === 'I') return { validE: eGrams >= 0.001, minN: 50000, maxN: Infinity, minLoadIntervals: 100 };
  if (cls === 'II') return eGrams <= 0.05 ? { validE: eGrams >= 0.001, minN: 100, maxN: 100000, minLoadIntervals: 20 } : { validE: eGrams >= 0.1, minN: 5000, maxN: 100000, minLoadIntervals: 50 };
  if (cls === 'III') return eGrams <= 2 ? { validE: eGrams >= 0.1, minN: 100, maxN: 10000, minLoadIntervals: 20 } : { validE: eGrams >= 5, minN: 500, maxN: 10000, minLoadIntervals: 20 };
  return { validE: eGrams >= 5, minN: 100, maxN: 1000, minLoadIntervals: 10 };
}

export function validateInstrument(rawInstrument) {
  const instrument = normalizeInstrument(rawInstrument); const errors = []; const ranges = getRanges(instrument);
  if (!text(instrument.manufacturer)) errors.push('Manufacturer is required.'); if (!text(instrument.model)) errors.push('Model is required.'); if (!text(instrument.serialNumber)) errors.push('Identification number is required.');
  if (!text(instrument.applicant)) errors.push('Applicant is required.'); if (!text(instrument.applicationNumber)) errors.push('Model-approval application number is required.');
  if (!['I', 'II', 'III', 'IIII'].includes(instrument.accuracyClass)) errors.push('Accuracy class must be I, II, III or IIII.');
  if (!['kg', 'g', 'mg', 't', 'ct'].includes(instrument.unit)) errors.push('Unit must be kg, g, mg, t or ct.');
  const temperatureSpan = number(instrument.temperatureMax) - number(instrument.temperatureMin); const minimumTemperatureSpan = instrument.accuracyClass === 'I' ? 5 : instrument.accuracyClass === 'II' ? 15 : 30;
  if (!finite(instrument.temperatureMin) || !finite(instrument.temperatureMax) || temperatureSpan < minimumTemperatureSpan - EPSILON) errors.push(`Class ${instrument.accuracyClass} requires declared temperature limits spanning at least ${minimumTemperatureSpan} C.`);
  for (const range of ranges) {
    if (!Number.isFinite(range.max) || range.max <= 0 || !Number.isFinite(range.min) || range.min < 0 || range.min > range.max) errors.push(`${range.id}: Min and Max are invalid.`);
    if (!intervalFormValid(range.e)) errors.push(`${range.id}: e must be 1, 2 or 5 times a power of ten.`); if (!intervalFormValid(range.d)) errors.push(`${range.id}: d must be 1, 2 or 5 times a power of ten.`);
    if (range.d > range.e + EPSILON) errors.push(`${range.id}: d cannot exceed e.`);
    const limits = classLimits(instrument, range); const n = range.max / range.e; const minIntervals = range.min / range.e;
    if (!limits.validE) errors.push(`${range.id}: e is outside the allowed value for Class ${instrument.accuracyClass}.`);
    if (n < limits.minN - EPSILON || n > limits.maxN + EPSILON) errors.push(`${range.id}: Class ${instrument.accuracyClass} requires n between ${limits.minN.toLocaleString('en-IN')} and ${Number.isFinite(limits.maxN) ? limits.maxN.toLocaleString('en-IN') : 'no upper limit'}.`);
    if (minIntervals + EPSILON < limits.minLoadIntervals) errors.push(`${range.id}: Min must be at least ${limits.minLoadIntervals}e for this class/interval.`);
  }
  if (instrument.features.rangeType === 'single' && ranges.length !== 1) errors.push('A single-range instrument must have exactly one range.');
  if (instrument.features.directSales && (!['II', 'III', 'IIII'].includes(instrument.accuracyClass) || grams(instrument.maxCapacity, instrument.unit) > 100000)) errors.push('Direct-sales instruments must be Class II, III or IIII with Max not exceeding 100 kg.');
  if (instrument.features.indicatingMode === 'nonSelf' && !instrument.features.nonSelfMechanism) errors.push('Choose the non-self-indicating mechanism.');
  return { valid: errors.length === 0, errors, ranges: ranges.map((range) => ({ ...range, n: round(range.max / range.e), minIntervals: round(range.min / range.e) })), coverage: coverageForInstrument(instrument) };
}

function loadPoints(instrument, count = 10) {
  const range = getRanges(instrument).at(-1); const points = [range.min, range.max, ...transitionLoads(instrument)]; for (let i = 1; i < count; i += 1) points.push(range.min + (range.max - range.min) * i / count); return unique(points).sort((a, b) => a - b);
}

function perfectRow(instrument, load, extra = {}) {
  const range = rangeForLoad(load, instrument); return { load: round(load), indication: round(load), additionalLoad: round(0.5 * range.e), zeroIndication: 0, zeroAdditionalLoad: round(0.5 * range.e), zeroLoad: 0, rangeId: range.id, ...extra };
}

function trace(section, equipmentIds = ['eq-mass-standard']) { return { ...section, equipmentIds, evidenceNote: 'Synthetic controlled bench sheet and traceable demo-equipment record.' }; }
function demoProtocolAuthorization(scope) { return { scope, authorityName: 'Synthetic fixture metrology authority', authorityRole: 'Authorized type-evaluation reviewer (synthetic fixture)', signedAt: '2026-02-04T08:30:00.000Z', reference: `DEMO-PROTOCOL-${scope}`, evidenceIds: [`DEMO-EVIDENCE-PROTOCOL-${scope}`] }; }

function disturbanceRows(id) {
  return (DISTURBANCE_PROTOCOLS[id] || []).map((protocolId) => ({ protocolId, baseline: 1, during: 1, applicationCount: id === 'acDips' || id.startsWith('esd') ? 10 : id.startsWith('surges') ? 3 : 1, intervalSeconds: id === 'acDips' || id.startsWith('esd') ? 10 : 1, durationSeconds: id.startsWith('bursts') ? 60 : 1, detectedAndActed: false, acceptedUnderT556: false, explanation: 'No significant fault observed.' }));
}

export function createDemoAssessmentInput(rawInstrument) {
  const instrument = normalizeInstrument(rawInstrument); const max = number(instrument.maxCapacity); const min = number(instrument.minCapacity); const e = getRanges(instrument)[0].e; const d = getRanges(instrument)[0].d; const mainLoads = loadPoints(instrument, 10); const otherLoads = unique([min, max * 0.25, max * 0.5, max * 0.75, max, ...transitionLoads(instrument)]).sort((a, b) => a - b); const plan = requiredTemperaturePlan(instrument);
  const performanceSeries = plan.map((condition) => { const loads = condition.id === 'initial' ? mainLoads : otherLoads; return { id: condition.id, label: condition.id, temperature: condition.temperature, stabilizationHours: condition.id === 'initial' ? 0 : 2, temperatureRatePerMinute: condition.id === 'initial' ? 0 : 1, absoluteHumidityGm3: condition.id === 'high' ? 15 : null, rows: [...loads.map((load, sequence) => perfectRow(instrument, load, { direction: 'increasing', sequence: sequence + 1 })), ...[...loads].reverse().map((load, sequence) => perfectRow(instrument, load, { direction: 'decreasing', sequence: sequence + 1 }))] }; });
  const supports = Math.max(4, Number(instrument.features.supportPoints || 4)); const maxWithAdditiveTare = max + (finite(instrument.features.maximumAdditiveTare) ? number(instrument.features.maximumAdditiveTare) : 0); const specialMinimalEccentricity = ['tank', 'hopper'].includes(instrument.features.loadReceptorType) && instrument.features.minimalOffCentreLoading === true; const eccLoad = maxWithAdditiveTare * (specialMinimalEccentricity ? 0.1 : supports <= 4 ? 1 / 3 : 1 / (supports - 1)); const rollingTestLoad = Math.min(max * 0.8, 0.8 * maxWithAdditiveTare);
  const repeatCount = kilograms(max, instrument.unit) < 1000 ? 10 : 3; const repeated = (load) => Array.from({ length: repeatCount }, (_, index) => ({ sequence: index + 1, indication: load, additionalLoad: 0.5 * e, zeroIndication: 0, zeroAdditionalLoad: 0.5 * e, zeroLoad: 0, rangeId: rangeForLoad(load, instrument).id }));
  const fiveLoads = otherLoads.slice(0, Math.max(5, otherLoads.length));
  const voltageRows = requiredSupplyCategories(instrument.features).flatMap((category) => { const limits = supplyLimits(category, instrument.features); return ['reference', 'lower', 'upper'].flatMap((point) => [10 * e, max * 0.5].map((load) => perfectRow(instrument, load, { category, point, voltage: limits[point], operatingOutcome: 'OPERATED', functionsOperated: true, shutdownIndicationConfirmed: false }))); });
  const enduranceRows = fiveLoads.flatMap((load, index) => [perfectRow(instrument, load, { sequence: index + 1, direction: 'increasing' }), perfectRow(instrument, load, { sequence: index + 1, direction: 'decreasing' })]);
  const referenceTemperature = staticReferenceTemperature(instrument); const spanStart = Date.UTC(2026, 0, 1); const lowTiltLoad = transitionLoads(instrument).sort((a, b) => a - b)[0] ?? min;
  const sections = {
    weighingPerformance: trace({ series: performanceSeries, preloaded: true }, ['eq-mass-standard', 'eq-climate-chamber']),
    temperatureZero: trace({ points: plan.filter((item) => item.id !== 'initial').map((item) => ({ id: item.id, temperature: item.temperature, stabilizationHours: 2, temperatureRatePerMinute: 1, zeroIndication: 0, additionalLoad: 0.5 * e })) }, ['eq-mass-standard', 'eq-climate-chamber']),
    eccentricityWeights: trace({ loadPlanApproval: 'Approved synthetic type-evaluation load plan AP-1.', layoutSketchReference: 'Synthetic sketch ECC-1', rezeroBeforeEachPositionConfirmed: true, protocolAuthorization: demoProtocolAuthorization('eccentricity-weights'), rows: Array.from({ length: supports }, (_, index) => perfectRow(instrument, eccLoad, { position: `support-${index + 1}` })) }),
    eccentricityRolling: trace({ numberOfSections: 1, rollingTestLoad, loadPlanApproval: 'Approved synthetic rolling-load plan AP-2.', layoutSketchReference: 'Synthetic sketch ROLL-1', rezeroBeforeEachPositionConfirmed: true, protocolAuthorization: demoProtocolAuthorization('eccentricity-rolling'), rows: ['forward', 'reverse'].flatMap((direction) => ['beginning', 'middle', 'end'].map((position) => perfectRow(instrument, rollingTestLoad, { section: 1, direction, position }))) }, ['eq-rolling-rig', 'eq-mass-standard']),
    discrimination: trace({ rows: [min, max * 0.5, max].map((load) => ({ load, before: load, after: load + d, extraLoad: 1.4 * d, stepProcedureConfirmed: true, visibleDisplacement: true, permanentDisplacementMm: 5 })) }),
    sensitivity: trace({ rows: [0, max].map((load) => ({ load, extraLoad: Math.max(getMpe(load, e, instrument.accuracyClass), fromGrams(0.001, instrument.unit)), permanentDisplacementMm: 5 })) }, ['eq-mass-standard', 'eq-displacement']),
    repeatability: trace({ series: [{ id: 'half', load: max * 0.5, readings: repeated(max * 0.5) }, { id: 'max', load: max, readings: repeated(max) }] }),
    zeroReturn: trace({ loadDuring30Minutes: max, rangeSwitchingSequenceConfirmed: true, protocolAuthorization: demoProtocolAuthorization('multiple-range-zero-return'), readings: [0, 30, 35].map((timeMinutes) => ({ timeMinutes, zeroIndication: 0, additionalLoad: 0.5 * e })) }, ['eq-mass-standard', 'eq-time-logger']),
    creep: trace({ load: max, temperatureRange: 1, readings: [0, 15, 30].map((timeMinutes) => ({ timeMinutes, indication: max })) }, ['eq-mass-standard', 'eq-time-logger']),
    stabilityPrinting: trace({ principleAndCriteria: 'Protected stability detector, worst-case configuration.', parametersProtected: true, rows: Array.from({ length: 5 }, (_, index) => ({ run: index + 1, inhibitedBeforeStability: true, observationDurationSeconds: 5, indications: [max * 0.5, max * 0.5], storedValue: max * 0.5 })) }),
    stabilityZeroTare: trace({ principleAndCriteria: 'Protected stability detector, worst-case configuration.', parametersProtected: true, rows: Array.from({ length: 5 }, (_, index) => ({ run: index + 1, inhibitedBeforeStability: true, error: 0 })) }),
    tilting: trace({ tiltPlanApproval: 'Authority-approved synthetic limiting tilt plan AP-3.', declaredLimitingTiltPercent: 2, protocolAuthorization: demoProtocolAuthorization('tilting'), positions: ['reference', 'forward', 'backward', 'left', 'right'].flatMap((position) => [{ id: 'low', load: lowTiltLoad }, { id: 'max', load: max }].map((point) => ({ position, loadPoint: point.id, load: point.load, actualTiltPercent: position === 'reference' ? 0 : 2, referenceUnloaded: 0, referenceLoaded: point.load, tiltedUnloaded: 0, tiltedLoaded: point.load }))) }, ['eq-mass-standard', 'eq-angle-fixture']),
    tare: trace({ protocolAuthorization: demoProtocolAuthorization('tare-weighing'), runs: Array.from({ length: instrument.features.tareType === 'additive' ? 2 : 1 }, (_, runIndex) => ({ tareLoad: max * (runIndex ? 1 : 0.5), tareSettingError: 0, tareLoadPlanReference: `Synthetic tare load plan ${runIndex + 1}`, rows: [...fiveLoads.map((load, sequence) => perfectRow(instrument, load, { direction: 'increasing', sequence: sequence + 1 })), ...[...fiveLoads].reverse().map((load, sequence) => perfectRow(instrument, load, { direction: 'decreasing', sequence: sequence + 1 }))] })) }),
    warmUp: trace({ disconnectedHours: 8, weighingOutputInhibitedDuringWarmUp: true, points: [0, 5, 15, 30].map((minutes) => ({ minutes, zeroIndication: 0, zeroAdditionalLoad: 0.5 * e, load: max, indication: max, additionalLoad: 0.5 * e })) }, ['eq-mass-standard', 'eq-time-logger', 'eq-voltage-source']),
    voltageVariation: trace({ rows: voltageRows }, ['eq-mass-standard', 'eq-voltage-source']),
    dampHeatInitial: trace({ protocolId: 'B2-DEMO-1', stage: 'initial', completedAt: '2026-01-15T09:00:00.000Z', temperature: referenceTemperature, humidity: 50, conditionStabilized: true, functionsOperated: true, rows: fiveLoads.map((load) => perfectRow(instrument, load)) }, ['eq-mass-standard', 'eq-climate-chamber']),
    dampHeatHigh: trace({ protocolId: 'B2-DEMO-1', stage: 'high', completedAt: '2026-01-17T10:00:00.000Z', temperature: instrument.temperatureMax, humidity: 85, exposureDays: 2, conditionStabilized: true, functionsOperated: true, rows: fiveLoads.map((load) => perfectRow(instrument, load)) }, ['eq-mass-standard', 'eq-climate-chamber']),
    dampHeatFinal: trace({ protocolId: 'B2-DEMO-1', stage: 'final', completedAt: '2026-01-18T10:00:00.000Z', temperature: referenceTemperature, humidity: 50, conditionStabilized: true, recoveryComplete: true, functionsOperated: true, rows: fiveLoads.map((load) => perfectRow(instrument, load)) }, ['eq-mass-standard', 'eq-climate-chamber']),
    spanStability: trace({ durationDays: 28, performanceTestsDurationDays: 28, testLoad: max, sameTestWeights: true, automaticZeroTrackingDisabled: true, spanAdjustmentStateRecorded: true, trendResolutionConfirmed: true, disconnections: [{ afterMeasurementNo: 2, beforeMeasurementNo: 3, durationHours: 8 }, { afterMeasurementNo: 5, beforeMeasurementNo: 6, durationHours: 8 }], measurements: Array.from({ length: 8 }, (_, index) => ({ measurementNo: index + 1, dateTime: new Date(spanStart + index * 4 * 86400000).toISOString(), temperature: 20, humidity: 50, barometricPressure: 1013.25, location: 'Controlled span-stability laboratory', condition: index === 1 ? 'after-temperature' : index === 2 ? 'after-damp-heat' : 'scheduled', stabilizationHours: index === 1 || index === 2 ? 16 : 5, readings: Array.from({ length: index === 0 ? 5 : 1 }, () => perfectRow(instrument, max)) })) }, ['eq-mass-standard', 'eq-time-logger', 'eq-pressure-standard']),
    enduranceInitial: trace({ sequenceId: 'END-DEMO-1', completedAt: '2026-02-01T09:00:00.000Z', performedAfterOtherTests: true, rows: enduranceRows }, ['eq-mass-standard', 'eq-time-logger']),
    enduranceFinal: trace({ initialSequenceId: 'END-DEMO-1', initialEvidenceReference: 'Synthetic controlled initial endurance sheet END-DEMO-1', cyclingStartedAt: '2026-02-01T10:00:00.000Z', cyclingCompletedAt: '2026-02-03T10:00:00.000Z', finalCompletedAt: '2026-02-03T12:00:00.000Z', numberOfLoadings: 100000, cycleLoad: max * 0.5, normalLoadApplicationConfirmed: true, equilibriumAchievedLoadedAndUnloaded: true, initialRows: enduranceRows, finalRows: enduranceRows }, ['eq-mass-standard', 'eq-time-logger', 'eq-cycling-rig']),
    construction: { description: 'Complete instrument construction examined against submitted drawings and type dossier.', mainComponents: 'Load receptor, load cell, indicator, power supply, software and interfaces.', submittedDocuments: 'Drawings, manual, component specifications, markings and software documentation.', examinerConclusion: 'Applicable construction and documentation requirements comply.' }, checklist: {},
  };
  for (const id of Object.keys(DISTURBANCE_PROTOCOLS)) {
    const specialist = id.startsWith('esd') ? 'eq-esd-simulator' : ['radiatedRf', 'conductedRf'].includes(id) ? 'eq-rf-system' : 'eq-emc-generator';
    sections[id] = trace({ protocolConfirmed: true, setupReference: `Synthetic controlled setup ${id}`, referencedStandardEdition: 'Edition verified by synthetic authorized laboratory for demo test date', severityReference: `Synthetic controlled severity schedule ${id}`, environmentRecorded: true, peripheralsConfigured: true, rows: disturbanceRows(id) }, [...new Set(['eq-mass-standard', 'eq-emc-generator', specialist])]);
  }
  const signedDecision = (id, notes) => ({ result: 'PASS', notes, evidenceIds: [`DEMO-EVIDENCE-${id}`], examinerName: 'Synthetic fixture examiner', examinerRole: 'Authorized type-evaluation reviewer (synthetic fixture)', signedAt: '2026-02-04T09:00:00.000Z', authorityDecisionReference: `DEMO-DECISION-${id}` });
  const requirements = {}; for (const definition of REQUIREMENT_FAMILIES) requirements[definition.clause] = signedDecision(definition.clause, 'Examined against the submitted synthetic dossier and functional evidence; complies.');
  const checklist = {}; for (const definition of ALL_CHECKLIST_REQUIREMENTS) checklist[definition.id] = signedDecision(definition.id, 'Examined against synthetic evidence and complies.');
  const equipmentRecord = (id, category, name, serialNumber, purpose, uncertainty) => ({ id, category, name: `Synthetic demo - ${name}`, model: 'SYNTHETIC-DEMO', serialNumber, accuracyClass: 'Demonstration only', traceabilityReference: `SYNTHETIC-TRACE-${id.toUpperCase()}`, purpose, calibrationDate: '2026-01-01', calibrationDue: '2027-06-30', uncertainty });
  const equipment = [
    equipmentRecord('eq-mass-standard', 'Verification mass standard', 'reference mass and fractional-weight set', 'SYN-MASS-001', 'Applied loads, zero correction and fractional additional weights', 'Synthetic uncertainty declared below one third of EUT mpe'),
    equipmentRecord('eq-climate-chamber', 'Temperature / climate chamber', 'temperature and humidity chamber', 'SYN-CLIMATE-001', 'Static-temperature and damp-heat conditioning', 'Synthetic temperature 0.1 C and humidity 1 percent RH'),
    equipmentRecord('eq-voltage-source', 'Voltage source / electrical analyser', 'programmable supply and analyser', 'SYN-VOLT-001', 'Supply variation and warm-up power control', 'Synthetic voltage uncertainty 0.05 percent'),
    equipmentRecord('eq-emc-generator', 'Electrical disturbance generator', 'combined disturbance generator', 'SYN-EMC-001', 'Dips, bursts, surges and electrical disturbance control', 'Synthetic amplitude uncertainty per demo severity sheet'),
    equipmentRecord('eq-rf-system', 'RF immunity system', 'radiated and conducted RF immunity system', 'SYN-RF-001', 'RF field and conducted-immunity application', 'Synthetic field uncertainty per demo uniform-field report'),
    equipmentRecord('eq-esd-simulator', 'ESD simulator', 'electrostatic discharge simulator', 'SYN-ESD-001', 'Direct and indirect electrostatic discharges', 'Synthetic discharge-voltage uncertainty per demo certificate'),
    equipmentRecord('eq-time-logger', 'Timer / data logger', 'synchronized time and environmental logger', 'SYN-TIME-001', 'Creep, zero-return, warm-up, span and endurance timing', 'Synthetic time uncertainty 1 s per day'),
    equipmentRecord('eq-pressure-standard', 'Pressure / barometer standard', 'traceable barometer', 'SYN-PRESS-001', 'Span-stability barometric-pressure observations', 'Synthetic pressure uncertainty 0.2 hPa'),
    equipmentRecord('eq-angle-fixture', 'Tilt / angle fixture', 'two-axis tilt fixture', 'SYN-ANGLE-001', 'Actual longitudinal and transverse tilt application', 'Synthetic angle uncertainty 0.02 percent tilt'),
    equipmentRecord('eq-displacement', 'Length / displacement gauge', 'displacement comparator', 'SYN-LENGTH-001', 'Non-self-indicating sensitivity displacement', 'Synthetic displacement uncertainty 0.02 mm'),
    equipmentRecord('eq-rolling-rig', 'Rolling-load / axle test rig', 'rolling-load positioning rig', 'SYN-ROLL-001', 'Rolling eccentricity load and position control', 'Synthetic rolling-load uncertainty per demo axle certificate'),
    equipmentRecord('eq-cycling-rig', 'Load cycling rig with timer', 'endurance load cycling rig', 'SYN-CYCLE-001', 'One hundred thousand controlled loading/unloading cycles', 'Synthetic cycle count resolution one cycle'),
  ];
  return { schemaVersion: 3, demoFixture: true, equipment, sections, requirements, checklist, authorityDecisions: [] };
}

function blankDemoValue(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => blankDemoValue(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, blankDemoValue(childValue, childKey)]));
  if (observedKeys.test(key)) return typeof value === 'boolean' ? false : '';
  if (key === 'result') return 'NOT_ASSESSED'; if (key === 'notes' || key === 'evidenceNote' || key === 'examinerName' || key === 'examinerRole' || key === 'signedAt' || key === 'authorityDecisionReference' || key === 'evidenceIds' || key.endsWith('Approval') || key.endsWith('Reference') || key === 'setupReference') return '';
  if (key === 'protocolConfirmed' || key === 'preloaded' || key === 'parametersProtected' || key === 'weighingOutputInhibitedDuringWarmUp') return false;
  return value;
}

export function createBlankAssessmentInput(instrument) {
  const blank = blankDemoValue(createDemoAssessmentInput(instrument)); blank.demoFixture = false; blank.equipment = []; for (const section of Object.values(blank.sections)) section.equipmentIds = []; return blank;
}

export const oimlReference = Object.freeze({
  title: 'OIML R 76-1:2006 requirements and R 76-2:2007 report structure', profile: RULE_PROFILE,
  officialSources: ['https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf', 'https://www.oiml.org/en/files/pdf_r/r076-2-e07.pdf/@@download/file/R076-2-e07.pdf'],
  coverageNotice: 'R 76-2 states that its checklist is a summary, not a substitute for R 76-1. MaapSure therefore adds a separate R 76-1 clause-family and supplement matrix.',
  reportSections: REPORT_SECTIONS, requirementFamilies: REQUIREMENT_FAMILIES, detailedChecklistCount: ALL_CHECKLIST_REQUIREMENTS.length,
});
