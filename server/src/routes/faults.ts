import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

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

export default router;

