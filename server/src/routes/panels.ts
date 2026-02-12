import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// Get all panels with optional filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('Fetching panels from database...');
    
    const { status, zone, search } = req.query;
    
    const where: any = {};
    
    if (status) {
      where.status = status;
    }
    
    if (zone) {
      where.zone = { name: zone };
    }
    
    if (search) {
      where.panelId = { contains: String(search), mode: 'insensitive' };
    }

    console.log('Query where:', JSON.stringify(where));

    // First get panels without the zone include to avoid relation errors
    const panels = await prisma.solarPanel.findMany({
      where,
      orderBy: { panelId: 'asc' },
      take: 100,
    });

    console.log(`Found ${panels.length} panels`);

    // Transform data to include zone name
    const panelsWithZone = await Promise.all(panels.map(async (panel) => {
      let zoneName = 'Unknown';
      if (panel.zoneId) {
        try {
          const zone = await prisma.zone.findUnique({
            where: { id: panel.zoneId }
          });
          zoneName = zone?.name || 'Unknown';
        } catch (e) {
          console.warn(`Could not find zone for panel ${panel.panelId}`);
        }
      }
      
      return {
        id: panel.id,
        panelId: panel.panelId,
        row: panel.row,
        column: panel.column,
        zone: { id: panel.zoneId, name: zoneName },
        zoneId: panel.zoneId,
        status: panel.status,
        efficiency: panel.efficiency,
        currentOutput: panel.currentOutput,
        maxOutput: panel.maxOutput,
        temperature: panel.temperature,
        lastChecked: panel.lastChecked,
        installDate: panel.installDate,
        inverterGroup: panel.inverterGroup,
        stringId: panel.stringId,
        createdAt: panel.createdAt,
        updatedAt: panel.updatedAt,
      };
    }));

    res.json(panelsWithZone);
  } catch (error: any) {
    console.error('Error fetching panels:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch panels', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Get panel statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [
      totalPanels,
      healthyPanels,
      warningPanels,
      faultPanels,
      offlinePanels,
      currentGeneration,
    ] = await Promise.all([
      prisma.solarPanel.count(),
      prisma.solarPanel.count({ where: { status: 'healthy' } }),
      prisma.solarPanel.count({ where: { status: 'warning' } }),
      prisma.solarPanel.count({ where: { status: 'fault' } }),
      prisma.solarPanel.count({ where: { status: 'offline' } }),
      prisma.solarPanel.aggregate({
        _sum: { currentOutput: true },
      }),
    ]);

    const maxCapacity = totalPanels * 400; // Assuming 400W per panel
    const currentGen = currentGeneration._sum.currentOutput || 0;
    const avgEfficiency = await prisma.solarPanel.aggregate({
      _avg: { efficiency: true },
      where: { status: { not: 'offline' } },
    });

    res.json({
      totalPanels,
      healthyPanels,
      warningPanels,
      faultPanels,
      offlinePanels,
      currentGeneration: currentGen / 1000, // Convert to kW
      maxCapacity: maxCapacity / 1000,
      efficiency: avgEfficiency._avg.efficiency || 0,
    });
  } catch (error: any) {
    console.error('Error fetching panel stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch panel statistics' });
  }
});

// Get single panel by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const panel = await prisma.solarPanel.findUnique({
      where: { id: req.params.id },
      include: {
        zone: true,
        tickets: {
          include: { assignedTechnician: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        faultDetections: {
          orderBy: { detectedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!panel) {
      return res.status(404).json({ error: 'Panel not found' });
    }

    res.json(panel);
  } catch (error: any) {
    console.error('Error fetching panel:', error.message);
    res.status(500).json({ error: 'Failed to fetch panel' });
  }
});

// Get panels by zone
router.get('/zone/:zoneName', async (req: Request, res: Response) => {
  try {
    const panels = await prisma.solarPanel.findMany({
      where: {
        zone: { name: req.params.zoneName },
      },
      orderBy: [{ row: 'asc' }, { column: 'asc' }],
    });

    res.json(panels);
  } catch (error: any) {
    console.error('Error fetching zone panels:', error.message);
    res.status(500).json({ error: 'Failed to fetch zone panels' });
  }
});

export default router;

