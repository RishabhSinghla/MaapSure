const CLASS_LIMITS = {
  I: [50000, 200000],
  II: [5000, 20000],
  III: [500, 2000],
  IIII: [50, 200],
};

const CLASS_MAX_INTERVALS = {
  I: Infinity,
  II: 100000,
  III: 10000,
  IIII: 1000,
};

const round = (value, digits = 6) => Number(Number(value).toFixed(digits));
const number = (value) => Number(value || 0);

export function getMpe(load, verificationInterval, accuracyClass = 'III', serviceMode = false) {
  const e = number(verificationInterval);
  if (e <= 0) throw new Error('Verification interval must be greater than zero.');
  const intervals = Math.abs(number(load)) / e;
  const limits = CLASS_LIMITS[accuracyClass] || CLASS_LIMITS.III;
  const multiplier = intervals <= limits[0] ? 0.5 : intervals <= limits[1] ? 1 : 1.5;
  return round(multiplier * e * (serviceMode ? 2 : 1));
}

function evaluatePerformance(rows, instrument) {
  const results = (rows || []).map((row, index) => {
    const load = number(row.load);
    const indication = number(row.indication);
    const error = round(indication - load);
    const mpe = getMpe(load, instrument.verificationInterval, instrument.accuracyClass);
    const passed = Math.abs(error) <= mpe + Number.EPSILON * 100;
    return { id: row.id || `performance-${index + 1}`, load, indication, error, mpe, passed };
  });
  return {
    name: 'Weighing performance',
    passed: results.length > 0 && results.every((row) => row.passed),
    results,
    summary: `${results.filter((row) => row.passed).length}/${results.length} load points within permitted error`,
  };
}

function evaluateRepeatability(repeatability, instrument) {
  const load = number(repeatability?.load);
  const readings = (repeatability?.readings || []).map(number).filter(Number.isFinite);
  const spread = readings.length ? round(Math.max(...readings) - Math.min(...readings)) : 0;
  const mpe = getMpe(load, instrument.verificationInterval, instrument.accuracyClass);
  const passed = readings.length >= 3 && spread <= mpe + Number.EPSILON * 100;
  return {
    name: 'Repeatability',
    passed,
    load,
    readings,
    spread,
    mpe,
    summary: readings.length >= 3 ? `Reading spread ${spread} ${instrument.unit}; limit ${mpe} ${instrument.unit}` : 'At least three readings are required',
  };
}

function evaluateEccentricity(eccentricity, instrument) {
  const load = number(eccentricity?.load);
  const mpe = getMpe(load, instrument.verificationInterval, instrument.accuracyClass);
  const positions = (eccentricity?.positions || []).map((row, index) => {
    const indication = number(row.indication);
    const error = round(indication - load);
    return {
      position: row.position || `Position ${index + 1}`,
      indication,
      error,
      mpe,
      passed: Math.abs(error) <= mpe + Number.EPSILON * 100,
    };
  });
  return {
    name: 'Eccentric loading',
    passed: positions.length >= 4 && positions.every((row) => row.passed),
    load,
    positions,
    mpe,
    summary: `${positions.filter((row) => row.passed).length}/${positions.length} positions within permitted error`,
  };
}

function evaluateZeroReturn(zeroReturn, instrument) {
  const reading = number(zeroReturn?.reading);
  const limit = round(0.5 * number(instrument.verificationInterval));
  const passed = Math.abs(reading) <= limit + Number.EPSILON * 100;
  return {
    name: 'Return to zero',
    passed,
    reading,
    limit,
    summary: `Zero deviation ${reading} ${instrument.unit}; limit ${limit} ${instrument.unit}`,
  };
}

