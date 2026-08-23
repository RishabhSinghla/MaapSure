export const RULE_PROFILE = Object.freeze({
  id: 'oiml-r76-2006-type-evaluation-v3',
  name: 'OIML R 76 model approval / type evaluation',
  version: '3.0.0',
  status: 'Engineering decision-support profile',
  effectiveFrom: '2026-08-23',
  standard: 'OIML R 76-1:2006',
  reportFormat: 'OIML R 76-2:2007',
  assessmentType: 'TYPE_EVALUATION',
  jurisdictionNote: 'Digitally maps the R 76-2 report sections and applicable R 76-1 clause families. It is not a statutory certificate: the current editions of referenced standards, test evidence and final conformity decision require review and authorization by the responsible Legal Metrology authority.',
});

const section = (id, number, name, procedure, requirement, mode, applies = 'always', description = '') => ({
  id, number, name, procedure, requirement, mode, applies, description,
});

// Every numbered test/examination row in the R 76-2 summary is represented here.
// The split entries under 7, 12, 13 and 15 preserve the distinct official sub-tests.
export const REPORT_SECTIONS = Object.freeze([
  section('weighingPerformance', '1', 'Weighing performance', 'A.4.4; A.5.3.1', '3.5.1; Table 6', 'performance', 'always', 'Initial intrinsic error and loading/unloading performance at all required load points.'),
  section('temperatureZero', '2', 'Temperature effect on no-load indication', 'A.5.3.2', '3.9.2.3', 'temperatureZero', 'always', 'Zero indication at consecutive stabilized temperatures.'),
  section('eccentricityWeights', '3.1', 'Eccentricity using weights', 'A.4.7.1-A.4.7.3; A.4.7.5', '3.6.2', 'eccentricity', 'weightsEccentricity', 'Loads at the positions determined from the receptor and its supports.'),
  section('eccentricityRolling', '3.2', 'Eccentricity using a rolling load', 'A.4.7.4', '3.6.2.4', 'eccentricity', 'rollingLoad', 'Beginning, middle and end in each possible driving direction and each section.'),
  section('discrimination', '4.1', 'Discrimination', 'A.4.8', '3.8', 'discrimination', 'always', 'Tests at Min, approximately half Max and Max using the indication-specific method.'),
  section('sensitivity', '4.2', 'Sensitivity', 'A.4.9', '6.1', 'sensitivity', 'nonSelf', 'Permanent displacement for non-self-indicating instruments at no-load and Max.'),
  section('repeatability', '5', 'Repeatability', 'A.4.10', '3.6.1', 'repeatability', 'always', 'Two series near 50 percent and 100 percent of Max.'),
  section('zeroReturn', '6.1', 'Zero return', 'A.4.11.2', '3.9.4.2', 'zeroReturn', 'always', 'Zero indication before and after a near-Max load held for the specified period.'),
  section('creep', '6.2', 'Creep', 'A.4.11.1', '3.9.4.1', 'creep', 'always', 'Indication change with a near-Max load over the required time.'),
  section('stabilityPrinting', '7a', 'Stability of equilibrium - printing and storage', 'A.4.12', '4.4.5; 4.4.6; 4.13.4', 'stability', 'stability', 'Functional attempts around stable equilibrium for printing or data storage.'),
  section('stabilityZeroTare', '7b', 'Stability of equilibrium - zero and tare', 'A.4.12', '4.5.6; 4.6.8', 'stability', 'zeroOrTare', 'Functional attempts around stable equilibrium for zero-setting or tare balancing.'),
  section('tilting', '8', 'Tilting', 'A.5.1', '3.9.1.1; 4.18.1', 'tilting', 'tilting', 'Reference, longitudinal and transverse tests at the applicable limiting tilt.'),
  section('tare', '9', 'Tare weighing', 'A.4.6.1-A.4.6.3', '3.5.3.3; 3.5.3.4; 3.6.3; 4.6.3', 'tare', 'tare', 'Weighing performance through the usable tare range.'),
  section('warmUp', '10', 'Warm-up time', 'A.5.2', '5.3.5', 'warmUp', 'powered', 'Near-Max readings at switch-on and after 5, 15 and 30 minutes following an eight-hour disconnection.'),
  section('voltageVariation', '11', 'Voltage variations', 'A.5.4', '3.9.3', 'voltage', 'powered', 'Tests at 10 e and between half Max and Max at applicable supply limits.'),
  section('acDips', '12.1', 'AC mains voltage dips and short interruptions', 'B.3.1', '5.4.3', 'disturbance', 'mains', 'Six official reduction/duration conditions, repeated as prescribed.'),
  section('burstsMains', '12.2a', 'Electrical bursts - mains supply lines', 'B.3.2', '5.4.3', 'disturbance', 'mains', 'Positive and negative bursts on mains power supply lines.'),
  section('burstsIo', '12.2b', 'Electrical bursts - I/O and communication lines', 'B.3.2', '5.4.3', 'disturbance', 'io', 'Positive and negative bursts on applicable long I/O and communication lines.'),
  section('surgesMains', '12.3a', 'Surges - AC mains power supply', 'B.3.3', '5.4.3', 'disturbance', 'mains', 'Positive and negative surges at the prescribed phase angles.'),
  section('surgesOtherPower', '12.3b', 'Surges - other power supply lines', 'B.3.3', '5.4.3', 'disturbance', 'otherExternalPower', 'Positive and negative surges on other external power supply lines.'),
  section('esdDirect', '12.4a', 'Electrostatic discharges - direct application', 'B.3.4', '5.4.3', 'disturbance', 'electronic', 'Contact or air discharges applied directly to the enclosure.'),
  section('esdIndirect', '12.4b', 'Electrostatic discharges - indirect application', 'B.3.4', '5.4.3', 'disturbance', 'electronic', 'Contact discharges applied to coupling planes.'),
  section('radiatedRf', '12.5', 'Immunity to radiated electromagnetic fields', 'B.3.5', '5.4.3', 'disturbance', 'electronic', 'Radiated radio-frequency electromagnetic field sweep.'),
  section('conductedRf', '12.6', 'Immunity to conducted radio-frequency fields', 'B.3.6', '5.4.3', 'disturbance', 'externalLines', 'Conducted RF on supply, I/O or communication lines.'),
  section('vehicleTransientsSupply', '12.7a', 'Road-vehicle electrical transients - supply lines', 'B.3.7.1', '5.4.3', 'disturbance', 'vehiclePower', 'Transient conduction along external 12 V or 24 V battery supply lines.'),
  section('vehicleTransientsOther', '12.7b', 'Road-vehicle electrical transients - other lines', 'B.3.7.2', '5.4.3', 'disturbance', 'vehicleOtherLines', 'Capacitive and inductive coupling via non-supply lines.'),
  section('dampHeatInitial', '13a', 'Damp heat - initial reference test', 'B.2', '5.4.3', 'correctedMeasurements', 'dampHeat', 'Initial weighing test at reference temperature.'),
  section('dampHeatHigh', '13b', 'Damp heat - high temperature and 85 percent RH', 'B.2', '5.4.3', 'correctedMeasurements', 'dampHeat', 'Weighing test after steady-state damp-heat exposure.'),
  section('dampHeatFinal', '13c', 'Damp heat - final reference test', 'B.2', '5.4.3', 'correctedMeasurements', 'dampHeat', 'Final weighing test after recovery at reference conditions.'),
  section('spanStability', '14', 'Span stability', 'B.4', '5.4.4', 'spanStability', 'spanStability', 'Repeated corrected errors over the prescribed observation period.'),
  section('enduranceInitial', '15a', 'Endurance - initial intrinsic error', 'A.6', '3.9.4.3', 'correctedMeasurements', 'endurance', 'Initial weighing test before 100,000 loading cycles.'),
  section('enduranceFinal', '15c', 'Endurance - final durability error', 'A.6', '3.9.4.3', 'endurance', 'endurance', 'Final weighing test and durability error after 100,000 loading cycles.'),
  section('construction', '16', 'Examination of construction', 'A.1-A.3', 'Clauses 4-7 and applicable annexes', 'requirements', 'always', 'Document, construction, marking, software and module conformity examination.'),
  section('checklist', '17', 'R 76-2 checklist', 'R 76-2 section 17', 'Applicable R 76-1 requirements', 'checklist', 'always', 'Official report checklist; supplemented by the complete clause-family matrix.'),
]);

