import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { createFaultTicketAndAssignment, generateIncidentId, normalizeSeverity, priorityFromSeverity } from './automation.js';

const router = Router();

// =====================================================
// HELPER FUNCTIONS FOR AUTOMATION
// =====================================================

const resolvePanel = async (panelCode?: string) => {
  // If a specific panel code is provided, look it up
  if (panelCode) {
    return prisma.solarPanel.findUnique({ where: { panelId: panelCode } });
  }
  
  // Otherwise, get any available panel for the automation
  // In a real scenario, you might want to match by zone/device
  return prisma.solarPanel.findFirst({
    where: { status: { not: 'offline' } },
    orderBy: { lastChecked: 'desc' }
  });
};

const AUTO_TICKET_THRESHOLD = Number(process.env.AUTO_TICKET_THRESHOLD ?? 3); // Dusty panels threshold

// =====================================================
// RASPBERRY PI DATA ENDPOINTS
// =====================================================

// POST /api/solar-scans - Receive scan data from Raspberry Pi
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      timestamp,
      priority,
      thermal,
      panels,
      deviceId,
      deviceName,
      thermalImage,
      rgbImage,
      autoProcess // Flag to trigger automatic ticket creation
    } = req.body;

    // Count dusty and clean panels
    const dustyPanelCount = panels?.filter((p: any) => p.status === 'DUSTY').length || 0;
    const cleanPanelCount = panels?.filter((p: any) => p.status === 'CLEAN').length || 0;
    const totalPanels = panels?.length || 0;
    const hasFaulty = panels?.some((p: any) => p.status === 'FAULTY') || false;
    const severity = thermal?.severity || 'NORMAL';
    const normalizedSeverity = normalizeSeverity(severity);

    // Determine if we should automatically create a ticket
    // Auto-create for: CRITICAL/HIGH/MEDIUM severity, or dusty panels above threshold, or faulty panels
    const shouldAutoCreateTicket = autoProcess !== false && (
      normalizedSeverity === 'critical' || 
      normalizedSeverity === 'high' || 
      normalizedSeverity === 'medium' || 
      dustyPanelCount >= AUTO_TICKET_THRESHOLD ||
      hasFaulty
    );

