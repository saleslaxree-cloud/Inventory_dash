'use client'
import { useEffect, useRef, useState } from 'react'
import { useFetch, apiPost, apiPatch } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard, Textarea } from '../ui'
import { fmtINR, fmtDate, STATUS_COLORS, SessionUser } from '../types'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
type Challan = {
  id: string
  challanNumber: string
  clientName: string
  clientCity: string
  clientMobile: string | null
  clientLocation: string | null
  expectedDeliveryDate: string | null
  amountTotal: number
  freightAmount: number
  status: string
  dispatchDate: string | null
  trackingLink: string | null
  transporterName: string | null
  vehicleNumber: string | null
  dispatchImages: string | null
  whatsappSent: boolean
  whatsappSentAt: string | null
  emailSent: boolean
  emailSentAt: string | null
  reviewRequested: boolean
  reviewRequestedAt: string | null
  reviewReceived: string | null
  reviewRating: number | null
  reviewReceivedAt: string | null
  createdAt: string
  challanItems: { id: string; itemName: string; quantity: number }[]
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
const FIFTEEN_DAYS_AGO = () => new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)

function parseImages(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter(Boolean) : []
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
}

function Stars({ rating, size = 'sm' }: { rating: number | null; size?: 'sm' | 'md' }) {
  if (rating == null) return <span className="text-[#4E6180] text-xs">—</span>
  const cls = size === 'md' ? 'text-base' : 'text-sm'
  return (
    <span className={`font-mono tracking-tight ${cls}`}>
      <span style={{ color: '#E4AF4A' }}>{'★'.repeat(rating)}</span>
      <span style={{ color: '#3a4a5e' }}>{'★'.repeat(Math.max(0, 5 - rating))}</span>
    </span>
  )
}

function buildWhatsAppMessage(c: Challan, trackingLink: string): string {
  return `Dear ${c.clientName},

Your order has been dispatched! 🚚

Challan No: ${c.challanNumber}
Freight Amount: ${fmtINR(c.freightAmount || 0)}
Track your shipment: ${trackingLink || '[Tracking Link]'}

Thank you for choosing LaxRee Hotel Supplies.`
}

function isDispatched(c: Challan) {
  return !!c.dispatchDate || c.status === 'DISPATCHED' || c.status === 'IN_TRANSIT' || c.status === 'DELIVERED' || c.status === 'CLOSED'
}

