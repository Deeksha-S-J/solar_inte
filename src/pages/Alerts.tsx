import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AlertCard } from '@/components/dashboard/AlertCard';
import type { FaultDetection } from '@/types/solar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Thermometer, MapPin, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function Alerts() {
    const [faults, setFaults] = useState<FaultDetection[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFault, setSelectedFault] = useState<FaultDetection | null>(null);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [creatingTicket, setCreatingTicket] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        async function fetchFaults() {
            try {
                const response = await fetch('/api/faults');
                if (response.ok) {
                    const data = await response.json();
                    const transformed = data.map((f: any) => ({
                        ...f,
                        location: { x: f.locationX || 50, y: f.locationY || 50 },
                        detectedAt: new Date(f.detectedAt),
                    }));
                    setFaults(transformed);
                }
            } catch (err) {
                console.warn('API unavailable, showing empty alerts');
                // Faults remain empty
            } finally {
                setLoading(false);
            }
        }

        fetchFaults();
    }, []);

    const handleCreateTicket = (faultId: string) => {
        const fault = faults.find(f => f.id === faultId);
        if (fault) {
            setSelectedFault(fault);
            setCreateDialogOpen(true);
        }
    };

    const handleConfirmCreateTicket = async () => {
        if (!selectedFault) return;

        setCreatingTicket(true);
        try {
            const response = await fetch('/api/tickets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    panelId: selectedFault.panelId,
                    faultId: selectedFault.id,
                    priority: selectedFault.severity === 'critical' ? 'critical' :
                        selectedFault.severity === 'high' ? 'high' : 'medium',
                    description: `${selectedFault.faultType} detected by AI analysis`,
                    faultType: selectedFault.faultType,
                    droneImageUrl: selectedFault.droneImageUrl,
                    thermalImageUrl: selectedFault.thermalImageUrl,
                    aiAnalysis: selectedFault.aiAnalysis,
                    recommendedAction: selectedFault.recommendedAction,
                }),
            });

            if (response.ok) {
                const newTicket = await response.json();
                toast({
                    title: 'Ticket Created',
                    description: `Ticket ${newTicket.ticketNumber} has been created successfully.`,
                });
                setCreateDialogOpen(false);
                setSelectedFault(null);
                // Remove the fault from the list
                setFaults(prev => prev.filter(f => f.id !== selectedFault.id));
            } else {
                throw new Error('Failed to create ticket');
            }
        } catch (error) {
            console.error('Error creating ticket:', error);
            toast({
                title: 'Error',
                description: 'Failed to create ticket. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setCreatingTicket(false);
        }
    };

    const handleDismiss = (faultId: string) => {
        setFaults(prev => prev.filter(f => f.id !== faultId));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading alerts...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Active Alerts</h1>
                <p className="text-muted-foreground">
                    Monitor and manage fault detections in your solar farm
                </p>
            </div>

            {/* Alerts Grid */}
            {faults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">No active alerts</h3>
                    <p className="text-muted-foreground">All systems are operating normally.</p>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {faults.map((fault) => (
                        <AlertCard
                            key={fault.id}
                            fault={fault}
                            onCreateTicket={handleCreateTicket}
                            onDismiss={handleDismiss}
                        />
                    ))}
                </div>
            )}

            {/* Create Ticket Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Create Maintenance Ticket</DialogTitle>
                    </DialogHeader>

                    {selectedFault && (
                        <div className="space-y-6">
                            {/* Fault Details */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold">{selectedFault.faultType}</h3>
                                    <Badge variant={
                                        selectedFault.severity === 'critical' ? 'destructive' :
                                            selectedFault.severity === 'high' ? 'default' :
                                                'secondary'
                                    }>
                                        {selectedFault.severity.toUpperCase()}
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative aspect-video overflow-hidden rounded-lg">
                                        <img
                                            src={selectedFault.droneImageUrl}
                                            alt="Drone capture"
                                            className="h-full w-full object-cover"
                                        />
                                        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
                                            Visual
                                        </div>
                                    </div>
                                    <div className="relative aspect-video overflow-hidden rounded-lg">
                                        <img
                                            src={selectedFault.thermalImageUrl}
                                            alt="Thermal image"
                                            className="h-full w-full object-cover"
                                        />
                                        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
                                            <Thermometer className="h-3 w-3" />
                                            Thermal
                                        </div>
                                        <div
                                            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-destructive bg-destructive/30"
                                            style={{ left: `${selectedFault.location.x}%`, top: `${selectedFault.location.y}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <MapPin className="h-4 w-4" />
                                        <span>Panel: {selectedFault.panelId}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Clock className="h-4 w-4" />
                                        <span>Detected {formatDistanceToNow(selectedFault.detectedAt, { addSuffix: true })}</span>
                                    </div>
                                </div>

                                <div className="rounded-lg bg-muted p-3">
                                    <p className="text-xs font-medium text-muted-foreground">AI Analysis ({selectedFault.aiConfidence.toFixed(1)}% confidence)</p>
                                    <p className="mt-1 text-sm">{selectedFault.aiAnalysis}</p>
                                </div>

                                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 border border-blue-200 dark:border-blue-800">
                                    <p className="text-xs font-medium text-blue-800 dark:text-blue-200">Recommended Action</p>
                                    <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">{selectedFault.recommendedAction}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCreateDialogOpen(false)}
                            disabled={creatingTicket}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmCreateTicket}
                            disabled={creatingTicket}
                        >
                            {creatingTicket ? 'Creating...' : 'Confirm & Create Ticket'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

