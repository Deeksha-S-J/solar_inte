import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// Configuration for dummy data generation
const DEFAULT_NUM_DEVICES = 3;
const READINGS_PER_DEVICE = 5;
const NORMAL_VOLTAGE = 5.0; // Normal voltage in Volts
const LOW_VOLTAGE_THRESHOLD = NORMAL_VOLTAGE * 0.85; // Below 4.25V is considered low

/**
 * Generate random voltage reading
 * @param forceLow - If true, generates intentionally low voltage to trigger anomaly detection
 */
const generateVoltage = (forceLow: boolean = false): number => {
  if (forceLow) {
    // Generate voltage between 3.0V and 4.0V (will trigger anomaly)
    return Math.random() * 1.0 + 3.0;
  }
  // Normal voltage between 4.8V and 5.2V
  return Math.random() * 0.4 + 4.8;
};

/**
 * Generate random current in mA
 */
const generateCurrent = (): number => {
  // Current between 100mA and 500mA
  return Math.random() * 400 + 100;
};

/**
 * Generate random power in mW
 */
const generatePower = (voltage: number, current: number): number => {
  return voltage * current;
};

/**
 * Generate dummy ESP devices and sensor readings
 */
router.post('/generate-dummy-data', async (req, res) => {
  try {
    const { numDevices = DEFAULT_NUM_DEVICES, readingsPerDevice = READINGS_PER_DEVICE } = req.body;
    
    console.log(`Generating dummy data: ${numDevices} devices, ${readingsPerDevice} readings each`);

    const createdDevices = [];
    const allReadings = [];

    for (let i = 1; i <= numDevices; i++) {
      const deviceId = `ESP-DUMMY-${i.toString().padStart(3, '0')}`;
      
      // First device will have low voltage readings to trigger anomaly
      const forceLow = i === 1;
      
      // Create or get existing device
      let device = await prisma.espDevice.findUnique({
        where: { deviceId }
      });

      if (!device) {
        device = await prisma.espDevice.create({
          data: {
            deviceId,
            lastSeenAt: new Date(),
            latestVoltage: generateVoltage(forceLow),
            latestCurrentMa: generateCurrent(),
            latestPowerMw: 0, // Will be calculated
          }
        });
        console.log(`Created device: ${deviceId}`);
      } else {
        // Update existing device
        device = await prisma.espDevice.update({
          where: { id: device.id },
          data: {
            lastSeenAt: new Date(),
            latestVoltage: generateVoltage(forceLow),
            latestCurrentMa: generateCurrent(),
          }
        });
        console.log(`Updated device: ${deviceId}`);
      }

      createdDevices.push(device);

      // Generate sensor readings for this device
      for (let j = 0; j < readingsPerDevice; j++) {
        const voltage = generateVoltage(forceLow);
        const currentMa = generateCurrent();
        
        const reading = await prisma.espSensorReading.create({
          data: {
            deviceRefId: device.id,
            voltage,
            currentMa,
            powerMw: generatePower(voltage, currentMa),
            recordedAt: new Date(Date.now() - j * 60000), // Spread over time
          }
        });
        
        allReadings.push(reading);
      }
    }

    res.json({
      success: true,
      message: `Generated ${allReadings.length} dummy sensor readings for ${createdDevices.length} devices`,
      devices: createdDevices.map(d => ({
        deviceId: d.deviceId,
        readingsCount: readingsPerDevice
      })),
      sampleReadings: allReadings.slice(0, 5).map(r => ({
        id: r.id,
        voltage: r.voltage,
        currentMa: r.currentMa,
        powerMw: r.powerMw,
        recordedAt: r.recordedAt
      }))
    });
  } catch (error) {
    console.error('Error generating dummy data:', error);
    res.status(500).json({ 
      error: 'Failed to generate dummy data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all ESP devices and their recent readings
 */
router.get('/devices', async (req, res) => {
  try {
    const devices = await prisma.espDevice.findMany({
      include: {
        readings: {
          orderBy: { recordedAt: 'desc' },
          take: 10
        }
      },
      orderBy: { lastSeenAt: 'desc' }
    });

    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

/**
 * Get recent sensor readings
 */
router.get('/readings', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const readings = await prisma.espSensorReading.findMany({
      include: {
        device: true
      },
      orderBy: { recordedAt: 'desc' },
      take: Number(limit)
    });

    res.json(readings);
  } catch (error) {
    console.error('Error fetching readings:', error);
    res.status(500).json({ error: 'Failed to fetch readings' });
  }
});

/**
 * Clear all dummy data
 */
router.delete('/clear-dummy-data', async (req, res) => {
  try {
    // Delete all readings first
    await prisma.espSensorReading.deleteMany({});
    
    // Delete dummy devices (those with deviceId starting with ESP-DUMMY-)
    await prisma.espDevice.deleteMany({
      where: {
        deviceId: {
          startsWith: 'ESP-DUMMY-'
        }
      }
    });

    res.json({
      success: true,
      message: 'All dummy data cleared'
    });
  } catch (error) {
    console.error('Error clearing dummy data:', error);
    res.status(500).json({ error: 'Failed to clear dummy data' });
  }
});

export default router;