const req = (clause, title, applies = 'always', evidence = 'manual') => ({ clause, title, applies, evidence });

// R 76-2 warns that its checklist is only a summary. This matrix therefore includes
// every normative top-level requirement family and every mandatory annex path in R 76-1.
export const REQUIREMENT_FAMILIES = Object.freeze([
  req('2.1', 'Units of measurement'), req('2.4', 'Application of requirements'), req('2.5', 'Binding terminology'),
  req('3.1', 'Principles of classification'), req('3.2', 'Classification of instruments'),
  req('3.3', 'Additional requirements for multi-interval instruments', 'multiInterval'),
  req('3.4', 'Auxiliary indicating devices', 'auxiliaryIndication'), req('3.5', 'Maximum permissible errors', 'always', 'automatic'),
  req('3.6', 'Permissible differences between results', 'always', 'automatic'),
  req('3.7.1', 'Weights used as standards'), req('3.7.2', 'Auxiliary verification devices used as standards', 'auxiliaryVerification'),
  req('3.7.3', 'Substitution of standard weights', 'substitutionStandards'),
  req('3.8', 'Discrimination', 'always', 'automatic'), req('3.9', 'Variations due to influence quantities and time', 'always', 'automatic'),
  req('3.10', 'Type evaluation tests and examinations', 'always', 'automatic'), req('3.10.3', 'Peripheral devices', 'peripherals'),
  req('3.11', 'Portable instruments for weighing road vehicles', 'portableRoadVehicle'),
  req('4.1', 'General construction requirements', 'selfSemi'), req('4.1.2.1', 'Protection against fraudulent use', 'selfSemi'),
  req('4.1.2.2', 'Protection against accidental breakdown and maladjustment', 'selfSemi'),
  req('4.1.2.3', 'Controls and adjustment devices', 'selfSemi'), req('4.2', 'Indication of weighing results', 'selfSemi'),
  req('4.3', 'Analog indicating devices', 'analog'), req('4.4', 'Digital indicating devices', 'digital'),
  req('4.5', 'Zero-setting and zero-tracking devices', 'zero'), req('4.6', 'Tare devices', 'tare'),
  req('4.7', 'Preset tare devices', 'presetTare'), req('4.8', 'Locking positions', 'locking'),
  req('4.9', 'Auxiliary verification devices', 'auxiliaryVerification'), req('4.10', 'Selection of weighing ranges', 'multipleRange'),
  req('4.11', 'Selection between load receptors and measuring devices', 'multipleComponents'),
  req('4.12', 'Plus and minus comparator instruments', 'comparator'), req('4.13', 'Instruments for direct sales to the public', 'directSales'),
  req('4.14', 'Price-computing instruments for direct sales', 'priceComputing'),
  req('4.15', 'Instruments similar to direct-sales instruments', 'directSalesSimilar'), req('4.16', 'Price-labeling instruments', 'priceLabeling'),
  req('4.17', 'Mechanical counting instruments with unit-weight receptor', 'mechanicalCounting'), req('4.18', 'Mobile instruments', 'mobile'),
  req('4.19', 'Portable instruments for weighing road vehicles', 'portableRoadVehicle'), req('4.20', 'Modes of operation', 'multipleModes'),
  req('5.1', 'Electronic instrument general requirements', 'electronic'), req('5.1.2', 'Durable compliance with metrological requirements', 'electronic'),
  req('5.1.4', 'Manufacturer strategy for significant faults', 'electronic'), req('5.2', 'Acting upon significant faults', 'electronic', 'automatic'),
  req('5.3', 'Electronic functional requirements', 'electronic'), req('5.4', 'Performance and span stability tests', 'electronic', 'automatic'),
  req('5.5', 'Software-controlled electronic devices', 'software'),
  req('6.1', 'Minimum sensitivity', 'nonSelf', 'automatic'), req('6.2', 'Acceptable indicating devices for non-self-indicating instruments', 'nonSelf'),
  req('6.3', 'Construction of non-self-indicating instruments', 'nonSelf'), req('6.4', 'Simple equal arm beam', 'equalArmBeam'),
  req('6.5', 'Simple 1/10 ratio beam', 'ratioBeam'), req('6.6', 'Simple sliding poise instruments', 'steelyard'),
  req('6.7', 'Roberval and Beranger instruments', 'roberval'), req('6.8', 'Instruments with ratio platforms', 'ratioPlatform'),
  req('6.9', 'Load-measuring device with accessible sliding poises', 'accessiblePoise'),
  req('7.1', 'Descriptive markings'), req('7.2', 'Verification marks'), req('8.1', 'Liability to metrological controls'),
  req('8.2', 'Type approval', 'always', 'automatic'), req('8.3', 'Initial verification', 'initialVerification'),
  req('8.4', 'Subsequent metrological control', 'subsequentControl'),
  req('Annex A', 'Testing procedures for non-automatic weighing instruments', 'always', 'automatic'),
  req('Annex B', 'Additional tests for electronic instruments', 'electronic', 'automatic'),
  req('Annex C', 'Indicators and analog data-processing modules', 'indicatorOrAnalogModule'),
  req('C.1-C.4', 'Indicator and analog-module apportionment, tests, certificates and compatibility data', 'indicatorOrAnalogModule'),
  req('Annex D', 'Digital data-processing, terminal and display modules', 'digitalModule'),
  req('D.1-D.4', 'Digital-module apportionment, tests, certificates and compatibility data', 'digitalModule'),
  req('Annex E', 'Weighing modules', 'weighingModule'), req('E.1-E.4', 'Weighing-module apportionment, tests, certificates and compatibility data', 'weighingModule'),
  req('Annex F', 'Compatibility checking of modules', 'moduleCompatibility'), req('F.1-F.5', 'Compatibility principles, quantities, formulas, examples and compatibility form', 'moduleCompatibility'),
  req('Annex G', 'Software-controlled digital devices and instruments', 'software'),
]);

