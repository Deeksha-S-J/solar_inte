#!/usr/bin/env python3
"""
Solar Panel Fault Webhook Sender
=================================
This script detects solar panel faults and sends POST requests to an n8n webhook
whenever severity is MEDIUM, HIGH, or CRITICAL.

Usage:
    python solar_webhook_sender.py
    
    # Or import as module:
    from solar_webhook_sender import SolarFaultWebhookSender
    sender = SolarFaultWebhookSender(webhook_url="https://your-n8n-instance.webhook.com/...")
    sender.send_fault_alert(panel_id="PNL-A0101", severity="HIGH", fault_type="Hotspot", description="Thermal hotspot detected")
"""

import requests
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from enum import Enum

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class Severity(Enum):
    """Severity levels for solar panel faults"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class FaultType:
    """Common fault types for solar panels"""
    HOTSPOT = "Hotspot"
    DIRTY_PANEL = "Dirty Panel"
    CRACKED = "Cracked"
    SHADING = "Shading"
    INVERTER_FAULT = "Inverter Fault"
    CONNECTOR_ISSUE = "Connector Issue"
    WIRING_FAULT = "Wiring Fault"
    DEGRADATION = "Degradation"
    ARCS = "Arc Fault"
    OBSTRUCTION = "Obstruction"


@dataclass
class FaultPayload:
    """Webhook payload structure for fault alerts"""
    panelId: str
    severity: str
    faultType: str
    description: str
    timestamp: Optional[str] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat() + "Z"
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SolarFaultWebhookSender:
    """
    Solar Panel Fault Webhook Sender
    
    This class handles sending fault detection alerts to an n8n webhook
    for automated ticket creation and technician assignment.
    
    Attributes:
        webhook_url: The n8n webhook URL to send alerts to
        timeout: Request timeout in seconds (default: 30)
        retry_count: Number of retries on failure (default: 3)
    """
    
    # Severity levels that trigger webhook (MEDIUM and above)
    TRIGGER_SEVERITIES = {Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL}
    
    def __init__(
        self,
        webhook_url: str,
        timeout: int = 30,
        retry_count: int = 3,
        verify_ssl: bool = True
    ):
        """
        Initialize the webhook sender.
        
        Args:
            webhook_url: The n8n webhook URL
            timeout: Request timeout in seconds
            retry_count: Number of retries on failure
            verify_ssl: Whether to verify SSL certificates
        """
        self.webhook_url = webhook_url
        self.timeout = timeout
        self.retry_count = retry_count
        self.verify_ssl = verify_ssl
        self.session = requests.Session()
        
    def _should_trigger(self, severity: str) -> bool:
        """Check if severity level should trigger a webhook"""
        try:
            sev = Severity(severity.upper())
            return sev in self.TRIGGER_SEVERITIES
        except ValueError:
            logger.warning(f"Unknown severity level: {severity}")
            return False
    
    def _send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send POST request to webhook with retry logic"""
        last_error = None
        
        for attempt in range(self.retry_count):
            try:
                logger.info(f"Sending webhook attempt {attempt + 1}/{self.retry_count}")
                logger.debug(f"Payload: {json.dumps(payload, indent=2)}")
                
                response = self.session.post(
                    self.webhook_url,
                    json=payload,
                    timeout=self.timeout,
                    verify=self.verify_ssl,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "Solar-Fault-Webhook-Sender/1.0"
                    }
                )
                
                response.raise_for_status()
                
                logger.info(f"Webhook sent successfully! Status: {response.status_code}")
                
                try:
                    return response.json()
                except json.JSONDecodeError:
                    return {"status": "success", "status_code": response.status_code}
                    
            except requests.exceptions.Timeout as e:
                last_error = f"Request timeout: {e}"
                logger.warning(f"Timeout on attempt {attempt + 1}: {e}")
                
            except requests.exceptions.ConnectionError as e:
                last_error = f"Connection error: {e}"
                logger.warning(f"Connection error on attempt {attempt + 1}: {e}")
                
            except requests.exceptions.HTTPError as e:
                last_error = f"HTTP error: {e}"
                logger.error(f"HTTP error: {e}")
                # Don't retry on client errors (4xx)
                if 400 <= e.response.status_code < 500:
                    break
                    
            except requests.exceptions.RequestException as e:
                last_error = f"Request error: {e}"
                logger.warning(f"Request error on attempt {attempt + 1}: {e}")
        
        raise Exception(f"Failed to send webhook after {self.retry_count} attempts: {last_error}")
    
    def send_fault_alert(
        self,
        panel_id: str,
        severity: str,
        fault_type: str,
        description: str,
        additional_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send a fault alert to the webhook.
        
        Args:
            panel_id: The panel identifier (e.g., "PNL-A0101")
            severity: Severity level ("LOW", "MEDIUM", "HIGH", "CRITICAL")
            fault_type: Type of fault detected
            description: Description of the fault
            additional_data: Optional additional data to include
            
        Returns:
            Response from the webhook
            
        Raises:
            Exception: If the webhook fails after all retries
        """
        # Check if severity warrants sending
        if not self._should_trigger(severity):
            logger.info(f"Skipping webhook - severity '{severity}' is below threshold")
            return {
                "status": "skipped",
                "reason": f"Severity '{severity}' is below MEDIUM threshold"
            }
        
        # Build payload
        payload = FaultPayload(
            panelId=panel_id,
            severity=severity.upper(),
            faultType=fault_type,
            description=description
        ).to_dict()
        
        # Add any additional data
        if additional_data:
            payload.update(additional_data)
        
        return self._send_request(payload)
    
    def send_batch_alerts(self, faults: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Send multiple fault alerts in batch.
        
        Args:
            faults: List of fault dictionaries with keys:
                - panel_id: str
                - severity: str
                - fault_type: str
                - description: str
                
        Returns:
            List of responses for each fault
        """
        results = []
        
        for fault in faults:
            try:
                result = self.send_fault_alert(
                    panel_id=fault.get("panel_id"),
                    severity=fault.get("severity"),
                    fault_type=fault.get("fault_type"),
                    description=fault.get("description"),
                    additional_data=fault.get("additional_data")
                )
                results.append({"panel_id": fault.get("panel_id"), "result": result})
            except Exception as e:
                logger.error(f"Failed to send alert for {fault.get('panel_id')}: {e}")
                results.append({
                    "panel_id": fault.get("panel_id"),
                    "error": str(e)
                })
        
        return results
    
    def test_connection(self) -> bool:
        """
        Test the webhook connection.
        
        Returns:
            True if connection is successful, False otherwise
        """
        try:
            test_payload = {
                "panelId": "TEST-001",
                "severity": "LOW",
                "faultType": "Test",
                "description": "Connection test",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
            
            response = self._send_request(test_payload)
            logger.info(f"Connection test successful: {response}")
            return True
            
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False


# ============================================================
# Example Usage & Standalone Script
# ============================================================

def main():
    """Main function demonstrating usage"""
    
    # Configuration
    WEBHOOK_URL = "https://your-n8n-instance.webhook.com/webhook"
    
    # Initialize sender
    sender = SolarFaultWebhookSender(
        webhook_url=WEBHOOK_URL,
        timeout=30,
        retry_count=3
    )
    
    # Test connection first
    print("Testing webhook connection...")
    if sender.test_connection():
        print("✓ Connection test successful!")
    else:
        print("✗ Connection test failed!")
        return
    
    # Example 1: Send a CRITICAL fault alert
    print("\n--- Sending CRITICAL fault alert ---")
    try:
        result = sender.send_fault_alert(
            panel_id="PNL-A0101",
            severity="CRITICAL",
            fault_type=FaultType.HOTSPOT,
            description="Thermal hotspot detected - temperature above 85°C",
            additional_data={
                "temperature": 87.5,
                "confidence": 95.5,
                "location": "Zone A, Row 1"
            }
        )
        print(f"Result: {json.dumps(result, indent=2)}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Example 2: Send a HIGH severity fault
    print("\n--- Sending HIGH severity fault ---")
    try:
        result = sender.send_fault_alert(
            panel_id="PNL-B0205",
            severity="HIGH",
            fault_type=FaultType.DIRTY_PANEL,
            description="Significant dust accumulation detected - efficiency drop of 15%"
        )
        print(f"Result: {json.dumps(result, indent=2)}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Example 3: Send a MEDIUM severity fault
    print("\n--- Sending MEDIUM severity fault ---")
    try:
        result = sender.send_fault_alert(
            panel_id="PNL-C0312",
            severity="MEDIUM",
            fault_type=FaultType.SHADING,
            description="Partial shading detected from nearby obstruction"
        )
        print(f"Result: {json.dumps(result, indent=2)}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Example 4: LOW severity will be skipped
    print("\n--- Sending LOW severity fault (will be skipped) ---")
    try:
        result = sender.send_fault_alert(
            panel_id="PNL-D0401",
            severity="LOW",
            fault_type=FaultType.DIRTY_PANEL,
            description="Minor dust - cleaning recommended at next maintenance"
        )
        print(f"Result: {json.dumps(result, indent=2)}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Example 5: Batch sending
    print("\n--- Sending batch alerts ---")
    batch_faults = [
        {
            "panel_id": "PNL-A0101",
            "severity": "HIGH",
            "fault_type": FaultType.HOTSPOT,
            "description": "Hotspot detected in thermal scan"
        },
        {
            "panel_id": "PNL-A0102",
            "severity": "MEDIUM",
            "fault_type": FaultType.CRACKED,
            "description": "Micro-crack detected in panel surface"
        },
        {
            "panel_id": "PNL-A0103",
            "severity": "LOW",
            "fault_type": FaultType.DIRTY_PANEL,
            "description": "Light dust accumulation"
        }
    ]
    
    try:
        results = sender.send_batch_alerts(batch_faults)
        for r in results:
            print(f"  {r.get('panel_id')}: {r.get('result', r.get('error'))}")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()

