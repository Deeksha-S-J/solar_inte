# Fix Plan: Alerts Issues

## Issues Fixed:
1. Alerts come back after refresh - ✅ Now permanently deleted from DB (was working correctly)
2. Multiple alerts created per row - ✅ Added row-level deduplication to all fault creation points

## Additional Changes Made:
3. Show row number instead of panel number in alerts
4. Remove RGB and thermal image fields in alerts (make them optional for initial alerts)

## Root Cause Identified:
- Multiple entry points were creating faults WITHOUT checking for existing recent faults:
  - Socket.io `thermal-image` event - NO deduplication (FIXED - now checks row level)
  - Socket.io `pi_analysis_result` event - NO deduplication (FIXED - now checks row level)
  - POST `/api/solar-scans` endpoint - NO deduplication (FIXED - now checks row level)
  - POST `/api/faults/panel-status-alert` - Panel level dedup (FIXED - now checks row level)
  - `/api/automation/panel-error` - Panel level dedup (FIXED - now checks row level)
- The DELETE endpoint was already working correctly (permanently deletes from DB)

## Files Edited:
1. `server/src/index.ts` - Added row-level deduplication to both socket handlers
2. `server/src/routes/solarScans.ts` - Added row-level deduplication to POST endpoint
3. `server/src/routes/faults.ts` - Added row-level deduplication to panel-status-alert
4. `server/src/routes/automation.ts` - Updated findDuplicateFault to use row-level dedup
5. `src/types/solar.ts` - Added panelRow field and made images optional
6. `src/pages/Alerts.tsx` - Include panel row in API response transformation
7. `src/components/dashboard/AlertCard.tsx` - Show row number, make images optional
8. `src/pages/PanelGrid.tsx` - Show row number in toast notifications

## Deduplication Logic (Row-Level):
- 15-minute window for all fault creation
- Checks for existing faults in the SAME ROW within the window
- Gets all panel IDs in the same row, then checks if any have recent faults
- If duplicate found for the row, skips creation and logs warning

## Implementation Steps Completed:
- [x] 1. Added row-level deduplication to thermal-image socket handler
- [x] 2. Added row-level deduplication to pi_analysis_result socket handler  
- [x] 3. Added row-level deduplication to solarScans POST endpoint
- [x] 4. Added row-level deduplication to faults.ts panel-status-alert
- [x] 5. Updated automation.ts findDuplicateFault for row-level dedup
- [x] 6. Verified DELETE endpoint works correctly (it does)
- [x] 7. Updated AlertCard to show row number instead of panel ID
- [x] 8. Made RGB/thermal images optional in AlertCard (show only if available)
- [x] 9. Updated PanelGrid toast to show row number

## How to Test:
1. Restart the server to load the changes
2. Create an alert (will be saved to DB)
3. Dismiss the alert (will be permanently deleted from DB)
4. Refresh page - alert should NOT reappear
5. Try to create another alert for any panel in the same row within 15 minutes - should be blocked as duplicate
6. Check that alerts show row number instead of panel ID
7. Check that images are only shown if available

