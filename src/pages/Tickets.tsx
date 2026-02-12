import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
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
  Plus
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface TicketFromAPI {
  id: string;
  ticketNumber: string;
  panelId: string | null;
  faultId: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
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
  notes: Array<{
    id: string;
    authorId: string;
    content: string;
    createdAt: string;
  }>;
  panel?: {
    panelId: string;
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
  resolved: 'bg-green-500/10 text-green-500 border-green-500/30',
  closed: 'bg-muted text-muted-foreground border-muted',
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
  resolved: CheckCircle,
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
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({
    panelId: '',
    faultType: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    description: '',
  });

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
  }, []);

  const ticketCounts = {
    open: tickets.filter(t => t.status === 'open').length,
    'in-progress': tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
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

  const getTechnician = (id?: string | null) => technicians.find(t => t.id === id);
  const getRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown';
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  };
  const getPanelId = (ticket: TicketFromAPI) => {
    if (ticket.panelId) return ticket.panelId;
    if (ticket.panel?.panelId) return ticket.panel.panelId;
    return 'N/A';
  };

  const handleViewTicket = async (ticket: TicketFromAPI) => {
    setSelectedTicket(ticket);
    setTicketDetailsOpen(true);
    setLoadingDetails(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}`);
      if (response.ok) {
        const details = await response.json();
        setTicketDetails(details);
      } else {
        setTicketDetails(ticket); // fallback to list data
      }
    } catch (err) {
      console.error('Failed to fetch ticket details:', err);
      setTicketDetails(ticket); // fallback
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!newTicket.description.trim() || !newTicket.faultType.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    setCreatingTicket(true);
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          panelId: newTicket.panelId || null,
          priority: newTicket.priority,
          description: newTicket.description,
          faultType: newTicket.faultType,
        }),
      });

      if (response.ok) {
        const createdTicket = await response.json();
        setTickets(prev => [createdTicket, ...prev]);
        setCreateTicketOpen(false);
        setNewTicket({
          panelId: '',
          faultType: '',
          priority: 'medium',
          description: '',
        });
      } else {
        const error = await response.json();
        alert(`Failed to create ticket: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error creating ticket:', err);
      alert('Failed to create ticket. Please try again.');
    } finally {
      setCreatingTicket(false);
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
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <Filter className="mr-2 h-4 w-4" />
          More Filters
        </Button>
        <Button onClick={() => setCreateTicketOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Ticket
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

      {/* Create Ticket Dialog */}
      <Dialog open={createTicketOpen} onOpenChange={setCreateTicketOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Ticket</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="panelId">Panel ID (Optional)</Label>
              <Input
                id="panelId"
                placeholder="e.g., PNL-001"
                value={newTicket.panelId}
                onChange={(e) => setNewTicket(prev => ({ ...prev, panelId: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="faultType">Fault Type *</Label>
              <Input
                id="faultType"
                placeholder="e.g., Wiring Issue, Hot Spot, Cracked Panel"
                value={newTicket.faultType}
                onChange={(e) => setNewTicket(prev => ({ ...prev, faultType: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={newTicket.priority}
                onValueChange={(value: 'low' | 'medium' | 'high' | 'critical') =>
                  setNewTicket(prev => ({ ...prev, priority: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe the issue in detail..."
                value={newTicket.description}
                onChange={(e) => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTicketOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTicket} disabled={creatingTicket}>
              {creatingTicket ? 'Creating...' : 'Create Ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket Details Dialog */}
      <Dialog open={ticketDetailsOpen} onOpenChange={setTicketDetailsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ticket Details - {selectedTicket?.ticketNumber}</DialogTitle>
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

              {ticketDetails.droneImageUrl && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Drone Image</label>
                  <img src={ticketDetails.droneImageUrl} alt="Drone view" className="mt-1 w-full h-32 object-cover rounded-md" />
                </div>
              )}

              {ticketDetails.thermalImageUrl && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Thermal Image</label>
                  <img src={ticketDetails.thermalImageUrl} alt="Thermal view" className="mt-1 w-full h-32 object-cover rounded-md" />
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
              ? 'Create your first ticket to get started.' 
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTickets.map(ticket => {
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
                        <p className="font-semibold">{ticket.ticketNumber}</p>
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

                  {/* Notes indicator */}
                  {ticket.notes && ticket.notes.length > 0 && (
                    <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {ticket.notes.length} note{ticket.notes.length > 1 ? 's' : ''}
                    </div>
                  )}

                  {/* Resolution info */}
                  {ticket.status === 'resolved' && ticket.resolutionNotes && (
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

