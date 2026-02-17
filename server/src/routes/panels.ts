import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();
const DEVICE_ONLINE_THRESHOLD_MS = 30 * 1000;
const WEATHER_WRITE_INTERVAL_MS = 30 * 1000;
const MIN_HEALTHY_PANEL_VOLTAGE = Number(process.env.MIN_HEALTHY_PANEL_VOLTAGE || 6);
const MIN_WARNING_PANEL_VOLTAGE = Number(process.env.MIN_WARNING_PANEL_VOLTAGE || 4.5);

// Each ESP32 controls a series string of panels.
const deviceToPanelMap: Record<string, string[]> = {
  ESP_01: ['PNL-A0101', 'PNL-A0102', 'PNL-A0103'],
  ESP_02: ['PNL-A0201', 'PNL-A0202', 'PNL-A0203'],
  ESP_03: ['PNL-A0301', 'PNL-A0302', 'PNL-A0303'],
  // ESP_04: ['PNL-B0101', 'PNL-B0102', 'PNL-B0103'],
  // ESP_05: ['PNL-B0201', 'PNL-B0202', 'PNL-B0203'],
  // ESP_06: ['PNL-B0301', 'PNL-B0302', 'PNL-B0303'],
};

const panelToDeviceMap: Record<string, string> = Object.entries(deviceToPanelMap).reduce(
  (acc, [deviceId, panelIds]) => {
    panelIds.forEach((panelId) => {
      acc[panelId] = deviceId;
    });
    return acc;
  },
  {} as Record<string, string>,
);

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

function getDeviceOnline(lastSeenAt: Date | null | undefined, nowMs: number): boolean {
  if (!lastSeenAt) return false;
  return nowMs - new Date(lastSeenAt).getTime() <= DEVICE_ONLINE_THRESHOLD_MS;
}

async function withDeviceSensorData<T extends { panelId: string }>(panels: T[]) {
  const nowMs = Date.now();
  const deviceIds = Array.from(
    new Set(
      panels
        .map((panel) => panelToDeviceMap[panel.panelId])
        .filter((deviceId): deviceId is string => Boolean(deviceId)),
    ),
  );

  const devices = deviceIds.length
    ? await prisma.espDevice.findMany({
        where: { deviceId: { in: deviceIds } },
        select: {
          deviceId: true,
          lastSeenAt: true,
          latestVoltage: true,
          latestCurrentMa: true,
          latestPowerMw: true,
        },
      })
    : [];

  const deviceMap = new Map(devices.map((device) => [device.deviceId, device]));

  return panels.map((panel) => {
    const deviceId = panelToDeviceMap[panel.panelId];
    const device = deviceId ? deviceMap.get(deviceId) : null;
    const isOnline = getDeviceOnline(device?.lastSeenAt, nowMs);
    const effectiveVoltage = isOnline ? (device?.latestVoltage ?? 0) : 0;
    const effectiveCurrent = isOnline ? (device?.latestCurrentMa ?? 0) : 0;
    const effectivePower = isOnline ? (device?.latestPowerMw ?? 0) : 0;
    const perPanelVoltage =
      isOnline
        ? effectiveVoltage / (deviceToPanelMap[deviceId!]?.length || 1)
        : null;

    let derivedStatus = (panel as { status?: string }).status ?? 'offline';
    if (!isOnline) {
      derivedStatus = 'offline';
    } else if (derivedStatus === 'healthy' && perPanelVoltage !== null && perPanelVoltage < MIN_HEALTHY_PANEL_VOLTAGE) {
      derivedStatus = 'warning';
    }

    return {
      ...panel,
      status: derivedStatus,
      sensorDeviceId: deviceId ?? null,
      sensorLastUpdated: device?.lastSeenAt ?? null,
      sensorVoltage: deviceId ? effectiveVoltage : null,
      sensorCurrentMa: deviceId ? effectiveCurrent : null,
      sensorPowerMw: deviceId ? effectivePower : null,
    };
  });
}

// Get all panels with optional filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, zone, search } = req.query;
    const zoneFilter = typeof zone === 'string' && ['A', 'B'].includes(zone) ? zone : undefined;

    const where = {
      row: { lte: 3 },
      column: { lte: 3 },
      zone: zoneFilter ? { is: { name: zoneFilter } } : { is: { name: { in: ['A', 'B'] } } },
      ...(typeof status === 'string' ? { status } : {}),
      ...(typeof search === 'string' && search.trim()
        ? { panelId: { contains: search.trim(), mode: 'insensitive' as const } }
        : {}),
    };

    const panels = await prisma.solarPanel.findMany({
      where,
      include: { zone: true },
      orderBy: [{ zone: { name: 'asc' } }, { row: 'asc' }, { column: 'asc' }],
    });

    res.json(await withDeviceSensorData(panels));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching panels:', message);
    res.status(500).json({
      error: 'Failed to fetch panels',
      details: process.env.NODE_ENV === 'development' ? message : undefined,
    });
  }
});