// Create SolarScan record
    // Get average temperature from onsite ESP sensor (WeatherData table)
    const latestWeather = await prisma.weatherData.findFirst({
      orderBy: { recordedAt: 'desc' },
      where: {
        temperature: { gt: 0 }, // Only use valid readings
      },
    });
    
    // Use onsite sensor temperature as the mean, or fallback to Pi thermal mean
    const avgTemperature = latestWeather?.temperature || thermal?.mean_temp || null;
    
    const scan = await prisma.solarScan.create({
      data: {
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        priority: priority || 'NORMAL',
        status: shouldAutoCreateTicket ? 'processing' : 'pending',
        
        // Thermal data from Pi camera (for delta/anomaly detection)
        thermalMinTemp: thermal?.min_temp || null,
        thermalMaxTemp: thermal?.max_temp || null,
        // Use onsite ESP sensor temperature as mean (more accurate than thermal camera)
        thermalMeanTemp: avgTemperature,
        thermalDelta: thermal?.delta || null,
        riskScore: thermal?.risk_score || null,
        severity: severity || null,
        thermalImageUrl: thermalImage || null,
        rgbImageUrl: rgbImage || null,
        
        // Summary counts
        dustyPanelCount,
        cleanPanelCount,
        totalPanels,
        
        // Device info
        deviceId: deviceId || null,
        deviceName: deviceName || null,
      }
    });
    
    // Log which temperature source was used
    if (latestWeather) {
      console.log(`📊 Using onsite ESP sensor temp: ${latestWeather.temperature}°C (recorded: ${latestWeather.recordedAt})`);
    } else if (thermal?.mean_temp) {
      console.log(`📊 Using Pi thermal camera mean temp: ${thermal.mean_temp}°C (onsite sensor unavailable)`);
    }

    // =====================================================
    // CREATE ALERT FOR THIS SCAN
    // Only create alert if scan has issues (dusty/faulty panels or high severity)
    // =====================================================
    if (dustyPanelCount > 0 || hasFaulty || normalizedSeverity === 'critical' || normalizedSeverity === 'high') {
      try {
        // Try to find a panel to get zone and row info
        const panel = await resolvePanel();
        
        if (panel) {
          // Get zone name from the panel's relation
          const panelWithZone = await prisma.solarPanel.findUnique({
            where: { id: panel.id },
            include: { zone: true }
          });
          
          const zoneName = panelWithZone?.zone?.name || 'Unknown';
          const rowNum = panel.row;
          const alertStatus = hasFaulty || normalizedSeverity === 'critical' ? 'fault' : 'warning';
          
          // Create alert with scanId link
          await prisma.alert.create({
            data: {
              zone: zoneName,
              row: rowNum,
              status: alertStatus,
              message: `Scan detected: ${hasFaulty ? 'faulty panels' : dustyPanelCount + ' dusty panels'} - Severity: ${severity}`,
              dismissed: false,
              scanId: scan.id,
            }
          });
          console.log('✅ Alert created for scan', scan.id, '- Zone:', zoneName, 'Row:', rowNum);
        }
      } catch (alertError) {
        console.error('❌ Error creating alert for scan:', alertError);
        // Don't fail the scan creation if alert fails
      }
    }

    // Create PanelDetection records for each panel
    if (panels && panels.length > 0) {
      await Promise.all(
        panels.map((panel: any) => 
          prisma.panelDetection.create({
            data: {
              scanId: scan.id,
              panelNumber: panel.panel_number || panel.panelNumber || 'Unknown',
              status: panel.status || 'UNKNOWN',
              x1: panel.x1 || panel.bbox?.[0] || 0,
              y1: panel.y1 || panel.bbox?.[1] || 0,
              x2: panel.x2 || panel.bbox?.[2] || 0,
              y2: panel.y2 || panel.bbox?.[3] || 0,
              cropImageUrl: panel.crop || panel.cropImageUrl || null,
              faultType: panel.faultType || null,
              confidence: panel.confidence || null,
            }
          })
        )
      );
    }

    // =====================================================
    // AUTOMATIC TICKET CREATION & TECHNICIAN ASSIGNMENT
    // Delays by 3 seconds to allow scan to appear first in UI
    // =====================================================
    
    let automationResult = null;
    
    if (shouldAutoCreateTicket) {
      // Update scan status to indicate processing
      await prisma.solarScan.update({
        where: { id: scan.id },
        data: { status: 'processing', updatedAt: new Date() }
      });
      
      // Schedule automation to run after 3 seconds
      setTimeout(async () => {
        try {
          // Try to find a panel to associate with this scan
          // In a real scenario, the scan might include panel info or we'd match by device/location
          const panel = await resolvePanel();
          
          if (panel) {
            const incidentId = generateIncidentId();
            const derivedFaultType = hasFaulty ? 'thermal_fault' : dustyPanelCount >= AUTO_TICKET_THRESHOLD ? 'dust_accumulation' : 'scan_anomaly';
            
            // Check for duplicate fault within the deduplication window BEFORE creating
            // Check at ROW level, not panel level - one alert per row
            const DEDUPE_WINDOW_MINUTES = 15;
            const dedupeFrom = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60 * 1000);
            
            // Get all panels in the same row as this panel
            const panelsInRow = await prisma.solarPanel.findMany({
              where: { row: panel.row },
              select: { id: true },
            });
            const panelIdsInRow = panelsInRow.map(p => p.id);
            
            const existingFault = await prisma.faultDetection.findFirst({
              where: {
                panelId: { in: panelIdsInRow },
                detectedAt: { gte: dedupeFrom },
              },
              orderBy: { detectedAt: 'desc' },
            });

            if (existingFault) {
              console.log('⚠️ Duplicate fault detected for row', panel.row, '- skipping ticket creation');
              
              // Update scan status to processed without creating new ticket
              await prisma.solarScan.update({
                where: { id: scan.id },
                data: { status: 'processed', updatedAt: new Date() }
              });
              
              // Delete the scan since we don't need a new ticket
              await prisma.solarScan.delete({
                where: { id: scan.id }
              });
              return;
            }
            
            // This creates: Fault → Ticket → Technician Assignment → activeTickets Increment
            // Also links the alert with the ticket via zone, row, status
            const panelWithZone = await prisma.solarPanel.findUnique({
              where: { id: panel.id },
              include: { zone: true }
            });
            
            const zoneName = panelWithZone?.zone?.name || 'Unknown';
            const rowNum = panel.row;
            const alertStatus = hasFaulty || normalizedSeverity === 'critical' ? 'fault' : 'warning';
            
            automationResult = await createFaultTicketAndAssignment({
              incidentId,
              panelId: panel.id,
              faultType: derivedFaultType,
              severity: normalizedSeverity,
              detectedAt: scan.timestamp,
              description: `Automated scan processing - ${hasFaulty ? 'thermal fault detected' : 'dust accumulation: ' + dustyPanelCount + ' panels'}`,
              aiConfidence: Math.max(0, Math.min(100, Number(thermal?.risk_score ?? 50))),
              aiAnalysis: `Scan severity: ${severity}; dusty panels: ${dustyPanelCount}; faulty detections: ${hasFaulty ? 'yes' : 'no'}`,
              recommendedAction: hasFaulty
                ? 'Immediate technician dispatch for thermal fault verification'
                : 'Schedule panel cleaning and technician validation',
              droneImageUrl: rgbImage || undefined,
              thermalImageUrl: thermalImage || undefined,
              locationX: 0,
              locationY: 0,
              scanId: scan.id,
              zone: zoneName,
              row: rowNum,
              status: alertStatus,
            });

              // Update scan status to processed
              await prisma.solarScan.update({
                where: { id: scan.id },
                data: { status: 'processed', updatedAt: new Date() }
              });

              console.log('✅ Automation triggered (3s delay): Ticket', automationResult.ticketNumber, 'assigned to technician');
              
              // Delete the scan after ticket creation - it now lives in tickets only
              await prisma.solarScan.delete({
                where: { id: scan.id }
              });
              console.log('🗑️ Scan removed from scans list - now visible in tickets only');
          } else {
            console.log('⚠️ No panel found for automation - scan saved but no ticket created');
            await prisma.solarScan.update({
              where: { id: scan.id },
              data: { status: 'pending', updatedAt: new Date() }
            });
          }
        } catch (autoError) {
          console.error('❌ Automation error:', autoError);
          await prisma.solarScan.update({
            where: { id: scan.id },
            data: { status: 'pending', updatedAt: new Date() }
          });
        }
      }, 3000); // 3 second delay
    }

    res.status(201).json({
      success: true,
      scanId: scan.id,
      message: shouldAutoCreateTicket 
        ? 'Solar scan recorded - ticket will be created in 3 seconds' 
        : 'Solar scan recorded successfully',
      automation: shouldAutoCreateTicket ? {
        ticketCreated: false, // Will be created after 3 second delay
        message: 'Ticket will be automatically created and assigned to technician in 3 seconds'
      } : null
    });
  } catch (error) {
    console.error('Error saving solar scan:', error);
    res.status(500).json({ error: 'Failed to save solar scan data' });
  }
});

