// Solar Guardian API Client
// Replace mock data with real API calls
// Uses relative paths - Vite proxy handles forwarding to backend

const API_BASE = '';

// Types
export interface Panel {
  id: string;
  panelId: string;
  row: number;
  column: number;
  zone: { id: string; name: string };
  zoneId: string;
  status: 'healthy' | 'warning' | 'fault' | 'offline';
  efficiency: number;
  currentOutput: number;
  maxOutput: number;
  temperature: number;
  lastChecked: string;
  installDate: string;
  inverterGroup: string;
  stringId: string;
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  status: 'available' | 'busy' | 'offline';
  skills: string[];
  activeTickets: number;
  resolvedTickets: number;
  avgResolutionTime: number;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  panelId?: string;
  faultId?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  assignedTechnicianId?: string;
  assignedTechnician?: Technician;
  description: string;
  faultType: string;
  droneImageUrl?: string;
  thermalImageUrl?: string;
  aiAnalysis: string;
  recommendedAction: string;
  resolutionNotes?: string;
  resolutionCause?: string;
  notes: TicketNote[];
}

export interface TicketNote {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface WeatherData {
  id: string;
  temperature: number;
  condition: string;
  humidity: number;
  sunlightIntensity: number;
  recordedAt: string;
}

export interface DashboardMetrics {
  totalPanels: number;
  healthyPanels: number;
  warningPanels: number;
  faultPanels: number;
  offlinePanels: number;
  currentGeneration: number;
  maxCapacity: number;
  efficiency: number;
  carbonSaved: number;
  availableTechnicians: number;
  openTickets: number;
}

export interface PowerGeneration {
  id: string;
  timestamp: string;
  value: number;
}

// Helper function for API calls
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Panels API
export const panelsApi = {
  getAll: (params?: { status?: string; zone?: string; search?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return apiFetch<Panel[]>(`/api/panels${query ? `?${query}` : ''}`);
  },
  
  getById: (id: string) => apiFetch<Panel>(`/api/panels/${id}`),
  
  getStats: () => apiFetch<DashboardMetrics>('/api/panels/stats'),
  
  getByZone: (zoneName: string) => apiFetch<Panel[]>(`/api/panels/zone/${zoneName}`),
};

// Technicians API
export const techniciansApi = {
  getAll: () => apiFetch<Technician[]>('/api/technicians'),
  
  getById: (id: string) => apiFetch<Technician>(`/api/technicians/${id}`),
  
  getAvailable: () => apiFetch<Technician[]>('/api/technicians/status/available'),
  
  updateStatus: (id: string, status: Technician['status']) =>
    apiFetch<Technician>(`/api/technicians/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// Tickets API
export const ticketsApi = {
  getAll: (params?: { status?: string; priority?: string; assignedTo?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return apiFetch<Ticket[]>(`/api/tickets${query ? `?${query}` : ''}`);
  },
  
  getById: (id: string) => apiFetch<Ticket>(`/api/tickets/${id}`),
  
  create: (data: Partial<Ticket>) =>
    apiFetch<Ticket>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: Partial<Ticket>) =>
    apiFetch<Ticket>(`/api/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  addNote: (ticketId: string, authorId: string, content: string) =>
    apiFetch<TicketNote>(`/api/tickets/${ticketId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ authorId, content }),
    }),
  
  getStats: () =>
    apiFetch<{ open: number; inProgress: number; resolved: number; critical: number }>(
      '/api/tickets/stats/overview'
    ),
};

// Faults API
export const faultsApi = {
  getAll: (params?: { severity?: string; panelId?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return apiFetch<any[]>(`/api/faults${query ? `?${query}` : ''}`);
  },
  
  getById: (id: string) => apiFetch<any>(`/api/faults/${id}`),
  
  getStats: () => apiFetch<any>('/api/faults/stats/overview'),
  
  getByZone: (zoneName: string) => apiFetch<any[]>(`/api/faults/zone/${zoneName}`),
};

// Weather API
export const weatherApi = {
  getCurrent: () => apiFetch<WeatherData>('/api/weather/current'),
  
  getHistory: (days?: number) => apiFetch<WeatherData[]>(`/api/weather/history?days=${days || 7}`),
  
  getForecast: () => apiFetch<any[]>('/api/weather/forecast'),
  
  record: (data: Partial<WeatherData>) =>
    apiFetch<WeatherData>('/api/weather', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Analytics API
export const analyticsApi = {
  getPowerGeneration: (period: 'daily' | 'weekly' | 'monthly' = 'weekly') =>
    apiFetch<PowerGeneration[]>(`/api/analytics/power?period=${period}`),
  
  getEfficiencyByZone: () =>
    apiFetch<{ zone: string; efficiency: number; panelCount: number }[]>(
      '/api/analytics/efficiency/by-zone'
    ),
  
  getEnvironmental: () =>
    apiFetch<{
      totalPowerGenerated: number;
      carbonOffset: number;
      treesEquivalent: number;
      homesPowered: number;
    }>('/api/analytics/environmental'),
  
  getFaultStats: (months?: number) =>
    apiFetch<any>(`/api/analytics/faults?months=${months || 6}`),
  
  getDashboard: () => apiFetch<DashboardMetrics>('/api/analytics/dashboard'),
};

// Health check
export const healthCheck = () => apiFetch<{ status: string; timestamp: string }>('/health');

export default {
  panels: panelsApi,
  technicians: techniciansApi,
  tickets: ticketsApi,
  faults: faultsApi,
  weather: weatherApi,
  analytics: analyticsApi,
  health: healthCheck,
};