// Get panel statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [totalPanels, healthyPanels, warningPanels, faultPanels, offlinePanels, currentGeneration] =
      await Promise.all([
        prisma.solarPanel.count(),
        prisma.solarPanel.count({ where: { status: 'healthy' } }),
        prisma.solarPanel.count({ where: { status: 'warning' } }),
        prisma.solarPanel.count({ where: { status: 'fault' } }),
        prisma.solarPanel.count({ where: { status: 'offline' } }),
        prisma.solarPanel.aggregate({ _sum: { currentOutput: true } }),
      ]);

    const maxCapacity = totalPanels * 400;
    const currentGen = currentGeneration._sum.currentOutput || 0;
    const avgEfficiency = await prisma.solarPanel.aggregate({
      _avg: { efficiency: true },
      where: { status: { not: 'offline' } },
    });

    res.json({
      totalPanels,
      healthyPanels,
      warningPanels,
      faultPanels,
      offlinePanels,
      currentGeneration: currentGen / 1000,
      maxCapacity: maxCapacity / 1000,
      efficiency: avgEfficiency._avg.efficiency || 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching panel stats:', message);
    res.status(500).json({ error: 'Failed to fetch panel statistics' });
  }
});

// Get all panels with live sensor data
router.get('/live', async (_req: Request, res: Response) => {
  try {
    const panels = await prisma.solarPanel.findMany({
      include: { zone: true },
      orderBy: [{ zone: { name: 'asc' } }, { row: 'asc' }, { column: 'asc' }],
    });

    res.json(await withDeviceSensorData(panels));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching live panel data:', message);
    res.status(500).json({ error: 'Failed to fetch live panel data' });
  }
});

