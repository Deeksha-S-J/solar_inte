import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SKIP_SEED = process.env.SKIP_SEED === 'true';

async function main() {
  if (SKIP_SEED) {
    console.log('Skipping seed (watch mode)');
    return;
  }

  console.log('Seeding database...');

  // Rebuild panel topology to exactly: Zone A and Zone B, each 3x3 panels.
  await prisma.ticketNote.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.faultDetection.deleteMany();
  await prisma.automationEvent.deleteMany();
  await prisma.espSensorReading.deleteMany();
  await prisma.espDevice.deleteMany();
  await prisma.solarPanel.deleteMany();
  await prisma.zone.deleteMany({
    where: { name: { notIn: ['A', 'B'] } },
  });

  const zoneA = await prisma.zone.upsert({
    where: { name: 'A' },
    update: {},
    create: { name: 'A' },
  });
  const zoneB = await prisma.zone.upsert({
    where: { name: 'B' },
    update: {},
    create: { name: 'B' },
  });
  const zones = [zoneA, zoneB];

  let panelCreated = 0;
  for (const zone of zones) {
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 3; col++) {
        const rand = Math.random();
        let status: 'healthy' | 'warning' | 'fault' | 'offline' = 'healthy';
        if (rand > 0.92) status = 'fault';
        else if (rand > 0.78) status = 'warning';
        else if (rand > 0.98) status = 'offline';

        const efficiency = status === 'offline' ? 0 : 78 + Math.random() * 18;

        await prisma.solarPanel.create({
          data: {
            panelId: `PNL-${zone.name}${String(row).padStart(2, '0')}${String(col).padStart(2, '0')}`,
            row,
            column: col,
            zoneId: zone.id,
            status,
            efficiency: Math.round(efficiency * 10) / 10,
            currentOutput: status === 'offline' ? 0 : Math.round((efficiency / 100) * 400),
            maxOutput: 400,
            temperature: 35 + Math.random() * 15,
            lastChecked: new Date(),
            installDate: new Date('2023-01-15'),
            inverterGroup: `INV-${zone.name}1`,
            stringId: `STR-${zone.name}${row}`,
          },
        });
        panelCreated++;
      }
    }
  }
  console.log(`Created ${zones.length} zones and ${panelCreated} panels (2 zones x 3x3)`);

  const espDevices = ['ESP_01', 'ESP_02', 'ESP_03'];
  for (const deviceId of espDevices) {
    await prisma.espDevice.upsert({
      where: { deviceId },
      update: {},
      create: { deviceId },
    });
  }
  console.log(`Created ${espDevices.length} ESP32 device records`);

  const technicians = [
    { name: 'Marcus Chen', email: 'marcus.chen@solarfarm.com', status: 'available' as const },
    { name: 'Sarah Johnson', email: 'sarah.johnson@solarfarm.com', status: 'busy' as const },
    { name: 'David Rodriguez', email: 'david.rodriguez@solarfarm.com', status: 'available' as const },
    { name: 'Emily Park', email: 'emily.park@solarfarm.com', status: 'offline' as const },
    { name: 'James Wilson', email: 'james.wilson@solarfarm.com', status: 'available' as const },
    { name: 'Deeksha Sharma', email: 'deeksha.sharma@solarfarm.com', status: 'available' as const },
  ];

  let techCreated = 0;
  for (const tech of technicians) {
    const existing = await prisma.technician.findUnique({
      where: { email: tech.email },
    });
    if (!existing) {
      await prisma.technician.create({
        data: {
          ...tech,
          phone: '+1 (555) 123-4567',
          skills: JSON.stringify(['Panel Maintenance', 'Diagnostics']),
          activeTickets: Math.floor(Math.random() * 5),
          resolvedTickets: Math.floor(Math.random() * 200),
          avgResolutionTime: 2 + Math.random() * 3,
        },
      });
      techCreated++;
    }
  }
  console.log(`Created ${techCreated} new technicians`);

  // Get Deeksha's ID for ticket assignment
  const deeksha = await prisma.technician.findUnique({
    where: { email: 'deeksha.sharma@solarfarm.com' },
  });

  // Create sample tickets
  if (deeksha) {
    const ticketCount = await prisma.ticket.count();
    if (ticketCount === 0) {
      const panels = await prisma.solarPanel.findMany({ take: 4 });
      const statuses = ['open', 'in_progress', 'open', 'open'];
      const priorities = ['high', 'medium', 'low', 'critical'];
      
      for (let i = 0; i < 4 && i < panels.length; i++) {
        await prisma.ticket.create({
          data: {
            ticketNumber: `TK-${String(i + 1).padStart(3, '0')}`,
            status: statuses[i],
            priority: priorities[i],
            description: `Maintenance required for panel ${panels[i].panelId}`,
            faultType: ['Hot Spot', 'Dust Accumulation', ' wiring Issue', 'Inverter Fault'][i],
            assignedTechnicianId: deeksha.id,
            panelId: panels[i].id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
      console.log('Created 4 sample tickets assigned to Deeksha');
    }
  }

  const now = new Date();
  const earliestTimestamp = new Date(now.getTime() - 23 * 60 * 60 * 1000);
  const existingWeather = await prisma.weatherData.findFirst({
    where: { recordedAt: { gte: earliestTimestamp } },
  });

  if (!existingWeather) {
    for (let i = 0; i < 24; i++) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      await prisma.weatherData.create({
        data: {
          temperature: 20 + Math.random() * 15,
          condition: i > 6 && i < 18 ? 'sunny' : 'cloudy',
          humidity: 40 + Math.random() * 30,
          sunlightIntensity: i > 6 && i < 18 ? 70 + Math.random() * 30 : 0,
          recordedAt: timestamp,
        },
      });
    }
    console.log('Created 24 hours of weather data');
  } else {
    console.log('Weather data already exists, skipping');
  }

  const earliestPowerTimestamp = new Date(now);
  earliestPowerTimestamp.setHours(0, 0, 0, 0);
  const existingPower = await prisma.powerGeneration.findFirst({
    where: { timestamp: { gte: earliestPowerTimestamp } },
  });

  if (!existingPower) {
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
        timestamp.setHours(hour, 0, 0, 0);

        const solarFactor = hour >= 6 && hour <= 18
          ? Math.sin(((hour - 6) / 12) * Math.PI)
          : 0;
        const value = solarFactor * 420 * (0.85 + Math.random() * 0.15);

        await prisma.powerGeneration.create({
          data: {
            timestamp,
            value: Math.round(value * 100) / 100,
          },
        });
      }
    }
    console.log('Created 7 days of power generation data');
  } else {
    console.log('Power generation data already exists, skipping');
  }

  console.log('Database seeding complete');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
