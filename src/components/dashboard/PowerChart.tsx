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
  const toLocalDate = (timestamp: Date | string) => {
    if (timestamp instanceof Date) return timestamp;
    const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return new Date(timestamp);
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  };

  const toPoints = (items: { timestamp: Date | string; value: number }[]) =>
    [...items]
      .map((d) => ({ date: toDate(d.timestamp), value: d.value }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Aggregate points by time bucket so axis labels stay sequential and non-repeating.
  const aggregateByBucket = (
    items: { date: Date; value: number }[],
    keyFn: (date: Date) => string,
    labelFn: (date: Date) => string
  ) => {
    const bucketMap = new Map<string, { label: string; sum: number; count: number; date: Date }>();
    for (const item of items) {
      const key = keyFn(item.date);
      const existing = bucketMap.get(key);
      if (existing) {
        existing.sum += item.value;
        existing.count += 1;
      } else {
        bucketMap.set(key, {
          label: labelFn(item.date),
          sum: item.value,
          count: 1,
          date: item.date,
        });
      }
    }

    return [...bucketMap.values()]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((b) => ({
        time: b.label,
        value: b.sum / b.count,
      }));
  };

  const getData = () => {
    switch (period) {
      case 'daily': {
        const pts = toPoints(daily);
        return aggregateByBucket(
          pts,
          (d) => format(d, 'yyyy-MM-dd HH'),
          (d) => format(d, 'HH:mm')
        );
      }
      case 'weekly': {
        const dayTotals = new Map<string, { sum: number; count: number }>();
        for (const point of weekly) {
          const date = toLocalDate(point.timestamp);
          const key = format(date, 'yyyy-MM-dd');
          const existing = dayTotals.get(key);
          if (existing) {
            existing.sum += point.value;
            existing.count += 1;
          } else {
            dayTotals.set(key, { sum: point.value, count: 1 });
          }
        }

        const end = new Date();
        end.setHours(12, 0, 0, 0);

        const points: Array<{ time: string; value: number }> = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(end);
          d.setDate(end.getDate() - i);
          const key = format(d, 'yyyy-MM-dd');
          const day = dayTotals.get(key);
          points.push({
            time: format(d, 'EEE'),
            value: day ? day.sum / day.count : 0,
          });
        }

        return points;
      }
      case 'monthly': {
        const pts = toPoints(monthly);
        const monthSums = new Array<number>(12).fill(0);
        const monthCounts = new Array<number>(12).fill(0);
        const weeklyPoints = toPoints(weekly);
        const weeklyMax = weeklyPoints.reduce((max, p) => Math.max(max, p.value), 0);
        const monthlyCap = weeklyMax > 0 ? weeklyMax : Number.POSITIVE_INFINITY;

        for (const point of pts) {
          const monthIdx = point.date.getMonth();
          monthSums[monthIdx] += point.value;
          monthCounts[monthIdx] += 1;
        }

        return Array.from({ length: 12 }, (_, monthIdx) => ({
          time: format(new Date(2000, monthIdx, 1), 'MMM'),
          value:
            monthCounts[monthIdx] > 0
              ? Math.min(monthSums[monthIdx] / monthCounts[monthIdx], monthlyCap)
              : 0,
        }));
      }
    }
  };

  const data = getData();
  const xTickAngle = period === 'daily' ? -35 : 0;
  const xTickAnchor = period === 'daily' ? 'end' : 'middle';
  const xTickHeight = period === 'daily' ? 52 : 28;
  const xAxisInterval = period === 'daily' ? Math.max(0, Math.ceil(data.length / 10) - 1) : 0;

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
                textAnchor={xTickAnchor}
                height={xTickHeight}
                interval={xAxisInterval}
                minTickGap={period === 'daily' ? 8 : 0}
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
                formatter={(value: number) => [`${value.toFixed(1)} W`, 'Power']}
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
