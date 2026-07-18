'use client'
import { useState } from 'react'
import { useFetch, apiPost, apiPatch } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, STAGE_LABELS } from '../types'
import { SessionUser } from '../types'

type Item = { id:string; category:string; itemName:string; model:string; colour:string|null; currentStock:number; minStock:number; fastMoving:boolean }
type ChallanItem = { id:string; itemName:string; itemNumber:string|null; model:string|null; quantity:number; status:string; matchedItem: Item|null }
type Challan = { id:string; challanNumber:string; clientName:string; clientCity:string; expectedDeliveryDate:string|null; amountTotal:number; amountAdvance:number; amountReceived:number; paymentStatus:string; status:string; createdAt:string; challanItems:ChallanItem[] }
type PR = { id:string; prNumber:string; raisedByName:string; status:string; notes:string|null; createdAt:string; items:{id:string;itemName:string;model:string|null;quantity:number;item:Item|null}[] }

export function OwnerDashboard({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState('overview')

  const nav = [
    { id:'overview', label:'Overview', icon:'📊' },
    { id:'stock', label:'Current Stock', icon:'📦' },
    { id:'fast', label:'Fast Moving', icon:'⚡' },
    { id:'challans', label:'Challans', icon:'🧾' },
    { id:'pr', label:'Purchase Requests', icon:'📋' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              tab===n.id ? 'bg-[#C8922A]/15 text-[#E4AF4A] border-[#C8922A]/25' : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
            }`}>
            <span className="mr-1">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'stock' && <StockTab />}
      {tab === 'fast' && <FastTab />}
      {tab === 'challans' && <ChallansTab />}
      {tab === 'pr' && <PRTab user={user} />}
    </div>
  )
}

function OverviewTab() {
  const { data, loading } = useFetch<{ totalItems:number; totalStock:number; lowStockCount:number; fastMovingCount:number; totalChallans:number; totalRevenue:number; totalReceived:number; totalPending:number; byCategory:Record<string,number>; challansByStatus:Record<string,number> }>('/api/analytics')

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading analytics…</div>
  if (!data) return null

  const categories = Object.entries(data.byCategory).sort((a,b) => b[1]-a[1])
  const maxCat = Math.max(...categories.map(([,v]) => v), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Items" value={data.totalItems} sub="Active SKUs" accent="#E4AF4A" icon="📦" />
        <StatCard label="Total Stock" value={data.totalStock} sub="Units in warehouse" accent="#4A9EE0" icon="📈" />
        <StatCard label="Low Stock" value={data.lowStockCount} sub="Need reorder" accent="#E05050" icon="⚠️" />
        <StatCard label="Fast Moving" value={data.fastMovingCount} sub="High turnover" accent="#3CB87A" icon="⚡" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <StatCard label="Total Revenue" value={fmtINR(data.totalRevenue)} sub={`${data.totalChallans} challans`} accent="#E4AF4A" icon="💰" />
        <StatCard label="Received" value={fmtINR(data.totalReceived)} sub="Payments collected" accent="#3CB87A" icon="✅" />
        <StatCard label="Pending" value={fmtINR(data.totalPending)} sub="Yet to collect" accent="#E09E3C" icon="⏳" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle icon="📊" title="Stock by Category" />
          <div className="space-y-2.5">
            {categories.map(([cat, val]) => (
              <div key={cat}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[#96A8BF]">{cat}</span>
                  <span className="text-[#EDE4D0] font-semibold">{val}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#C8922A] to-[#E4AF4A]" style={{ width: `${(val/maxCat)*100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle icon="🧾" title="Challans by Status" />
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.challansByStatus).map(([st, cnt]) => (
              <div key={st} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <Badge label={st.replace(/_/g,' ')} color={STATUS_COLORS[st]} />
                  <span className="font-serif text-lg font-bold text-[#EDE4D0]">{cnt}</span>
                </div>
              </div>
            ))}
            {Object.keys(data.challansByStatus).length === 0 && <EmptyState title="No challans yet" />}
          </div>
        </Card>
      </div>
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
    <Card className="p-4">
      <SectionTitle icon="📦" title="Current Stock" sub={`${filtered.length} items`} right={
        <Select value={cat} onChange={setCat} options={cats.map((c) => ({ value:c, label:c === 'ALL' ? 'All Categories' : c }))} />
      } />
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-[12px]">
          <thead>
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
    </Card>
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
        {data.purchaseRequests.length === 0 ? <EmptyState icon="📋" title="No PRs yet" sub="Click 'Raise PR' to auto-generate one in LaxRee's name" /> : (
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
          📝 PR will be auto-raised in the name of <strong>LaxRee Hotel</strong>. After creation, you can print it and hand over to the Purchase team.
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
  return (
    <Modal open={!!pr} onClose={onClose} title={`Print ${pr.prNumber}`} wide>
      <div id="pr-print-area" className="bg-white text-black rounded-lg p-6 font-sans">
        <div className="flex justify-between items-start border-b-2 border-[#C8922A] pb-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#07101f]">LaxRee Hotel</h1>
            <p className="text-[11px] text-gray-600">Inventory Management System</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-[#C8922A]">PURCHASE REQUEST</div>
            <div className="text-[12px] font-mono">{pr.prNumber}</div>
            <div className="text-[11px] text-gray-600">{fmtDate(pr.createdAt)}</div>
          </div>
        </div>
        <div className="mb-4 text-[12px]">
          <strong>Raised By:</strong> {pr.raisedByName}<br/>
          <strong>Status:</strong> {pr.status}
          {pr.notes && <><br/><strong>Notes:</strong> {pr.notes}</>}
        </div>
        <table className="w-full text-[12px] border border-gray-300">
          <thead>
            <tr className="bg-[#07101f] text-white">
              <th className="py-2 px-3 text-left">#</th>
              <th className="py-2 px-3 text-left">Item Name</th>
              <th className="py-2 px-3 text-left">Model</th>
              <th className="py-2 px-3 text-right">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {pr.items.map((it, i) => (
              <tr key={it.id} className="border-b border-gray-200">
                <td className="py-2 px-3">{i+1}</td>
                <td className="py-2 px-3 font-medium">{it.itemName}</td>
                <td className="py-2 px-3 font-mono">{it.model || '—'}</td>
                <td className="py-2 px-3 text-right font-semibold">{it.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-8 flex justify-between text-[11px]">
          <div><div className="border-t border-gray-400 pt-1 mt-12 w-32">Raised By</div></div>
          <div><div className="border-t border-gray-400 pt-1 mt-12 w-32">Approved By</div></div>
          <div><div className="border-t border-gray-400 pt-1 mt-12 w-32">Received By</div></div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Btn variant="gold" onClick={() => window.print()}>🖨 Print Now</Btn>
      </div>
    </Modal>
  )
}