function needsReviewRequest(c: Challan) {
  if (c.reviewRequested || c.reviewReceived) return false
  if (!c.dispatchDate) return false
  return new Date(c.dispatchDate) <= FIFTEEN_DAYS_AGO()
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-[#4E6180] text-[11px]">{label}</div>
      <div className={`col-span-2 text-[#EDE4D0] text-[12px] ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ────────────────────────────────────────────────────────────────────────────
export function SupportDashboard({ activeTab, onTabChange }: { user: SessionUser; activeTab: string; onTabChange: (id: string) => void }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'dispatch', label: 'Client Dispatch', icon: '🚚' },
    { id: 'tracking', label: 'Send Tracking', icon: '📱' },
    { id: 'review', label: 'Client Reviews', icon: '⭐' },
  ]
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => onTabChange(n.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
              activeTab === n.id
                ? 'bg-[#E09E3C]/15 text-[#E09E3C] border-[#E09E3C]/25'
                : 'text-[#96A8BF] border-white/7 hover:bg-white/5'
            }`}
          >
            <span className="mr-1">{n.icon}</span>{n.label}
          </button>
        ))}
      </div>
      {activeTab === 'dashboard' && <DashboardTab onChanged={() => setRefreshKey((k) => k + 1)} />}
      {activeTab === 'dispatch' && <DispatchTab refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />}
      {activeTab === 'tracking' && <TrackingTab refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />}
      {activeTab === 'review' && <ReviewTab refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Dashboard Tab
// ────────────────────────────────────────────────────────────────────────────
function DashboardTab({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error } = useFetch<{ challans: Challan[] }>('/api/challans')

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (error) return <div className="text-center py-10 text-[#E05050] text-sm">{error}</div>
  if (!data) return null

  const all = data.challans
  const dispatched = all.filter(isDispatched)
  const inTransit = all.filter((c) => c.status === 'IN_TRANSIT')
  const delivered = all.filter((c) => c.status === 'DELIVERED' || c.status === 'CLOSED')
  const pendingReviews = all.filter(needsReviewRequest)
  const reviewsCollected = all.filter((c) => c.reviewReceived != null)

  // recent dispatched (latest 5)
  const recentDispatched = [...dispatched]
    .sort((a, b) => new Date(b.dispatchDate || b.createdAt).getTime() - new Date(a.dispatchDate || a.createdAt).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Dispatched" value={dispatched.length} accent="#E09E3C" icon="🚚" sub="All-time dispatched" />
        <StatCard label="In Transit" value={inTransit.length} accent="#E09E3C" icon="📍" sub="Out for delivery" />
        <StatCard label="Delivered" value={delivered.length} accent="#3CB87A" icon="✅" sub="Delivered / closed" />
        <StatCard label="Pending Reviews" value={pendingReviews.length} accent="#E4AF4A" icon="⏳" sub="15+ days dispatched" />
        <StatCard label="Reviews Collected" value={reviewsCollected.length} accent="#3CB87A" icon="⭐" sub="Client feedback in" />
      </div>

      {/* Recent dispatched */}
      <Card className="p-4">
        <SectionTitle
          icon="🚚"
          title="Recent Dispatches"
          sub="Latest 5 dispatched challans — handoff from Coordinator"
          right={<Btn size="sm" variant="ghost" onClick={onChanged}>↻ Refresh</Btn>}
        />
        {recentDispatched.length === 0 ? (
          <EmptyState icon="🚚" title="No dispatches yet" sub="Dispatched challans will appear here" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentDispatched.map((c) => {
              const imgCount = parseImages(c.dispatchImages).length
              return (
                <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="font-mono text-[12px] text-[#E4AF4A]">{c.challanNumber}</div>
                    <Badge label={c.status} color={STATUS_COLORS[c.status]} />
                  </div>
                  <div className="text-[13px] text-[#EDE4D0] font-medium">{c.clientName}</div>
                  <div className="text-[11px] text-[#96A8BF]">{c.clientCity || c.clientLocation || '—'}</div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-2 text-[10.5px] text-[#4E6180]">
                    <div>Dispatched: <span className="text-[#96A8BF]">{fmtDate(c.dispatchDate)}</span></div>
                    <div>Freight: <span className="text-[#96A8BF]">{fmtINR(c.freightAmount || 0)}</span></div>
                    <div>Transporter: <span className="text-[#96A8BF]">{c.transporterName || '—'}</span></div>
                    <div>Photos: <span className="text-[#96A8BF]">{imgCount}</span></div>
                    <div>WhatsApp: <span className={c.whatsappSent ? 'text-[#3CB87A]' : 'text-[#E09E3C]'}>{c.whatsappSent ? 'Sent' : 'Pending'}</span></div>
                    <div>Email: <span className={c.emailSent ? 'text-[#3CB87A]' : 'text-[#E09E3C]'}>{c.emailSent ? 'Sent' : 'Pending'}</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Needs review request */}
      <Card className="p-4">
        <SectionTitle icon="⏳" title="Review Requests Due" sub="Dispatched 15+ days ago, no review requested yet" />
        {pendingReviews.length === 0 ? (
          <EmptyState icon="✅" title="None due yet" sub="All recent dispatches are within 15 days" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                  <th className="py-2 pr-3">Challan #</th>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Mobile</th>
                  <th className="py-2 pr-3">Dispatched</th>
                  <th className="py-2 pr-3">Days Ago</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingReviews.map((c) => {
                  const daysAgo = c.dispatchDate
                    ? Math.floor((Date.now() - new Date(c.dispatchDate).getTime()) / (24 * 60 * 60 * 1000))
                    : 0
                  return (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 text-[#E4AF4A] font-mono">{c.challanNumber}</td>
                      <td className="py-2 pr-3 text-[#EDE4D0]">{c.clientName}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{c.clientMobile || '—'}</td>
                      <td className="py-2 pr-3 text-[#96A8BF]">{fmtDate(c.dispatchDate)}</td>
                      <td className="py-2 pr-3">
                        <Badge label={`${daysAgo}d`} color="#E09E3C" />
                      </td>
                      <td className="py-2 pr-3">
                        <Badge label="Review Due" color="#E4AF4A" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Client Dispatch Tab
// ────────────────────────────────────────────────────────────────────────────
function DispatchTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  // Fetch DISPATCHED challans (just handed off) AND IN_TRANSIT (already tracked)
  const dispatchedFetch = useFetch<{ challans: Challan[] }>('/api/challans?status=DISPATCHED', [refreshKey])
  const inTransitFetch = useFetch<{ challans: Challan[] }>('/api/challans?status=IN_TRANSIT', [refreshKey])
  const [showCelebration, setShowCelebration] = useState(false)
  const [sel, setSel] = useState<Challan | null>(null)

  // Show celebration popup when newly-dispatched challans exist on tab open
  const celebratedRef = useRef(false)
  useEffect(() => {
    if (dispatchedFetch.data && dispatchedFetch.data.challans.length > 0 && !celebratedRef.current) {
      celebratedRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCelebration(true)
    }
  }, [dispatchedFetch.data])

  if (dispatchedFetch.loading || inTransitFetch.loading)
    return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>

  const newlyDispatched = dispatchedFetch.data?.challans || []
  const inTransit = inTransitFetch.data?.challans || []
  const allDispatched = [...newlyDispatched, ...inTransit]

  return (
    <div className="space-y-4">
      {/* Celebration modal — newly dispatched */}
      <Modal open={showCelebration} onClose={() => setShowCelebration(false)} title="🎉 Client Dispatched!">
        <div className="space-y-3">
          <div className="rounded-lg border border-[#3CB87A]/25 bg-[#3CB87A]/8 p-3 text-[12px] text-[#3CB87A]">
            Coordinator has dispatched {newlyDispatched.length} new {newlyDispatched.length === 1 ? 'challan' : 'challans'}!
            Please send WhatsApp tracking links and verify delivery.
          </div>
          <div className="space-y-2">
            {newlyDispatched.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-white/7 bg-white/[0.02] px-3 py-2 text-[12px]">
                <div>
                  <div className="font-mono text-[#E4AF4A]">{c.challanNumber}</div>
                  <div className="text-[#EDE4D0]">{c.clientName}</div>
                </div>
                <div className="text-right text-[10.5px] text-[#96A8BF]">
                  <div>{c.clientCity || '—'}</div>
                  <div>{fmtINR(c.freightAmount || 0)}</div>
                </div>
              </div>
            ))}
            {newlyDispatched.length > 5 && (
              <div className="text-center text-[11px] text-[#4E6180]">+ {newlyDispatched.length - 5} more below…</div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={() => setShowCelebration(false)}>Dismiss</Btn>
            <Btn variant="gold" onClick={() => setShowCelebration(false)}>Got it!</Btn>
          </div>
        </div>
      </Modal>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Newly Dispatched" value={newlyDispatched.length} accent="#E09E3C" icon="🆕" sub="Awaiting tracking link" />
        <StatCard label="In Transit" value={inTransit.length} accent="#E09E3C" icon="📍" sub="Tracking sent" />
        <StatCard label="Total Active" value={allDispatched.length} accent="#E4AF4A" icon="🚚" sub="On support's plate" />
      </div>

      {/* Newly dispatched section */}
      <Card className="p-4">
        <SectionTitle
          icon="🆕"
          title="Newly Dispatched"
          sub="Just handed off by Coordinator — send tracking link next"
          right={<Btn size="sm" variant="ghost" onClick={onChanged}>↻ Refresh</Btn>}
        />
        {newlyDispatched.length === 0 ? (
          <EmptyState icon="✅" title="No new dispatches" sub="Newly dispatched challans from Coordinator will appear here" />
        ) : (
          <DispatchList challans={newlyDispatched} onSelect={setSel} />
        )}
      </Card>

      {/* In transit section */}
      <Card className="p-4">
        <SectionTitle icon="📍" title="In Transit" sub="Tracking link already sent to client" />
        {inTransit.length === 0 ? (
          <EmptyState icon="📭" title="None in transit" sub="Once you send a tracking link, the challan moves here" />
        ) : (
          <DispatchList challans={inTransit} onSelect={setSel} />
        )}
      </Card>

      {/* Detail modal */}
      {sel && <DispatchDetailModal challan={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

function DispatchList({ challans, onSelect }: { challans: Challan[]; onSelect: (c: Challan) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {challans.map((c) => {
        const imgCount = parseImages(c.dispatchImages).length
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="text-left rounded-lg border border-white/7 bg-white/[0.02] p-3.5 hover:bg-white/5 hover:border-[#E09E3C]/25 transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-[#E4AF4A]">{c.challanNumber}</div>
                <div className="text-[14px] text-[#EDE4D0] font-medium truncate">{c.clientName}</div>
                <div className="text-[11px] text-[#96A8BF]">
                  {c.clientMobile || '—'} · {c.clientCity || '—'}
                </div>
              </div>
              <Badge label={c.status} color={STATUS_COLORS[c.status]} />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mt-2 pt-2 border-t border-white/5">
              <div>
                <span className="text-[#4E6180]">Freight: </span>
                <span className="text-[#EDE4D0]">{fmtINR(c.freightAmount || 0)}</span>
              </div>
              <div>
                <span className="text-[#4E6180]">Transporter: </span>
                <span className="text-[#EDE4D0]">{c.transporterName || '—'}</span>
              </div>
              <div>
                <span className="text-[#4E6180]">Vehicle: </span>
                <span className="text-[#EDE4D0]">{c.vehicleNumber || '—'}</span>
              </div>
              <div>
                <span className="text-[#4E6180]">Dispatched: </span>
                <span className="text-[#EDE4D0]">{fmtDate(c.dispatchDate)}</span>
              </div>
              <div>
                <span className="text-[#4E6180]">Photos: </span>
                <span className="text-[#EDE4D0]">{imgCount}</span>
              </div>
              <div>
                <span className="text-[#4E6180]">WhatsApp: </span>
                <span className={c.whatsappSent ? 'text-[#3CB87A]' : 'text-[#E09E3C]'}>{c.whatsappSent ? '✓ Sent' : '✗ Pending'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-[#4E6180]">Email: </span>
                <span className={c.emailSent ? 'text-[#3CB87A]' : 'text-[#E09E3C]'}>{c.emailSent ? '✓ Sent' : '✗ Pending'}</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function DispatchDetailModal({ challan, onClose }: { challan: Challan; onClose: () => void }) {
  const images = parseImages(challan.dispatchImages)
  return (
    <Modal open onClose={onClose} title={`Dispatch — ${challan.challanNumber}`} wide>
      <div className="space-y-4">
        <div className="rounded-lg border border-[#E09E3C]/20 bg-[#E09E3C]/5 p-3 text-[12px] text-[#E09E3C]">
          <strong>Handoff from Coordinator.</strong> Send the WhatsApp tracking link from the "Send Tracking" tab to move this to "In Transit".
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
          <Row label="Challan #" value={challan.challanNumber} mono />
          <Row label="Status" value={<Badge label={challan.status} color={STATUS_COLORS[challan.status]} />} />
          <Row label="Client" value={challan.clientName} />
          <Row label="Mobile" value={challan.clientMobile} mono />
          <Row label="City" value={challan.clientCity} />
          <Row label="Location" value={challan.clientLocation} />
          <Row label="Freight Amount" value={fmtINR(challan.freightAmount || 0)} />
          <Row label="Transporter" value={challan.transporterName} />
          <Row label="Vehicle No." value={challan.vehicleNumber} mono />
          <Row label="Dispatch Date" value={fmtDate(challan.dispatchDate)} />
          <Row
            label="WhatsApp"
            value={
              challan.whatsappSent
                ? <span className="text-[#3CB87A]">✓ Sent · {fmtDate(challan.whatsappSentAt)}</span>
                : <span className="text-[#E09E3C]">✗ Not sent</span>
            }
          />
          <Row
            label="Email"
            value={
              challan.emailSent
                ? <span className="text-[#3CB87A]">✓ Sent · {fmtDate(challan.emailSentAt)}</span>
                : <span className="text-[#E09E3C]">✗ Not sent</span>
            }
          />
          <Row label="Items" value={`${challan.challanItems.length} line items`} />
          <Row label="Total Amount" value={fmtINR(challan.amountTotal || 0)} />
        </div>

        {challan.trackingLink && (
          <div className="rounded-md border border-white/7 bg-[#0c1928] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[#4E6180] mb-1">Tracking Link</div>
            <a
              href={challan.trackingLink}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-[#3CB87A] hover:underline break-all"
            >
              {challan.trackingLink}
            </a>
          </div>
        )}

        {/* Dispatch images */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#4E6180] mb-2">Dispatch Photos ({images.length})</div>
          {images.length === 0 ? (
            <div className="text-[11px] text-[#4E6180] italic">No dispatch photos uploaded.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {images.map((src, i) => (
                <a
                  key={i}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square rounded-md overflow-hidden border border-white/7 hover:border-[#E09E3C]/40"
                >
                  <img src={src} alt={`Dispatch ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Send Tracking Tab
// ────────────────────────────────────────────────────────────────────────────
function TrackingTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, error, refresh } = useFetch<{ challans: Challan[] }>('/api/challans', [refreshKey])
  const [previewChallan, setPreviewChallan] = useState<Challan | null>(null)

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (error) return <div className="text-center py-10 text-[#E05050] text-sm">{error}</div>
  if (!data) return null

  // Pending: dispatched but WhatsApp not yet sent
  const pending = data.challans.filter((c) => c.dispatchDate && !c.whatsappSent)
  // Sent: WhatsApp already sent (read-only)
  const sent = data.challans
    .filter((c) => c.whatsappSent)
    .sort((a, b) => new Date(b.whatsappSentAt || 0).getTime() - new Date(a.whatsappSentAt || 0).getTime())

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Pending Tracking" value={pending.length} accent="#E09E3C" icon="📤" sub="Awaiting WhatsApp send" />
        <StatCard label="WhatsApp Sent" value={sent.length} accent="#3CB87A" icon="✓" sub="Tracking link delivered" />
        <StatCard label="Email Sent" value={sent.filter((c) => c.emailSent).length} accent="#E4AF4A" icon="✉️" sub="Of sent challans" />
      </div>

      {/* Pending tracking */}
      <Card className="p-4">
        <SectionTitle
          icon="📤"
          title="Send Tracking Link"
          sub="Enter the tracking URL → send via WhatsApp → mark email sent"
          right={<Btn size="sm" variant="ghost" onClick={() => { onChanged(); refresh() }}>↻ Refresh</Btn>}
        />
        {pending.length === 0 ? (
          <EmptyState icon="✅" title="All caught up!" sub="No dispatched challans are waiting for tracking links" />
        ) : (
          <div className="space-y-3">
            {pending.map((c) => (
              <TrackingCard
                key={c.id}
                challan={c}
                onPreview={() => setPreviewChallan(c)}
                onDone={() => { onChanged(); refresh() }}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Already sent */}
      <Card className="p-4">
        <SectionTitle icon="✓" title="Already Sent" sub="Tracking links already delivered to clients" />
        {sent.length === 0 ? (
          <EmptyState icon="📭" title="Nothing sent yet" sub="Sent challans will appear here" />
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] border-b border-white/7">
                  <th className="py-2 pr-3">Challan #</th>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Mobile</th>
                  <th className="py-2 pr-3">Freight</th>
                  <th className="py-2 pr-3">WhatsApp Sent</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Tracking Link</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 pr-3 text-[#E4AF4A] font-mono">{c.challanNumber}</td>
                    <td className="py-2 pr-3 text-[#EDE4D0]">{c.clientName}</td>
                    <td className="py-2 pr-3 text-[#96A8BF]">{c.clientMobile || '—'}</td>
                    <td className="py-2 pr-3 text-[#96A8BF]">{fmtINR(c.freightAmount || 0)}</td>
                    <td className="py-2 pr-3 text-[#3CB87A]">{fmtDate(c.whatsappSentAt)}</td>
                    <td className="py-2 pr-3">
                      {c.emailSent
                        ? <span className="text-[#3CB87A]">✓ {fmtDate(c.emailSentAt)}</span>
                        : <span className="text-[#E09E3C]">Pending</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {c.trackingLink
                        ? <a href={c.trackingLink} target="_blank" rel="noreferrer" className="text-[#3CB87A] hover:underline text-[11px]">Open ↗</a>
                        : <span className="text-[#4E6180]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* WhatsApp message preview modal */}
      {previewChallan && (
        <WhatsAppPreviewModal
          challan={previewChallan}
          trackingLink={previewChallan.trackingLink || ''}
          onClose={() => setPreviewChallan(null)}
        />
      )}
    </div>
  )
}

function TrackingCard({ challan, onPreview, onDone }: { challan: Challan; onPreview: () => void; onDone: () => void }) {
  const [trackingLink, setTrackingLink] = useState(challan.trackingLink || '')
  const [sending, setSending] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [err, setErr] = useState('')

  const sendWhatsApp = async () => {
    if (!trackingLink.trim()) {
      setErr('Please enter a tracking link first')
      return
    }
    setSending(true); setErr('')
    try {
      const res = await apiPost(`/api/challans/${challan.id}/whatsapp`, { trackingLink: trackingLink.trim() })
      if (res.whatsappUrl) window.open(res.whatsappUrl, '_blank')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send WhatsApp')
    } finally { setSending(false) }
  }

  const markEmail = async () => {
    setEmailing(true); setErr('')
    try {
      await apiPatch(`/api/challans/${challan.id}/whatsapp`, {})
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to mark email sent')
    } finally { setEmailing(false) }
  }

  return (
    <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[#E4AF4A]">{challan.challanNumber}</span>
            <Badge label={challan.status} color={STATUS_COLORS[challan.status]} />
          </div>
          <div className="text-[14px] text-[#EDE4D0] font-medium mt-0.5">{challan.clientName}</div>
          <div className="text-[11px] text-[#96A8BF]">
            📞 {challan.clientMobile || '—'} · 💰 {fmtINR(challan.freightAmount || 0)} · 📅 {fmtDate(challan.dispatchDate)}
          </div>
        </div>
        <Btn size="sm" variant="ghost" onClick={onPreview}>👁 Preview message</Btn>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <Input
          label="Tracking Link (URL)"
          value={trackingLink}
          onChange={setTrackingLink}
          placeholder="https://track.bluedart.com/..."
        />
        <Btn
          variant="success"
          onClick={sendWhatsApp}
          disabled={sending}
          className="md:mb-0"
        >
          {sending ? 'Sending…' : '💬 Send via WhatsApp'}
        </Btn>
        <Btn
          variant="gold"
          onClick={markEmail}
          disabled={emailing}
          className="md:mb-0"
        >
          {emailing ? 'Saving…' : '✉️ Mark Email Sent'}
        </Btn>
      </div>

      {err && <div className="mt-2 text-[11px] text-[#E05050]">⚠ {err}</div>}

      {/* Mini preview of message */}
      <details className="mt-3 group">
        <summary className="text-[11px] text-[#96A8BF] cursor-pointer hover:text-[#EDE4D0] select-none">
          📝 View WhatsApp message preview
        </summary>
        <pre className="mt-2 rounded-md border border-white/7 bg-[#0c1928] p-3 text-[11px] text-[#96A8BF] whitespace-pre-wrap font-sans leading-relaxed">
{buildWhatsAppMessage(challan, trackingLink)}
        </pre>
      </details>
    </div>
  )
}

function WhatsAppPreviewModal({ challan, trackingLink, onClose }: { challan: Challan; trackingLink: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="WhatsApp Message Preview">
      <div className="space-y-3">
        <div className="rounded-lg border border-[#3CB87A]/25 bg-[#3CB87A]/8 p-3">
          <div className="text-[11px] text-[#3CB87A] font-semibold mb-1">💬 Message that will be sent</div>
          <div className="text-[11px] text-[#96A8BF]">
            Opens WhatsApp with this pre-filled message to <span className="text-[#EDE4D0]">{challan.clientMobile || 'client'}</span>
          </div>
        </div>
        <pre className="rounded-md border border-white/7 bg-[#0c1928] p-3 text-[12px] text-[#EDE4D0] whitespace-pre-wrap font-sans leading-relaxed">
{buildWhatsAppMessage(challan, trackingLink)}
        </pre>
        <div className="flex justify-end">
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Client Reviews Tab
// ────────────────────────────────────────────────────────────────────────────
function ReviewTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, error, refresh } = useFetch<{ challans: Challan[] }>('/api/challans', [refreshKey])

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (error) return <div className="text-center py-10 text-[#E05050] text-sm">{error}</div>
  if (!data) return null

  // A. Pending review requests — dispatched 15+ days ago, review not yet requested
  const pendingRequest = data.challans.filter(needsReviewRequest)
  // B. Collect review — review requested, but no review received yet
  const collectReview = data.challans.filter((c) => c.reviewRequested && c.reviewReceived == null)
  // C. Completed reviews — review received
  const completed = data.challans
    .filter((c) => c.reviewReceived != null)
    .sort((a, b) => new Date(b.reviewReceivedAt || 0).getTime() - new Date(a.reviewReceivedAt || 0).getTime())

  const avgRating = completed.length > 0
    ? (completed.reduce((s, c) => s + (c.reviewRating || 0), 0) / completed.length).toFixed(1)
    : '—'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending Requests" value={pendingRequest.length} accent="#E09E3C" icon="📤" sub="15+ days dispatched" />
        <StatCard label="Awaiting Review" value={collectReview.length} accent="#E4AF4A" icon="⏳" sub="Requested, not received" />
        <StatCard label="Reviews Collected" value={completed.length} accent="#3CB87A" icon="⭐" sub="Client feedback in" />
        <StatCard label="Avg Rating" value={avgRating} accent="#E4AF4A" icon="📊" sub="Out of 5" />
      </div>

      {/* A. Pending review requests */}
      <Card className="p-4">
        <SectionTitle
          icon="📤"
          title="Pending Review Requests"
          sub="Dispatched 15+ days ago — request the client to share feedback"
          right={<Btn size="sm" variant="ghost" onClick={() => { onChanged(); refresh() }}>↻ Refresh</Btn>}
        />
        {pendingRequest.length === 0 ? (
          <EmptyState icon="✅" title="Nothing due" sub="No challans are 15+ days past dispatch without a review request" />
        ) : (
          <div className="space-y-2">
            {pendingRequest.map((c) => (
              <RequestReviewCard key={c.id} challan={c} onDone={() => { onChanged(); refresh() }} />
            ))}
          </div>
        )}
      </Card>

      {/* B. Collect client review */}
      <Card className="p-4">
        <SectionTitle icon="⏳" title="Collect Client Review" sub="Review requested — record the client's rating and feedback" />
        {collectReview.length === 0 ? (
          <EmptyState icon="📭" title="None awaiting" sub="Once a client shares feedback, record it here" />
        ) : (
          <div className="space-y-3">
            {collectReview.map((c) => (
              <CollectReviewCard key={c.id} challan={c} onDone={() => { onChanged(); refresh() }} />
            ))}
          </div>
        )}
      </Card>

      {/* C. Completed reviews */}
      <Card className="p-4">
        <SectionTitle icon="⭐" title="Completed Reviews" sub="All client feedback collected so far" />
        {completed.length === 0 ? (
          <EmptyState icon="⭐" title="No reviews yet" sub="Completed client reviews will appear here" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {completed.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3.5">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[12px] text-[#E4AF4A]">{c.challanNumber}</div>
                    <div className="text-[14px] text-[#EDE4D0] font-medium">{c.clientName}</div>
                    <div className="text-[11px] text-[#96A8BF]">{c.clientCity || '—'} · {fmtDate(c.reviewReceivedAt)}</div>
                  </div>
                  <Stars rating={c.reviewRating} size="md" />
                </div>
                {c.reviewReceived && (
                  <div className="rounded-md border border-white/7 bg-[#0c1928] p-2.5 text-[12px] text-[#EDE4D0] italic leading-relaxed">
                    "{c.reviewReceived}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function RequestReviewCard({ challan, onDone }: { challan: Challan; onDone: () => void }) {
  const [requesting, setRequesting] = useState(false)
  const [err, setErr] = useState('')
  const daysAgo = challan.dispatchDate
    ? Math.floor((Date.now() - new Date(challan.dispatchDate).getTime()) / (24 * 60 * 60 * 1000))
    : 0

  const request = async () => {
    setRequesting(true); setErr('')
    try {
      const res = await apiPost(`/api/challans/${challan.id}/review`, { action: 'request' })
      if (res.reviewUrl) window.open(res.reviewUrl, '_blank')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to request review')
    } finally { setRequesting(false) }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/7 bg-white/[0.02] p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-[#E4AF4A]">{challan.challanNumber}</span>
          <Badge label={`${daysAgo}d ago`} color="#E09E3C" />
        </div>
        <div className="text-[13px] text-[#EDE4D0] font-medium">{challan.clientName}</div>
        <div className="text-[11px] text-[#96A8BF]">
          📞 {challan.clientMobile || '—'} · 📅 Dispatched {fmtDate(challan.dispatchDate)}
        </div>
        {err && <div className="text-[11px] text-[#E05050] mt-1">⚠ {err}</div>}
      </div>
      <Btn variant="success" onClick={request} disabled={requesting}>
        {requesting ? 'Requesting…' : '💬 Request Review'}
      </Btn>
    </div>
  )
}

function CollectReviewCard({ challan, onDone }: { challan: Challan; onDone: () => void }) {
  const [rating, setRating] = useState('5')
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!reviewText.trim()) {
      setErr('Please enter the client\'s review text')
      return
    }
    setSubmitting(true); setErr('')
    try {
      await apiPost(`/api/challans/${challan.id}/review`, {
        action: 'submit',
        reviewText: reviewText.trim(),
        rating: Number(rating),
      })
      setReviewText('')
      setRating('5')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to submit review')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[#E4AF4A]">{challan.challanNumber}</span>
            <Badge label="Review Requested" color="#E4AF4A" />
          </div>
          <div className="text-[14px] text-[#EDE4D0] font-medium">{challan.clientName}</div>
          <div className="text-[11px] text-[#96A8BF]">
            📞 {challan.clientMobile || '—'} · Requested {fmtDate(challan.reviewRequestedAt)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[#4E6180]">Selected</div>
          <Stars rating={Number(rating)} size="md" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3">
        <Select
          label="Client Rating (1-5)"
          value={rating}
          onChange={setRating}
          options={[
            { value: '5', label: '★★★★★  Excellent' },
            { value: '4', label: '★★★★☆  Good' },
            { value: '3', label: '★★★☆☆  Average' },
            { value: '2', label: '★★☆☆☆  Poor' },
            { value: '1', label: '★☆☆☆☆  Terrible' },
          ]}
          required
        />
        <Textarea
          label="Client Review Text"
          value={reviewText}
          onChange={setReviewText}
          placeholder="What did the client say about the items, delivery, and service?"
          rows={3}
          required
        />
      </div>

      {err && <div className="mt-2 text-[11px] text-[#E05050]">⚠ {err}</div>}

      <div className="flex justify-end mt-3">
        <Btn variant="gold" onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting…' : '✓ Submit Review'}
        </Btn>
      </div>
    </div>
  )
}
