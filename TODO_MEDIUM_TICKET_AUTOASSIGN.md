n# TODO: Auto-Assign Technicians for Medium+ Priority Tickets

## Task
As soon as a ticket comes from scan, if its priority is above or equal to MEDIUM, it must be moved to tickets with allocated technician automatically.

## Plan
1. Update `server/src/routes/solarScans.ts` - Add MEDIUM to auto-ticket creation condition
2. Update `server/src/routes/automation.ts` - Add MEDIUM to shouldCreateTicket condition
3. Update `server/src/index.ts` - Add automation trigger for socket.io Pi data

## Changes Made
- [x] Updated shouldAutoCreateTicket in solarScans.ts to include 'medium' severity
- [x] Updated shouldCreateTicket in automation.ts to include 'medium' severity
- [x] Added automation trigger in index.ts for socket.io pi_analysis_result events
- [x] Build verified successfully

## Summary
The main issue was that when Pi sends data via socket.io, the automation was not being triggered. I added the same automation logic (that exists in solarScans.ts HTTP endpoint) to the socket.io handler in index.ts. Now when:
- A scan comes in with severity CRITICAL, HIGH, or MEDIUM
- OR there are 3+ dusty panels
- OR there are faulty panels

A ticket will be automatically created and assigned to an available technician.

