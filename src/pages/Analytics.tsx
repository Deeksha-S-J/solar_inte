import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Leaf, TreePine, Home, TrendingUp, Zap } from 'lucide-react';
import { format } from 'date-fns';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
];

// Default empty data when API is unavailable
const defaultAnalytics = {
  environmental: {
    carbonOffset: 0,
    treesEquivalent: 0,
    homesPowered: 0,
  },
  efficiency: {
    byZone: [] as Array<{ zone: string; efficiency: number }>,
    trend: [] as Array<{ date: Date; efficiency: number }>,
  },
  faultStatistics: {
    byType: [] as Array<{ type: string; count: number }>,
    byMonth: [] as Array<{ month: string; count: number }>,
    avgResolutionTime: 0,
  },
  powerGeneration: {
    daily: [] as Array<{ timestamp: Date; value: number }>,
    weekly: [] as Array<{ timestamp: Date; value: number }>,
    monthly: [] as Array<{ timestamp: Date; value: number }>,
  },
};

type AnalyticsData = typeof defaultAnalytics;

export default function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData>(defaultAnalytics);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [envRes, efficiencyRes, faultsRes, powerRes] = await Promise.all([
          fetch('/api/analytics/environmental'),
          fetch('/api/analytics/efficiency/by-zone'),
          fetch('/api/analytics/faults'),
          fetch('/api/analytics/power?period=weekly'),
        ]);

        let environmental = defaultAnalytics.environmental;
        let efficiencyByZone = defaultAnalytics.efficiency.byZone;
        let faultStats = defaultAnalytics.faultStatistics;
        let powerWeekly = defaultAnalytics.powerGeneration.weekly;

        if (envRes.ok) {
          environmental = await envRes.json();
        }
        if (efficiencyRes.ok) {
          efficiencyByZone = await efficiencyRes.json();
        }
        if (faultsRes.ok) {
          faultStats = await faultsRes.json();
        }
        if (powerRes.ok) {
          powerWeekly = await powerRes.json();
        }

        setAnalytics({
          environmental,
          efficiency: { 
            byZone: efficiencyByZone, 
            trend: defaultAnalytics.efficiency.trend 
          },
          faultStatistics: faultStats,
          powerGeneration: { 
            daily: defaultAnalytics.powerGeneration.daily, 
            weekly: powerWeekly, 
            monthly: defaultAnalytics.powerGeneration.monthly 
          },
        });
      } catch (err) {
        console.warn('API unavailable, using default values');
        // Data remains with default empty values
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  const { powerGeneration, efficiency, environmental, faultStatistics } = analytics;

  const weeklyData = powerGeneration.weekly.filter((_, i) => i % 8 === 0).map(d => ({
    time: format(d.timestamp, 'EEE'),
    value: d.value,
  }));

  const monthlyTrend = efficiency.trend.map(d => ({
    date: format(d.date, 'MMM dd'),
    efficiency: d.efficiency.toFixed(1),
  }));

  const hasData = powerGeneration.weekly.length > 0 || efficiency.byZone.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics & Reports</h1>
        <p className="text-muted-foreground">
          Deep insights into your solar farm performance
        </p>
      </div>

      {/* Environmental Impact Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-success/20 p-4">
                <Leaf className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Carbon Offset</p>
                <p className="text-3xl font-bold">{environmental.carbonOffset.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">tons CO₂/year</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-primary/20 p-4">
                <TreePine className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Trees Equivalent</p>
                <p className="text-3xl font-bold">{environmental.treesEquivalent.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">planted per year</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-accent/20 p-4">
                <Home className="h-8 w-8 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Homes Powered</p>
                <p className="text-3xl font-bold">{environmental.homesPowered.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">households/year</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Power Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-accent" />
              Weekly Power Generation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {weeklyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)} kW`, 'Power']}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No power data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Efficiency by Zone */}
        <Card>
          <CardHeader>
            <CardTitle>Efficiency by Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {efficiency.byZone.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={efficiency.byZone} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <YAxis dataKey="zone" type="category" tick={{ fontSize: 12 }} width={50} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Efficiency']}
                    />
                    <Bar
                      dataKey="efficiency"
                      fill="hsl(var(--chart-2))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No efficiency data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Efficiency Trend */}
        {monthlyTrend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                Efficiency Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrend.slice(-14)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis domain={[80, 100]} tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value}%`, 'Efficiency']}
                    />
                    <Line
                      type="monotone"
                      dataKey="efficiency"
                      stroke="hsl(var(--success))"
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--success))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fault Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Fault Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {faultStatistics.byType.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={faultStatistics.byType}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="type"
                      label={({ type, percent }) => `${type} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {faultStatistics.byType.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No fault data available
                </div>
              )}
            </div>
            {faultStatistics.byType.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {faultStatistics.byType.map((fault, i) => (
                  <div key={fault.type} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-sm">{fault.type}: {fault.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Faults Trend */}
      {faultStatistics.byMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Fault Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={faultStatistics.byMonth}>
                  <defs>
                    <linearGradient id="faultGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--warning))"
                    fill="url(#faultGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-center gap-8 text-sm">
              <div>
                <span className="text-muted-foreground">Avg Resolution Time:</span>
                <span className="ml-2 font-semibold">{faultStatistics.avgResolutionTime} hours</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Faults:</span>
                <span className="ml-2 font-semibold">
                  {faultStatistics.byMonth.reduce((sum, m) => sum + m.count, 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

