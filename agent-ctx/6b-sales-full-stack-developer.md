# Task 6b-sales — Sales dashboard Outward + Stock Hold tabs added

## What was done
Updated `/home/z/my-project/src/components/laxree/dashboards/sales.tsx` to add 2 new tabs (kept all existing tabs intact):
1. **Outward Entry** (`outward`) 📤 — full dispatch form (Date / Category / Item dropdown filtered by category / Model autofill / Colour autofill / Qty with live available-stock indicator / Client Name / Challan No / Bill No / Remarks) + Recent Outward Logs table with sticky header and max-h-[60vh] scroll. Posts to `/api/outward` and refreshes both the stock register and the logs table on success.
2. **Stock Hold** (`hold`) 🔒 — full reservation form (Date / Category / Item / Model+Colour autofill / Hold Qty with live "Available after holds" indicator / Client Name / Advance Amount ₹ / Remarks) + 3 summary StatCards (Active Holds / Total Held Qty / Total Advance ₹) + Active Holds table with Release button (PATCH `/api/stock-hold` status=RELEASED). Sticky header, max-h-[60vh] scroll.

## Implementation notes
- Imports extended: added `useMemo` from react, `apiPatch` from `../use-fetch`, `Textarea` from `../ui`.
- Note: task description said `/api/stock-holds` (plural) but the actual route in this codebase is `/api/stock-hold` (singular). Used the actual route.
- Added new types: `OutwardLog`, `StockHold`, `StockRow`.
- Added module constants: `CATEGORIES` (8 master cats), `HOLD_STATUS_COLOR` map (ACTIVE=amber, RELEASED=gray, CONVERTED=green).
- Both tabs use one `useFetch('/api/items')` call and filter client-side by category via `useMemo`; selecting an item auto-fills Model + Colour via a small `ReadonlyField` helper (read-only display styled like Input).
- Available stock is looked up client-side from `/api/stock-register` (single fetch) using `useMemo` against the selected `itemId`. The available indicator is color-coded red (≤0) / amber (≤ minStock) / green (otherwise); for the hold tab it also shows the balance and already-held breakdown.
- Validation in both forms: qty > 0 and ≤ available (also enforced by API which returns a 400 with a descriptive message).
- On submit: `apiPost` → reset form → `refreshReg()` + `refreshLogs()` / `refreshHolds()` → show green success message. On error: show red error box with the API message.
- Release action: `apiPatch('/api/stock-hold', { id, status: 'RELEASED' })` with a `releasing` state for the row button label ("Releasing…") and disabled state.
- All long tables wrapped in `overflow-x-auto -mx-4 px-4` + `max-h-[60vh] overflow-y-auto` with sticky `<thead>` (`sticky top-0 bg-[#111f32] z-10`).
- Theme colors strictly adhere to LaxRee navy+gold palette; status colors use gold/green/red/amber/gray only (no indigo/blue).
- Responsive grids: form fields stack 1 col on mobile, 2 on md, 3 on lg; summary StatCards 1 col mobile, 3 cols sm+.

## Verification
- `bun run lint` — clean exit 0 (no errors, no warnings).
- Dev server: `GET / 200 in 108ms` after edit, `✓ Compiled in 291ms` — no runtime errors.
- Backing APIs verified present in `src/app/api/outward/route.ts`, `src/app/api/stock-hold/route.ts`, `src/app/api/stock-register/route.ts`, `src/app/api/items/route.ts`.

## Existing tabs preserved (unchanged)
- My Challans (`list`) — challan table with click-to-open analysis modal
- Upload Challan (`upload`) — multi-item upload form with auto-analysis result screen
- ChallanAnalysis — shared modal with payment summary, item availability buckets, detailed item table
