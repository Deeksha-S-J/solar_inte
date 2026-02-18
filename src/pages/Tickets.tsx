import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import {
  Search,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MessageSquare,
  ExternalLink,
  Filter,
  Wifi,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface TicketFromAPI {
  id: string;
  ticketNumber: string;
  panelId: string | null;
  faultId: string | null;
  status: 'open' | 'in_progress' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  assignedTechnicianId: string | null;
  description: string;
  faultType: string;
  aiAnalysis: string;
  recommendedAction: string;
  resolutionNotes: string | null;
  resolutionCause: string | null;
  droneImageUrl: string | null;
  thermalImageUrl: string | null;
  zone: string | null;  // Zone name (e.g., "A", "B")
  row: number | null;   // Row number
  notes: Array<{
    id: string;
    authorId: string;
    content: string;
    createdAt: string;
  }>;
  panel?: {
    panelId: string;
    row?: number;
    column?: number;
    zone?: { name: string };
  };
  assignedTechnician?: {
    id: string;
    name: string;
    avatar: string | null;
  };
}

const statusColors: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  'in-progress': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  in_progress: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  closed: 'bg-muted text-muted-foreground border-muted'
};

const priorityColors: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-500 text-blue-500-foreground',
  high: 'bg-yellow-500 text-yellow-500-foreground',
  critical: 'bg-red-500 text-red-500-foreground animate-pulse',
};

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  open: AlertTriangle,
  'in-progress': Clock,
  in_progress: Clock,
  closed: XCircle,
};

