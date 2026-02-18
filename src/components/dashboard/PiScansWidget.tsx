import { useState } from 'react';
import { 
  Camera, 
  Thermometer, 
  AlertTriangle, 
  CheckCircle, 
  Zap,
  Wifi,
  WifiOff,
  Loader2,
  Eye,
  RefreshCw,
  XCircle,
  Wind,
  Clock,
  Image
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { usePiReceiver, formatPiScanTime, getSeverityColor, getPriorityColor } from '@/hooks/usePiReceiver';
import type { SolarScan } from '@/types/solar';
import { cn } from '@/lib/utils';

export function PiScansWidget() {
  const { 
    isConnected, 
    isConnecting, 
    error, 
    piScans, 
    stats, 
    serverUrl,
    connect, 
    disconnect,
    clearPiScans 
  } = usePiReceiver();
  
  const [piUrlInput, setPiUrlInput] = useState(serverUrl);
  const [selectedScan, setSelectedScan] = useState<SolarScan | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleConnect = () => {
    if (piUrlInput) {
      connect(piUrlInput);
    }
  };

  const handleViewScan = (scan: SolarScan) => {
    setSelectedScan(scan);
    setShowDetails(true);
  };

  // Get latest scan for quick display
  const latestScan = piScans.length > 0 ? piScans[0] : null;

  return (
    <>
      <Card className={cn(
        "col-span-full",
        isConnected ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              <CardTitle className="text-lg">Raspberry Pi Live Scans</CardTitle>
              <Badge variant="outline" className={cn(
                "ml-2",
                isConnected ? "bg-green-500/10 text-green-500 border-green-500/30" : "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
              )}>
                {isConnected ? (
                  <><Wifi className="h-3 w-3 mr-1" /> Connected</>
                ) : isConnecting ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Connecting...</>
                ) : (
                  <><WifiOff className="h-3 w-3 mr-1" /> Disconnected</>
                )}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Button variant="outline" size="sm" onClick={disconnect}>
                  <WifiOff className="h-4 w-4 mr-1" />
                  Disconnect
                </Button>
              ) : (
                <>
                  <Input
                    placeholder="Server URL"
                    value={piUrlInput}
                    onChange={(e) => setPiUrlInput(e.target.value)}
                    className="w-[200px] h-8"
                    disabled={isConnecting}
                  />
                  <Button size="sm" onClick={handleConnect} disabled={isConnecting || !piUrlInput}>
                    {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Error message */}
          {error && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-500">
              {error}
            </div>
          )}

          {/* Stats Bar */}
          <div className="grid grid-cols-6 gap-2 text-center">
            <div className="bg-muted/50 rounded p-2">
              <div className="text-lg font-bold">{stats.totalScans}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="bg-red-500/10 rounded p-2">
              <div className="text-lg font-bold text-red-500">{stats.critical}</div>
              <div className="text-xs text-red-400">Critical</div>
            </div>
            <div className="bg-orange-500/10 rounded p-2">
              <div className="text-lg font-bold text-orange-500">{stats.high}</div>
              <div className="text-xs text-orange-400">High</div>
            </div>
            <div className="bg-yellow-500/10 rounded p-2">
              <div className="text-lg font-bold text-yellow-500">{stats.medium}</div>
              <div className="text-xs text-yellow-400">Medium</div>
            </div>
            <div className="bg-green-500/10 rounded p-2">
              <div className="text-lg font-bold text-green-500">{stats.normal}</div>
              <div className="text-xs text-green-400">Normal</div>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <div className="text-lg font-bold">
                {stats.lastSeen ? formatPiScanTime(stats.lastSeen) : '—'}
              </div>
              <div className="text-xs text-muted-foreground">Last Scan</div>
            </div>
          </div>

          {/* Latest Scan Preview */}
          {latestScan ? (
            <div className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    latestScan.severity === 'CRITICAL' ? "bg-red-500/20" :
                    latestScan.severity === 'HIGH' ? "bg-orange-500/20" :
                    latestScan.severity === 'MODERATE' ? "bg-yellow-500/20" :
                    "bg-green-500/20"
                  )}>
                    <Thermometer className={cn(
                      "h-5 w-5",
                      latestScan.severity === 'CRITICAL' ? "text-red-500" :
                      latestScan.severity === 'HIGH' ? "text-orange-500" :
                      latestScan.severity === 'MODERATE' ? "text-yellow-500" :
                      "text-green-500"
                    )} />
                  </div>
                  <div>
                    <div className="font-semibold">Latest Scan</div>
                    <div className="text-sm text-muted-foreground">
                      {formatPiScanTime(latestScan.timestamp)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getSeverityColor(latestScan.severity)}>
                    {latestScan.severity || 'LOW'}
                  </Badge>
                  <Badge className={getPriorityColor(latestScan.priority)}>
                    {latestScan.priority}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <span>{latestScan.totalPanels} panels</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>{latestScan.cleanPanelCount} clean</span>
                </div>
                <div className="flex items-center gap-2">
                  <Wind className="h-4 w-4 text-orange-500" />
                  <span>{latestScan.dustyPanelCount} dusty</span>
                </div>
                <div className="flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                  <span>Δ {latestScan.thermalDelta?.toFixed(1) || '—'}°C</span>
                </div>
              </div>

              {/* Image Preview */}
              <div className="flex gap-2 mt-3">
                {latestScan.thermalImageUrl && (
                  <div className="relative w-24 h-16 rounded overflow-hidden border">
                    <img 
                      src={latestScan.thermalImageUrl} 
                      alt="Thermal" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 text-center">
                      Thermal
                    </div>
                  </div>
                )}
                {latestScan.rgbImageUrl && (
                  <div className="relative w-24 h-16 rounded overflow-hidden border">
                    <img 
                      src={latestScan.rgbImageUrl} 
                      alt="RGB" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 text-center">
                      RGB
                    </div>
                  </div>
                )}
                {!latestScan.thermalImageUrl && !latestScan.rgbImageUrl && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Image className="h-4 w-4" />
                    <span>No images available</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-3">
                <Button variant="outline" size="sm" onClick={() => handleViewScan(latestScan)}>
                  <Eye className="h-4 w-4 mr-1" />
                  View Details
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {isConnected ? (
                <div className="flex flex-col items-center gap-2">
                  <Camera className="h-8 w-8 opacity-50" />
                  <p>Waiting for scans from Raspberry Pi...</p>
                  <p className="text-xs">Make sure your Pi is running and configured to send to this server</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <WifiOff className="h-8 w-8 opacity-50" />
                  <p>Connect to Pi receiver to see scans</p>
                  <p className="text-xs">Enter the server URL where your Pi is sending data</p>
                </div>
              )}
            </div>
          )}

          {/* Recent Scans List */}
          {piScans.length > 1 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2 flex items-center justify-between">
                <span>Recent Scans ({piScans.length})</span>
                <Button variant="ghost" size="sm" onClick={clearPiScans}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {piScans.slice(0, 10).map((scan) => (
                  <div 
                    key={scan.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleViewScan(scan)}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{formatPiScanTime(scan.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{scan.totalPanels} panels</span>
                      <Badge className={getSeverityColor(scan.severity)} variant="outline">
                        {scan.severity || 'LOW'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Details</DialogTitle>
            <DialogDescription>
              {selectedScan && formatPiScanTime(selectedScan.timestamp)} - {selectedScan?.deviceName || 'Raspberry Pi Scanner'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedScan && (
            <div className="space-y-4">
              {/* Priority & Status */}
              <div className="flex gap-2">
                <Badge className={getSeverityColor(selectedScan.severity)}>
                  {selectedScan.severity || 'LOW'} SEVERITY
                </Badge>
                <Badge className={getPriorityColor(selectedScan.priority)}>
                  {selectedScan.priority} PRIORITY
                </Badge>
                <Badge variant="outline">
                  Risk: {selectedScan.riskScore ?? 'N/A'}/100
                </Badge>
              </div>

              {/* Thermal Data */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-xs text-muted-foreground">Min Temp</div>
                  <div className="text-lg font-semibold">{selectedScan.thermalMinTemp?.toFixed(1) || '—'}°C</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Max Temp</div>
                  <div className="text-lg font-semibold">{selectedScan.thermalMaxTemp?.toFixed(1) || '—'}°C</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Mean Temp</div>
                  <div className="text-lg font-semibold">{selectedScan.thermalMeanTemp?.toFixed(1) || '—'}°C</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Delta</div>
                  <div className="text-lg font-semibold">{selectedScan.thermalDelta?.toFixed(1) || '—'}°C</div>
                </div>
              </div>

              {/* Panel Summary */}
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-semibold">{selectedScan.cleanPanelCount}</span>
                  <span className="text-muted-foreground">Clean</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <span className="font-semibold">{selectedScan.dustyPanelCount}</span>
                  <span className="text-muted-foreground">Dusty</span>
                </div>
                <div className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold">{selectedScan.totalPanels}</span>
                  <span className="text-muted-foreground">Total</span>
                </div>
              </div>

              {/* Images */}
              <div className="grid grid-cols-2 gap-4">
                {selectedScan.rgbImageUrl && (
                  <div>
                    <div className="text-sm font-medium mb-1">RGB Capture</div>
                    <img 
                      src={selectedScan.rgbImageUrl} 
                      alt="RGB" 
                      className="w-full h-48 object-cover rounded-lg border"
                    />
                  </div>
                )}
                {selectedScan.thermalImageUrl && (
                  <div>
                    <div className="text-sm font-medium mb-1">Thermal Image</div>
                    <img 
                      src={selectedScan.thermalImageUrl} 
                      alt="Thermal" 
                      className="w-full h-48 object-cover rounded-lg border"
                    />
                  </div>
                )}
              </div>

              {/* Panel Detections */}
              {selectedScan.panelDetections && selectedScan.panelDetections.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Panel Detections</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {selectedScan.panelDetections.map((panel) => (
                      <div 
                        key={panel.id} 
                        className={cn(
                          "p-2 rounded border",
                          panel.status === 'CLEAN' ? "bg-green-500/10 border-green-500/30" :
                          panel.status === 'DUSTY' ? "bg-orange-500/10 border-orange-500/30" :
                          "bg-muted"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{panel.panelNumber}</span>
                          <Badge variant="outline" className={cn(
                            panel.status === 'CLEAN' ? "text-green-500" :
                            panel.status === 'DUSTY' ? "text-orange-500" :
                            ""
                          )}>
                            {panel.status}
                          </Badge>
                        </div>
                        {panel.cropImageUrl && (
                          <img 
                            src={panel.cropImageUrl} 
                            alt={panel.panelNumber}
                            className="w-full h-16 mt-1 object-cover rounded"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PiScansWidget;