// Get DB-backed live status for dashboard banner
router.get('/live-status', async (_req: Request, res: Response) => {
  try {
    const deviceIds = Object.keys(deviceToPanelMap);
    const mappedPanelIds = Object.values(deviceToPanelMap).flat();
    const now = Date.now();
    const historyMinutes = 30;
    const historyStart = new Date(now - historyMinutes * 60 * 1000);

    const [
      dbDevices,
      recentReadings,
      totalPanels,
      healthyPanels,
      warningPanels,
      faultPanels,
      offlinePanels,
      mappedPanels,
      generationAgg,
    ] =
      await Promise.all([
        prisma.espDevice.findMany({
          where: { deviceId: { in: deviceIds } },
          select: {
            deviceId: true,
            lastSeenAt: true,
            latestVoltage: true,
            latestCurrentMa: true,
            latestPowerMw: true,
          },
        }),
        prisma.espSensorReading.findMany({
          where: {
            recordedAt: { gte: historyStart },
            device: { deviceId: { in: deviceIds } },
          },
          include: {
            device: {
              select: {
                deviceId: true,
              },
            },
          },
          orderBy: { recordedAt: 'asc' },
        }),
        prisma.solarPanel.count(),
        prisma.solarPanel.count({ where: { status: 'healthy' } }),
        prisma.solarPanel.count({ where: { status: 'warning' } }),
        prisma.solarPanel.count({ where: { status: 'fault' } }),
        prisma.solarPanel.count({ where: { status: 'offline' } }),
        prisma.solarPanel.findMany({
          where: { panelId: { in: mappedPanelIds } },
          select: { panelId: true, maxOutput: true },
        }),
        prisma.solarPanel.aggregate({ _sum: { currentOutput: true }, _avg: { efficiency: true } }),
      ]);

    const reportingDevices = dbDevices.filter((d) => d.lastSeenAt);
    const onlineDevices = reportingDevices.filter(
      (d) => getDeviceOnline(d.lastSeenAt, now),
    );

    const latestSeenAt =
      reportingDevices.length > 0
        ? new Date(
            Math.max(...reportingDevices.map((d) => new Date(d.lastSeenAt as Date).getTime())),
          ).toISOString()
        : null;

    const dbDeviceById = new Map(dbDevices.map((device) => [device.deviceId, device]));

    const devices = deviceIds.map((deviceId) => {
      const device = dbDeviceById.get(deviceId);
      const online = getDeviceOnline(device?.lastSeenAt, now);
      const staleSeconds = device?.lastSeenAt
        ? Math.max(0, Math.floor((now - new Date(device.lastSeenAt).getTime()) / 1000))
        : null;
      const panelCount = deviceToPanelMap[deviceId]?.length || 1;
      const perPanelVoltage =
        device?.latestVoltage !== null && device?.latestVoltage !== undefined
          ? device.latestVoltage / panelCount
          : null;
      let status: 'healthy' | 'warning' | 'fault' | 'offline' = 'offline';
      if (online) {
        status = 'healthy';
        if (perPanelVoltage !== null && perPanelVoltage < MIN_WARNING_PANEL_VOLTAGE) {
          status = 'fault';
        } else if (
          (perPanelVoltage !== null && perPanelVoltage < MIN_HEALTHY_PANEL_VOLTAGE) ||
          (device?.latestPowerMw || 0) <= 0
        ) {
          status = 'warning';
        }
      }
      const effectiveVoltage = online ? (device?.latestVoltage ?? 0) : 0;
      const effectiveCurrentMa = online ? (device?.latestCurrentMa ?? 0) : 0;
      const effectivePowerMw = online ? (device?.latestPowerMw ?? 0) : 0;

      return {
        deviceId,
        label: deviceId.toLowerCase().replace('_', ''),
        online,
        status,
        lastSeenAt: device?.lastSeenAt ?? null,
        staleSeconds,
        voltage: effectiveVoltage,
        currentMa: effectiveCurrentMa,
        powerMw: effectivePowerMw,
      };
    });
    const onlineDeviceIds = new Set(devices.filter((device) => device.online).map((device) => device.deviceId));
    const onlinePowerMw = devices
      .filter((device) => onlineDeviceIds.has(device.deviceId))
      .reduce((sum, device) => sum + device.powerMw, 0);
    const totalPowerMw = devices.reduce((sum, device) => sum + device.powerMw, 0);
    const totalVoltage = devices.reduce((sum, device) => sum + device.voltage, 0);
    const totalCurrentMa = devices.reduce((sum, device) => sum + device.currentMa, 0);
    const currentGenerationKwFromEsp = onlinePowerMw / 1_000_000;
    const panelMaxOutputMap = new Map(mappedPanels.map((panel) => [panel.panelId, panel.maxOutput]));
    const onlineMappedPanelIds = Array.from(onlineDeviceIds).flatMap((deviceId) => deviceToPanelMap[deviceId] || []);
    const onlineMappedMaxOutputW = onlineMappedPanelIds.reduce(
      (sum, panelId) => sum + (panelMaxOutputMap.get(panelId) || 0),
      0,
    );
    const efficiencyFromEsp =
      onlineDeviceIds.size === 0
        ? 0
        : onlineMappedMaxOutputW > 0
        ? Math.min(100, ((onlinePowerMw / 1000) / onlineMappedMaxOutputW) * 100)
        : 0;

    const bucketMap = new Map<number, Map<string, (typeof recentReadings)[number]>>();
    for (const reading of recentReadings) {
      const bucketMs = Math.floor(new Date(reading.recordedAt).getTime() / DEVICE_ONLINE_THRESHOLD_MS) * DEVICE_ONLINE_THRESHOLD_MS;
      const deviceId = reading.device.deviceId;
      if (!bucketMap.has(bucketMs)) {
        bucketMap.set(bucketMs, new Map());
      }
      const bucket = bucketMap.get(bucketMs)!;
      const existing = bucket.get(deviceId);
      if (!existing || new Date(reading.recordedAt).getTime() > new Date(existing.recordedAt).getTime()) {
        bucket.set(deviceId, reading);
      }
    }

    const powerHistory30s = Array.from(bucketMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucketMs, bucketReadings]) => {
        const totalBucketPowerMw = Array.from(bucketReadings.values()).reduce(
          (sum, reading) => sum + reading.powerMw,
          0,
        );
        return {
          timestamp: new Date(bucketMs).toISOString(),
          totalPowerKw: totalBucketPowerMw / 1_000_000,
          deviceCount: bucketReadings.size,
        };
      });

    res.json({
      totalPanels,
      healthyPanels,
      warningPanels,
      faultPanels,
      offlinePanels,
      currentGenerationKw: currentGenerationKwFromEsp,
      avgEfficiency: Math.round(efficiencyFromEsp * 10) / 10,
      panelGenerationKw: (generationAgg._sum.currentOutput || 0) / 1000,
      panelAvgEfficiency: Math.round(((generationAgg._avg.efficiency || 0) as number) * 10) / 10,
      mappedDevices: deviceIds.length,
      reportingDevices: reportingDevices.length,
      onlineDevices: onlineDevices.length,
      latestDeviceSeenAt: latestSeenAt,
      averageVoltage: deviceIds.length > 0 ? totalVoltage / deviceIds.length : 0,
      averageCurrentMa: deviceIds.length > 0 ? totalCurrentMa / deviceIds.length : 0,
      totalPowerMw,
      devices,
      powerHistory30s,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching live status:', message);
    res.status(500).json({ error: 'Failed to fetch live status' });
  }
});

