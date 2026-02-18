// Solar Farm Data Types

export type PanelStatus = 'healthy' | 'warning' | 'fault' | 'offline';

export interface Alert {
  id: string;
  alertId?: string | null;  // ALERT ID-AK-001 format
  zone: string;
  row: number;
  status: 'warning' | 'fault';
  message?: string;
  dismissed: boolean;
  scanId?: string;
  ticketId?: string;
  createdAt: string;
  dismissedAt?: string;
}

export interface SolarPanel {
  id: string;
  row: number;
  column: number;
  zone: string;
  status: PanelStatus;
  efficiency: number; // 0-100%
  currentOutput: number; // Watts
  maxOutput: number; // Watts
  temperature: number; // Celsius
  lastChecked: Date;
  installDate: Date;
  inverterGroup: string;
  stringId: string;
}

export interface FaultDetection {
  id: string;
  panelId: string;
  panelRow?: number; // Row number from the panel
  detectedAt: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  faultType: string;
  droneImageUrl?: string; // Optional - for initial alerts this may be empty
  thermalImageUrl?: string; // Optional - for initial alerts this may be empty
  aiConfidence: number; // 0-100%
  aiAnalysis: string;
  recommendedAction: string;
  location: {
    x: number; // percentage position on panel
    y: number;
  };
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  panelId: string;
  faultId: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  assignedTechnicianId?: string;
  description: string;
  faultType: string;
  droneImageUrl: string;
  thermalImageUrl: string;
  aiAnalysis: string;
  recommendedAction: string;
  resolutionNotes?: string;
  resolutionCause?: string;
  resolutionImageUrl?: string;
  notes: TicketNote[];
}

export interface TicketNote {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  status: 'available' | 'busy' | 'offline';
  skills: string[];
  activeTickets: number;
  resolvedTickets: number;
  avgResolutionTime: number; // hours
}

export interface WeatherData {
  id?: string;
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'partly-cloudy' | 'rainy' | 'stormy';
  humidity: number;
  sunlightIntensity: number; // 0-100%
  recordedAt?: string;
  windSpeed?: number;
  uvIndex?: number;
  forecast: WeatherForecast[];
}

export interface WeatherForecast {
  hour: number;
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'partly-cloudy' | 'rainy' | 'stormy';
  sunlightIntensity: number;
}

export interface PowerGeneration {
  timestamp: Date;
  value: number; // kW
}

export interface DashboardMetrics {
  totalPanels: number;
  healthyPanels: number;
  warningPanels: number;
  faultPanels: number;
  offlinePanels: number;
  currentGeneration: number; // kW
  maxCapacity: number; // kW
  efficiency: number; // percentage
  availableTechnicians: number;
  openTickets: number;
}

export interface AnalyticsData {
  powerGeneration: {
    daily: PowerGeneration[];
    weekly: PowerGeneration[];
    monthly: PowerGeneration[];
  };
  efficiency: {
    byZone: { zone: string; efficiency: number }[];
    trend: { date: Date; efficiency: number }[];
  };
  environmental: {
    carbonOffset: number; // tons
    treesEquivalent: number;
    homesPowered: number;
  };
  faultStatistics: {
    byType: { type: string; count: number }[];
    byMonth: { month: string; count: number }[];
    avgResolutionTime: number; // hours
  };
}

// =====================================================
// RASPBERRY PI SOLAR SCAN TYPES
// =====================================================

export type ScanSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
export type ScanStatus = 'pending' | 'processed' | 'archived';
export type PanelDetectionStatus = 'CLEAN' | 'DUSTY' | 'FAULTY' | 'UNKNOWN';

export interface ThermalData {
  minTemp: number;
  maxTemp: number;
  meanTemp: number;
  delta: number;
  riskScore: number;
  severity: ScanSeverity;
  timestamp: string;
}

export interface PanelDetection {
  id: string;
  scanId: string;
  panelNumber: string;
  status: PanelDetectionStatus;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cropImageUrl: string | null;
  faultType: string | null;
  confidence: number | null;
  solarPanelId: string | null;
  createdAt: string;
}

export interface SolarScan {
  id: string;
  backendId?: string;
  timestamp: string;
  priority: 'HIGH' | 'MEDIUM' | 'NORMAL';
  status: ScanStatus;
  
  // Thermal analysis data
  thermalMinTemp: number | null;
  thermalMaxTemp: number | null;
  thermalMeanTemp: number | null;
  thermalDelta: number | null;
  riskScore: number | null;
  severity: ScanSeverity | null;
  thermalImageUrl: string | null;
  rgbImageUrl?: string | null;
  
