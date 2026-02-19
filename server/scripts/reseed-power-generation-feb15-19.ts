import prisma from '../src/db.js';

const MINUTE_MS = 60 * 1000;
const FIFTEEN_MIN_MS = 15 * MINUTE_MS;
const SEED_START = new Date('2026-02-15T00:00:00.000Z');
const CUTOVER = new Date('2026-02-19T00:00:00.000Z');

function floorToMinute(date: Date): number {
  return Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS;
}

function getDayFactor(ts: Date): number {
  const key = ts.toISOString().slice(0, 10);
  switch (key) {
    case '2026-02-15':
      return 0.68;
    case '2026-02-16':
      return 0.74;
    case '2026-02-17':
      return 0.71;
    case '2026-02-18':
      return 0.79;
    default:
      return 0;
  }
}

function seededPowerW(ts: Date): number {
  if (ts.getUTCDay() === 0) return 0;
  const hour = ts.getUTCHours() + ts.getUTCMinutes() / 60;
  const sunrise = 6.5;
  const sunset = 18.0;
  if (hour < sunrise || hour > sunset) return 0;

  const dayFactor = getDayFactor(ts);
  if (dayFactor <= 0) return 0;

  const minuteWave = Math.sin((ts.getUTCMinutes() / 60) * Math.PI * 2); // -1..1
  const value = 42.5 + 2.5 * minuteWave; // 40..45
  return Number(value.toFixed(2));
}

async function buildSeedRows() {
  const rows: Array<{ timestamp: Date; value: number }> = [];
  for (let t = SEED_START.getTime(); t < CUTOVER.getTime(); t += FIFTEEN_MIN_MS) {
    const ts = new Date(t);
    if (ts.getUTCDay() === 0) continue;
    rows.push({
      timestamp: ts,
      value: seededPowerW(ts),
    });
  }
  return rows;
}

async function buildEspRows() {
  const readings = await prisma.espSensorReading.findMany({
    where: {
      recordedAt: { gte: CUTOVER },
      device: {
        deviceId: {
          not: {
            startsWith: 'ESP-DUMMY-',
          },
        },
      },
    },
    select: {
      deviceRefId: true,
      recordedAt: true,
      powerMw: true,
    },
    orderBy: { recordedAt: 'asc' },
  });

  const minuteDeviceLatest = new Map<number, Map<string, { recordedAt: Date; powerMw: number }>>();

  for (const reading of readings) {
    const minuteTs = floorToMinute(reading.recordedAt);
    if (!minuteDeviceLatest.has(minuteTs)) {
      minuteDeviceLatest.set(minuteTs, new Map());
    }

    const perDevice = minuteDeviceLatest.get(minuteTs)!;
    const existing = perDevice.get(reading.deviceRefId);
    if (!existing || existing.recordedAt.getTime() < reading.recordedAt.getTime()) {
      perDevice.set(reading.deviceRefId, {
        recordedAt: reading.recordedAt,
        powerMw: reading.powerMw,
      });
    }
  }

  const rows = Array.from(minuteDeviceLatest.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([minuteTs, perDevice]) => {
      const totalW = Array.from(perDevice.values()).reduce(
        (sum, item) => sum + Math.max(0, item.powerMw / 1000),
        0,
      );
      return {
        timestamp: new Date(minuteTs),
        value: Number(totalW.toFixed(2)),
      };
    });

  return { rows, readingCount: readings.length };
}

async function main() {
  const seedRows = await buildSeedRows();
  const { rows: espRows, readingCount } = await buildEspRows();
  const finalRows = [...seedRows, ...espRows];

  const deleted = await prisma.powerGeneration.deleteMany({});

  const batchSize = 1000;
  for (let i = 0; i < finalRows.length; i += batchSize) {
    const chunk = finalRows.slice(i, i + batchSize);
    if (chunk.length > 0) {
      await prisma.powerGeneration.createMany({ data: chunk });
    }
  }

  console.log(
    JSON.stringify(
      {
        deletedRows: deleted.count,
        seededRows: seedRows.length,
        espReadingCountUsed: readingCount,
        espRowsInserted: espRows.length,
        insertedRowsTotal: finalRows.length,
        seedStart: SEED_START.toISOString(),
        seedEndExclusive: CUTOVER.toISOString(),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
