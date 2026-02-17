import { useEffect, useState, useRef } from 'react';
import {
  Sun,
  Zap,
  Gauge,
  Users,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { WeatherWidget } from '@/components/dashboard/WeatherWidget';
import { PowerChart } from '@/components/dashboard/PowerChart';
import { PanelHealthOverview } from '@/components/dashboard/PanelHealthOverview';
import type { DashboardMetrics } from '@/lib/api';
import type { WeatherData } from '@/types/solar';
import { Button } from '@/components/ui/button';

// Default sample metrics when API is unavailable
const defaultMetrics: DashboardMetrics = {
  totalPanels: 0,
  healthyPanels: 0,
  warningPanels: 0,
  faultPanels: 0,
  offlinePanels: 0,
  currentGeneration: 0,
  maxCapacity: 0,
  efficiency: 0,
  availableTechnicians: 0,
  openTickets: 0,
};

// Default sample weather when API is unavailable
const defaultWeather: WeatherData = {
  id: 'sample',
  temperature: 28,
  condition: 'sunny',
  humidity: 45,
  sunlightIntensity: 85,
  recordedAt: new Date().toISOString(),
  windSpeed: 12,
  uvIndex: 8,
  forecast: [
    { hour: 12, temperature: 28, condition: 'sunny', sunlightIntensity: 80 },
    { hour: 15, temperature: 30, condition: 'sunny', sunlightIntensity: 85 },
    { hour: 18, temperature: 26, condition: 'partly-cloudy', sunlightIntensity: 60 },
  ],
};

// Helper to create date for today at specific hour
const createDate = (hour: number) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date;
};

// Helper to create date for day of week
const createWeekDate = (dayOffset: number) => {
  const date = new Date();
  date.setDate(date.getDate() - date.getDay() + dayOffset);
  date.setHours(12, 0, 0, 0);
  return date;
};

// Helper to create date for month
const createMonthDate = (month: number) => {
  const date = new Date();
  date.setMonth(month, 15);
  date.setHours(12, 0, 0, 0);
  return date;
};

interface PowerPoint {
  timestamp: string | Date;
  value: number;
}

interface DashboardAnalytics {
  powerGeneration: {
    daily: PowerPoint[];
    weekly: PowerPoint[];
    monthly: PowerPoint[];
  };
}

// Default sample analytics when API is unavailable
const defaultAnalytics: DashboardAnalytics = {
  powerGeneration: {
    daily: [
      { timestamp: createDate(6), value: 0 },
      { timestamp: createDate(9), value: 15 },
      { timestamp: createDate(12), value: 42 },
      { timestamp: createDate(15), value: 48 },
      { timestamp: createDate(18), value: 35 },
      { timestamp: createDate(21), value: 5 },
    ],
    weekly: [
      { timestamp: createWeekDate(1), value: 180 },
      { timestamp: createWeekDate(2), value: 195 },
      { timestamp: createWeekDate(3), value: 210 },
      { timestamp: createWeekDate(4), value: 185 },
      { timestamp: createWeekDate(5), value: 200 },
      { timestamp: createWeekDate(6), value: 175 },
      { timestamp: createWeekDate(7), value: 190 },
    ],
    monthly: [
      { timestamp: createMonthDate(0), value: 5200 },
      { timestamp: createMonthDate(1), value: 4800 },
      { timestamp: createMonthDate(2), value: 6100 },
      { timestamp: createMonthDate(3), value: 5800 },
      { timestamp: createMonthDate(4), value: 6500 },
      { timestamp: createMonthDate(5), value: 6200 },
    ],
  },
};

interface DashboardData {
  metrics: DashboardMetrics;
  weather: WeatherData;
  openMeteoWeather: WeatherData | null;
  analytics: DashboardAnalytics;
}

