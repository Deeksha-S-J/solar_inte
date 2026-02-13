import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// Get all tickets with filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, priority } = req.query;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        panel: { include: { zone: true } },
        fault: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Get ticket by ID with all details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        panel: { include: { zone: true } },
        fault: true,
        notes: {
          include: { author: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// Create new ticket
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      panelId: panelIdString,
      faultId,
      priority,
      description,
      faultType,
      droneImageUrl,
      thermalImageUrl,
      aiAnalysis,
      recommendedAction,
    } = req.body;

    // Look up panel by panelId string if provided
    let panelId = null;
    if (panelIdString && panelIdString.trim()) {
      const panel = await prisma.solarPanel.findUnique({
        where: { panelId: panelIdString.trim() },
      });
      if (panel) {
        panelId = panel.id;
      }
      // If panel not found, continue without panelId (don't return error)
    }

    // Generate ticket number
    const lastTicket = await prisma.ticket.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const ticketCount = lastTicket ? parseInt(lastTicket.ticketNumber.split('-')[2]) + 1 : 1;
    const ticketNumber = `TKT-${new Date().getFullYear()}-${String(ticketCount).padStart(4, '0')}`;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        panelId,
        faultId,
        priority: priority || 'medium',
        status: 'open',
        description,
        faultType,
        droneImageUrl,
        thermalImageUrl,
        aiAnalysis,
        recommendedAction,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Update fault detection if linked
    if (faultId) {
      await prisma.faultDetection.update({
        where: { id: faultId },
        data: { id: faultId }, // Just to trigger relation
      });
    }

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Update ticket
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { status, resolutionNotes, resolutionCause, resolutionImageUrl } = req.body;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status) {
      updateData.status = status;
      if (status === 'resolved' || status === 'closed') {
        updateData.resolvedAt = new Date();
      }
    }

    if (resolutionNotes) {
      updateData.resolutionNotes = resolutionNotes;
    }

    if (resolutionCause) {
      updateData.resolutionCause = resolutionCause;
    }

    if (resolutionImageUrl) {
      updateData.resolutionImageUrl = resolutionImageUrl;
    }

    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Add note to ticket
router.post('/:id/notes', async (req: Request, res: Response) => {
  try {
    const { authorId, content } = req.body;

    const note = await prisma.ticketNote.create({
      data: {
        ticketId: req.params.id,
        authorId,
        content,
        createdAt: new Date(),
      },
      include: { author: true },
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Get ticket statistics
router.get('/stats/overview', async (_req: Request, res: Response) => {
  try {
    const [
      openTickets,
      inProgressTickets,
      resolvedTickets,
      criticalTickets,
    ] = await Promise.all([
      prisma.ticket.count({ where: { status: 'open' } }),
      prisma.ticket.count({ where: { status: 'in_progress' } }),
      prisma.ticket.count({ where: { status: 'resolved' } }),
      prisma.ticket.count({ where: { priority: 'critical', status: { not: 'closed' } } }),
    ]);

    res.json({
      open: openTickets,
      inProgress: inProgressTickets,
      resolved: resolvedTickets,
      critical: criticalTickets,
    });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({ error: 'Failed to fetch ticket statistics' });
  }
});

export default router;

