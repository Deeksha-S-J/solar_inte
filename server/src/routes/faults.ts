import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

function buildStatusAlertMetadata(status: 'warning' | 'fault') {
  if (status === 'fault') {
    return {
      severity: 'critical',
      faultType: 'panel_fault',
      aiAnalysis: 'Panel status changed to fault based on live telemetry.',
      recommendedAction: 'Dispatch technician for immediate on-site inspection.',
    };
  }

  return {
    severity: 'medium',
    faultType: 'panel_warning',
    aiAnalysis: 'Panel status changed to warning based on live telemetry.',
    recommendedAction: 'Schedule inspection and monitor panel performance closely.',
  };
}

// Create fault alert from panel status transition
router.post('/panel-status-alert', async (req: Request, res: Response) => {
  try {
    const panelId = typeof req.body?.panelId === 'string' ? req.body.panelId : '';
    const status = req.body?.status;

    if (!panelId || (status !== 'warning' && status !== 'fault')) {
      return res.status(400).json({ error: 'panelId and status (warning|fault) are required' });
    }

    const panel = await prisma.solarPanel.findUnique({
      where: { id: panelId },
      select: { id: true, row: true, column: true },
    });

    if (!panel) {
      return res.status(404).json({ error: 'Panel not found' });
    }

    const metadata = buildStatusAlertMetadata(status);
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Prevent duplicate alerts for unchanged status within a short window.
    // Check at ROW level - one alert per row
    const panelsInRow = await prisma.solarPanel.findMany({
      where: { row: panel.row },
      select: { id: true },
    });
    const panelIdsInRow = panelsInRow.map(p => p.id);

    const recentExisting = await prisma.faultDetection.findFirst({
      where: {
        panelId: { in: panelIdsInRow },
        faultType: metadata.faultType,
        detectedAt: { gte: tenMinutesAgo },
      },
      orderBy: { detectedAt: 'desc' },
    });

    if (recentExisting) {
      return res.status(200).json({ created: false, faultDetection: recentExisting });
    }

    const faultDetection = await prisma.faultDetection.create({
      data: {
        panelId: panel.id,
        detectedAt: now,
        severity: metadata.severity,
        faultType: metadata.faultType,
        droneImageUrl: null,
        thermalImageUrl: null,
        aiConfidence: 100,
        aiAnalysis: metadata.aiAnalysis,
        recommendedAction: metadata.recommendedAction,
        locationX: panel.column * 10,
        locationY: panel.row * 10,
      },
    });

    return res.status(201).json({ created: true, faultDetection });
  } catch (error) {
    console.error('Error creating panel status alert:', error);
    return res.status(500).json({ error: 'Failed to create panel status alert' });
  }
});

// Get all fault detections
router.get('/', async (req: Request, res: Response) => {
  try {
    const { severity, panelId } = req.query;

    const where: any = {};
    if (severity) where.severity = severity;
    if (panelId) where.panelId = panelId;

    const faults = await prisma.faultDetection.findMany({
      where,
      include: {
        panel: { include: { zone: true } },
      },
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });

    res.json(faults);
  } catch (error) {
    console.error('Error fetching faults:', error);
    res.status(500).json({ error: 'Failed to fetch fault detections' });
  }
});

// Get fault by ID with full details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const fault = await prisma.faultDetection.findUnique({
      where: { id: req.params.id },
      include: {
        panel: { include: { zone: true } },
        tickets: {
        },
      },
    });

    if (!fault) {
      return res.status(404).json({ error: 'Fault not found' });
    }

    res.json(fault);
  } catch (error) {
    console.error('Error fetching fault:', error);
    res.status(500).json({ error: 'Failed to fetch fault detection' });
  }
});

// Get fault statistics
router.get('/stats/overview', async (_req: Request, res: Response) => {
  try {
    const [
      totalFaults,
      criticalFaults,
      highFaults,
      mediumFaults,
      lowFaults,
      recentFaults,
    ] = await Promise.all([
      prisma.faultDetection.count(),
      prisma.faultDetection.count({ where: { severity: 'critical' } }),
      prisma.faultDetection.count({ where: { severity: 'high' } }),
      prisma.faultDetection.count({ where: { severity: 'medium' } }),
      prisma.faultDetection.count({ where: { severity: 'low' } }),
      prisma.faultDetection.count({
        where: {
          detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // Get faults by type
    const faultsByType = await prisma.faultDetection.groupBy({
      by: ['faultType'],
      _count: true,
      orderBy: { _count: { faultType: 'desc' } },
      take: 10,
    });

    res.json({
      total: totalFaults,
      critical: criticalFaults,
      high: highFaults,
      medium: mediumFaults,
      low: lowFaults,
      lastWeek: recentFaults,
      byType: faultsByType.map((f) => ({ type: f.faultType, count: f._count })),
    });
  } catch (error) {
    console.error('Error fetching fault stats:', error);
    res.status(500).json({ error: 'Failed to fetch fault statistics' });
  }
});

// Get faults by zone
router.get('/zone/:zoneName', async (req: Request, res: Response) => {
  try {
    const faults = await prisma.faultDetection.findMany({
      where: {
        panel: { zone: { name: req.params.zoneName } },
      },
      include: { panel: { include: { zone: true } } },
      orderBy: { detectedAt: 'desc' },
    });

    res.json(faults);
  } catch (error) {
    console.error('Error fetching zone faults:', error);
    res.status(500).json({ error: 'Failed to fetch zone faults' });
  }
});

// Delete a fault detection (permanent delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const faultId = req.params.id;

    // Check if the fault exists
    const existingFault = await prisma.faultDetection.findUnique({
      where: { id: faultId },
    });

    if (!existingFault) {
      return res.status(404).json({ error: 'Fault not found' });
    }

    // Permanently delete the fault detection
    await prisma.faultDetection.delete({
      where: { id: faultId },
    });

    res.json({ message: 'Fault deleted successfully', deletedId: faultId });
  } catch (error) {
    console.error('Error deleting fault:', error);
    res.status(500).json({ error: 'Failed to delete fault detection' });
  }
});

export default router;

