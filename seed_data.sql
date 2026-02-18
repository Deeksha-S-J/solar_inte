-- Seed data for Solar Farm Monitoring System

-- Insert EspDevice
INSERT INTO "EspDevice" (id, "deviceId", "lastSeenAt", "latestVoltage", "latestCurrentMa", "latestPowerMw", "createdAt", "updatedAt")
VALUES (
  'a1f75b6e-d0b5-41a2-ab3f-c76ccfb324a1',
  'ESP-32-C6-001',
  NOW(),
  12.5,
  250,
  3125,
  NOW(),
  NOW()
);

-- Insert 3 EspSensorReading rows linked to the device
-- Reading 1: Normal voltage (12.5V)
INSERT INTO "EspSensorReading" (id, "deviceRefId", voltage, "currentMa", "powerMw", "recordedAt", "createdAt")
VALUES (
  'b2f85c7e-e1c6-52b3-bc4g-d87ddgc435b2',
  'a1f75b6e-d0b5-41a2-ab3f-c76ccfb324a1',
  12.5,
  250,
  3125,
  NOW() - INTERVAL '5 minutes',
  NOW() - INTERVAL '5 minutes'
);

-- Reading 2: Normal voltage (12.3V)
INSERT INTO "EspSensorReading" (id, "deviceRefId", voltage, "currentMa", "powerMw", "recordedAt", "createdAt")
VALUES (
  'c3g96d8f-f2d7-63c4-cd5h-e98hehd546c3',
  'a1f75b6e-d0b5-41a2-ab3f-c76ccfb324a1',
  12.3,
  245,
  3014,
  NOW() - INTERVAL '3 minutes',
  NOW() - INTERVAL '3 minutes'
);

-- Reading 3: LOW voltage (10V) - This will trigger anomaly detection
INSERT INTO "EspSensorReading" (id, "deviceRefId", voltage, "currentMa", "powerMw", "recordedAt", "createdAt")
VALUES (
  'd4h07e9g-g3e8-74d5-de6i-f09ifia657d4',
  'a1f75b6e-d0b5-41a2-ab3f-c76ccfb324a1',
  10.0,
  180,
  1800,
  NOW(),
  NOW()
);

-- Insert 2 Technician rows
-- Technician 1: Available
INSERT INTO "Technician" (id, name, email, phone, status, skills, "activeTickets", "resolvedTickets", "avgResolutionTime", "createdAt", "updatedAt")
VALUES (
  'e5i18f0h-h4f9-85e6-ef7j-g10jgkj768e5',
  'John Smith',
  'john.smith@solarfarm.com',
  '+1-555-0101',
  'available',
  '["electrical", "solar panels", "inverters"]',
  2,
  45,
  120,
  NOW(),
  NOW()
);

-- Technician 2: Busy
INSERT INTO "Technician" (id, name, email, phone, status, skills, "activeTickets", "resolvedTickets", "avgResolutionTime", "createdAt", "updatedAt")
VALUES (
  'f6j29g1i-i5g0-96f7-fg8k-h21khlk879f6',
  'Sarah Johnson',
  'sarah.johnson@solarfarm.com',
  '+1-555-0102',
  'busy',
  '["electrical", "monitoring systems", "networking"]',
  5,
  32,
  90,
  NOW(),
  NOW()
);

