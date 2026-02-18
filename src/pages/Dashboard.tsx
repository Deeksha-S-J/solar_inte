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
const emptyMetrics: DashboardMetrics = {
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

// Empty sample weather when API is unavailable
const emptyWeather: WeatherData = {
  id: '',
  temperature: 0,
  condition: 'sunny',
  humidity: 0,
  sunlightIntensity: 0,
  recordedAt: new Date().toISOString(),
};

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

interface DashboardData {
  metrics: DashboardMetrics;
  weather: WeatherData;
  openMeteoWeather: WeatherData | null;
  analytics: DashboardAnalytics;
}

// Panel data interface matching PanelGrid API response
interface PanelData {
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
  sensorDeviceId?: string | null;
  sensorLastUpdated?: string | null;
  sensorVoltage?: number | null;
  sensorCurrentMa?: number | null;
  sensorPowerMw?: number | null;
}

interface RowHealthData {
  panels: PanelData[];
  rows: Array<{
    zone: string;
    row: number;
    healthy: number;
    warning: number;
    fault: number;
    offline: number;
    total: number;
  }>;
  totals: {
    healthy: number;
    warning: number;
    fault: number;
    offline: number;
    total: number;
  };
}

export default function Dashboard() {
  console.log('🚀🚀🚀 DASHBOARD COMPONENT LOADED - NEW VERSION 2025 🚀🚀🚀');
  const [data, setData] = useState<DashboardData>({
    metrics: emptyMetrics,
    weather: emptyWeather,
    openMeteoWeather: null,
    analytics: {
      powerGeneration: {
        daily: [],
        weekly: [],
        monthly: [],
      },
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [rowHealthData, setRowHealthData] = useState<RowHealthData | null>(null);
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
        
        // OPTIMIZATION: Fetch critical data first (dashboard metrics, live status)
        // Then fetch secondary data (weather, power history) in parallel
        const criticalDataPromises = Promise.all([
          fetchWithTimeout('/api/analytics/dashboard', 10000).catch(e => {
            console.error('❌ Metrics fetch failed:', e);
            return { ok: false } as Response;
          }),
          fetchWithTimeout('/api/panels/live-status', 10000).catch(e => {
            console.error('Live status fetch failed:', e);
            return { ok: false } as Response;
          }),
          fetchWithTimeout('/api/panels', 10000).catch(e => {
            console.error('Panels fetch failed:', e);
            return { ok: false } as Response;
          }),
        ]);

        // Wait for critical data first
        const [metricsRes, liveStatusRes, rowHealthRes] = await criticalDataPromises;
        
        // Then fetch secondary data (weather, power) in parallel - these can load in background
        const secondaryDataPromises = Promise.all([
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
        ]);

        // Fire off secondary data requests but don't await them immediately
        // This allows the UI to render with critical data first
        secondaryDataPromises.then(async ([weatherRes, openMeteoRes, powerDailyRes, powerWeeklyRes, powerMonthlyRes]) => {
          if (!mountedRef.current) return;
          
          try {
            // Process weather data
            let weather = emptyWeather;
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

            // Update state with secondary data (keep existing metrics/live status)
            setData(prev => ({
              ...prev,
              weather,
              openMeteoWeather,
              analytics: {
                powerGeneration: {
                  daily: powerDaily,
                  weekly: powerWeekly,
                  monthly: powerMonthly,
                },
              },
            }));
          } catch (err) {
            console.warn('Secondary data fetch error:', err);
          }
        }).catch(console.error);

        clearTimeout(overallTimeoutId);

        if (!mountedRef.current) return;

        // IMPORTANT: Fetch real metrics data or use empty values
        let metrics = emptyMetrics;
        if (metricsRes.ok) {
          try {
            const fetchedMetrics = await metricsRes.json();
            console.log('✅ [Dashboard] Real metrics from API:', fetchedMetrics);
            metrics = {
              totalPanels: fetchedMetrics.totalPanels ?? emptyMetrics.totalPanels,
              healthyPanels: fetchedMetrics.healthyPanels ?? emptyMetrics.healthyPanels,
              warningPanels: fetchedMetrics.warningPanels ?? emptyMetrics.warningPanels,
              faultPanels: fetchedMetrics.faultPanels ?? emptyMetrics.faultPanels,
              offlinePanels: fetchedMetrics.offlinePanels ?? emptyMetrics.offlinePanels,
              currentGeneration: fetchedMetrics.currentGeneration ?? emptyMetrics.currentGeneration,
              maxCapacity: fetchedMetrics.maxCapacity ?? emptyMetrics.maxCapacity,
              efficiency: fetchedMetrics.efficiency ?? emptyMetrics.efficiency,
              availableTechnicians: fetchedMetrics.availableTechnicians ?? emptyMetrics.availableTechnicians,
              openTickets: fetchedMetrics.openTickets ?? emptyMetrics.openTickets,
            };
            console.log('✅ [Dashboard] Transformed metrics:', metrics);
          } catch (e) {
            console.error('❌ Failed to parse metrics response:', e);
          }
        } else {
          console.warn('❌ [Dashboard] Metrics API returned not ok:', metricsRes.status);
        }

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
        }

        // Parse panel data and calculate totals and rows
        if (rowHealthRes.ok) {
          try {
            const panels = await rowHealthRes.json();
            if (Array.isArray(panels)) {
              // Group panels by zone and row to get row data
              const rowMap = new Map<string, { zone: string; row: number; healthy: number; warning: number; fault: number; offline: number; total: number }>();
              panels.forEach((panel: PanelData) => {
                const zoneName = panel.zone?.name || 'unknown';
                const key = `${zoneName}-${panel.row}`;
                
                if (!rowMap.has(key)) {
                  rowMap.set(key, { zone: zoneName, row: panel.row, healthy: 0, warning: 0, fault: 0, offline: 0, total: 0 });
                }
                
                const row = rowMap.get(key)!;
                row.total++;
                
                switch (panel.status) {
                  case 'healthy':
                    row.healthy++;
                    break;
                  case 'warning':
                    row.warning++;
                    break;
                  case 'fault':
                    row.fault++;
                    break;
                  case 'offline':
                    row.offline++;
                    break;
                  default:
                    row.offline++;
                }
              });

              const rows = Array.from(rowMap.values()).sort((a, b) => {
                if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
                return a.row - b.row;
              });

              // Calculate totals based on ROWS, not panels
              // A row is "fault" if it has any fault panels
              // A row is "warning" if it has warning panels (but no fault)
              // A row is "healthy" if all panels are healthy
              // A row is "offline" if all panels are offline or if zone B (showcase only)
              const totals = {
                healthy: rows.filter(r => r.fault === 0 && r.warning === 0 && r.offline < r.total && r.total > 0).length,
                warning: rows.filter(r => r.warning > 0 && r.fault === 0).length,
                fault: rows.filter(r => r.fault > 0).length,
                offline: rows.filter(r => r.offline === r.total || r.total === 0).length,
                total: rows.length,
              };

              setRowHealthData({ panels, rows, totals });
              console.log('✅ [Dashboard] Row totals calculated:', { totals, rowsCount: rows.length });
            }
          } catch (e) {
            console.warn('Failed to parse panel data:', e);
          }
        }
        const mergedMetrics: DashboardMetrics = {
          ...metrics,
          ...liveMetricsPatch,
        };

        // Update state with fetched critical data
        // Weather and power data will be updated separately when available
        console.log('📊 [Dashboard] Setting state with new data');
        setData(prev => ({
          metrics: mergedMetrics,
          weather: prev.weather, // Keep existing weather data
          openMeteoWeather: prev.openMeteoWeather, // Keep existing Open-Meteo data
          analytics: {
            powerGeneration: {
              daily: prev.analytics.powerGeneration.daily,
              weekly: prev.analytics.powerGeneration.weekly,
              monthly: prev.analytics.powerGeneration.monthly,
            },
          },
        }));
        
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
          value={metrics.currentGeneration / 1000}
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
            rows={rowHealthData?.rows || []}
            totals={rowHealthData?.totals || { healthy: 0, warning: 0, fault: 0, offline: 0, total: 0 }}
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
