'use client'
import { useMemo, useState } from 'react'
import { useFetch, apiPost, apiPatch } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard, Textarea } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, SessionUser } from '../types'

type Item = { id:string; category:string; itemName:string; model:string; colour:string|null; currentStock:number }
type ChallanItem = { id:string; itemName:string; itemNumber:string|null; model:string|null; quantity:number; status:string; matchedItem: Item|null; corrected:boolean }
type Challan = { id:string; challanNumber:string; clientName:string; clientCity:string; clientMobile:string|null; expectedDeliveryDate:string|null; amountTotal:number; amountAdvance:number; amountReceived:number; paymentType:string; paymentStatus:string; status:string; createdAt:string; challanItems:ChallanItem[]; uploadedBy:{name:string;role:string} }

// OutwardLog shape returned by /api/outward
type OutwardLog = {
  id:string; date:string; category:string; itemName:string; model:string;
  colour:string|null; quantity:number; unit:string; clientName:string;
  challanNumber:string|null; billNumber:string|null; remarks:string|null;
  enteredBy?: { name:string; role:string }
}

// StockHold shape returned by /api/stock-hold
type StockHold = {
  id:string; date:string; category:string; itemName:string; model:string;
  colour:string|null; holdQty:number; clientName:string; advanceAmount:number;
  remarks:string|null; status:'ACTIVE'|'RELEASED'|'CONVERTED';
  item: { id:string; currentStock:number; category:string; itemName:string; model:string; colour:string|null };
  heldBy?: { name:string; role:string }
}

// StockRegister row used to look up live available stock per item
type StockRow = {
  id:string; category:string; itemName:string; model:string; colour:string|null;
  unit:string; inward:number; dispatched:number; balance:number; onHold:number;
  available:number; minStock:number; fastMoving:boolean;
  status:'OK'|'LOW'|'OUT_OF_STOCK'
}

const CATEGORIES = ['Room Amenities','Bathroom Amenities','Lobby Items','Banquet Furniture','Linen','Bath Linen','Bath Tubs','Spare Parts']

const HOLD_STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#E09E3C',
  RELEASED: '#4E6180',
  CONVERTED: '#3CB87A',
}

