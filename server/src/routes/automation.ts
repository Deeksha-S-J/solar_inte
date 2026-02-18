import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';

const router = Router();

const DEDUPE_WINDOW_MINUTES = Number(process.env.AUTOMATION_DEDUPE_MINUTES ?? 15);
const BUSY_THRESHOLD = Number(process.env.TECH_BUSY_TICKET_THRESHOLD ?? 4);

type PanelResolverInput = {
  panelId?: string;
  panelCode?: string;
};

type PanelErrorInput = {
  incidentId?: string;
  panelId?: string;
  panelCode?: string;
  severity?: string;
  faultType?: string;
  detectedAt?: string;
  description?: string;
  aiConfidence?: number;
  aiAnalysis?: string;
  recommendedAction?: string;
  droneImageUrl?: string;
  thermalImageUrl?: string;
  locationX?: number;
  locationY?: number;
  scanId?: string;
};

type ScanProcessInput = {
  panelId?: string;
  panelCode?: string;
  incidentId?: string;
  faultType?: string;
  forceTicket?: boolean;
};

export const normalizeSeverity = (severity: string | undefined): string => {
  const value = String(severity ?? '').trim().toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(value)) {
    return value;
  }
  return 'medium';
};

export const priorityFromSeverity = (severity: string): string => {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'low') return 'low';
  return 'medium';
};

const parseSkills = (skillsRaw: string): string[] => {
  if (!skillsRaw) return [];
  try {
    const parsed = JSON.parse(skillsRaw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value).toLowerCase().trim()).filter(Boolean);
  } catch {
    return [];
  }
};

export const generateIncidentId = () =>
  `INC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

// Export generateTicketNumber for use in index.ts
export const generateTicketNumber = async (): Promise<string> => {
  try {
    // Get the latest ticket to determine the next number
    const latestTicket = await prisma.ticket.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { ticketNumber: true },
    });

    let nextNumber = 1;
    if (latestTicket?.ticketNumber) {
      // Extract number from any format: FAULT ID-FK-xxx, FK-xxx, TCK-xxx, TK-xxx
      // Match patterns like: FAULT ID-FK-001, FK-001, TCK-001, TK-001
      const patterns = [
        /FAULT ID-FK-(\d+)/i,
        /FK-(\d+)/i,
        /TCK-(\d+)/i,
        /TK-(\d+)/i,
      ];
      
      for (const pattern of patterns) {
        const match = latestTicket.ticketNumber.match(pattern);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
          break;
        }
      }
    }

    // Format as FK-001, FK-002, etc. (simplified format to avoid redundancy)
    return `FK-${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    // Fallback to timestamp-based if database query fails
    console.error('Error generating ticket number, using fallback:', error);
    return `FK-${Date.now().toString().slice(-6)}`;
  }
};

const createAutomationEvent = async (
  tx: Prisma.TransactionClient,
  input: {
    eventType: string;
    stage: string;
    incidentId: string;
    panelId?: string | null;
    scanId?: string | null;
    faultId?: string | null;
    ticketId?: string | null;
    technicianId?: string | null;
    payload?: Prisma.InputJsonValue;
  }
) => {
  await tx.automationEvent.create({
    data: {
      eventType: input.eventType,
      stage: input.stage,
      incidentId: input.incidentId,
      panelId: input.panelId ?? null,
      scanId: input.scanId ?? null,
      faultId: input.faultId ?? null,
      ticketId: input.ticketId ?? null,
      technicianId: input.technicianId ?? null,
      payload: input.payload,
    },
  });
};

const resolvePanel = async ({ panelId, panelCode }: PanelResolverInput) => {
  if (panelId) {
    return prisma.solarPanel.findUnique({ where: { id: panelId } });
  }
  if (panelCode) {
    return prisma.solarPanel.findUnique({ where: { panelId: panelCode } });
  }
  return null;
};

