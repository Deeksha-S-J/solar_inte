# TODO: Alert Initialization Fix for PanelGrid

## Task
Modify PanelGrid.tsx to fetch existing alerts on initialization to prevent duplicate alerts.

## Steps
1. [x] Analyze the codebase - DONE
2. [x] Modify PanelGrid.tsx to fetch existing alerts on initialization
3. [ ] Test the implementation

## Details
The backend already handles:
- Not creating duplicate alerts (updates existing)
- Creating new ticket when warning escalates to fault

The frontend needed:
- Fetch existing alerts from `/api/alerts` on page load
- Populate `alertedRowsRef` with rows that already have alerts
- This prevents re-triggering alerts for rows that already have tickets

## Changes Made
1. Added `alertsInitialized` state to track when alerts are loaded from DB
2. Added useEffect to fetch existing alerts on component mount
3. Modified alert triggering useEffect to wait for alerts to be initialized
4. Updated dependency array to include `alertsInitialized`
5. Removed toast notifications when alerts are created
6. Changed ticket ID format to `FAULT ID-FK-XXX` (starting from FAULT ID-FK-001)
7. Updated row color logic in PanelGrid:
   - <10V = fault (red)
   - 11-15V = warning (orange)
   - >15V = healthy (green)
8. Added alertId field to Alert model (ALERT ID-AK-XXX format)
9. Updated AlertCard to display the alert ID
10. Ran Prisma db push to update the database schema


