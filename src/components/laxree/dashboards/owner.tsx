'use client'
import { useState } from 'react'
import { useFetch, apiPost, apiPatch } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, STAGE_LABELS } from '../types'
import { SessionUser } from '../types'
import { StockLookupCard } from '../stock-lookup'

type Item = { id:string; category:string; itemName:string; model:string; colour:string|null; currentStock:number; minStock:number; fastMoving:boolean }
type ChallanItem = { id:string; itemName:string; itemNumber:string|null; model:string|null; quantity:number; status:string; matchedItem: Item|null }
type Challan = { id:string; challanNumber:string; clientName:string; clientCity:string; expectedDeliveryDate:string|null; amountTotal:number; amountAdvance:number; amountReceived:number; paymentStatus:string; status:string; createdAt:string; challanItems:ChallanItem[] }
type PR = { id:string; prNumber:string; raisedByName:string; status:string; notes:string|null; createdAt:string; items:{id:string;itemName:string;model:string|null;quantity:number;item:Item|null}[] }

type StockRow = {
  id:string; category:string; itemName:string; model:string; colour:string|null;
  unit:string; inward:number; dispatched:number; balance:number; onHold:number;
  available:number; minStock:number; fastMoving:boolean;
  status:'OK'|'LOW'|'OUT_OF_STOCK'
}
type StockSummary = {
  totalSKUs:number; totalInward:number; totalDispatched:number; totalBalance:number;
  totalOnHold:number; totalAvailable:number; outOfStock:number; lowStock:number
}
type ForecastRow = {
  id:string; category:string; itemName:string; model:string; colour:string|null;
  balance:number; held:number; available:number; minStock:number;
  totalDispatched:number; avgPerDay:number; daysLeft:number|null;
  last30Dispatch:number; suggestedReorder:number;
  status:'critical'|'warn'|'ok'|'nodata'
}
type ForecastSummary = {
  totalSKUs:number; critical:number; warn:number; ok:number; nodata:number;
  topMoving:ForecastRow[]; criticalItems:ForecastRow[]
}
type ActivityLog = {
  id:string; type:'IN'|'OUT'; date:string; category:string; itemName:string;
  model:string; colour:string|null; quantity:number; unit:string;
  party:string; challanNumber:string|null; billNumber:string|null;
  remarks:string|null; enteredBy?: { name:string; role:string }
}

// Stock categories with actual inventory (6 — Linen & Bath Linen have no stock)
const STOCK_CATEGORIES = ['Room Amenities','Bathroom Amenities','Lobby Items','Bath Tubs','Banquet Furniture','Spare Parts']

const STATUS_COLOR_MAP: Record<string, string> = {
  OK: '#3CB87A', LOW: '#E09E3C', OUT_OF_STOCK: '#E05050',
  critical: '#E05050', warn: '#E09E3C', ok: '#3CB87A', nodata: '#96A8BF',
}
const STATUS_LABEL_MAP: Record<string, string> = {
  OK: 'OK', LOW: 'LOW', OUT_OF_STOCK: 'OUT',
  critical: 'CRITICAL', warn: 'WATCH', ok: 'OK', nodata: 'NO DATA',
}

