/**
 * Dummy Scan Generator for Testing Automation
 * 
 * This script simulates Raspberry Pi scans with RGB and thermal images
 * to test the full automation workflow:
 *   Scan → Alert → Fault → Ticket → Technician Assignment → Resolution → Deletion
 * 
 * Usage:
 *   cd server && npx tsx create-dummy-scan.ts
 * 
 * Options:
 *   --severity <level>  Set severity (CRITICAL, HIGH, MEDIUM, LOW) - default: HIGH
 *   --dusty <count>     Number of dusty panels - default: 3
 *   --faulty            Include faulty panels
 *   --help              Show help
 * 
 * Examples:
 *   cd server && npx tsx create-dummy-scan.ts                    # Default HIGH severity, 3 dusty
 *   cd server && npx tsx create-dummy-scan.ts --severity CRITICAL --faulty
   cd server && npx tsx create-dummy-scan.ts --severity MEDIUM --dusty 5
 */

// Base64 encoded 1x1 transparent PNG
const PLACEHOLDER_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Base64 encoded sample thermal-like gradient image (simulated)
const createThermalImage = (minTemp: number, maxTemp: number): string => {
  // Create a simple gradient pattern representing thermal data
  // In real scenario, this would be actual thermal camera output
  const gradient = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
  return gradient;
};

// Base64 encoded sample RGB image (simulated)
const createRgbImage = (): string => {
  // In real scenario, this would be actual RGB camera output
  return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
};

interface ScanPayload {
  timestamp: string;
  priority: string;
  thermal: {
    min_temp: number;
    max_temp: number;
    mean_temp: number;
    delta: number;
    risk_score: number;
    severity: string;
  };
  rgb_stats: {
    total: number;
    clean: number;
    dusty: number;
    faulty: number;
  };
  panels: Array<{
    panel_number: string;
    status: string;
    has_dust: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  device_id: string;
  device_name: string;
  thermalImage: string;
  rgbImage: string;
}

const API_URL = process.env.API_URL || 'http://localhost:3000';

function generateScanPayload(options: {
  severity: string;
  dustyCount: number;
  faultyCount: number;
  totalPanels: number;
}): ScanPayload {
  const { severity, dustyCount, faultyCount, totalPanels } = options;
  
  const cleanCount = totalPanels - dustyCount - faultyCount;
  
  // Generate thermal data based on severity
  let minTemp = 25;
  let maxTemp = 35;
  let meanTemp = 30;
  let delta = 5;
  let riskScore = 30;

  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      minTemp = 60;
      maxTemp = 95;
      meanTemp = 75;
      delta = 35;
      riskScore = 95;
      break;
    case 'HIGH':
      minTemp = 45;
      maxTemp = 70;
      meanTemp = 55;
      delta = 25;
      riskScore = 75;
      break;
    case 'MEDIUM':
      minTemp = 35;
      maxTemp = 50;
      meanTemp = 42;
      delta = 15;
      riskScore = 50;
      break;
    case 'LOW':
    case 'NORMAL':
      minTemp = 25;
      maxTemp = 40;
      meanTemp = 32;
      delta = 8;
      riskScore = 25;
      break;
  }

  // Generate panel data
  const panels: ScanPayload['panels'] = [];
  
  // Add clean panels
  for (let i = 1; i <= cleanCount; i++) {
    panels.push({
      panel_number: `P${i}`,
      status: 'CLEAN',
      has_dust: false,
      x1: (i - 1) * 100,
      y1: 0,
      x2: i * 100,
      y2: 100,
    });
  }

  // Add dusty panels
  const dustyStartIndex = cleanCount + 1;
  for (let i = 0; i < dustyCount; i++) {
    panels.push({
      panel_number: `P${dustyStartIndex + i}`,
      status: 'DUSTY',
      has_dust: true,
      x1: (dustyStartIndex + i - 1) * 100,
      y1: 0,
      x2: (dustyStartIndex + i) * 100,
      y2: 100,
    });
  }

  // Add faulty panels
  const faultyStartIndex = cleanCount + dustyCount + 1;
  for (let i = 0; i < faultyCount; i++) {
    panels.push({
      panel_number: `P${faultyStartIndex + i}`,
      status: 'FAULTY',
      has_dust: false,
      x1: (faultyStartIndex + i - 1) * 100,
      y1: 0,
      x2: (faultyStartIndex + i) * 100,
      y2: 100,
    });
  }

