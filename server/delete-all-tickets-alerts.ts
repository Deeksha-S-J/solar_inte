// Script to delete all tickets and alerts
// Run with: cd server && npx tsx delete-all-tickets-alerts.ts

import prisma from './src/db.js';

async function deleteAllTicketsAndAlerts() {
  console.log('🗑️  Deleting all tickets and alerts...\n');

  try {
    // First delete all ticket notes (they depend on tickets)
    const deletedNotes = await prisma.ticketNote.deleteMany({});
    console.log(`✅ Deleted ${deletedNotes.count} ticket notes`);

    // Delete all tickets
    const deletedTickets = await prisma.ticket.deleteMany({});
    console.log(`✅ Deleted ${deletedTickets.count} tickets`);

    // Delete all alerts
    const deletedAlerts = await prisma.alert.deleteMany({});
    console.log(`✅ Deleted ${deletedAlerts.count} alerts`);

    // Also delete all fault detections (they may have ticket references)
    const deletedFaults = await prisma.faultDetection.deleteMany({});
    console.log(`✅ Deleted ${deletedFaults.count} fault detections`);

    // Delete all automation events
    const deletedEvents = await prisma.automationEvent.deleteMany({});
    console.log(`✅ Deleted ${deletedEvents.count} automation events`);

    console.log('\n🎉 All tickets and alerts have been deleted!');
  } catch (error) {
    console.error('❌ Error deleting data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllTicketsAndAlerts();

