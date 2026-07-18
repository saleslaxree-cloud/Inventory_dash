'use client'
import { useState } from 'react'
import { useFetch, apiPost } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, SectionTitle, Select, StatCard, Textarea } from '../ui'
import { fmtDate, STATUS_COLORS, SessionUser } from '../types'

type Challan = {
  id:string; challanNumber:string; clientName:string; clientCity:string; clientMobile:string|null; clientLocation:string|null;
  expectedDeliveryDate:string|null; amountTotal:number; status:string;
  challanItems:{id:string;itemName:string;quantity:number}[];
}
type Checklist = {
  id:string; challanId:string; clientName:string; mobileNo:string|null; location:string|null;
  invoiceNo:string|null; challanNo:string|null; noOfBoxes:number|null; transporterName:string|null;
  vehicleTrackingNo:string|null; driverDetails:string|null; dispatchDate:string|null; leadTime:string|null;
  acknowledgementMessage:string|null; successfulDeliveryMessage:string|null; googleReview:string|null;
  generalFeedback:string|null; status:string; createdAt:string;
  challan:{challanNumber:string;clientName:string;clientCity:string};
}

export function SupportDashboard({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState('pending')
  const [refreshKey, setRefreshKey] = useState(0)
  const nav = [
    { id:'pending', label:'Pending Dispatch', icon:'🚚' },
    { id:'all', label:'All Checklists', icon:'📋' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              tab===n.id ? 'bg-[#E09E3C]/15 text-[#E09E3C] border-[#E09E3C]/25' : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
            }`}>
            <span className="mr-1">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>
      {tab === 'pending' && <PendingTab onChanged={() => setRefreshKey(k=>k+1)} />}
      {tab === 'all' && <AllTab refreshKey={refreshKey} />}
    </div>
  )
}

function PendingTab({ onChanged }: { onChanged: () => void }) {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans')
  const [sel, setSel] = useState<Challan | null>(null)
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const dispatched = data.challans.filter((c) => c.status === 'DISPATCHED' || c.status === 'IN_TRANSIT')
  const ready = data.challans.filter((c) => c.accountVerified && c.status !== 'DISPATCHED' && c.status !== 'CLOSED' && c.status !== 'DELIVERED')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Ready to Dispatch" value={ready.length} accent="#E09E3C" icon="📦" />
        <StatCard label="In Transit" value={dispatched.length} accent="#4A9EE0" icon="🚚" />
        <StatCard label="Total Items" value={ready.reduce((s,c) => s + c.challanItems.length, 0)} accent="#3CB87A" icon="📋" />
      </div>

      <Card className="p-4">
        <SectionTitle icon="🚚" title="Fill Dispatch Checklist" sub="Complete dispatch details → capture delivery feedback" />
        {ready.length === 0 ? <EmptyState icon="✅" title="All dispatched" sub="No pending dispatch checklists" /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ready.map((c) => (
              <button key={c.id} onClick={() => setSel(c)} className="text-left rounded-lg border border-white/7 bg-white/[0.02] p-3 hover:bg-white/5">
                <div className="font-mono text-[12px] text-[#E4AF4A] mb-1">{c.challanNumber}</div>
                <div className="text-[13px] text-[#EDE4D0] font-medium">{c.clientName}</div>
                <div className="text-[11px] text-[#96A8BF]">{c.clientCity}</div>
                <div className="text-[10px] text-[#4E6180] mt-1">{c.challanItems.length} items • Exp: {fmtDate(c.expectedDeliveryDate)}</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {sel && <ChecklistForm challan={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); onChanged() }} />}
    </div>
  )
}

function ChecklistForm({ challan, onClose, onSaved }: { challan: Challan; onClose: ()=>void; onSaved: ()=>void }) {
  const [form, setForm] = useState({
    clientName: challan.clientName,
    mobileNo: challan.clientMobile || '',
    location: challan.clientCity,
    invoiceNo: '',
    challanNo: challan.challanNumber,
    noOfBoxes: '',
    transporterName: '',
    vehicleTrackingNo: '',
    driverDetails: '',
    dispatchDate: '',
    leadTime: '',
    acknowledgementMessage: '',
    successfulDeliveryMessage: '',
    googleReview: '',
    generalFeedback: '',
    status: 'DRAFT',
  })
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)

  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const save = async (status: string) => {
    setSaving(true)
    try {
      await apiPost('/api/support-checklist', { ...form, challanId: challan.id, status })
      onSaved()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-[#111f32] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#111f32] border-b border-white/10 px-5 py-3.5 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-base font-bold text-[#E4AF4A]">Dispatch Checklist</h3>
              <p className="text-[11px] text-[#96A8BF]">{challan.challanNumber} — {challan.clientName}</p>
            </div>
            <button onClick={onClose} className="text-[#96A8BF] hover:text-[#EDE4D0] text-xl">×</button>
          </div>
          <div className="flex gap-1 mt-2">
            {[1,2,3].map((s) => (
              <div key={s} className={`flex-1 h-1 rounded-full ${step>=s ? 'bg-[#E09E3C]' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              <h4 className="text-[12px] font-semibold text-[#E4AF4A] uppercase tracking-wide">Step 1: Dispatch Details</h4>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Client Name" value={form.clientName} onChange={(v) => set('clientName', v)} required />
                <Input label="Mobile No." value={form.mobileNo} onChange={(v) => set('mobileNo', v)} placeholder="+91…" />
                <Input label="Location" value={form.location} onChange={(v) => set('location', v)} />
                <Input label="Invoice No." value={form.invoiceNo} onChange={(v) => set('invoiceNo', v)} placeholder="INV-2026-0001" />
                <Input label="Challan No." value={form.challanNo} onChange={(v) => set('challanNo', v)} />
                <Input label="No. of Boxes" type="number" value={form.noOfBoxes} onChange={(v) => set('noOfBoxes', v)} />
                <Input label="Transporter Name" value={form.transporterName} onChange={(v) => set('transporterName', v)} placeholder="BlueDart / DTDC" />
                <Input label="Vehicle / Tracking No." value={form.vehicleTrackingNo} onChange={(v) => set('vehicleTrackingNo', v)} placeholder="RJ01 AB 1234" />
                <Input label="Driver Details" value={form.driverDetails} onChange={(v) => set('driverDetails', v)} placeholder="Name + Mobile" />
                <Input label="Dispatch Date" type="date" value={form.dispatchDate} onChange={(v) => set('dispatchDate', v)} />
                <Input label="Lead Time (days)" value={form.leadTime} onChange={(v) => set('leadTime', v)} placeholder="3-5 days" />
              </div>
              <div className="flex justify-end">
                <Btn variant="gold" onClick={() => setStep(2)}>Next →</Btn>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h4 className="text-[12px] font-semibold text-[#E4AF4A] uppercase tracking-wide">Step 2: Mark as Dispatched</h4>
              <div className="rounded-lg border border-[#E09E3C]/20 bg-[#E09E3C]/5 p-3 text-[11px] text-[#E09E3C]">
                Confirm dispatch. Once marked, status becomes DISPATCHED and you can capture delivery feedback in step 3.
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div><div className="text-[#4E6180]">Client</div><div className="text-[#EDE4D0]">{form.clientName}</div></div>
                <div><div className="text-[#4E6180]">Mobile</div><div className="text-[#EDE4D0]">{form.mobileNo || '—'}</div></div>
                <div><div className="text-[#4E6180]">Location</div><div className="text-[#EDE4D0]">{form.location}</div></div>
                <div><div className="text-[#4E6180]">Invoice</div><div className="text-[#EDE4D0]">{form.invoiceNo || '—'}</div></div>
                <div><div className="text-[#4E6180]">Boxes</div><div className="text-[#EDE4D0]">{form.noOfBoxes || '—'}</div></div>
                <div><div className="text-[#4E6180]">Transporter</div><div className="text-[#EDE4D0]">{form.transporterName || '—'}</div></div>
                <div><div className="text-[#4E6180]">Vehicle</div><div className="text-[#EDE4D0]">{form.vehicleTrackingNo || '—'}</div></div>
                <div><div className="text-[#4E6180]">Driver</div><div className="text-[#EDE4D0]">{form.driverDetails || '—'}</div></div>
                <div><div className="text-[#4E6180]">Dispatch Date</div><div className="text-[#EDE4D0]">{form.dispatchDate ? fmtDate(form.dispatchDate) : '—'}</div></div>
                <div><div className="text-[#4E6180]">Lead Time</div><div className="text-[#EDE4D0]">{form.leadTime || '—'}</div></div>
              </div>
              <div className="flex justify-between">
                <Btn onClick={() => setStep(1)}>← Back</Btn>
                <Btn variant="gold" onClick={() => save('DISPATCHED')} disabled={saving}>{saving ? 'Saving…' : '🚚 Mark Dispatched'}</Btn>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h4 className="text-[12px] font-semibold text-[#3CB87A] uppercase tracking-wide">Step 3: Delivery Feedback</h4>
              <div className="space-y-3">
                <Textarea label="Acknowledgement Message" value={form.acknowledgementMessage} onChange={(v) => set('acknowledgementMessage', v)} placeholder="Received by client on…" rows={2} />
                <Textarea label="Successful Delivery Message" value={form.successfulDeliveryMessage} onChange={(v) => set('successfulDeliveryMessage', v)} placeholder="Delivery completed successfully…" rows={2} />
                <Textarea label="Google Review" value={form.googleReview} onChange={(v) => set('googleReview', v)} placeholder="Client's review / rating…" rows={2} />
                <Textarea label="General Feedback" value={form.generalFeedback} onChange={(v) => set('generalFeedback', v)} placeholder="Any other feedback…" rows={3} />
              </div>
              <div className="flex justify-between">
                <Btn onClick={() => setStep(2)}>← Back</Btn>
                <Btn variant="success" onClick={() => save('COMPLETED')} disabled={saving}>{saving ? 'Saving…' : '✓ Complete & Notify Owner'}</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AllTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading } = useFetch<{ checklists: Checklist[] }>('/api/support-checklist', [refreshKey])
  const [sel, setSel] = useState<Checklist | null>(null)
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  return (
    <Card className="p-4">
      <SectionTitle icon="📋" title="All Dispatch Checklists" sub={`${data.checklists.length} total`} />
      {data.checklists.length === 0 ? <EmptyState icon="📋" title="No checklists yet" /> : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3">Challan #</th>
                <th className="py-2 pr-3">Mobile</th>
                <th className="py-2 pr-3">Location</th>
                <th className="py-2 pr-3">Boxes</th>
                <th className="py-2 pr-3">Transporter</th>
                <th className="py-2 pr-3">Dispatched</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.checklists.map((c) => (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer" onClick={() => setSel(c)}>
                  <td className="py-2 pr-3 text-[#EDE4D0]">{c.clientName}</td>
                  <td className="py-2 pr-3 text-[#E4AF4A] font-mono">{c.challan.challanNumber}</td>
                  <td className="py-2 pr-3 text-[#96A8BF]">{c.mobileNo || '—'}</td>
                  <td className="py-2 pr-3 text-[#96A8BF]">{c.location || '—'}</td>
                  <td className="py-2 pr-3 text-[#EDE4D0]">{c.noOfBoxes || '—'}</td>
                  <td className="py-2 pr-3 text-[#96A8BF]">{c.transporterName || '—'}</td>
                  <td className="py-2 pr-3 text-[#96A8BF]">{fmtDate(c.dispatchDate)}</td>
                  <td className="py-2"><Badge label={c.status} color={STATUS_COLORS[c.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSel(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-[#111f32] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-serif text-base font-bold text-[#E4AF4A]">{sel.clientName}</h3>
              <button onClick={() => setSel(null)} className="text-[#96A8BF] text-xl">×</button>
            </div>
            <div className="space-y-2 text-[12px]">
              <Row label="Challan #" value={sel.challan.challanNumber} />
              <Row label="Mobile" value={sel.mobileNo} />
              <Row label="Location" value={sel.location} />
              <Row label="Invoice No" value={sel.invoiceNo} />
              <Row label="No. of Boxes" value={String(sel.noOfBoxes || '—')} />
              <Row label="Transporter" value={sel.transporterName} />
              <Row label="Vehicle / Tracking" value={sel.vehicleTrackingNo} />
              <Row label="Driver" value={sel.driverDetails} />
              <Row label="Dispatch Date" value={fmtDate(sel.dispatchDate)} />
              <Row label="Lead Time" value={sel.leadTime} />
              <div className="border-t border-white/7 my-2" />
              <Row label="Acknowledgement" value={sel.acknowledgementMessage} />
              <Row label="Delivery Success" value={sel.successfulDeliveryMessage} />
              <Row label="Google Review" value={sel.googleReview} />
              <Row label="General Feedback" value={sel.generalFeedback} />
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-[#4E6180]">{label}</div>
      <div className="col-span-2 text-[#EDE4D0]">{value || '—'}</div>
    </div>
  )
}