export function SalesDashboard({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState('list')
  const nav = [
    { id:'list', label:'My Challans', icon:'🧾' },
    { id:'upload', label:'Upload Challan', icon:'📤' },
    { id:'outward', label:'Outward Entry', icon:'📤' },
    { id:'hold', label:'Stock Hold', icon:'🔒' },
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
      {tab === 'list' && <ChallanList user={user} />}
      {tab === 'upload' && <UploadForm user={user} onDone={() => setTab('list')} />}
      {tab === 'outward' && <OutwardTab user={user} />}
      {tab === 'hold' && <StockHoldTab user={user} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Outward Entry tab — dispatch stock to client                        */
/* ------------------------------------------------------------------ */
function OutwardTab({ user }: { user: SessionUser }) {
  const { data: itemsData } = useFetch<{ items: Item[] }>('/api/items')
  const { data: regData, refresh: refreshReg } = useFetch<{ rows: StockRow[] }>('/api/stock-register')
  const { data: logsData, loading: logsLoading, refresh: refreshLogs } = useFetch<{ logs: OutwardLog[] }>('/api/outward?limit=100')

  const [date, setDate] = useState('')
  const [category, setCategory] = useState('')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [clientName, setClientName] = useState('')
  const [challanNumber, setChallanNumber] = useState('')
  const [billNumber, setBillNumber] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const items = itemsData?.items || []
  const filteredItems = useMemo(
    () => items.filter((i) => !category || i.category === category),
    [items, category],
  )
  const selectedItem = useMemo(
    () => items.find((i) => i.id === itemId) || null,
    [items, itemId],
  )
  const regRow = useMemo(
    () => regData?.rows.find((r) => r.id === itemId) || null,
    [regData, itemId],
  )
  const available = regRow?.available ?? null

  const qtyNum = Number(qty) || 0
  const qtyValid = qtyNum > 0 && (available === null || qtyNum <= available)

  const reset = () => {
    setDate(''); setCategory(''); setItemId(''); setQty(''); setClientName('')
    setChallanNumber(''); setBillNumber(''); setRemarks('')
  }

  const submit = async () => {
    setErr(''); setOk('')
    if (!itemId) { setErr('Select an item'); return }
    if (!clientName.trim()) { setErr('Client name is required'); return }
    if (qtyNum <= 0) { setErr('Quantity must be greater than 0'); return }
    if (available !== null && qtyNum > available) {
      setErr(`Only ${available} units available`); return
    }
    setSaving(true)
    try {
      const res = await apiPost('/api/outward', {
        itemId, quantity: qtyNum, clientName: clientName.trim(),
        challanNumber: challanNumber || undefined,
        billNumber: billNumber || undefined,
        remarks: remarks || undefined,
        date: date || undefined,
      })
      setOk(res.message || `Dispatched ${qtyNum} unit(s) to ${clientName}`)
      reset()
      refreshReg(); refreshLogs()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to dispatch')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle icon="📤" title="Outward Entry" sub="Dispatch stock to a client — reduces current stock automatically" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Date" type="date" value={date} onChange={setDate} />
          <Select label="Category" value={category} onChange={(v) => { setCategory(v); setItemId('') }}
            options={[{value:'',label:'— All Categories —'}, ...CATEGORIES.map((c) => ({value:c,label:c}))]} />
          <Select label="Item" value={itemId} onChange={setItemId} required
            options={[{value:'',label:'— Select Item —'}, ...filteredItems.map((it) => ({
              value: it.id,
              label: `${it.itemName}${it.model ? ` (${it.model})` : ''}${it.colour ? ` · ${it.colour}` : ''}`,
            }))]} />
          <ReadonlyField label="Model / SKU" value={selectedItem?.model || '—'} />
          <ReadonlyField label="Colour / Variant" value={selectedItem?.colour || '—'} />
          <div>
            <Input label="Quantity" type="number" value={qty} onChange={setQty} placeholder="0" required
              step="1" />
            {itemId && (
              <div className={`mt-1.5 text-[11px] flex items-center gap-1.5 ${
                available === null ? 'text-[#96A8BF]' :
                available <= 0 ? 'text-[#E05050]' :
                available <= (regRow?.minStock || 0) ? 'text-[#E09E3C]' :
                'text-[#3CB87A]'
              }`}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                Available: <span className="font-semibold">{available ?? '…'}</span>
                {regRow && regRow.onHold > 0 && <span className="text-[#4E6180]"> (held: {regRow.onHold})</span>}
                {qty && !qtyValid && available !== null && (
                  <span className="ml-1 text-[#E05050]">· exceeds stock</span>
                )}
              </div>
            )}
          </div>
          <Input label="Client Name" value={clientName} onChange={setClientName} placeholder="Hotel / Client name" required />
          <Input label="Challan Number" value={challanNumber} onChange={setChallanNumber} placeholder="CH-2026-0002" />
          <Input label="Bill / Invoice Number" value={billNumber} onChange={setBillNumber} placeholder="INV-…" />
          <div className="md:col-span-2 lg:col-span-3">
            <Textarea label="Remarks" value={remarks} onChange={setRemarks} placeholder="Optional notes about dispatch…" rows={2} />
          </div>
        </div>

        {err && <div className="mt-3 rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>}
        {ok && <div className="mt-3 rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-2 text-xs text-[#3CB87A]">✓ {ok}</div>}

        <div className="flex justify-end gap-2 mt-4">
          <Btn onClick={reset} disabled={saving}>Clear</Btn>
          <Btn variant="gold" onClick={submit} disabled={saving || !itemId || !qtyValid}>
            {saving ? 'Dispatching…' : '📤 Dispatch Stock'}
          </Btn>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle icon="📋" title="Recent Outward Logs" sub={`${logsData?.logs.length || 0} recent dispatches`} right={
          <Btn size="sm" onClick={refreshLogs}>↻ Refresh</Btn>
        } />
        {logsLoading ? <div className="text-center py-6 text-[#96A8BF] text-sm">Loading…</div> :
         !logsData || logsData.logs.length === 0 ? <EmptyState icon="📤" title="No outward entries yet" sub="Dispatched stock will appear here" /> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-white/7">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#111f32] z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-3">Model</th>
                    <th className="py-2 px-3">Colour</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3">Client</th>
                    <th className="py-2 px-3">Challan</th>
                    <th className="py-2 px-3">Bill No</th>
                  </tr>
                </thead>
                <tbody>
                  {logsData.logs.map((l) => (
                    <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 px-3 text-[#96A8BF] whitespace-nowrap">{fmtDate(l.date)}</td>
                      <td className="py-2 px-3 text-[#EDE4D0]">{l.itemName}</td>
                      <td className="py-2 px-3 text-[#96A8BF] font-mono">{l.model || '—'}</td>
                      <td className="py-2 px-3 text-[#96A8BF]">{l.colour || '—'}</td>
                      <td className="py-2 px-3 text-right text-[#E05050] font-semibold">−{l.quantity}</td>
                      <td className="py-2 px-3 text-[#EDE4D0]">{l.clientName}</td>
                      <td className="py-2 px-3 text-[#E4AF4A] font-mono">{l.challanNumber || '—'}</td>
                      <td className="py-2 px-3 text-[#96A8BF] font-mono">{l.billNumber || '—'}</td>
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

/* ------------------------------------------------------------------ */
/* Stock Hold tab — reserve stock against advance                      */
/* ------------------------------------------------------------------ */
function StockHoldTab({ user }: { user: SessionUser }) {
  const { data: itemsData } = useFetch<{ items: Item[] }>('/api/items')
  const { data: regData, refresh: refreshReg } = useFetch<{ rows: StockRow[] }>('/api/stock-register')
  const { data: holdsData, loading: holdsLoading, refresh: refreshHolds } = useFetch<{ holds: StockHold[] }>('/api/stock-hold?status=ACTIVE')

  const [date, setDate] = useState('')
  const [category, setCategory] = useState('')
  const [itemId, setItemId] = useState('')
  const [holdQty, setHoldQty] = useState('')
  const [clientName, setClientName] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const items = itemsData?.items || []
  const filteredItems = useMemo(
    () => items.filter((i) => !category || i.category === category),
    [items, category],
  )
  const selectedItem = useMemo(
    () => items.find((i) => i.id === itemId) || null,
    [items, itemId],
  )
  const regRow = useMemo(
    () => regData?.rows.find((r) => r.id === itemId) || null,
    [regData, itemId],
  )
  // available after existing holds = regRow.available (already subtracts active holds)
  const availableAfterHold = regRow?.available ?? null

  const holds = holdsData?.holds || []
  const summary = useMemo(() => ({
    total: holds.length,
    totalQty: holds.reduce((s, h) => s + h.holdQty, 0),
    totalAdvance: holds.reduce((s, h) => s + h.advanceAmount, 0),
  }), [holds])

  const qtyNum = Number(holdQty) || 0
  const qtyValid = qtyNum > 0 && (availableAfterHold === null || qtyNum <= availableAfterHold)

  const reset = () => {
    setDate(''); setCategory(''); setItemId(''); setHoldQty(''); setClientName('')
    setAdvanceAmount(''); setRemarks('')
  }

  const submit = async () => {
    setErr(''); setOk('')
    if (!itemId) { setErr('Select an item'); return }
    if (!clientName.trim()) { setErr('Client name is required'); return }
    if (qtyNum <= 0) { setErr('Hold quantity must be greater than 0'); return }
    if (availableAfterHold !== null && qtyNum > availableAfterHold) {
      setErr(`Cannot hold ${qtyNum}. Only ${availableAfterHold} available (after existing holds).`); return
    }
    setSaving(true)
    try {
      const res = await apiPost('/api/stock-hold', {
        itemId, holdQty: qtyNum, clientName: clientName.trim(),
        advanceAmount: Number(advanceAmount) || 0,
        remarks: remarks || undefined,
      })
      setOk(res.message || `Held ${qtyNum} unit(s) for ${clientName}`)
      reset()
      refreshReg(); refreshHolds()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to place hold')
    } finally { setSaving(false) }
  }

  const release = async (id: string) => {
    setErr(''); setOk('')
    setReleasing(id)
    try {
      const res = await apiPatch('/api/stock-hold', { id, status: 'RELEASED' })
      setOk(res.message || 'Hold released — stock returned to available pool')
      refreshReg(); refreshHolds()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to release hold')
    } finally { setReleasing(null) }
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Active Holds" value={summary.total} accent="#E4AF4A" icon="🔒" />
        <StatCard label="Total Held Qty" value={summary.totalQty} accent="#E09E3C" icon="📦" />
        <StatCard label="Total Advance" value={fmtINR(summary.totalAdvance)} accent="#3CB87A" icon="💰" />
      </div>

      <Card className="p-4">
        <SectionTitle icon="🔒" title="Place Stock Hold" sub="Reserve stock against advance payment — held units excluded from outward availability" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Date" type="date" value={date} onChange={setDate} />
          <Select label="Category" value={category} onChange={(v) => { setCategory(v); setItemId('') }}
            options={[{value:'',label:'— All Categories —'}, ...CATEGORIES.map((c) => ({value:c,label:c}))]} />
          <Select label="Item" value={itemId} onChange={setItemId} required
            options={[{value:'',label:'— Select Item —'}, ...filteredItems.map((it) => ({
              value: it.id,
              label: `${it.itemName}${it.model ? ` (${it.model})` : ''}${it.colour ? ` · ${it.colour}` : ''}`,
            }))]} />
          <ReadonlyField label="Model / SKU" value={selectedItem?.model || '—'} />
          <ReadonlyField label="Colour / Variant" value={selectedItem?.colour || '—'} />
          <div>
            <Input label="Hold Quantity" type="number" value={holdQty} onChange={setHoldQty} placeholder="0" required step="1" />
            {itemId && (
              <div className={`mt-1.5 text-[11px] flex items-center gap-1.5 ${
                availableAfterHold === null ? 'text-[#96A8BF]' :
                availableAfterHold <= 0 ? 'text-[#E05050]' :
                availableAfterHold <= (regRow?.minStock || 0) ? 'text-[#E09E3C]' :
                'text-[#3CB87A]'
              }`}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                Available (after holds): <span className="font-semibold">{availableAfterHold ?? '…'}</span>
                {regRow && <>
                  <span className="text-[#4E6180]">· balance: {regRow.balance}</span>
                  {regRow.onHold > 0 && <span className="text-[#E09E3C]">· already held: {regRow.onHold}</span>}
                </>}
                {holdQty && !qtyValid && availableAfterHold !== null && (
                  <span className="ml-1 text-[#E05050]">· exceeds available</span>
                )}
              </div>
            )}
          </div>
          <Input label="Client Name" value={clientName} onChange={setClientName} placeholder="Hotel / Client name" required />
          <Input label="Advance Amount (₹)" type="number" value={advanceAmount} onChange={setAdvanceAmount} placeholder="0" step="0.01" />
          <div className="md:col-span-2 lg:col-span-3">
            <Textarea label="Remarks" value={remarks} onChange={setRemarks} placeholder="Optional — lead time, expected conversion date, etc." rows={2} />
          </div>
        </div>

        {err && <div className="mt-3 rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>}
        {ok && <div className="mt-3 rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-2 text-xs text-[#3CB87A]">✓ {ok}</div>}

        <div className="flex justify-end gap-2 mt-4">
          <Btn onClick={reset} disabled={saving}>Clear</Btn>
          <Btn variant="gold" onClick={submit} disabled={saving || !itemId || !qtyValid}>
            {saving ? 'Placing Hold…' : '🔒 Place Hold'}
          </Btn>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle icon="📋" title="Active Stock Holds" sub={`${holds.length} active reservation(s)`} right={
          <Btn size="sm" onClick={refreshHolds}>↻ Refresh</Btn>
        } />
        {holdsLoading ? <div className="text-center py-6 text-[#96A8BF] text-sm">Loading…</div> :
         holds.length === 0 ? <EmptyState icon="🔒" title="No active holds" sub="Place a hold above to reserve stock" /> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-white/7">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#111f32] z-10">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Item</th>
                    <th className="py-2 px-3">Model</th>
                    <th className="py-2 px-3">Colour</th>
                    <th className="py-2 px-3 text-right">Hold Qty</th>
                    <th className="py-2 px-3">Client</th>
                    <th className="py-2 px-3 text-right">Advance ₹</th>
                    <th className="py-2 px-3 text-right">Available</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holds.map((h) => {
                    const itemBalance = h.item?.currentStock ?? 0
                    const availableNow = itemBalance - h.holdQty
                    return (
                      <tr key={h.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2 px-3 text-[#96A8BF] whitespace-nowrap">{fmtDate(h.date)}</td>
                        <td className="py-2 px-3 text-[#EDE4D0]">{h.itemName}</td>
                        <td className="py-2 px-3 text-[#96A8BF] font-mono">{h.model || '—'}</td>
                        <td className="py-2 px-3 text-[#96A8BF]">{h.colour || '—'}</td>
                        <td className="py-2 px-3 text-right text-[#E09E3C] font-semibold">{h.holdQty}</td>
                        <td className="py-2 px-3 text-[#EDE4D0]">{h.clientName}</td>
                        <td className="py-2 px-3 text-right text-[#3CB87A]">{fmtINR(h.advanceAmount)}</td>
                        <td className="py-2 px-3 text-right text-[#96A8BF]">{availableNow}</td>
                        <td className="py-2 px-3"><Badge label={h.status} color={HOLD_STATUS_COLOR[h.status]} /></td>
                        <td className="py-2 px-3 text-right">
                          {h.status === 'ACTIVE' ? (
                            <Btn size="sm" variant="danger" disabled={releasing === h.id}
                              onClick={() => release(h.id)}>
                              {releasing === h.id ? 'Releasing…' : 'Release'}
                            </Btn>
                          ) : <span className="text-[#4E6180] text-[11px]">—</span>}
                        </td>
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

/* ------------------------------------------------------------------ */
/* Shared read-only display field                                      */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Existing tabs — Challan list + analysis + upload (unchanged)        */
/* ------------------------------------------------------------------ */
function ChallanList({ user }: { user: SessionUser }) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans')
  const [sel, setSel] = useState<Challan | null>(null)
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const mine = data.challans // sales sees all but can filter

  return (
    <Card className="p-4">
      <SectionTitle icon="🧾" title="Challans" sub={`${mine.length} total`} />
      {mine.length === 0 ? <EmptyState icon="🧾" title="No challans" sub="Upload your first challan to begin" /> : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                <th className="py-2 pr-3">Challan #</th>
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3">Expected</th>
                <th className="py-2 pr-3 text-right">Advance</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3">Items</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((c) => {
                const matched = c.challanItems.filter((i) => i.status==='MATCHED').length
                const issues = c.challanItems.length - matched
                return (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer" onClick={() => setSel(c)}>
                    <td className="py-2 pr-3 text-[#E4AF4A] font-mono">{c.challanNumber}</td>
                    <td className="py-2 pr-3 text-[#EDE4D0]">{c.clientName}<div className="text-[10px] text-[#4E6180]">{c.clientCity}</div></td>
                    <td className="py-2 pr-3 text-[#96A8BF]">{fmtDate(c.expectedDeliveryDate)}</td>
                    <td className="py-2 pr-3 text-right text-[#3CB87A]">{fmtINR(c.amountAdvance)}</td>
                    <td className="py-2 pr-3 text-right text-[#EDE4D0]">{fmtINR(c.amountTotal)}</td>
                    <td className="py-2 pr-3">
                      <span className="text-[#3CB87A]">{matched}</span>
                      {issues > 0 && <span className="text-[#E09E3C]"> / {issues}⚠</span>}
                      <span className="text-[#4E6180]"> / {c.challanItems.length}</span>
                    </td>
                    <td className="py-2"><Badge label={c.status.replace(/_/g,' ')} color={STATUS_COLORS[c.status]} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!sel} onClose={() => { setSel(null); refresh() }} title={sel ? `${sel.challanNumber} — Analysis` : ''} wide>
        {sel && <ChallanAnalysis c={sel} />}
      </Modal>
    </Card>
  )
}

function ChallanAnalysis({ c }: { c: Challan }) {
  const matched = c.challanItems.filter((i) => i.status === 'MATCHED')
  const wrong = c.challanItems.filter((i) => i.status === 'WRONG_MODEL')
  const notFound = c.challanItems.filter((i) => i.status === 'NOT_FOUND')
  const remaining = c.amountTotal - c.amountReceived

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Total" value={fmtINR(c.amountTotal)} accent="#E4AF4A" />
        <StatCard label="Advance" value={fmtINR(c.amountAdvance)} accent="#3CB87A" />
        <StatCard label="Received" value={fmtINR(c.amountReceived)} accent="#4A9EE0" />
        <StatCard label="Remaining" value={fmtINR(remaining)} accent={remaining>0?'#E09E3C':'#3CB87A'} />
      </div>

      {/* Summary: available / not available */}
      <Card className="p-3">
        <SectionTitle icon="📋" title="Summary — Item Availability" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg border border-[#3CB87A]/20 bg-[#3CB87A]/5 p-2.5">
            <div className="text-[#3CB87A] font-semibold mb-1">✓ Available ({matched.length})</div>
            {matched.map((i) => <div key={i.id} className="text-[#EDE4D0]">• {i.itemName} <span className="text-[#96A8BF]">×{i.quantity}</span></div>)}
            {matched.length === 0 && <div className="text-[#4E6180]">None</div>}
          </div>
          <div className="rounded-lg border border-[#E09E3C]/20 bg-[#E09E3C]/5 p-2.5">
            <div className="text-[#E09E3C] font-semibold mb-1">⚠ Model Mismatch ({wrong.length})</div>
            {wrong.map((i) => <div key={i.id} className="text-[#EDE4D0]">• {i.itemName}<div className="text-[10px] text-[#96A8BF]">Challan: {i.model} → Stock: {i.matchedItem?.model}</div></div>)}
            {wrong.length === 0 && <div className="text-[#4E6180]">None</div>}
          </div>
          <div className="rounded-lg border border-[#E05050]/20 bg-[#E05050]/5 p-2.5">
            <div className="text-[#E05050] font-semibold mb-1">✕ Not in Catalogue ({notFound.length})</div>
            {notFound.map((i) => <div key={i.id} className="text-[#EDE4D0]">• {i.itemName} <span className="text-[#96A8BF]">({i.model})</span></div>)}
            {notFound.length === 0 && <div className="text-[#4E6180]">None</div>}
          </div>
        </div>
      </Card>

      {/* Detailed items table */}
      <div>
        <h4 className="text-[12px] font-semibold text-[#E4AF4A] mb-2">Item Analysis Detail</h4>
        <div className="rounded-lg border border-white/7 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase text-[#4E6180] bg-white/[0.02]">
                <th className="py-2 px-3">Item Name</th>
                <th className="py-2 px-3">Item #</th>
                <th className="py-2 px-3">Model (Challan)</th>
                <th className="py-2 px-3">Model (Stock)</th>
                <th className="py-2 px-3 text-right">Qty</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {c.challanItems.map((ci) => (
                <tr key={ci.id} className="border-t border-white/5">
                  <td className="py-2 px-3 text-[#EDE4D0]">{ci.itemName}</td>
                  <td className="py-2 px-3 text-[#96A8BF] font-mono">{ci.itemNumber || '—'}</td>
                  <td className="py-2 px-3 text-[#96A8BF] font-mono">{ci.model || '—'}</td>
                  <td className="py-2 px-3 text-[#96A8BF] font-mono">{ci.matchedItem?.model || '—'}</td>
                  <td className="py-2 px-3 text-right">{ci.quantity}</td>
                  <td className="py-2 px-3"><Badge label={ci.status.replace(/_/g,' ')} color={STATUS_COLORS[ci.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {c.paymentStatus === 'PARTIAL' && (
        <div className="rounded-lg border border-[#E09E3C]/30 bg-[#E09E3C]/10 p-3 text-[12px] text-[#E09E3C]">
          ⚠ Partial payment: ₹{remaining.toLocaleString('en-IN')} remaining. Account team has been notified to verify the advance.
        </div>
      )}
      {c.paymentStatus === 'PAID' && (
        <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 p-3 text-[12px] text-[#3CB87A]">
          ✓ Full payment received. Challan sent to Account team for verification.
        </div>
      )}
    </div>
  )
}

function UploadForm({ user, onDone }: { user: SessionUser; onDone: () => void }) {
  const [challanNumber, setChallanNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientCity, setClientCity] = useState('')
  const [clientMobile, setClientMobile] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [amountTotal, setAmountTotal] = useState('')
  const [amountAdvance, setAmountAdvance] = useState('')
  const [paymentType, setPaymentType] = useState('ADVANCE')
  const [items, setItems] = useState([{ itemName:'', itemNumber:'', model:'', quantity:1 }])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Challan | null>(null)

  const { data: itemsData } = useFetch<{ items: Item[] }>('/api/items')

  const submit = async () => {
    setErr('')
    if (!challanNumber || !clientName) { setErr('Challan number and client name required'); return }
    const validItems = items.filter((i) => i.itemName.trim())
    if (!validItems.length) { setErr('Add at least one item'); return }
    if (paymentType === 'ADVANCE' && !amountAdvance) { setErr('Advance amount is mandatory when payment type is Advance'); return }
    setSaving(true)
    try {
      const res = await apiPost('/api/challans/upload', {
        challanNumber, clientName, clientCity, clientMobile,
        expectedDeliveryDate: expectedDate || null,
        amountTotal: Number(amountTotal) || 0,
        amountAdvance: Number(amountAdvance) || 0,
        paymentType,
        items: validItems,
      })
      setResult(res.challan)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally { setSaving(false) }
  }

  if (result) {
    return (
      <Card className="p-4">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">✅</div>
          <h3 className="font-serif text-lg font-bold text-[#3CB87A]">Challan Uploaded &amp; Analyzed!</h3>
          <p className="text-[12px] text-[#96A8BF] mt-1">System auto-analyzed {result.challanItems.length} items</p>
        </div>
        <ChallanAnalysis c={result} />
        <div className="flex justify-end gap-2 mt-4">
          <Btn onClick={() => { setResult(null); onDone() }}>Done</Btn>
          <Btn variant="gold" onClick={() => { setResult(null); setChallanNumber(''); setClientName(''); setClientCity(''); setClientMobile(''); setExpectedDate(''); setAmountTotal(''); setAmountAdvance(''); setItems([{ itemName:'', itemNumber:'', model:'', quantity:1 }]) }}>Upload Another</Btn>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle icon="📤" title="Upload New Challan" sub="System will auto-analyze each item against master inventory" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Challan Number" value={challanNumber} onChange={setChallanNumber} placeholder="CH-2026-0002" required />
          <Input label="Client Name" value={clientName} onChange={setClientName} placeholder="Hotel Name" required />
          <Input label="City" value={clientCity} onChange={setClientCity} placeholder="City" />
          <Input label="Mobile" value={clientMobile} onChange={setClientMobile} placeholder="+91…" />
          <Input label="Expected Delivery Date" type="date" value={expectedDate} onChange={setExpectedDate} />
          <Select label="Payment Type" value={paymentType} onChange={setPaymentType} options={[
            { value:'FULL', label:'Full Payment' },
            { value:'ADVANCE', label:'Advance Payment' },
            { value:'NONE', label:'No Payment Yet' },
          ]} />
          <Input label="Total Amount (₹)" type="number" value={amountTotal} onChange={setAmountTotal} placeholder="0" />
          <Input label={paymentType==='ADVANCE'?'Advance Amount (₹) *':'Advance Amount (₹)'} type="number" value={amountAdvance} onChange={setAmountAdvance} placeholder="0" required={paymentType==='ADVANCE'} />
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle icon="📦" title="Challan Items" sub="Add each item — system will check name + model" />
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <Select label={idx===0?'Item Name':''} value={it.itemName} onChange={(v) => {
                  const n=[...items]; n[idx]={...it,itemName:v}
                  const f = itemsData?.items.find((m)=>m.itemName===v)
                  if (f) { n[idx].model = f.model; n[idx].itemNumber = f.model.split('-').pop() || '' }
                  setItems(n)
                }} options={[{value:'',label:'— Select / Type —'},...(itemsData?.items.map((m)=>({value:m.itemName,label:`${m.itemName} (${m.model})`}))||[])]} />
              </div>
              <div className="col-span-3"><Input label={idx===0?'Item #':''} value={it.itemNumber} onChange={(v)=>{const n=[...items];n[idx]={...it,itemNumber:v};setItems(n)}} placeholder="MB-40L" /></div>
              <div className="col-span-3"><Input label={idx===0?'Model':''} value={it.model} onChange={(v)=>{const n=[...items];n[idx]={...it,model:v};setItems(n)}} placeholder="LR-MB-40L" /></div>
              <div className="col-span-1"><Input label={idx===0?'Qty':''} type="number" value={it.quantity} onChange={(v)=>{const n=[...items];n[idx]={...it,quantity:Number(v)||1};setItems(n)}} /></div>
              <div className="col-span-1 flex gap-1">
                {idx===items.length-1 && <Btn size="sm" onClick={()=>setItems([...items,{itemName:'',itemNumber:'',model:'',quantity:1}])}>+</Btn>}
                {items.length>1 && <Btn size="sm" variant="danger" onClick={()=>setItems(items.filter((_,i)=>i!==idx))}>×</Btn>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {err && <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>}

      <div className="flex justify-end gap-2">
        <Btn onClick={onDone}>Cancel</Btn>
        <Btn variant="gold" onClick={submit} disabled={saving}>{saving ? 'Uploading & Analyzing…' : '📤 Upload & Analyze'}</Btn>
      </div>
    </div>
  )
}
