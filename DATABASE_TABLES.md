# Solar Guardian Database Schema Documentation

This document outlines all the database tables required for the Solar Guardian application. The schema is defined using Prisma ORM with PostgreSQL.

## Table Overview

| Table Name | Description |
|------------|-------------|
| Zone | Solar farm zones/sections containing panels |
| SolarPanel | Individual solar panel data and status |
| Technician | Service technicians managing the panels |
| FaultDetection | AI-detected faults from drone thermal imaging |
| Ticket | Maintenance tickets/work orders |
| TicketNote | Notes/comments on tickets |
| WeatherData | Weather conditions affecting solar generation |
| User | Application users with role-based access |
| PxowerGeneration | Historical power generation data |

---

## Zone

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

## SolarPanel

Individual solar panel data and real-time status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| panelId | String | @unique | Human-readable panel ID (e.g., "PNL-A0101") |
| row | Int | | Grid row position |
| column | Int | | Grid column position |
| zoneId | String | Foreign Key -> Zone.id | Reference to zone |
| status | PanelStatus | Enum | healthy, warning, fault, offline |
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

## Technician

Service technicians who maintain and repair the solar panels.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| name | String | | Full name |
| email | String | @unique | Email address |
| phone | String | | Phone number |
| avatar | String? | | Profile image URL |
| status | TechStatus | Enum | available, busy, offline |
| skills | String[] | | Array of skill names |
| activeTickets | Int | @default(0) | Current assigned tickets |
| resolvedTickets | Int | @default(0) | Total resolved tickets |
| avgResolutionTime | Float | @default(0) | Average hours to resolve |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

**Relations:**
- One-to-many with Ticket (assignedTickets)
- One-to-many with TicketNote

---

## FaultDetection

AI-detected faults identified through drone thermal imaging analysis.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| panelId | String | Foreign Key -> SolarPanel.id | Reference to panel |
| detectedAt | DateTime | | When fault was detected |
| severity | Severity | Enum | low, medium, high, critical |
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

## Ticket

Maintenance tickets and work orders for panel repairs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| ticketNumber | String | @unique | Human-readable ticket ID |
| panelId | String? | Foreign Key -> SolarPanel.id | Reference to affected panel |
| faultId | String? | Foreign Key -> FaultDetection.id | Reference to fault detection |
| status | TicketStatus | Enum | open, in_progress, resolved, closed |
| priority | Priority | Enum | low, medium, high, critical |
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

## TicketNote

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

## WeatherData

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

## User

Application users with role-based access control.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String | @id @default(cuid()) | Unique identifier |
| email | String | @unique | Email address |
| name | String | | Full name |
| role | UserRole | Enum | admin, manager, technician, viewer |
| avatar | String? | | Profile image URL |
| createdAt | DateTime | @default(now()) | Creation timestamp |
| updatedAt | DateTime | @updatedAt | Last update timestamp |

---

## PowerGeneration

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

## Enum Definitions

### PanelStatus
| Value | Description |
|-------|-------------|
| healthy | Panel operating normally |
| warning | Minor issues detected |
| fault | Major fault detected |
| offline | Panel not operating |

### TechStatus
| Value | Description |
|-------|-------------|
| available | Technician available for assignment |
| busy | Technician currently working |
| offline | Technician offline |

### Severity
| Value | Description |
|-------|-------------|
| low | Minor issue, low priority |
| medium | Moderate issue |
| high | Serious issue, urgent attention |
| critical | Critical, immediate action required |

### TicketStatus
| Value | Description |
|-------|-------------|
| open | Ticket just created |
| in_progress | Technician working on it |
| resolved | Issue fixed, awaiting verification |
| closed | Ticket closed |

### Priority
| Value | Description |
|-------|-------------|
| low | Can wait for routine maintenance |
| medium | Should be addressed soon |
| high | Urgent, significant impact |
| critical | Emergency, immediate action |

### UserRole
| Value | Description |
|-------|-------------|
| admin | Full system access |
| manager | Can manage technicians and tickets |
| technician | Can view and update assigned tickets |
| viewer | Read-only access |

---

## Entity Relationship Diagram

```
Zone ───┬── SolarPanel ───┬── FaultDetection ───┬── Ticket
        │                  │                      │
        │                  │                      ├── Technician (assigned)
        │                  │                      │
        │                  │                      └── TicketNote
        │                  │
        └── Ticket (optional panel reference)
```

---

## Database Setup Commands

### Push schema to database:
```bash
cd server
npx prisma db push
```

### Generate Prisma client:
```bash
cd server
npx prisma generate
```

### Run migrations:
```bash
cd server
npx prisma migrate dev
```

### View database in Prisma Studio:
```bash
cd server
npx prisma studio
```

---

## How to Connect PostgreSQL to Solar Guardian

### Prerequisites

1. **Install PostgreSQL** (if not already installed)
   - Download from: https://www.postgresql.org/download/
   - Or use Homebrew: `brew install postgresql@15`

2. **Create a PostgreSQL database**
   ```bash
   # Connect to PostgreSQL
   psql -U postgres
   
   # Create database
   CREATE DATABASE solar_guardian;
   
   # Exit psql
   \q
   ```

### Step 1: Configure Environment Variables

Create or edit the `.env` file in `server/` directory:

```env
# PostgreSQL Connection String
DATABASE_URL="postgresql://username:password@localhost:5432/solar_guardian?schema=public"

# Example with local PostgreSQL:
DATABASE_URL="postgresql://postgres:password123@localhost:5432/solar_guardian?schema=public"

# Example with Supabase/Neon/etc:
DATABASE_URL="postgresql://user:pass@host:5432/solar_guardian?schema=public"
```

### Step 2: Install Dependencies

```bash
cd server
npm install
```

### Step 3: Push Schema to Database

```bash
cd server
npx prisma db push
```

This creates all tables defined in `prisma/schema.prisma`.

### Step 4: Generate Prisma Client

```bash
cd server
npx prisma generate
```

### Step 5: (Optional) Seed Test Data

```bash
cd server
npm run seed
```

### Step 6: Start the API Server

```bash
cd server
npm run dev
```

### Connection Options

#### Local PostgreSQL
```
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/solar_guardian?schema=public"
```

#### Supabase
```
DATABASE_URL="postgresql://postgres:your-password@db.xxx.supabase.co:5432/postgres?schema=public"
```

#### Neon
```
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/solar_guardian?schema=public"
```

#### Railway
```
DATABASE_URL="postgresql://postgres:password@containers-xx.railway.app:5432/railway"
```

### Verify Connection

1. **Check Prisma Studio** (visual database interface):
   ```bash
   cd server
   npx prisma studio
   ```
   Then open http://localhost:5555 in your browser.

2. **Test via API**:
   ```bash
   curl http://localhost:3000/api/panels
   ```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Check PostgreSQL is running: `brew services start postgresql` |
| Authentication failed | Verify username/password in DATABASE_URL |
| Database doesn't exist | Create database first: `CREATE DATABASE solar_guardian;` |
| Port 5432 in use | Check if PostgreSQL is on correct port or update DATABASE_URL |
| SSL required | Add `?sslmode=require` to DATABASE_URL |

### Docker Option (Alternative)

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: solar_guardian
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Run with:
```bash
docker-compose up -d
```

Then use:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/solar_guardian?schema=public"
```

---

## Notes

1. All tables use `cuid()` for ID generation
2. Timestamps are automatically managed with `createdAt` and `updatedAt`
3. Soft delete is not implemented; records are permanently deleted
4. Cascade delete is configured for TicketNote -> Ticket
5. String indexes are added for frequently queried columns
6. All URLs store full image URLs from external storage

