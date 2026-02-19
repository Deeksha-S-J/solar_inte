import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Search,
  Clock,
  Thermometer,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  RefreshCw,
  Camera,
  Zap,
  Image,
  Wifi,
  WifiOff,
  Loader2,
  Radio,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePiReceiver } from '@/hooks/usePiReceiver';

interface SolarScanFromAPI {
  id: string;
  backendId?: string;
  alertId?: string | null;
  panelId?: string | null;
  rowNumber?: number | null;
  timestamp: string;
  priority: 'HIGH' | 'MEDIUM' | 'NORMAL';
  status: 'pending' | 'processed' | 'archived';
  thermalMinTemp: number | null;
  thermalMaxTemp: number | null;
  thermalMeanTemp: number | null;
  thermalDelta: number | null;
  riskScore: number | null;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | null;
  thermalImageUrl: string | null;
  rgbImageUrl: string | null;
  dustyPanelCount: number;
  cleanPanelCount: number;
  totalPanels: number;
  deviceId: string | null;
  deviceName: string | null;
  panelDetections: Array<{
    id: string;
    scanId: string;
    panelNumber: string;
    status: 'CLEAN' | 'DUSTY' | 'FAULTY' | 'UNKNOWN';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    cropImageUrl: string | null;
    faultType: string | null;
    confidence: number | null;
    solarPanelId: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  isPiScan?: boolean;
  piReport?: {
    health_score: number;
    priority: 'HIGH' | 'MEDIUM' | 'NORMAL';
    recommendation: string;
    timeframe: string;
    summary: string;
    root_cause: string;
    impact_assessment: string;
    source?: string;
    baseline_aware?: boolean;
    deviation_from_baseline?: string;
    genai_insights?: string;
  };
  thermalFault?: string | null;
  baselineDelta?: number | null;
}

interface SolarScanStats {
  totalScans: number;
  pendingScans: number;
  processedScans: number;
  criticalScans: number;
  highRiskScans: number;
  avgThermalDelta: number;
}

const severityColors: Record<string, string> = {
  CRITICAL: 'bg-red-500/10 text-red-500 border-red-500/30',
  HIGH: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  MODERATE: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  LOW: 'bg-green-500/10 text-green-500 border-green-500/30',
};

const priorityColors: Record<string, string> = {
  HIGH: 'bg-red-500 text-white',
  MEDIUM: 'bg-yellow-500 text-black',
  NORMAL: 'bg-green-500 text-white',
};

const statusColors: Record<string, string> = {
  pending: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  processed: 'bg-green-500/10 text-green-500 border-green-500/30',
  archived: 'bg-muted text-muted-foreground border-muted',
};

const panelStatusColors: Record<string, string> = {
  CLEAN: 'bg-green-500/10 text-green-500 border-green-500/30',
  DUSTY: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  FAULTY: 'bg-red-500/10 text-red-500 border-red-500/30',
  UNKNOWN: 'bg-muted text-muted-foreground border-muted',
};

export default function Scans() {
  const [scans, setScans] = useState<SolarScanFromAPI[]>([]);
  const [stats, setStats] = useState<SolarScanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScan, setSelectedScan] = useState<SolarScanFromAPI | null>(null);
  const [scanDetailsOpen, setScanDetailsOpen] = useState(false);
  
  // Use Pi Receiver hook for live scans from Raspberry Pi
  const { 
    isConnected: isPiConnected, 
    isConnecting: isPiConnecting, 
    error: piError, 
    piScans, 
    totalPiScans, 
    serverUrl, 
    connect: connectToPi, 
    disconnect: disconnectFromPi,
    removePiScan,
  } = usePiReceiver();
  
  const [piUrlInput, setPiUrlInput] = useState(serverUrl);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'api' | 'pi'>('all');
  const piScansRef = useRef(piScans);

  useEffect(() => {
    piScansRef.current = piScans;
  }, [piScans]);

  const fetchScans = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('limit', '50');
      
