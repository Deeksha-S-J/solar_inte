import { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Search, Download, ZoomIn, ZoomOut, Grid3X3, List, GitBranch } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

// Types matching API response
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

interface RowGroupData {
  key: string;
  zone: string;
  row: number;
  panels: PanelData[];
  deviceId: string | null;
  status: 'healthy' | 'warning' | 'fault' | 'offline';
  totalOutputW: number;
  totalMaxOutputW: number;
  efficiency: number;
  currentA: number;
  voltageV: number;
  powerW: number;
}

const statusColors: Record<string, string> = {
  healthy: 'bg-success',
  warning: 'bg-warning',
  fault: 'bg-destructive',
  offline: 'bg-muted-foreground',
};

// Voltage-based status colors for rows (based on ESP32 readings)
const getVoltageStatusColor = (voltage: number): string => {
  if (voltage < 10) return 'bg-destructive';   // Fault - red
  if (voltage >= 11 && voltage <= 15) return 'bg-warning';  // Warning - orange
  return 'bg-success';                        // Healthy - green
};

// Get row status based on voltage
const getVoltageStatus = (voltage: number): 'healthy' | 'warning' | 'fault' | 'offline' => {
  if (voltage < 10) return 'fault';
  if (voltage >= 11 && voltage <= 15) return 'warning';
  return 'healthy';
};

const statusBadgeColors: Record<string, string> = {
  healthy: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  fault: 'bg-destructive/10 text-destructive border-destructive/30',
  offline: 'bg-muted text-muted-foreground border-muted',
};