interface LiveStatusData {
  totalPanels: number;
  healthyPanels: number;
  warningPanels: number;
  faultPanels: number;
  offlinePanels: number;
  currentGenerationKw: number;
  avgEfficiency: number;
  mappedDevices: number;
  reportingDevices: number;
  onlineDevices: number;
  latestDeviceSeenAt: string | null;
  averageVoltage: number;
  averageCurrentMa: number;
  totalPowerMw: number;
  panelGenerationKw?: number;
  panelAvgEfficiency?: number;
  devices: LiveDeviceStatus[];
  powerHistory30s: LivePowerPoint[];
}

interface LiveDeviceStatus {
  deviceId: string;
  label: string;
  online: boolean;
  status: 'healthy' | 'warning' | 'fault' | 'offline';
  lastSeenAt: string | null;
  staleSeconds: number | null;
  voltage: number | null;
  currentMa: number | null;
  powerMw: number | null;
}

interface LivePowerPoint {
  timestamp: string;
  totalPowerKw: number;
  deviceCount: number;
}

const defaultLiveStatus: LiveStatusData = {
  totalPanels: 0,
  healthyPanels: 0,
  warningPanels: 0,
  faultPanels: 0,
  offlinePanels: 0,
  currentGenerationKw: 0,
  avgEfficiency: 0,
  mappedDevices: 0,
  reportingDevices: 0,
  onlineDevices: 0,
  latestDeviceSeenAt: null,
  averageVoltage: 0,
  averageCurrentMa: 0,
  totalPowerMw: 0,
  devices: [],
  powerHistory30s: [],
};

