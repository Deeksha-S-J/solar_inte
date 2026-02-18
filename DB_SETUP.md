# Solar Guardian - Database Setup Guide

This document explains how to connect the Solar Guardian application to a Neon PostgreSQL database.

## Quick Start

### Prerequisites
- Node.js v18+
- Neon PostgreSQL account (https://neon.tech)

### Step 1: Get Neon Connection String

1. Go to https://neon.tech
2. Select your project → Dashboard
3. Click "Connection Details"
4. Copy the connection string (format: `postgresql://user:password@host.neon.tech/db?sslmode=require`)

### Step 2: Configure Environment

Create `server/.env` file:

```env
DATABASE_URL="postgresql://your-connection-string-here"
PORT=3000
```

### Step 3: Install & Generate Prisma

```bash
cd server
npm install
npx prisma generate
npx prisma db push
```

### Step 4: Start Backend

```bash
npm run dev
```

---

## Database Schema

The database uses Prisma ORM with PostgreSQL. See `server/prisma/schema.prisma` for the full schema.

### Key Tables

| Table | Description |
|-------|-------------|
| Zone | Solar farm zones/sections containing panels |
| SolarPanel | Individual solar panel data and status |
| Technician | Service technicians managing the panels |
| FaultDetection | AI-detected faults from thermal imaging |
| Ticket | Maintenance tickets/work orders |
| TicketNote | Notes/comments on tickets |
| AutomationEvent | Automation workflow events and stages |
| WeatherData | Weather conditions affecting solar generation |
| User | Application users with role-based access |
| PowerGeneration | Historical power generation data |
| EspDevice | ESP32 sensor devices |
| EspSensorReading | Sensor readings from ESP32 devices |
| SolarScan | Raspberry Pi solar thermal scans |
| PanelDetection | Individual panel detections from scans |

---

## Database Tables

### Zone

Stores the zones/sections of the solar farm.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| name | String | @unique | Zone name (e.g., "A", "B", "C") |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Relations:**
- One-to-many with SolarPanel

---

### SolarPanel

Individual solar panel data and real-time status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| panelId | String | @unique | Human-readable panel ID (e.g., "PNL-A0101") |
| row | Int | | Grid row position |
| column | Int | | Grid column position |
| zoneId | String | Foreign Key -> Zone.id | Reference to zone |
| status | String | | Panel status (healthy, warning, fault, offline) |
| efficiency | Float | | 0-100% efficiency rating |
| currentOutput | Float | | Current power output in Watts |
| maxOutput | Float | | Maximum power output in Watts |
| temperature | Float | | Panel temperature in Celsius |
| lastChecked | DateTime | | Last inspection timestamp |
| installDate | DateTime | | Installation date |
| inverterGroup | String | | Associated inverter group |
| stringId | String | | String identifier |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Relations:**
- Many-to-one with Zone
- One-to-many with Ticket
- One-to-many with FaultDetection

**Indexes:**
- zoneId
- status

---

### Technician

Service technicians who maintain and repair the solar panels.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| name | String | | Full name |
| email | String | @unique | Email address |
| phone | String | | Phone number |
| avatar | String? | | Profile image URL |
| status | String | | Technician status (available, busy, offline) |
| skills | String | | Array of skill names (JSON string) |
| activeTickets | Int | @default(0) | Current assigned tickets |
| resolvedTickets | Int | @default(0) | Total resolved tickets |
| avgResolutionTime | Float | @default(0) | Average hours to resolve |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Relations:**
- One-to-many with Ticket (assignedTickets)
- One-to-many with TicketNote

---

### FaultDetection

AI-detected faults identified through thermal imaging analysis.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| panelId | String | Foreign Key -> SolarPanel.id | Reference to panel |
| detectedAt | DateTime | | When fault was detected |
| severity | String | | Severity level (low, medium, high, critical) |
| faultType | String | | Type of fault (e.g., "Hot Spot") |
| droneImageUrl | String? | | URL to drone visual image |
| thermalImageUrl | String? | | URL to thermal scan image |
| aiConfidence | Float | | 0-100% AI confidence score |
| aiAnalysis | String | | AI analysis description |
| recommendedAction | String | | Recommended fix |
| locationX | Float | | X coordinate on panel (%) |
| locationY | Float | | Y coordinate on panel (%) |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Relations:**
- Many-to-one with SolarPanel
- One-to-many with Ticket

**Indexes:**
- panelId
- severity

---

### Ticket

Maintenance tickets and work orders for panel repairs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| ticketNumber | String | @unique | Human-readable ticket ID |
| panelId | String? | Foreign Key -> SolarPanel.id | Reference to affected panel |
| faultId | String? | Foreign Key -> FaultDetection.id | Reference to fault detection |
| status | String | | Ticket status (open, in_progress, resolved, closed) |
| priority | String | | Priority (low, medium, high, critical) |
| createdAt | DateTime | | Creation timestamp |
| updatedAt | DateTime | | Last update timestamp |
| resolvedAt | DateTime? | | Resolution timestamp |
| assignedTechnicianId | String? | Foreign Key -> Technician.id | Assigned technician |
| description | String | | Issue description |
| faultType | String | | Type of fault |
| droneImageUrl | String? | | Associated drone image |
| thermalImageUrl | String? | | Associated thermal image |
| aiAnalysis | String? | | AI analysis summary |
| recommendedAction | String? | | Recommended action |
| resolutionNotes | String? | | Resolution notes |
| resolutionCause | String? | | Root cause description |
| resolutionImageUrl | String? | | Image of completed repair |

**Relations:**
- Many-to-one with SolarPanel (optional)
- Many-to-one with FaultDetection (optional)
- Many-to-one with Technician (optional)
- One-to-many with TicketNote

**Indexes:**
- status
- priority
- assignedTechnicianId

---

### AutomationEvent

Events tracking automation workflow stages and incidents.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| eventType | String | | Type of automation event |
| stage | String | | Current workflow stage |
| incidentId | String | | Related incident identifier |
| panelId | String? | | Related panel ID |
| scanId | String? | | Related scan ID |
| faultId | String? | | Related fault ID |
| ticketId | String? | | Related ticket ID |
| technicianId | String? | | Related technician ID |
| payload | Json? | | Event payload data |
| createdAt | DateTime | @default(now()) | Creation timestamp |

**Indexes:**
- incidentId
- stage
- createdAt

---

### TicketNote

Notes and comments added to tickets by technicians.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| ticketId | String | Foreign Key -> Ticket.id | Reference to ticket |
| authorId | String | Foreign Key -> Technician.id | Author technician |
| content | String | | Note content |
| createdAt | DateTime | @default(now()) | Creation timestamp |

**Relations:**
- Many-to-one with Ticket (Cascade on delete)
- Many-to-one with Technician

**Indexes:**
- ticketId

---

### WeatherData

Weather data recorded for the solar farm location.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| temperature | Float | | Temperature in Celsius |
| condition | String | | Weather condition |
| humidity | Float | | Humidity percentage |
| sunlightIntensity | Float | | 0-100% sunlight intensity |
| recordedAt | DateTime | @unique | Recording timestamp |
| createdAt | DateTime | @default(now()) | Creation timestamp |

**Indexes:**
- recordedAt

---

### User

Application users with role-based access control.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| email | String | @unique | Email address |
| name | String | | Full name |
| role | String | | User role (admin, manager, technician, viewer) |
| avatar | String? | | Profile image URL |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

---

### PowerGeneration

Historical power generation metrics.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| timestamp | DateTime | @unique | Recording timestamp |
| value | Float | | Power value in kW |
| createdAt | DateTime | @default(now()) | Creation timestamp |

**Indexes:**
- timestamp

---

### EspDevice

ESP32 sensor devices deployed in the solar farm.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| deviceId | String | @unique | ESP32 device identifier |
| lastSeenAt | DateTime? | | Last communication timestamp |
| latestVoltage | Float? | | Latest voltage reading |
| latestCurrentMa | Float? | | Latest current reading (mA) |
| latestPowerMw | Float? | | Latest power reading (mW) |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Relations:**
- One-to-many with EspSensorReading

**Indexes:**
- lastSeenAt

---

### EspSensorReading

Sensor readings from ESP32 devices.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| deviceRefId | String | Foreign Key -> EspDevice.id | Reference to device |
| voltage | Float | | Voltage reading |
| currentMa | Float | | Current reading (mA) |
| powerMw | Float | | Power reading (mW) |
| recordedAt | DateTime | @default(now()) | Recording timestamp |
| createdAt | DateTime | @default(now()) | Creation timestamp |

**Relations:**
- Many-to-one with EspDevice

**Indexes:**
- deviceRefId
- recordedAt

---

### SolarScan

Raspberry Pi solar thermal scan data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| timestamp | DateTime | @default(now()) | Scan timestamp |
| priority | String | | Scan priority (HIGH, MEDIUM, NORMAL) |
| status | String | @default("pending") | Scan status (pending, processed, archived) |
| thermalMinTemp | Float? | | Minimum thermal temperature |
| thermalMaxTemp | Float? | | Maximum thermal temperature |
| thermalMeanTemp | Float? | | Mean thermal temperature |
| thermalDelta | Float? | | Thermal delta |
| riskScore | Int? | | Calculated risk score |
| severity | String? | | Severity (CRITICAL, HIGH, MODERATE, LOW) |
| thermalImageUrl | String? | | Base64 encoded thermal image |
| rgbImageUrl | String? | | Base64 encoded RGB image |
| dustyPanelCount | Int | @default(0) | Count of dusty panels |
| cleanPanelCount | Int | @default(0) | Count of clean panels |
| totalPanels | Int | @default(0) | Total panels scanned |
| deviceId | String? | | Raspberry Pi device ID |
| deviceName | String? | | Device name (e.g., "RPi-Camera-1") |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Relations:**
- One-to-many with PanelDetection

**Indexes:**
- timestamp
- status
- severity

---

### PanelDetection

Individual panel detection results from a solar scan.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| scanId | String | Foreign Key -> SolarScan.id | Reference to scan |
| panelNumber | String | | Panel identifier (e.g., "P1", "P2") |
| status | String | | Panel status (CLEAN, DUSTY, FAULTY) |
| x1 | Int | | Bounding box X1 coordinate |
| y1 | Int | | Bounding box Y1 coordinate |
| x2 | Int | | Bounding box X2 coordinate |
| y2 | Int | | Bounding box Y2 coordinate |
| cropImageUrl | String? | | Base64 cropped panel image |
| faultType | String? | | Type of fault detected |
| confidence | Float? | | Detection confidence score |
| solarPanelId | String? | | Linked SolarPanel ID if matched |
| createdAt | DateTime | @default(now()) | Creation timestamp |

**Relations:**
- Many-to-one with SolarScan (Cascade on delete)

**Indexes:**
- scanId
- status

### Example Queries

```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Get all panels with zone info
const panels = await prisma.solarPanel.findMany({
  include: { zone: true }
});

// Get dashboard metrics
const panelCount = await prisma.solarPanel.count();
const zones = await prisma.zone.findMany({
  include: { panels: true }
});
```

---

## Connection String Format

Neon PostgreSQL:
```
postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require
```

Local PostgreSQL:
```
postgresql://postgres:password@localhost:5432/solar_guardian?schema=public
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `ENOTFOUND` | Check hostname in connection string |
| `EADDRINUSE` | Port 3000 already in use, kill process or change port |
| Database suspended | Neon free tier suspends after 5min inactivity |

---

## Files

- `server/.env` - Environment variables (DO NOT COMMIT)
- `server/prisma/schema.prisma` - Database schema
- `server/src/db.ts` - Prisma client instance
- `server/src/db-connect.ts` - Database connection test script

