import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

interface PowerChartProps {
  daily: { timestamp: Date | string; value: number }[];
  weekly: { timestamp: Date | string; value: number }[];
  monthly: { timestamp: Date | string; value: number }[];
}

export function PowerChart({ daily, weekly, monthly }: PowerChartProps) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const toDate = (timestamp: Date | string) => (timestamp instanceof Date ? timestamp : new Date(timestamp));

  const sampleSeries = <T,>(items: T[], maxPoints: number) => {
    if (items.length <= maxPoints) return items;
    const step = Math.ceil(items.length / maxPoints);
    return items.filter((_, i) => i % step === 0);
  };

  const getData = () => {
    const toPoints = (items: { timestamp: Date | string; value: number }[]) =>
      [...items]
        .map((d) => ({ date: toDate(d.timestamp), value: d.value }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    switch (period) {
      case 'daily': {
        const pts = sampleSeries(toPoints(daily), 16);
        return pts.map((d) => ({
          time: format(d.date, 'HH:mm'),
          value: d.value,
        }));
      }
      case 'weekly': {
        const pts = sampleSeries(toPoints(weekly), 10);
        return pts.map((d) => ({
          time: format(d.date, 'EEE'),
          value: d.value,
        }));
      }
      case 'monthly': {
        const pts = sampleSeries(toPoints(monthly), 8);
        return pts.map((d) => ({
          time: format(d.date, 'MMM d'),
          value: d.value,
        }));
      }
    }
  };

  const data = getData();
  const xTickAngle = 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Power Generation</CardTitle>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <TabsList className="h-8">
            <TabsTrigger value="daily" className="text-xs px-3">Daily</TabsTrigger>
            <TabsTrigger value="weekly" className="text-xs px-3">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs px-3">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 14, left: 0, bottom: 28 }}>
              <defs>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.26} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" vertical={false} className="stroke-muted/50" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                angle={xTickAngle}
                textAnchor="middle"
                height={28}
                interval={0}
                minTickGap={0}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(value) => `${value}`}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [`${value.toFixed(1)} kW`, 'Power']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                fill="url(#powerGradient)"
                activeDot={{ r: 4 }}
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