const findDuplicateFault = async (
  tx: Prisma.TransactionClient,
  panelId: string,
  faultType: string,
  detectedAt: Date
) => {
  const dedupeFrom = new Date(detectedAt.getTime() - DEDUPE_WINDOW_MINUTES * 60 * 1000);

  // Get the panel to find its row
  const panel = await tx.solarPanel.findUnique({
    where: { id: panelId },
    select: { row: true },
  });

  if (!panel) {
    return null;
  }

  // Get all panels in the same row
  const panelsInRow = await tx.solarPanel.findMany({
    where: { row: panel.row },
    select: { id: true },
  });
  const panelIdsInRow = panelsInRow.map(p => p.id);

  // Check for existing faults in the SAME ROW within the deduplication window
  return tx.faultDetection.findFirst({
    where: {
      panelId: { in: panelIdsInRow },
      faultType,
      detectedAt: { gte: dedupeFrom },
    },
    include: {
      tickets: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { detectedAt: 'desc' },
  });
};

const selectTechnician = async (tx: Prisma.TransactionClient, faultType: string) => {
  const normalizedFaultType = faultType.toLowerCase().trim();
  const candidates = await tx.technician.findMany({
    where: {
      status: { in: ['available', 'busy'] },
    },
    orderBy: [{ activeTickets: 'asc' }, { avgResolutionTime: 'asc' }],
  });

  if (candidates.length === 0) {
    return null;
  }

  const scored = candidates.map((tech) => {
    const skills = parseSkills(tech.skills);
    const hasSkill = skills.some(
      (skill) =>
        skill.includes(normalizedFaultType) ||
        normalizedFaultType.includes(skill) ||
        skill.includes('diagnostic') ||
        skill.includes('maintenance')
    );

    let score = 0;
    score += tech.status === 'available' ? 40 : 15;
    score += hasSkill ? 30 : 0;
    if (tech.activeTickets <= 1) score += 25;
    else if (tech.activeTickets <= 3) score += 10;
    else score -= 15;
    score += Math.max(0, 20 - tech.avgResolutionTime * 3);

    return { tech, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.tech ?? null;
};

export const createFaultTicketAndAssignment = async (input: {
  incidentId: string;
  panelId: string;
  faultType: string;
  severity: string;
  detectedAt: Date;
  description: string;
  aiConfidence: number;
  aiAnalysis: string;
  recommendedAction: string;
  droneImageUrl?: string;
  thermalImageUrl?: string;
  locationX: number;
  locationY: number;
  scanId?: string;
  zone?: string;
  row?: number;
  status?: string;
}) => {
  return prisma.$transaction(async (tx) => {
    await createAutomationEvent(tx, {
      eventType: 'PanelErrorDetected',
      stage: 'panel_error_detected',
      incidentId: input.incidentId,
      panelId: input.panelId,
      scanId: input.scanId,
      payload: {
        faultType: input.faultType,
        severity: input.severity,
      },
    });

    const duplicate = await findDuplicateFault(tx, input.panelId, input.faultType, input.detectedAt);
    if (duplicate?.tickets[0]) {
      await createAutomationEvent(tx, {
        eventType: 'DuplicateFaultIgnored',
        stage: 'deduplicated',
        incidentId: input.incidentId,
        panelId: input.panelId,
        scanId: input.scanId,
        faultId: duplicate.id,
        ticketId: duplicate.tickets[0].id,
        payload: {
          dedupeMinutes: DEDUPE_WINDOW_MINUTES,
        },
      });

      return {
        deduplicated: true,
        faultId: duplicate.id,
        ticketId: duplicate.tickets[0].id,
        ticketNumber: duplicate.tickets[0].ticketNumber,
        assignedTechnicianId: duplicate.tickets[0].assignedTechnicianId,
      };
    }

    const fault = await tx.faultDetection.create({
      data: {
        panelId: input.panelId,
        detectedAt: input.detectedAt,
        severity: input.severity,
        faultType: input.faultType,
        droneImageUrl: input.droneImageUrl ?? null,
        thermalImageUrl: input.thermalImageUrl ?? null,
        aiConfidence: input.aiConfidence,
        aiAnalysis: input.aiAnalysis,
        recommendedAction: input.recommendedAction,
        locationX: input.locationX,
        locationY: input.locationY,
      },
    });

    await createAutomationEvent(tx, {
      eventType: 'FaultCreated',
      stage: 'fault_created',
      incidentId: input.incidentId,
      panelId: input.panelId,
      scanId: input.scanId,
      faultId: fault.id,
    });

    const ticket = await tx.ticket.create({
      data: {
        ticketNumber: await generateTicketNumber(),
        panelId: input.panelId,
        faultId: fault.id,
        status: 'open',
        priority: priorityFromSeverity(input.severity),
        createdAt: new Date(),
        updatedAt: new Date(),
        description: input.description,
        faultType: input.faultType,
        zone: input.zone ?? null,
        row: input.row ?? null,
        droneImageUrl: input.droneImageUrl ?? null,
        thermalImageUrl: input.thermalImageUrl ?? null,
        aiAnalysis: input.aiAnalysis,
        recommendedAction: input.recommendedAction,
      },
    });

    // Update the alert with the ticket ID if zone, row, and status are provided
    if (input.zone && input.row !== undefined && input.status) {
      await tx.alert.updateMany({
        where: {
          zone: input.zone,
          row: input.row,
          status: input.status,
          dismissed: false,
        },
        data: {
          ticketId: ticket.id,
        },
      });
    }

    await createAutomationEvent(tx, {
      eventType: 'TicketCreated',
      stage: 'ticket_created',
      incidentId: input.incidentId,
      panelId: input.panelId,
      scanId: input.scanId,
      faultId: fault.id,
      ticketId: ticket.id,
      payload: {
        ticketNumber: ticket.ticketNumber,
      },
    });

    const technician = await selectTechnician(tx, input.faultType);

    if (!technician) {
      await createAutomationEvent(tx, {
        eventType: 'TechnicianUnavailable',
        stage: 'manual_assignment_required',
        incidentId: input.incidentId,
        panelId: input.panelId,
        scanId: input.scanId,
        faultId: fault.id,
        ticketId: ticket.id,
      });

      return {
        deduplicated: false,
        faultId: fault.id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        assignedTechnicianId: null,
      };
    }

    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        assignedTechnicianId: technician.id,
        updatedAt: new Date(),
      },
    });

    const nextActiveTickets = technician.activeTickets + 1;
    await tx.technician.update({
      where: { id: technician.id },
      data: {
        activeTickets: { increment: 1 },
        status: nextActiveTickets >= BUSY_THRESHOLD ? 'busy' : technician.status,
      },
    });

    await createAutomationEvent(tx, {
      eventType: 'TechnicianAssigned',
      stage: 'technician_assigned',
      incidentId: input.incidentId,
      panelId: input.panelId,
      scanId: input.scanId,
      faultId: fault.id,
      ticketId: ticket.id,
      technicianId: technician.id,
      payload: {
        technicianName: technician.name,
      },
    });

    return {
      deduplicated: false,
      faultId: fault.id,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      assignedTechnicianId: technician.id,
    };
  });
};

router.post('/panel-error', async (req: Request, res: Response) => {
  try {
    const body = req.body as PanelErrorInput;
    const panel = await resolvePanel({ panelId: body.panelId, panelCode: body.panelCode });

    if (!panel) {
      return res.status(400).json({
        error: 'Valid panelId or panelCode is required',
      });
    }

    const incidentId = body.incidentId?.trim() || generateIncidentId();
    const severity = normalizeSeverity(body.severity);
    const faultType = String(body.faultType ?? 'unknown_fault').trim().toLowerCase();
    const detectedAt = body.detectedAt ? new Date(body.detectedAt) : new Date();

    if (Number.isNaN(detectedAt.getTime())) {
      return res.status(400).json({ error: 'detectedAt must be a valid ISO timestamp' });
    }

    const result = await createFaultTicketAndAssignment({
      incidentId,
      panelId: panel.id,
      faultType,
      severity,
      detectedAt,
      description: body.description ?? `Automated incident for ${faultType} on panel ${panel.panelId}`,
      aiConfidence: Number(body.aiConfidence ?? 0),
      aiAnalysis: body.aiAnalysis ?? 'Automatically processed from panel error event',
      recommendedAction: body.recommendedAction ?? 'Dispatch technician for verification and repair',
      droneImageUrl: body.droneImageUrl,
      thermalImageUrl: body.thermalImageUrl,
      locationX: Number(body.locationX ?? 0),
      locationY: Number(body.locationY ?? 0),
      scanId: body.scanId,
    });

    res.status(201).json({
      incidentId,
      panelId: panel.id,
      panelCode: panel.panelId,
      ...result,
    });
  } catch (error) {
    console.error('Error processing panel error automation:', error);
    res.status(500).json({ error: 'Failed to automate panel error workflow' });
  }
});

router.post('/scan/:scanId/process', async (req: Request, res: Response) => {
  try {
    const body = req.body as ScanProcessInput;
    const scan = await prisma.solarScan.findUnique({
      where: { id: req.params.scanId },
      include: { panelDetections: true },
    });

    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    const panel = await resolvePanel({ panelId: body.panelId, panelCode: body.panelCode });
    if (!panel) {
      return res.status(400).json({
        error: 'Valid panelId or panelCode is required to convert scan into ticket',
      });
    }

    const severity = normalizeSeverity(scan.severity?.toLowerCase());
    const hasFaulty = scan.panelDetections.some((detection) => detection.status === 'FAULTY');
    const hasDust = scan.panelDetections.some((detection) => detection.status === 'DUSTY') || scan.dustyPanelCount > 0;
    const shouldCreateTicket = body.forceTicket || hasFaulty || hasDust || ['critical', 'high', 'medium'].includes(severity);

    const incidentId = body.incidentId?.trim() || generateIncidentId();

    await prisma.automationEvent.create({
      data: {
        eventType: 'ScanReceived',
        stage: 'scan_received',
        incidentId,
        panelId: panel.id,
        scanId: scan.id,
        payload: {
          severity,
          hasFaulty,
          hasDust,
        },
      },
    });

    if (!shouldCreateTicket) {
      await prisma.solarScan.update({
        where: { id: scan.id },
        data: { status: 'processed', updatedAt: new Date() },
      });

      await prisma.automationEvent.create({
        data: {
          eventType: 'ScanClosedWithoutTicket',
          stage: 'scan_closed_without_ticket',
          incidentId,
          panelId: panel.id,
          scanId: scan.id,
        },
      });

      return res.json({
        incidentId,
        scanId: scan.id,
        ticketCreated: false,
        reason: 'No actionable risk threshold met',
      });
    }

    const derivedFaultType = body.faultType?.trim().toLowerCase()
      || (hasFaulty ? 'thermal_fault' : hasDust ? 'dust_accumulation' : 'scan_anomaly');

    const aiConfidence = Math.max(0, Math.min(100, Number(scan.riskScore ?? 50)));

    const result = await createFaultTicketAndAssignment({
      incidentId,
      panelId: panel.id,
      faultType: derivedFaultType,
      severity,
      detectedAt: scan.timestamp,
      description: `Automated scan processing from scan ${scan.id}`,
      aiConfidence,
      aiAnalysis: `Scan severity ${scan.severity ?? 'UNKNOWN'}; dusty panels: ${scan.dustyPanelCount}; faulty detections: ${hasFaulty ? 'yes' : 'no'}`,
      recommendedAction: hasFaulty
        ? 'Immediate technician dispatch for thermal fault verification'
        : 'Schedule panel cleaning and technician validation',
      droneImageUrl: scan.rgbImageUrl ?? undefined,
      thermalImageUrl: scan.thermalImageUrl ?? undefined,
      locationX: 0,
      locationY: 0,
      scanId: scan.id,
    });

    await prisma.solarScan.update({
      where: { id: scan.id },
      data: { status: 'processed', updatedAt: new Date() },
    });

    await prisma.automationEvent.create({
      data: {
        eventType: 'ScanProcessed',
        stage: 'scan_processed',
        incidentId,
        panelId: panel.id,
        scanId: scan.id,
        faultId: result.faultId,
        ticketId: result.ticketId,
        technicianId: result.assignedTechnicianId,
      },
    });

    res.json({
      incidentId,
      scanId: scan.id,
      panelId: panel.id,
      panelCode: panel.panelId,
      ticketCreated: true,
      ...result,
    });
  } catch (error) {
    console.error('Error processing scan automation:', error);
    res.status(500).json({ error: 'Failed to process scan into ticket workflow' });
  }
});

router.get('/incidents/:incidentId/events', async (req: Request, res: Response) => {
  try {
    const events = await prisma.automationEvent.findMany({
      where: { incidentId: req.params.incidentId },
      orderBy: { createdAt: 'asc' },
    });

    res.json(events);
  } catch (error) {
    console.error('Error fetching incident events:', error);
    res.status(500).json({ error: 'Failed to fetch incident events' });
  }
});

export default router;