export default function PanelGrid() {
  const { toast } = useToast();
  const [panels, setPanels] = useState<PanelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alertsInitialized, setAlertsInitialized] = useState(false);
  const hasInitializedAlertsRef = useRef(false);
  const alertedRowsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;

    async function fetchPanels() {
      try {
        const response = await fetch(`/api/panels?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API Response:', data);
        
        if (Array.isArray(data)) {
          if (isMounted) setPanels(data);
        } else {
          console.error('Expected array, got:', typeof data);
          if (isMounted) setPanels([]);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load panels');
          setPanels([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    
    fetchPanels();
    const intervalId = window.setInterval(fetchPanels, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  // Fetch existing alerts on initialization to prevent duplicate alerts
  useEffect(() => {
    async function fetchExistingAlerts() {
      try {
        const response = await fetch('/api/alerts');
        if (response.ok) {
          const alerts = await response.json();
          // Populate alertedRowsRef with rows that already have alerts
          alerts.forEach((alert: any) => {
            const rowKey = `${alert.zone}-${alert.row}`;
            alertedRowsRef.current.add(rowKey);
          });
          console.log('Loaded existing alerts:', alerts.length);
          setAlertsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to fetch existing alerts:', err);
        setAlertsInitialized(true); // Continue anyway
      }
    }

    fetchExistingAlerts();
  }, []);

  useEffect(() => {
    // Only trigger alerts after initial load and after alerts are initialized from DB
    if (!hasInitializedAlertsRef.current || !alertsInitialized) {
      hasInitializedAlertsRef.current = true;
      // Initialize alerted rows based on current panel statuses
      panels.forEach((panel) => {
        if (panel.status === 'warning' || panel.status === 'fault') {
          const rowKey = `${panel.zone?.name}-${panel.row}`;
          alertedRowsRef.current.add(rowKey);
        }
      });
      return;
    }

    // Group panels by row and check for status changes
    const rowMap = new Map<string, { zone: string; row: number; status: string; avgVoltage: number }>();
    
    for (const panel of panels) {
      const rowKey = `${panel.zone?.name}-${panel.row}`;
      if (panel.status === 'warning' || panel.status === 'fault') {
        if (!rowMap.has(rowKey)) {
          rowMap.set(rowKey, { 
            zone: panel.zone?.name || 'unknown', 
            row: panel.row, 
            status: panel.status,
            avgVoltage: (panel.sensorVoltage || 0) as number
          });
        }
      }
    }

// Check each row for new alerts (that haven't been alerted yet)
    rowMap.forEach((rowData, rowKey) => {
      if (!alertedRowsRef.current.has(rowKey)) {
        // New alert for this row - create alert in DB
        alertedRowsRef.current.add(rowKey);

        // Create alert in database (only for warning and fault statuses)
        if (rowData.status === 'warning' || rowData.status === 'fault') {
          fetch('/api/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              zone: rowData.zone,
              row: rowData.row,
              status: rowData.status,
              message: `Row ${rowData.row} in Zone ${rowData.zone} is showing ${rowData.status} status (voltage: ${rowData.avgVoltage.toFixed(2)}V)`
            })
          }).catch(err => console.error('Failed to create alert:', err));
        }
      }
    });

    // Clear alerted rows that are now healthy
    const currentRowKeys = new Set(rowMap.keys());
    alertedRowsRef.current.forEach((alertedRow) => {
      if (!currentRowKeys.has(alertedRow)) {
        alertedRowsRef.current.delete(alertedRow);
      }
    });
  }, [panels, toast, alertsInitialized]);

  // Get unique zones
  const zones = [...new Set(panels.map(p => p.zone?.name).filter(Boolean))].sort() as string[];

  // Filter panels
  const filteredPanels = panels.filter(panel => {
    const matchesZone = selectedZone === 'all' || panel.zone?.name === selectedZone;
    const matchesStatus = statusFilter === 'all' || panel.status === statusFilter;
    const matchesSearch = panel.panelId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         panel.id?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesZone && matchesStatus && matchesSearch;
  });

  // Group panels by zone
  const panelsByZone = zones.reduce((acc, zone) => {
    acc[zone] = filteredPanels.filter(p => p.zone?.name === zone);
    return acc;
  }, {} as Record<string, PanelData[]>);

  const rowGroups: RowGroupData[] = Object.entries(panelsByZone).flatMap(([zone, zonePanels]) => {
    const groupedByRow = zonePanels.reduce((acc, panel) => {
      if (!acc[panel.row]) acc[panel.row] = [];
      acc[panel.row].push(panel);
      return acc;
    }, {} as Record<number, PanelData[]>);

    return Object.entries(groupedByRow).map(([rowStr, rowPanels]) => {
      const row = Number(rowStr);
      const sortedPanels = [...rowPanels].sort((a, b) => a.column - b.column);
      
      // Determine status based on ESP32 voltage reading
      const devicePanel = sortedPanels.find((panel) => panel.sensorDeviceId);
      const voltageV = (devicePanel?.sensorVoltage || 0) as number;
      
      // Voltage-based status: <10V = fault (red), 11-15V = warning (orange), >15V = healthy (green)
      let status: RowGroupData['status'];
      if (voltageV < 10) {
        status = 'fault';
      } else if (voltageV >= 11 && voltageV <= 15) {
        status = 'warning';
      } else {
        status = 'healthy';
      }
      
      // Override with offline if all panels are offline
      const allOffline = sortedPanels.every((panel) => panel.status === 'offline');
      if (allOffline) status = 'offline';

      const totalOutputW = sortedPanels.reduce((sum, panel) => sum + (panel.currentOutput || 0), 0);
      const totalMaxOutputW = sortedPanels.reduce((sum, panel) => sum + (panel.maxOutput || 0), 0);
      const efficiency = totalMaxOutputW > 0 ? (totalOutputW / totalMaxOutputW) * 100 : 0;
      const currentA = ((devicePanel?.sensorCurrentMa || 0) as number) / 1000;
      const powerW = ((devicePanel?.sensorPowerMw || 0) as number) / 1000;

      return {
        key: `${zone}-${row}`,
        zone,
        row,
        panels: sortedPanels,
        deviceId: devicePanel?.sensorDeviceId || null,
        status,
        totalOutputW,
        totalMaxOutputW,
        efficiency,
        currentA,
        voltageV,
        powerW,
      };
    });
  });

  const visibleRows = rowGroups
    .filter((rowGroup) => selectedZone === 'all' || rowGroup.zone === selectedZone)
    .sort((a, b) => (a.zone === b.zone ? a.row - b.row : a.zone.localeCompare(b.zone)));
  const visibleRowsByZone = visibleRows.reduce((acc, rowGroup) => {
    if (!acc[rowGroup.zone]) acc[rowGroup.zone] = [];
    acc[rowGroup.zone].push(rowGroup);
    return acc;
  }, {} as Record<string, RowGroupData[]>);

  const selectedRow = selectedRowKey ? rowGroups.find((rowGroup) => rowGroup.key === selectedRowKey) || null : null;

  useEffect(() => {
    if (selectedRowKey && !visibleRows.some((rowGroup) => rowGroup.key === selectedRowKey)) {
      setSelectedRowKey(null);
    }
  }, [visibleRows, selectedRowKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading panels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-destructive">
          <p className="text-lg font-semibold">Error loading panels</p>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panel Grid</h1>
          <p className="text-muted-foreground">
            {panels.length > 0 
              ? `Visualizing ${panels.length.toLocaleString()} solar panels`
              : 'No panels configured'}
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Data
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search panel ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedZone} onValueChange={setSelectedZone}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Select Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Zones ({panels.length})</SelectItem>
            {zones.map(zone => (
              <SelectItem key={zone} value={zone}>
                Zone {zone} ({panelsByZone[zone]?.length || 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="fault">Fault</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty State */}
      {panels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Grid3X3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No panels found</h3>
          <p className="text-muted-foreground">No panels have been added yet.</p>
        </div>
      ) : filteredPanels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Grid3X3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No panels match filters</h3>
          <p className="text-muted-foreground">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <Tabs defaultValue="physical" className="space-y-6">
          <TabsList>
            <TabsTrigger value="physical" className="gap-2">
              <Grid3X3 className="h-4 w-4" />
              Physical Layout
            </TabsTrigger>
            <TabsTrigger value="logical" className="gap-2">
              <GitBranch className="h-4 w-4" />
              Logical Diagram
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-2">
              <List className="h-4 w-4" />
              Table View
            </TabsTrigger>
          </TabsList>

          {/* Physical Layout */}
          <TabsContent value="physical" className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{(zoomLevel * 100).toFixed(0)}%</span>
              <Button variant="outline" size="icon" onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="overflow-auto rounded-lg border bg-card p-4">
              <div 
                className="flex flex-wrap items-start gap-4"
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top left',
                }}
              >
                <div className="flex w-full flex-wrap gap-2">
                  {Object.entries(visibleRowsByZone)
                    .sort(([zoneA], [zoneB]) => zoneA.localeCompare(zoneB))
                    .map(([zone, zoneRows]) => (
                      <div key={zone} className="w-[260px] rounded-md border bg-muted/15 p-2.5">
                        <h3 className="mb-2 text-sm font-semibold">Zone {zone}</h3>
                        <div className="space-y-1.5">
                          {zoneRows.map((rowGroup) => (
                            <div key={rowGroup.key} className="flex items-center gap-2">
                              <span className="w-12 text-xs font-semibold text-muted-foreground">Row {rowGroup.row}</span>
                              <button
                                onClick={() => setSelectedRowKey(rowGroup.key)}
                                className={cn(
                                  'h-[36px] w-[116px] rounded-[4px] border px-0 transition-colors',
                                  selectedRowKey === rowGroup.key ? 'border-primary bg-primary/5' : 'bg-background',
                                )}
                              >
                                <div className="flex items-center gap-0.5">
                                  {rowGroup.panels.map((panel) => (
                                    <div
                                      key={panel.id}
                                      className={cn('h-[36px] w-[36px] rounded-[3px]', statusColors[panel.status] || 'bg-gray-400')}
                                      title={`${panel.panelId} - ${panel.status}`}
                                    />
                                  ))}
                                </div>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-sm bg-destructive" />
<span className="text-sm">Fault - Low Voltage</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-sm bg-warning" />
                <span className="text-sm">Warning (11-15V)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-sm bg-success" />
<span className="text-sm">Healthy - Normal Voltage</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-sm bg-muted-foreground" />
                <span className="text-sm">Offline</span>
              </div>
            </div>
          </TabsContent>

          {/* Logical Diagram */}
          <TabsContent value="logical" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Electrical Schematic</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {zones.map(zone => {
                    const zonePanels = panelsByZone[zone] || [];
                    const inverterGroups = [...new Set(zonePanels.map(p => p.inverterGroup))];
                    
                    return (
                      <div key={zone} className="rounded-lg border p-4">
                        <h4 className="mb-3 font-semibold">
                          Zone {zone} ({zonePanels.length} panels)
                        </h4>
                        {inverterGroups.length > 0 ? inverterGroups.map(inv => {
                          const invPanels = zonePanels.filter(p => p.inverterGroup === inv);
                          const strings = [...new Set(invPanels.map(p => p.stringId))];
                          const hasFault = invPanels.some(p => p.status === 'fault');
                          
                          return (
                            <div key={inv} className={cn(
                              'mb-3 rounded-lg border p-3',
                              hasFault && 'border-destructive bg-destructive/5'
                            )}>
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-sm font-medium">{inv}</span>
                                <Badge variant={hasFault ? 'destructive' : 'secondary'} className="text-xs">
                                  {invPanels.reduce((sum, p) => sum + p.currentOutput, 0).toFixed(0)} W
                                </Badge>
                              </div>
                              <div className="space-y-1">
                                {strings.map(str => {
                                  const strPanels = invPanels.filter(p => p.stringId === str);
                                  return (
                                    <div key={str} className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground w-16">{str}</span>
                                      <div className="flex gap-0.5">
                                        {strPanels.slice(0, 10).map(p => (
                                          <div
                                            key={p.id}
                                            className={cn('h-2 w-2 rounded-sm', statusColors[p.status] || 'bg-gray-400')}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }) : (
                          <p className="text-sm text-muted-foreground">No inverters configured</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Table View */}
          <TabsContent value="table">
            <Card>
              <CardContent className="p-0">
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Panel ID</TableHead>
                        <TableHead>Zone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Efficiency</TableHead>
                        <TableHead>Output</TableHead>
                        <TableHead>Voltage</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Temperature</TableHead>
                        <TableHead>Last Checked</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPanels.slice(0, 100).map(panel => (
                        <TableRow key={panel.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium">{panel.panelId || panel.id}</TableCell>
                          <TableCell>Zone {panel.zone?.name || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusBadgeColors[panel.status] || 'bg-gray-100'}>
                              {panel.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{panel.efficiency?.toFixed(1) || '0'}%</TableCell>
                          <TableCell>{panel.currentOutput || 0} W</TableCell>
                          <TableCell>{panel.sensorVoltage?.toFixed(2) || 'N/A'} V</TableCell>
                          <TableCell>{panel.sensorCurrentMa !== null && panel.sensorCurrentMa !== undefined ? (panel.sensorCurrentMa / 1000).toFixed(3) : 'N/A'} A</TableCell>
                          <TableCell>{panel.temperature?.toFixed(1) || '0'}°C</TableCell>
                          <TableCell className="text-muted-foreground">
                            {panel.lastChecked ? format(new Date(panel.lastChecked), 'MMM dd, HH:mm') : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredPanels.length > 100 && (
                  <div className="border-t p-4 text-center text-sm text-muted-foreground">
                    Showing 100 of {filteredPanels.length} panels
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Row Details Sidebar */}
      {selectedRow && (
        <Card className="fixed right-6 top-20 w-80 z-50 shadow-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Zone {selectedRow.zone} - Row {selectedRow.row}</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selectedRow.deviceId || 'No ESP'}</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedRowKey(null)}>x</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className={statusBadgeColors[selectedRow.status] || 'bg-gray-100'}>
                {selectedRow.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ESP Device</span>
              <span>{selectedRow.deviceId || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Efficiency</span>
              <span>{selectedRow.efficiency.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Power Generated</span>
              <span>{selectedRow.totalOutputW.toFixed(2)} W / {selectedRow.totalMaxOutputW.toFixed(2)} W</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Row Current</span>
              <span>{selectedRow.currentA.toFixed(3)} A</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Row Voltage</span>
              <span>{selectedRow.voltageV.toFixed(2)} V</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Row Power</span>
              <span>{selectedRow.powerW.toFixed(2)} W</span>
            </div>
            <div className="pt-2">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Panels in this row</p>
              <div className="space-y-1">
                {selectedRow.panels.map((panel) => (
                  <div key={panel.id} className="flex items-center justify-between rounded border px-2 py-1">
                    <span>{panel.panelId}</span>
                    <span className="text-xs">{panel.currentOutput.toFixed(2)} W</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
