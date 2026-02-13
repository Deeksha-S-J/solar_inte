// Solar Farm Data Types

export type PanelStatus = 'healthy' | 'warning' | 'fault' | 'offline';

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
  detectedAt: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  faultType: string;
  droneImageUrl: string;
  thermalImageUrl: string;
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
  carbonSaved: number; // kg
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
