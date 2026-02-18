import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import prisma from './db.js';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Routes
import panelsRouter from './routes/panels.js';
import techniciansRouter from './routes/technicians.js';
import ticketsRouter from './routes/tickets.js';
import faultsRouter from './routes/faults.js';
import weatherRouter from './routes/weather.js';
import analyticsRouter from './routes/analytics.js';
import solarScansRouter from './routes/solarScans.js';

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
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'solar-images';
const USE_SUPABASE_STORAGE = process.env.USE_SUPABASE_STORAGE !== 'false';

const supabase =
  USE_SUPABASE_STORAGE && SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

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
    source?: string;
    baseline_aware?: boolean;
    deviation_from_baseline?: string;
    genai_insights?: string;
  };
  rgb_stats?: {
    total?: number;
    clean?: number;
    dusty?: number;
  };
  frame_b64?: string;
  thermal_b64?: string;
  thermal?: {
    fault?: string;
    min_temp?: number;
    max_temp?: number;
    mean_temp?: number;
    delta?: number;
    risk_score?: number;
    severity?: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
    baseline_delta?: number | null;
  };
  thermal_stats?: {
    fault?: string;
    min_temp?: number;
    max_temp?: number;
    mean_temp?: number;
    delta?: number;
    risk_score?: number;
    severity?: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
    baseline_delta?: number | null;
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
    source?: string;
    baseline_aware?: boolean;
    deviation_from_baseline?: string;
    genai_insights?: string;
  };
  rgb_stats: {
    total: number;
    clean: number;
    dusty: number;
  };
  main_image_web: string | null;
  thermal_image_web: string | null;
  thermal: {
    fault: string | null;
    min_temp: number | null;
    max_temp: number | null;
    mean_temp: number | null;
    delta: number | null;
    risk_score: number | null;
    severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | null;
    baseline_delta: number | null;
  };
  thermal_stats: {
    fault: string | null;
    min_temp: number | null;
    max_temp: number | null;
    mean_temp: number | null;
    delta: number | null;
    risk_score: number | null;
    severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | null;
    baseline_delta: number | null;
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

const uploadBase64ToSupabase = async (
  rawData: string,
  folder: 'rgb' | 'thermal',
  fileName: string
): Promise<string | null> => {
  if (!supabase) return null;

  try {
    const buffer = decodeBase64Image(rawData);
    const objectPath = `${folder}/${fileName}`;

    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(objectPath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error(`Supabase upload failed [${objectPath}]:`, error.message);
      return null;
    }

    const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(objectPath);
    return data?.publicUrl || null;
  } catch (error) {
    console.error('Supabase upload exception:', error);
    return null;
  }
};

const getSeverityFromHealthScore = (healthScore: number): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' => {
  if (healthScore < 30) return 'CRITICAL';
  if (healthScore < 50) return 'HIGH';
  if (healthScore < 75) return 'MODERATE';
  return 'LOW';
};

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/panels', panelsRouter);
app.use('/api/technicians', techniciansRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/faults', faultsRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/solar-scans', solarScansRouter);

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
      const ticketNumber = `TKT-${Date.now()}`;
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

      if (data.frame_b64) {
        const captureFileName = `capture_${safeCaptureId}_${timestampSuffix}.jpg`;
        mainImageWebPath = await uploadBase64ToSupabase(data.frame_b64, 'rgb', captureFileName);

        if (!mainImageWebPath) {
          const captureFilePath = path.join(CAPTURES_DIR, captureFileName);
          fs.writeFileSync(captureFilePath, decodeBase64Image(data.frame_b64));
          mainImageWebPath = `/api/pi-images/captures/${captureFileName}`;
        }
      }

      if (data.thermal_b64) {
        const thermalFileName = `thermal_${safeCaptureId}_${timestampSuffix}.jpg`;
        thermalImageWebPath = await uploadBase64ToSupabase(data.thermal_b64, 'thermal', thermalFileName);

        if (!thermalImageWebPath) {
          const thermalFilePath = path.join(CAPTURES_DIR, thermalFileName);
          fs.writeFileSync(thermalFilePath, decodeBase64Image(data.thermal_b64));
          thermalImageWebPath = `/api/pi-images/captures/${thermalFileName}`;
        }
      }

      const panelCropsInput = Array.isArray(data.panel_crops) ? data.panel_crops : [];
      const panelCropsForClients: PiResultForClients['panel_crops'] = [];

      for (const [index, crop] of panelCropsInput.entries()) {
        const panelNumber = crop.panel_number ?? `P${index + 1}`;
        const status = crop.status ?? 'UNKNOWN';
        const hasDust = crop.has_dust ?? status === 'DUSTY';
        let webPath: string | null = null;

        if (crop.image_b64) {
          const cropFileName = `panel_${sanitizeFilePart(panelNumber)}_cap${safeCaptureId}_${timestampSuffix}.jpg`;
          webPath = await uploadBase64ToSupabase(crop.image_b64, 'rgb', cropFileName);

          if (!webPath) {
            const cropFilePath = path.join(PANEL_CROPS_DIR, cropFileName);
            fs.writeFileSync(cropFilePath, decodeBase64Image(crop.image_b64));
            webPath = `/api/pi-images/panel_crops/${cropFileName}`;
          }
        }

        panelCropsForClients.push({
          panel_number: panelNumber,
          status,
          has_dust: hasDust,
          web_path: webPath,
        });
      }

      const dustyPanelCount =
        data.rgb_stats?.dusty ?? panelCropsForClients.filter((crop) => crop.status === 'DUSTY').length;
      const cleanPanelCount =
        data.rgb_stats?.clean ?? panelCropsForClients.filter((crop) => crop.status === 'CLEAN').length;
      const totalPanels = data.rgb_stats?.total ?? panelCropsForClients.length;
      const thermalData = data.thermal_stats ?? data.thermal;
      const severity = thermalData?.severity ?? getSeverityFromHealthScore(healthScore);
      const riskScore =
        thermalData?.risk_score ?? Math.max(0, Math.min(100, Math.round(100 - healthScore)));
      const thermalFault = thermalData?.fault ?? null;
      const thermalMinTemp = thermalData?.min_temp ?? null;
      const thermalMaxTemp = thermalData?.max_temp ?? null;
      const thermalMeanTemp = thermalData?.mean_temp ?? null;
      const thermalDelta = thermalData?.delta ?? null;
      const thermalBaselineDelta = thermalData?.baseline_delta ?? null;

      const savedScan = await prisma.solarScan.create({
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
          thermalImageUrl: thermalImageWebPath,
          rgbImageUrl: mainImageWebPath,
          dustyPanelCount,
          cleanPanelCount,
          totalPanels,
          deviceId: data.device_id ?? 'raspberry-pi',
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
          source: data.report.source ?? '',
          baseline_aware: data.report.baseline_aware ?? false,
          deviation_from_baseline: data.report.deviation_from_baseline ?? '',
          genai_insights: data.report.genai_insights ?? '',
        },
        rgb_stats: {
          total: totalPanels,
          clean: cleanPanelCount,
          dusty: dustyPanelCount,
        },
        main_image_web: mainImageWebPath,
        thermal_image_web: thermalImageWebPath,
        thermal: {
          fault: thermalFault,
          min_temp: thermalMinTemp,
          max_temp: thermalMaxTemp,
          mean_temp: thermalMeanTemp,
          delta: thermalDelta,
          risk_score: riskScore,
          severity,
          baseline_delta: thermalBaselineDelta,
        },
        thermal_stats: {
          fault: thermalFault,
          min_temp: thermalMinTemp,
          max_temp: thermalMaxTemp,
          mean_temp: thermalMeanTemp,
          delta: thermalDelta,
          risk_score: riskScore,
          severity,
          baseline_delta: thermalBaselineDelta,
        },
        panel_crops: panelCropsForClients,
      };

      piResults.unshift(resultForClients);
      if (piResults.length > MAX_PI_RESULTS) {
        piResults.length = MAX_PI_RESULTS;
      }

      io.emit('new_result', resultForClients);
      io.emit('new-solar-scan', { scanId: savedScan.id, source: 'pi_analysis_result' });

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
