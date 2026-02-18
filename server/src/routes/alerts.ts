import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { createFaultTicketAndAssignment, generateIncidentId } from './automation.js';

const router = Router();

// Generate sequential alert ID in ALERT ID-AK-XXX format
const generateAlertId = async (): Promise<string> => {
  try {
    // Get the latest alert to determine the next number
    const latestAlert = await prisma.alert.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { alertId: true },
    });

    let nextNumber = 1;
    if (latestAlert?.alertId) {
      // Extract number from formats like ALERT ID-AK-xxx
      const match = latestAlert.alertId.match(/ALERT ID-AK-(\d+)/i);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      } else {
        // For other formats, start from 1
        nextNumber = 1;
      }
    }

    // Format as ALERT ID-AK-001, ALERT ID-AK-002, etc.
    return `ALERT ID-AK-${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    // Fallback to timestamp-based if database query fails
    console.error('Error generating alert ID, using fallback:', error);
    return `ALERT ID-AK-${Date.now().toString().slice(-6)}`;
  }
};

// Helper function to create ticket for an alert
async function createTicketForAlert(alert: { zone: string; row: number; status: string; id: string }) {
  try {
    // Find a panel in this zone and row
    const panel = await prisma.solarPanel.findFirst({
      where: {
        zone: { name: alert.zone },
        row: alert.row,
      },
      include: { zone: true },
    });

    if (!panel) {
      console.warn(`No panel found for Zone ${alert.zone}, Row ${alert.row} - cannot create ticket`);
      return null;
    }

    const incidentId = generateIncidentId();
    const severity = alert.status === 'fault' ? 'critical' : 'medium';
    const faultType = alert.status === 'fault' ? 'voltage_fault' : 'low_voltage_warning';
    const description = `Auto-generated from alert: Zone ${alert.zone}, Row ${alert.row} - ${alert.status} status`;

    const result = await createFaultTicketAndAssignment({
      incidentId,
      panelId: panel.id,
      faultType,
      severity,
      detectedAt: new Date(),
      description,
      aiConfidence: 100,
      aiAnalysis: `Alert triggered for ${alert.status} status on Zone ${alert.zone} Row ${alert.row}`,
      recommendedAction: alert.status === 'fault' 
        ? 'Immediate inspection required - critical voltage fault detected'
        : 'Schedule inspection - low voltage warning detected',
      locationX: panel.column * 10,
      locationY: panel.row * 10,
      zone: alert.zone,
      row: alert.row,
      status: alert.status,
    });

    // Link the ticket to the alert
    await prisma.alert.update({
      where: { id: alert.id },
      data: { ticketId: result.ticketId },
    });

    console.log(`✅ Ticket created for alert ${alert.id}: ${result.ticketNumber}, assigned to technician: ${result.assignedTechnicianId || 'none'}`);
    return result;
  } catch (error) {
    console.error('Error creating ticket for alert:', error);
    return null;
  }
}

// Get all active alerts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        dismissed: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Create or update an alert (upsert)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { zone, row, status, message, scanId, ticketId } = req.body;

    if (!zone || row === undefined || !status) {
      return res.status(400).json({ error: 'Missing required fields: zone, row, status' });
    }

    // Try to find an existing active alert for this zone/row (regardless of status)
    // Only 1 alert per row - update status if changed
    const existingAlert = await prisma.alert.findFirst({
      where: {
        zone,
        row,
        dismissed: false,
      },
      select: {
        id: true,
        zone: true,
        row: true,
        status: true,
        message: true,
        scanId: true,
        ticketId: true,
      }
    });

    if (existingAlert) {
      // Alert already exists - update status and message (don't create duplicate)
      const previousStatus = existingAlert.status;
      const updatedAlert = await prisma.alert.update({
        where: { id: existingAlert.id },
        data: {
          status, // Update to new status (fault/warning/healthy)
          message: message || existingAlert.message,
          scanId: scanId || existingAlert.scanId,
          ticketId: ticketId || existingAlert.ticketId,
        },
      });
      
      // If status changed to warning/fault and no ticket exists, create one
      if ((status === 'warning' || status === 'fault') && !updatedAlert.ticketId) {
        await createTicketForAlert({
          zone: updatedAlert.zone,
          row: updatedAlert.row,
          status: updatedAlert.status,
          id: updatedAlert.id,
        });
      }
      
      // If status changed from warning to fault, create a NEW ticket for the fault
      // This ensures a new ticket is created when severity escalates
      if (previousStatus === 'warning' && status === 'fault') {
        console.log(`⚠️ Status escalated from warning to fault for Zone ${updatedAlert.zone}, Row ${updatedAlert.row} - creating new ticket`);
        await createTicketForAlert({
          zone: updatedAlert.zone,
          row: updatedAlert.row,
          status: 'fault',
          id: updatedAlert.id,
        });
      }
      
      return res.json(updatedAlert);
    }

    // Create new alert with generated alertId
    const newAlertId = await generateAlertId();
    const alert = await prisma.alert.create({
      data: {
        alertId: newAlertId,
        zone,
        row,
        status,
        message: message || null,
        dismissed: false,
        scanId: scanId || null,
        ticketId: ticketId || null,
      },
    });

    // Auto-create ticket for warning and fault alerts
    if (status === 'warning' || status === 'fault') {
      const ticketResult = await createTicketForAlert({
        zone: alert.zone,
        row: alert.row,
        status: alert.status,
        id: alert.id,
      });
      
      // Fetch updated alert with ticketId
      const updatedAlert = await prisma.alert.findUnique({
        where: { id: alert.id },
      });
      return res.json(updatedAlert);
    }

    res.json(alert);
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// Dismiss an alert (hard delete - permanently remove from database)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Permanently delete the alert from the database
    await prisma.alert.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Alert deleted permanently' });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

// Dismiss alerts by zone and row
router.post('/dismiss', async (req: Request, res: Response) => {
  try {
    const { zone, row, status } = req.body;

    if (!zone || row === undefined) {
      return res.status(400).json({ error: 'Missing required fields: zone, row' });
    }

    const updateData: { dismissed: boolean; dismissedAt: Date; status?: string } = {
      dismissed: true,
      dismissedAt: new Date(),
    };

    // If status is provided, only dismiss alerts with that status
    if (status) {
      updateData.status = status;
    }

    const alerts = await prisma.alert.updateMany({
      where: {
        zone,
        row,
        dismissed: false,
      },
      data: updateData,
    });

    res.json({ count: alerts.count });
  } catch (error) {
    console.error('Error dismissing alerts:', error);
    res.status(500).json({ error: 'Failed to dismiss alerts' });
  }
});

// Sync alerts - create/update based on current panel statuses
router.post('/sync', async (req: Request, res: Response) => {
  try {
    // Get all panels with warning or fault status
    const panels = await prisma.solarPanel.findMany({
      select: {
        row: true,
        column: true,
        status: true,
        zone: { select: { name: true } },
      },
    });

    // Group by zone and row
    const rowStatuses = new Map<string, string>();
    panels.forEach(panel => {
      if (panel.status === 'warning' || panel.status === 'fault') {
        const key = `${panel.zone.name}-${panel.row}`;
        // If any panel in the row has a fault, the row is in fault status
        if (panel.status === 'fault') {
          rowStatuses.set(key, 'fault');
        } else if (!rowStatuses.has(key)) {
          rowStatuses.set(key, 'warning');
        }
      }
    });

    // Get existing active alerts
    const existingAlerts = await prisma.alert.findMany({
      where: { dismissed: false },
    });

    const existingAlertKeys = new Set(
      existingAlerts.map(a => `${a.zone}-${a.row}-${a.status}`)
    );

    // Create new alerts for rows that don't have an alert
    const newAlerts: Array<{ zone: string; row: number; status: string }> = [];
    rowStatuses.forEach((status, key) => {
      const [zone, rowStr] = key.split('-');
      const row = parseInt(rowStr);
      const alertKey = `${zone}-${row}-${status}`;

      if (!existingAlertKeys.has(alertKey)) {
        newAlerts.push({ zone, row, status });
      }
    });

    // Create alerts with generated alertIds
    const createdAlerts = await Promise.all(
      newAlerts.map(async (alertData) => {
        const newAlertId = await generateAlertId();
        return prisma.alert.create({
          data: {
            alertId: newAlertId,
            ...alertData,
            dismissed: false,
          },
        });
      })
    );

    // Auto-create tickets for new warning and fault alerts
    for (const alert of createdAlerts) {
      if (alert.status === 'warning' || alert.status === 'fault') {
        await createTicketForAlert({
          zone: alert.zone,
          row: alert.row,
          status: alert.status,
          id: alert.id,
        });
      }
    }

    // Fetch updated alerts with ticketIds
    const updatedAlerts = await prisma.alert.findMany({
      where: { 
        id: { in: createdAlerts.map(a => a.id) }
      },
    });

    // Dismiss alerts for rows that are now healthy
    const currentRowKeys = new Set(Array.from(rowStatuses.keys()).map(k => {
      const [zone, row] = k.split('-');
      return `${zone}-${row}`;
    }));

    for (const alert of existingAlerts) {
      const alertKey = `${alert.zone}-${alert.row}`;
      if (!currentRowKeys.has(alertKey)) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: { dismissed: true, dismissedAt: new Date() },
        });
      }
    }

    res.json({
      created: createdAlerts.length,
      alerts: updatedAlerts,
    });
  } catch (error) {
    console.error('Error syncing alerts:', error);
    res.status(500).json({ error: 'Failed to sync alerts' });
  }
});

export default router;

