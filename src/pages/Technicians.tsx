import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Technician, Ticket } from '@/types/solar';
import { cn } from '@/lib/utils';
import {
  Phone,
  Mail,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Award,
  UserPlus,
  Pencil,
  Trash2
} from 'lucide-react';

const statusColors = {
  available: 'bg-success text-success-foreground',
  busy: 'bg-warning text-warning-foreground',
  offline: 'bg-muted text-muted-foreground',
};

const statusDots = {
  available: 'bg-success',
  busy: 'bg-warning',
  offline: 'bg-muted-foreground',
};

interface NewTechnicianData {
  name: string;
  email: string;
  phoneDigits: string;
  skills: string;
}

interface TechnicianFormData {
  name: string;
  email: string;
  phoneDigits: string;
  skills: string;
}

export default function Technicians() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTechnician, setNewTechnician] = useState<NewTechnicianData>({
    name: '',
    email: '',
    phoneDigits: '',
    skills: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTechnicianId, setEditingTechnicianId] = useState<string | null>(null);
  const [editTechnician, setEditTechnician] = useState<TechnicianFormData>({
    name: '',
    email: '',
    phoneDigits: '',
    skills: ''
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduledTech, setScheduledTech] = useState<Technician | null>(null);
  const [assignedTickets, setAssignedTickets] = useState<Ticket[]>([]);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch technicians
        const techResponse = await fetch('/api/technicians');
        if (techResponse.ok) {
          const techData = await techResponse.json();
          if (techData.length > 0) {
            // Parse skills from JSON strings
            const parsedData = techData.map((tech: any) => ({
              ...tech,
              skills: parseSkillsField(tech.skills),
            }));
            setTechnicians(parsedData);
          }
        }

        // Fetch open tickets count
        const ticketsResponse = await fetch('/api/tickets?status=open');
        if (ticketsResponse.ok) {
          const ticketsData = await ticketsResponse.json();
          setOpenTicketsCount(ticketsData.filter((ticket: Ticket) => !ticket.assignedTechnicianId).length);
        }
      } catch (err) {
        console.warn('API unavailable, showing empty data');
        // Data remains empty
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const totalTechnicians = technicians.length;
  const availableCount = technicians.filter(t => t.status === 'available').length;
  const busyCount = technicians.filter(t => t.status === 'busy').length;
  const offlineCount = totalTechnicians - availableCount - busyCount;
  const parseSkillsField = (skills: unknown): string[] => {
    if (Array.isArray(skills)) {
      return skills.map(s => String(s).trim()).filter(Boolean);
    }
    if (typeof skills === 'string') {
      try {
        const parsed = JSON.parse(skills);
        return Array.isArray(parsed) ? parsed.map(s => String(s).trim()).filter(Boolean) : [];
      } catch {
        return skills.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return [];
  };

  const validateTechnicianForm = (data: TechnicianFormData) => {
    if (!data.name.trim() || !data.email.trim() || !data.phoneDigits.trim() || !data.skills.trim()) {
      alert('All fields are mandatory');
      return false;
    }
    if (data.name.trim().length > 20) {
      alert('Name must be 20 characters or less');
      return false;
    }
    if (data.phoneDigits.length !== 10) {
      alert('Phone number must be exactly 10 digits');
      return false;
    }
    const parsedSkills = data.skills.split(',').map(s => s.trim()).filter(Boolean);
    if (parsedSkills.length === 0) {
      alert('Skills field is mandatory');
      return false;
    }
    return true;
  };

  const handleDeleteTechnician = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this technician?')) {
      // Frontend fallback records use temporary ids and don't exist in the API.
      if (id.startsWith('tech-')) {
        setTechnicians(prev => prev.filter(t => t.id !== id));
        return;
      }

      try {
        const response = await fetch(`/api/technicians/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setTechnicians(prev => prev.filter(t => t.id !== id));
        } else {
          let errorMessage = 'Failed to delete technician';
          try {
            const errorData = await response.json();
            if (errorData?.error) {
              errorMessage = errorData.error;
            }
          } catch {
            // Keep default error message when body is not JSON
          }
          alert(errorMessage);
        }
      } catch (err) {
        console.error('Failed to delete technician:', err);
        alert('Failed to delete technician');
      }
    }
  };

  const handleAddTechnician = async () => {
    if (!validateTechnicianForm(newTechnician)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const technicianData = {
        name: newTechnician.name,
        email: newTechnician.email,
        phone: '+91' + newTechnician.phoneDigits,
        skills: newTechnician.skills.split(',').map(s => s.trim()).filter(s => s),
        status: 'available' as const,
        activeTickets: 0,
        resolvedTickets: 0,
        avgResolutionTime: 0,
      };

      const response = await fetch('/api/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(technicianData),
      });

      if (response.ok) {
        const created = await response.json();
        // Parse skills from JSON strings
        const parsedCreated: Technician = {
          ...created,
          skills: parseSkillsField(created.skills),
          status: created.status as Technician['status'],
        };
        setTechnicians(prev => [...prev, parsedCreated]);
      } else {
        const newTech: Technician = {
          id: `tech-${Date.now()}`,
          ...technicianData,
          avatar: '',
        };
        setTechnicians(prev => [...prev, newTech]);
      }

      setNewTechnician({
        name: '',
        email: '',
        phoneDigits: '',
        skills: ''
      });
      setIsDialogOpen(false);
    } catch (err) {
      console.error('Failed to create technician:', err);
      const newTech: Technician = {
        id: `tech-${Date.now()}`,
        name: newTechnician.name,
        email: newTechnician.email,
        phone: '+91' + newTechnician.phoneDigits,
        avatar: '',
        status: 'available',
        skills: newTechnician.skills.split(',').map(s => s.trim()).filter(s => s),
        activeTickets: 0,
        resolvedTickets: 0,
        avgResolutionTime: 0,
      };
      setTechnicians(prev => [...prev, newTech]);
      setNewTechnician({
        name: '',
        email: '',
        phoneDigits: '',
        skills: ''
      });
      setIsDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (tech: Technician) => {
    const digitsOnly = tech.phone.replace(/\D/g, '');
    setEditingTechnicianId(tech.id);
    setEditTechnician({
      name: tech.name,
      email: tech.email,
      phoneDigits: digitsOnly.slice(-10),
      skills: tech.skills.join(', '),
    });
    setIsEditDialogOpen(true);
  };

  const handleEditTechnician = async () => {
    if (!editingTechnicianId) return;
    if (!validateTechnicianForm(editTechnician)) {
      return;
    }

    setIsEditSubmitting(true);
    const parsedSkills = editTechnician.skills.split(',').map(s => s.trim()).filter(Boolean);
    const technicianData = {
      name: editTechnician.name.trim(),
      email: editTechnician.email.trim(),
      phone: '+91' + editTechnician.phoneDigits,
      skills: parsedSkills,
    };

    try {
      const response = await fetch(`/api/technicians/${editingTechnicianId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(technicianData),
      });

      if (response.ok) {
        const updated = await response.json();
        setTechnicians(prev => prev.map(t =>
          t.id === editingTechnicianId
            ? {
                ...t,
                ...updated,
                skills: parseSkillsField(updated.skills),
                status: updated.status as Technician['status'],
              }
            : t
        ));
      } else {
        alert('Failed to update technician');
      }
    } catch (err) {
      console.error('Failed to update technician:', err);
      setTechnicians(prev => prev.map(t =>
        t.id === editingTechnicianId
          ? {
              ...t,
              ...technicianData,
            }
          : t
      ));
    } finally {
      setIsEditSubmitting(false);
      setIsEditDialogOpen(false);
      setEditingTechnicianId(null);
    }
  };

  const handleScheduleClick = async (tech: Technician) => {
    setScheduledTech(tech);
    try {
      const response = await fetch(`/api/tickets?assignedTo=${tech.id}`);
      if (response.ok) {
        const tickets = await response.json();
        setAssignedTickets(tickets);
        setScheduleDialogOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch assigned tickets:', err);
    }
  };

  const getExpectedResolutionDate = (ticket: Ticket) => {
    const createdDate = new Date(ticket.createdAt);
    let daysToAdd = 0;

    switch (ticket.priority) {
      case 'critical':
        daysToAdd = 1;
        break;
      case 'high':
        daysToAdd = 3;
        break;
      case 'medium':
        daysToAdd = 7;
        break;
      case 'low':
        daysToAdd = 14;
        break;
      default:
        daysToAdd = 7;
    }

    const expectedDate = new Date(createdDate);
    expectedDate.setDate(expectedDate.getDate() + daysToAdd);
    return expectedDate.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading technicians...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Technician Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add New Technician
            </DialogTitle>
            <DialogDescription>
              Enter the details to add a new technician to your team.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                required
                maxLength={20}
                value={newTechnician.name}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, name: e.target.value.slice(0, 20) }))}
                placeholder="John Smith"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                required
                value={newTechnician.email}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john.smith@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number (+91) *</Label>
              <Input
                id="phone"
                type="tel"
                required
                value={newTechnician.phoneDigits}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, phoneDigits: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="Enter 10 digits"
                maxLength={10}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skills">Skills (comma-separated) *</Label>
              <Input
                id="skills"
                required
                value={newTechnician.skills}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, skills: e.target.value }))}
                placeholder="Panel Replacement, Electrical Diagnostics"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAddTechnician} disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Technician'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Technician Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Technician
            </DialogTitle>
            <DialogDescription>
              Update technician details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Full Name *</Label>
              <Input
                id="edit-name"
                required
                maxLength={20}
                value={editTechnician.name}
                onChange={(e) => setEditTechnician(prev => ({ ...prev, name: e.target.value.slice(0, 20) }))}
                placeholder="John Smith"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email Address *</Label>
              <Input
                id="edit-email"
                type="email"
                required
                value={editTechnician.email}
                onChange={(e) => setEditTechnician(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john.smith@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone Number (+91) *</Label>
              <Input
                id="edit-phone"
                type="tel"
                required
                value={editTechnician.phoneDigits}
                onChange={(e) => setEditTechnician(prev => ({ ...prev, phoneDigits: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="Enter 10 digits"
                maxLength={10}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-skills">Skills (comma-separated) *</Label>
              <Input
                id="edit-skills"
                required
                value={editTechnician.skills}
                onChange={(e) => setEditTechnician(prev => ({ ...prev, skills: e.target.value }))}
                placeholder="Panel Replacement, Electrical Diagnostics"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isEditSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditTechnician} disabled={isEditSubmitting}>
              {isEditSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Schedule for {scheduledTech?.name}</DialogTitle>
            <DialogDescription>
              Current assigned tickets and expected resolution dates
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {assignedTickets.length === 0 ? (
              <p className="text-muted-foreground">No tickets currently assigned to this technician.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {assignedTickets.map(ticket => (
                  <div key={ticket.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium">{ticket.ticketNumber}</p>
                          <Badge variant="outline" className="text-xs">
                            {ticket.priority}
                          </Badge>
                          <Badge className={statusColors[ticket.status] || statusColors.open}>
                            {ticket.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{ticket.description}</p>
                        <div className="text-xs text-muted-foreground">
                          <p>Created: {new Date(ticket.createdAt).toLocaleDateString()}</p>
                          <p>Expected Resolution: {getExpectedResolutionDate(ticket)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setScheduleDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Technicians</h1>
          <p className="text-muted-foreground">
            Manage your maintenance team
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Technician
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Team</p>
                <p className="text-3xl font-bold">{totalTechnicians}</p>
              </div>
              <div className="rounded-xl bg-primary/10 p-3">
                <Award className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-3xl font-bold text-success">{availableCount}</p>
              </div>
              <div className="rounded-xl bg-success/10 p-3">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Busy</p>
                <p className="text-3xl font-bold text-warning">{busyCount}</p>
              </div>
              <div className="rounded-xl bg-warning/10 p-3">
                <Clock className="h-6 w-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Offline</p>
                <p className="text-3xl font-bold text-muted-foreground">{offlineCount}</p>
              </div>
              <div className="rounded-xl bg-muted/10 p-3">
                <AlertCircle className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Tickets</p>
                <p className="text-3xl font-bold text-blue-600">{openTicketsCount}</p>
              </div>
              <div className="rounded-xl bg-blue-500/10 p-3">
                <AlertTriangle className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {technicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Award className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No technicians found</h3>
          <p className="text-muted-foreground">Add your first technician to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {technicians.map(tech => (
            <Card
              key={tech.id}
              className={cn(
                'card-hover cursor-pointer',
                selectedTech?.id === tech.id && 'ring-2 ring-primary'
              )}
              onClick={() => setSelectedTech(tech)}
            >
              <CardContent className="p-6">
                {/* Header */}
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={tech.avatar} />
                      <AvatarFallback>{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      'absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-card',
                      statusDots[tech.status]
                    )} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{tech.name}</h3>
                        <Badge className={cn('mt-1', statusColors[tech.status])}>
                          {tech.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact */}
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{tech.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{tech.phone}</span>
                  </div>
                </div>

                {/* Skills */}
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {tech.skills.length > 0 ? (
                      <>
                        {tech.skills.slice(0, 3).map(skill => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {tech.skills.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{tech.skills.length - 3}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">No skills added</span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
                  <div className="text-center">
                    <p className="text-lg font-semibold">{tech.activeTickets}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{tech.resolvedTickets}</p>
                    <p className="text-xs text-muted-foreground">Resolved</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{tech.avgResolutionTime.toFixed(1)}h</p>
                    <p className="text-xs text-muted-foreground">Avg Time</p>
                  </div>
                </div>

                {/* Workload */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Workload</span>
                    <span className="font-medium">{Math.min(tech.activeTickets * 25, 100)}%</span>
                  </div>
                  <Progress value={Math.min(tech.activeTickets * 25, 100)} className="mt-2 h-2" />
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleScheduleClick(tech)}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEditClick(tech)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteTechnician(tech.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