export const NON_SELF_MECHANISMS = Object.freeze([
  ['equalArmBeam', 'Simple equal arm beam'], ['ratioBeam', 'Simple 1/10 ratio beam'], ['steelyard', 'Simple sliding poise / steelyard'],
  ['roberval', 'Roberval or Beranger'], ['ratioPlatform', 'Ratio platform'], ['accessiblePoise', 'Accessible sliding poise'],
]);

export function normalizeInstrument(instrument = {}) {
  const range = {
    id: 'range-1', min: Number(instrument.minCapacity ?? 0), max: Number(instrument.maxCapacity ?? 0),
    e: Number(instrument.verificationInterval ?? 0), d: Number(instrument.actualScaleInterval ?? instrument.verificationInterval ?? 0),
  };
  const features = {
    indicatingMode: 'self', digitalIndication: true, analogIndication: false, electronic: true,
    rangeType: 'single', ranges: [range], loadReceptorType: 'platform', supportPoints: 4,
    rollingLoad: false, installedFixed: true, levelIndicator: true, automaticTiltSensor: false,
    hasZeroSetting: true, zeroSettingType: 'semiAutomatic', zeroTracking: true, hasTare: true,
    tareType: 'subtractive', presetTare: false, hasPrinter: false, hasDataStorage: true,
    directSales: false, selfService: false, priceComputing: false, directSalesSimilar: false, priceLabeling: false,
    mechanicalCounting: false, comparator: false, mobile: false, outdoorMobile: false, portableRoadVehicle: false,
    multipleModes: false, auxiliaryIndication: false, auxiliaryVerification: false, locking: false,
    multipleComponents: false, multipleIndications: false, softwareControlled: true, softwareEnvironment: 'embedded', moduleType: 'complete', hasSeparatelyTestedModules: false,
    mainsPower: true, nominalVoltage: 230, nominalVoltageMin: null, nominalVoltageMax: null, frequencyHz: 50,
    externalDcPower: false, externalNominalVoltage: null, externalNominalVoltageMax: null, externalMinimumOperatingVoltage: null,
    batteryPower: false, batteryNominalVoltage: null, batteryNominalVoltageMax: null, batteryMinimumOperatingVoltage: null,
    vehiclePower: false, vehicleNominalVoltage: null, vehicleMinimumOperatingVoltage: null, ioLines: true, vehicleOtherLines: false,
    peripherals: false, substitutionStandards: false,
    nonSelfMechanism: '',
    ...(instrument.features || {}),
  };
  if (!Array.isArray(features.ranges) || !features.ranges.length) features.ranges = [range];
  return { ...instrument, assessmentType: 'TYPE_EVALUATION', applicant: instrument.applicant || instrument.manufacturer || '', applicationNumber: instrument.applicationNumber || '', typeDesignation: instrument.typeDesignation || instrument.model || '', features };
}

