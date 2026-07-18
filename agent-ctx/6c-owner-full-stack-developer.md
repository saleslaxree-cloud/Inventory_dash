# Task 6c-owner — Owner dashboard Stock Register + Forecast + Activity Log tabs added

## What was done
Updated `/home/z/my-project/src/components/laxree/dashboards/owner.tsx` to add 3 new tabs (kept all 5 existing tabs intact):
1. **Stock Register** (`register`) 📋 — 8 summary StatCards (Total SKUs / Inward / Dispatched / Balance / On Hold / Available / Out of Stock / Low Stock) + category Select + "Low Stock Only" toggle + full stock table with sticky `<thead>` and `max-h-[60vh]` scroll. Columns: Sr / Category / Item / Model / Colour / Inward / Dispatched / Balance / On Hold / Available / Min Stock / Status badge. URL rebuilt from `?category=` + `&lowStock=true` so useFetch auto-refetches on filter change.
2. **Forecast** (`forecast`) 📈 — 4 summary StatCards (Critical red / Watch amber / OK green / No Data gray) + Critical Items table (top 8, sorted by daysLeft asc) + Top Moving Items table (top 8 by last30Dispatch) + Full Forecast table with status filter pills (All/Critical/Watch/OK/No Data). Table sorted by status priority (critical→warn→ok→nodata) then daysLeft asc; Days Left cell turns red when <30 days. Columns include Held, Available, Avg/Day, 30d Out, Suggested Reorder, Status badge.
3. **Activity Log** (`activity`) 📜 — 5 summary StatCards (Total Entries / Inward / Outward / Qty In / Qty Out, computed client-side from logs) + type filter pills (All=gold / IN=green / OUT=red when active) + combined IN+OUT table with sticky `<thead>` and `max-h-[60vh]` scroll. Columns: Date / Type badge / Category / Item / Model / Colour / Qty (±sign) / Party (Client or Vendor) / Challan / Bill No / Entered By / Remarks. URL rebuilt with `?type=` query for auto-refetch.

## Implementation notes
- Imports unchanged — already had everything needed (`useState`, `useFetch`/`apiPost`/`apiPatch`, full ui component set, `fmtDate`/`fmtINR`/`STATUS_COLORS`/`SessionUser` from types).
- Added 5 new types after existing types: `StockRow`, `StockSummary`, `ForecastRow`, `ForecastSummary`, `ActivityLog` — typed to match the exact API response shapes from `/api/stock-register`, `/api/forecast`, `/api/activity-log`.
- Added module constants:
  * `STOCK_CATEGORIES` — the 6 categories with real inventory (Room Amenities, Bathroom Amenities, Lobby Items, Bath Tubs, Banquet Furniture, Spare Parts). Linen & Bath Linen excluded since they have 0 stock per the audit-html-extract worklog.
  * `STATUS_COLOR_MAP` — maps both stock statuses (OK/LOW/OUT_OF_STOCK) and forecast statuses (critical/warn/ok/nodata) to LaxRee palette colors (green/amber/red/gray).
  * `STATUS_LABEL_MAP` — short badge labels for the same statuses.
- Extended nav array with 3 new entries after "Purchase Requests": `{ id:'register', label:'Stock Register', icon:'📋' }`, `{ id:'forecast', label:'Forecast', icon:'📈' }`, `{ id:'activity', label:'Activity Log', icon:'📜' }`. Note: PR and Stock Register both use 📋 icon but are distinguished by label.
- Added 3 tab render conditions in `OwnerDashboard` component body.
- All 3 new tab components appended at the end of the file after `PrintModal`:
  * `StockRegisterTab()` — state `{ cat:'ALL', lowOnly:false }`; URL = `/api/stock-register?category=${cat}${lowOnly ? '&lowStock=true' : ''}`. 8 StatCards in `grid-cols-2 md:grid-cols-4 lg:grid-cols-8`. Filter row uses `Select` + custom toggle button (red tint when active).
  * `ForecastTab()` — state `{ statusFilter:'ALL'|'critical'|'warn'|'ok'|'nodata' }`. Single fetch of `/api/forecast`, then client-side filter+sort for the full table. Two side-by-side cards (`lg:grid-cols-2`) for Critical Items + Top Moving Items, each rendering a compact table (no scroll container — relies on top 8 limit). Full table card with right-side filter pills (color-tinted when active via inline `style`). Days Left cell color: red if `<30`, else status color.
  * `ActivityLogTab()` — state `{ type:'ALL'|'IN'|'OUT' }`. URL = `/api/activity-log?limit=200${type !== 'ALL' ? `&type=${type}` : ''}`. 5 StatCards in `grid-cols-2 md:grid-cols-5`. Type filter pills color-coded (All=gold, IN=green, OUT=red when active). Derived stats (`inCount`, `outCount`, `qtyIn`, `qtyOut`) computed client-side from logs via `filter` + `reduce`.
- All long tables wrapped in `overflow-x-auto -mx-4 px-4` + `max-h-[60vh] overflow-y-auto` with sticky `<thead>` (`sticky top-0 bg-[#111f32] z-10`) — matches the pattern already established in it-manager.tsx and sales.tsx.
- Theme colors strictly adhere to LaxRee navy+gold palette; status colors use gold/green/red/amber/purple(gray for nodata) only — NO indigo/blue.
- Responsive grids: summary StatCards stack 2 cols on mobile, expand to 4/5/8 cols on md/lg; side-by-side cards stack on mobile, become `lg:grid-cols-2` on desktop.

## Verification
- `bun run lint` — clean exit 0 (no errors, no warnings).
- Dev server: `✓ Compiled in 220ms`, `✓ Compiled in 211ms`, `GET / 200 in 110ms` after edit — no runtime errors.
- Backing APIs verified present and live in dev.log: `GET /api/stock-register 200 in 147ms`, `GET /api/forecast 200 in 108ms`, `GET /api/activity-log 200 in 106ms`.

## Existing tabs preserved (unchanged)
- Overview (`overview`) — analytics KPIs + stock-by-category bars + challans-by-status grid
- Current Stock (`stock`) — items table with category filter
- Fast Moving (`fast`) — fast-moving item cards
- Challans (`challans`) — challan table with click-to-open detail modal (ChallanDetail component)
- Purchase Requests (`pr`) — PR list + Raise PR modal (PRForm component) + Print modal (PrintModal component)

All existing tab components (`OverviewTab`, `StockTab`, `FastTab`, `ChallansTab`, `ChallanDetail`, `PRTab`, `PRForm`, `PrintModal`) preserved 100% unchanged — backward compatible.
