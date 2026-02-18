// Webhook endpoint to receive n8n automation notifications
// This handles the webhook calls from n8n when voltage anomalies are detected

import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// n8n webhook URL for fault automation - configure via environment variable
const N8N_FAULT_WEBHOOK_URL = process.env.N8N_FAULT_WEBHOOK_URL || '';

// Store recent webhook events in memory (for real-time monitoring)
interface WebhookEvent {
  id: string;
  receivedAt: Date;
  source: string;
  payload: {
    ticketNumber?: string;
    status?: string;
    priority?: string;
    description?: string;
    faultType?: string;
    technicianName?: string;
    technicianEmail?: string;
    avgVoltage?: number;
  };
  error?: string;
}

const webhookEvents: WebhookEvent[] = [];
const MAX_EVENTS = 100;

/**
 * Receive webhook from n8n when a ticket is created
 * This is the endpoint: https://lttech.app.n8n.cloud/webhook-test/a1f75b6e-d0b5-41a2-ab3f-c76ccfb324a5
 */
router.post('/n8n-webhook', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    
    console.log('Received n8n webhook:', JSON.stringify(payload, null, 2));
    
    // Validate payload
    if (!payload.ticketNumber) {
      const errorEvent: WebhookEvent = {
        id: `evt-${Date.now()}`,
        receivedAt: new Date(),
        source: 'n8n-webhook',
        payload: payload,
        error: 'Missing ticketNumber in payload'
      };
      
      webhookEvents.unshift(errorEvent);
      if (webhookEvents.length > MAX_EVENTS) webhookEvents.pop();
      
      return res.status(400).json({ 
        success: false, 
        error: 'Missing ticketNumber in payload' 
      });
    }

    // Create webhook event record
    const event: WebhookEvent = {
      id: `evt-${Date.now()}`,
      receivedAt: new Date(),
      source: 'n8n-webhook',
      payload: {
        ticketNumber: payload.ticketNumber,
        status: payload.status,
        priority: payload.priority,
        description: payload.description,
        faultType: payload.faultType,
        technicianName: payload.technicianName,
        technicianEmail: payload.technicianEmail,
        avgVoltage: payload.avgVoltage
      }
    };

    // Store in memory
    webhookEvents.unshift(event);
    if (webhookEvents.length > MAX_EVENTS) webhookEvents.pop();

    // Optionally store in database
    try {
      await prisma.automationEvent.create({
        data: {
          eventType: 'N8nWebhookReceived',
          stage: 'webhook_received',
          incidentId: payload.ticketNumber,
          payload: payload as any,
        }
      });
    } catch (dbError) {
      console.log('Note: Could not store in database (model may not exist):', dbError);
    }

    // Check for errors/ anomalies in the payload
    const anomalies: string[] = [];
    
    if (payload.avgVoltage && payload.avgVoltage < 4.0) {
      anomalies.push(`CRITICAL: Very low voltage detected (${payload.avgVoltage}V)`);
    }
    
    if (payload.priority === 'high' || payload.priority === 'critical') {
      anomalies.push(`ALERT: High/critical priority ticket created`);
    }

    // Log anomalies
    if (anomalies.length > 0) {
      console.log('⚠️ ANOMALY DETECTED:', anomalies);
    }

    res.json({ 
      success: true, 
      message: 'Webhook received successfully',
      eventId: event.id,
      anomalies: anomalies
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Log error event
    const errorEvent: WebhookEvent = {
      id: `evt-${Date.now()}`,
      receivedAt: new Date(),
      source: 'n8n-webhook',
      payload: req.body,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    webhookEvents.unshift(errorEvent);
    if (webhookEvents.length > MAX_EVENTS) webhookEvents.pop();
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all webhook events
 */
router.get('/events', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    
    res.json({
      total: webhookEvents.length,
      events: webhookEvents.slice(0, Number(limit))
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * Get webhook event by ID
 */
router.get('/events/:id', async (req: Request, res: Response) => {
  try {
    const event = webhookEvents.find(e => e.id === req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(event);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

/**
 * Get recent anomalies (events with errors or high priority)
 */
router.get('/anomalies', async (req: Request, res: Response) => {
  try {
    const anomalies = webhookEvents.filter(e => 
      e.error || 
      e.payload.priority === 'high' || 
      e.payload.priority === 'critical' ||
      (e.payload.avgVoltage && e.payload.avgVoltage < 4.0)
    );
    
    res.json({
      total: anomalies.length,
      anomalies: anomalies
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({ error: 'Failed to fetch anomalies' });
  }
});

/**
 * Health check for webhook endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    endpoint: 'n8n-webhook',
    timestamp: new Date().toISOString(),
    recentEvents: webhookEvents.length
  });
});

/**
 * Clear all webhook events
 */
router.delete('/events', async (req: Request, res: Response) => {
  webhookEvents.length = 0;
  res.json({ success: true, message: 'All events cleared' });
});

/**
 * Trigger n8n webhook for fault automation
 * This endpoint can be called by scan systems to trigger the automation workflow
 */
router.post('/trigger-n8n', async (req: Request, res: Response) => {
  try {
    const { panelId, severity, faultType, description } = req.body;

    // Validate required fields
    if (!panelId || !severity || !faultType || !description) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: panelId, severity, faultType, description'
      });
    }

    // Only trigger for MEDIUM, HIGH, CRITICAL severity
    const triggerSeverities = ['MEDIUM', 'HIGH', 'CRITICAL'];
    if (!triggerSeverities.includes(severity.toUpperCase())) {
      return res.json({
        success: true,
        skipped: true,
        reason: `Severity '${severity}' is below MEDIUM threshold - no action needed`
      });
    }

    // Check if n8n webhook URL is configured
    if (!N8N_FAULT_WEBHOOK_URL) {
      console.warn('N8N_FAULT_WEBHOOK_URL not configured - skipping webhook trigger');
      return res.status(503).json({
        success: false,
        error: 'n8n webhook not configured. Set N8N_FAULT_WEBHOOK_URL environment variable.'
      });
    }

    // Prepare payload
    const payload = {
      panelId,
      severity: severity.toUpperCase(),
      faultType,
      description,
      timestamp: new Date().toISOString() + 'Z'
    };

    console.log('Triggering n8n fault webhook:', JSON.stringify(payload, null, 2));

    // Send to n8n using fetch
    const response = await fetch(N8N_FAULT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json().catch(() => null);

    // Log the automation event
    await prisma.automationEvent.create({
      data: {
        eventType: 'N8nWebhookTriggered',
        stage: 'webhook_sent',
        incidentId: `WEBHOOK-${Date.now()}`,
        panelId: panelId,
        payload: payload as any
      }
    });

    res.json({
      success: true,
      message: 'Fault alert sent to n8n',
      n8nResponse: responseData
    });

  } catch (error) {
    console.error('Error triggering n8n webhook:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger n8n webhook'
    });
  }
});

/**
 * Health check for n8n webhook configuration
 */
router.get('/n8n-status', async (req: Request, res: Response) => {
  const isConfigured = !!N8N_FAULT_WEBHOOK_URL;
  
  res.json({
    configured: isConfigured,
    webhookUrl: isConfigured ? '***configured***' : 'not configured',
    environmentVariable: 'N8N_FAULT_WEBHOOK_URL'
  });
});

export default router;