  return {
    timestamp: new Date().toISOString(),
    priority: severity.toUpperCase(),
    thermal: {
      min_temp: minTemp,
      max_temp: maxTemp,
      mean_temp: meanTemp,
      delta: delta,
      risk_score: riskScore,
      severity: severity.toUpperCase(),
    },
    rgb_stats: {
      total: totalPanels,
      clean: cleanCount,
      dusty: dustyCount,
      faulty: faultyCount,
    },
    panels,
    device_id: 'RPI-TEST-001',
    device_name: 'Test Raspberry Pi Scanner',
    thermalImage: createThermalImage(minTemp, maxTemp),
    rgbImage: createRgbImage(),
  };
}

async function sendScanToAPI(payload: ScanPayload): Promise<any> {
  console.log('\n📤 Sending scan to API...');
  console.log(`   Severity: ${payload.thermal.severity}`);
  console.log(`   Dusty Panels: ${payload.rgb_stats.dusty}`);
  console.log(`   Faulty Panels: ${payload.rgb_stats.faulty}`);
  console.log(`   Thermal Delta: ${payload.thermal.delta}°C`);
  console.log(`   Risk Score: ${payload.thermal.risk_score}`);
  
  const response = await fetch(`${API_URL}/api/solar-scans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  return result;
}

async function checkAlerts(): Promise<any[]> {
  const response = await fetch(`${API_URL}/api/alerts`);
  return response.json();
}

async function checkTickets(): Promise<any[]> {
  const response = await fetch(`${API_URL}/api/tickets`);
  return response.json();
}

async function checkTechnicians(): Promise<any[]> {
  const response = await fetch(`${API_URL}/api/technicians`);
  return response.json();
}

async function waitForAutomation(delayMs: number = 5000): Promise<void> {
  console.log(`\n⏳ Waiting ${delayMs / 1000} seconds for automation to complete...`);
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

async function runFullAutomationTest(options: {
  severity: string;
  dustyCount: number;
  faultyCount: number;
}) {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 DUMMY SCAN AUTOMATION TEST');
  console.log('='.repeat(60));

  // Check initial state
  console.log('\n📊 Initial State:');
  const initialAlerts = await checkAlerts();
  const initialTickets = await checkTickets();
  const technicians = await checkTechnicians();
  
  console.log(`   Active Alerts: ${initialAlerts.filter((a: any) => !a.dismissed).length}`);
  console.log(`   Open Tickets: ${initialTickets.filter((t: any) => t.status !== 'resolved' && t.status !== 'closed').length}`);
  console.log(`   Technicians: ${technicians.length}`);
  
  // Show technicians
  if (technicians.length > 0) {
    console.log('\n👨‍🔧 Available Technicians:');
    technicians.forEach((tech: any) => {
      console.log(`   - ${tech.name} (${tech.email})`);
      console.log(`     Status: ${tech.status}, Active Tickets: ${tech.activeTickets}, Skills: ${tech.skills}`);
    });
  }

  // Generate and send scan
  const payload = generateScanPayload({
    severity: options.severity,
    dustyCount: options.dustyCount,
    faultyCount: options.faultyCount,
    totalPanels: 10,
  });

  console.log('\n📸 Generated Dummy Scan:');
  console.log(`   Device: ${payload.device_name} (${payload.device_id})`);
  console.log(`   Priority: ${payload.priority}`);
  console.log(`   Thermal: ${payload.thermal.min_temp}°C - ${payload.thermal.max_temp}°C (Δ${payload.thermal.delta}°C)`);
  console.log(`   RGB Stats: ${payload.rgb_stats.clean} clean, ${payload.rgb_stats.dusty} dusty, ${payload.rgb_stats.faulty} faulty`);
  console.log(`   Images: ${payload.thermalImage ? 'Thermal ✅' : 'Thermal ❌'}, ${payload.rgbImage ? 'RGB ✅' : 'RGB ❌'}`);

  const result = await sendScanToAPI(payload);
  
  console.log('\n📥 API Response:');
  console.log(`   Success: ${result.success}`);
  console.log(`   Scan ID: ${result.scanId}`);
  console.log(`   Message: ${result.message}`);
  
  if (result.automation) {
    console.log(`   Automation: ${JSON.stringify(result.automation)}`);
  }

  // Wait for automation to complete
  await waitForAutomation(5000);

  // Check results
  console.log('\n📊 After Automation:');
  const finalAlerts = await checkAlerts();
  const finalTickets = await checkTickets();
  const finalTechnicians = await checkTechnicians();
  
  const activeAlerts = finalAlerts.filter((a: any) => !a.dismissed);
  const openTickets = finalTickets.filter((t: any) => t.status !== 'resolved' && t.status !== 'closed');
  
  console.log(`   Active Alerts: ${activeAlerts.length}`);
  console.log(`   Open Tickets: ${openTickets.length}`);
  
  if (openTickets.length > initialTickets.filter((t: any) => t.status !== 'resolved' && t.status !== 'closed').length) {
    const newTickets = openTickets.slice(0, openTickets.length - initialTickets.filter((t: any) => t.status !== 'resolved' && t.status !== 'closed').length);
    
    console.log('\n🎫 New Ticket(s) Created:');
    newTickets.forEach((ticket: any) => {
      console.log(`   Ticket #: ${ticket.ticketNumber}`);
      console.log(`   Status: ${ticket.status}`);
      console.log(`   Priority: ${ticket.priority}`);
      console.log(`   Description: ${ticket.description?.substring(0, 60)}...`);
      console.log(`   Thermal Image: ${ticket.thermalImageUrl ? '✅' : '❌'}`);
      console.log(`   RGB Image: ${ticket.droneImageUrl ? '✅' : '❌'}`);
      
      if (ticket.assignedTechnician) {
        console.log(`   Assigned To: ${ticket.assignedTechnician.name}`);
      } else if (ticket.assignedTechnicianId) {
        const tech = finalTechnicians.find((t: any) => t.id === ticket.assignedTechnicianId);
        console.log(`   Assigned To: ${tech?.name || 'Unknown (ID: ' + ticket.assignedTechnicianId + ')'}`);
      } else {
        console.log(`   Assigned To: Not assigned`);
      }
    });
  }

  // Show technician status changes
  console.log('\n👨‍🔧 Technician Status After:');
  finalTechnicians.forEach((tech: any) => {
    const initialTech = technicians.find((t: any) => t.id === tech.id);
    const prevActive = initialTech?.activeTickets || 0;
    const changed = prevActive !== tech.activeTickets;
    console.log(`   - ${tech.name}: ${tech.activeTickets} active tickets${changed ? ' (changed from ' + prevActive + ')' : ''}`);
  });

  // Show alerts created
  if (activeAlerts.length > initialAlerts.filter((a: any) => !a.dismissed).length) {
    const newAlerts = activeAlerts.slice(0, activeAlerts.length - initialAlerts.filter((a: any) => !a.dismissed).length);
    console.log('\n⚠️ New Alert(s) Created:');
    newAlerts.forEach((alert: any) => {
      console.log(`   Zone ${alert.zone}, Row ${alert.row}: ${alert.status}`);
      console.log(`   Message: ${alert.message || 'N/A'}`);
      console.log(`   Linked to Ticket: ${alert.ticketId ? 'Yes ✅' : 'No ❌'}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ AUTOMATION TEST COMPLETE');
  console.log('='.repeat(60));
  
  console.log('\n📌 Next Steps:');
  console.log('   1. View the ticket in the Tickets page');
  console.log('   2. View the alert in the Alerts page');
  console.log('   3. To test resolution → deletion:');
  console.log('      PATCH /api/tickets/:id with { "status": "resolved" }');
  console.log('   4. The ticket will be automatically deleted after resolution');
  
  return {
    success: true,
    scanId: result.scanId,
    alertsCreated: activeAlerts.length > initialAlerts.filter((a: any) => !a.dismissed).length,
    ticketsCreated: openTickets.length > initialTickets.filter((t: any) => t.status !== 'resolved' && t.status !== 'closed').length,
  };
}

// Parse command line arguments
const args = process.argv.slice(2);
let severity = 'HIGH';
let dustyCount = 3;
let faultyCount = 0;

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Dummy Scan Generator for Testing Automation

Usage:
  npx tsx create-dummy-scan.ts [options]

Options:
  --severity <level>  Set severity (CRITICAL, HIGH, MEDIUM, LOW) - default: HIGH
  --dusty <count>     Number of dusty panels - default: 3
  --faulty            Include faulty panels (adds 1 faulty panel)
  --help, -h          Show this help message

Examples:
  npx tsx create-dummy-scan.ts                           # Default: HIGH severity, 3 dusty
  npx tsx create-dummy-scan.ts --severity CRITICAL      # Critical severity
  npx tsx create-dummy-scan.ts --severity MEDIUM --dusty 5
  npx tsx create-dummy-scan.ts --faulty                 # Include a faulty panel
  `);
  process.exit(0);
}

// Parse severity
const severityIndex = args.indexOf('--severity');
if (severityIndex !== -1 && args[severityIndex + 1]) {
  severity = args[severityIndex + 1].toUpperCase();
}

// Parse dusty count
const dustyIndex = args.indexOf('--dusty');
if (dustyIndex !== -1 && args[dustyIndex + 1]) {
  dustyCount = parseInt(args[dustyIndex + 1], 10);
}

// Check for faulty flag
if (args.includes('--faulty')) {
  faultyCount = 1;
}

// Run the test
runFullAutomationTest({
  severity,
  dustyCount,
  faultyCount,
})
  .then((result) => {
    console.log('\n🎉 Test result:', result);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

