'use client'
import { useState } from 'react'
import { useFetch, apiPost } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard, Textarea } from '../ui'
import { fmtINR, fmtDate, STATUS_COLORS, SessionUser } from '../types'
import { StockLookupCard } from '../stock-lookup'

type Item = { id:string; category:string; itemName:string; model:string; colour:string|null; unit:string; currentStock:number; minStock:number; fastMoving:boolean; inwardCount:number; outwardCount:number; active:boolean }
type UserRow = { id:string; name:string; email:string; role:string; phone:string|null; active:boolean }

type InwardLog = {
  id:string; date:string; category:string; itemName:string; model:string;
  colour:string|null; quantity:number; unit:string; vendor:string|null;
  billNo:string|null; remarks:string|null;
  enteredBy?: { name:string; role:string }
}
type ActivityLog = {
  id:string; type:'IN'|'OUT'; date:string; category:string; itemName:string;
  model:string; colour:string|null; quantity:number; unit:string;
  party:string; challanNumber:string|null; billNumber:string|null;
  remarks:string|null; enteredBy?: { name:string; role:string }
}
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

const CATEGORIES = ['Room Amenities','Bathroom Amenities','Lobby Items','Banquet Furniture','Linen','Bath Linen','Bath Tubs','Spare Parts']

const STATUS_COLOR_MAP: Record<string, string> = {
  OK: '#3CB87A', LOW: '#E09E3C', OUT_OF_STOCK: '#E05050',
  critical: '#E05050', warn: '#E09E3C', ok: '#3CB87A', nodata: '#4E6180',
}
const STATUS_LABEL_MAP: Record<string, string> = {
  OK: 'OK', LOW: 'LOW', OUT_OF_STOCK: 'OUT',
  critical: 'CRITICAL', warn: 'WATCH', ok: 'OK', nodata: 'NO DATA',
}

