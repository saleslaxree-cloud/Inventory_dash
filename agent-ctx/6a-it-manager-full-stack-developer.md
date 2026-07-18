# Task 6a-it-manager — IT Manager dashboard tabs added

## What was done
Updated `/home/z/my-project/src/components/laxree/dashboards/it-manager.tsx` to add 4 new tabs (kept all existing tabs intact):
1. **Inward Entry** (`inward`) — form (Date / Category / Item / Model auto-fill / Colour auto-fill / Qty / Vendor / Bill No / Remarks) + Recent Inward Logs table (sticky header, max-h-[60vh] scroll).
2. **Stock Register** (`register`) — 6 summary StatCards (Total SKUs / Inward / Dispatched / Balance / On Hold / Available) + filter dropdown (category) + "Low Stock Only" toggle + full stock table with status pills (OK/LOW/OUT).
3. **Activity Log** (`activity`) — combined IN+OUT table with type filter pills (All / Inward / Outward), color-coded type badges, columns: Date / Type / Category / Item / Model / Colour / Qty / Party / Challan / Bill No / Entered By.
4. **Forecast** (`forecast`) — 4 summary StatCards (Critical / Watch / OK / No Data) + Critical Items list (top 8 with daysLeft) + Top Moving Items list (top 8 by 30-day dispatch) + Full Forecast table (Balance / AvgPerDay / Days Left / Suggested Reorder / Status, sorted by status priority then daysLeft asc).

## Implementation notes
- Imports extended: added `Textarea` from `../ui` and `fmtDate` from `../types`.
- Added new types: `InwardLog`, `ActivityLog`, `StockRow`, `StockSummary`, `ForecastRow`, `ForecastSummary`.
- Added module-level constants: `CATEGORIES` (8 master categories), `STATUS_COLOR_MAP` and `STATUS_LABEL_MAP` mapping stock + forecast status codes to colors / labels.
- `InwardTab` uses one `useFetch('/api/items')` call and filters client-side by category; selected item lookup auto-fills Model + Colour via a small `ReadonlyField` helper (read-only display styled like Input).
- `StockRegisterTab` rebuilds URL with `?category=` and `&lowStock=true` query — `useFetch` auto-refetches when URL changes (cat / lowOnly state changes).
- `ActivityLogTab` rebuilds URL with `?type=IN|OUT` query when type filter changes.
- `ForecastTab` sorts the forecasts list client-side by status priority (critical→warn→ok→nodata) then by daysLeft asc.
- All long tables wrapped in `max-h-[60vh] overflow-y-auto` with sticky `<thead>` (`sticky top-0 bg-[#111f32] z-10`).
- All tables wrapped in `overflow-x-auto -mx-4 px-4` for mobile horizontal scroll.
- Theme colors strictly adhere to LaxRee navy+gold palette; status colors use gold/green/red/amber/gray only (no indigo/blue).

## Verification
- `bun run lint` — clean (no errors, no warnings).
- Dev server compiled successfully (`✓ Compiled in 303ms`).
- All 4 backing APIs verified live in dev.log: `GET /api/stock-register 200`, `GET /api/forecast 200`, `GET /api/activity-log 200`, `GET /api/items 200`, `GET /api/inward 200`.

## Existing tabs preserved (unchanged)
- Item Master (`items`) — items list + edit modal
- Add Item (`add`) — create new master item
- Analytics (`analytics`) — KPIs + low stock + by-category bars + revenue
- Users (`users`) — system users grid
- All Challans (`all-challans`) — admin challan table
