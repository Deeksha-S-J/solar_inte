import { useEffect, useState, useRef } from 'react';
import {
  Sun,
  Zap,
  Gauge,
  Leaf,
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

// Default empty metrics when API is unavailable
const defaultMetrics: DashboardMetrics = {
  totalPanels: 0,
  healthyPanels: 0,
  warningPanels: 0,
  faultPanels: 0,
  offlinePanels: 0,
  currentGeneration: 0,
  maxCapacity: 0,
  efficiency: 0,
  carbonSaved: 0,
  availableTechnicians: 0,
  openTickets: 0,
};

// Default empty weather when API is unavailable
const defaultWeather: WeatherData = {
  id: '',
  temperature: 0,
  condition: 'unknown',
  humidity: 0,
  sunlightIntensity: 0,
  recordedAt: new Date().toISOString(),
  windSpeed: 0,
  uvIndex: 0,
  forecast: [],
};

// Default empty analytics when API is unavailable
const defaultAnalytics = {
  powerGeneration: {
    daily: [],
    weekly: [],
    monthly: [],
  },
};

interface DashboardData {
  metrics: DashboardMetrics;
  weather: WeatherData;
  analytics: typeof defaultAnalytics;
}

// Helper function to add timeout to fetch requests
function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout: ${url}`));
    }, timeoutMs);

    fetch(url)
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
  const [data, setData] = useState<DashboardData>({
    metrics: defaultMetrics,
    weather: defaultWeather,
    analytics: defaultAnalytics,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function fetchData() {
    if (!mountedRef.current) return;
    
    setLoading(true);
    setError(null);

    try {
      // Set a timeout for the entire operation
      const totalTimeout = 15000; // 15 seconds max for entire dashboard
      const overallTimeoutId = setTimeout(() => {
        if (mountedRef.current) {
          console.warn('Dashboard data fetch timeout - using default values');
          setError('Request timed out - using cached/default values');
        }
      }, totalTimeout);

      try {
        // Fetch all data with individual timeouts
        const [metricsRes, weatherRes, powerDailyRes, powerWeeklyRes, powerMonthlyRes] = await Promise.all([
          fetchWithTimeout('/api/analytics/dashboard', 10000).catch(e => ({ ok: false } as Response)),
          fetchWithTimeout('/api/weather/current', 10000).catch(e => ({ ok: false } as Response)),
          fetchWithTimeout('/api/analytics/power?period=daily', 10000).catch(e => ({ ok: false } as Response)),
          fetchWithTimeout('/api/analytics/power?period=weekly', 10000).catch(e => ({ ok: false } as Response)),
          fetchWithTimeout('/api/analytics/power?period=monthly', 10000).catch(e => ({ ok: false } as Response)),
        ]);

        clearTimeout(overallTimeoutId);

        if (!mountedRef.current) return;

        let metrics = defaultMetrics;
        if (metricsRes.ok) {
          try {
            metrics = await metricsRes.json();
          } catch (e) {
            console.warn('Failed to parse metrics response');
          }
        }

        let weather = defaultWeather;
        if (weatherRes.ok) {
          try {
            const weatherApi = await weatherRes.json();
            weather = {
              ...weatherApi,
              windSpeed: weatherApi.windSpeed || 0,
              uvIndex: Math.floor((weatherApi.sunlightIntensity || 0) / 10),
              forecast: weatherApi.forecast || [],
            };
          } catch (e) {
            console.warn('Failed to parse weather response');
          }
        }

        let powerDaily: any[] = [];
        let powerWeekly: any[] = [];
        let powerMonthly: any[] = [];

        if (powerDailyRes.ok) {
          try { powerDaily = await powerDailyRes.json(); } catch (e) { console.warn('Failed to parse daily power data'); }
        }
        if (powerWeeklyRes.ok) {
          try { powerWeekly = await powerWeeklyRes.json(); } catch (e) { console.warn('Failed to parse weekly power data'); }
        }
        if (powerMonthlyRes.ok) {
          try { powerMonthly = await powerMonthlyRes.json(); } catch (e) { console.warn('Failed to parse monthly power data'); }
        }

        setData({
          metrics,
          weather,
          analytics: {
            powerGeneration: {
              daily: powerDaily,
              weekly: powerWeekly,
              monthly: powerMonthly,
            },
          },
        });
        setError(null);
      } catch (err) {
        clearTimeout(overallTimeoutId);
        if (!mountedRef.current) return;
        console.warn('Dashboard fetch failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
        // Keep default values
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRetrying(false);
      }
    }
  }

  useEffect(() => {
    fetchData();
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

  const { metrics, weather, analytics } = data;

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          title="Total Panels"
          value={metrics.totalPanels}
          icon={Sun}
          trend={{ value: 2.5, isPositive: true }}
        />
        <MetricCard
          title="Current Generation"
          value={metrics.currentGeneration}
          suffix="kW"
          icon={Zap}
          trend={{ value: 8.3, isPositive: true }}
        />
        <MetricCard
          title="Efficiency"
          value={Math.round(metrics.efficiency)}
          suffix="%"
          icon={Gauge}
          variant={metrics.efficiency > 85 ? 'success' : 'warning'}
        />
        <MetricCard
          title="Carbon Saved"
          value={metrics.carbonSaved}
          suffix="kg"
          icon={Leaf}
          variant="success"
        />
        <MetricCard
          title="Technicians"
          value={metrics.availableTechnicians}
          suffix="available"
          icon={Users}
        />
        <MetricCard
          title="Open Tickets"
          value={metrics.openTickets}
          icon={AlertTriangle}
          variant={metrics.openTickets > 0 ? 'warning' : 'default'}
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
          <WeatherWidget weather={weather} />
        </div>
      </div>
    </div>
  );
}