export function ITManagerDashboard({ user, activeTab, onTabChange }: { user: SessionUser; activeTab: string; onTabChange: (id: string) => void }) {
  const nav = [
    { id:'items', label:'Item Master', icon:'📦' },
    { id:'add', label:'Add Item', icon:'➕' },
    { id:'inward', label:'Inward Entry', icon:'📥' },
    { id:'register', label:'Stock Register', icon:'📋' },
    { id:'activity', label:'Activity Log', icon:'📜' },
    { id:'forecast', label:'Forecast', icon:'📈' },
    { id:'analytics', label:'Analytics', icon:'📊' },
    { id:'users', label:'Users', icon:'👥' },
    { id:'all-challans', label:'All Challans', icon:'🧾' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {nav.map((n) => (
          <button key={n.id} onClick={() => onTabChange(n.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              activeTab===n.id ? 'bg-[#E05050]/15 text-[#E05050] border-[#E05050]/25' : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
            }`}>
            <span className="mr-1">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>
      {activeTab === 'items' && <ItemsTab />}
      {activeTab === 'add' && <AddItemTab />}
      {activeTab === 'inward' && <InwardTab />}
      {activeTab === 'register' && <StockRegisterTab />}
      {activeTab === 'activity' && <ActivityLogTab />}
      {activeTab === 'forecast' && <ForecastTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'all-challans' && <AllChallansTab />}
    </div>
  )
}

function ItemsTab() {
  const { data, loading, refresh } = useFetch<{ items: Item[] }>('/api/items')
  const [cat, setCat] = useState('ALL')
  const [editItem, setEditItem] = useState<Item | null>(null)

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const cats = ['ALL', ...Array.from(new Set(data.items.map((i) => i.category)))]
  const filtered = cat === 'ALL' ? data.items : data.items.filter((i) => i.category === cat)

  return (
    <div className="space-y-4">
      {/* Cascading lookup: Category → Item → Model → live stock */}
      <StockLookupCard />

      <Card className="p-4">
        <SectionTitle icon="📦" title="Item Master — Inward / Outward" sub={`${filtered.length} items`} right={
          <Select value={cat} onChange={setCat} options={cats.map((c) => ({ value:c, label:c==='ALL'?'All Categories':c }))} />
        } />
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#111f32] z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Item Name</th>
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Colour</th>
                  <th className="py-2 pr-3 text-right">Stock</th>
                  <th className="py-2 pr-3 text-right">Inward</th>
                  <th className="py-2 pr-3 text-right">Outward</th>
                  <th className="py-2 pr-3">Fast</th>
                  <th className="py-2">Active</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.id} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer" onClick={() => setEditItem(it)}>
                    <td className="py-2 pr-3 text-[#96A8BF]">{it.category}</td>
                    <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{it.itemName}</td>
                    <td className="py-2 pr-3 text-[#96A8BF] font-mono">{it.model}</td>
                    <td className="py-2 pr-3 text-[#96A8BF]">{it.colour || '—'}</td>
                    <td className="py-2 pr-3 text-right text-[#EDE4D0] font-semibold">{it.currentStock}</td>
                    <td className="py-2 pr-3 text-right text-[#3CB87A]">{it.inwardCount}</td>
                    <td className="py-2 pr-3 text-right text-[#E05050]">{it.outwardCount}</td>
                    <td className="py-2 pr-3">{it.fastMoving ? '⚡' : '—'}</td>
                    <td className="py-2">{it.active ? <Badge label="Yes" color="#3CB87A" /> : <Badge label="No" color="#E05050" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

        <Modal open={!!editItem} onClose={() => { setEditItem(null); refresh() }} title="Edit Item">
          {editItem && <EditItemForm item={editItem} />}
        </Modal>
      </Card>
    </div>
  )
}

function EditItemForm({ item }: { item: Item }) {
  const [form, setForm] = useState({
    category: item.category, itemName: item.itemName, model: item.model, colour: item.colour || '',
    unit: item.unit, currentStock: String(item.currentStock), minStock: String(item.minStock),
    fastMoving: item.fastMoving, active: item.active,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setMsg('✓ Item updated successfully')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Category" value={form.category} onChange={(v) => setForm({...form, category:v})} />
        <Input label="Item Name" value={form.itemName} onChange={(v) => setForm({...form, itemName:v})} />
        <Input label="Model" value={form.model} onChange={(v) => setForm({...form, model:v})} />
        <Input label="Colour" value={form.colour} onChange={(v) => setForm({...form, colour:v})} />
        <Input label="Unit" value={form.unit} onChange={(v) => setForm({...form, unit:v})} />
        <Input label="Min Stock" type="number" value={form.minStock} onChange={(v) => setForm({...form, minStock:v})} />
        <Input label="Current Stock" type="number" value={form.currentStock} onChange={(v) => setForm({...form, currentStock:v})} />
        <Select label="Fast Moving" value={form.fastMoving ? 'yes' : 'no'} onChange={(v) => setForm({...form, fastMoving: v==='yes'})} options={[{value:'yes',label:'Yes'},{value:'no',label:'No'}]} />
      </div>
      {msg && <div className="text-[11px] text-[#3CB87A]">{msg}</div>}
      <Btn variant="gold" onClick={save} disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save Changes'}</Btn>
    </div>
  )
}

function AddItemTab() {
  const [form, setForm] = useState({
    category: '', itemName: '', model: '', colour: '', unit: 'PCS',
    currentStock: '0', minStock: '5', fastMoving: false,
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await apiPost('/api/items', form)
      setDone(true)
      setForm({ category:'', itemName:'', model:'', colour:'', unit:'PCS', currentStock:'0', minStock:'5', fastMoving:false })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <Card className="p-4">
      <SectionTitle icon="➕" title="Add New Item" sub="Add item category, name, model, colour to master inventory" />
      {done && (
        <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 p-3 text-[12px] text-[#3CB87A] mb-3 flex justify-between items-center">
          ✓ Item added successfully to master inventory
          <Btn size="sm" onClick={() => setDone(false)}>Add Another</Btn>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select label="Category" value={form.category} onChange={(v) => setForm({...form, category:v})} options={[{value:'',label:'— Select —'},...CATEGORIES.map((c)=>({value:c,label:c}))]} />
        <Input label="Item Name" value={form.itemName} onChange={(v) => setForm({...form, itemName:v})} required />
        <Input label="Model" value={form.model} onChange={(v) => setForm({...form, model:v})} placeholder="LR-XX-01" required />
        <Input label="Colour" value={form.colour} onChange={(v) => setForm({...form, colour:v})} />
        <Input label="Unit" value={form.unit} onChange={(v) => setForm({...form, unit:v})} />
        <Input label="Min Stock" type="number" value={form.minStock} onChange={(v) => setForm({...form, minStock:v})} />
        <Input label="Current Stock" type="number" value={form.currentStock} onChange={(v) => setForm({...form, currentStock:v})} />
        <Select label="Fast Moving" value={form.fastMoving ? 'yes' : 'no'} onChange={(v) => setForm({...form, fastMoving: v==='yes'})} options={[{value:'yes',label:'Yes ⚡'},{value:'no',label:'No'}]} />
      </div>
      <div className="flex justify-end mt-4">
        <Btn variant="gold" onClick={save} disabled={saving || !form.category || !form.itemName || !form.model}>{saving ? 'Saving…' : '➕ Add Item'}</Btn>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════
// INWARD ENTRY — Add stock received from vendor
// ═══════════════════════════════════════════
function InwardTab() {
  const { data: itemsData } = useFetch<{ items: Item[] }>('/api/items')
  const { data, loading, refresh } = useFetch<{ logs: InwardLog[] }>('/api/inward?limit=50')
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: '', itemId: '', quantity: '', vendor: '', billNo: '', remarks: '',
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState('')

  const items = (itemsData?.items || []).filter((i) => !form.category || i.category === form.category)
  const selectedItem = items.find((i) => i.id === form.itemId)

  const submit = async () => {
    if (!form.itemId || !form.quantity) {
      alert('Please select an item and enter quantity')
      return
    }
    setSaving(true); setDone('')
    try {
      const res = await apiPost('/api/inward', {
        itemId: form.itemId,
        quantity: Number(form.quantity),
        vendor: form.vendor,
        billNo: form.billNo,
        remarks: form.remarks,
        date: form.date,
      })
      setDone(`✓ ${res.message || `Added ${form.quantity} units`}`)
      setForm({ ...form, itemId: '', quantity: '', vendor: '', billNo: '', remarks: '' })
      refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add inward entry')
    } finally { setSaving(false) }
  }

  const resetItem = () => setForm({ ...form, itemId: '' })

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle icon="📥" title="Inward Entry — Stock Received" sub="Add stock received from vendor / supplier" />
        {done && (
          <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 p-3 text-[12px] text-[#3CB87A] mb-3 flex justify-between items-center">
            {done}
            <Btn size="sm" onClick={() => setDone('')}>Dismiss</Btn>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
          <Select label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v, itemId: '' })}
            options={[{ value: '', label: '— Select Category —' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} required />
          <Select label="Item" value={form.itemId} onChange={(v) => setForm({ ...form, itemId: v })}
            options={[{ value: '', label: form.category ? '— Select Item —' : '— Select Category First —' },
              ...items.map((i) => ({ value: i.id, label: `${i.itemName}${i.colour ? ` (${i.colour})` : ''}` }))]}
            required />
          <ReadonlyField label="Model / SKU" value={selectedItem?.model || '—'} />
          <ReadonlyField label="Colour / Variant" value={selectedItem?.colour || '—'} />
          <Input label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} required placeholder="0" />
          <Input label="Vendor / Supplier" value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} placeholder="Vendor name" />
          <Input label="Bill / Invoice No" value={form.billNo} onChange={(v) => setForm({ ...form, billNo: v })} placeholder="Bill number" />
        </div>
        <div className="mt-3">
          <Textarea label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} placeholder="Optional notes about this inward entry" rows={2} />
        </div>
        <div className="flex justify-end mt-4 gap-2">
          {form.itemId && <Btn variant="ghost" onClick={resetItem}>Reset Item</Btn>}
          <Btn variant="gold" onClick={submit} disabled={saving || !form.itemId || !form.quantity}>
            {saving ? 'Saving…' : '📥 Add Inward Entry'}
          </Btn>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle icon="📋" title="Recent Inward Logs" sub={`${data?.logs.length || 0} recent entries`} />
        {loading ? (
          <div className="text-center py-8 text-[#96A8BF] text-sm">Loading inward logs…</div>
        ) : !data || data.logs.length === 0 ? (
          <EmptyState icon="📥" title="No inward entries yet" sub="Add stock using the form above" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#111f32] z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3">Colour</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2 pr-3">Vendor</th>
                    <th className="py-2 pr-3">Bill No</th>
                    <th className="py-2">Entered By</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((l) => (
                    <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-[#96A8BF] whitespace-nowrap">{fmtDate(l.date)}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{l.category}</td>
                      <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{l.itemName}</td>
                      <td className="py-2 pr-3 text-[#96A8BF] font-mono">{l.model}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{l.colour || '—'}</td>
                      <td className="py-2 pr-3 text-right text-[#3CB87A] font-semibold">+{l.quantity}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{l.vendor || '—'}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{l.billNo || '—'}</td>
                      <td className="py-2 text-[#4E6180] text-[10px]">{l.enteredBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">{label}</span>
      <div className="w-full rounded-lg border border-white/10 bg-[#0c1928]/60 px-3 py-2 text-[13px] text-[#EDE4D0] font-mono">
        {value}
      </div>
    </label>
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
      {/* Cascading lookup: Category → Item → Model → live stock */}
      <StockLookupCard />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total SKUs" value={s.totalSKUs} accent="#E4AF4A" icon="📦" />
        <StatCard label="Total Inward" value={s.totalInward} accent="#3CB87A" icon="📥" />
        <StatCard label="Dispatched" value={s.totalDispatched} accent="#E05050" icon="📤" />
        <StatCard label="Balance" value={s.totalBalance} accent="#4A9EE0" icon="⚖️" />
        <StatCard label="On Hold" value={s.totalOnHold} accent="#9B6ED4" icon="🔒" />
        <StatCard label="Available" value={s.totalAvailable} accent="#E09E3C" icon="✅" />
      </div>

      <Card className="p-4">
        <SectionTitle icon="📋" title="Stock Register" sub={`${data.rows.length} SKUs`} right={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={cat} onChange={setCat} options={[
              { value: 'ALL', label: 'All Categories' },
              ...CATEGORIES.map((c) => ({ value: c, label: c })),
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
// ACTIVITY LOG — Combined IN+OUT transactions
// ═══════════════════════════════════════════
function ActivityLogTab() {
  const [type, setType] = useState<'ALL' | 'IN' | 'OUT'>('ALL')
  const url = `/api/activity-log?limit=200${type !== 'ALL' ? `&type=${type}` : ''}`
  const { data, loading } = useFetch<{ logs: ActivityLog[] }>(url)

  return (
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
                  <th className="py-2">Entered By</th>
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
                      <td className="py-2 text-[#4E6180] text-[10px] whitespace-nowrap">{l.enteredBy?.name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  )
}

// ═══════════════════════════════════════════
// FORECAST — Depletion forecast engine
// ═══════════════════════════════════════════
function ForecastTab() {
  const { data, loading } = useFetch<{ forecasts: ForecastRow[]; summary: ForecastSummary }>('/api/forecast')

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading forecast…</div>
  if (!data) return null

  const s = data.summary
  const fullList = [...data.forecasts].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, warn: 1, ok: 2, nodata: 3 }
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    return (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Critical" value={s.critical} sub="< 30 days left" accent="#E05050" icon="🚨" />
        <StatCard label="Watch" value={s.warn} sub="30–90 days left" accent="#E09E3C" icon="⚠️" />
        <StatCard label="OK" value={s.ok} sub="> 90 days left" accent="#3CB87A" icon="✅" />
        <StatCard label="No Data" value={s.nodata} sub="No outward history" accent="#4E6180" icon="❓" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle icon="🚨" title="Critical Items — Depleting Soon" sub={`Top ${s.criticalItems.length} urgent reorders`} />
          {s.criticalItems.length === 0 ? (
            <EmptyState icon="✅" title="No critical items" sub="All stock levels are healthy" />
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {s.criticalItems.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-[#E05050]/15 bg-[#E05050]/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[12px] text-[#EDE4D0] font-medium truncate">{f.itemName}</div>
                    <div className="text-[10px] text-[#96A8BF]">{f.category} • {f.model}{f.colour ? ` • ${f.colour}` : ''}</div>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <div className="text-[#E05050] font-bold text-[14px]">{f.daysLeft ?? '—'}d</div>
                    <div className="text-[9px] text-[#4E6180]">bal {f.available}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle icon="📈" title="Top Moving Items" sub="Last 30 days dispatch — top 8" />
          {s.topMoving.length === 0 ? (
            <EmptyState icon="📊" title="No movement data" sub="No outward entries in the last 30 days" />
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {s.topMoving.map((f, idx) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-[#E4AF4A]/15 bg-[#E4AF4A]/5 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-[#E4AF4A] w-4">#{idx + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[12px] text-[#EDE4D0] font-medium truncate">{f.itemName}</div>
                      <div className="text-[10px] text-[#96A8BF]">{f.model}{f.colour ? ` • ${f.colour}` : ''}</div>
                    </div>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <div className="text-[#E4AF4A] font-bold text-[14px]">{f.last30Dispatch}</div>
                    <div className="text-[9px] text-[#4E6180]">30d out</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle icon="📋" title="Full Forecast Table" sub={`${fullList.length} SKUs analyzed`} />
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
                  <th className="py-2 pr-3 text-right">Avg/Day</th>
                  <th className="py-2 pr-3 text-right">Days Left</th>
                  <th className="py-2 pr-3 text-right">Reorder</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {fullList.map((f, idx) => {
                  const color = STATUS_COLOR_MAP[f.status] || '#96A8BF'
                  return (
                    <tr key={f.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-right text-[#4E6180]">{idx + 1}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{f.category}</td>
                      <td className="py-2 pr-3 text-[#EDE4D0] font-medium">{f.itemName}</td>
                      <td className="py-2 pr-3 text-[#96A8BF] font-mono">{f.model}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{f.colour || '—'}</td>
                      <td className="py-2 pr-3 text-right text-[#EDE4D0] font-semibold">{f.balance}</td>
                      <td className="py-2 pr-3 text-right text-[#96A8BF]">{f.avgPerDay.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right font-semibold" style={{ color }}>
                        {f.daysLeft !== null ? `${f.daysLeft}d` : '—'}
                      </td>
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

function AnalyticsTab() {
  const { data, loading } = useFetch<{ totalItems:number; totalStock:number; lowStockCount:number; fastMovingCount:number; totalChallans:number; totalRevenue:number; totalReceived:number; totalPending:number; byCategory:Record<string,number>; challansByStatus:Record<string,number>; lowStock:Item[] }>('/api/analytics')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading analytics…</div>
  if (!data) return null

  const cats = Object.entries(data.byCategory).sort((a,b) => b[1]-a[1])
  const maxCat = Math.max(...cats.map(([,v]) => v), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Items" value={data.totalItems} accent="#E4AF4A" icon="📦" />
        <StatCard label="Total Stock" value={data.totalStock} accent="#4A9EE0" icon="📈" />
        <StatCard label="Low Stock" value={data.lowStockCount} accent="#E05050" icon="⚠️" />
        <StatCard label="Fast Moving" value={data.fastMovingCount} accent="#3CB87A" icon="⚡" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle icon="⚠️" title="Low Stock Items — Reorder Alert" sub={`${data.lowStock.length} items need reorder`} />
          {data.lowStock.length === 0 ? <EmptyState icon="✅" title="All stock healthy" /> : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.lowStock.map((it) => (
                <div key={it.id} className="flex items-center justify-between rounded-lg border border-[#E05050]/15 bg-[#E05050]/5 px-3 py-2">
                  <div>
                    <div className="text-[12px] text-[#EDE4D0] font-medium">{it.itemName}</div>
                    <div className="text-[10px] text-[#96A8BF]">{it.category} • {it.model}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#E05050] font-bold text-[14px]">{it.currentStock}</div>
                    <div className="text-[9px] text-[#4E6180]">min {it.minStock}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle icon="📊" title="Stock by Category" />
          <div className="space-y-2.5">
            {cats.map(([cat, val]) => (
              <div key={cat}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[#96A8BF]">{cat}</span>
                  <span className="text-[#EDE4D0] font-semibold">{val}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#C8922A] to-[#E4AF4A]" style={{ width: `${(val/maxCat)*100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle icon="💰" title="Revenue Overview" />
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total Revenue" value={fmtINR(data.totalRevenue)} sub={`${data.totalChallans} challans`} accent="#E4AF4A" />
          <StatCard label="Received" value={fmtINR(data.totalReceived)} accent="#3CB87A" />
          <StatCard label="Pending" value={fmtINR(data.totalPending)} accent="#E09E3C" />
        </div>
      </Card>
    </div>
  )
}

function UsersTab() {
  const { data, loading } = useFetch<{ users: UserRow[] }>('/api/users')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading users…</div>
  if (!data) return null

  const roleColors: Record<string,string> = { OWNER:'#E4AF4A', SALES:'#4A9EE0', ACCOUNT:'#3CB87A', COORDINATOR:'#9B6ED4', SUPPORT:'#E09E3C', IT_MANAGER:'#E05050' }

  return (
    <Card className="p-4">
      <SectionTitle icon="👥" title="System Users" sub={`${data.users.length} accounts`} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.users.map((u) => (
          <div key={u.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[13px] text-[#EDE4D0] font-medium">{u.name}</div>
              {u.active ? <Badge label="Active" color="#3CB87A" /> : <Badge label="Disabled" color="#E05050" />}
            </div>
            <div className="text-[11px] text-[#96A8BF]">{u.email}</div>
            <div className="flex items-center justify-between mt-2">
              <Badge label={u.role.replace(/_/g,' ')} color={roleColors[u.role]} />
              <span className="text-[10px] text-[#4E6180]">{u.phone || '—'}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function AllChallansTab() {
  const { data, loading } = useFetch<{ challans: unknown[] }>('/api/challans')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const challans = data.challans as Array<{ id:string; challanNumber:string; clientName:string; clientCity:string; status:string; paymentStatus:string; amountTotal:number; amountReceived:number; createdAt:string }>
  return (
    <Card className="p-4">
      <SectionTitle icon="🧾" title="All Challans (Admin View)" sub={`${challans.length} total`} />
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
            {challans.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2 pr-3 text-[#E4AF4A] font-mono">{c.challanNumber}</td>
                <td className="py-2 pr-3 text-[#EDE4D0]">{c.clientName}</td>
                <td className="py-2 pr-3 text-[#96A8BF]">{c.clientCity}</td>
                <td className="py-2 pr-3 text-right text-[#EDE4D0]">{fmtINR(c.amountTotal)}</td>
                <td className="py-2 pr-3 text-right" style={{ color: STATUS_COLORS[c.paymentStatus] }}>{fmtINR(c.amountReceived)}</td>
                <td className="py-2 pr-3"><Badge label={c.paymentStatus} color={STATUS_COLORS[c.paymentStatus]} /></td>
                <td className="py-2 pr-3"><Badge label={c.status.replace(/_/g,' ')} color={STATUS_COLORS[c.status]} /></td>
                <td className="py-2 text-[#4E6180] text-[10px]">{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
