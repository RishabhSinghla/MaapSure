import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { evaluateTest } from '../shared/oimlEngine.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.resolve(currentDir, '../data');
export const uploadDir = path.join(dataDir, 'uploads');
const databasePath = path.join(dataDir, 'database.json');

const seededAt = new Date(Date.now() - 86400000 * 7).toISOString();

function seedDatabase() {
  const instruments = [
    {
      id: 'ins-retail-30', manufacturer: 'Apex Weighing Systems', model: 'RetailPro 30', serialNumber: 'AWS-RP30-24091',
      accuracyClass: 'III', maxCapacity: 30, minCapacity: 0.2, verificationInterval: 0.01, actualScaleInterval: 0.01,
      unit: 'kg', location: 'Model Approval Lab, New Delhi', status: 'Active', createdAt: seededAt,
    },
    {
      id: 'ins-platform-150', manufacturer: 'Bharat Scale Works', model: 'PlatMax 150', serialNumber: 'BSW-PM-18377',
      accuracyClass: 'III', maxCapacity: 150, minCapacity: 1, verificationInterval: 0.05, actualScaleInterval: 0.05,
      unit: 'kg', location: 'Regional Lab, Jaipur', status: 'Active', createdAt: seededAt,
    },
    {
      id: 'ins-bridge-60t', manufacturer: 'National Industrial Weighing', model: 'RoadMaster 60T', serialNumber: 'NIW-RM-60214',
      accuracyClass: 'III', maxCapacity: 60000, minCapacity: 400, verificationInterval: 20, actualScaleInterval: 20,
      unit: 'kg', location: 'Heavy Capacity Lab, Gurugram', status: 'Due soon', createdAt: seededAt,
    },
  ];

  const makeTest = ({ id, instrument, certificateNumber, verificationCode, createdAt, failure = false }) => {
    const payload = failure ? {
      performance: [
        { load: 0, indication: 0 }, { load: 5, indication: 5.004 }, { load: 15, indication: 15.016 }, { load: 30, indication: 30.026 },
      ],
      repeatability: { load: 15, readings: [15.002, 15.018, 15.006] },
      eccentricity: { load: 10, positions: [
        { position: 'Centre', indication: 10.002 }, { position: 'Front left', indication: 10.012 }, { position: 'Front right', indication: 10.001 },
        { position: 'Rear left', indication: 9.999 }, { position: 'Rear right', indication: 10.003 },
      ] },
      zeroReturn: { reading: 0.008 },
    } : {
      performance: [
        { load: 0, indication: 0 }, { load: 5, indication: 5.003 }, { load: 15, indication: 15.008 }, { load: 30, indication: 30.011 },
      ],
      repeatability: { load: 15, readings: [15.002, 15.006, 15.004] },
      eccentricity: { load: 10, positions: [
        { position: 'Centre', indication: 10.002 }, { position: 'Front left', indication: 10.004 }, { position: 'Front right', indication: 10.001 },
        { position: 'Rear left', indication: 9.999 }, { position: 'Rear right', indication: 10.003 },
      ] },
      zeroReturn: { reading: 0.003 },
    };
    return {
      id, instrumentId: instrument.id, certificateNumber, verificationCode, status: 'Finalized',
      inspectorName: failure ? 'Meera Nair' : 'Arjun Sharma', inspectorId: failure ? 'LMO-0214' : 'LMO-0186',
      laboratory: instrument.location, temperature: 24.2, humidity: 48, notes: failure ? 'Instrument held for adjustment and retest.' : 'All core metrological checks completed.',
      input: payload, evaluation: evaluateTest(payload, instrument), evidence: [], createdAt, finalizedAt: createdAt,
    };
  };

  const tests = [
    makeTest({ id: 'test-pass-seed', instrument: instruments[0], certificateNumber: 'MS-2026-00418', verificationCode: 'MS26A418', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() }),
    makeTest({ id: 'test-fail-seed', instrument: instruments[0], certificateNumber: 'MS-2026-00411', verificationCode: 'MS26F411', createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), failure: true }),
  ];

  return { instruments, tests, audit: [], settings: { laboratoryName: 'National Legal Metrology Test Centre', sequence: 419 } };
}

export async function ensureStore() {
  await fs.mkdir(uploadDir, { recursive: true });
  try {
    await fs.access(databasePath);
  } catch {
    await fs.writeFile(databasePath, JSON.stringify(seedDatabase(), null, 2));
  }
}

export async function readStore() {
  await ensureStore();
  return JSON.parse(await fs.readFile(databasePath, 'utf8'));
}

export async function writeStore(database) {
  const temporaryPath = `${databasePath}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(database, null, 2));
  await fs.rename(temporaryPath, databasePath);
}

export async function updateStore(change) {
  const database = await readStore();
  const result = await change(database);
  await writeStore(database);
  return result;
}

export function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}
