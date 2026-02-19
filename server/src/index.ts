import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import prisma from './db.js';
import path from 'path';
import fs from 'fs';
import { networkInterfaces } from 'os';
import { createFaultTicketAndAssignment, generateIncidentId, normalizeSeverity, generateTicketNumber } from './routes/automation.js';

// Routes
import panelsRouter from './routes/panels.js';
import techniciansRouter from './routes/technicians.js';
import ticketsRouter from './routes/tickets.js';
import faultsRouter from './routes/faults.js';
import weatherRouter from './routes/weather.js';
import analyticsRouter from './routes/analytics.js';
import solarScansRouter from './routes/solarScans.js';
import automationRouter from './routes/automation.js';
import espRouter from './routes/esp.js';
import webhookRouter from './routes/webhook.js';
import alertsRouter from './routes/alerts.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PI_RESULTS = 50;

// Get the server's actual IP address at startup
let serverIpAddress = 'localhost';

// Try to get the actual IP address
const nets = networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name] || []) {
    // Skip internal (127.0.0.1) and non-IPv4 addresses
    if (net.family === 'IPv4' && !net.internal) {
      serverIpAddress = net.address;
      break;
    }
  }
  if (serverIpAddress !== 'localhost') break;
}
console.log(`Server IP Address: ${serverIpAddress}`);

// Directory to save received images from Pi
const PI_SAVE_DIR = path.join(process.cwd(), 'received_from_pi');
const CAPTURES_DIR = path.join(PI_SAVE_DIR, 'captures');
const PANEL_CROPS_DIR = path.join(PI_SAVE_DIR, 'panel_crops');