      const response = await fetch(`/api/solar-scans?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setScans(data);

        // Drop stale live Pi scans that no longer exist in persisted scans.
        // This keeps Scans in sync after backend converts/deletes scans into tickets.
        const persistedScanIds = new Set<string>(data.map((scan: SolarScanFromAPI) => scan.id));
        piScansRef.current.forEach((piScan) => {
          const persistedId = piScan.backendId || (piScan.id.startsWith('pi-') ? null : piScan.id);
          if (persistedId && !persistedScanIds.has(persistedId)) {
            removePiScan(piScan.id);
          }
        });
      }
    } catch (err) {
      console.warn('Failed to fetch scans:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/solar-scans/stats/summary');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.warn('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchScans();
    fetchStats();
    const intervalId = window.setInterval(() => {
      fetchScans();
      fetchStats();
    }, 60000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [statusFilter]);

  const handleViewScan = (scan: SolarScanFromAPI) => {
    setSelectedScan(scan);
    setScanDetailsOpen(true);
  };

  const getPersistedScanId = (scan: SolarScanFromAPI) => {
    if (scan.backendId) return scan.backendId;
    if (scan.id.startsWith('pi-')) return null;
    return scan.id;
  };

  const handleUpdateStatus = async (scan: SolarScanFromAPI, newStatus: string) => {
    const scanId = getPersistedScanId(scan);
    if (!scanId) return;

    try {
      const response = await fetch(`/api/solar-scans/${scanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        if (scan.isPiScan) {
          removePiScan(scan.id);
        }
        fetchScans();
        fetchStats();
      } else {
        const text = await response.text();
        console.error('Failed to update status:', response.status, text);
      }
    } catch (err) {
      console.error('Failed to update scan status:', err);
    }
  };

  const handleDeleteScan = async (scan: SolarScanFromAPI) => {
    const scanId = getPersistedScanId(scan);
    if (!scanId) return;
    if (!confirm('Are you sure you want to delete this scan?')) return;
    
    try {
      const response = await fetch(`/api/solar-scans/${scanId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await fetch(`/api/pi-results/${scanId}`, { method: 'DELETE' }).catch(() => {
          // best effort: this only removes cached live result rows
        });
        if (scan.isPiScan) {
          removePiScan(scan.id);
        }
        fetchScans();
        fetchStats();
      } else {
        const text = await response.text();
        console.error('Failed to delete scan:', response.status, text);
      }
    } catch (err) {
      console.error('Failed to delete scan:', err);
    }
  };

  // Combine API scans with Pi scans for display
  const allScans = [...piScans, ...scans].filter((scan) => scan.priority !== 'NORMAL');
  
  // Sort by timestamp (newest first) to get consistent sequence
  const sortedAllScans = [...allScans].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.updatedAt || a.timestamp).getTime();
    const dateB = new Date(b.createdAt || b.updatedAt || b.timestamp).getTime();
    return dateB - dateA;
  });
  
  // Add source indicator to each scan
  const scansWithSource = sortedAllScans.map((scan, index) => ({
    ...scan,
    isPiScan: scan.id.startsWith('pi-'),
    _sequence: index + 1, // Continuous sequence number
  }));
  
  const filteredScans = scansWithSource.filter(scan => {
    // Filter by source
    if (sourceFilter === 'api' && scan.isPiScan) return false;
    if (sourceFilter === 'pi' && !scan.isPiScan) return false;
    
    const searchMatch = 
      scan.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (scan.deviceName && scan.deviceName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (scan.deviceId && scan.deviceId.toLowerCase().includes(searchQuery.toLowerCase()));
    return searchMatch;
  });

  const getRelativeTime = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  };

  const getDisplayTimestamp = (scan: SolarScanFromAPI) => {
    return scan.createdAt || scan.updatedAt || scan.timestamp;
  };

  const getScanSequence = (scan: SolarScanFromAPI & { _sequence?: number }) => {
    return scan._sequence || 1;
  };

  const getDisplayDeviceName = () => 'Drone';

  const getDisplayScannerId = (scan: SolarScanFromAPI) => {
    const seq = getScanSequence(scan);
    return `SD-${String(seq).padStart(3, '0')}`;
  };

  const getPanelIdSummary = (scan: SolarScanFromAPI) => {
    if (scan.panelId) return scan.panelId;
    const panelIds = [...new Set((scan.panelDetections || []).map((p) => p.panelNumber).filter(Boolean))];
    if (panelIds.length === 0) return 'N/A';
    if (panelIds.length <= 3) return panelIds.join(', ');
    return `${panelIds.slice(0, 3).join(', ')} +${panelIds.length - 3}`;
  };

  const getRowNumber = (scan: SolarScanFromAPI) => {
    if (typeof scan.rowNumber === 'number') return scan.rowNumber;
    return 'N/A';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading scans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Solar Scans</h1>
        <p className="text-muted-foreground">
          View and manage Raspberry Pi solar panel scans
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Scans</p>
                <p className="text-3xl font-bold">{filteredScans.length}</p>
              </div>
              <div className="rounded-xl bg-blue-500/10 p-3">
                <Camera className="h-6 w-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-3xl font-bold">{filteredScans.filter(s => s.status === 'pending').length}</p>
              </div>
              <div className="rounded-xl bg-yellow-500/10 p-3">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Processed</p>
                <p className="text-3xl font-bold">{filteredScans.filter(s => s.status === 'processed').length}</p>
              </div>
              <div className="rounded-xl bg-green-500/10 p-3">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Critical</p>
                <p className="text-3xl font-bold text-red-500">{filteredScans.filter(s => s.severity === 'CRITICAL').length}</p>
              </div>
              <div className="rounded-xl bg-red-500/10 p-3">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Delta</p>
                <p className="text-3xl font-bold">{stats.avgThermalDelta?.toFixed(1)}°C</p>
              </div>
              <div className="rounded-xl bg-orange-500/10 p-3">
                <Thermometer className="h-6 w-6 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pi Receiver Connection Status */}
      <Card className={isPiConnected ? "border-green-500/50 bg-green-500/5" : "border-yellow-500/50 bg-yellow-500/5"}>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isPiConnecting ? (
                <Loader2 className="h-6 w-6 animate-spin text-yellow-500" />
              ) : isPiConnected ? (
                <Wifi className="h-6 w-6 text-green-500" />
              ) : (
                <WifiOff className="h-6 w-6 text-red-500" />
              )}
              <div>
                <p className="font-semibold">
                  {isPiConnected ? "Connected to Pi Receiver" : isPiConnecting ? "Connecting..." : "Disconnected from Pi"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Server: {serverUrl} - Live Scans: {totalPiScans}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Input
                placeholder="Enter Pi Receiver URL"
                value={piUrlInput}
                onChange={(e) => setPiUrlInput(e.target.value)}
                className="w-[250px]"
                disabled={isPiConnected || isPiConnecting}
              />
              {isPiConnected ? (
                <Button 
                  variant="destructive" 
                  onClick={disconnectFromPi}
                  disabled={isPiConnecting}
                >
                  <WifiOff className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
              ) : (
                <Button 
                  onClick={() => connectToPi(piUrlInput)}
                  disabled={isPiConnecting || !piUrlInput}
                >
                  {isPiConnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wifi className="mr-2 h-4 w-4" />
                  )}
                  Connect
                </Button>
              )}
            </div>
          </div>
          
          {piError && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-500">
              Connection Error: {piError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by ID or device name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as 'all' | 'api' | 'pi')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="api">API Scans</SelectItem>
            <SelectItem value="pi">Live Pi Scans</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => { fetchScans(); fetchStats(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Scan Details Dialog */}
      <Dialog open={scanDetailsOpen} onOpenChange={setScanDetailsOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Details</DialogTitle>
          </DialogHeader>
          {selectedScan && (
            <div className="space-y-4">
              {/* Scan Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Scan ID</label>
                  <p className="mt-1 text-sm font-mono">{getDisplayScannerId(selectedScan)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Alert ID</label>
                  <p className="mt-1 text-sm font-mono">{selectedScan.alertId || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                  <p className="mt-1">{getRelativeTime(getDisplayTimestamp(selectedScan))}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    <Badge className={statusColors[selectedScan.status] || statusColors.pending}>
                      {selectedScan.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Priority</label>
                  <div className="mt-1">
                    <Badge className={priorityColors[selectedScan.priority] || priorityColors.NORMAL}>
                      {selectedScan.priority}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Device</label>
                  <p className="mt-1">{getDisplayDeviceName()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Total Panels</label>
                  <p className="mt-1">{selectedScan.totalPanels}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Panel ID</label>
                  <p className="mt-1">{getPanelIdSummary(selectedScan)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Row Number</label>
                  <p className="mt-1">{getRowNumber(selectedScan)}</p>
                </div>
              </div>

              {/* Thermal Data */}
              <div className="rounded-lg border p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Thermometer className="h-4 w-4" />
                  Thermal Analysis
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Min Temp</label>
                    <p className="text-lg font-semibold">{selectedScan.thermalMinTemp?.toFixed(1) || 'N/A'}°C</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Max Temp</label>
                    <p className="text-lg font-semibold">{selectedScan.thermalMaxTemp?.toFixed(1) || 'N/A'}°C</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Mean Temp</label>
                    <p className="text-lg font-semibold">{selectedScan.thermalMeanTemp?.toFixed(1) || 'N/A'}°C</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Delta</label>
                    <p className="text-lg font-semibold">{selectedScan.thermalDelta?.toFixed(1) || 'N/A'}°C</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Risk Score</label>
                    <p className="text-2xl font-bold">{selectedScan.riskScore ?? 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Severity</label>
                    <div className="mt-1">
                      <Badge className={severityColors[selectedScan.severity || 'LOW'] || severityColors.LOW}>
                        {selectedScan.severity || 'LOW'}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Fault</label>
                    <p className="text-sm font-medium">{selectedScan.thermalFault || 'N/A'}</p>
                  </div>
                </div>
                {selectedScan.thermalImageUrl && (
                  <div className="mt-4">
                    <label className="text-sm font-medium text-muted-foreground">Thermal Image</label>
                    <img 
                      src={selectedScan.thermalImageUrl} 
                      alt="Thermal" 
                      className="mt-1 block w-full h-auto rounded-md bg-black/40"
                    />
                  </div>
                )}
                {selectedScan.rgbImageUrl && (
                  <div className="mt-4">
                    <label className="text-sm font-medium text-muted-foreground">RGB Capture</label>
                    <img
                      src={selectedScan.rgbImageUrl}
                      alt="RGB"
                      className="mt-1 block w-full h-auto rounded-md bg-black/40"
                    />
                  </div>
                )}
              </div>

              {/* Panel Summary */}
              <div className="rounded-lg border p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Panel Status Summary
                </h4>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-green-500 font-semibold">{selectedScan.cleanPanelCount}</span>
                    <span className="text-muted-foreground">Clean</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <span className="text-orange-500 font-semibold">{selectedScan.dustyPanelCount}</span>
                    <span className="text-muted-foreground">Dusty</span>
                  </div>
                </div>
              </div>

              {selectedScan.piReport && (
                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium">Analysis Report</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="text-xs text-muted-foreground">Recommendation</label>
                      <p className="mt-1 font-medium">{selectedScan.piReport.recommendation || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Timeframe</label>
                      <p className="mt-1">{selectedScan.piReport.timeframe || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Source</label>
                      <p className="mt-1">{selectedScan.piReport.source || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Baseline Delta</label>
                      <p className="mt-1">{selectedScan.baselineDelta != null ? `${selectedScan.baselineDelta.toFixed(1)}°C` : 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Summary</label>
                    <p className="mt-1 text-sm">{selectedScan.piReport.summary || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Root Cause</label>
                    <p className="mt-1 text-sm">{selectedScan.piReport.root_cause || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Impact Assessment</label>
                    <p className="mt-1 text-sm">{selectedScan.piReport.impact_assessment || 'N/A'}</p>
                  </div>
                  {selectedScan.piReport.genai_insights && (
                    <div>
                      <label className="text-xs text-muted-foreground">AI Insights</label>
                      <p className="mt-1 text-sm">{selectedScan.piReport.genai_insights}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Panel Detections */}
              {selectedScan.panelDetections && selectedScan.panelDetections.length > 0 && (
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium mb-3">Panel Detections</h4>
                  <div className="space-y-2">
                    {selectedScan.panelDetections.map((panel) => (
                      <div key={panel.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="font-medium">{panel.panelNumber}</span>
                        <Badge className={panelStatusColors[panel.status] || panelStatusColors.UNKNOWN}>
                          {panel.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                {selectedScan.status === 'pending' && (
                  <Button onClick={() => handleUpdateStatus(selectedScan, 'processed')}>
                    Mark as Processed
                  </Button>
                )}
                {selectedScan.status === 'processed' && (
                  <Button onClick={() => handleUpdateStatus(selectedScan, 'archived')}>
                    Archive
                  </Button>
                )}
                <Button variant="destructive" onClick={() => handleDeleteScan(selectedScan)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Empty State */}
      {filteredScans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Camera className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No scans found</h3>
          <p className="text-muted-foreground">
            {scans.length === 0
              ? 'No scans available from Raspberry Pi yet.'
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredScans.map(scan => (
            <Card key={scan.id} className="card-hover">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left - Scan Info */}
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'rounded-lg p-2',
                      scan.severity === 'CRITICAL' ? 'bg-red-500/10' :
                      scan.severity === 'HIGH' ? 'bg-orange-500/10' :
                      scan.severity === 'MODERATE' ? 'bg-yellow-500/10' :
                      'bg-green-500/10'
                    )}>
                      <Thermometer className={cn(
                        'h-5 w-5',
                        scan.severity === 'CRITICAL' ? 'text-red-500' :
                        scan.severity === 'HIGH' ? 'text-orange-500' :
                        scan.severity === 'MODERATE' ? 'text-yellow-500' :
                        'text-green-500'
                      )} />
                    </div>
                    <div>
                      <p className="font-semibold">{getDisplayDeviceName()}</p>
                      <p className="text-sm text-muted-foreground">
                        {getRelativeTime(getDisplayTimestamp(scan))}
                      </p>
                      <p className="text-xs text-muted-foreground">{getDisplayScannerId(scan)}</p>
                    </div>
                  </div>

                  {/* Middle - Info */}
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <span>{scan.totalPanels} panels</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{scan.cleanPanelCount} clean</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span>{scan.dustyPanelCount} dusty</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Panel ID:</span>
                      <span>{getPanelIdSummary(scan)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Row:</span>
                      <span>{getRowNumber(scan)}</span>
                    </div>
                  </div>

                  {/* Right - Actions */}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusColors[scan.status] || statusColors.pending}>
                      {scan.status}
                    </Badge>
                    <Badge className={priorityColors[scan.priority] || priorityColors.NORMAL}>
                      {scan.priority}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => handleViewScan(scan)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}




