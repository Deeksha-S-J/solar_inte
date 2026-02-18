import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface RowData {
  zone: string;
  row: number;
  healthy: number;
  warning: number;
  fault: number;
  offline: number;
  total: number;
}

interface Totals {
  healthy: number;
  warning: number;
  fault: number;
  offline: number;
  total: number;
}

interface PanelHealthProps {
  rows: RowData[];
  totals: Totals;
  activeDeviceIds?: string[];
}

export function PanelHealthOverview({ rows, totals, activeDeviceIds = [] }: PanelHealthProps) {
  const safeTotal = totals.total > 0 ? totals.total : 1;
  const healthyPercent = (totals.healthy / safeTotal) * 100;
  const warningPercent = (totals.warning / safeTotal) * 100;
  const faultPercent = (totals.fault / safeTotal) * 100;
  const offlinePercent = (totals.offline / safeTotal) * 100;

  const segments = [
    { label: 'Healthy', count: totals.healthy, percent: healthyPercent, color: 'bg-success' },
    { label: 'Warning', count: totals.warning, percent: warningPercent, color: 'bg-warning' },
    { label: 'Fault', count: totals.fault, percent: faultPercent, color: 'bg-destructive' },
    { label: 'Offline', count: totals.offline, percent: offlinePercent, color: 'bg-muted-foreground' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Row Health Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Stacked progress bar */}
        <div className="relative h-4 overflow-hidden rounded-full bg-muted">
          <div className="absolute inset-0 flex">
            {segments.map((seg, idx) => (
              <div
                key={seg.label}
                className={cn('h-full transition-all duration-500', seg.color)}
                style={{ width: `${seg.percent}%` }}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2">
              <div className={cn('h-3 w-3 rounded-full', seg.color)} />
              <div className="flex-1">
                <p className="text-sm font-medium">{seg.count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{seg.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Efficiency bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Health</span>
            <span className="font-medium">{healthyPercent.toFixed(1)}%</span>
          </div>
          <Progress value={healthyPercent} className="mt-2 h-2" />
        </div>
      </CardContent>
    </Card>
  );
}

