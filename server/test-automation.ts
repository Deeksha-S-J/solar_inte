// Test script to verify automatic ticket creation for medium+ severity scans
// Run with: cd server && npx tsx test-automation.ts

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testMediumSeverityScan() {
  console.log('🧪 Testing automatic ticket creation for MEDIUM severity scan...\n');

  const testScanData = {
    capture_id: `TEST-${Date.now()}`,
    timestamp: new Date().toISOString(),
    report: {
      health_score: 60,
      priority: 'MEDIUM',
      recommendation: 'Schedule maintenance',
      timeframe: 'within 1 week',
      summary: 'Moderate dust accumulation detected',
      root_cause: 'Dust accumulation on panels',
      impact_assessment: 'Minor efficiency loss'
    },
    rgb_stats: {
      total: 10,
      clean: 8,
      dusty: 2
    },
    thermal: {
      min_temp: 25,
      max_temp: 45,
      mean_temp: 35,
      delta: 10,
      risk_score: 45,
      severity: 'MODERATE'  // This should trigger automation
    },
    panel_crops: [
      { panel_number: 'P1', status: 'CLEAN', has_dust: false },
      { panel_number: 'P2', status: 'DUSTY', has_dust: true },
      { panel_number: 'P3', status: 'CLEAN', has_dust: false },
    ],
    device_id: 'test-device',
    device_name: 'Test Scanner'
  };

  try {
    console.log('📤 Sending test scan with MEDIUM/MODERATE severity...');

    const response = await fetch(`${API_URL}/api/solar-scans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testScanData),
    });

    const result = await response.json();
    console.log('📥 Response:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ Scan created successfully!');
      
      if (result.automation?.ticketCreated) {
        console.log('\n🎉 SUCCESS! Automation triggered:');
        console.log('   Ticket Number:', result.automation.ticketNumber);
        console.log('   Technician ID:', result.automation.technicianId);
      } else {
        console.log('\n⚠️ Scan created but no automation triggered');
        console.log('   Check if severity is MEDIUM or above');
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Test via automation endpoint directly
async function testViaAutomation() {
  console.log('\n\n🧪 Testing via automation endpoint...\n');

  try {
    const panelsResponse = await fetch(`${API_URL}/api/panels`);
    const panels = await panelsResponse.json();
    
    if (!panels || panels.length === 0) {
      console.log('⚠️ No panels found in database');
      return;
    }

    const panelId = panels[0].id;
    console.log('Using panel:', panels[0].panelId);

    const automationData = {
      panelId,
      severity: 'medium',
      faultType: 'dust_accumulation',
      description: 'Test: Automated medium severity fault',
      detectedAt: new Date().toISOString(),
      aiConfidence: 45,
      aiAnalysis: 'Test automation - medium severity',
      recommendedAction: 'Schedule cleaning'
    };

    const response = await fetch(`${API_URL}/api/automation/panel-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(automationData),
    });

    const result = await response.json();
    console.log('📥 Automation Response:', JSON.stringify(result, null, 2));

    if (result.ticketNumber) {
      console.log('\n🎉 SUCCESS! Ticket created via automation:');
      console.log('   Ticket Number:', result.ticketNumber);
      console.log('   Technician ID:', result.assignedTechnicianId);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run tests
testMediumSeverityScan()
  .then(() => testViaAutomation())
  .catch(console.error);

