import prisma from '../src/db.js';

const MINUTE_MS = 60 * 1000;

type Reading = {
  deviceRefId: string;
  recordedAt: Date;
  powerMw: number;
};

function floorToMinute(date: Date): number {
  return Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS;
}

async function main() {
  const readings: Reading[] = await prisma.espSensorReading.findMany({
    where: {
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

  // minute -> (device -> latest reading in that minute)
  const minuteDeviceLatest = new Map<number, Map<string, Reading>>();

  for (const reading of readings) {
    const minuteTs = floorToMinute(reading.recordedAt);
    if (!minuteDeviceLatest.has(minuteTs)) {
      minuteDeviceLatest.set(minuteTs, new Map<string, Reading>());
    }

    const perDevice = minuteDeviceLatest.get(minuteTs)!;
    const existing = perDevice.get(reading.deviceRefId);
    if (!existing || existing.recordedAt.getTime() < reading.recordedAt.getTime()) {
      perDevice.set(reading.deviceRefId, reading);
    }
  }

  const powerRows = Array.from(minuteDeviceLatest.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([minuteTs, perDevice]) => {
      const totalPowerMw = Array.from(perDevice.values()).reduce(
        (sum, reading) => sum + Math.max(0, reading.powerMw),
        0,
      );
      return {
        timestamp: new Date(minuteTs),
        value: totalPowerMw / 1_000_000, // mW -> kW
      };
    });

  const deleted = await prisma.powerGeneration.deleteMany({});

  const batchSize = 1000;
  for (let i = 0; i < powerRows.length; i += batchSize) {
    const chunk = powerRows.slice(i, i + batchSize);
    if (chunk.length > 0) {
      await prisma.powerGeneration.createMany({ data: chunk });
    }
  }

  const minTimestamp = powerRows[0]?.timestamp?.toISOString() ?? null;
  const maxTimestamp = powerRows[powerRows.length - 1]?.timestamp?.toISOString() ?? null;

  console.log(
    JSON.stringify(
      {
        deletedRows: deleted.count,
        sourceReadings: readings.length,
        insertedRows: powerRows.length,
        rangeStart: minTimestamp,
        rangeEnd: maxTimestamp,
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
