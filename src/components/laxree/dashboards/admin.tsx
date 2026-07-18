'use client'
import { useState } from 'react'
import { useFetch, apiPatch } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, StatCard } from '../ui'
import { fmtDate, fmtINR, ROLE_META, STATUS_COLORS, SessionUser } from '../types'
import { StockLookupCard } from '../stock-lookup'

type UserRow = { id:string; name:string; email:string; role:string; phone:string|null; active:boolean; forcePasswordChange:boolean; createdAt:string }
type Item = { id:string; category:string; itemName:string; model:string; colour:string|null; currentStock:number; minStock:number; fastMoving:boolean; active:boolean }
type Challan = { id:string; challanNumber:string; clientName:string; clientCity:string; status:string; paymentStatus:string; amountTotal:number; amountReceived:number; createdAt:string }

export function AdminDashboard({ user, activeTab, onTabChange }: { user: SessionUser; activeTab: string; onTabChange: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {activeTab === 'overview' && <OverviewTab onTabChange={onTabChange} />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'challans' && <ChallansTab />}
      {activeTab === 'items' && <ItemsTab />}
      {activeTab === 'messages' && <MessagesTab />}
    </div>
  )
}

function OverviewTab({ onTabChange }: { onTabChange: (id: string) => void }) {
  const { data, loading } = useFetch<{
    health: { overall:number; stock:number; payment:number; workflow:number }
    alerts: { severity:'critical'|'warning'|'info'; message:string; tab:string }[]
    activity: { challansLast30:number; challansLast7:number; dispatchesLast30:number; activeUsers:number; activeHolds:number }
    snapshot: { totalSKUs:number; totalChallans:number; lowStockCount:number; outOfStockCount:number; collectionRate:number; pendingAmount:number; totalRevenue:number; totalReceived:number }
    byCategory: Record<string,number>
  }>('/api/overview')
  const { data: usersData, loading: lu } = useFetch<{ users: UserRow[] }>('/api/users')

  if (loading || lu) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading overview…</div>
  if (!data || !usersData) return null

  const inactiveUsers = usersData.users.filter((u) => !u.active).length
  const forcedPwChange = usersData.users.filter((u) => u.forcePasswordChange).length

  const healthColor = (score: number) => score >= 80 ? '#3CB87A' : score >= 50 ? '#E09E3C' : '#E05050'

  // Admin-specific alerts (on top of the system alerts)
  const adminAlerts: { severity:'critical'|'warning'|'info'; message:string; tab:string }[] = []
  if (inactiveUsers > 0) adminAlerts.push({ severity:'warning', message:`${inactiveUsers} user account(s) disabled`, tab:'users' })
  if (forcedPwChange > 0) adminAlerts.push({ severity:'info', message:`${forcedPwChange} user(s) must change password on next login`, tab:'users' })

  const allAlerts = [...adminAlerts, ...data.alerts]

  return (
    <div className="space-y-4">
      {/* ── System Health Score ── */}
      <Card className="p-4">
        <SectionTitle icon="🩺" title="System Health" sub="Composite score across stock, payments & workflow" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          <div className="rounded-lg border border-white/7 bg-white/[0.02] p-4 text-center">
            <div className="text-[10px] uppercase tracking-wide text-[#4E6180] mb-1">Overall</div>
            <div className="font-serif text-3xl font-bold" style={{ color: healthColor(data.health.overall) }}>{data.health.overall}</div>
            <div className="text-[10px] text-[#4E6180] mt-0.5">System score</div>
          </div>
          <div className="rounded-lg border border-white/7 bg-white/[0.02] p-4 text-center">
            <div className="text-[10px] uppercase tracking-wide text-[#4E6180] mb-1">Stock Health</div>
            <div className="font-serif text-3xl font-bold" style={{ color: healthColor(data.health.stock) }}>{data.health.stock}</div>
            <div className="text-[10px] text-[#4E6180] mt-0.5">{data.snapshot.outOfStockCount} out of stock</div>
          </div>
          <div className="rounded-lg border border-white/7 bg-white/[0.02] p-4 text-center">
            <div className="text-[10px] uppercase tracking-wide text-[#4E6180] mb-1">Payment Health</div>
            <div className="font-serif text-3xl font-bold" style={{ color: healthColor(data.health.payment) }}>{data.health.payment}</div>
            <div className="text-[10px] text-[#4E6180] mt-0.5">{data.snapshot.collectionRate}% collected</div>
          </div>
          <div className="rounded-lg border border-white/7 bg-white/[0.02] p-4 text-center">
            <div className="text-[10px] uppercase tracking-wide text-[#4E6180] mb-1">Workflow Health</div>
            <div className="font-serif text-3xl font-bold" style={{ color: healthColor(data.health.workflow) }}>{data.health.workflow}</div>
            <div className="text-[10px] text-[#4E6180] mt-0.5">Challans progressing</div>
          </div>
        </div>
      </Card>

      {/* ── Alerts (admin + system) ── */}
      <Card className="p-4">
        <SectionTitle icon="🔔" title="Action Needed" sub="Items requiring admin attention" />
        <div className="space-y-2 mt-2">
          {allAlerts.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-[#3CB87A]/20 bg-[#3CB87A]/5 p-3">
              <span className="text-lg">✅</span>
              <span className="text-sm text-[#3CB87A]">All clear — system running smoothly.</span>
            </div>
          )}
          {allAlerts.map((a, i) => {
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

      {/* ── Last 30 Days Activity ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="New Challans (30d)" value={data.activity.challansLast30} sub={`${data.activity.challansLast7} in last 7 days`} accent="#9B6ED4" icon="🧾" />
        <StatCard label="Dispatches (30d)" value={data.activity.dispatchesLast30} sub="Completed deliveries" accent="#3CB87A" icon="🚚" />
        <StatCard label="Active Users" value={data.activity.activeUsers} sub={`${usersData.users.length} total accounts`} accent="#E05050" icon="👥" />
        <StatCard label="Stock Holds" value={data.activity.activeHolds} sub="Client reservations" accent="#E09E3C" icon="🔒" />
      </div>

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
  const { data, loading } = useFetch<{ messages: Array<{ id:string; fromRole:string; toRole:string; subject:string; body:string; read:boolean; createdAt:string; challan:{challanNumber:string}|null }> }>('/api/messages')
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
