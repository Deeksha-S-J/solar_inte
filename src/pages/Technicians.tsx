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
import { Technician } from '@/types/solar';
import { cn } from '@/lib/utils';
import {
  Phone,
  Mail,
  Star,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  Award,
  UserPlus,
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
  certifications: string;
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
    skills: '',
    certifications: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchTechnicians() {
      try {
        const response = await fetch('/api/technicians');
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) {
            // Parse skills and certifications from JSON strings
            const parsedData = data.map((tech: any) => ({
              ...tech,
              skills: JSON.parse(tech.skills || '[]'),
              certifications: JSON.parse(tech.certifications || '[]'),
            }));
            setTechnicians(parsedData);
          }
        }
      } catch (err) {
        console.warn('API unavailable, showing empty technicians');
        // Technicians remain empty
      } finally {
        setLoading(false);
      }
    }
    fetchTechnicians();
  }, []);

  const totalTechnicians = technicians.length;
  const availableCount = technicians.filter(t => t.status === 'available').length;
  const busyCount = technicians.filter(t => t.status === 'busy').length;
  const offlineCount = totalTechnicians - availableCount - busyCount;

  const handleDeleteTechnician = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this technician?')) {
      try {
        const response = await fetch(`/api/technicians/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setTechnicians(prev => prev.filter(t => t.id !== id));
        } else {
          alert('Failed to delete technician');
        }
      } catch (err) {
        console.error('Failed to delete technician:', err);
        alert('Failed to delete technician');
      }
    }
  };

  const handleAddTechnician = async () => {
    if (!newTechnician.name || !newTechnician.email) {
      alert('Please fill in required fields');
      return;
    }
    if (newTechnician.phoneDigits.length !== 10) {
      alert('Phone number must be exactly 10 digits');
      return;
    }

    setIsSubmitting(true);
    try {
      const technicianData = {
        name: newTechnician.name,
        email: newTechnician.email,
        phone: '+91' + newTechnician.phoneDigits,
        skills: newTechnician.skills.split(',').map(s => s.trim()).filter(s => s),
        certifications: newTechnician.certifications.split(',').map(s => s.trim()).filter(s => s),
        status: 'available' as const,
        activeTickets: 0,
        resolvedTickets: 0,
        avgResolutionTime: 0,
        rating: 5.0,
      };

      const response = await fetch('/api/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(technicianData),
      });

      if (response.ok) {
        const created = await response.json();
        // Parse skills and certifications from JSON strings
        const parsedCreated: Technician = {
          ...created,
          skills: JSON.parse(created.skills || '[]'),
          certifications: JSON.parse(created.certifications || '[]'),
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
        skills: '',
        certifications: ''
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
        certifications: newTechnician.certifications.split(',').map(s => s.trim()).filter(s => s),
        activeTickets: 0,
        resolvedTickets: 0,
        avgResolutionTime: 0,
        rating: 5.0,
      };
      setTechnicians(prev => [...prev, newTech]);
      setNewTechnician({
        name: '',
        email: '',
        phoneDigits: '',
        skills: '',
        certifications: ''
      });
      setIsDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
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
                value={newTechnician.name}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, name: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={newTechnician.email}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john.smith@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number (+91)</Label>
              <Input
                id="phone"
                type="tel"
                value={newTechnician.phoneDigits}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, phoneDigits: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="Enter 10 digits"
                maxLength={10}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skills">Skills (comma-separated)</Label>
              <Input
                id="skills"
                value={newTechnician.skills}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, skills: e.target.value }))}
                placeholder="Panel Replacement, Electrical Diagnostics"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="certifications">Certifications (comma-separated)</Label>
              <Input
                id="certifications"
                value={newTechnician.certifications}
                onChange={(e) => setNewTechnician(prev => ({ ...prev, certifications: e.target.value }))}
                placeholder="NABCEP PV, OSHA 30"
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
      <div className="grid gap-4 sm:grid-cols-4">
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
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-warning text-warning" />
                        <span className="text-sm font-medium">{tech.rating.toFixed(1)}</span>
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

                {/* Certifications */}
                <div className="mt-4 flex flex-wrap gap-1">
                  {tech.certifications.length > 0 ? (
                    tech.certifications.map(cert => (
                      <Badge key={cert} variant="outline" className="text-xs">
                        <Award className="mr-1 h-3 w-3" />
                        {cert}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No certifications</span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule
                  </Button>
                  <Button size="sm" className="flex-1" disabled={tech.status !== 'available'}>
                    Assign Ticket
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