export function applicability(applies, rawInstrument) {
  const instrument = normalizeInstrument(rawInstrument); const f = instrument.features;
  const yes = (reason) => ({ applicable: true, reason });
  const no = (reason) => ({ applicable: false, reason });
  const complete = f.moduleType === 'complete';
  const moduleType = String(f.moduleType || 'complete');
  switch (applies) {
    case 'always': return yes('Required for this model approval / type evaluation.');
    case 'weightsEccentricity': return f.loadReceptorType !== 'rolling-only' ? yes('The load receptor can be tested with weights.') : no('The receptor is declared rolling-load only; section 3.2 applies.');
    case 'rollingLoad': return f.rollingLoad ? yes('The instrument is used for rolling loads.') : no('The instrument is not intended for rolling loads.');
    case 'selfSemi': return f.indicatingMode !== 'nonSelf' ? yes('The instrument is self- or semi-self-indicating.') : no('Clause 6 applies to this non-self-indicating instrument.');
    case 'nonSelf': return f.indicatingMode === 'nonSelf' ? yes('The instrument is non-self-indicating.') : no('The instrument is self- or semi-self-indicating.');
    case 'electronic': return f.electronic ? yes('The instrument contains electronic devices.') : no('The instrument is non-electronic.');
    case 'dampHeat': {
      const unitToGrams = { mg: 0.001, g: 1, kg: 1000, t: 1000000, ct: 0.2 };
      const eGrams = Number(instrument.verificationInterval) * (unitToGrams[instrument.unit] || NaN);
      return f.electronic && instrument.accuracyClass !== 'I' && !(instrument.accuracyClass === 'II' && eGrams < 1) ? yes('B.2 applies to this electronic instrument.') : no('B.2 excludes class I and class II instruments with e below 1 g.');
    }
    case 'spanStability': return f.electronic && instrument.accuracyClass !== 'I' ? yes('Electronic instrument not in class I.') : no('R 76-1 excludes class I instruments from the span-stability requirement.');
    case 'powered': return f.mainsPower || f.externalDcPower || f.batteryPower || f.vehiclePower ? yes('The instrument uses electrical power.') : no('The instrument does not use electrical power.');
    case 'mains': return f.electronic && f.mainsPower ? yes('Electronic instrument with AC mains supply.') : no('No AC mains supply is present.');
    case 'io': return f.electronic && f.ioLines ? yes('Applicable external I/O or communication lines are present.') : no('No applicable external I/O or communication lines are present.');
    case 'externalLines': return f.electronic && (f.mainsPower || f.externalDcPower || f.ioLines) ? yes('Applicable external supply or signal lines are present.') : no('No applicable external supply or signal lines are present.');
    case 'otherExternalPower': return f.electronic && f.externalDcPower ? yes('An external non-mains power line is present.') : no('No external non-mains power line is present.');
    case 'vehiclePower': return f.electronic && f.vehiclePower ? yes('The instrument is powered from a road-vehicle supply.') : no('No road-vehicle power supply is used.');
    case 'vehicleOtherLines': return f.electronic && f.vehiclePower && f.vehicleOtherLines ? yes('Applicable non-supply vehicle lines are present.') : no('No applicable non-supply vehicle lines are present.');
    case 'stability': return f.indicatingMode !== 'nonSelf' && (f.hasPrinter || f.hasDataStorage) ? yes('Printing or storage is available.') : no('No printing or data-storage operation is present.');
    case 'printer': return f.indicatingMode !== 'nonSelf' && f.hasPrinter ? yes('A printer is present.') : no('No applicable printer is present.');
    case 'dataStorage': return f.indicatingMode !== 'nonSelf' && f.hasDataStorage ? yes('Legally relevant data storage is present.') : no('No legally relevant data storage is present.');
    case 'zeroOrTare': return f.indicatingMode !== 'nonSelf' && (f.hasZeroSetting || f.hasTare) ? yes('Zero-setting or tare operation is present.') : no('No applicable zero-setting or tare operation is present.');
    case 'tilting': return !f.installedFixed || f.mobile || f.portableRoadVehicle ? yes('The instrument can be tilted in normal use or transport.') : no('The instrument is permanently fixed and levelled in use.');
    case 'endurance': {
      const unitToKg = { mg: 0.000001, g: 0.001, kg: 1, t: 1000, ct: 0.0002 };
      const maxKg = Number(instrument.maxCapacity) * (unitToKg[instrument.unit] || NaN);
      return ['II', 'III', 'IIII'].includes(instrument.accuracyClass) && maxKg <= 100 ? yes('Class II, III or IIII instrument with Max not exceeding 100 kg.') : no('A.6 applies only to classes II, III and IIII with Max not exceeding 100 kg.');
    }
    case 'tare': return f.hasTare ? yes('A tare device is present.') : no('No tare device is present.');
    case 'zero': return f.hasZeroSetting || f.zeroTracking ? yes('A zero-setting or zero-tracking device is present.') : no('No zero-setting or zero-tracking device is present.');
    case 'presetTare': return f.presetTare ? yes('A preset tare device is present.') : no('No preset tare device is present.');
    case 'directSalesPresetTare': return f.directSales && f.presetTare ? yes('A direct-sales instrument has preset tare.') : no('The direct-sales preset-tare combination is not present.');
    case 'analog': return f.analogIndication ? yes('Analog indication is present.') : no('No analog indication is present.');
    case 'digital': return f.digitalIndication ? yes('Digital indication is present.') : no('No digital indication is present.');
    case 'multiInterval': return f.rangeType === 'multiInterval' ? yes('This is a multi-interval instrument.') : no('This is not a multi-interval instrument.');
    case 'multipleRange': return f.rangeType === 'multipleRange' ? yes('This is a multiple-range instrument.') : no('This is not a multiple-range instrument.');
    case 'multipleRangeTare': return f.rangeType === 'multipleRange' && f.hasTare ? yes('A tare device is present on a multiple-range instrument.') : no('This is not a multiple-range instrument with tare.');
    case 'multipleIndications': return f.multipleIndications ? yes('More than one indication is present.') : no('Only one indication is declared.');
    case 'auxiliaryIndication': return f.auxiliaryIndication ? yes('An auxiliary indicating device is present.') : no('No auxiliary indicating device is present.');
    case 'auxiliaryVerification': return f.auxiliaryVerification ? yes('An auxiliary verification device is present.') : no('No auxiliary verification device is present.');
    case 'locking': return f.locking ? yes('A locking device or position is present.') : no('No locking device or position is present.');
    case 'multipleComponents': return f.multipleComponents ? yes('Selectable receptors, transmitting or measuring devices are present.') : no('No selectable measuring configuration is present.');
    case 'comparator': return f.comparator ? yes('The instrument has plus/minus comparator operation.') : no('No plus/minus comparator operation is present.');
    case 'directSales': return f.directSales ? yes('The instrument is intended for direct sales to the public.') : no('The instrument is not intended for direct sales to the public.');
    case 'selfService': return f.directSales && f.selfService ? yes('The direct-sales instrument is intended for self-service.') : no('Self-service direct-sales use is not declared.');
    case 'priceComputing': return f.priceComputing ? yes('The instrument computes price for direct sales.') : no('No price-computing function is present.');
    case 'directSalesSimilar': return f.directSalesSimilar ? yes('The instrument is similar to a direct-sales instrument.') : no('This category was not declared.');
    case 'priceLabeling': return f.priceLabeling ? yes('A price-labeling function is present.') : no('No price-labeling function is present.');
    case 'mechanicalCounting': return f.mechanicalCounting ? yes('A mechanical counting receptor is present.') : no('No mechanical counting receptor is present.');
    case 'mobile': return f.mobile ? yes('The instrument is mobile.') : no('The instrument is not mobile.');
    case 'mobileOutdoor': return f.mobile && f.outdoorMobile ? yes('The instrument is mobile and used outdoors.') : no('Outdoor mobile use is not declared.');
    case 'mobileOther': return f.mobile && !f.outdoorMobile ? yes('The mobile instrument is not declared for outdoor use.') : no('This is not the other-mobile-instrument branch.');
    case 'portableRoadVehicle': return f.portableRoadVehicle ? yes('The instrument is portable and weighs road vehicles.') : no('The instrument is not a portable road-vehicle weigher.');
    case 'multipleModes': return f.multipleModes ? yes('More than one mode of operation is available.') : no('Only the normal weighing mode is available.');
    case 'software': return f.electronic && f.softwareControlled ? yes('Legally relevant functions are software-controlled.') : no('No legally relevant software-controlled function is declared.');
    case 'embeddedSoftware': return f.electronic && f.softwareControlled && f.softwareEnvironment === 'embedded' ? yes('Legally relevant software is fixed/embedded.') : no('The legally relevant software environment is not embedded.');
    case 'programmableSoftware': return f.electronic && f.softwareControlled && ['closed', 'open'].includes(f.softwareEnvironment) ? yes('Legally relevant software is loadable in a programmable environment.') : no('No loadable programmable legally relevant software is declared.');
    case 'closedSoftware': return f.electronic && f.softwareControlled && f.softwareEnvironment === 'closed' ? yes('Legally relevant software uses a closed operating-system environment.') : no('The closed software environment is not declared.');
    case 'openSoftware': return f.electronic && f.softwareControlled && f.softwareEnvironment === 'open' ? yes('Legally relevant software uses an open operating-system environment.') : no('The open software environment is not declared.');
    case 'dataStorageSoftware': return f.electronic && f.softwareControlled && f.hasDataStorage ? yes('Legally relevant software-controlled data storage is present.') : no('No legally relevant software-controlled data storage is present.');
    case 'initialVerification': return no('This record is a model approval / type evaluation, not initial verification.');
    case 'subsequentControl': return no('This record is a model approval / type evaluation, not subsequent control.');
    case 'indicatorOrAnalogModule': return moduleType === 'indicator' || moduleType === 'analogProcessor' ? yes(`The submitted module is ${moduleType}.`) : no('The submitted item is not an indicator or analog data-processing module.');
    case 'digitalModule': return ['digitalProcessor', 'terminal', 'digitalDisplay'].includes(moduleType) ? yes(`The submitted module is ${moduleType}.`) : no('The submitted item is not a digital processing, terminal or display module.');
    case 'weighingModule': return moduleType === 'weighingModule' ? yes('A weighing module was submitted.') : no('The submitted item is not a weighing module.');
    case 'moduleCompatibility': return !complete || f.hasSeparatelyTestedModules ? yes('Module compatibility must be demonstrated.') : no('A complete instrument without separately certified modules was submitted.');
    case 'peripherals': return f.peripherals ? yes('Peripheral devices are submitted or connected.') : no('No peripheral device is submitted or connected.');
    case 'substitutionStandards': return f.substitutionStandards ? yes('Substitution of standard weights is declared.') : no('No substitution of standard weights is declared.');
    case 'equalArmBeam': case 'ratioBeam': case 'steelyard': case 'roberval': case 'ratioPlatform': case 'accessiblePoise':
      return f.indicatingMode === 'nonSelf' && f.nonSelfMechanism === applies ? yes(`Declared mechanism: ${applies}.`) : no(`The declared non-self-indicating mechanism is ${f.nonSelfMechanism || 'not this type'}.`);
    default: return yes('Applicable unless the approving authority records otherwise.');
  }
}

export function coverageForInstrument(instrument) {
  return {
    reportSections: REPORT_SECTIONS.map((item) => ({ ...item, ...applicability(item.applies, instrument) })),
    requirements: REQUIREMENT_FAMILIES.map((item) => ({ ...item, ...applicability(item.applies, instrument) })),
  };
}
