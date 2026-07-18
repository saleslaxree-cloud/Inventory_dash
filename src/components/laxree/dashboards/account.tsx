'use client'
import { useState } from 'react'
import { useFetch, apiPost } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard, Textarea } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, STAGE_LABELS, SessionUser } from '../types'

type Challan = {
  id:string; challanNumber:string; clientName:string; clientCity:string; clientMobile:string|null;
  expectedDeliveryDate:string|null; amountTotal:number; amountAdvance:number; amountReceived:number;
  paymentType:string; paymentStatus:string; accountVerified:boolean; status:string; createdAt:string;
  uploadedBy:{name:string;role:string};
}
type Message = { id:string; challanId:string|null; fromRole:string; toRole:string; subject:string; body:string; read:boolean; createdAt:string; challan:{challanNumber:string;clientName:string}|null }
type Stage = { id:string; stage:string; assignedRole:string; status:string; data:string; notes:string|null; doneBy:{name:string;role:string}|null; doneAt:string|null }

export function AccountDashboard({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState('messages')
  const [refreshKey, setRefreshKey] = useState(0)
  const nav = [
    { id:'messages', label:'Messages', icon:'✉️' },
    { id:'verify', label:'Verify Payment', icon:'✅' },
    { id:'checklist', label:'Challan Checklist', icon:'📋' },
    { id:'bills', label:'E-Way / Item Bill', icon:'🧾' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              tab===n.id ? 'bg-[#3CB87A]/15 text-[#3CB87A] border-[#3CB87A]/25' : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
            }`}>
            <span className="mr-1">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>
      {tab === 'messages' && <MessagesTab onAction={() => setRefreshKey(k=>k+1)} />}
      {tab === 'verify' && <VerifyTab refreshKey={refreshKey} onChanged={() => setRefreshKey(k=>k+1)} />}
      {tab === 'checklist' && <ChecklistTab />}
      {tab === 'bills' && <BillsTab />}
    </div>
  )
}

function MessagesTab({ onAction }: { onAction: () => void }) {
  const { data, loading, refresh } = useFetch<{ messages: Message[] }>('/api/messages?role=ACCOUNT')
  const [sel, setSel] = useState<Message | null>(null)
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading messages…</div>
  if (!data) return null

  const markRead = async (m: Message) => {
    if (!m.read) { await apiPost('/api/messages', {}).catch(()=>{}); fetch('/api/messages', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:m.id})}); refresh() }
    setSel(m)
  }

  return (
    <Card className="p-4">
      <SectionTitle icon="✉️" title="Payment Notifications" sub={`${data.messages.length} messages from Sales/Owner`} />
      {data.messages.length === 0 ? <EmptyState icon="✉️" title="No messages" sub="Payment notifications will appear here" /> : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {data.messages.map((m) => (
            <button key={m.id} onClick={() => markRead(m)} className={`w-full text-left rounded-lg border p-3 transition-all hover:bg-white/5 ${
              m.read ? 'border-white/7 bg-white/[0.02]' : 'border-[#3CB87A]/20 bg-[#3CB87A]/5'
            }`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {!m.read && <span className="h-2 w-2 rounded-full bg-[#3CB87A] flex-shrink-0" />}
                  <span className="text-[12px] font-semibold text-[#EDE4D0] truncate">{m.subject}</span>
                </div>
                <span className="text-[10px] text-[#4E6180] flex-shrink-0">{fmtDate(m.createdAt)}</span>
              </div>
              <p className="text-[11px] text-[#96A8BF] line-clamp-2">{m.body}</p>
              {m.challan && <div className="text-[10px] text-[#E4AF4A] mt-1">📎 {m.challan.challanNumber} — {m.challan.clientName}</div>}
            </button>
          ))}
        </div>
      )}
      <Modal open={!!sel} onClose={() => setSel(null)} title="Message Detail">
        {sel && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase text-[#4E6180]">From</div>
              <div className="text-[12px] text-[#EDE4D0]">{sel.fromRole}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#4E6180]">Subject</div>
              <div className="text-[13px] text-[#E4AF4A] font-semibold">{sel.subject}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#4E6180]">Message</div>
              <pre className="text-[12px] text-[#EDE4D0] whitespace-pre-wrap font-sans bg-white/[0.02] rounded-lg p-3 border border-white/7">{sel.body}</pre>
            </div>
            {sel.challan && (
              <Btn variant="success" onClick={() => { onAction(); setSel(null) }}>→ Go to Verify Payment</Btn>
            )}
          </div>
        )}
      </Modal>
    </Card>
  )
}

function VerifyTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans?status=UPLOADED', [refreshKey])
  const [sel, setSel] = useState<Challan | null>(null)
  const [received, setReceived] = useState('')

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const approve = async () => {
    if (!sel) return
    await apiPost(`/api/challans/${sel.id}/verify-payment`, { verified: true, receivedAmount: Number(received) || sel.amountAdvance })
    setSel(null); setReceived(''); refresh(); onChanged()
  }

  return (
    <Card className="p-4">
      <SectionTitle icon="✅" title="Verify Advance / Full Payment" sub="Confirm bank receipt → auto-sends to Coordinator" />
      {data.challans.length === 0 ? <EmptyState icon="✅" title="No pending verifications" sub="All uploaded challans have been verified" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.challans.map((c) => (
            <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[#E4AF4A] text-[13px] font-semibold">{c.challanNumber}</span>
                <Badge label={c.paymentType} color={STATUS_COLORS[c.paymentType]} />
              </div>
              <div className="text-[13px] text-[#EDE4D0] font-medium mb-0.5">{c.clientName}</div>
              <div className="text-[11px] text-[#96A8BF] mb-2">{c.clientCity} • Expected: {fmtDate(c.expectedDeliveryDate)}</div>
              <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
                <div><div className="text-[#4E6180]">Total</div><div className="text-[#EDE4D0] font-semibold">{fmtINR(c.amountTotal)}</div></div>
                <div><div className="text-[#4E6180]">Advance</div><div className="text-[#3CB87A] font-semibold">{fmtINR(c.amountAdvance)}</div></div>
              </div>
              <Btn variant="success" size="sm" className="w-full" onClick={() => { setSel(c); setReceived(String(c.amountAdvance)) }}>✓ Verify & Approve</Btn>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title="Verify Payment">
        {sel && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
              <div className="font-mono text-[#E4AF4A] text-[13px] font-semibold mb-1">{sel.challanNumber}</div>
              <div className="text-[13px] text-[#EDE4D0]">{sel.clientName}</div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                <div><div className="text-[#4E6180]">Total</div><div className="text-[#EDE4D0]">{fmtINR(sel.amountTotal)}</div></div>
                <div><div className="text-[#4E6180]">Advance</div><div className="text-[#3CB87A]">{fmtINR(sel.amountAdvance)}</div></div>
                <div><div className="text-[#4E6180]">Remaining</div><div className="text-[#E09E3C]">{fmtINR(sel.amountTotal - sel.amountAdvance)}</div></div>
              </div>
            </div>
            <Input label="Amount Received in Bank (₹)" type="number" value={received} onChange={setReceived} required />
            <div className="rounded-lg border border-[#3CB87A]/20 bg-[#3CB87A]/5 p-3 text-[11px] text-[#3CB87A]">
              ✓ On approve, a checklist message will be sent to Coordinator with:<br/>
              • Client name, city, challan no, expected delivery<br/>
              • Packing + QC instructions for warehouse<br/>
              {Number(received) < sel.amountTotal && <span className="text-[#E09E3C]">⚠ Remaining ₹{(sel.amountTotal-Number(received)).toLocaleString('en-IN')} — will be flagged in checklist</span>}
            </div>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setSel(null)}>Cancel</Btn>
              <Btn variant="success" onClick={approve}>✓ Approve & Send to Coordinator</Btn>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  )
}

function ChecklistTab() {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans')
  const [sel, setSel] = useState<string | null>(null)
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const verified = data.challans.filter((c) => c.accountVerified)
  const selCh = verified.find((c) => c.id === sel)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="p-4 lg:col-span-1">
        <SectionTitle icon="📋" title="Verified Challans" sub={`${verified.length} verified`} />
        {verified.length === 0 ? <EmptyState icon="📋" title="None verified yet" /> : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {verified.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)} className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                sel===c.id ? 'border-[#3CB87A]/30 bg-[#3CB87A]/5' : 'border-white/7 hover:bg-white/5'
              }`}>
                <div className="font-mono text-[12px] text-[#E4AF4A]">{c.challanNumber}</div>
                <div className="text-[12px] text-[#EDE4D0]">{c.clientName}</div>
                <div className="text-[10px] text-[#96A8BF]">{c.clientCity} • {fmtINR(c.amountReceived)} received</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 lg:col-span-2">
        {selCh ? <ChecklistDetail challanId={selCh.id} /> : <EmptyState icon="👈" title="Select a challan" sub="View workflow checklist" />}
      </Card>
    </div>
  )
}

