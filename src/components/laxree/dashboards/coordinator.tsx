'use client'
import { useState } from 'react'
import { useFetch, apiPost } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, StatCard, Textarea } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, STAGE_LABELS, SessionUser } from '../types'

type Challan = {
  id:string; challanNumber:string; clientName:string; clientCity:string; clientMobile:string|null;
  expectedDeliveryDate:string|null; amountTotal:number; amountAdvance:number; amountReceived:number;
  paymentStatus:string; accountVerified:boolean; status:string;
  challanItems:{id:string;itemName:string;model:string|null;quantity:number;status:string;matchedItem:{model:string}|null}[];
}
type Message = { id:string; challanId:string|null; fromRole:string; subject:string; body:string; read:boolean; createdAt:string; challan:{challanNumber:string;clientName:string}|null }
type Stage = { id:string; stage:string; assignedRole:string; status:string; data:string; notes:string|null; doneBy:{name:string;role:string}|null; doneAt:string|null }

export function CoordinatorDashboard({ user }: { user: SessionUser }) {
  const [tab, setTab] = useState('messages')
  const nav = [
    { id:'messages', label:'Messages', icon:'✉️' },
    { id:'checklist', label:'Dispatch Checklist', icon:'📋' },
    { id:'photos', label:'Photos / Videos', icon:'📸' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              tab===n.id ? 'bg-[#9B6ED4]/15 text-[#9B6ED4] border-[#9B6ED4]/25' : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
            }`}>
            <span className="mr-1">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>
      {tab === 'messages' && <MessagesTab />}
      {tab === 'checklist' && <ChecklistTab />}
      {tab === 'photos' && <PhotosTab />}
    </div>
  )
}

function MessagesTab() {
  const { data, loading, refresh } = useFetch<{ messages: Message[] }>('/api/messages?role=COORDINATOR')
  const [sel, setSel] = useState<Message | null>(null)
  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  return (
    <Card className="p-4">
      <SectionTitle icon="✉️" title="Messages from Account Team" sub={`${data.messages.length} messages`} />
      {data.messages.length === 0 ? <EmptyState icon="✉️" title="No messages" sub="Payment-verified challans will notify you here" /> : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {data.messages.map((m) => (
            <button key={m.id} onClick={async () => {
              if (!m.read) { await fetch('/api/messages', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:m.id})}); refresh() }
              setSel(m)
            }} className={`w-full text-left rounded-lg border p-3 transition-all hover:bg-white/5 ${
              m.read ? 'border-white/7 bg-white/[0.02]' : 'border-[#9B6ED4]/20 bg-[#9B6ED4]/5'
            }`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {!m.read && <span className="h-2 w-2 rounded-full bg-[#9B6ED4] flex-shrink-0" />}
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
      <Modal open={!!sel} onClose={() => setSel(null)} title="Checklist from Account Team" wide>
        {sel && (
          <div className="space-y-3">
            <div className="text-[13px] text-[#E4AF4A] font-semibold">{sel.subject}</div>
            <pre className="text-[12px] text-[#EDE4D0] whitespace-pre-wrap font-sans bg-white/[0.02] rounded-lg p-3 border border-white/7">{sel.body}</pre>
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

  const ready = data.challans.filter((c) => c.accountVerified)
  const selCh = ready.find((c) => c.id === sel)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="p-4">
        <SectionTitle icon="📋" title="Ready for Dispatch" sub={`${ready.length} challans`} />
        {ready.length === 0 ? <EmptyState icon="📋" title="None ready" /> : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {ready.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)} className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                sel===c.id ? 'border-[#9B6ED4]/30 bg-[#9B6ED4]/5' : 'border-white/7 hover:bg-white/5'
              }`}>
                <div className="font-mono text-[12px] text-[#E4AF4A]">{c.challanNumber}</div>
                <div className="text-[12px] text-[#EDE4D0]">{c.clientName}</div>
                <div className="text-[10px] text-[#96A8BF]">{c.clientCity} • {fmtDate(c.expectedDeliveryDate)}</div>
                {c.paymentStatus === 'PARTIAL' && <div className="text-[10px] text-[#E09E3C] mt-0.5">⚠ ₹{(c.amountTotal-c.amountReceived).toLocaleString('en-IN')} pending</div>}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 lg:col-span-2">
        {selCh ? <ChecklistDetail challan={selCh} /> : <EmptyState icon="👈" title="Select a challan" sub="Complete packing, QC, vehicle arrangement" />}
      </Card>
    </div>
  )
}

