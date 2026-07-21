'use client'
import { useState } from 'react'
import { useFetch, apiPatch } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, StatCard } from '../ui'
import { fmtDate, fmtINR, ROLE_META, STATUS_COLORS, SessionUser } from '../types'
import { StockLookupCard } from '../stock-lookup'
import { ReportsTab } from './owner'

type UserRow = { id:string; name:string; email:string; role:string; phone:string|null; active:boolean; forcePasswordChange:boolean; createdAt:string }
type Item = { id:string; category:string; itemName:string; model:string; colour:string|null; currentStock:number; minStock:number; fastMoving:boolean; active:boolean }
type Challan = { id:string; challanNumber:string; clientName:string; clientCity:string; status:string; paymentStatus:string; amountTotal:number; amountReceived:number; createdAt:string }
type MessageRow = { id:string; fromRole:string; toRole:string; subject:string; body:string; read:boolean; createdAt:string; challan:{challanNumber:string}|null }
type ActivityLog = {
  id:string; type:'IN'|'OUT'; date:string; category:string; itemName:string;
  model:string; colour:string|null; quantity:number; unit:string;
  party:string; challanNumber:string|null; billNumber:string|null;
  remarks:string|null; enteredBy?: { name:string; role:string }
}

export function AdminDashboard({ user, activeTab, onTabChange }: { user: SessionUser; activeTab: string; onTabChange: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {activeTab === 'overview' && <OverviewTab onTabChange={onTabChange} />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'challans' && <ChallansTab />}
      {activeTab === 'items' && <ItemsTab />}
      {activeTab === 'messages' && <MessagesTab />}
      {activeTab === 'reports' && <ReportsTab role="ADMIN" />}
    </div>
  )
}