export function OwnerDashboard({ user, activeTab, onTabChange }: { user: SessionUser; activeTab: string; onTabChange: (id: string) => void }) {

  const nav = [
    { id:'overview', label:'Overview', icon:'📊' },
    { id:'stock', label:'Current Stock', icon:'📦' },
    { id:'fast', label:'Fast Moving', icon:'⚡' },
    { id:'challans', label:'Challans', icon:'🧾' },
    { id:'pr', label:'Purchase Requests', icon:'📋' },
    { id:'register', label:'Stock Register', icon:'📋' },
    { id:'forecast', label:'Forecast', icon:'📈' },
    { id:'activity', label:'Activity Log', icon:'📜' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {nav.map((n) => (
          <button key={n.id} onClick={() => onTabChange(n.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              activeTab===n.id ? 'bg-[#C8922A]/15 text-[#E4AF4A] border-[#C8922A]/25' : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
            }`}>
            <span className="mr-1">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab onTabChange={onTabChange} />}
      {activeTab === 'stock' && <StockTab />}
      {activeTab === 'fast' && <FastTab />}
      {activeTab === 'challans' && <ChallansTab />}
      {activeTab === 'pr' && <PRTab user={user} />}
      {activeTab === 'register' && <StockRegisterTab />}
      {activeTab === 'forecast' && <ForecastTab />}
      {activeTab === 'activity' && <ActivityLogTab />}
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

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading overview…</div>
  if (!data) return null

  const healthColor = (score: number) => score >= 80 ? '#3CB87A' : score >= 50 ? '#E09E3C' : '#E05050'
  const healthLabel = (score: number) => score >= 80 ? 'Healthy' : score >= 50 ? 'Needs Attention' : 'Critical'

  return (
    <div className="space-y-4">
      {/* ── System Health Score (cross-cutting metric, not duplicated anywhere) ── */}
      <Card className="p-4">
        <SectionTitle icon="🩺" title="System Health" sub="Composite score across stock, payments & workflow" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          <div className="rounded-lg border border-white/7 bg-white/[0.02] p-4 text-center">
            <div className="text-[10px] uppercase tracking-wide text-[#4E6180] mb-1">Overall</div>
            <div className="font-serif text-3xl font-bold" style={{ color: healthColor(data.health.overall) }}>{data.health.overall}</div>
            <div className="text-[10px] mt-0.5" style={{ color: healthColor(data.health.overall) }}>{healthLabel(data.health.overall)}</div>
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

      {/* ── Alerts (actionable, not duplicated — points to the right tab) ── */}
      <Card className="p-4">
        <SectionTitle icon="🔔" title="Action Needed" sub="Items requiring your attention" />
        <div className="space-y-2 mt-2">
          {data.alerts.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-[#3CB87A]/20 bg-[#3CB87A]/5 p-3">
              <span className="text-lg">✅</span>
              <span className="text-sm text-[#3CB87A]">All clear — no items need attention right now.</span>
            </div>
          )}
          {data.alerts.map((a, i) => {
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

      {/* ── Last 30 Days Activity (trend, not detailed list) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="New Challans (30d)" value={data.activity.challansLast30} sub={`${data.activity.challansLast7} in last 7 days`} accent="#9B6ED4" icon="🧾" />
        <StatCard label="Dispatches (30d)" value={data.activity.dispatchesLast30} sub="Completed deliveries" accent="#3CB87A" icon="🚚" />
        <StatCard label="Active Users" value={data.activity.activeUsers} sub="Team members" accent="#4A9EE0" icon="👥" />
        <StatCard label="Stock Holds" value={data.activity.activeHolds} sub="Client reservations" accent="#E09E3C" icon="🔒" />
      </div>

      {/* ── Stock Distribution by Category (cross-cutting view) ── */}
      <Card className="p-4">
        <SectionTitle icon="📊" title="Stock Distribution" sub="Units across categories" />
        <div className="space-y-2 mt-2">
          {Object.entries(data.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, qty]) => {
              const max = Math.max(...Object.values(data.byCategory), 1)
              const pct = Math.round((qty / max) * 100)
              return (
                <div key={cat} className="flex items-center gap-3">
                  <div className="w-36 text-[11px] text-[#96A8BF] truncate">{cat}</div>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #C8922A, #E4AF4A)' }} />
                  </div>
                  <div className="w-12 text-right text-[11px] font-semibold text-[#EDE4D0]">{qty}</div>
                </div>
              )
            })}
          {Object.keys(data.byCategory).length === 0 && <EmptyState title="No stock data" />}
        </div>
      </Card>

      {/* ── Quick Navigation (links to dedicated tabs, no data duplication) ── */}
      <Card className="p-4">
        <SectionTitle icon="🧭" title="Quick Access" sub="Jump to a dedicated section" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
          {[
            { id: 'stock', label: 'Current Stock', icon: '📦' },
            { id: 'fast', label: 'Fast Moving', icon: '⚡' },
            { id: 'challans', label: 'Challans', icon: '🧾' },
            { id: 'pr', label: 'Purchase Requests', icon: '📋' },
            { id: 'register', label: 'Stock Register', icon: '📋' },
            { id: 'forecast', label: 'Forecast', icon: '📈' },
            { id: 'activity', label: 'Activity Log', icon: '📜' },
          ].map((q) => (
            <button key={q.id} onClick={() => onTabChange(q.id)}
              className="flex items-center gap-2 rounded-lg border border-white/7 bg-white/[0.02] p-3 text-left transition-all hover:border-[#C8922A]/30 hover:bg-white/5">
              <span className="text-lg">{q.icon}</span>
              <span className="text-[11px] font-medium text-[#96A8BF]">{q.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

function StockTab() {
  const { data, loading } = useFetch<{ items: Item[] }>('/api/items')
  const [cat, setCat] = useState('ALL')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading stock…</div>
  if (!data) return null

  const cats = ['ALL', ...Array.from(new Set(data.items.map((i) => i.category)))]
  const filtered = cat === 'ALL' ? data.items : data.items.filter((i) => i.category === cat)

  return (
    <div className="space-y-4">
      {/* Cascading lookup: Category → Item → Model → live stock */}
      <StockLookupCard />

      <Card className="p-4">
        <SectionTitle icon="📦" title="Current Stock" sub={`${filtered.length} items`} right={
          <Select value={cat} onChange={setCat} options={cats.map((c) => ({ value:c, label:c === 'ALL' ? 'All Categories' : c }))} />
        } />
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#111f32] z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Colour</th>
                  <th className="py-2 pr-3 text-right">Stock</th>
                  <th className="py-2 pr-3 text-right">Min</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const low = it.currentStock <= it.minStock
                  return (
                    <tr key={it.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-[#96A8BF]">{it.category}</td>
                      <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{it.itemName}</td>
                      <td className="py-2 pr-3 text-[#96A8BF] font-mono text-[11px]">{it.model}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{it.colour || '—'}</td>
                      <td className="py-2 pr-3 text-right font-semibold" style={{ color: low ? '#E05050' : '#EDE4D0' }}>{it.currentStock}</td>
                      <td className="py-2 pr-3 text-right text-[#4E6180]">{it.minStock}</td>
                      <td className="py-2">
                        {low ? <Badge label="Low" color="#E05050" /> : it.fastMoving ? <Badge label="Fast" color="#3CB87A" /> : <Badge label="OK" color="#96A8BF" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  )
}

function FastTab() {
  const { data, loading } = useFetch<{ items: Item[] }>('/api/items?fastMoving=true')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {data.items.map((it) => {
        const low = it.currentStock <= it.minStock
        return (
          <Card key={it.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#4E6180]">{it.category}</div>
                <div className="font-semibold text-[#EDE4D0] text-sm">{it.itemName}</div>
                <div className="text-[11px] text-[#96A8BF] font-mono">{it.model}</div>
              </div>
              <span className="text-lg">⚡</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] text-[#4E6180]">In Stock</div>
                <div className="font-serif text-2xl font-bold" style={{ color: low ? '#E05050' : '#3CB87A' }}>{it.currentStock}</div>
              </div>
              {low && <Badge label="Reorder Now" color="#E05050" />}
            </div>
          </Card>
        )
      })}
      {data.items.length === 0 && <EmptyState icon="⚡" title="No fast-moving items" />}
    </div>
  )
}

function ChallansTab() {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans')
  const [sel, setSel] = useState<Challan | null>(null)
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading challans…</div>
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
              <th className="py-2 pr-3">Expected</th>
              <th className="py-2 pr-3 text-right">Total</th>
              <th className="py-2 pr-3 text-right">Received</th>
              <th className="py-2 pr-3">Payment</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.challans.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer" onClick={() => setSel(c)}>
                <td className="py-2 pr-3 text-[#E4AF4A] font-mono">{c.challanNumber}</td>
                <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{c.clientName}</td>
                <td className="py-2 pr-3 text-[#96A8BF]">{c.clientCity}</td>
                <td className="py-2 pr-3 text-[#96A8BF]">{fmtDate(c.expectedDeliveryDate)}</td>
                <td className="py-2 pr-3 text-right text-[#EDE4D0]">{fmtINR(c.amountTotal)}</td>
                <td className="py-2 pr-3 text-right" style={{ color: c.paymentStatus==='PAID'?'#3CB87A':c.paymentStatus==='PARTIAL'?'#E09E3C':'#E05050' }}>{fmtINR(c.amountReceived)}</td>
                <td className="py-2 pr-3"><Badge label={c.paymentStatus} color={STATUS_COLORS[c.paymentStatus]} /></td>
                <td className="py-2"><Badge label={c.status.replace(/_/g,' ')} color={STATUS_COLORS[c.status]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.challans.length === 0 && <EmptyState icon="🧾" title="No challans yet" />}

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Challan ${sel.challanNumber}` : ''} wide>
        {sel && <ChallanDetail c={sel} />}
      </Modal>
    </Card>
  )
}

function ChallanDetail({ c }: { c: Challan }) {
  const matched = c.challanItems.filter((i) => i.status === 'MATCHED').length
  const wrong = c.challanItems.filter((i) => i.status === 'WRONG_MODEL').length
  const notFound = c.challanItems.filter((i) => i.status === 'NOT_FOUND').length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-white/[0.02] border border-white/7 p-3">
          <div className="text-[10px] text-[#4E6180] uppercase">Client</div>
          <div className="text-[13px] text-[#EDE4D0] font-medium">{c.clientName}</div>
          <div className="text-[11px] text-[#96A8BF]">{c.clientCity}</div>
        </div>
        <div className="rounded-lg bg-white/[0.02] border border-white/7 p-3">
          <div className="text-[10px] text-[#4E6180] uppercase">Total</div>
          <div className="text-[13px] text-[#EDE4D0] font-medium">{fmtINR(c.amountTotal)}</div>
        </div>
        <div className="rounded-lg bg-white/[0.02] border border-white/7 p-3">
          <div className="text-[10px] text-[#4E6180] uppercase">Received</div>
          <div className="text-[13px] font-medium" style={{ color: STATUS_COLORS[c.paymentStatus] }}>{fmtINR(c.amountReceived)}</div>
        </div>
        <div className="rounded-lg bg-white/[0.02] border border-white/7 p-3">
          <div className="text-[10px] text-[#4E6180] uppercase">Remaining</div>
          <div className="text-[13px] text-[#E09E3C] font-medium">{fmtINR(c.amountTotal - c.amountReceived)}</div>
        </div>
      </div>

      <div>
        <h4 className="text-[12px] font-semibold text-[#E4AF4A] mb-2">Items ({c.challanItems.length})</h4>
        <div className="rounded-lg border border-white/7 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[#4E6180] bg-white/[0.02]">
                <th className="py-2 px-3">Item</th>
                <th className="py-2 px-3">Model</th>
                <th className="py-2 px-3 text-right">Qty</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {c.challanItems.map((ci) => (
                <tr key={ci.id} className="border-t border-white/5">
                  <td className="py-2 px-3 text-[#EDE4D0]">{ci.itemName}{ci.itemNumber && <span className="text-[#4E6180] ml-1">({ci.itemNumber})</span>}</td>
                  <td className="py-2 px-3 text-[#96A8BF] font-mono text-[11px]">{ci.model || '—'}</td>
                  <td className="py-2 px-3 text-right text-[#EDE4D0]">{ci.quantity}</td>
                  <td className="py-2 px-3"><Badge label={ci.status.replace(/_/g,' ')} color={STATUS_COLORS[ci.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap text-[11px]">
        <Badge label={`✓ Matched: ${matched}`} color="#3CB87A" />
        <Badge label={`⚠ Wrong Model: ${wrong}`} color="#E09E3C" />
        <Badge label={`✕ Not Found: ${notFound}`} color="#E05050" />
      </div>
    </div>
  )
}

function PRTab({ user }: { user: SessionUser }) {
  const { data, loading, refresh } = useFetch<{ purchaseRequests: PR[] }>('/api/purchase-requests')
  const [show, setShow] = useState(false)
  const [printPR, setPrintPR] = useState<PR | null>(null)

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading PRs…</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Btn variant="gold" onClick={() => setShow(true)}>+ Raise Purchase Request</Btn>
      </div>

      <Card className="p-4">
        <SectionTitle icon="📋" title="Purchase Requests" sub={`${data.purchaseRequests.length} total`} />
        {data.purchaseRequests.length === 0 ? <EmptyState icon="📋" title="No PRs yet" sub="Click 'Raise PR' to auto-generate one in Laxree's name" /> : (
          <div className="space-y-2">
            {data.purchaseRequests.map((pr) => (
              <div key={pr.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[#E4AF4A] font-semibold text-[13px]">{pr.prNumber}</span>
                      <Badge label={pr.status} color={STATUS_COLORS[pr.status]} />
                    </div>
                    <div className="text-[11px] text-[#96A8BF] mt-0.5">Raised by {pr.raisedByName} • {fmtDate(pr.createdAt)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <Btn size="sm" onClick={() => setPrintPR(pr)}>🖨 Print</Btn>
                    {pr.status === 'DRAFT' && (
                      <Btn size="sm" variant="success" onClick={async () => { await apiPatch('/api/purchase-requests', { id: pr.id, status: 'PRINTED' }); refresh() }}>Mark Printed</Btn>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pr.items.map((it) => (
                    <span key={it.id} className="text-[10.5px] rounded-md bg-white/5 border border-white/7 px-2 py-1 text-[#96A8BF]">
                      {it.itemName} <span className="text-[#E4AF4A]">×{it.quantity}</span>
                      {it.model && <span className="text-[#4E6180] ml-1">({it.model})</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <PRForm open={show} onClose={() => setShow(false)} userId={user.id} onCreated={() => { setShow(false); refresh() }} />
      <PrintModal pr={printPR} onClose={() => setPrintPR(null)} />
    </div>
  )
}

function PRForm({ open, onClose, userId, onCreated }: { open:boolean; onClose:()=>void; userId:string; onCreated:()=>void }) {
  const [items, setItems] = useState([{ itemName:'', model:'', quantity:1, notes:'' }])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const { data: itemsData } = useFetch<{ items: Item[] }>('/api/items')

  const submit = async () => {
    setErr('')
    const valid = items.filter((i) => i.itemName.trim())
    if (!valid.length) { setErr('Add at least one item'); return }
    setSaving(true)
    try {
      await apiPost('/api/purchase-requests', { items: valid, notes, raisedById: userId })
      setItems([{ itemName:'', model:'', quantity:1, notes:'' }])
      setNotes('')
      onCreated()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Raise Purchase Request" wide>
      <div className="space-y-4">
        <div className="rounded-lg border border-[#E4AF4A]/20 bg-[#E4AF4A]/5 p-3 text-[11px] text-[#E4AF4A]">
          📝 PR will be auto-raised in the name of <strong>Laxree</strong>. After creation, you can print it and hand over to the Purchase team.
        </div>

        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <Select label={idx===0?'Item Name':''} value={it.itemName} onChange={(v) => {
                  const next = [...items]; next[idx] = { ...it, itemName: v }
                  const found = itemsData?.items.find((m) => m.itemName === v)
                  if (found) next[idx].model = found.model
                  setItems(next)
                }} options={[
                  { value:'', label:'— Select —' },
                  ...(itemsData?.items.map((m) => ({ value:m.itemName, label:`${m.itemName} (${m.model})` })) || []),
                ]} />
              </div>
              <div className="col-span-3"><Input label={idx===0?'Model':''} value={it.model} onChange={(v) => { const n=[...items]; n[idx]={...it,model:v}; setItems(n) }} /></div>
              <div className="col-span-2"><Input label={idx===0?'Qty':''} type="number" value={it.quantity} onChange={(v) => { const n=[...items]; n[idx]={...it,quantity:Number(v)||1}; setItems(n) }} /></div>
              <div className="col-span-2 flex gap-1">
                {idx === items.length-1 ? (
                  <Btn size="sm" onClick={() => setItems([...items, { itemName:'', model:'', quantity:1, notes:'' }])}>+</Btn>
                ) : <div />}
                {items.length > 1 && <Btn size="sm" variant="danger" onClick={() => setItems(items.filter((_,i) => i !== idx))}>×</Btn>}
              </div>
            </div>
          ))}
        </div>

        <Input label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Special instructions…" />

        {err && <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>}

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="gold" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Raise PR'}</Btn>
        </div>
      </div>
    </Modal>
  )
}

function PrintModal({ pr, onClose }: { pr: PR | null; onClose: () => void }) {
  if (!pr) return null
  const totalQty = pr.items.reduce((s, it) => s + it.quantity, 0)
  return (
    <Modal open={!!pr} onClose={onClose} title={`Print ${pr.prNumber}`} wide>
      <div id="pr-print-area" className="bg-white text-black rounded-lg p-8 font-sans" style={{ minHeight: '297mm' }}>
        {/* Letterhead */}
        <div className="flex justify-between items-start border-b-[3px] border-[#C8922A] pb-4 mb-5">
          <div className="flex items-center gap-4">
            <img src="/laxree-logo.png" alt="Laxree" className="h-16 w-16 object-contain rounded-full border-2 border-[#C8922A] bg-white p-1" />
            <div>
              <h1 className="text-2xl font-bold text-[#07101f] leading-tight">Laxree</h1>
              <p className="text-[11px] text-gray-600 leading-snug">Hotel Supplies Redefined</p>
              <p className="text-[10px] text-gray-500 leading-snug mt-0.5">
                Basement Floor, Plot No. 720, Udhyog Vihar, Phase V &nbsp;·&nbsp; Gurugram, Haryana 122016<br/>
                Tel: +91-9251683657 &nbsp;·&nbsp; Email: purchase@laxree.com &nbsp;·&nbsp; GSTIN: 06AANCC2070Q1ZI
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block px-3 py-1 rounded border-2 border-[#C8922A] text-[#C8922A] text-[11px] font-bold tracking-widest">PURCHASE REQUEST</div>
            <div className="mt-2 text-[13px] font-mono font-bold text-[#07101f]">{pr.prNumber}</div>
            <div className="text-[11px] text-gray-600">Date: {fmtDate(pr.createdAt)}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Status: <span className="font-semibold uppercase">{pr.status}</span></div>
          </div>
        </div>

        {/* Meta block */}
        <div className="grid grid-cols-2 gap-4 mb-5 text-[11.5px]">
          <div className="border border-gray-300 rounded p-3">
            <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold mb-1">Raised By</div>
            <div className="font-semibold text-[#07101f]">{pr.raisedByName}</div>
            <div className="text-gray-600 text-[10.5px]">Laxree — Inventory Department</div>
          </div>
          <div className="border border-gray-300 rounded p-3">
            <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold mb-1">Supplier / Vendor</div>
            <div className="text-gray-700 text-[10.5px] leading-snug">
              ____________________________________<br/>
              ____________________________________
            </div>
          </div>
        </div>

        {/* Subject */}
        <div className="mb-4 text-[12px]">
          <span className="font-bold text-[#07101f]">Subject:</span>{' '}
          <span className="text-gray-700">Purchase Request for the following inventory items — kindly arrange supply at the earliest.</span>
        </div>

        {/* Items table */}
        <table className="w-full text-[11.5px] border border-gray-400 border-collapse">
          <thead>
            <tr className="bg-[#07101f] text-white text-[10px] uppercase tracking-wider">
              <th className="py-2 px-2 text-center border-r border-white/20 w-8">#</th>
              <th className="py-2 px-3 text-left border-r border-white/20">Item Name</th>
              <th className="py-2 px-3 text-left border-r border-white/20">Model / SKU</th>
              <th className="py-2 px-2 text-right border-r border-white/20 w-20">Quantity</th>
              <th className="py-2 px-3 text-left w-32">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {pr.items.map((it, i) => (
              <tr key={it.id} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                <td className="py-2 px-2 text-center border-r border-gray-300 text-gray-600">{i+1}</td>
                <td className="py-2 px-3 border-r border-gray-300 font-semibold text-[#07101f]">{it.itemName}</td>
                <td className="py-2 px-3 border-r border-gray-300 font-mono text-gray-700">{it.model || '—'}</td>
                <td className="py-2 px-2 text-right border-r border-gray-300 font-bold text-[#C8922A]">{it.quantity}</td>
                <td className="py-2 px-3 text-gray-500 text-[10.5px]">—</td>
              </tr>
            ))}
            {/* Total row */}
            <tr className="bg-[#FDF6E3] border-t-2 border-[#C8922A]">
              <td colSpan={3} className="py-2 px-3 text-right font-bold text-[#07101f] text-[11px] uppercase tracking-wider">Total Quantity</td>
              <td className="py-2 px-2 text-right font-bold text-[#C8922A] text-[13px]">{totalQty}</td>
              <td className="py-2 px-3"></td>
            </tr>
          </tbody>
        </table>

        {/* Notes */}
        {pr.notes && (
          <div className="mt-4 rounded border border-gray-300 bg-gray-50 p-3 text-[11px]">
            <span className="font-bold text-[#07101f]">Notes: </span>
            <span className="text-gray-700">{pr.notes}</span>
          </div>
        )}

        {/* Terms */}
        <div className="mt-4 text-[10px] text-gray-500 leading-relaxed">
          <strong className="text-gray-600">Terms &amp; Conditions:</strong> Goods shall be supplied as per Laxree quality standards. Payment terms: 30 days from invoice &amp; goods receipt. Please quote this PR number on all correspondence &amp; invoices.
        </div>

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-3 gap-6 text-[10.5px] text-center">
          <div>
            <div className="border-t border-gray-500 pt-1 mt-10 mx-auto w-40 text-gray-700">Raised By</div>
            <div className="text-[9px] text-gray-500 mt-0.5">{pr.raisedByName}</div>
          </div>
          <div>
            <div className="border-t border-gray-500 pt-1 mt-10 mx-auto w-40 text-gray-700">Approved By</div>
            <div className="text-[9px] text-gray-500 mt-0.5">Authorized Signatory</div>
          </div>
          <div>
            <div className="border-t border-gray-500 pt-1 mt-10 mx-auto w-40 text-gray-700">Received By</div>
            <div className="text-[9px] text-gray-500 mt-0.5">Store / Inventory</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-2 border-t border-gray-300 text-center text-[9px] text-gray-400">
          This is a system-generated Purchase Request from Laxree Inventory Management System &nbsp;·&nbsp; {pr.prNumber} &nbsp;·&nbsp; Generated on {fmtDate(pr.createdAt)}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Btn onClick={onClose}>Close</Btn>
        <Btn variant="gold" onClick={() => window.print()}>🖨 Print Now</Btn>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════
// STOCK REGISTER — Full stock table with holds
// ═══════════════════════════════════════════
function StockRegisterTab() {
  const [cat, setCat] = useState('ALL')
  const [lowOnly, setLowOnly] = useState(false)
  const url = `/api/stock-register?category=${cat}${lowOnly ? '&lowStock=true' : ''}`
  const { data, loading } = useFetch<{ rows: StockRow[]; summary: StockSummary }>(url)

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading stock register…</div>
  if (!data) return null

  const s = data.summary

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard label="Total SKUs" value={s.totalSKUs} accent="#E4AF4A" icon="📦" />
        <StatCard label="Inward" value={s.totalInward} accent="#3CB87A" icon="📥" />
        <StatCard label="Dispatched" value={s.totalDispatched} accent="#E05050" icon="📤" />
        <StatCard label="Balance" value={s.totalBalance} accent="#E4AF4A" icon="⚖️" />
        <StatCard label="On Hold" value={s.totalOnHold} accent="#9B6ED4" icon="🔒" />
        <StatCard label="Available" value={s.totalAvailable} accent="#3CB87A" icon="✅" />
        <StatCard label="Out of Stock" value={s.outOfStock} accent="#E05050" icon="🚫" />
        <StatCard label="Low Stock" value={s.lowStock} accent="#E09E3C" icon="⚠️" />
      </div>

      <Card className="p-4">
        <SectionTitle icon="📋" title="Stock Register" sub={`${data.rows.length} SKUs`} right={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={cat} onChange={setCat} options={[
              { value: 'ALL', label: 'All Categories' },
              ...STOCK_CATEGORIES.map((c) => ({ value: c, label: c })),
            ]} />
            <button onClick={() => setLowOnly(!lowOnly)}
              className={`px-3 py-2 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap ${
                lowOnly ? 'bg-[#E05050]/15 text-[#E05050] border-[#E05050]/25' : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
              }`}>
              {lowOnly ? '✓ ' : ''}Low Stock Only
            </button>
          </div>
        } />
        {data.rows.length === 0 ? (
          <EmptyState icon="📦" title="No items match filters" sub="Try changing category or disabling the low-stock filter" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#111f32] z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                    <th className="py-2 pr-3 text-right">Sr</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3">Colour</th>
                    <th className="py-2 pr-3 text-right">Inward</th>
                    <th className="py-2 pr-3 text-right">Dispatched</th>
                    <th className="py-2 pr-3 text-right">Balance</th>
                    <th className="py-2 pr-3 text-right">On Hold</th>
                    <th className="py-2 pr-3 text-right">Available</th>
                    <th className="py-2 pr-3 text-right">Min</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, idx) => {
                    const color = STATUS_COLOR_MAP[r.status] || '#96A8BF'
                    return (
                      <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2 pr-3 text-right text-[#4E6180]">{idx + 1}</td>
                        <td className="py-2 pr-3 text-[#96A8BF]">{r.category}</td>
                        <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{r.itemName}</td>
                        <td className="py-2 pr-3 text-[#96A8BF] font-mono">{r.model}</td>
                        <td className="py-2 pr-3 text-[#96A8BF]">{r.colour || '—'}</td>
                        <td className="py-2 pr-3 text-right text-[#3CB87A]">{r.inward}</td>
                        <td className="py-2 pr-3 text-right text-[#E05050]">{r.dispatched}</td>
                        <td className="py-2 pr-3 text-right text-[#EDE4D0] font-semibold">{r.balance}</td>
                        <td className="py-2 pr-3 text-right text-[#9B6ED4]">{r.onHold || '—'}</td>
                        <td className="py-2 pr-3 text-right text-[#E4AF4A] font-semibold">{r.available}</td>
                        <td className="py-2 pr-3 text-right text-[#4E6180]">{r.minStock}</td>
                        <td className="py-2"><Badge label={STATUS_LABEL_MAP[r.status]} color={color} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════
// FORECAST — Depletion forecast dashboard
// ═══════════════════════════════════════════
function ForecastTab() {
  const [statusFilter, setStatusFilter] = useState<'ALL'|'critical'|'warn'|'ok'|'nodata'>('ALL')
  const { data, loading } = useFetch<{ forecasts: ForecastRow[]; summary: ForecastSummary }>('/api/forecast')

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading forecast…</div>
  if (!data) return null

  const s = data.summary
  const fullList = [...data.forecasts]
    .filter((f) => statusFilter === 'ALL' || f.status === statusFilter)
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, warn: 1, ok: 2, nodata: 3 }
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)
    })

  const filterPills: Array<{ id:'ALL'|'critical'|'warn'|'ok'|'nodata'; label:string; color:string }> = [
    { id: 'ALL', label: 'All', color: '#E4AF4A' },
    { id: 'critical', label: 'Critical', color: '#E05050' },
    { id: 'warn', label: 'Watch', color: '#E09E3C' },
    { id: 'ok', label: 'OK', color: '#3CB87A' },
    { id: 'nodata', label: 'No Data', color: '#96A8BF' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Critical" value={s.critical} sub="< 30 days left" accent="#E05050" icon="🚨" />
        <StatCard label="Watch" value={s.warn} sub="30–90 days left" accent="#E09E3C" icon="⚠️" />
        <StatCard label="OK" value={s.ok} sub="> 90 days left" accent="#3CB87A" icon="✅" />
        <StatCard label="No Data" value={s.nodata} sub="No outward history" accent="#96A8BF" icon="❓" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle icon="🚨" title="Critical Items — Depleting Soon" sub={`Top ${s.criticalItems.length} urgent reorders`} />
          {s.criticalItems.length === 0 ? (
            <EmptyState icon="✅" title="No critical items" sub="All stock levels are healthy" />
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3 text-right">Balance</th>
                    <th className="py-2 pr-3 text-right">Avg/Day</th>
                    <th className="py-2 pr-3 text-right">Days Left</th>
                    <th className="py-2 text-right">Reorder</th>
                  </tr>
                </thead>
                <tbody>
                  {s.criticalItems.map((f) => (
                    <tr key={f.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{f.itemName}</td>
                      <td className="py-2 pr-3 text-[#96A8BF] font-mono text-[11px]">{f.model}</td>
                      <td className="py-2 pr-3 text-right text-[#EDE4D0] font-semibold">{f.balance}</td>
                      <td className="py-2 pr-3 text-right text-[#96A8BF]">{f.avgPerDay.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right text-[#E05050] font-bold">
                        {f.daysLeft !== null ? `${f.daysLeft}d` : '—'}
                      </td>
                      <td className="py-2 text-right text-[#E4AF4A] font-semibold">{f.suggestedReorder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle icon="📈" title="Top Moving Items" sub="Last 30 days dispatch — top 8" />
          {s.topMoving.length === 0 ? (
            <EmptyState icon="📊" title="No movement data" sub="No outward entries in the last 30 days" />
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                    <th className="py-2 pr-3 text-right">#</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3 text-right">30d Out</th>
                    <th className="py-2 pr-3 text-right">Balance</th>
                    <th className="py-2 text-right">Avg/Day</th>
                  </tr>
                </thead>
                <tbody>
                  {s.topMoving.map((f, idx) => (
                    <tr key={f.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-right text-[#E4AF4A] font-bold">{idx + 1}</td>
                      <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{f.itemName}</td>
                      <td className="py-2 pr-3 text-[#96A8BF] font-mono text-[11px]">{f.model}</td>
                      <td className="py-2 pr-3 text-right text-[#E4AF4A] font-bold">{f.last30Dispatch}</td>
                      <td className="py-2 pr-3 text-right text-[#EDE4D0]">{f.balance}</td>
                      <td className="py-2 text-right text-[#96A8BF]">{f.avgPerDay.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle icon="📋" title="Full Forecast Table" sub={`${fullList.length} SKUs analyzed`} right={
          <div className="flex gap-1.5 flex-wrap">
            {filterPills.map((p) => (
              <button key={p.id} onClick={() => setStatusFilter(p.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-medium border transition-all ${
                  statusFilter === p.id
                    ? 'text-white border-white/20'
                    : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
                }`}
                style={statusFilter === p.id ? { background: `${p.color}22`, color: p.color, borderColor: `${p.color}55` } : {}}
              >
                {p.label}
              </button>
            ))}
          </div>
        } />
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#111f32] z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                  <th className="py-2 pr-3 text-right">Sr</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Colour</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                  <th className="py-2 pr-3 text-right">Held</th>
                  <th className="py-2 pr-3 text-right">Available</th>
                  <th className="py-2 pr-3 text-right">Avg/Day</th>
                  <th className="py-2 pr-3 text-right">Days Left</th>
                  <th className="py-2 pr-3 text-right">30d Out</th>
                  <th className="py-2 pr-3 text-right">Reorder</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {fullList.map((f, idx) => {
                  const color = STATUS_COLOR_MAP[f.status] || '#96A8BF'
                  const daysColor = f.daysLeft !== null && f.daysLeft < 30 ? '#E05050' : color
                  return (
                    <tr key={f.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-right text-[#4E6180]">{idx + 1}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{f.category}</td>
                      <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{f.itemName}</td>
                      <td className="py-2 pr-3 text-[#96A8BF] font-mono">{f.model}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{f.colour || '—'}</td>
                      <td className="py-2 pr-3 text-right text-[#EDE4D0] font-semibold">{f.balance}</td>
                      <td className="py-2 pr-3 text-right text-[#9B6ED4]">{f.held || '—'}</td>
                      <td className="py-2 pr-3 text-right text-[#E4AF4A]">{f.available}</td>
                      <td className="py-2 pr-3 text-right text-[#96A8BF]">{f.avgPerDay.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right font-bold" style={{ color: daysColor }}>
                        {f.daysLeft !== null ? `${f.daysLeft}d` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right text-[#EDE4D0]">{f.last30Dispatch}</td>
                      <td className="py-2 pr-3 text-right text-[#E4AF4A]">{f.suggestedReorder}</td>
                      <td className="py-2"><Badge label={STATUS_LABEL_MAP[f.status]} color={color} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════
// ACTIVITY LOG — Combined IN+OUT transactions
// ═══════════════════════════════════════════
function ActivityLogTab() {
  const [type, setType] = useState<'ALL' | 'IN' | 'OUT'>('ALL')
  const url = `/api/activity-log?limit=200${type !== 'ALL' ? `&type=${type}` : ''}`
  const { data, loading } = useFetch<{ logs: ActivityLog[] }>(url)

  const inCount = data?.logs.filter((l) => l.type === 'IN').length || 0
  const outCount = data?.logs.filter((l) => l.type === 'OUT').length || 0
  const qtyIn = data?.logs.filter((l) => l.type === 'IN').reduce((s, l) => s + l.quantity, 0) || 0
  const qtyOut = data?.logs.filter((l) => l.type === 'OUT').reduce((s, l) => s + l.quantity, 0) || 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Entries" value={data?.logs.length || 0} sub="IN + OUT" accent="#E4AF4A" icon="📜" />
        <StatCard label="Inward" value={inCount} sub="Stock received" accent="#3CB87A" icon="📥" />
        <StatCard label="Outward" value={outCount} sub="Stock dispatched" accent="#E05050" icon="📤" />
        <StatCard label="Qty In" value={qtyIn} sub="Units received" accent="#3CB87A" icon="➕" />
        <StatCard label="Qty Out" value={qtyOut} sub="Units dispatched" accent="#E05050" icon="➖" />
      </div>

      <Card className="p-4">
        <SectionTitle icon="📜" title="Activity Log" sub={`${data?.logs.length || 0} transactions`} right={
          <div className="flex gap-1.5">
            {(['ALL', 'IN', 'OUT'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                  type === t
                    ? t === 'IN' ? 'bg-[#3CB87A]/15 text-[#3CB87A] border-[#3CB87A]/25'
                      : t === 'OUT' ? 'bg-[#E05050]/15 text-[#E05050] border-[#E05050]/25'
                      : 'bg-[#E4AF4A]/15 text-[#E4AF4A] border-[#E4AF4A]/25'
                    : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
                }`}>
                {t === 'ALL' ? 'All' : t === 'IN' ? '📥 Inward' : '📤 Outward'}
              </button>
            ))}
          </div>
        } />
        {loading ? (
          <div className="text-center py-8 text-[#96A8BF] text-sm">Loading activity log…</div>
        ) : !data || data.logs.length === 0 ? (
          <EmptyState icon="📜" title="No activity yet" sub="Inward and outward transactions will appear here" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#111f32] z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3">Colour</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2 pr-3">Party</th>
                    <th className="py-2 pr-3">Challan</th>
                    <th className="py-2 pr-3">Bill No</th>
                    <th className="py-2 pr-3">Entered By</th>
                    <th className="py-2">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((l) => {
                    const isIn = l.type === 'IN'
                    const color = isIn ? '#3CB87A' : '#E05050'
                    return (
                      <tr key={`${l.type}-${l.id}`} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2 pr-3 text-[#96A8BF] whitespace-nowrap">{fmtDate(l.date)}</td>
                        <td className="py-2 pr-3"><Badge label={isIn ? 'IN' : 'OUT'} color={color} /></td>
                        <td className="py-2 pr-3 text-[#96A8BF]">{l.category}</td>
                        <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{l.itemName}</td>
                        <td className="py-2 pr-3 text-[#96A8BF] font-mono">{l.model}</td>
                        <td className="py-2 pr-3 text-[#96A8BF]">{l.colour || '—'}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${isIn ? 'text-[#3CB87A]' : 'text-[#E05050]'}`}>
                          {isIn ? '+' : '−'}{l.quantity}
                        </td>
                        <td className="py-2 pr-3 text-[#EDE4D0] max-w-[160px] truncate" title={l.party}>{l.party || '—'}</td>
                        <td className="py-2 pr-3 text-[#E4AF4A] font-mono text-[11px]">{l.challanNumber || '—'}</td>
                        <td className="py-2 pr-3 text-[#96A8BF]">{l.billNumber || '—'}</td>
                        <td className="py-2 pr-3 text-[#4E6180] text-[10px] whitespace-nowrap">{l.enteredBy?.name || '—'}</td>
                        <td className="py-2 text-[#4E6180] text-[10px] max-w-[140px] truncate" title={l.remarks || ''}>{l.remarks || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