  // Summary counts
  dustyPanelCount: number;
  cleanPanelCount: number;
  totalPanels: number;
  
  // Source device info
  deviceId: string | null;
  deviceName: string | null;
  
  // Relations
  panelDetections: PanelDetection[];

  // Optional live Pi report fields (from pi_analysis_result payload)
  piReport?: PiReport;
  thermalFault?: string | null;
  baselineDelta?: number | null;
  
  createdAt: string;
  updatedAt: string;
}

export interface SolarScanStats {
  totalScans: number;
  pendingScans: number;
  processedScans: number;
  criticalScans: number;
  highRiskScans: number;
  avgThermalDelta: number;
}

// =====================================================
// RASPBERRY PI RECEIVER TYPES
// =====================================================

export interface PiReport {
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
}

export interface PiRgbStats {
  total: number;
  clean: number;
  dusty: number;
}

export interface PiPanelCrop {
  panel_number: string;
  status: 'CLEAN' | 'DUSTY' | 'FAULTY' | 'UNKNOWN';
  has_dust: boolean;
  image_b64?: string;
  web_path?: string | null;
}

export interface PiAnalysisResult {
  id?: string;
  capture_id: string;
  timestamp: string;
  received_at?: string;
  report: PiReport;
  rgb_stats: PiRgbStats;
  frame_b64?: string;
  main_image_web?: string | null;
  thermal_b64?: string;
  thermal_image_web?: string | null;
  thermal?: {
    fault?: string | null;
    min_temp?: number | null;
    max_temp?: number | null;
    mean_temp?: number | null;
    delta?: number | null;
    risk_score?: number | null;
    severity?: ScanSeverity | null;
    baseline_delta?: number | null;
  };
  thermal_stats?: {
    fault?: string | null;
    min_temp?: number | null;
    max_temp?: number | null;
    mean_temp?: number | null;
    delta?: number | null;
    risk_score?: number | null;
    severity?: ScanSeverity | null;
    baseline_delta?: number | null;
  };
  panel_crops: PiPanelCrop[];
}

// Convert PiAnalysisResult to SolarScan format
export function convertPiResultToSolarScan(piResult: PiAnalysisResult): SolarScan {
  const cleanCount = piResult.rgb_stats.clean;
  const dustyCount = piResult.rgb_stats.dusty;
  const totalPanels = piResult.rgb_stats.total;
  
  // Determine severity based on health score
  let severity: ScanSeverity = 'LOW';
  if (piResult.report.health_score < 30) severity = 'CRITICAL';
  else if (piResult.report.health_score < 50) severity = 'HIGH';
  else if (piResult.report.health_score < 75) severity = 'MODERATE';
  
  const thermal = piResult.thermal_stats ?? piResult.thermal;
  const thermalRisk = thermal?.risk_score ?? (100 - piResult.report.health_score);
  return {
    id: `pi-${piResult.capture_id}`,
    backendId: piResult.id,
    timestamp: piResult.received_at || piResult.timestamp,
    priority: piResult.report.priority,
    status: 'pending',
    thermalMinTemp: thermal?.min_temp ?? null,
    thermalMaxTemp: thermal?.max_temp ?? null,
    thermalMeanTemp: thermal?.mean_temp ?? null,
    thermalDelta: thermal?.delta ?? null,
    riskScore: thermalRisk,
    severity: thermal?.severity ?? severity,
    thermalImageUrl: piResult.thermal_image_web || null,
    rgbImageUrl: piResult.main_image_web || null,
    dustyPanelCount: dustyCount,
    cleanPanelCount: cleanCount,
    totalPanels: totalPanels,
    deviceId: 'raspberry-pi',
    deviceName: 'Raspberry Pi Scanner',
    panelDetections: piResult.panel_crops.map((crop, index) => ({
      id: `det-${piResult.capture_id}-${index}`,
      scanId: `pi-${piResult.capture_id}`,
      panelNumber: crop.panel_number,
      status: crop.status,
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      cropImageUrl: crop.web_path ?? null,
      faultType: crop.has_dust ? 'dust' : null,
      confidence: null,
      solarPanelId: null,
      createdAt: piResult.received_at || new Date().toISOString(),
    })),
    piReport: piResult.report,
    thermalFault: thermal?.fault ?? null,
    baselineDelta: thermal?.baseline_delta ?? null,
    createdAt: piResult.received_at || new Date().toISOString(),
    updatedAt: piResult.received_at || new Date().toISOString(),
  };
}