// Create directories if they don't exist
[PI_SAVE_DIR, CAPTURES_DIR, PANEL_CROPS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/api/pi-images', express.static(PI_SAVE_DIR));

type PiPanelCropInput = {
  panel_number?: string;
  status?: 'CLEAN' | 'DUSTY' | 'FAULTY' | 'UNKNOWN';
  has_dust?: boolean;
  image_b64?: string;
};

type PiAnalysisResultInput = {
  capture_id?: string | number;
  timestamp?: string;
  report?: {
    health_score?: number;
    priority?: 'HIGH' | 'MEDIUM' | 'NORMAL';
    recommendation?: string;
    timeframe?: string;
    summary?: string;
    root_cause?: string;
    impact_assessment?: string;
  };
  rgb_stats?: {
    total?: number;
    clean?: number;
    dusty?: number;
  };
  frame_b64?: string;
  thermal_b64?: string;
  thermal?: {
    min_temp?: number;
    max_temp?: number;
    mean_temp?: number;
    delta?: number;
    risk_score?: number;
    severity?: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  };
  panel_crops?: PiPanelCropInput[];
  device_id?: string;
  device_name?: string;
};

type PiResultForClients = {
  id: string;
  capture_id: string;
  timestamp: string;
  received_at: string;
  report: {
    health_score: number;
    priority: 'HIGH' | 'MEDIUM' | 'NORMAL';
    recommendation: string;
    timeframe: string;
    summary: string;
    root_cause: string;
    impact_assessment: string;
  };
  rgb_stats: {
    total: number;
    clean: number;
    dusty: number;
  };
  main_image_web: string | null;
  thermal_image_web: string | null;
  thermal: {
    min_temp: number | null;
    max_temp: number | null;
    mean_temp: number | null;
    delta: number | null;
    risk_score: number | null;
    severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | null;
  };
  panel_crops: Array<{
    panel_number: string;
    status: 'CLEAN' | 'DUSTY' | 'FAULTY' | 'UNKNOWN';
    has_dust: boolean;
    web_path: string | null;
  }>;
};

const piResults: PiResultForClients[] = [];

const makeTimestampSuffix = () => {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const sanitizeFilePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_');

const decodeBase64Image = (rawData: string) => {
  const parts = rawData.split(',');
  const base64Data = parts.length > 1 ? parts[1] : parts[0];
  return Buffer.from(base64Data, 'base64');
};

const toJpegDataUrl = (rawData?: string | null) => {
  if (!rawData) return null;
  if (rawData.startsWith('data:image/')) return rawData;
  const parts = rawData.split(',');
  const base64Data = parts.length > 1 ? parts[1] : parts[0];
  return `data:image/jpeg;base64,${base64Data}`;
};

const getSeverityFromHealthScore = (healthScore: number): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' => {
  if (healthScore < 30) return 'CRITICAL';
  if (healthScore < 50) return 'HIGH';
  if (healthScore < 75) return 'MODERATE';
  return 'LOW';
};

const SCAN_DUPLICATE_WINDOW_SECONDS = 120;
const nearlyEqual = (a?: number | null, b?: number | null, epsilon = 0.35) => {
  if (a == null || b == null) return true;
  return Math.abs(a - b) <= epsilon;
};

const isLikelyDuplicatePiScan = (
  existing: {
    deviceId: string | null;
    totalPanels: number;
    dustyPanelCount: number;
    cleanPanelCount: number;
    thermalMeanTemp: number | null;
    thermalDelta: number | null;
  },
  incoming: {
    deviceId: string | null;
    totalPanels: number;
    dustyPanelCount: number;
    cleanPanelCount: number;
    thermalMeanTemp: number | null;
    thermalDelta: number | null;
  }
) => {
  if ((existing.deviceId || null) !== (incoming.deviceId || null)) return false;
  if (existing.totalPanels !== incoming.totalPanels) return false;
  if (existing.dustyPanelCount !== incoming.dustyPanelCount) return false;
  if (existing.cleanPanelCount !== incoming.cleanPanelCount) return false;
  if (!nearlyEqual(existing.thermalMeanTemp, incoming.thermalMeanTemp)) return false;
  if (!nearlyEqual(existing.thermalDelta, incoming.thermalDelta)) return false;
  return true;
};

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Config - returns backend URL for dynamic image resolution
// This helps teammates access images when connecting to a shared backend
app.get('/api/config', (req, res) => {
  // Use the server's actual IP address (determined at startup)
  // This ensures teammates get the correct backend URL
  const host = serverIpAddress;
  const port = process.env.PORT || 3000;
  
  // Check if it's https (if behind reverse proxy with SSL termination)
  const protocol = req.protocol === 'https' ? 'https' : 'http';
  
  res.json({
    backendUrl: `${protocol}://${host}:${port}`,
    apiVersion: 'v1',
  });
});

// API Routes
app.use('/api/panels', panelsRouter);
app.use('/api/technicians', techniciansRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/faults', faultsRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/solar-scans', solarScansRouter);
app.use('/api/automation', automationRouter);
app.use('/api/esp', espRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/alerts', alertsRouter);

app.get('/api/pi-results', (_req, res) => {
  res.json({
    total: piResults.length,
    results: piResults,
  });
});

app.delete('/api/pi-results/:id', (req, res) => {
  const targetId = req.params.id;
  const before = piResults.length;
  const next = piResults.filter((result) => result.id !== targetId);
  piResults.length = 0;
  piResults.push(...next);

  res.json({
    success: true,
    removed: before - next.length,
  });
});

// Socket.io handling for Raspberry Pi image uploads
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send already-received Pi results to freshly connected clients
  piResults.forEach((result) => {
    socket.emit('new_result', result);
  });

  // Existing thermal-image payload support
  socket.on('thermal-image', async (data) => {
    try {
      console.log('Received thermal image from Pi:', data.panelId);

      // Check for duplicate fault within the deduplication window
      const DEDUPE_WINDOW_MINUTES = 15;
      const dedupeFrom = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60 * 1000);
      
      // Get the panel to find its row
      const panel = await prisma.solarPanel.findUnique({
        where: { id: data.panelId },
        select: { id: true, row: true },
      });

      if (!panel) {
        socket.emit('image-received', {
          success: false,
          error: 'Panel not found',
        });
        return;
      }

      // Check for existing faults in the SAME ROW within the deduplication window
      // Get all panels in the same row
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
        console.log('⚠️ Duplicate fault detected for row', panel.row, '- skipping creation');
        socket.emit('image-received', {
          success: true,
          panelId: data.panelId,
          message: 'Duplicate fault detected for row - alert already exists',
          existingFaultId: existingFault.id,
        });
        return;
      }

      // Create fault detection record
      const faultDetection = await prisma.faultDetection.create({
        data: {
          panelId: data.panelId,
          detectedAt: new Date(),
          severity: data.analysis?.severity || 'medium',
          faultType: data.analysis?.faultType || 'unknown',
          droneImageUrl: data.rgbImage || null,
          thermalImageUrl: data.thermalImage || null,
          aiConfidence: data.analysis?.confidence || 0,
          aiAnalysis: data.analysis?.description || '',
          recommendedAction: data.analysis?.recommendedAction || '',
          locationX: data.locationX || 0,
          locationY: data.locationY || 0,
        },
      });

      // Create a ticket for this fault
      // Use generateTicketNumber from automation.ts for FK-XXX format
      const ticketNumber = await generateTicketNumber();
      
      await prisma.ticket.create({
        data: {
          ticketNumber,
          panelId: data.panelId,
          faultId: faultDetection.id,
          status: 'open',
          priority: data.analysis?.severity === 'high' ? 'high' : 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
          description: data.analysis?.description || 'Fault detected via thermal imaging',
          faultType: data.analysis?.faultType || 'unknown',
          droneImageUrl: data.rgbImage || null,
          thermalImageUrl: data.thermalImage || null,
          aiAnalysis: data.analysis?.description || null,
          recommendedAction: data.analysis?.recommendedAction || null,
        },
      });

      io.emit('new-fault-detection', {
        panelId: data.panelId,
        faultDetection,
        timestamp: new Date(),
      });

      socket.emit('image-received', {
        success: true,
        panelId: data.panelId,
        message: 'Image and analysis stored successfully',
      });

      console.log('Fault detection and ticket created for panel:', data.panelId);
    } catch (error) {
      console.error('Error processing thermal image:', error);
      socket.emit('image-received', {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Full laptop_receiver.py-compatible payload support
  socket.on(
    'pi_analysis_result',
    async (
      data: PiAnalysisResultInput,
      ack?: (response: { success: boolean; scanId?: string; error?: string }) => void
    ) => {
    try {
      if (!data?.capture_id || !data?.report) {
        const response = {
          success: false,
          error: 'Missing required fields (capture_id/report)',
        };
        socket.emit('pi-analysis-received', response);
        if (ack) ack(response);
        return;
      }

      const captureId = String(data.capture_id);
      const healthScore = Number(data.report.health_score ?? 0);
      const priority = data.report.priority ?? 'NORMAL';
      const receivedAt = new Date();
      const timestamp =
        data.timestamp && !Number.isNaN(Date.parse(data.timestamp))
          ? data.timestamp
          : receivedAt.toISOString();

      const timestampSuffix = makeTimestampSuffix();
      const safeCaptureId = sanitizeFilePart(captureId);
      let mainImageWebPath: string | null = null;
      let thermalImageWebPath: string | null = null;
      const mainImageDataUrl = toJpegDataUrl(data.frame_b64);
      const thermalImageDataUrl = toJpegDataUrl(data.thermal_b64);

      if (data.frame_b64) {
        const captureFileName = `capture_${safeCaptureId}_${timestampSuffix}.jpg`;
        const captureFilePath = path.join(CAPTURES_DIR, captureFileName);
        fs.writeFileSync(captureFilePath, decodeBase64Image(data.frame_b64));
        mainImageWebPath = `/api/pi-images/captures/${captureFileName}`;
      }

      if (data.thermal_b64) {
        const thermalFileName = `thermal_${safeCaptureId}_${timestampSuffix}.jpg`;
        const thermalFilePath = path.join(CAPTURES_DIR, thermalFileName);
        fs.writeFileSync(thermalFilePath, decodeBase64Image(data.thermal_b64));
        thermalImageWebPath = `/api/pi-images/captures/${thermalFileName}`;
      }

      const panelCropsInput = Array.isArray(data.panel_crops) ? data.panel_crops : [];
      const panelCropsForClients: PiResultForClients['panel_crops'] = [];

      panelCropsInput.forEach((crop, index) => {
        const panelNumber = crop.panel_number ?? `P${index + 1}`;
        const status = crop.status ?? 'UNKNOWN';
        const hasDust = crop.has_dust ?? status === 'DUSTY';
        let webPath: string | null = null;

        if (crop.image_b64) {
          const cropFileName = `panel_${sanitizeFilePart(panelNumber)}_cap${safeCaptureId}_${timestampSuffix}.jpg`;
          const cropFilePath = path.join(PANEL_CROPS_DIR, cropFileName);
          fs.writeFileSync(cropFilePath, decodeBase64Image(crop.image_b64));
          webPath = `/api/pi-images/panel_crops/${cropFileName}`;
        }

        panelCropsForClients.push({
          panel_number: panelNumber,
          status,
          has_dust: hasDust,
          web_path: webPath,
        });
      });

      const dustyPanelCount =
        data.rgb_stats?.dusty ?? panelCropsForClients.filter((crop) => crop.status === 'DUSTY').length;
      const cleanPanelCount =
        data.rgb_stats?.clean ?? panelCropsForClients.filter((crop) => crop.status === 'CLEAN').length;
      const totalPanels = data.rgb_stats?.total ?? panelCropsForClients.length;
      const severity =
        data.thermal?.severity ?? getSeverityFromHealthScore(healthScore);
      const riskScore =
        data.thermal?.risk_score ?? Math.max(0, Math.min(100, Math.round(100 - healthScore)));
      const thermalMinTemp = data.thermal?.min_temp ?? null;
      const thermalMaxTemp = data.thermal?.max_temp ?? null;
      const thermalMeanTemp = data.thermal?.mean_temp ?? null;
      const thermalDelta = data.thermal?.delta ?? null;

      const deviceIdValue = data.device_id ?? 'raspberry-pi';
      const duplicateSince = new Date(receivedAt.getTime() - SCAN_DUPLICATE_WINDOW_SECONDS * 1000);
      const recentCandidate = await prisma.solarScan.findFirst({
        where: {
          deviceId: deviceIdValue,
          timestamp: { gte: duplicateSince },
        },
        include: { panelDetections: true },
        orderBy: { timestamp: 'desc' },
      });

      const incomingKey = {
        deviceId: deviceIdValue,
        totalPanels,
        dustyPanelCount,
        cleanPanelCount,
        thermalMeanTemp,
        thermalDelta,
      };

      let savedScan;

      if (recentCandidate && isLikelyDuplicatePiScan(recentCandidate, incomingKey)) {
        savedScan = await prisma.solarScan.update({
          where: { id: recentCandidate.id },
          data: {
            timestamp: receivedAt,
            priority: priority || recentCandidate.priority || 'NORMAL',
            status: recentCandidate.status || 'pending',
            riskScore: riskScore ?? recentCandidate.riskScore,
            severity: severity ?? recentCandidate.severity,
            thermalMinTemp: thermalMinTemp ?? recentCandidate.thermalMinTemp,
            thermalMaxTemp: thermalMaxTemp ?? recentCandidate.thermalMaxTemp,
            thermalMeanTemp: thermalMeanTemp ?? recentCandidate.thermalMeanTemp,
            thermalDelta: thermalDelta ?? recentCandidate.thermalDelta,
            thermalImageUrl: thermalImageDataUrl || thermalImageWebPath || recentCandidate.thermalImageUrl,
            rgbImageUrl: mainImageDataUrl || mainImageWebPath || recentCandidate.rgbImageUrl,
            dustyPanelCount,
            cleanPanelCount,
            totalPanels,
            deviceName: data.device_name ?? recentCandidate.deviceName ?? 'Raspberry Pi Scanner',
            updatedAt: new Date(),
          },
        });
        await prisma.panelDetection.deleteMany({ where: { scanId: savedScan.id } });
        if (panelCropsForClients.length > 0) {
          await prisma.panelDetection.createMany({
            data: panelCropsForClients.map((crop) => ({
              scanId: savedScan.id,
              panelNumber: crop.panel_number,
              status: crop.status,
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 0,
              cropImageUrl: crop.web_path,
              faultType: crop.has_dust ? 'dust' : null,
              confidence: null,
            })),
          });
        }
      } else {
        savedScan = await prisma.solarScan.create({
          data: {
            // Use server receive time to avoid timezone skew from Pi-local timestamps.
            timestamp: receivedAt,
            priority,
            status: 'pending',
            riskScore,
            severity,
            thermalMinTemp,
            thermalMaxTemp,
            thermalMeanTemp,
            thermalDelta,
            thermalImageUrl: thermalImageDataUrl || thermalImageWebPath,
            rgbImageUrl: mainImageDataUrl || mainImageWebPath,
            dustyPanelCount,
            cleanPanelCount,
            totalPanels,
            deviceId: deviceIdValue,
            deviceName: data.device_name ?? 'Raspberry Pi Scanner',
            panelDetections: {
              create: panelCropsForClients.map((crop) => ({
                panelNumber: crop.panel_number,
                status: crop.status,
                x1: 0,
                y1: 0,
                x2: 0,
                y2: 0,
                cropImageUrl: crop.web_path,
                faultType: crop.has_dust ? 'dust' : null,
                confidence: null,
              })),
            },
          },
        });
      }

      const resultForClients: PiResultForClients = {
        id: savedScan.id,
        capture_id: captureId,
        timestamp: receivedAt.toISOString(),
        received_at: receivedAt.toISOString(),
        report: {
          health_score: healthScore,
          priority,
          recommendation: data.report.recommendation ?? '',
          timeframe: data.report.timeframe ?? '',
          summary: data.report.summary ?? '',
          root_cause: data.report.root_cause ?? '',
          impact_assessment: data.report.impact_assessment ?? '',
        },
        rgb_stats: {
          total: totalPanels,
          clean: cleanPanelCount,
          dusty: dustyPanelCount,
        },
        main_image_web: mainImageDataUrl || mainImageWebPath,
        thermal_image_web: thermalImageDataUrl || thermalImageWebPath,
        thermal: {
          min_temp: thermalMinTemp,
          max_temp: thermalMaxTemp,
          mean_temp: thermalMeanTemp,
          delta: thermalDelta,
          risk_score: riskScore,
          severity,
        },
        panel_crops: panelCropsForClients,
      };

      piResults.unshift(resultForClients);
      if (piResults.length > MAX_PI_RESULTS) {
        piResults.length = MAX_PI_RESULTS;
      }

      io.emit('new_result', resultForClients);
      io.emit('new-solar-scan', { scanId: savedScan.id, source: 'pi_analysis_result' });

      // =====================================================
      // AUTOMATIC TICKET CREATION & TECHNICIAN ASSIGNMENT
      // Trigger automation for medium+ severity, dusty panels, or faulty panels
      // =====================================================
      const AUTO_TICKET_THRESHOLD = 3;
      const normalizedSeverity = normalizeSeverity(severity); // This converts MODERATE->medium, CRITICAL->critical, etc.
      const hasFaulty = panelCropsForClients.some((crop) => crop.status === 'FAULTY');
      const shouldAutoCreateTicket =
        normalizedSeverity === 'critical' ||
        normalizedSeverity === 'high' ||
        normalizedSeverity === 'medium' ||
        dustyPanelCount >= AUTO_TICKET_THRESHOLD ||
        hasFaulty;

      if (shouldAutoCreateTicket) {
        // Update scan status to processing
        await prisma.solarScan.update({
          where: { id: savedScan.id },
          data: { status: 'processing', updatedAt: new Date() }
        });
        
        // Schedule automation to run after 3 seconds
        setTimeout(async () => {
          try {
            // Find a panel to associate with this scan
            const panel = await prisma.solarPanel.findFirst({
              where: { status: { not: 'offline' } },
              orderBy: { lastChecked: 'desc' }
            });

            if (panel) {
              const incidentId = generateIncidentId();
              const derivedFaultType = hasFaulty
                ? 'thermal_fault'
                : dustyPanelCount >= AUTO_TICKET_THRESHOLD
                ? 'dust_accumulation'
                : 'scan_anomaly';

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
                  where: { id: savedScan.id },
                  data: { status: 'processed', updatedAt: new Date() }
                });
                
                // Delete the scan since we don't need a new ticket
                await prisma.solarScan.delete({
                  where: { id: savedScan.id }
                });
                return;
              }

              const automationResult = await createFaultTicketAndAssignment({
                incidentId,
                panelId: panel.id,
                faultType: derivedFaultType,
                severity: normalizedSeverity,
                detectedAt: savedScan.timestamp,
                description: `Automated scan processing - ${
                  hasFaulty
                    ? 'thermal fault detected'
                    : 'dust accumulation: ' + dustyPanelCount + ' panels'
                }`,
                aiConfidence: Math.max(0, Math.min(100, riskScore)),
                aiAnalysis: `Scan severity: ${severity}; dusty panels: ${dustyPanelCount}; faulty detections: ${
                  hasFaulty ? 'yes' : 'no'
                }`,
                recommendedAction: hasFaulty
                  ? 'Immediate technician dispatch for thermal fault verification'
                  : 'Schedule panel cleaning and technician validation',
                droneImageUrl: mainImageWebPath || undefined,
                thermalImageUrl: thermalImageWebPath || undefined,
                locationX: 0,
                locationY: 0,
                scanId: savedScan.id,
              });

              // Update scan status to processed
              await prisma.solarScan.update({
                where: { id: savedScan.id },
                data: { status: 'processed', updatedAt: new Date() }
              });

              console.log(
                '✅ Automation triggered (3s delay): Ticket',
                automationResult.ticketNumber,
                'assigned to technician'
              );
              
              // Delete the scan after ticket creation - it now lives in tickets only
              await prisma.solarScan.delete({
                where: { id: savedScan.id }
              });
              console.log('🗑️ Scan removed from scans list - now visible in tickets only');
            } else {
              console.log('⚠️ No panel found for automation - scan saved but no ticket created');
            }
          } catch (autoError) {
            console.error('❌ Automation error:', autoError);
          }
        }, 3000); // 3 second delay
      }

      const response = {
        success: true,
        scanId: savedScan.id,
      };
      socket.emit('pi-analysis-received', response);
      if (ack) ack(response);

      console.log('Stored pi_analysis_result:', savedScan.id);
    } catch (error) {
      console.error('Error processing pi_analysis_result:', error);
      const response = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      socket.emit('pi-analysis-received', response);
      if (ack) ack(response);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
httpServer.listen(Number(PORT), HOST, () => {
  console.log(`Solar Guardian API running on http://localhost:${PORT}`);
  console.log(`Solar Guardian API listening on ${HOST}:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('Socket.io enabled for real-time data');
});

export default app;
export { io };
