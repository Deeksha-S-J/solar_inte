# Solar Monitoring System - Automation Guide

Production-ready automation for real-time solar farm monitoring with fault detection, technician assignment, and ticket creation.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Components](#components)
   - [Python Webhook Sender](#python-webhook-sender)
   - [Node.js Webhook Sender](#nodejs-webhook-sender)
   - [n8n Workflow](#n8n-workflow)
4. [Setup Instructions](#setup-instructions)
   - [Neon PostgreSQL Setup](#neon-postgresql-setup)
   - [n8n Setup](#n8n-setup)
   - [Backend Setup](#backend-setup)
5. [Testing](#testing)
6. [Example Test Data](#example-test-data)
7. [API Endpoints](#api-endpoints)

---

## Overview

This automation system detects solar panel faults and automatically:

1. **Receives fault alerts** from Python/Node.js scan systems
2. **Filters by severity** - Only MEDIUM, HIGH, and CRITICAL trigger actions
3. **Finds available technician** - Queries PostgreSQL for the least busy technician
4. **Creates tickets** - Inserts new ticket with assigned technician
5. **Sends notifications** - Alerts the backend API and technician via email

---

## Architecture

```
┌─────────────────┐     POST      ┌──────────────────┐     Query     ┌─────────────┐
│  Python/Node    │ ──────────▶   │    n8n Webhook  │ ──────────▶  │  PostgreSQL │
│  Scan System    │               │    Trigger      │               │  (Neon)     │
└─────────────────┘               └────────┬─────────┘               └──────┬──────┘
                                          │                                │
                                          │                                │
                                          ▼                                ▼
                                 ┌──────────────────┐              ┌─────────────┐
                                 │   IF: Severity   │              │ Technician  │
                                 │   >= MEDIUM?     │              │    Table    │
                                 └────────┬─────────┘              └──────┬──────┘
                                          │                                │
                                          │ YES                            │
                                          ▼                                │
                                 ┌──────────────────┐                      │
                                 │  Query Available │ ◀─────────────────────┘
                                 │   Technician     │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  Create Ticket   │
                                 │  in Database     │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  Notify Backend  │
                                 │  & Email Tech    │
                                 └──────────────────┘
```

---

## Components

### Python Webhook Sender

**File:** `solar_webhook_sender.py`

A production-ready Python module for sending fault alerts to the n8n webhook.

#### Features:
- Retry logic with exponential backoff
- Severity filtering (only MEDIUM+ triggers)
- Batch sending support
- Connection testing
- Comprehensive logging

#### Installation:
```bash
# No external dependencies - uses only standard library!
# requests is optional (for advanced features)
pip install requests
```

#### Usage:

```python
from solar_webhook_sender import SolarFaultWebhookSender, Severity, FaultType

# Initialize sender
sender = SolarFaultWebhookSender(
    webhook_url="https://your-n8n-instance.webhook.com/solar-fault-alert",
    timeout=30,
    retry_count=3
)

# Send a fault alert
result = sender.send_fault_alert(
    panel_id="PNL-A0101",
    severity="HIGH",
    fault_type=FaultType.HOTSPOT,
    description="Thermal hotspot detected - temperature above 85°C"
)

# Batch sending
results = sender.send_batch_alerts([
    {"panel_id": "PNL-A0101", "severity": "HIGH", "fault_type": "Hotspot", "description": "..."},
    {"panel_id": "PNL-B0205", "severity": "MEDIUM", "fault_type": "Dirty Panel", "description": "..."}
])
```

#### Command Line Usage:
```bash
# Edit the WEBHOOK_URL in the script first
python solar_webhook_sender.py
```

---

### Node.js Webhook Sender

**File:** `sendSolarWebhook.ts`

TypeScript implementation for Node.js environments.

#### Installation:
```bash
cd /path/to/project
npm install axios
```

#### Usage:

```typescript
import { SolarFaultWebhookSender, Severity, FaultType } from './sendSolarWebhook';

const sender = new SolarFaultWebhookSender(
  'https://your-n8n-instance.webhook.com/solar-fault-alert',
  { timeout: 30000, retryCount: 3 }
);

// Send fault alert
await sender.sendFaultAlert({
  panelId: 'PNL-A0101',
  severity: Severity.HIGH,
  faultType: FaultType.HOTSPOT,
  description: 'Thermal hotspot detected'
});
```

#### Run:
```bash
# Set your webhook URL
export WEBHOOK_URL="https://your-n8n-instance.webhook.com/solar-fault-alert"

# Run with ts-node or compile first
npx ts-node sendSolarWebhook.ts
```

---

### n8n Workflow

**File:** `n8n-solar-fault-workflow.json`

Complete n8n workflow with the following nodes:

1. **Webhook Trigger** - Receives POST requests from scan systems
2. **IF - Valid Payload** - Validates required fields exist
3. **Switch - Severity Check** - Routes based on severity level
4. **PostgreSQL - Query Technician** - Finds available technician with least active tickets
5. **Function - Prepare Ticket** - Formats ticket data
6. **PostgreSQL - Create Ticket** - Inserts ticket into database
7. **HTTP Request - Notify Backend** - Alerts the Solar Guardian API
8. **Email Send - Notify Technician** - Sends email to assigned technician
9. **Fallback Paths** - Handles no technician available and LOW severity cases

#### Import Instructions:

1. Open n8n
2. Go to Workflows → Import from File
3. Select `n8n-solar-fault-workflow.json`
4. Configure credentials:
   - **PostgreSQL**: Add your Neon connection string
   - **Gmail** (optional): For email notifications

---

## Setup Instructions

### Neon PostgreSQL Setup

1. **Create Neon Account:**
   - Go to https://neon.tech
   - Create a new project
   - Note your connection string

2. **Get Connection String:**
   - Dashboard → Connection Details
   - Copy the "Neon" connection string
   - Format: `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`

3. **Configure in `.env`:**
   ```env
   DATABASE_URL="postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
   ```

4. **Push Schema:**
   ```bash
   cd server
   npm install
   npx prisma generate
   npx prisma db push
   ```

5. **Seed Test Data:**
   ```bash
   # Create technicians for testing
   psql "$DATABASE_URL" -f ../seed_data.sql
   ```

---

### n8n Setup

#### Option 1: Cloud (Recommended)

1. Create account at https://n8n.io
2. Create new workflow
3. Import `n8n-solar-fault-workflow.json`
4. Add PostgreSQL credentials:
   ```
   Host: your-neon-host.neon.tech
   Database: neondb
   User: your-username
   Password: your-password
   Port: 5432
   SSL: true
   ```
5. Activate workflow
6. Note your webhook URL:
   ```
   https://your-n8n-instance.webhook.com/solar-fault-alert
   ```

#### Option 2: Self-Hosted

```bash
# Using Docker
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=user \
  -e N8N_BASIC_AUTH_PASSWORD=password \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

Then access http://localhost:5678 and import the workflow.

---

### Backend Setup

1. **Start the Solar Guardian API:**
   ```bash
   cd server
   npm run dev
   ```

2. **Verify it's running:**
   ```bash
   curl http://localhost:3000/health
   # Should return: {"status":"ok",...}
   ```

3. **Start n8n webhook test:**
   - In n8n, click "Test workflow" to get your webhook URL
   - Copy the URL for use in webhook senders

---

## Testing

### 1. Test the n8n Webhook Manually

Use curl:
```bash
curl -X POST "https://your-n8n-instance.webhook.com/solar-fault-alert" \
  -H "Content-Type: application/json" \
  -d '{
    "panelId": "PNL-A0101",
    "severity": "HIGH",
    "faultType": "Hotspot",
    "description": "Thermal hotspot detected"
  }'
```

### 2. Test Python Script

```bash
# Edit WEBHOOK_URL in the script first
python solar_webhook_sender.py
```

### 3. Test Node.js Script

```bash
export WEBHOOK_URL="https://your-n8n-instance.webhook.com/solar-fault-alert"
npx ts-node sendSolarWebhook.ts
```

### 4. Verify Database

```bash
# Check tickets were created
psql "$DATABASE_URL" -c "SELECT * FROM \"Ticket\" ORDER BY \"createdAt\" DESC LIMIT 5;"

# Check technician activeTickets was incremented
psql "$DATABASE_URL" -c "SELECT name, \"activeTickets\" FROM \"Technician\";"
```

---

## Example Test Data

### Test Case 1: CRITICAL Severity
```json
{
  "panelId": "PNL-A0101",
  "severity": "CRITICAL",
  "faultType": "Hotspot",
  "description": "Thermal hotspot detected - temperature above 85°C",
  "temperature": 87.5,
  "confidence": 95.5,
  "location": "Zone A, Row 1"
}
```

### Test Case 2: HIGH Severity
```json
{
  "panelId": "PNL-B0205",
  "severity": "HIGH",
  "faultType": "Dirty Panel",
  "description": "Significant dust accumulation detected - efficiency drop of 15%"
}
```

### Test Case 3: MEDIUM Severity
```json
{
  "panelId": "PNL-C0312",
  "severity": "MEDIUM",
  "faultType": "Shading",
  "description": "Partial shading detected from nearby obstruction"
}
```

### Test Case 4: LOW Severity (Should Be Skipped)
```json
{
  "panelId": "PNL-D0401",
  "severity": "LOW",
  "faultType": "Dirty Panel",
  "description": "Minor dust - cleaning recommended at next maintenance"
}
```

---

## API Endpoints

### Backend API (Express)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/n8n-webhook` | POST | Receive n8n notifications |
| `/api/webhook/events` | GET | List webhook events |
| `/api/webhook/anomalies` | GET | List anomalies |
| `/api/tickets` | GET | List tickets |
| `/api/tickets` | POST | Create ticket |
| `/api/technicians` | GET | List technicians |
| `/api/technicians/status/available` | GET | Available technicians |

---

## Expected Behavior

| Severity | Webhook Sent? | Ticket Created? | Email Sent? |
|----------|---------------|------------------|-------------|
| CRITICAL | ✅ Yes | ✅ Yes | ✅ Yes |
| HIGH | ✅ Yes | ✅ Yes | ✅ Yes |
| MEDIUM | ✅ Yes | ✅ Yes | ✅ Yes |
| LOW | ❌ No | ❌ No | ❌ No |

---

## Troubleshooting

### Common Issues

1. **Webhook not triggering**
   - Check n8n logs for errors
   - Verify webhook URL is correct
   - Ensure workflow is "Active"

2. **No technician found**
   - Add technicians with `status='available'`
   - Check database connection

3. **Ticket not created**
   - Verify PostgreSQL credentials in n8n
   - Check table schema matches

4. **Connection refused**
   - Ensure backend is running on port 3000
   - Check firewall settings

---

## Files Included

| File | Description |
|------|-------------|
| `solar_webhook_sender.py` | Python webhook sender |
| `sendSolarWebhook.ts` | Node.js webhook sender |
| `n8n-solar-fault-workflow.json` | Complete n8n workflow |
| `seed_data.sql` | Test data for database |
| `SOLAR_AUTOMATION_README.md` | This file |

---

## Production Considerations

1. **Security**
   - Use environment variables for credentials
   - Enable SSL/TLS for all connections
   - Add authentication to webhook endpoints

2. **Monitoring**
   - Set up alerts for failed webhooks
   - Monitor database for unassigned tickets
   - Track technician workload

3. **Scaling**
   - Use queue system for high volume
   - Implement rate limiting
   - Consider multiple n8n instances

4. **Maintenance**
   - Regular database cleanup
   - Archive old tickets
   - Update technician status regularly

---

## License

MIT License - Solar Guardian Project

