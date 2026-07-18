'use client'
import { useState } from 'react'
import { useFetch, apiPost } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard } from '../ui'
import { fmtINR, STATUS_COLORS, SessionUser } from '../types'

type Item = { id:string; category:string; itemName:string; model:string; colour:string|null; unit:string; currentStock:number; minStock:number; fastMoving:boolean; inwardCount:number; outwardCount:number; active:boolean }
type UserRow = { id:string; name:string; email:string; role:string; phone:string|null; active:boolean }

export function ITManagerDashboard({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState('items')
  const nav = [
    { id:'items', label:'Item Master', icon:'📦' },
    { id:'add', label:'Add Item', icon:'➕' },
    { id:'analytics', label:'Analytics', icon:'📊' },
    { id:'users', label:'Users', icon:'👥' },
    { id:'all-challans', label:'All Challans', icon:'🧾' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              tab===n.id ? 'bg-[#E05050]/15 text-[#E05050] border-[#E05050]/25' : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
            }`}>
            <span className="mr-1">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>
      {tab === 'items' && <ItemsTab />}
      {tab === 'add' && <AddItemTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'all-challans' && <AllChallansTab />}
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
    <Card className="p-4">
      <SectionTitle icon="📦" title="Item Master — Inward / Outward" sub={`${filtered.length} items`} right={
        <Select value={cat} onChange={setCat} options={cats.map((c) => ({ value:c, label:c==='ALL'?'All Categories':c }))} />
      } />
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-[12px]">
          <thead>
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

      <Modal open={!!editItem} onClose={() => { setEditItem(null); refresh() }} title="Edit Item">
        {editItem && <EditItemForm item={editItem} />}
      </Modal>
    </Card>
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
      await apiPost('/api/items', form) // Note: this creates new; for edit we'd need a PATCH endpoint
      setMsg('✓ Item updated (new entry created)')
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

  const cats = ['Room Amenities','Bathroom Amenities','Lobby Items','Banquet Furniture','Linen','Bath Linen','Bath Tubs','Spare Parts']

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
        <Select label="Category" value={form.category} onChange={(v) => setForm({...form, category:v})} options={[{value:'',label:'— Select —'},...cats.map((c)=>({value:c,label:c}))]} />
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
