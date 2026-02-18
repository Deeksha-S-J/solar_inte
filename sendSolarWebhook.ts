/**
 * Solar Panel Fault Webhook Sender (Node.js)
 * ===========================================
 * This module sends POST requests to an n8n webhook when solar panel faults
 * are detected with severity MEDIUM, HIGH, or CRITICAL.
 * 
 * Usage:
 *   node sendSolarWebhook.js
 *   
 *   Or import as module:
 *   import { SolarFaultWebhookSender } from './sendSolarWebhook.js';
 *   const sender = new SolarFaultWebhookSender('https://your-webhook-url');
 *   await sender.sendFaultAlert({ panelId: 'PNL-A0101', severity: 'HIGH', ... });
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// ============================================================
// Types & Interfaces
// ============================================================

export enum Severity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum FaultType {
  HOTSPOT = 'Hotspot',
  DIRTY_PANEL = 'Dirty Panel',
  CRACKED = 'Cracked',
  SHADING = 'Shading',
  INVERTER_FAULT = 'Inverter Fault',
  CONNECTOR_ISSUE = 'Connector Issue',
  WIRING_FAULT = 'Wiring Fault',
  DEGRADATION = 'Degradation',
  ARCS = 'Arc Fault',
  OBSTRUCTION = 'Obstruction'
}

export interface FaultPayload {
  panelId: string;
  severity: string;
  faultType: string;
  description: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface WebhookOptions {
  timeout?: number;
  retryCount?: number;
  verifySsl?: boolean;
}

export interface SendResult {
  success: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

// ============================================================
// Solar Fault Webhook Sender Class
// ============================================================

export class SolarFaultWebhookSender {
  private webhookUrl: string;
  private client: AxiosInstance;
  private retryCount: number;
  
  // Severity levels that trigger webhook (MEDIUM and above)
  private static readonly TRIGGER_SEVERITIES = new Set([
    Severity.MEDIUM,
    Severity.HIGH,
    Severity.CRITICAL
  ]);

  /**
   * Create a new SolarFaultWebhookSender
   * @param webhookUrl - The n8n webhook URL
   * @param options - Optional configuration
   */
  constructor(webhookUrl: string, options: WebhookOptions = {}) {
    this.webhookUrl = webhookUrl;
    this.retryCount = options.retryCount ?? 3;
    
    this.client = axios.create({
      timeout: options.timeout ?? 30000,
      validateStatus: () => true, // Don't throw on any status
      httpsAgent: options.verifySsl !== false ? undefined : new (require('https').Agent)({ rejectUnauthorized: false })
    });
  }

  /**
   * Check if severity level should trigger a webhook
   */
  private shouldTrigger(severity: string): boolean {
    const normalizedSeverity = severity.toUpperCase();
    return SolarFaultWebhookSender.TRIGGER_SEVERITIES.has(normalizedSeverity as Severity);
  }

  /**
   * Send POST request to webhook with retry logic
   */
  private async sendRequest(payload: FaultPayload): Promise<SendResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        console.log(`Sending webhook attempt ${attempt}/${this.retryCount}`);
        console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

        const response = await this.client.post(this.webhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Solar-Fault-Webhook-Sender/1.0'
          }
        });

        if (response.status >= 200 && response.status < 300) {
          console.log(`Webhook sent successfully! Status: ${response.status}`);
          return {
            success: true,
            status: response.status,
            data: response.data
          };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;
        console.warn(`HTTP error on attempt ${attempt}: ${lastError}`);
        
        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          break;
        }

      } catch (error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          if (axiosError.code === 'ECONNABORTED') {
            lastError = 'Request timeout';
            console.warn(`Timeout on attempt ${attempt}`);
          } else if (axiosError.code === 'ECONNREFUSED') {
            lastError = 'Connection refused';
            console.warn(`Connection refused on attempt ${attempt}`);
          } else {
            lastError = axiosError.message;
            console.warn(`Request error on attempt ${attempt}: ${axiosError.message}`);
          }
        } else {
          lastError = String(error);
          console.warn(`Error on attempt ${attempt}: ${lastError}`);
        }
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < this.retryCount) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    return {
      success: false,
      error: `Failed after ${this.retryCount} attempts: ${lastError}`
    };
  }

  /**
   * Send a fault alert to the webhook
   */
  async sendFaultAlert(params: {
    panelId: string;
    severity: string;
    faultType: string;
    description: string;
    additionalData?: Record<string, unknown>;
  }): Promise<SendResult> {
    const { panelId, severity, faultType, description, additionalData } = params;

    // Check if severity warrants sending
    if (!this.shouldTrigger(severity)) {
      console.log(`Skipping webhook - severity '${severity}' is below threshold`);
      return {
        success: true,
        status: 0,
        data: { status: 'skipped', reason: `Severity '${severity}' is below MEDIUM threshold` }
      };
    }

    // Build payload
    const payload: FaultPayload = {
      panelId,
      severity: severity.toUpperCase(),
      faultType,
      description,
      timestamp: new Date().toISOString() + 'Z'
    };

    // Add any additional data
    if (additionalData) {
      Object.assign(payload, additionalData);
    }

    return this.sendRequest(payload);
  }

  /**
   * Send multiple fault alerts in batch
   */
  async sendBatchAlerts(faults: Array<{
    panelId: string;
    severity: string;
    faultType: string;
    description: string;
    additionalData?: Record<string, unknown>;
  }>): Promise<Array<{ panelId: string; result: SendResult }>> {
    const results: Array<{ panelId: string; result: SendResult }> = [];

    for (const fault of faults) {
      try {
        const result = await this.sendFaultAlert(fault);
        results.push({ panelId: fault.panelId, result });
      } catch (error) {
        console.error(`Failed to send alert for ${fault.panelId}:`, error);
        results.push({
          panelId: fault.panelId,
          result: { success: false, error: String(error) }
        });
      }
    }

    return results;
  }

  /**
   * Test the webhook connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testPayload: FaultPayload = {
        panelId: 'TEST-001',
        severity: Severity.LOW,
        faultType: 'Test',
        description: 'Connection test',
        timestamp: new Date().toISOString() + 'Z'
      };

      const result = await this.sendRequest(testPayload);
      
      if (result.success) {
        console.log('Connection test successful:', result.data);
      } else {
        console.error('Connection test failed:', result.error);
      }
      
      return result.success;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// ============================================================
// Standalone Script Execution
// ============================================================

async function main() {
  // Configuration - REPLACE WITH YOUR ACTUAL WEBHOOK URL
  const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-n8n-instance.webhook.com/webhook';

  // Initialize sender
  const sender = new SolarFaultWebhookSender(WEBHOOK_URL, {
    timeout: 30000,
    retryCount: 3
  });

  // Test connection first
  console.log('Testing webhook connection...');
  const connected = await sender.testConnection();
  
  if (!connected) {
    console.log('✗ Connection test failed! Please check your webhook URL.');
    process.exit(1);
  }
  
  console.log('✓ Connection test successful!\n');

  // Example 1: Send a CRITICAL fault alert
  console.log('--- Sending CRITICAL fault alert ---');
  let result = await sender.sendFaultAlert({
    panelId: 'PNL-A0101',
    severity: Severity.CRITICAL,
    faultType: FaultType.HOTSPOT,
    description: 'Thermal hotspot detected - temperature above 85°C',
    additionalData: {
      temperature: 87.5,
      confidence: 95.5,
      location: 'Zone A, Row 1'
    }
  });
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log();

  // Example 2: Send a HIGH severity fault
  console.log('--- Sending HIGH severity fault ---');
  result = await sender.sendFaultAlert({
    panelId: 'PNL-B0205',
    severity: Severity.HIGH,
    faultType: FaultType.DIRTY_PANEL,
    description: 'Significant dust accumulation detected - efficiency drop of 15%'
  });
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log();

  // Example 3: Send a MEDIUM severity fault
  console.log('--- Sending MEDIUM severity fault ---');
  result = await sender.sendFaultAlert({
    panelId: 'PNL-C0312',
    severity: Severity.MEDIUM,
    faultType: FaultType.SHADING,
    description: 'Partial shading detected from nearby obstruction'
  });
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log();

  // Example 4: LOW severity will be skipped
  console.log('--- Sending LOW severity fault (will be skipped) ---');
  result = await sender.sendFaultAlert({
    panelId: 'PNL-D0401',
    severity: Severity.LOW,
    faultType: FaultType.DIRTY_PANEL,
    description: 'Minor dust - cleaning recommended at next maintenance'
  });
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log();

  // Example 5: Batch sending
  console.log('--- Sending batch alerts ---');
  const batchFaults = [
    {
      panelId: 'PNL-A0101',
      severity: Severity.HIGH,
      faultType: FaultType.HOTSPOT,
      description: 'Hotspot detected in thermal scan'
    },
    {
      panelId: 'PNL-A0102',
      severity: Severity.MEDIUM,
      faultType: FaultType.CRACKED,
      description: 'Micro-crack detected in panel surface'
    },
    {
      panelId: 'PNL-A0103',
      severity: Severity.LOW,
      faultType: FaultType.DIRTY_PANEL,
      description: 'Light dust accumulation'
    }
  ];

  const batchResults = await sender.sendBatchAlerts(batchFaults);
  batchResults.forEach(r => {
    console.log(`  ${r.panelId}: ${r.result.success ? 'Success' : r.result.error}`);
  });
}

// Run if executed directly
main().catch(console.error);

export default SolarFaultWebhookSender;