function OverviewTab({ onTabChange }: { onTabChange: (id: string) => void }) {
  // System-wide data (admin-only perspectives)
  const { data: overviewData, loading: lo } = useFetch<{
    snapshot: { totalSKUs:number; totalChallans:number; lowStockCount:number; outOfStockCount:number; collectionRate:number; pendingAmount:number; totalRevenue:number; totalReceived:number }
    activity: { challansLast30:number; challansLast7:number; dispatchesLast30:number; activeUsers:number; activeHolds:number }
    alerts: { severity:'critical'|'warning'|'info'; message:string; tab:string }[]
  }>('/api/overview')

  const { data: usersData, loading: lu } = useFetch<{ users: UserRow[] }>('/api/users')
  const { data: challansData, loading: lc } = useFetch<{ challans: Challan[] }>('/api/challans')
  const { data: itemsData, loading: li } = useFetch<{ items: Item[] }>('/api/items')
  const { data: messagesData, loading: lm } = useFetch<{ messages: MessageRow[] }>('/api/messages')
  const { data: activityData, loading: la } = useFetch<{ logs: ActivityLog[] }>('/api/activity-log?limit=10')

  if (lo || lu || lc || li || lm || la) {
    return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading system overview…</div>
  }
  if (!overviewData || !usersData || !challansData || !itemsData || !messagesData || !activityData) return null

  // ── Compute admin-specific stats ──
  const users = usersData.users
  const byRole: Record<string, number> = {}
  for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1

  // Pending user approvals: forced pw change (still need to be onboarded)
  const pendingPw = users.filter((u) => u.forcePasswordChange)

  // Recent logins (by createdAt — most recent first)
  const recentUsers = [...users]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)

  const inactiveCount = users.filter((u) => !u.active).length
  const totalChallans = challansData.challans.length
  const totalItems = itemsData.items.length
  const totalMessages = messagesData.messages.length
  const unreadMessages = messagesData.messages.filter((m) => !m.read).length

  const healthColor = (score: number) => score >= 80 ? '#3CB87A' : score >= 50 ? '#E09E3C' : '#E05050'
  const collectionRate = overviewData.snapshot.collectionRate

  return (
    <div className="space-y-4">
      {/* ── Admin identity banner — this is USER & SYSTEM management, not inventory ── */}
      <div className="rounded-xl border border-[#E05050]/30 bg-gradient-to-r from-[#E05050]/10 via-[#E05050]/4 to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#E05050]/20 text-lg">🛡️</div>
          <div className="flex-1">
            <div className="text-[13.5px] font-bold text-[#E05050]">System &amp; User Management</div>
            <div className="text-[11.5px] text-[#EDE4D0]/85 mt-0.5">
              You manage <span className="text-[#E4AF4A] font-medium">{users.length} user accounts</span>,{' '}
              <span className="text-[#E4AF4A] font-medium">{totalChallans} challans</span>,{' '}
              <span className="text-[#E4AF4A] font-medium">{totalItems} items</span>, and{' '}
              <span className="text-[#E4AF4A] font-medium">{totalMessages} messages</span> across the entire system.
              {inactiveCount > 0 && <span className="text-[#E09E3C]"> ⚠ {inactiveCount} disabled account(s).</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── System KPIs (admin-specific — Users/Challans/Items/Messages, not stock) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={users.length} sub={`${Object.keys(byRole).length} roles`} accent="#E05050" icon="👥" />
        <StatCard label="Total Challans" value={totalChallans} sub={`${overviewData.activity.challansLast30} new in 30d`} accent="#4A9EE0" icon="🧾" />
        <StatCard label="Total Items" value={totalItems} sub={`${overviewData.snapshot.outOfStockCount} out of stock`} accent="#E4AF4A" icon="📦" />
        <StatCard label="Total Messages" value={totalMessages} sub={`${unreadMessages} unread`} accent="#9B6ED4" icon="✉️" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Recent User Logins (admin-specific) ── */}
        <Card className="p-4">
          <SectionTitle icon="🆕" title="Recent User Accounts" sub="Newest accounts in the system" right={
            <Btn size="sm" variant="ghost" onClick={() => onTabChange('users')}>Manage →</Btn>
          } />
          {recentUsers.length === 0 ? (
            <EmptyState icon="👥" title="No users yet" />
          ) : (
            <div className="space-y-2">
              {recentUsers.map((u) => {
                const meta = ROLE_META[u.role as keyof typeof ROLE_META]
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-white/7 bg-white/[0.02] p-2.5">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[14px]" style={{ background: `${meta?.color}22`, border: `1px solid ${meta?.color}44` }}>
                      {meta?.icon || '👤'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-[#EDE4D0] font-medium truncate">{u.name}</div>
                      <div className="text-[10.5px] text-[#96A8BF] truncate">{u.email}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10.5px]" style={{ color: meta?.color }}>{meta?.label || u.role}</div>
                      <div className="text-[9.5px] text-[#4E6180]">Joined {fmtDate(u.createdAt)}</div>
                    </div>
                    {!u.active && <Badge label="Disabled" color="#E05050" />}
                    {u.forcePasswordChange && <Badge label="Pw Pending" color="#E09E3C" />}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* ── Pending User Approvals (admin-specific) ── */}
        <Card className="p-4">
          <SectionTitle icon="⚠️" title="Pending User Approvals" sub="Accounts needing admin attention" right={
            <Btn size="sm" variant="ghost" onClick={() => onTabChange('users')}>Manage →</Btn>
          } />
          {pendingPw.length === 0 && inactiveCount === 0 ? (
            <EmptyState icon="✅" title="All accounts in good standing" sub="No pending approvals or disabled accounts" />
          ) : (
            <div className="space-y-2">
              {pendingPw.map((u) => {
                const meta = ROLE_META[u.role as keyof typeof ROLE_META]
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-[#E09E3C]/25 bg-[#E09E3C]/5 p-2.5">
                    <span className="text-lg">🔑</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-[#EDE4D0] font-medium truncate">{u.name}</div>
                      <div className="text-[10.5px] text-[#96A8BF] truncate">{u.email}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10.5px]" style={{ color: meta?.color }}>{meta?.label}</div>
                      <div className="text-[9.5px] text-[#E09E3C]">Pw change pending</div>
                    </div>
                  </div>
                )
              })}
              {pendingPw.length === 0 && (
                <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3 text-[11.5px] text-[#96A8BF]">
                  {inactiveCount} disabled account(s) — visit User Management to enable.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ── Users by Role (admin-specific) ── */}
      <Card className="p-4">
        <SectionTitle icon="👥" title="Users by Role" sub="Distribution of accounts across departments" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {Object.entries(ROLE_META).map(([role, meta]) => {
            const count = byRole[role] || 0
            return (
              <div key={role} className="rounded-lg border border-white/7 bg-white/[0.02] p-3 text-center">
                <div className="text-xl mb-1">{meta.icon}</div>
                <div className="font-serif text-xl font-bold" style={{ color: meta.color }}>{count}</div>
                <div className="text-[10px] uppercase tracking-wide text-[#4E6180] mt-0.5">{meta.label}</div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── System Health (collection rate, holds) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Collection Rate" value={`${collectionRate}%`} sub={`${fmtINR(overviewData.snapshot.totalReceived)} of ${fmtINR(overviewData.snapshot.totalRevenue)}`} accent={healthColor(collectionRate)} icon="💰" />
        <StatCard label="Pending Amount" value={fmtINR(overviewData.snapshot.pendingAmount)} sub="Yet to collect" accent="#E05050" icon="⏳" />
        <StatCard label="Stock Holds" value={overviewData.activity.activeHolds} sub="Client reservations" accent="#9B6ED4" icon="🔒" />
        <StatCard label="Dispatches (30d)" value={overviewData.activity.dispatchesLast30} sub="Completed deliveries" accent="#3CB87A" icon="🚚" />
      </div>

      {/* ── Admin alerts (accounts that need admin attention) ── */}
      <Card className="p-4">
        <SectionTitle icon="🔔" title="System Alerts" sub="Items requiring admin attention" />
        <div className="space-y-2 mt-2">
          {overviewData.alerts.length === 0 && inactiveCount === 0 && pendingPw.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-[#3CB87A]/20 bg-[#3CB87A]/5 p-3">
              <span className="text-lg">✅</span>
              <span className="text-sm text-[#3CB87A]">All clear — system running smoothly.</span>
            </div>
          )}
          {pendingPw.length > 0 && (
            <button onClick={() => onTabChange('users')} className="flex items-center gap-3 w-full text-left rounded-lg border bg-white/[0.02] p-3 transition-all hover:bg-white/5" style={{ borderColor: '#E09E3C30' }}>
              <span className="text-lg">🟠</span>
              <span className="text-sm text-[#EDE4D0] flex-1">{pendingPw.length} user(s) have a pending password change</span>
              <span className="text-[10px] uppercase tracking-wide text-[#4E6180]">View →</span>
            </button>
          )}
          {inactiveCount > 0 && (
            <button onClick={() => onTabChange('users')} className="flex items-center gap-3 w-full text-left rounded-lg border bg-white/[0.02] p-3 transition-all hover:bg-white/5" style={{ borderColor: '#E0505030' }}>
              <span className="text-lg">🔴</span>
              <span className="text-sm text-[#EDE4D0] flex-1">{inactiveCount} disabled user account(s) — review to enable</span>
              <span className="text-[10px] uppercase tracking-wide text-[#4E6180]">View →</span>
            </button>
          )}
          {overviewData.alerts.map((a, i) => {
            const color = a.severity === 'critical' ? '#E05050' : a.severity === 'warning' ? '#E09E3C' : '#4A9EE0'
            const icon = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟠' : '🔵'
            return (
              <button key={i} onClick={() => onTabChange(a.tab)}
                className="flex items-center gap-3 w-full text-left rounded-lg border bg-white/[0.02] p-3 transition-all hover:bg-white/5"
                style={{ borderColor: `${color}30` }}>
                <span className="text-lg">{icon}</span>
                <span className="text-sm text-[#EDE4D0] flex-1">{a.message}</span>
                <span className="text-[10px] uppercase tracking-wide text-[#4E6180]">View →</span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* ── Audit Trail Summary (recent activity) ── */}
      <Card className="p-4">
        <SectionTitle icon="📜" title="Audit Trail" sub="Most recent system transactions" right={
          <Btn size="sm" variant="ghost" onClick={() => onTabChange('challans')}>All Challans →</Btn>
        } />
        {activityData.logs.length === 0 ? (
          <EmptyState icon="📜" title="No recent activity" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3">Party</th>
                  <th className="py-2 pr-3">Entered By</th>
                </tr>
              </thead>
              <tbody>
                {activityData.logs.map((l) => {
                  const isIn = l.type === 'IN'
                  return (
                    <tr key={`${l.type}-${l.id}`} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-[#96A8BF] whitespace-nowrap">{fmtDate(l.date)}</td>
                      <td className="py-2 pr-3"><Badge label={isIn ? 'IN' : 'OUT'} color={isIn ? '#3CB87A' : '#E05050'} /></td>
                      <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{l.itemName}</td>
                      <td className={`py-2 pr-3 text-right font-semibold ${isIn ? 'text-[#3CB87A]' : 'text-[#E05050]'}`}>
                        {isIn ? '+' : '−'}{l.quantity}
                      </td>
                      <td className="py-2 pr-3 text-[#96A8BF] max-w-[140px] truncate" title={l.party}>{l.party || '—'}</td>
                      <td className="py-2 pr-3 text-[#4E6180] text-[10px]">{l.enteredBy?.name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function UsersTab() {
  const { data, loading, refresh } = useFetch<{ users: UserRow[] }>('/api/users')
  const [resetUser, setResetUser] = useState<UserRow | null>(null)
  const [newPw, setNewPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const toggleActive = async (u: UserRow) => {
    await apiPatch('/api/users', { id: u.id, active: !u.active })
    refresh()
  }

  const doReset = async () => {
    if (!resetUser || !newPw) return
    if (newPw.length < 6) { setMsg('Min 6 characters'); return }
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch(`/api/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPw }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      setMsg('✓ Password updated. User can login with new password.')
      setNewPw('')
      setTimeout(() => { setResetUser(null); setMsg(''); refresh() }, 1500)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <Card className="p-4">
      <SectionTitle icon="👥" title="User Management" sub={`${data.users.length} accounts • Reset passwords, toggle active`} />
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
              <th className="py-2 pr-3">Name / Department</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Phone</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => {
              const meta = ROLE_META[u.role as keyof typeof ROLE_META]
              return (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{u.name}</td>
                  <td className="py-2 pr-3 text-[#96A8BF]">{u.email}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: meta?.color }}>
                      {meta?.icon} {meta?.label}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-[#96A8BF]">{u.phone || '—'}</td>
                  <td className="py-2 pr-3">
                    {u.active ? <Badge label="Active" color="#3CB87A" /> : <Badge label="Disabled" color="#E05050" />}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Btn size="sm" onClick={() => { setResetUser(u); setNewPw(''); setMsg('') }}>🔑 Change Pw</Btn>
                      <Btn size="sm" variant={u.active ? 'danger' : 'success'} onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</Btn>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title="Change Password">
        {resetUser && (
          <div className="space-y-3">
            <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
              <div className="text-[13px] text-[#EDE4D0] font-medium">{resetUser.name}</div>
              <div className="text-[11px] text-[#96A8BF]">{resetUser.email}</div>
            </div>
            <Input label="New Password" value={newPw} onChange={setNewPw} type="text" placeholder="Min 6 characters" required />
            <div className="text-[11px] text-[#96A8BF]">User can login directly with this new password — no forced change.</div>
            {msg && <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-2 text-xs text-[#3CB87A]">{msg}</div>}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setResetUser(null)}>Cancel</Btn>
              <Btn variant="gold" onClick={doReset} disabled={saving || !newPw}>{saving ? 'Saving…' : 'Update Password'}</Btn>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  )
}

function ChallansTab() {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null
  return (
    <Card className="p-4">
      <SectionTitle icon="🧾" title="All Challans" sub={`${data.challans.length} total`} />
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
              <th className="py-2 pr-3">Challan #</th>
              <th className="py-2 pr-3">Client</th>
              <th className="py-2 pr-3">City</th>
              <th className="py-2 pr-3 text-right">Total</th>
              <th className="py-2 pr-3 text-right">Received</th>
              <th className="py-2 pr-3">Payment</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {data.challans.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2 pr-3 text-[#E4AF4A] font-mono">{c.challanNumber}</td>
                <td className="py-2 pr-3 text-[#EDE4D0]">{c.clientName}</td>
                <td className="py-2 pr-3 text-[#96A8BF]">{c.clientCity}</td>
                <td className="py-2 pr-3 text-right text-[#EDE4D0]">{fmtINR(c.amountTotal)}</td>
                <td className="py-2 pr-3 text-right" style={{ color: STATUS_COLORS[c.paymentStatus] }}>{fmtINR(c.amountReceived)}</td>
                <td className="py-2 pr-3"><Badge label={c.paymentStatus} color={STATUS_COLORS[c.paymentStatus]} /></td>
                <td className="py-2 pr-3"><Badge label={c.status.replace(/_/g,' ')} color={STATUS_COLORS[c.status]} /></td>
                <td className="py-2 text-[#4E6180] text-[10px]">{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.challans.length === 0 && <EmptyState icon="🧾" title="No challans" />}
    </Card>
  )
}

function ItemsTab() {
  const { data, loading } = useFetch<{ items: Item[] }>('/api/items')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null
  return (
    <div className="space-y-4">
      {/* Cascading lookup: Category → Item → Model → live stock */}
      <StockLookupCard />

      <Card className="p-4">
        <SectionTitle icon="📦" title="All Items (Read-only)" sub={`${data.items.length} items • Edit via IT Manager`} />
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#111f32]">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3 text-right">Stock</th>
                  <th className="py-2 pr-3 text-right">Min</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-[#96A8BF]">{it.category}</td>
                    <td className="py-2 pr-3 text-[#EDE4D0]">{it.itemName}</td>
                    <td className="py-2 pr-3 text-[#96A8BF] font-mono">{it.model}</td>
                    <td className="py-2 pr-3 text-right" style={{ color: it.currentStock <= it.minStock ? '#E05050' : '#EDE4D0' }}>{it.currentStock}</td>
                    <td className="py-2 pr-3 text-right text-[#4E6180]">{it.minStock}</td>
                    <td className="py-2">{it.currentStock <= it.minStock ? <Badge label="Low" color="#E05050" /> : it.fastMoving ? <Badge label="Fast" color="#3CB87A" /> : <Badge label="OK" color="#96A8BF" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  )
}

function MessagesTab() {
  const { data, loading } = useFetch<{ messages: MessageRow[] }>('/api/messages')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null
  return (
    <Card className="p-4">
      <SectionTitle icon="✉️" title="All System Messages" sub={`${data.messages.length} total`} />
      {data.messages.length === 0 ? <EmptyState icon="✉️" title="No messages" /> : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {data.messages.map((m) => (
            <div key={m.id} className={`rounded-lg border p-3 ${m.read ? 'border-white/7 bg-white/[0.02]' : 'border-[#E4AF4A]/20 bg-[#E4AF4A]/5'}`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px] font-semibold text-[#EDE4D0] truncate">{m.subject}</span>
                <span className="text-[10px] text-[#4E6180]">{fmtDate(m.createdAt)}</span>
              </div>
              <p className="text-[11px] text-[#96A8BF] line-clamp-2">{m.body}</p>
              <div className="flex items-center gap-2 mt-1 text-[10px]">
                <Badge label={m.fromRole} color={ROLE_META[m.fromRole as keyof typeof ROLE_META]?.color} />
                <span className="text-[#4E6180]">→</span>
                <Badge label={m.toRole} color={ROLE_META[m.toRole as keyof typeof ROLE_META]?.color} />
                {m.challan && <span className="text-[#E4AF4A]">📎 {m.challan.challanNumber}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