function diagnosticReview(sections, instrument) {
  const findings = [];
  const performance = sections.performance;
  const repeatability = sections.repeatability;
  const eccentricity = sections.eccentricity;
  const zeroReturn = sections.zeroReturn;

  const errors = performance.results.map((row) => row.error);
  const sameDirection = errors.length > 2 && errors.filter((error) => error > 0).length >= errors.length - 1;
  const risingErrors = errors.length > 2 && errors.slice(1).every((value, index) => Math.abs(value) >= Math.abs(errors[index]));

  if (!performance.passed && sameDirection) {
    findings.push({ severity: 'high', title: 'Possible calibration bias', detail: 'Most load points drift in the same direction. Check span calibration and reference weights.' });
  }
  if (!performance.passed && risingErrors) {
    findings.push({ severity: 'high', title: 'Error increases with load', detail: 'The error grows as the load rises. Inspect load-cell linearity, mounting and calibration.' });
  }
  if (!repeatability.passed) {
    findings.push({ severity: 'high', title: 'Unstable repeated readings', detail: 'The same load produced too much variation. Check vibration, load receptor movement and load-cell stability.' });
  }
  if (!eccentricity.passed) {
    findings.push({ severity: 'medium', title: 'Corner-load imbalance', detail: 'One or more positions respond differently. Inspect platform alignment and load-cell corner adjustment.' });
  }
  if (!zeroReturn.passed) {
    findings.push({ severity: 'medium', title: 'Zero does not recover', detail: 'The instrument did not return close enough to zero. Check mechanical binding, creep and zero tracking.' });
  }
  if (!findings.length) {
    findings.push({ severity: 'low', title: 'No critical pattern detected', detail: `All recorded checks for this Class ${instrument.accuracyClass} instrument are within the tested limits.` });
  }

  return {
    risk: findings.some((item) => item.severity === 'high') ? 'High' : findings.some((item) => item.severity === 'medium') ? 'Medium' : 'Low',
    findings,
    method: 'Explainable pattern review using OIML limits, error direction, error growth and reading spread.',
  };
}

export function evaluateTest(input, instrument) {
  if (!instrument) throw new Error('Instrument is required.');
  const sections = {
    performance: evaluatePerformance(input.performance, instrument),
    repeatability: evaluateRepeatability(input.repeatability, instrument),
    eccentricity: evaluateEccentricity(input.eccentricity, instrument),
    zeroReturn: evaluateZeroReturn(input.zeroReturn, instrument),
  };
  const passed = Object.values(sections).every((section) => section.passed);
  return {
    passed,
    status: passed ? 'PASS' : 'FAIL',
    sections,
    diagnostic: diagnosticReview(sections, instrument),
    standard: 'OIML R 76-1:2006',
    scope: 'Initial verification decision support',
    calculatedAt: new Date().toISOString(),
  };
}

export function validateInstrument(instrument) {
  const max = number(instrument.maxCapacity);
  const min = number(instrument.minCapacity);
  const e = number(instrument.verificationInterval);
  const n = e > 0 ? max / e : 0;
  const maxIntervals = CLASS_MAX_INTERVALS[instrument.accuracyClass] || CLASS_MAX_INTERVALS.III;
  const errors = [];
  if (!instrument.manufacturer?.trim()) errors.push('Manufacturer is required.');
  if (!instrument.model?.trim()) errors.push('Model is required.');
  if (!instrument.serialNumber?.trim()) errors.push('Serial number is required.');
  if (max <= 0) errors.push('Maximum capacity must be greater than zero.');
  if (e <= 0) errors.push('Verification interval must be greater than zero.');
  if (min < 0 || min > max) errors.push('Minimum capacity must be between zero and maximum capacity.');
  if (n > maxIntervals) errors.push(`Class ${instrument.accuracyClass} allows at most ${maxIntervals.toLocaleString()} verification intervals for this prototype check.`);
  return { valid: errors.length === 0, errors, intervals: round(n, 2) };
}

export const oimlReference = {
  title: 'OIML R 76-1:2006, Non-automatic weighing instruments, Part 1',
  clauses: {
    mpe: '3.5.1, Table 6',
    repeatability: '3.6.1',
    eccentricity: '3.6.2',
    zeroReturn: '3.9.4.2',
  },
};
