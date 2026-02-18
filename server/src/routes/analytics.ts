import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// Get power generation data
router.get('/power', async (req: Request, res: Response) => {
  try {
    const { period = 'weekly' } = req.query;

    let startDate: Date;
    switch (period) {
      case 'daily':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const powerData = await prisma.powerGeneration.findMany({
      where: {
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'asc' },
    });

    res.json(powerData);
  } catch (error) {
    console.error('Error fetching power data:', error);
    res.status(500).json({ error: 'Failed to fetch power generation data' });
  }
});

// Get efficiency data by zone
router.get('/efficiency/by-zone', async (_req: Request, res: Response) => {
  try {
    const zones = await prisma.zone.findMany({
      include: {
        panels: {
          select: { efficiency: true },
        },
      },
    });

    const efficiencyByZone = zones.map((zone) => {
      const panels = zone.panels;
      const avgEfficiency =
        panels.length > 0
          ? panels.reduce((sum, p) => sum + p.efficiency, 0) / panels.length
          : 0;

      return {
        zone: zone.name,
        efficiency: Math.round(avgEfficiency * 10) / 10,
        panelCount: panels.length,
      };
    });

    res.json(efficiencyByZone);
  } catch (error) {
    console.error('Error fetching efficiency data:', error);
    res.status(500).json({ error: 'Failed to fetch efficiency data' });
  }
});

// Get environmental impact data
router.get('/environmental', async (_req: Request, res: Response) => {
  try {
    // Calculate from power generation
    const totalPower = await prisma.powerGeneration.aggregate({
      _sum: { value: true },
    });

    const totalKWh = totalPower._sum.value || 0;
    const carbonOffset = Math.round(totalKWh * 0.42); // kg CO2 per kWh
    const treesEquivalent = Math.round(carbonOffset / 21); // kg CO2 per tree per year
    const homesPowered = Math.round(totalKWh / 10000); // Average home uses ~10,000 kWh/year

    res.json({
      totalPowerGenerated: totalKWh,
      carbonOffset,
      treesEquivalent,
      homesPowered,
    });
  } catch (error) {
    console.error('Error fetching environmental data:', error);
    res.status(500).json({ error: 'Failed to fetch environmental data' });
  }
});

// Get fault statistics
router.get('/faults', async (req: Request, res: Response) => {
  try {
    const { months = 6 } = req.query;

    const startDate = new Date(Date.now() - Number(months) * 30 * 24 * 60 * 60 * 1000);

    const faultsByType = await prisma.faultDetection.groupBy({
      by: ['faultType'],
      _count: true,
      orderBy: { _count: { faultType: 'desc' } },
    });

    const recentFaults = await prisma.faultDetection.findMany({
      where: {
        detectedAt: { gte: startDate },
      },
      select: {
        detectedAt: true,
      },
      orderBy: { detectedAt: 'asc' },
    });

    // Group by month
    const faultsByMonth = new Map<string, number>();
    recentFaults.forEach((fault) => {
      const month = fault.detectedAt.toLocaleString('default', { month: 'short' });
      faultsByMonth.set(month, (faultsByMonth.get(month) || 0) + 1);
    });

    // Calculate average resolution time from tickets
    const resolvedTickets = await prisma.ticket.findMany({
      where: {
        resolvedAt: { not: null },
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    const avgResolutionTime =
      resolvedTickets.length > 0
        ? resolvedTickets.reduce((sum, t) => {
            const duration = (t.resolvedAt!.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
            return sum + duration;
          }, 0) / resolvedTickets.length
        : 0;

    res.json({
      byType: faultsByType.map((f) => ({ type: f.faultType, count: f._count })),
      byMonth: Array.from(faultsByMonth.entries()).map(([month, count]) => ({
        month,
        count,
      })),
      avgResolutionTime: Math.round(avgResolutionTime * 10) / 10,
    });
  } catch (error) {
    console.error('Error fetching fault statistics:', error);
    res.status(500).json({ error: 'Failed to fetch fault statistics' });
  }
});

// Get row health overview (replaces panel health for dashboard)
router.get('/rows/health', async (_req: Request, res: Response) => {
  try {
    // Get all panels with their zone info
    const panels = await prisma.solarPanel.findMany({
      select: {
        id: true,
        row: true,
        column: true,
        status: true,
        zone: { select: { name: true } },
      },
      orderBy: [{ zone: { name: 'asc' } }, { row: 'asc' }, { column: 'asc' }],
    });

    // Group by zone and row
    const rowMap = new Map<string, { zone: string; row: number; healthy: number; warning: number; fault: number; offline: number; total: number }>();

    panels.forEach(panel => {
      const zoneName = panel.zone?.name || 'unknown';
      const key = `${zoneName}-${panel.row}`;
      
      if (!rowMap.has(key)) {
        rowMap.set(key, { zone: zoneName, row: panel.row, healthy: 0, warning: 0, fault: 0, offline: 0, total: 0 });
      }
      
      const row = rowMap.get(key)!;
      row.total++;
      
      switch (panel.status) {
        case 'healthy':
          row.healthy++;
          break;
        case 'warning':
          row.warning++;
          break;
        case 'fault':
          row.fault++;
          break;
        case 'offline':
          row.offline++;
          break;
        default:
          row.offline++;
      }
    });

    // Convert to array and sort
    const rows = Array.from(rowMap.values()).sort((a, b) => {
      if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
      return a.row - b.row;
    });

    // Calculate totals
    const totals = rows.reduce(
      (acc, row) => ({
        healthy: acc.healthy + row.healthy,
        warning: acc.warning + row.warning,
        fault: acc.fault + row.fault,
        offline: acc.offline + row.offline,
        total: acc.total + row.total,
      }),
      { healthy: 0, warning: 0, fault: 0, offline: 0, total: 0 }
    );

    res.json({
      rows,
      totals,
    });
  } catch (error) {
    console.error('Error fetching row health:', error);
    res.status(500).json({ error: 'Failed to fetch row health data' });
  }
});

// Get dashboard summary - FULL Dashboard data
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [
      totalPanels,
      healthyPanels,
      warningPanels,
      faultPanels,
      offlinePanels,
      currentGeneration,
      openTickets,
      availableTechnicians,
      recentFaults,
    ] = await Promise.all([
      prisma.solarPanel.count(),
      prisma.solarPanel.count({ where: { status: 'healthy' } }),
      prisma.solarPanel.count({ where: { status: 'warning' } }),
      prisma.solarPanel.count({ where: { status: 'fault' } }),
      prisma.solarPanel.count({ where: { status: 'offline' } }),
      prisma.solarPanel.aggregate({ _sum: { currentOutput: true } }),
      prisma.ticket.count({ where: { status: { in: ['open', 'in_progress', 'resolved'] } } }),
      prisma.technician.count({ where: { status: 'available' } }),
      prisma.faultDetection.count({
        where: {
          detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const maxCapacity = totalPanels * 400; // 400W per panel
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
      currentGeneration: currentGen / 1000,
      maxCapacity: maxCapacity / 1000,
      efficiency: Math.round((avgEfficiency._avg.efficiency || 0) * 10) / 10,
      availableTechnicians,
      openTickets,
      recentFaults,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;