function ChecklistDetail({ challan }: { challan: Challan }) {
  const { data, loading, refresh } = useFetch<{ stages: Stage[] }>(`/api/challans/${challan.id}/workflow`, [challan.id])
  const [vehicleInfo, setVehicleInfo] = useState({ vehicleNo:'', driverName:'', driverMobile:'' })

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const coordStages = data.stages.filter((s) => s.assignedRole === 'COORDINATOR')

  const complete = async (stage: string, extraData?: Record<string, unknown>) => {
    await apiPost(`/api/challans/${challan.id}/workflow`, { stage, status: 'DONE', data: extraData || {} })
    refresh()
  }

  return (
    <div>
      <SectionTitle icon="📋" title={challan.challanNumber} sub={challan.clientName} />
      
      {/* Item list for reference */}
      <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3 mb-3">
        <div className="text-[11px] text-[#96A8BF] mb-2 font-semibold">Items to Pack & Verify:</div>
        <div className="flex flex-wrap gap-1.5">
          {challan.challanItems.map((ci) => (
            <span key={ci.id} className="text-[10.5px] rounded-md bg-white/5 border border-white/7 px-2 py-1 text-[#96A8BF]">
              {ci.itemName} ×{ci.quantity}
              {ci.status === 'WRONG_MODEL' && <span className="text-[#E09E3C] ml-1">⚠model</span>}
              {ci.status === 'NOT_FOUND' && <span className="text-[#E05050] ml-1">✕</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {coordStages.map((s) => {
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

              {s.stage === 'PACKING' && s.status !== 'DONE' && (
                <div className="text-[11px] text-[#96A8BF] mt-1">Pack all items per challan. Verify quantities before sealing boxes.</div>
              )}
              {s.stage === 'QC' && s.status !== 'DONE' && (
                <div className="text-[11px] text-[#96A8BF] mt-1">Quality check: verify item models match challan. Flag any mismatch.</div>
              )}
              {s.stage === 'VEHICLE_ARRANGEMENT' && s.status !== 'DONE' && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <Input label="Vehicle No" value={vehicleInfo.vehicleNo} onChange={(v) => setVehicleInfo({...vehicleInfo, vehicleNo:v})} placeholder="RJ01 AB 1234" />
                  <Input label="Driver Name" value={vehicleInfo.driverName} onChange={(v) => setVehicleInfo({...vehicleInfo, driverName:v})} />
                  <Input label="Driver Mobile" value={vehicleInfo.driverMobile} onChange={(v) => setVehicleInfo({...vehicleInfo, driverMobile:v})} />
                </div>
              )}
              {s.doneBy && <div className="text-[10px] text-[#4E6180] mt-1">Done by {s.doneBy.name} • {fmtDate(s.doneAt)}</div>}
              {s.status !== 'DONE' && (
                <Btn size="sm" variant="success" className="mt-2" onClick={() => complete(s.stage, s.stage==='VEHICLE_ARRANGEMENT' ? vehicleInfo : {})}>Mark Done</Btn>
              )}
            </div>
          )
        })}
      </div>

      {challan.paymentStatus === 'PARTIAL' && (
        <div className="mt-3 rounded-lg border border-[#E09E3C]/30 bg-[#E09E3C]/10 p-3 text-[11px] text-[#E09E3C]">
          ⚠ Remaining payment: {fmtINR(challan.amountTotal - challan.amountReceived)} — coordinate with Account team for follow-up
        </div>
      )}
    </div>
  )
}

function PhotosTab() {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans')
  const [sel, setSel] = useState<Challan | null>(null)
  const [photos, setPhotos] = useState<Record<string, string[]>>({})

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (!data) return null

  const ready = data.challans.filter((c) => c.accountVerified)

  const upload = async () => {
    if (!sel) return
    // Group photos by item and send
    const allFiles: string[] = []
    Object.entries(photos).forEach(([item, files]) => {
      files.forEach((f) => allFiles.push(`${item}:${f}`))
    })
    if (allFiles.length === 0) { alert('Add at least one photo/video'); return }
    await apiPost(`/api/challans/${sel.id}/workflow`, { stage: 'PHOTOS_VIDEOS', status: 'DONE', data: { attachments: allFiles } })
    // Also mark DISPATCH done
    await apiPost(`/api/challans/${sel.id}/workflow`, { stage: 'DISPATCH', status: 'DONE', data: { photosUploaded: allFiles.length } })
    setSel(null); setPhotos({})
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle icon="📸" title="Upload Photos / Videos per Item" sub="Admin will verify only correct items are dispatched" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ready.map((c) => (
            <button key={c.id} onClick={() => { setSel(c); setPhotos({}) }} className="text-left rounded-lg border border-white/7 bg-white/[0.02] p-3 hover:bg-white/5">
              <div className="font-mono text-[12px] text-[#E4AF4A]">{c.challanNumber}</div>
              <div className="text-[12px] text-[#EDE4D0]">{c.clientName}</div>
              <div className="text-[10px] text-[#96A8BF] mt-1">{c.challanItems.length} items</div>
            </button>
          ))}
          {ready.length === 0 && <EmptyState icon="📸" title="No challans ready" />}
        </div>
      </Card>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Photos — ${sel.challanNumber}` : ''} wide>
        {sel && (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#9B6ED4]/20 bg-[#9B6ED4]/5 p-3 text-[11px] text-[#9B6ED4]">
              📸 Upload photos/videos for EACH item as per challan. Admin will verify that only the correct items (e.g. only MiniBar) are dispatched.
            </div>
            {sel.challanItems.map((ci) => (
              <div key={ci.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-[13px] text-[#EDE4D0] font-medium">{ci.itemName}</span>
                    <span className="text-[11px] text-[#96A8BF] ml-2">×{ci.quantity}</span>
                    {ci.model && <span className="text-[10px] text-[#4E6180] ml-2 font-mono">{ci.model}</span>}
                  </div>
                  <Badge label={ci.status.replace(/_/g,' ')} color={STATUS_COLORS[ci.status]} />
                </div>
                <div className="flex gap-2 items-end">
                  <Input label="Photo/Video filename" value={(photos[ci.itemName] || []).join(', ')} onChange={(v) => setPhotos({...photos, [ci.itemName]: v.split(',').map((s) => s.trim()).filter(Boolean)})} placeholder="minibar-1.jpg, minibar-2.jpg" />
                  <Btn size="sm" onClick={() => setPhotos({...photos, [ci.itemName]: [...(photos[ci.itemName] || []), `photo-${Date.now()}.jpg`]})}>+ Add</Btn>
                </div>
                {(photos[ci.itemName] || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(photos[ci.itemName] || []).map((f, i) => (
                      <span key={i} className="text-[10px] rounded bg-white/5 border border-white/7 px-1.5 py-0.5 text-[#96A8BF]">📎 {f}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setSel(null)}>Cancel</Btn>
              <Btn variant="gold" onClick={upload}>📤 Upload & Dispatch → Notify Support</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
