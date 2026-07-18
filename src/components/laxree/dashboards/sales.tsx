'use client'
import { useState } from 'react'
import { useFetch, apiPost } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, SessionUser } from '../types'

type Item = { id:string; category:string; itemName:string; model:string; colour:string|null; currentStock:number }
type ChallanItem = { id:string; itemName:string; itemNumber:string|null; model:string|null; quantity:number; status:string; matchedItem: Item|null; corrected:boolean }
type Challan = { id:string; challanNumber:string; clientName:string; clientCity:string; clientMobile:string|null; expectedDeliveryDate:string|null; amountTotal:number; amountAdvance:number; amountReceived:number; paymentType:string; paymentStatus:string; status:string; createdAt:string; challanItems:ChallanItem[]; uploadedBy:{name:string;role:string} }

export function SalesDashboard({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState('list')
  const nav = [
    { id:'list', label:'My Challans', icon:'🧾' },
    { id:'upload', label:'Upload Challan', icon:'📤' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
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
    </div>
  )
}

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
