import { useState, useEffect } from 'react';
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
}

const statusColors: Record<string, string> = {
  healthy: 'bg-success',
  warning: 'bg-warning',
  fault: 'bg-destructive',
  offline: 'bg-muted-foreground',
};

const statusBadgeColors: Record<string, string> = {
  healthy: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  fault: 'bg-destructive/10 text-destructive border-destructive/30',
  offline: 'bg-muted text-muted-foreground border-muted',
};

export default function PanelGrid() {
  const [panels, setPanels] = useState<PanelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedPanel, setSelectedPanel] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPanels() {
      try {
        const response = await fetch('/api/panels');
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API Response:', data);
        
        if (Array.isArray(data)) {
          setPanels(data);
        } else {
          console.error('Expected array, got:', typeof data);
          setPanels([]);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load panels');
        setPanels([]);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPanels();
  }, []);

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
                className="grid gap-4"
                style={{ 
                  gridTemplateColumns: `repeat(${selectedZone === 'all' ? Math.min(zones.length, 4) : 1}, minmax(0, 1fr))`,
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top left',
                }}
              >
                {(selectedZone === 'all' ? zones : [selectedZone]).map(zone => (
                  <div key={zone} className="rounded-lg border bg-muted/30 p-3">
                    <h3 className="mb-2 text-sm font-semibold">
                      Zone {zone} ({panelsByZone[zone]?.length || 0} panels)
                    </h3>
                    <div className="grid grid-cols-10 gap-1">
                      {panelsByZone[zone]?.map(panel => (
                        <button
                          key={panel.id}
                          onClick={() => setSelectedPanel(panel)}
                          className={cn(
                            'aspect-square rounded-sm transition-all hover:scale-110 hover:z-10',
                            statusColors[panel.status] || 'bg-gray-400',
                            selectedPanel?.id === panel.id && 'ring-2 ring-primary ring-offset-2'
                          )}
                          title={`${panel.panelId} - ${panel.status}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4">
              {Object.entries(statusColors).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className={cn('h-4 w-4 rounded-sm', color)} />
                  <span className="text-sm capitalize">{status}</span>
                </div>
              ))}
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
                                  {invPanels.reduce((sum, p) => sum + p.currentOutput, 0).toFixed(0)}W
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
                          <TableCell>{panel.currentOutput || 0}W</TableCell>
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

      {/* Panel Details Sidebar */}
      {selectedPanel && (
        <Card className="fixed right-6 top-20 w-80 z-50 shadow-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>{selectedPanel.panelId || selectedPanel.id}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPanel(null)}>×</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className={statusBadgeColors[selectedPanel.status] || 'bg-gray-100'}>
                {selectedPanel.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Zone</span>
              <span>Zone {selectedPanel.zone?.name || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Efficiency</span>
              <span>{selectedPanel.efficiency?.toFixed(1) || '0'}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output</span>
              <span>{(selectedPanel.currentOutput || 0)}W / {(selectedPanel.maxOutput || 0)}W</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Temperature</span>
              <span>{(selectedPanel.temperature || 0).toFixed(1)}°C</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inverter</span>
              <span>{selectedPanel.inverterGroup || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">String</span>
              <span>{selectedPanel.stringId || 'N/A'}</span>
            </div>
            <Button className="w-full mt-4" size="sm">Create Ticket</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

