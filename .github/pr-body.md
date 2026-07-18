# Workflow Redesign + Challan Auto-Fill + Branding Fixes

## Summary

End-to-end redesign of the Laxree Inventory dashboard workflow across Sales, Account, Coordinator, and Support teams, plus AI-powered challan PDF auto-fill, branding fixes, and Overview tab cleanup.

## What's Included

### 1. Workflow Redesign (4 dashboards)
- **Sales**: Dashboard -> Check Stock -> My Challans -> Stock Hold -> **Upload Challan (last)**
- **Account**: Payment verification + E-Way bill + Item Bill (invoice) uploads
- **Coordinator**: Audit (QC -> Packaging -> Done) -> Vehicle arrangement -> Dispatch
- **Support**: WhatsApp tracking link + Client review request/submit

Complete 14-step end-to-end workflow chain verified via API tests (14/14 passed).

### 2. AI-Powered Challan Auto-Fill
- New `/api/challans/extract` endpoint (thin proxy to mini-service)
- New `mini-services/challan-extract/` (port 3031) using `z-ai-web-dev-sdk` VLM (glm-4.6v)
- Sales UploadTab now has a prominent **"Auto-fill from Challan PDF"** card at the top
- Uploads PDF -> calls VLM -> auto-populates Sections A/B/C (client details, financials, items)
- All auto-filled fields remain fully editable for review
- Demo verified with real CASACONNECT challan PDF - all data extracted correctly in ~14s

### 3. Branding Fixes
- Replaced logo with user-provided LAXREE logo (gold "LAXREE" + "Hotel Supplies Redefined")
- Renamed **"LaxRee Hotel" -> "Laxree"** everywhere (sidebar, login, loading screen, PR letterhead, WhatsApp messages, review requests)

### 4. Overview Tab Cleanup
- Removed full-table duplication from Overview tab
- Overview now shows only summary cards (total items, challans, stock value, alerts)
- Dedicated section tabs retain the full tables

### 5. Database / Infra
- Neon PostgreSQL + Vercel serverless DB connection fix
- New schema with 40+ fields on Challan + 15+ fields on ChallanItem
- 11 API routes created/updated for the workflow
- DB health check endpoint

## Files Changed
- 25 files changed, +1932 / -132 lines
- New: `api/challans/extract/route.ts`, `api/db-health/route.ts`, `api/overview/route.ts`, `mini-services/challan-extract/`, `start-services.sh`
- Modified: all 4 dashboard components, app-shell, login-screen, page.tsx, lib/db.ts

## Verification
- `bun run lint`: 0 errors, 0 warnings
- `npx tsc --noEmit`: 0 errors in src/
- `bun run db:push`: schema synced
- 14-step end-to-end API workflow test: 14/14 passed
- Sales Dashboard visually verified in browser
- Challan auto-fill demo verified with real PDF (CASACONNECT challan)
