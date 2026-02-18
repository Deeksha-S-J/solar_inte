import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  PiAnalysisResult, 
  convertPiResultToSolarScan, 
  SolarScan,
  PiReport,
  PiRgbStats,
  PiPanelCrop 
} from '@/types/solar';

export interface PiReceiverStats {
  totalScans: number;
  critical: number;
  high: number;
  medium: number;
  normal: number;
  piConnected: boolean;
  lastSeen: string | null;
}

export interface PiReceiverState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  piScans: SolarScan[];
  stats: PiReceiverStats;
  serverUrl: string;
}

export interface UsePiReceiverReturn extends PiReceiverState {
  connect: (url: string) => void;
  disconnect: () => void;
  clearPiScans: () => void;
  removePiScan: (scanId: string) => void;
  getScanById: (scanId: string) => SolarScan | undefined;
}

// Default backend URL - assumes backend runs on same host or via environment
const DEFAULT_PI_RECEIVER_URL = 
  import.meta.env.VITE_PI_RECEIVER_URL || 
  import.meta.env.VITE_API_URL || 
  'http://localhost:3000';

// Initial stats state
const initialStats: PiReceiverStats = {
  totalScans: 0,
  critical: 0,
  high: 0,
  medium: 0,
  normal: 0,
  piConnected: false,
  lastSeen: null,
};

export function usePiReceiver(): UsePiReceiverReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [piScans, setPiScans] = useState<SolarScan[]>([]);
  const [stats, setStats] = useState<PiReceiverStats>(initialStats);
  const [serverUrl, setServerUrl] = useState(DEFAULT_PI_RECEIVER_URL);

  const socketRef = useRef<Socket | null>(null);

  const loadHistory = useCallback(async (url: string) => {
    try {
      const response = await fetch(`${url}/api/pi-results`);
      if (!response.ok) {
        console.warn('Failed to fetch Pi results history:', response.status);
        return;
      }

      const payload = await response.json();
      const items = Array.isArray(payload?.results) ? payload.results : [];
      
      // Convert and sort by timestamp (newest first)
      const mapped = items
        .map((item: PiAnalysisResult) => {
          try {
            return convertPiResultToSolarScan(item);
          } catch (err) {
            console.error('Error converting Pi result:', err);
            return null;
          }
        })
        .filter(Boolean) as SolarScan[];

      // Sort by timestamp descending
      mapped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setPiScans(mapped);
      
      // Calculate stats from history
      const newStats: PiReceiverStats = {
        totalScans: mapped.length,
        critical: mapped.filter(s => s.priority === 'HIGH' && (s.riskScore ?? 0) > 70).length,
        high: mapped.filter(s => s.priority === 'HIGH').length,
        medium: mapped.filter(s => s.priority === 'MEDIUM').length,
        normal: mapped.filter(s => s.priority === 'NORMAL').length,
        piConnected: true,
        lastSeen: mapped.length > 0 ? mapped[0].timestamp : null,
      };
      setStats(newStats);
      
    } catch (err) {
      console.warn('Failed to load Pi results history:', err);
    }
  }, []);

  const updateStatsFromResult = useCallback((result: PiAnalysisResult) => {
    setStats(prev => {
      const priority = result.report?.priority?.toUpperCase() || 'NORMAL';
      const riskScore = result.thermal?.risk_score ?? (100 - (result.report?.health_score ?? 100));
      
      return {
        ...prev,
        totalScans: prev.totalScans + 1,
        critical: priority === 'HIGH' && riskScore > 70 ? prev.critical + 1 : prev.critical,
        high: priority === 'HIGH' ? prev.high + 1 : prev.high,
        medium: priority === 'MEDIUM' ? prev.medium + 1 : prev.medium,
        normal: priority === 'NORMAL' ? prev.normal + 1 : prev.normal,
        lastSeen: result.timestamp || new Date().toISOString(),
        piConnected: true,
      };
    });
  }, []);

  const connect = useCallback(
    (url: string) => {
      // Prevent duplicate connections
      if (socketRef.current?.connected) {
        console.log('Already connected to Pi receiver');
        return;
      }

      setIsConnecting(true);
      setError(null);
      setServerUrl(url);

      try {
        const socket = io(url, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
        });

        socket.on('connect', () => {
          console.log('[PiReceiver] Connected to server:', url);
          setIsConnected(true);
          setIsConnecting(false);
          setError(null);
          loadHistory(url);
        });

        socket.on('disconnect', (reason) => {
          console.log('[PiReceiver] Disconnected:', reason);
          setIsConnected(false);
          setStats(prev => ({ ...prev, piConnected: false }));
        });

        socket.on('connect_error', (err) => {
          console.error('[PiReceiver] Connection error:', err.message);
          setError(err.message);
          setIsConnecting(false);
          setIsConnected(false);
        });

        socket.on('new_result', (data: PiAnalysisResult) => {
          console.log('[PiReceiver] New result received:', data.capture_id);
          try {
            const solarScan = convertPiResultToSolarScan(data);
            
            setPiScans(prev => {
              // Remove duplicates and add new scan at the beginning
              const deduped = prev.filter((scan) => scan.id !== solarScan.id);
              return [solarScan, ...deduped].slice(0, 50); // Keep max 50 scans
            });
            
            updateStatsFromResult(data);
          } catch (err) {
            console.error('[PiReceiver] Error converting Pi result:', err);
          }
        });

        socket.on('error', (err) => {
          console.error('[PiReceiver] Socket error:', err);
        });

        socketRef.current = socket;
      } catch (err) {
        console.error('[PiReceiver] Failed to create socket:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
        setIsConnecting(false);
      }
    },
    [loadHistory, updateStatsFromResult]
  );

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const clearPiScans = useCallback(() => {
    setPiScans([]);
    setStats(prev => ({ ...prev, totalScans: 0, critical: 0, high: 0, medium: 0, normal: 0 }));
  }, []);

  const removePiScan = useCallback((scanId: string) => {
    setPiScans(prev => prev.filter((scan) => scan.id !== scanId));
  }, []);

  const getScanById = useCallback((scanId: string) => {
    return piScans.find(scan => scan.id === scanId);
  }, [piScans]);

  // Auto-connect on mount
  useEffect(() => {
    if (DEFAULT_PI_RECEIVER_URL && !socketRef.current) {
      connect(DEFAULT_PI_RECEIVER_URL);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return {
    isConnected,
    isConnecting,
    error,
    piScans,
    stats,
    serverUrl,
    connect,
    disconnect,
    clearPiScans,
    removePiScan,
    getScanById,
  };
}

// Get image URL from Pi result for display
export function getPiScanImageUrls(result: PiAnalysisResult): {
  rgbUrl: string | null;
  thermalUrl: string | null;
  cropUrls: string[];
} {
  return {
    rgbUrl: result.main_image_web || null,
    thermalUrl: result.thermal_image_web || null,
    cropUrls: result.panel_crops?.map(crop => crop.web_path || '').filter(Boolean) || [],
  };
}

// Format timestamp for display
export function formatPiScanTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

// Get priority color class
export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'HIGH': return 'text-red-500';
    case 'MEDIUM': return 'text-yellow-500';
    case 'NORMAL': return 'text-green-500';
    default: return 'text-gray-500';
  }
}

// Get severity color class
export function getSeverityColor(severity: string | null | undefined): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-500/10 text-red-500 border-red-500/30';
    case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
    case 'MODERATE': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    case 'LOW': return 'bg-green-500/10 text-green-500 border-green-500/30';
    default: return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
  }
}

