import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();

const parseSkills = (skills: unknown): string[] =>
  Array.isArray(skills)
    ? skills.map(skill => String(skill).trim()).filter(Boolean)
    : [];

// Get all technicians
router.get('/', async (_req: Request, res: Response) => {
  try {
    const technicians = await prisma.technician.findMany({
      orderBy: { name: 'asc' },
    });

    res.json(technicians);
  } catch (error) {
    console.error('Error fetching technicians:', error);
    res.status(500).json({ error: 'Failed to fetch technicians' });
  }
});

// Get technician by ID with recent notes
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const technician = await prisma.technician.findUnique({
      where: { id: req.params.id },
      include: {
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!technician) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    res.json(technician);
  } catch (error) {
    console.error('Error fetching technician:', error);
    res.status(500).json({ error: 'Failed to fetch technician' });
  }
});

// Get available technicians
router.get('/status/available', async (_req: Request, res: Response) => {
  try {
    const technicians = await prisma.technician.findMany({
      where: { status: 'available' },
      orderBy: { name: 'asc' },
    });

    res.json(technicians);
  } catch (error) {
    console.error('Error fetching available technicians:', error);
    res.status(500).json({ error: 'Failed to fetch available technicians' });
  }
});

// Update technician status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    const technician = await prisma.technician.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json(technician);
  } catch (error) {
    console.error('Error updating technician status:', error);
    res.status(500).json({ error: 'Failed to update technician status' });
  }
});

// Create new technician
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, skills, status, activeTickets, resolvedTickets, avgResolutionTime, avatar } = req.body;
    const parsedSkills = parseSkills(skills);

    if (!name || !email || !phone || parsedSkills.length === 0) {
      return res.status(400).json({ error: 'Name, email, phone, and skills are required' });
    }
    if (String(name).trim().length > 20) {
      return res.status(400).json({ error: 'Name must be 20 characters or less' });
    }

    const technician = await prisma.technician.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim(),
        phone: String(phone).trim(),
        skills: JSON.stringify(parsedSkills),
        status: status || 'available',
        activeTickets: activeTickets || 0,
        resolvedTickets: resolvedTickets || 0,
        avgResolutionTime: avgResolutionTime || 0,
        avatar: avatar || null,
      },
    });

    res.status(201).json(technician);
  } catch (error) {
    console.error('Error creating technician:', error);
    res.status(500).json({ error: 'Failed to create technician' });
  }
});

// Edit technician details
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, skills, avatar } = req.body;
    const parsedSkills = parseSkills(skills);

    if (!name || !email || !phone || parsedSkills.length === 0) {
      return res.status(400).json({ error: 'Name, email, phone, and skills are required' });
    }
    if (String(name).trim().length > 20) {
      return res.status(400).json({ error: 'Name must be 20 characters or less' });
    }

    const technician = await prisma.technician.update({
      where: { id: req.params.id },
      data: {
        name: String(name).trim(),
        email: String(email).trim(),
        phone: String(phone).trim(),
        skills: JSON.stringify(parsedSkills),
        avatar: avatar ?? undefined,
      },
    });

    res.json(technician);
  } catch (error) {
    console.error('Error updating technician:', error);
    res.status(500).json({ error: 'Failed to update technician' });
  }
});

// Delete technician
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const technicianId = req.params.id;

    const technician = await prisma.technician.findUnique({
      where: { id: technicianId },
      select: { id: true },
    });

    if (!technician) {
      return res.status(404).json({ error: 'Technician not found' });
    }

    await prisma.$transaction([
      prisma.ticketNote.deleteMany({
        where: { authorId: technicianId },
      }),
      prisma.technician.delete({
        where: { id: technicianId },
      }),
    ]);

    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting technician:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return res.status(400).json({ error: 'Technician cannot be deleted because related records still exist' });
      }
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Technician not found' });
      }
    }
    res.status(500).json({ error: 'Failed to delete technician' });
  }
});

export default router;