export default function Tickets() {
  const [tickets, setTickets] = useState<TicketFromAPI[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; name: string; avatar: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [technicianFilter, setTechnicianFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<TicketFromAPI | null>(null);
  const [ticketDetailsOpen, setTicketDetailsOpen] = useState(false);
  const [ticketDetails, setTicketDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [ticketAlertMeta, setTicketAlertMeta] = useState<{ alertId?: string | null; scanId?: string | null } | null>(null);
  const [ticketScanDetails, setTicketScanDetails] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/tickets');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            setTickets(data);
            // Extract unique technicians from tickets
            const techs = data
              .filter((t: TicketFromAPI) => t.assignedTechnician)
              .map((t: TicketFromAPI) => t.assignedTechnician!);
            setTechnicians(techs);
          }
        }
      } catch (err) {
        console.warn('API unavailable, showing empty tickets');
        // Data remains empty
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    // Refetch when window gets focus to update counts after assignments from other pages
    const handleFocus = () => fetchData();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const ticketCounts = {
    open: tickets.filter(t => t.status === 'open').length,
    'in-progress': tickets.filter(t => t.status === 'in_progress').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

  const filteredTickets = tickets.filter(ticket => {
    const statusMatch = statusFilter === 'all' ||
      (statusFilter === 'in-progress' ? ticket.status === 'in_progress' : ticket.status === statusFilter);
    const searchMatch =
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ticket.panelId && ticket.panelId.toLowerCase().includes(searchQuery.toLowerCase()));
    const priorityMatch = priorityFilter === 'all' || ticket.priority === priorityFilter;
    const technicianMatch = technicianFilter === 'all' || ticket.assignedTechnicianId === technicianFilter;
    return statusMatch && searchMatch && priorityMatch && technicianMatch;
  });
  const sortedTickets = [...filteredTickets].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const getTechnician = (id?: string | null) => technicians.find(t => t.id === id);
  const getRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown';
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  };
  const getPanelId = (ticket: TicketFromAPI) => {
    // If zone and row are available (from alert-based tickets), show those
    if (ticket.zone && ticket.row !== null) {
      return `Zone ${ticket.zone}, Row ${ticket.row}`;
    }
    // Fallback: try to get from panel data (for existing tickets)
    if (ticket.panel?.zone?.name && ticket.panel?.row !== undefined) {
      return `Zone ${ticket.panel.zone.name}, Row ${ticket.panel.row}`;
    }
    // Fallback to panel ID
    if (ticket.panelId) return ticket.panelId;
    if (ticket.panel?.panelId) return ticket.panel.panelId;
    return 'N/A';
  };
  const getDisplayTicketNumber = (index: number) => `TCK ${String(index + 1).padStart(3, '0')}`;
  const getDisplayTicketLabel = (ticket: TicketFromAPI, index: number) => {
    const row = ticket.panel?.row;
    const column = ticket.panel?.column;
    if (typeof row === 'number' && typeof column === 'number') {
      return `ROW ${row} - P${column}`;
    }
    return getDisplayTicketNumber(index);
  };

  const handleViewTicket = async (ticket: TicketFromAPI) => {
    setSelectedTicket(ticket);
    setTicketDetailsOpen(true);
    setLoadingDetails(true);
    setTicketAlertMeta(null);
    setTicketScanDetails(null);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`);
      if (response.ok) {
        const details = await response.json();
        setTicketDetails(details);
      } else {
        setTicketDetails(ticket); // fallback to list data
      }
      // Fetch alert meta (alertId + scanId) for this ticket
      try {
        const alertsRes = await fetch('/api/alerts');
        if (alertsRes.ok) {
          const alerts = await alertsRes.json();
          const alert = alerts.find((a: any) => a.ticketId === ticket.id);
          if (alert) {
            setTicketAlertMeta({ alertId: alert.alertId || null, scanId: alert.scanId || null });
            if (alert.scanId) {
              const scanRes = await fetch(`/api/solar-scans/${alert.scanId}`);
              if (scanRes.ok) {
                const scan = await scanRes.json();
                setTicketScanDetails(scan);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch alert/scan details:', err);
      }
    } catch (err) {
      console.error('Failed to fetch ticket details:', err);
      setTicketDetails(ticket); // fallback
    } finally {
      setLoadingDetails(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tickets & Maintenance</h1>
        <p className="text-muted-foreground">
          Manage fault reports and maintenance tasks
        </p>
      </div>

      {/* Status Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ticketCounts).map(([status, count]) => {
          const statusKey = status === 'in-progress' ? 'in_progress' : status;
          const StatusIcon = statusIcons[statusKey] || AlertTriangle;
          return (
            <Card
              key={status}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md',
                statusFilter === status && 'ring-2 ring-primary'
              )}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            >
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium capitalize text-muted-foreground">{status.replace('-', ' ')}</p>
                  <p className="text-3xl font-bold">{count}</p>
                </div>
                <div className={cn('rounded-xl p-3', statusColors[statusKey] || statusColors.open)}>
                  <StatusIcon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ticket # or panel ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <Filter className="mr-2 h-4 w-4" />
          More Filters
        </Button>
      </div>

      {/* More Filters Dialog */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Advanced Filters</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Priority</label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Assigned Technician</label>
              <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Technicians" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Technicians</SelectItem>
                  {technicians.map(tech => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPriorityFilter('all');
              setTechnicianFilter('all');
            }}>
              Clear Filters
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>
              Apply Filters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket Details Dialog */}
      <Dialog open={ticketDetailsOpen} onOpenChange={setTicketDetailsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Ticket Details - {selectedTicket ? getDisplayTicketLabel(selectedTicket, filteredTickets.findIndex(t => t.id === selectedTicket.id)) : ''}
            </DialogTitle>
          </DialogHeader>
          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : ticketDetails ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    <Badge className={statusColors[ticketDetails.status] || statusColors.open}>
                      {ticketDetails.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Priority</label>
                  <div className="mt-1">
                    <Badge className={priorityColors[ticketDetails.priority] || priorityColors.medium}>
                      {ticketDetails.priority}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Panel ID</label>
                  <p className="mt-1">{getPanelId(ticketDetails)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Fault Type</label>
                  <p className="mt-1">{ticketDetails.faultType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created</label>
                  <p className="mt-1">{getRelativeTime(ticketDetails.createdAt)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Assigned To</label>
                  <p className="mt-1">
                    {getTechnician(ticketDetails.assignedTechnicianId)?.name || 'Unassigned'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Alert ID</label>
                  <p className="mt-1 font-mono text-xs">
                    {ticketAlertMeta?.alertId || 'N/A'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Description</label>
                <p className="mt-1 p-3 bg-muted rounded-md">{ticketDetails.description}</p>
              </div>

              {ticketDetails.aiAnalysis && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">AI Analysis</label>
                  <p className="mt-1 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md">{ticketDetails.aiAnalysis}</p>
                </div>
              )}

              {ticketDetails.recommendedAction && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Recommended Action</label>
                  <p className="mt-1 p-3 bg-green-50 dark:bg-green-950/20 rounded-md">{ticketDetails.recommendedAction}</p>
                </div>
              )}

              {(ticketDetails.droneImageUrl || ticketDetails.fault?.droneImageUrl) && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Drone Image</label>
                  <img
                    src={ticketDetails.droneImageUrl || ticketDetails.fault?.droneImageUrl}
                    alt="Drone view"
                    className="mt-1 w-full h-32 object-cover rounded-md"
                  />
                </div>
              )}

              {(ticketDetails.thermalImageUrl || ticketDetails.fault?.thermalImageUrl) && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Thermal Image</label>
                  <img
                    src={ticketDetails.thermalImageUrl || ticketDetails.fault?.thermalImageUrl}
                    alt="Thermal view"
                    className="mt-1 w-full h-32 object-cover rounded-md"
                  />
                </div>
              )}

              {ticketScanDetails && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Scan Details</label>
                    <div className="mt-1 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Timestamp</span>
                        <p className="mt-1">{ticketScanDetails.timestamp || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Device ID</span>
                        <p className="mt-1">{ticketScanDetails.deviceId || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {(ticketScanDetails.rgbImageUrl || ticketScanDetails.thermalImageUrl) && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {ticketScanDetails.rgbImageUrl && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Scan RGB</label>
                          <img
                            src={ticketScanDetails.rgbImageUrl}
                            alt="Scan RGB"
                            className="mt-1 w-full h-40 object-cover rounded-md"
                          />
                        </div>
                      )}
                      {ticketScanDetails.thermalImageUrl && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Scan Thermal</label>
                          <img
                            src={ticketScanDetails.thermalImageUrl}
                            alt="Scan Thermal"
                            className="mt-1 w-full h-40 object-cover rounded-md"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {Array.isArray(ticketScanDetails.panelDetections) && ticketScanDetails.panelDetections.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Panel Crops</label>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                        {ticketScanDetails.panelDetections.map((panel: any) => (
                          <div key={panel.id} className="rounded-md border overflow-hidden">
                            {panel.cropImageUrl ? (
                              <img
                                src={panel.cropImageUrl}
                                alt={panel.panelNumber}
                                className="w-full h-24 object-cover"
                              />
                            ) : (
                              <div className="w-full h-24 flex items-center justify-center text-xs text-muted-foreground">
                                No image
                              </div>
                            )}
                            <div className="px-2 py-1 text-xs flex items-center justify-between">
                              <span>{panel.panelNumber || 'Panel'}</span>
                              <span className="text-muted-foreground">{panel.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {ticketDetails.notes && ticketDetails.notes.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Notes</label>
                  <div className="mt-1 space-y-2">
                    {ticketDetails.notes.map((note: any) => (
                      <div key={note.id} className="p-3 bg-muted rounded-md">
                        <p className="text-sm">{note.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {note.author?.name || 'Unknown'} - {getRelativeTime(note.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ticketDetails.resolutionNotes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Resolution</label>
                  <div className="mt-1 p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
                    <p>{ticketDetails.resolutionNotes}</p>
                    {ticketDetails.resolutionCause && (
                      <p className="text-sm text-muted-foreground mt-1">Cause: {ticketDetails.resolutionCause}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">Failed to load ticket details</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Empty State */}
      {filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No tickets found</h3>
          <p className="text-muted-foreground">
            {tickets.length === 0
              ? 'No tickets available.'
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedTickets.map((ticket, index) => {
            const technician = getTechnician(ticket.assignedTechnicianId);
            const statusKey = ticket.status === 'in_progress' ? 'in-progress' : ticket.status;
            const StatusIcon = statusIcons[ticket.status] || AlertTriangle;
            const panelId = getPanelId(ticket);

            return (
              <Card key={ticket.id} className="card-hover">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Left - Status & Priority */}
                    <div className="flex items-center gap-3">
                      <div className={cn('rounded-lg p-2', statusColors[ticket.status] || statusColors.open)}>
                        <StatusIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">#{index + 1}</p>
                        <p className="font-semibold">{getDisplayTicketLabel(ticket, index)}</p>
                        <p className="text-sm text-muted-foreground">{ticket.faultType}</p>
                      </div>
                    </div>

                    {/* Middle - Info */}
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{panelId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{getRelativeTime(ticket.createdAt)}</span>
                      </div>
                      <Badge className={priorityColors[ticket.priority] || priorityColors.medium}>
                        {ticket.priority}
                      </Badge>
                      {technician && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={technician.avatar || undefined} />
                            <AvatarFallback className="text-xs">
                              {technician.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground">{technician.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Right - Actions */}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColors[ticket.status] || statusColors.open}>
                        {statusKey}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => handleViewTicket(ticket)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View
                      </Button>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm">{ticket.description}</p>
                  </div>

                  {/* Scan Images Thumbnails */}
                  {(ticket.droneImageUrl || ticket.thermalImageUrl) && (
                    <div className="mt-4 flex gap-2">
                      {ticket.droneImageUrl && (
                        <div className="relative w-16 h-16 rounded overflow-hidden border">
                          <img 
                            src={ticket.droneImageUrl} 
                            alt="Drone" 
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 text-center">
                            Drone
                          </div>
                        </div>
                      )}
                      {ticket.thermalImageUrl && (
                        <div className="relative w-16 h-16 rounded overflow-hidden border">
                          <img 
                            src={ticket.thermalImageUrl} 
                            alt="Thermal" 
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 text-center">
                            Thermal
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes indicator */}
                  {ticket.notes && ticket.notes.length > 0 && (
                    <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {ticket.notes.length} note{ticket.notes.length > 1 ? 's' : ''}
                    </div>
                  )}

                  {/* Resolution info */}
                  {ticket.status === 'closed' && ticket.resolutionNotes && (
                    <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                      <p className="text-xs font-medium text-green-500">Resolution</p>
                      <p className="mt-1 text-sm">{ticket.resolutionNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