// Helper function to add timeout to fetch requests
function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  // Add timestamp to prevent caching
  const urlWithTimestamp = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout: ${url}`));
    }, timeoutMs);

    fetch(urlWithTimestamp, { cache: 'no-store' })
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export default function Dashboard() {
  console.log('🚀🚀🚀 DASHBOARD COMPONENT LOADED - NEW VERSION 2025 🚀🚀🚀');
  const [data, setData] = useState<DashboardData>({
    metrics: defaultMetrics,
    weather: defaultWeather,
    openMeteoWeather: null,
    analytics: defaultAnalytics,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatusData>(defaultLiveStatus);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function fetchData(showLoader: boolean = false) {
    console.log('🔥🔥🔥 FETCH DATA CALLED - STARTING TO FETCH REAL DATA 🔥🔥🔥');
    if (!mountedRef.current) return;
    
    if (showLoader) {
      setLoading(true);
    }
    setError(null);

    try {
      console.log('📊 [Dashboard] Starting data fetch...');
      
      // Set a timeout for the entire operation
      const totalTimeout = 15000;
      const overallTimeoutId = setTimeout(() => {
        if (mountedRef.current) {
          console.warn('[Dashboard] Data fetch timeout');
          setError('Request timed out - using cached/default values');
        }
      }, totalTimeout);

      try {
        console.log('📊 [Dashboard] Fetching metrics from /api/analytics/dashboard');
        // Fetch all data with individual timeouts
        const [metricsRes, weatherRes, openMeteoRes, powerDailyRes, powerWeeklyRes, powerMonthlyRes, liveStatusRes] = await Promise.all([
          fetchWithTimeout('/api/analytics/dashboard', 10000).catch(e => {
            console.error('❌ Metrics fetch failed:', e);
            return { ok: false } as Response;
          }),
          fetchWithTimeout('/api/weather/current', 10000).catch(e => {
            console.error('❌ Weather fetch failed:', e);
            return { ok: false } as Response;
          }),
          fetchWithTimeout('/api/weather/open-meteo', 10000).catch(e => {
            console.error('Open-Meteo fetch failed:', e);
            return { ok: false } as Response;
          }),
          fetchWithTimeout('/api/analytics/power?period=daily', 10000).catch(e => {
            console.error('❌ Daily power fetch failed:', e);
            return { ok: false } as Response;
          }),
          fetchWithTimeout('/api/analytics/power?period=weekly', 10000).catch(e => {
            console.error('❌ Weekly power fetch failed:', e);
            return { ok: false } as Response;
          }),
          fetchWithTimeout('/api/analytics/power?period=monthly', 10000).catch(e => {
            console.error('❌ Monthly power fetch failed:', e);
            return { ok: false } as Response;
          }),
          fetchWithTimeout('/api/panels/live-status', 10000).catch(e => {
            console.error('Live status fetch failed:', e);
            return { ok: false } as Response;
          }),
        ]);

        clearTimeout(overallTimeoutId);

        if (!mountedRef.current) return;

        // IMPORTANT: Fetch real metrics data or use defaults
        let metrics = defaultMetrics;
        if (metricsRes.ok) {
          try {
            const fetchedMetrics = await metricsRes.json();
            console.log('✅ [Dashboard] Real metrics from API:', fetchedMetrics);
            metrics = {
              totalPanels: fetchedMetrics.totalPanels ?? defaultMetrics.totalPanels,
              healthyPanels: fetchedMetrics.healthyPanels ?? defaultMetrics.healthyPanels,
              warningPanels: fetchedMetrics.warningPanels ?? defaultMetrics.warningPanels,
              faultPanels: fetchedMetrics.faultPanels ?? defaultMetrics.faultPanels,
              offlinePanels: fetchedMetrics.offlinePanels ?? defaultMetrics.offlinePanels,
              currentGeneration: fetchedMetrics.currentGeneration ?? defaultMetrics.currentGeneration,
              maxCapacity: fetchedMetrics.maxCapacity ?? defaultMetrics.maxCapacity,
              efficiency: fetchedMetrics.efficiency ?? defaultMetrics.efficiency,
              availableTechnicians: fetchedMetrics.availableTechnicians ?? defaultMetrics.availableTechnicians,
              openTickets: fetchedMetrics.openTickets ?? defaultMetrics.openTickets,
            };
            console.log('✅ [Dashboard] Transformed metrics:', metrics);
          } catch (e) {
            console.error('❌ Failed to parse metrics response:', e);
          }
        } else {
          console.warn('❌ [Dashboard] Metrics API returned not ok:', metricsRes.status);
        }

        let weather = defaultWeather;
        if (weatherRes.ok) {
          try {
            const weatherApi = await weatherRes.json();
            console.log('✅ [Dashboard] Real weather from API:', weatherApi);
            weather = {
              ...weatherApi,
              windSpeed: weatherApi.windSpeed || 0,
              uvIndex: Math.floor((weatherApi.sunlightIntensity || 0) / 10),
              forecast: weatherApi.forecast || [],
            };
          } catch (e) {
            console.warn('Failed to parse weather response:', e);
          }
        }

        let openMeteoWeather: WeatherData | null = null;
        if (openMeteoRes.ok) {
          try {
            const openMeteoApi = await openMeteoRes.json();
            openMeteoWeather = {
              ...openMeteoApi,
              windSpeed: openMeteoApi.windSpeed || 0,
              uvIndex: Math.floor((openMeteoApi.sunlightIntensity || 0) / 10),
              forecast: openMeteoApi.forecast || [],
            };
          } catch (e) {
            console.warn('Failed to parse Open-Meteo response:', e);
            openMeteoWeather = null;
          }
        }

        let powerDaily: PowerPoint[] = [];
        let powerWeekly: PowerPoint[] = [];
        let powerMonthly: PowerPoint[] = [];

        if (powerDailyRes.ok) {
          try { 
            powerDaily = await powerDailyRes.json(); 
            console.log('✅ [Dashboard] Daily power data:', powerDaily.length, 'points');
          } catch (e) { 
            console.warn('Failed to parse daily power data:', e); 
          }
        }
        if (powerWeeklyRes.ok) {
          try { 
            powerWeekly = await powerWeeklyRes.json(); 
            console.log('✅ [Dashboard] Weekly power data:', powerWeekly.length, 'points');
          } catch (e) { 
            console.warn('Failed to parse weekly power data:', e); 
          }
        }
        if (powerMonthlyRes.ok) {
          try { 
            powerMonthly = await powerMonthlyRes.json(); 
            console.log('✅ [Dashboard] Monthly power data:', powerMonthly.length, 'points');
          } catch (e) { 
            console.warn('Failed to parse monthly power data:', e); 
          }
        }

        let powerHistory30s: LivePowerPoint[] = [];
        let liveMetricsPatch: Partial<DashboardMetrics> = {};
        if (liveStatusRes.ok) {
          try {
            const statusData = await liveStatusRes.json();
            const parsedLiveStatus: LiveStatusData = {
              totalPanels: statusData.totalPanels ?? 0,
              healthyPanels: statusData.healthyPanels ?? 0,
              warningPanels: statusData.warningPanels ?? 0,
              faultPanels: statusData.faultPanels ?? 0,
              offlinePanels: statusData.offlinePanels ?? 0,
              currentGenerationKw: statusData.currentGenerationKw ?? 0,
              avgEfficiency: statusData.avgEfficiency ?? 0,
              mappedDevices: statusData.mappedDevices ?? 0,
              reportingDevices: statusData.reportingDevices ?? 0,
              onlineDevices: statusData.onlineDevices ?? 0,
              latestDeviceSeenAt: statusData.latestDeviceSeenAt ?? null,
              averageVoltage: statusData.averageVoltage ?? 0,
              averageCurrentMa: statusData.averageCurrentMa ?? 0,
              totalPowerMw: statusData.totalPowerMw ?? 0,
              panelGenerationKw: statusData.panelGenerationKw ?? 0,
              panelAvgEfficiency: statusData.panelAvgEfficiency ?? 0,
              devices: Array.isArray(statusData.devices) ? statusData.devices : [],
              powerHistory30s: Array.isArray(statusData.powerHistory30s) ? statusData.powerHistory30s : [],
            };
            powerHistory30s = parsedLiveStatus.powerHistory30s;
            setLiveStatus(parsedLiveStatus);
            liveMetricsPatch = {
              totalPanels: parsedLiveStatus.totalPanels,
              healthyPanels: parsedLiveStatus.healthyPanels,
              warningPanels: parsedLiveStatus.warningPanels,
              faultPanels: parsedLiveStatus.faultPanels,
              offlinePanels: parsedLiveStatus.offlinePanels,
              currentGeneration: parsedLiveStatus.currentGenerationKw,
              efficiency: parsedLiveStatus.avgEfficiency,
            };
          } catch (e) {
            console.warn('Failed to parse live status:', e);
          }
        } else {
          setLiveStatus(defaultLiveStatus);
        }
        const dailyPowerForChart: PowerPoint[] =
          powerHistory30s.length > 0
            ? powerHistory30s.map((point) => ({
                timestamp: point.timestamp,
                value: point.totalPowerKw,
              }))
            : powerDaily;
        const mergedMetrics: DashboardMetrics = {
          ...metrics,
          ...liveMetricsPatch,
        };

        // Update state with fetched data
        console.log('📊 [Dashboard] Setting state with new data');
        setData({
          metrics: mergedMetrics,
          weather,
          openMeteoWeather,
          analytics: {
            powerGeneration: {
              daily: dailyPowerForChart,
              weekly: powerWeekly,
              monthly: powerMonthly,
            },
          },
        });
        
        console.log('✅ [Dashboard] Data state updated successfully');
        setError(null);
      } catch (err) {
        clearTimeout(overallTimeoutId);
        if (!mountedRef.current) return;
        console.error('❌ [Dashboard] Major fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRetrying(false);
      }
    }
  }

  useEffect(() => {
    fetchData(true);
    const intervalId = window.setInterval(() => {
      fetchData();
    }, 30000); // Refresh every 30 seconds

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const { metrics, weather, openMeteoWeather, analytics } = data;

  return (
    <div className="space-y-6">
      {/* Data Status Banner */}
      <div className="rounded-lg border bg-blue-50 dark:bg-blue-950 p-4 mb-4">
        <div className="text-sm text-blue-700 dark:text-blue-200">
          <p className="font-semibold">📊 Live Data Status:</p>
          <p>Total Panels: <span className="font-bold">{liveStatus.totalPanels}</span> | 
             Healthy: <span className="font-bold text-green-600">{liveStatus.healthyPanels}</span> | 
             Warning: <span className="font-bold text-yellow-600">{liveStatus.warningPanels}</span> | 
             Fault: <span className="font-bold text-red-600">{liveStatus.faultPanels}</span></p>
          <p>Current Generation: <span className="font-bold">{liveStatus.currentGenerationKw.toFixed(2)} kW</span> | 
             Efficiency: <span className="font-bold">{liveStatus.avgEfficiency.toFixed(1)}%</span></p>
          <p>ESP Devices: <span className="font-bold">{liveStatus.onlineDevices}/{liveStatus.mappedDevices}</span> online | 
             Avg Voltage: <span className="font-bold">{liveStatus.averageVoltage.toFixed(2)} V</span> | 
             Avg Current: <span className="font-bold">{(liveStatus.averageCurrentMa / 1000).toFixed(3)} A</span></p>
          <p className="text-xs mt-2 text-blue-600 dark:text-blue-300">
            {liveStatus.latestDeviceSeenAt
              ? `Last ESP update: ${new Date(liveStatus.latestDeviceSeenAt).toLocaleTimeString()}`
              : 'Waiting for ESP32 readings...'}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {liveStatus.devices.map((device) => (
              <div
                key={device.deviceId}
                className={`rounded border px-3 py-2 ${
                  device.online
                    ? device.status === 'healthy'
                      ? 'border-green-300 bg-green-100/60 text-green-900 dark:bg-green-900/30 dark:text-green-200'
                      : device.status === 'warning'
                      ? 'border-yellow-300 bg-yellow-100/60 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200'
                      : 'border-red-300 bg-red-100/60 text-red-900 dark:bg-red-900/30 dark:text-red-200'
                    : 'border-slate-300 bg-slate-100/70 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300'
                }`}
              >
                <p className="font-semibold uppercase">{device.label}</p>
                <p>{device.online ? 'Online' : 'Offline'}</p>
                <p>V: {device.voltage !== null ? `${device.voltage.toFixed(2)} V` : 'N/A'}</p>
                <p>I: {device.currentMa !== null ? `${(device.currentMa / 1000).toFixed(3)} A` : 'N/A'}</p>
                <p>P: {device.powerMw !== null ? `${(device.powerMw / 1000).toFixed(2)} W` : 'N/A'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Error/Timeout Banner */}
      {error && (
        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Unable to load some dashboard data
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  {error} - Displaying cached/default values
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsRetrying(true);
                fetchData();
              }}
              disabled={isRetrying}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Real-time monitoring of your solar farm performance
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title="Total Panels"
          value={metrics.totalPanels}
          icon={Sun}
          animate={false}
        />
        <MetricCard
          title="Current Generation"
          value={metrics.currentGeneration}
          suffix="kW"
          icon={Zap}
          animate={false}
        />
        <MetricCard
          title="Efficiency"
          value={Math.round(metrics.efficiency)}
          suffix="%"
          icon={Gauge}
          variant={metrics.efficiency > 85 ? 'success' : 'warning'}
          animate={false}
        />
        <MetricCard
          title="Technicians"
          value={metrics.availableTechnicians}
          suffix="available"
          icon={Users}
          animate={false}
        />
        <MetricCard
          title="Open Tickets"
          value={metrics.openTickets}
          icon={AlertTriangle}
          variant={metrics.openTickets > 0 ? 'warning' : 'default'}
          animate={false}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Charts */}
        <div className="space-y-6 lg:col-span-2">
          <PowerChart
            daily={analytics.powerGeneration.daily}
            weekly={analytics.powerGeneration.weekly}
            monthly={analytics.powerGeneration.monthly}
          />
          <PanelHealthOverview
            healthy={metrics.healthyPanels}
            warning={metrics.warningPanels}
            fault={metrics.faultPanels}
            offline={metrics.offlinePanels}
            total={metrics.totalPanels}
          />
        </div>

        {/* Right Column - Weather */}
        <div className="space-y-6">
          <WeatherWidget weather={weather} openMeteoWeather={openMeteoWeather} />
        </div>
      </div>

    </div>
  );
}
