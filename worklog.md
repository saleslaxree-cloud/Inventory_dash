---
Task ID: v4-audit
Agent: main (Z.ai Code)
Task: Full system audit & upgrade — remove old person names, use department names, add Admin credential, password change, fix bugs, clean cache/unused code, make all data real & working.

Work Log:
- Cleaned cache: .next, node_modules/.cache, temp screenshots, old HTML preview file
- Audited codebase: found 5 bugs (broken POST in Account MessagesTab, EditItem creates-new instead of update, Support date bug, PHOTOS_VIDEOS missing from workflow stages, negative pending in analytics)
- Updated Prisma schema: added ADMIN role, forcePasswordChange field, data default "{}" for WorkflowStage
- Reset database + re-seeded with 7 users (department names; Owner = "Ashish Agarwal")
- Updated auth API: login returns forcePasswordChange, added PATCH /api/auth/me for password change
- Added /api/users/[id]/reset-password (Admin resets user password, forces change)
- Added /api/items/[id] PATCH (real item editing with inward/outward tracking) + DELETE (soft delete)
- Added /api/users PATCH (Admin toggles user active status)
- Fixed Account MessagesTab: removed broken apiPost call, proper PATCH for mark-read
- Fixed IT Manager EditItemForm: uses PATCH /api/items/[id] instead of creating new
- Fixed Support pending dispatch: fmtDate(c) → fmtDate(c.expectedDeliveryDate)
- Fixed analytics: Math.max(0, totalPending) prevents negative
- Fixed Coordinator PhotosTab: only marks PHOTOS_VIDEOS done (DISPATCH handled by Support)
- Added PHOTOS_VIDEOS stage to initial workflow creation in challan upload
- Built AdminDashboard: System Overview (KPIs, users by role, challans by status), User Management (reset password, toggle active), All Challans, All Items (read-only), All Messages
- Built PasswordChangeModal: forced on first login (forcePasswordChange=true), can't be dismissed until changed
- Updated AppShell: added password change button (🔑) in sidebar, force-change badge in topbar
- Updated LoginScreen: 7 roles including Admin, shows default credentials + first-login warning
- Updated page.tsx: ADMIN role routing, onPasswordChanged handler to refresh session
- Verified with Agent Browser: Admin login + force password change + Admin dashboard (7 users, 6 pending pw, 35 items, ₹2,85,000 revenue); Owner login + password change + Owner dashboard (Ashish Agarwal in sidebar, analytics data loading); User Management tab showing all department-named users

Stage Summary:
- 7 roles operational: Admin, Owner (Ashish Agarwal), Sales/Account/Coordinator/Support/IT (department names)
- Password: Admin=admin123 (now admin456), Owner=laxree123 (now owner123), others=laxree123 (force change on login)
- All bugs fixed, lint clean, no runtime errors
- All data real & working: 35 items, 1059 stock, 1 challan, analytics flowing
- Admin can reset any user's password + enable/disable accounts
- Force password change on first login for all accounts

---
Task ID: v5-login-fix
Agent: main (Z.ai Code)
Task: Fix login flow — remove forced password change on login. Admin sets passwords, users login directly. Admin can change any user's password.

Work Log:
- Identified issue: seed had forcePasswordChange=true for all users, causing PasswordChangeModal to auto-open on login (open={pwModal || forcePw})
- Updated prisma/seed.ts: set forcePasswordChange=false for all 7 users; upsert now force-updates password/name/role/phone/active on existing records
- Updated src/components/laxree/app-shell.tsx: removed forcePw variable and forced modal trigger; PasswordChangeModal now only opens when user clicks 🔑 button; removed "Change Password" badge from topbar
- Updated src/components/laxree/login-screen.tsx: replaced "⚠ First login requires password change" warning with "✓ Login directly — Admin can change passwords anytime"
- Updated src/components/laxree/password-change-modal.tsx: changed warning text from "must change before continuing" to "keep your account secure" (now optional, not forced)
- Updated src/app/api/users/[id]/reset-password/route.ts: set forcePasswordChange=false when admin resets password (user can login directly with new password)
- Updated src/components/laxree/dashboards/admin.tsx: removed "Pending Pw Change" stat card (replaced with "Low Stock"); removed "Pw Status" column; merged into single "Status" column; renamed "🔑 Reset" button to "🔑 Change Pw"; updated modal title to "Change Password"; updated success message to "User can login with new password"
- Reset database: deleted db/custom.db (correct location, not prisma/dev.db), ran db:push + seed
- Restarted dev server (needed to clear cached PrismaClient connection to old database)
- Verified with Agent Browser:
  * Owner login (owner@laxree.com / laxree123) → goes directly to Owner dashboard, no password modal
  * Admin login (admin@laxree.com / admin123) → goes directly to Admin dashboard, no password modal
  * Admin → User Management → "🔑 Change Pw" on Account user → set "newpass123" → success
  * Verified old password (laxree123) now fails for Account user, new password (newpass123) works with forcePasswordChange=false
  * Owner dashboard shows real data: 35 items, ₹2,85,000 revenue, 1 challan
  * No console errors, no forced password change anywhere

Stage Summary:
- Login now works directly — no forced password change on first login or after admin reset
- Admin can change any user's password from User Management (🔑 Change Pw button)
- Users can change their own password via 🔑 button in sidebar (optional, not forced)
- All 7 users have forcePasswordChange=false; passwords: admin=admin123, owner/others=laxree123
- Database reset with fresh seed; dev server restarted to pick up new DB
- All data real & working (35 items, 1 challan, analytics flowing)
