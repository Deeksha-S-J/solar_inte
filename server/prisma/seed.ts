import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Skip seeding if running in watch mode (environment variable set)
const SKIP_SEED = process.env.SKIP_SEED === 'true';

async function main() {
  if (SKIP_SEED) {
    console.log('⏭️  Skipping seed (watch mode)');
    return;
  }
  
  console.log('🌱 Seeding database...');

  // Create Zones - ONLY if they don't exist
  const zones = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  let zoneCreated = 0;
  
  for (const zoneName of zones) {
    const existing = await prisma.zone.findUnique({
      where: { name: zoneName }
    });
    if (!existing) {
      await prisma.zone.create({
        data: { name: zoneName },
      });
      zoneCreated++;
    }
  }
  console.log(`✅ Created ${zoneCreated} new zones (skipped deleted ones)`);

  // Create Panels - ONLY if they don't exist
  const createdZones = await prisma.zone.findMany();
  let panelCreated = 0;

  for (const zone of createdZones) {
    for (let row = 1; row <= 10; row++) {
      for (let col = 1; col <= 10; col++) {
        const panelId = `PNL-${zone.name}${String(row).padStart(2, '0')}${String(col).padStart(2, '0')}`;
        
        const existing = await prisma.solarPanel.findUnique({
          where: { panelId }
        });
        
        if (!existing) {
          const rand = Math.random();
          let status: 'healthy' | 'warning' | 'fault' | 'offline' = 'healthy';
          if (rand > 0.9) status = 'fault';
          else if (rand > 0.75) status = 'warning';
          else if (rand > 0.98) status = 'offline';

          const efficiency = status === 'offline' ? 0 : 75 + Math.random() * 20;

          await prisma.solarPanel.create({
            data: {
              panelId,
              row,
              column: col,
              zoneId: zone.id,
              status,
              efficiency: Math.round(efficiency * 10) / 10,
              currentOutput: status === 'offline' ? 0 : Math.round((efficiency / 100) * 400),
              maxOutput: 400,
              temperature: 35 + Math.random() * 20,
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
  }
  console.log(`✅ Created ${panelCreated} new panels (skipped deleted ones)`);

  // Create Technicians - ONLY if they don't exist
  const technicians = [
    { name: 'Marcus Chen', email: 'marcus.chen@solarfarm.com', status: 'available' as const },
    { name: 'Sarah Johnson', email: 'sarah.johnson@solarfarm.com', status: 'busy' as const },
    { name: 'David Rodriguez', email: 'david.rodriguez@solarfarm.com', status: 'available' as const },
    { name: 'Emily Park', email: 'emily.park@solarfarm.com', status: 'offline' as const },
    { name: 'James Wilson', email: 'james.wilson@solarfarm.com', status: 'available' as const },
  ];

  let techCreated = 0;
  for (const tech of technicians) {
    const existing = await prisma.technician.findUnique({
      where: { email: tech.email }
    });
    if (!existing) {
      await prisma.technician.create({
        data: {
          ...tech,
          phone: '+1 (555) 123-4567',
          skills: JSON.stringify(['Panel Maintenance', 'Diagnostics']),
          certifications: JSON.stringify(['NABCEP PV']),
          activeTickets: Math.floor(Math.random() * 5),
          resolvedTickets: Math.floor(Math.random() * 200),
          avgResolutionTime: 2 + Math.random() * 3,
          rating: 4 + Math.random(),
        },
      });
      techCreated++;
    }
  }
  console.log(`✅ Created ${techCreated} new technicians (skipped deleted ones)`);

  // Weather data - skip if any exists (just check one timestamp)
  const now = new Date();
  const earliestTimestamp = new Date(now.getTime() - 23 * 60 * 60 * 1000);
  const existingWeather = await prisma.weatherData.findFirst({
    where: { recordedAt: { gte: earliestTimestamp } }
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
    console.log(`✅ Created 24 hours of weather data`);
  } else {
    console.log(`⏭️  Weather data already exists, skipping`);
  }

  // Power generation - skip if any exists
  const earliestPowerTimestamp = new Date(now);
  earliestPowerTimestamp.setHours(0, 0, 0, 0);
  const existingPower = await prisma.powerGeneration.findFirst({
    where: { timestamp: { gte: earliestPowerTimestamp } }
  });
  
  if (!existingPower) {
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
        timestamp.setHours(hour, 0, 0, 0);
        
        const solarFactor = hour >= 6 && hour <= 18 ? 
          Math.sin(((hour - 6) / 12) * Math.PI) : 0;
        const value = solarFactor * 420 * (0.85 + Math.random() * 0.15);
        
        await prisma.powerGeneration.create({
          data: {
            timestamp,
            value: Math.round(value * 100) / 100,
          },
        });
      }
    }
    console.log(`✅ Created 7 days of power generation data`);
  } else {
    console.log(`⏭️  Power generation data already exists, skipping`);
  }

  console.log('\n🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

