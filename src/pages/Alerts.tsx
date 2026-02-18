import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AlertCard } from '@/components/dashboard/AlertCard';
import type { Alert } from '@/types/solar';

export default function Alerts() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAlerts() {
            try {
                const response = await fetch('/api/alerts');
                if (response.ok) {
                    const data = await response.json();
                    const transformed = data.map((alert: any) => ({
                        ...alert,
                        createdAt: new Date(alert.createdAt),
                    }));
                    setAlerts(transformed);
                }
            } catch (err) {
                console.warn('API unavailable, showing empty alerts');
            } finally {
                setLoading(false);
            }
        }

        fetchAlerts();
    }, []);

    const handleDismiss = async (alertId: string) => {
        try {
            const response = await fetch(`/api/alerts/${alertId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setAlerts(prev => prev.filter(a => a.id !== alertId));
            } else {
                console.error('Failed to delete alert');
            }
        } catch (err) {
            console.error('Error deleting alert:', err);
        }
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
                    Monitor and manage alerts from your solar farm
                </p>
            </div>

            {/* Alerts Grid */}
            {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">No active alerts</h3>
                    <p className="text-muted-foreground">All systems are operating normally.</p>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {alerts.map((alert) => (
                        <AlertCard
                            key={alert.id}
                            alert={alert}
                            onDismiss={handleDismiss}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

