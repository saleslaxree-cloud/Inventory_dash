export type Role = 'ADMIN' | 'OWNER' | 'SALES' | 'ACCOUNT' | 'COORDINATOR' | 'SUPPORT' | 'IT_MANAGER'

export type SessionUser = {
  id: string
  email: string
  name: string
  role: Role
  phone: string | null
  forcePasswordChange: boolean
}

export const ROLE_META: Record<Role, { label: string; color: string; icon: string; desc: string }> = {
  ADMIN:      { label: 'Admin',         color: '#E05050', icon: '🛡️', desc: 'Full system control, user management, password reset' },
  OWNER:      { label: 'Owner',         color: '#E4AF4A', icon: '👑', desc: 'Dashboard, stock, fast-moving, auto PR + print' },
  SALES:      { label: 'Sales',         color: '#4A9EE0', icon: '💼', desc: 'Upload challan, auto-analysis, amount received' },
  ACCOUNT:    { label: 'Account Team',  color: '#3CB87A', icon: '💰', desc: 'Verify payment, e-way bill, item bill' },
  COORDINATOR:{ label: 'Coordinator',   color: '#9B6ED4', icon: '📋', desc: 'Packing, QC, vehicle, photos/videos' },
  SUPPORT:    { label: 'Support',       color: '#E09E3C', icon: '🚚', desc: 'Dispatch checklist, delivery feedback' },
  IT_MANAGER: { label: 'IT Manager',    color: '#9B6ED4', icon: '⚙️', desc: 'Full edit, item CRUD, analytics' },
}

export const NAVY  = { 0:'#07101f',1:'#0c1928',2:'#111f32',3:'#192b42',4:'#1e3350' }
export const GOLD  = { 0:'#C8922A',1:'#E4AF4A',2:'#F5D27A',3:'#fcefc9' }
export const STAT  = { success:'#3CB87A', danger:'#E05050', warn:'#E09E3C', info:'#4A9EE0', purple:'#9B6ED4' }

export const STAGE_LABELS: Record<string, string> = {
  PAYMENT_VERIFY: 'Payment Verify',
  PACKING: 'Packing',
  QC: 'QC Check',
  VEHICLE_ARRANGEMENT: 'Vehicle Arrangement',
  EWAY_BILL: 'E-Way Bill',
  ITEM_BILL: 'Item Bill',
  DISPATCH: 'Dispatch',
  PHOTOS_VIDEOS: 'Photos / Videos',
  ADMIN_VERIFY: 'Admin Verify',
}

export const STATUS_COLORS: Record<string, string> = {
  PENDING: '#96A8BF',
  IN_PROGRESS: '#E09E3C',
  DONE: '#3CB87A',
  SKIPPED: '#4E6180',
  UPLOADED: '#4A9EE0',
  PAYMENT_VERIFIED: '#3CB87A',
  DISPATCHED: '#9B6ED4',
  IN_TRANSIT: '#E09E3C',
  DELIVERED: '#3CB87A',
  FEEDBACK: '#E4AF4A',
  CLOSED: '#4E6180',
  MATCHED: '#3CB87A',
  WRONG_MODEL: '#E09E3C',
  NOT_FOUND: '#E05050',
  PAID: '#3CB87A',
  PARTIAL: '#E09E3C',
  DRAFT: '#96A8BF',
  PRINTED: '#4A9EE0',
  SENT: '#3CB87A',
  // Purchase Request lifecycle
  PENDING_APPROVAL: '#E05050',
  SIGNED: '#4A9EE0',
  PROCESSED: '#3CB87A',
  REJECTED: '#E05050',
}

export function fmtINR(n: number) {
  return '₹' + Number(n || 0).toLocaleString('en-IN')
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
}