// GET /api/solar-scans - Get all scans
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = 50 } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const scans = await prisma.solarScan.findMany({
      where,
      include: {
        panelDetections: true
      },
      orderBy: { timestamp: 'desc' },
      take: Number(limit)
    });

    res.json(scans);
  } catch (error) {
    console.error('Error fetching solar scans:', error);
    res.status(500).json({ error: 'Failed to fetch solar scans' });
  }
});

// GET /api/solar-scans/latest - Get latest scan
router.get('/latest', async (_req: Request, res: Response) => {
  try {
    const scan = await prisma.solarScan.findFirst({
      orderBy: { timestamp: 'desc' },
      include: {
        panelDetections: true
      }
    });

    if (!scan) {
      return res.status(404).json({ error: 'No scans found' });
    }

    res.json(scan);
  } catch (error) {
    console.error('Error fetching latest scan:', error);
    res.status(500).json({ error: 'Failed to fetch latest scan' });
  }
});

// GET /api/solar-scans/stats/summary - Get scan statistics
router.get('/stats/summary', async (_req: Request, res: Response) => {
  try {
    const totalScans = await prisma.solarScan.count();
    const pendingScans = await prisma.solarScan.count({ where: { status: 'pending' } });
    const processedScans = await prisma.solarScan.count({ where: { status: 'processed' } });
    
    const criticalScans = await prisma.solarScan.count({ 
      where: { severity: 'CRITICAL' } 
    });
    
    const highRiskScans = await prisma.solarScan.count({ 
      where: { severity: { in: ['CRITICAL', 'HIGH'] } } 
    });

    // Average thermal delta
    const avgThermalDelta = await prisma.solarScan.aggregate({
      _avg: { thermalDelta: true }
    });

    res.json({
      totalScans,
      pendingScans,
      processedScans,
      criticalScans,
      highRiskScans,
      avgThermalDelta: avgThermalDelta._avg.thermalDelta || 0
    });
  } catch (error) {
    console.error('Error fetching scan stats:', error);
    res.status(500).json({ error: 'Failed to fetch scan statistics' });
  }
});

// GET /api/solar-scans/:id - Get scan by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const scan = await prisma.solarScan.findUnique({
      where: { id: req.params.id },
      include: {
        panelDetections: true
      }
    });

    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json(scan);
  } catch (error) {
    console.error('Error fetching scan:', error);
    res.status(500).json({ error: 'Failed to fetch scan' });
  }
});

// PATCH /api/solar-scans/:id - Update scan status
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    const scan = await prisma.solarScan.update({
      where: { id: req.params.id },
      data: {
        status,
        updatedAt: new Date()
      }
    });

    res.json(scan);
  } catch (error) {
    console.error('Error updating scan:', error);
    res.status(500).json({ error: 'Failed to update scan' });
  }
});

// DELETE /api/solar-scans/:id - Delete scan
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.solarScan.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'Scan deleted' });
  } catch (error) {
    console.error('Error deleting scan:', error);
    res.status(500).json({ error: 'Failed to delete scan' });
  }
});

export default router;
