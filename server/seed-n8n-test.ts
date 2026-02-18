import prisma from './src/db.js';

async function seedDummyData() {
  console.log('Seeding dummy data for n8n testing...');

  // 1. Create a dummy ESP device
  const espDevice = await prisma.espDevice.upsert({
    where: { deviceId: 'ESP-TEST-001' },
    update: {},
    create: {
      deviceId: 'ESP-TEST-001',
      lastSeenAt: new Date(),
      latestVoltage: 12.5,
      latestCurrentMa: 250,
      latestPowerMw: 3125,
    },
  });
  console.log('Created ESP device:', espDevice.deviceId);

  // 2. Create some sensor readings with varying voltages
  const now = new Date();
  const readings = [
    { voltage: 12.5, currentMa: 250, powerMw: 3125, recordedAt: new Date(now.getTime() - 2 * 60000) },
    { voltage: 12.3, currentMa: 245, powerMw: 3014, recordedAt: new Date(now.getTime() - 1 * 60000) },
    { voltage: 12.1, currentMa: 240, powerMw: 2904, recordedAt: now },
  ];

  for (const reading of readings) {
    const sensorReading = await prisma.espSensorReading.create({
      data: {
        deviceRefId: espDevice.id,
        voltage: reading.voltage,
        currentMa: reading.currentMa,
        powerMw: reading.powerMw,
        recordedAt: reading.recordedAt,
      },
    });
    console.log('Created sensor reading:', sensorReading.voltage, 'V');
  }

  // 3. Create a technician for ticket assignment
  const technician = await prisma.technician.upsert({
    where: { email: 'tech@test.com' },
    update: {},
    create: {
      name: 'John Technician',
      email: 'tech@test.com',
      phone: '+1234567890',
      status: 'available',
      skills: 'electrical,panel repair',
      activeTickets: 0,
      resolvedTickets: 0,
    },
  });
  console.log('Created technician:', technician.name);

  console.log('\n✅ Dummy data seeded successfully!');
  console.log('ESP Device ID:', espDevice.deviceId);
  console.log('Technician:', technician.name);
  console.log('\nn8n workflow should now be able to:');
  console.log('1. Query ESP sensor readings');
  console.log('2. Detect voltage anomalies');
  console.log('3. Create tickets and assign to technicians');
}

seedDummyData()
  .catch((e) => {
    console.error('Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