function ChecklistDetail({ challanId }: { challanId: string }) {
  const { data, loading, refresh } = useFetch<{ stages: Stage[] }>(`/api/challans/${challanId}/workflow`, [challanId])
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const accountStages = data.stages.filter((s) => s.assignedRole === 'ACCOUNT')

  const completeStage = async (stage: string) => {
    await apiPost(`/api/challans/${challanId}/workflow`, { stage, status: 'DONE', data: { completedBy: 'account' } })
    refresh()
  }

  return (
    <div>
      <SectionTitle icon="✅" title="Account Team Checklist" sub="E-way bill + Item bill generation" />
      <div className="space-y-2">
        {accountStages.map((s) => {
          const parsed = (() => { try { return JSON.parse(s.data) } catch { return {} } })()
          return (
            <div key={s.id} className={`rounded-lg border p-3 ${s.status==='DONE' ? 'border-[#3CB87A]/20 bg-[#3CB87A]/5' : 'border-white/7 bg-white/[0.02]'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={s.status==='DONE' ? 'text-[#3CB87A]' : 'text-[#96A8BF]'}>{s.status==='DONE' ? '✓' : '☐'}</span>
                  <span className="text-[13px] font-medium text-[#EDE4D0]">{STAGE_LABELS[s.stage] || s.stage}</span>
                </div>
                <Badge label={s.status} color={STATUS_COLORS[s.status]} />
              </div>
              {s.stage === 'EWAY_BILL' && (
                <div className="mt-2">
                  <Input label="E-Way Bill Number" value={parsed.ewayBillNo || ''} onChange={() => {}} placeholder="Enter e-way bill number" />
                  <div className="mt-2"><Input label="Upload E-Way Bill PDF" value={parsed.ewayBillFile || ''} onChange={() => {}} placeholder="filename.pdf" /></div>
                </div>
              )}
              {s.stage === 'ITEM_BILL' && (
                <div className="mt-2">
                  <Input label="Invoice Number" value={parsed.invoiceNo || ''} onChange={() => {}} placeholder="INV-2026-0001" />
                  <div className="mt-2"><Input label="Upload Invoice PDF" value={parsed.invoiceFile || ''} onChange={() => {}} placeholder="invoice.pdf" /></div>
                </div>
              )}
              {s.doneBy && <div className="text-[10px] text-[#4E6180] mt-1">Done by {s.doneBy.name} • {fmtDate(s.doneAt)}</div>}
              {s.status !== 'DONE' && (
                <Btn size="sm" variant="success" className="mt-2" onClick={() => completeStage(s.stage)}>Mark Done</Btn>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BillsTab() {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans')
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  return (
    <Card className="p-4">
      <SectionTitle icon="🧾" title="E-Way Bills & Item Bills" sub="Generate and upload for verified challans" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.challans.filter((c) => c.accountVerified).map((c) => (
          <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
            <div className="font-mono text-[12px] text-[#E4AF4A] mb-1">{c.challanNumber}</div>
            <div className="text-[12px] text-[#EDE4D0] mb-2">{c.clientName}</div>
            <div className="flex gap-1.5">
              <Badge label="E-Way" color={c.status==='EWAY_BILL'?'#3CB87A':'#96A8BF'} />
              <Badge label="Invoice" color={c.status==='ITEM_BILL'?'#3CB87A':'#96A8BF'} />
            </div>
          </div>
        ))}
        {data.challans.filter((c) => c.accountVerified).length === 0 && <EmptyState icon="🧾" title="No verified challans" />}
      </div>
    </Card>
  )
}
