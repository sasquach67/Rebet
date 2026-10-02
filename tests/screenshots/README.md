# Calendar visual checks

Synthetic QA data only; no account or Discord data. Captured with Playwright + Chrome at 1400×1050 and 390×844, viewer timezone America/New_York, clock October 1, 2026 at 2 PM. Phone images are browser viewport emulation, not a physical device test.

- `calendar-desktop.png`: week grid, overlaps, red place-by and now markers, unknown-time row, won/lost colors.
- `calendar-desktop-detail.png`: detail sidebar.
- `calendar-phone.png`: horizontally scrollable week grid with sticky hour labels.
- `calendar-phone-detail.png`: bottom sheet.

Regenerate after `npm run build` with `node tests/calendar-ui.test.js` in an environment with Playwright and its Chromium browser installed. Optionally set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome; this run used the desktop's bundled Playwright via NODE_PATH. No new browser dependency is required by the shipped app.

The UI script checks exact 3:30 PM placement, duration height, overlap columns, split midnight events, no invented time, now/place-by positions, status-to-Tracker updates, Week/Day/Month navigation, phone overflow, edit/delete, modal dismissal, and the standalone file opened using `file://`.