// Debug endpoint with mapping + latest DB status for each ESP device
router.get('/debug/devices', async (_req: Request, res: Response) => {
  try {
    const mapping: Record<string, string> = {};
    for (const [device, panels] of Object.entries(deviceToPanelMap)) {
      mapping[device] = panels.join(', ');
    }

    const deviceIds = Object.keys(deviceToPanelMap);
    const dbDevices = await prisma.espDevice.findMany({
      where: { deviceId: { in: deviceIds } },
      select: {
        deviceId: true,
        lastSeenAt: true,
        latestVoltage: true,
        latestCurrentMa: true,
        latestPowerMw: true,
        _count: { select: { readings: true } },
      },
      orderBy: { deviceId: 'asc' },
    });

    res.json({
      setup: {
        type: '3 Panels in Series per ESP32',
        description: 'Each ESP32 controls 3 panels in series via one INA219 sensor',
        dataDistribution: 'Voltage/3, Current same, Power/3 per panel',
      },
      deviceMapping: mapping,
      devices: dbDevices.map((device) => ({
        device: device.deviceId,
        panels: deviceToPanelMap[device.deviceId] || [],
        lastSeenAt: device.lastSeenAt,
        latestVoltage: device.latestVoltage,
        latestCurrentMa: device.latestCurrentMa,
        latestPowerMw: device.latestPowerMw,
        readingCount: device._count.readings,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching device debug data:', message);
    res.status(500).json({ error: 'Failed to fetch device debug data' });
  }
});

// Get panels by zone
router.get('/zone/:zoneName', async (req: Request, res: Response) => {
  try {
    const panels = await prisma.solarPanel.findMany({
      where: { zone: { name: req.params.zoneName } },
      include: { zone: true },
      orderBy: [{ row: 'asc' }, { column: 'asc' }],
    });

    res.json(await withDeviceSensorData(panels));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching zone panels:', message);
    res.status(500).json({ error: 'Failed to fetch zone panels' });
  }
});

// Get single panel by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const panel = await prisma.solarPanel.findUnique({
      where: { id: req.params.id },
      include: {
        zone: true,
        tickets: { orderBy: { createdAt: 'desc' }, take: 5 },
        faultDetections: { orderBy: { detectedAt: 'desc' }, take: 5 },
      },
    });

    if (!panel) {
      return res.status(404).json({ error: 'Panel not found' });
    }

    const [panelWithSensor] = await withDeviceSensorData([panel]);
    res.json(panelWithSensor);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching panel:', message);
    res.status(500).json({ error: 'Failed to fetch panel' });
  }
});

// Receive sensor data from ESP32
router.post('/sensor-update', async (req: Request, res: Response) => {
  try {
    const { device_id, temperature, humidity } = req.body;
    const voltage = parseNumber(req.body?.voltage);
    const current = parseNumber(req.body?.current);
    const power = parseNumber(req.body?.power);
    const temperatureValue = parseNumber(temperature);
    const humidityValue = parseNumber(humidity);

    if (
      !device_id ||
      !Number.isFinite(voltage) ||
      !Number.isFinite(current) ||
      !Number.isFinite(power) ||
      !Number.isFinite(temperatureValue) ||
      !Number.isFinite(humidityValue)
    ) {
      return res.status(400).json({
        error:
          'Missing required fields: device_id, voltage, current, power, temperature, humidity',
      });
    }

    const panelIds = deviceToPanelMap[device_id];
    if (!panelIds || panelIds.length === 0) {
      return res.status(404).json({ error: `Device ${device_id} not found in mapping` });
    }

    const panels = await prisma.solarPanel.findMany({
      where: { panelId: { in: panelIds } },
    });

    if (panels.length === 0) {
      return res.status(404).json({ error: `Panels not found: ${panelIds.join(', ')}` });
    }

    const now = new Date();

    // --- Create WeatherData Entry ---
    const totalMaxOutputW = panels.reduce((sum, p) => sum + p.maxOutput, 0);
    const currentPowerW = power / 1000;
    const sunlightIntensity =
      totalMaxOutputW > 0
        ? Math.min(100, (currentPowerW / totalMaxOutputW) * 100)
        : 0;

    let condition: 'sunny' | 'cloudy' | 'partly-cloudy' | 'rainy' | 'stormy' = 'sunny';
    if (power <= 0) {
      condition = 'cloudy';
    } else if (humidityValue >= 85) {
      condition = 'cloudy';
    } else if (humidityValue >= 70) {
      condition = 'partly-cloudy';
    }

    let weatherData;
    try {
      const latestWeather = await prisma.weatherData.findFirst({
        orderBy: { recordedAt: 'desc' },
      });
      const shouldWriteWeather =
        !latestWeather ||
        now.getTime() - new Date(latestWeather.recordedAt).getTime() >= WEATHER_WRITE_INTERVAL_MS;
      if (shouldWriteWeather) {
        const roundedTemperature = Math.round(temperatureValue * 100) / 100;
        weatherData = await prisma.weatherData.create({
          data: {
            temperature: roundedTemperature,
            humidity: humidityValue,
            condition,
            sunlightIntensity,
            recordedAt: now,
          },
        });
      } else {
        weatherData = latestWeather ?? undefined;
      }
    } catch (e: any) {
      // Ignore unique constraint violation if a reading for this exact timestamp already exists
      if (e?.code !== 'P2002') {
        throw e;
      }
      console.warn(`WeatherData record for ${now.toISOString()} already exists.`)
    }
    // --- End WeatherData ---

    const espDevice = await prisma.espDevice.upsert({
      where: { deviceId: device_id },
      update: {
        lastSeenAt: now,
        latestVoltage: voltage,
        latestCurrentMa: current,
        latestPowerMw: power,
      },
      create: {
        deviceId: device_id,
        lastSeenAt: now,
        latestVoltage: voltage,
        latestCurrentMa: current,
        latestPowerMw: power,
      },
    });

    await prisma.espSensorReading.create({
      data: {
        deviceRefId: espDevice.id,
        voltage,
        currentMa: current,
        powerMw: power,
        recordedAt: now,
      },
    });

    const panelCount = panels.length;
    const voltagePerPanel = voltage / panelCount;
    const currentPerPanel = current;
    const powerPerPanelMw = power / panelCount;
    const powerPerPanelW = powerPerPanelMw / 1000;

    const updatedPanels = [];
    for (const panel of panels) {
      const efficiency = panel.maxOutput > 0 ? (powerPerPanelW / panel.maxOutput) * 100 : 0;

      let status = 'healthy';
      if (voltagePerPanel < MIN_WARNING_PANEL_VOLTAGE) status = 'fault';
      else if (voltagePerPanel < MIN_HEALTHY_PANEL_VOLTAGE || powerPerPanelW <= 0)
        status = 'warning';

      const updatedPanel = await prisma.solarPanel.update({
        where: { id: panel.id },
        data: {
          currentOutput: powerPerPanelW,
          efficiency: Math.min(100, efficiency),
          status,
          lastChecked: now,
        },
      });

      updatedPanels.push({
        id: updatedPanel.id,
        panelId: updatedPanel.panelId,
        currentOutput: updatedPanel.currentOutput,
        efficiency: updatedPanel.efficiency,
        status: updatedPanel.status,
      });
    }

    const currentGenerationAgg = await prisma.solarPanel.aggregate({
      _sum: { currentOutput: true },
    });
    const currentGenerationKw = (currentGenerationAgg._sum.currentOutput || 0) / 1000;
    await prisma.powerGeneration.upsert({
      where: { timestamp: now },
      update: { value: currentGenerationKw },
      create: { timestamp: now, value: currentGenerationKw },
    });

    res.json({
      success: true,
      message: `${panelCount} panels updated from ${device_id}`,
      device: device_id,
      weather: weatherData,
      panelCount,
      totalInput: {
        voltage,
        currentMa: current,
        powerMw: power,
      },
      perPanel: {
        voltage: voltagePerPanel,
        currentMa: currentPerPanel,
        powerW: powerPerPanelW,
      },
      panels: updatedPanels,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating sensor data:', message);
    res.status(500).json({ error: 'Failed to update sensor data', details: message });
  }
});

export default router;
