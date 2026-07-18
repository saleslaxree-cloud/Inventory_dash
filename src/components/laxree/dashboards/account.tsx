'use client'
import { useMemo, useState } from 'react'
import { apiPost, useFetch } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, StatCard, Textarea } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, SessionUser } from '../types'

/* ================================================================== */
/* Types — full challan shape returned by /api/challans               */
/* ================================================================== */

type ChallanItem = {
  id: string
  category: string | null
  itemName: string
  itemNumber: string | null
  model: string | null
  colour: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  status: string
  stockStatus: string
}

type Challan = {
  id: string
  challanNumber: string
  quotationNumber: string | null
  clientName: string
  clientCity: string
  clientMobile: string | null
  expectedDeliveryDate: string | null
  // Billing & shipping
  billingName: string | null
  billingAddress: string | null
  shippingAddress: string | null
  gstNumber: string | null
  // Financial breakdown
  amountWithoutGst: number
  amountWithGst: number
  gstPercentage: number
  amountTotal: number
  amountAdvance: number
  amountReceived: number
  packingCharge: number
  paymentType: string
  paymentStatus: string
  paymentMode: string | null
  // Account verification
  accountVerified: boolean
  accountVerifiedAt: string | null
  accountVerifiedBy: { name: string; role: string } | null
  accountRejected: boolean
  accountRejectReason: string | null
  // E-way / invoice bills
  ewayBillNo: string | null
  ewayBillFile: string | null
  invoiceNo: string | null
  invoiceFile: string | null
  billsUploadedAt: string | null
  billsUploadedBy: { name: string; role: string } | null
  // Meta
  status: string
  createdAt: string
  uploadedBy: { name: string; role: string }
  challanItems: ChallanItem[]
}

const ACCOUNT_ACCENT = '#3CB87A'

/* ================================================================== */
/* Main dashboard                                                     */
/* ================================================================== */

export function AccountDashboard({ user, activeTab }: {
  user: SessionUser
  activeTab: string
  onTabChange: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      {activeTab === 'dashboard' && <DashboardTab user={user} />}
      {activeTab === 'pending'   && <PendingTab user={user} />}
      {activeTab === 'partial'   && <PartialTab />}
      {activeTab === 'fullpaid'  && <FullPaidTab />}
      {activeTab === 'bills'     && <BillsTab user={user} />}
    </div>
  )
}

/* ================================================================== */
/* 1. Dashboard Tab — overview with StatCards + attention list         */
/* ================================================================== */

function DashboardTab({ user }: { user: SessionUser }) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans')

  const stats = useMemo(() => {
    const all = data?.challans || []
    const pending    = all.filter((c) => !c.accountVerified && !c.accountRejected && c.status === 'UPLOADED')
    const partial    = all.filter((c) => c.paymentStatus === 'PARTIAL' && c.accountVerified)
    const fullPaid   = all.filter((c) => c.paymentStatus === 'PAID' && c.accountVerified)
    const totalAmt   = all.reduce((s, c) => s + (c.amountTotal || 0), 0)
    const totalRecv  = all.reduce((s, c) => s + (c.amountReceived || 0), 0)
    return { all, pending, partial, fullPaid, totalAmt, totalRecv }
  }, [data])

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading dashboard…</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      {/* Welcome banner */}
      <Card className="p-4">
        <SectionTitle icon="👋" title={`Welcome, ${user.name}`} sub="Account Team — verify payments, generate e-way & item bills" right={<Btn size="sm" onClick={refresh}>↻ Refresh</Btn>} />
      </Card>

      {/* StatCards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Challans"     value={stats.all.length}                       sub="All time"          accent={ACCOUNT_ACCENT} icon="📦" />
        <StatCard label="Pending Approval"   value={stats.pending.length}                   sub="Awaiting verify"   accent="#E09E3C"        icon="⏳" />
        <StatCard label="Partial Paid"       value={stats.partial.length}                   sub="Balance due"       accent="#E09E3C"        icon="🔶" />
        <StatCard label="Full Paid"          value={stats.fullPaid.length}                  sub="Completed"         accent={ACCOUNT_ACCENT} icon="✅" />
        <StatCard label="Total Amount"       value={fmtINR(stats.totalAmt)}                 sub="Invoiced value"    accent="#E4AF4A"        icon="💰" />
        <StatCard label="Total Received"     value={fmtINR(stats.totalRecv)}                sub="Bank receipts"     accent={ACCOUNT_ACCENT} icon="🏦" />
      </div>
    </div>
  )
}

/* ================================================================== */
/* 2. Pending Approval Tab — full details + approve / reject          */
/* ================================================================== */

function PendingTab({ user }: { user: SessionUser }) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans?status=UPLOADED')

  const [approveSel, setApproveSel] = useState<Challan | null>(null)
  const [rejectSel, setRejectSel]   = useState<Challan | null>(null)
  const [received, setReceived]     = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState('')

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading pending approvals…</div>
  if (!data) return null

  // Pending = status UPLOADED + not verified + not rejected
  const pending = data.challans.filter((c) => !c.accountVerified && !c.accountRejected)

  const openApprove = (c: Challan) => {
    setApproveSel(c)
    setReceived(String(c.amountAdvance || 0))
    setErr('')
  }

  const submitApprove = async () => {
    if (!approveSel) return
    const amt = Number(received)
    if (!amt || amt <= 0) { setErr('Enter a valid amount received in bank'); return }
    setSaving(true); setErr('')
    try {
      await apiPost(`/api/challans/${approveSel.id}/verify-payment`, { verified: true, receivedAmount: amt })
      setApproveSel(null); setReceived('')
      refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to approve')
    } finally { setSaving(false) }
  }

  const submitReject = async () => {
    if (!rejectSel) return
    if (!rejectReason.trim()) { setErr('Reject reason is required'); return }
    setSaving(true); setErr('')
    try {
      await apiPost(`/api/challans/${rejectSel.id}/verify-payment`, { verified: false, rejectReason: rejectReason.trim() })
      setRejectSel(null); setRejectReason('')
      refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to reject')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle
          icon="⏳"
          title="Pending Payment Approval"
          sub={`${pending.length} challan(s) uploaded by Sales — verify bank receipt & approve`}
          right={<Btn size="sm" onClick={refresh}>↻ Refresh</Btn>}
        />
        {pending.length === 0 ? (
          <EmptyState icon="✅" title="Nothing pending" sub="All uploaded challans have been verified" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {pending.map((c) => (
              <PendingChallanCard
                key={c.id}
                challan={c}
                approverName={user.name}
                onApprove={() => openApprove(c)}
                onReject={() => { setRejectSel(c); setRejectReason(''); setErr('') }}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Approve modal */}
      <Modal open={!!approveSel} onClose={() => setApproveSel(null)} title="Approve Payment" wide>
        {approveSel && (
          <div className="space-y-4">
            <ChallanFullDetail challan={approveSel} />

            <div className="rounded-lg border border-[#3CB87A]/20 bg-[#3CB87A]/5 p-3">
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div><div className="text-[#4E6180]">Total</div><div className="text-[#EDE4D0] font-semibold">{fmtINR(approveSel.amountTotal)}</div></div>
                <div><div className="text-[#4E6180]">Advance</div><div className="text-[#3CB87A] font-semibold">{fmtINR(approveSel.amountAdvance)}</div></div>
                <div><div className="text-[#4E6180]">Remaining</div><div className="text-[#E09E3C] font-semibold">{fmtINR(approveSel.amountTotal - Number(received || approveSel.amountAdvance))}</div></div>
              </div>
            </div>

            <Input label="Amount Received in Bank (₹)" type="number" value={received} onChange={setReceived} required />

            {Number(received) < approveSel.amountTotal && (
              <div className="rounded-lg border border-[#E09E3C]/30 bg-[#E09E3C]/10 px-3 py-2 text-[11px] text-[#E09E3C]">
                ⚠ Partial payment — remaining {fmtINR(approveSel.amountTotal - Number(received))} will be flagged as PARTIAL & sent to Coordinator for follow-up.
              </div>
            )}
            {Number(received) >= approveSel.amountTotal && (
              <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-2 text-[11px] text-[#3CB87A]">
                ✓ Full payment received — challan will be marked PAID & sent to Coordinator.
              </div>
            )}

            {err && <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>}

            <div className="flex justify-end gap-2">
              <Btn onClick={() => setApproveSel(null)}>Cancel</Btn>
              <Btn variant="success" onClick={submitApprove} disabled={saving}>
                {saving ? 'Approving…' : '✓ Approve & Send to Coordinator'}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject modal */}
      <Modal open={!!rejectSel} onClose={() => setRejectSel(null)} title="Reject Payment">
        {rejectSel && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
              <div className="font-mono text-[#E4AF4A] text-[13px] font-semibold">{rejectSel.challanNumber}</div>
              <div className="text-[13px] text-[#EDE4D0]">{rejectSel.clientName}</div>
              <div className="text-[11px] text-[#96A8BF]">Total {fmtINR(rejectSel.amountTotal)} · Advance {fmtINR(rejectSel.amountAdvance)}</div>
            </div>
            <Textarea label="Reject Reason" value={rejectReason} onChange={setRejectReason} placeholder="e.g. Payment not received in bank / amount mismatch…" required rows={4} />
            <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-[11px] text-[#E05050]">
              ⚠ Challan will be sent back to Sales ({rejectSel.uploadedBy?.name || 'Sales'}) with the reason above.
            </div>
            {err && <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setRejectSel(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={submitReject} disabled={saving}>
                {saving ? 'Rejecting…' : '✕ Reject & Send Back to Sales'}
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* Full detail card used in Pending + reused where useful */
function PendingChallanCard({ challan: c, approverName, onApprove, onReject }: {
  challan: Challan
  approverName: string
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className="rounded-lg border border-white/7 bg-white/[0.02] p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[14px] font-bold text-[#E4AF4A]">{c.challanNumber}</span>
            {c.quotationNumber && <span className="text-[10px] text-[#96A8BF]">Quote: {c.quotationNumber}</span>}
          </div>
          <div className="text-[13px] text-[#EDE4D0] font-medium mt-0.5">{c.clientName}</div>
          <div className="text-[11px] text-[#96A8BF]">{c.clientCity} · Uploaded by {c.uploadedBy?.name || '—'}</div>
        </div>
        <Badge label={c.paymentMode || c.paymentType} color={STATUS_COLORS[c.paymentMode || c.paymentType] || STATUS_COLORS[c.paymentStatus]} />
      </div>

      {/* Billing + shipping */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] mb-3">
        <DetailRow label="Billing Name"    value={c.billingName || c.clientName} />
        <DetailRow label="GST Number"      value={c.gstNumber || '—'} />
        <DetailRow label="Billing Address" value={c.billingAddress || '—'} />
        <DetailRow label="Shipping Address" value={c.shippingAddress || '—'} />
        <DetailRow label="Expected Delivery" value={fmtDate(c.expectedDeliveryDate)} />
        <DetailRow label="Mobile"           value={c.clientMobile || '—'} />
      </div>

      {/* Financial breakdown */}
      <div className="rounded-lg border border-white/7 bg-[#0c1928] p-3 mb-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          <Money label="Amount (no GST)"  value={c.amountWithoutGst} />
          <Money label={`GST @ ${c.gstPercentage}%`} value={c.amountWithGst - c.amountWithoutGst} />
          <Money label="Amount + GST"     value={c.amountWithGst} />
          <Money label="Packing Charge"   value={c.packingCharge} />
          <Money label="Total Amount"     value={c.amountTotal} accent={ACCOUNT_ACCENT} />
          <Money label="Advance Paid"     value={c.amountAdvance} accent={ACCOUNT_ACCENT} />
          <Money label="Remaining"        value={c.amountTotal - c.amountAdvance} accent="#E09E3C" />
          <Money label="Payment Mode"     valueStr={c.paymentMode || '—'} />
        </div>
      </div>

      {/* Items */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-[#4E6180] font-semibold mb-1.5">Items ({c.challanItems.length})</div>
        <div className="rounded-lg border border-white/7 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-white/[0.03] text-[#96A8BF]">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Item</th>
                <th className="text-left px-2 py-1.5 font-medium">Model</th>
                <th className="text-right px-2 py-1.5 font-medium">Qty</th>
                <th className="text-right px-2 py-1.5 font-medium">Unit Price</th>
                <th className="text-right px-2 py-1.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="text-[#EDE4D0]">
              {c.challanItems.map((it) => (
                <tr key={it.id} className="border-t border-white/5">
                  <td className="px-2 py-1.5">{it.itemName}{it.itemNumber && <span className="text-[#4E6180]"> · #{it.itemNumber}</span>}</td>
                  <td className="px-2 py-1.5 text-[#96A8BF]">{it.model || '—'}</td>
                  <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                  <td className="px-2 py-1.5 text-right">{fmtINR(it.unitPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{fmtINR(it.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Btn variant="success" size="sm" className="flex-1" onClick={onApprove}>✓ Approve Payment</Btn>
        <Btn variant="danger"  size="sm" onClick={onReject}>✕ Reject</Btn>
      </div>
      <div className="text-[10px] text-[#4E6180] mt-2">
        On approve: sent to Coordinator by <span className="text-[#96A8BF]">{approverName}</span> at <span className="text-[#96A8BF]">{new Date().toLocaleString('en-IN')}</span>
      </div>
    </div>
  )
}

/* Full-detail block used inside approve modal */
function ChallanFullDetail({ challan: c }: { challan: Challan }) {
  return (
    <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
      <div className="font-mono text-[#E4AF4A] text-[13px] font-semibold mb-2">{c.challanNumber} {c.quotationNumber && <span className="text-[#96A8BF] text-[11px]">· Quote: {c.quotationNumber}</span>}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
        <DetailRow label="Client Name"      value={c.clientName} />
        <DetailRow label="Billing Name"     value={c.billingName || c.clientName} />
        <DetailRow label="Client City"      value={c.clientCity} />
        <DetailRow label="GST Number"       value={c.gstNumber || '—'} />
        <DetailRow label="Billing Address"  value={c.billingAddress || '—'} />
        <DetailRow label="Shipping Address" value={c.shippingAddress || '—'} />
        <DetailRow label="Expected Delivery" value={fmtDate(c.expectedDeliveryDate)} />
        <DetailRow label="Uploaded By"      value={c.uploadedBy?.name || '—'} />
      </div>
    </div>
  )
}

/* ================================================================== */
/* 3. Partial Paid Tab — outstanding balances + WhatsApp follow-up    */
/* ================================================================== */

function PartialTab() {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans')

  const partials = useMemo(() => {
    const all = data?.challans || []
    return all
      .filter((c) => c.paymentStatus === 'PARTIAL' && c.accountVerified)
      .map((c) => {
        const verifiedAt = c.accountVerifiedAt ? new Date(c.accountVerifiedAt) : null
        const daysSince = verifiedAt ? Math.floor((Date.now() - verifiedAt.getTime()) / (1000 * 60 * 60 * 24)) : 0
        return { challan: c, daysSince }
      })
      .sort((a, b) => b.daysSince - a.daysSince)
  }, [data])

  const totalRemaining = partials.reduce((s, p) => s + (p.challan.amountTotal - p.challan.amountReceived), 0)
  const totalReceived  = partials.reduce((s, p) => s + p.challan.amountReceived, 0)

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading partial payments…</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Partial Challans" value={partials.length}       sub="Awaiting balance"   accent="#E09E3C" icon="🔶" />
        <StatCard label="Total Received"   value={fmtINR(totalReceived)} sub="From partials"      accent={ACCOUNT_ACCENT} icon="🏦" />
        <StatCard label="Total Remaining"  value={fmtINR(totalRemaining)} sub="Outstanding"       accent="#E05050" icon="⏳" />
        <StatCard label="Avg Aging"        value={partials.length ? Math.round(partials.reduce((s,p)=>s+p.daysSince,0)/partials.length) + 'd' : '0d'} sub="Since verification" accent="#E09E3C" icon="📅" />
      </div>

      <Card className="p-4">
        <SectionTitle
          icon="🔶"
          title="Partial Paid Challans"
          sub="Verified challans with outstanding balance — follow up via WhatsApp"
          right={<Btn size="sm" onClick={refresh}>↻ Refresh</Btn>}
        />
        {partials.length === 0 ? (
          <EmptyState icon="✅" title="No partial payments" sub="All verified challans are fully paid" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {partials.map(({ challan: c, daysSince }) => (
              <PartialCard key={c.id} challan={c} daysSince={daysSince} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function PartialCard({ challan: c, daysSince }: { challan: Challan; daysSince: number }) {
  const remaining = c.amountTotal - c.amountReceived

  const waLink = () => {
    const phone = (c.clientMobile || '').replace(/\D/g, '')
    const msg = `Dear ${c.billingName || c.clientName},

This is a gentle reminder from Laxree regarding the pending payment for challan ${c.challanNumber}.

Payment Summary:
• Total Amount: ${fmtINR(c.amountTotal)}
• Received: ${fmtINR(c.amountReceived)}
• Remaining Balance: ${fmtINR(remaining)}

Kindly arrange the balance payment at your earliest convenience. For any queries, please reply to this message.

Thank you for your business!`
    return phone
      ? `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
  }

  const agingColor = daysSince > 14 ? '#E05050' : daysSince > 7 ? '#E09E3C' : ACCOUNT_ACCENT

  return (
    <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold text-[#E4AF4A]">{c.challanNumber}</div>
          <div className="text-[13px] text-[#EDE4D0] truncate">{c.clientName} · {c.clientCity}</div>
          <div className="text-[10px] text-[#96A8BF]">
            Verified by {c.accountVerifiedBy?.name || 'Account'} · {fmtDate(c.accountVerifiedAt)}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: `${agingColor}22`, color: agingColor, border: `1px solid ${agingColor}33` }}
        >
          {daysSince}d aging
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] mb-3">
        <div><div className="text-[#4E6180]">Total</div><div className="text-[#EDE4D0] font-semibold">{fmtINR(c.amountTotal)}</div></div>
        <div><div className="text-[#4E6180]">Received</div><div className="text-[#3CB87A] font-semibold">{fmtINR(c.amountReceived)}</div></div>
        <div><div className="text-[#4E6180]">Remaining</div><div className="text-[#E05050] font-bold text-[13px]">{fmtINR(remaining)}</div></div>
      </div>

      <div className="flex gap-2">
        <Btn
          variant="gold"
          size="sm"
          className="flex-1"
          onClick={() => window.open(waLink(), '_blank', 'noopener,noreferrer')}
        >
          📱 Follow Up (WhatsApp)
        </Btn>
        {!c.clientMobile && <span className="text-[10px] text-[#E09E3C] self-center">No mobile</span>}
      </div>
    </div>
  )
}

/* ================================================================== */
/* 4. Full Paid Tab — completed payments                              */
/* ================================================================== */

function FullPaidTab() {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans')

  const fullPaid = useMemo(() => {
    const all = data?.challans || []
    return all
      .filter((c) => c.paymentStatus === 'PAID' && c.accountVerified)
      .sort((a, b) => (b.accountVerifiedAt || '').localeCompare(a.accountVerifiedAt || ''))
  }, [data])

  const totalReceived = fullPaid.reduce((s, c) => s + c.amountReceived, 0)

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading completed payments…</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Full Paid Challans" value={fullPaid.length}        sub="Completed"      accent={ACCOUNT_ACCENT} icon="✅" />
        <StatCard label="Total Received"     value={fmtINR(totalReceived)}  sub="All settled"    accent={ACCOUNT_ACCENT} icon="💰" />
        <StatCard label="Bills Uploaded"     value={fullPaid.filter((c) => !!c.ewayBillNo && !!c.invoiceNo).length} sub="E-Way + Invoice" accent="#E4AF4A" icon="🧾" />
      </div>

      <Card className="p-4">
        <SectionTitle
          icon="✅"
          title="Full Paid Challans"
          sub="Completed payments — bank receipt verified"
          right={<Btn size="sm" onClick={refresh}>↻ Refresh</Btn>}
        />
        {fullPaid.length === 0 ? (
          <EmptyState icon="✅" title="No completed payments yet" sub="Verified & fully paid challans will appear here" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {fullPaid.map((c) => <FullPaidCard key={c.id} challan={c} />)}
          </div>
        )}
      </Card>
    </div>
  )
}

function FullPaidCard({ challan: c }: { challan: Challan }) {
  const hasEway   = !!c.ewayBillNo || !!c.ewayBillFile
  const hasInvoice = !!c.invoiceNo || !!c.invoiceFile

  return (
    <div className="rounded-lg border border-[#3CB87A]/15 bg-[#3CB87A]/[0.03] p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold text-[#E4AF4A]">{c.challanNumber}</div>
          <div className="text-[13px] text-[#EDE4D0] truncate">{c.clientName} · {c.clientCity}</div>
          <div className="text-[10px] text-[#96A8BF]">
            Approved by {c.accountVerifiedBy?.name || 'Account'} at {fmtDate(c.accountVerifiedAt)} {c.accountVerifiedAt && new Date(c.accountVerifiedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <Badge label="PAID" color={STATUS_COLORS.PAID} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
        <div><div className="text-[#4E6180]">Total Amount</div><div className="text-[#EDE4D0] font-semibold">{fmtINR(c.amountTotal)}</div></div>
        <div><div className="text-[#4E6180]">Received</div><div className="text-[#3CB87A] font-semibold">{fmtINR(c.amountReceived)}</div></div>
        <div><div className="text-[#4E6180]">Billing Name</div><div className="text-[#EDE4D0] truncate">{c.billingName || c.clientName}</div></div>
        <div><div className="text-[#4E6180]">GST Number</div><div className="text-[#EDE4D0] truncate">{c.gstNumber || '—'}</div></div>
      </div>

      <div className="flex items-center gap-1.5">
        <Badge label={hasEway ? 'E-Way ✓' : 'E-Way ✗'}    color={hasEway ? ACCOUNT_ACCENT : '#4E6180'} />
        <Badge label={hasInvoice ? 'Invoice ✓' : 'Invoice ✗'} color={hasInvoice ? ACCOUNT_ACCENT : '#4E6180'} />
      </div>
    </div>
  )
}

/* ================================================================== */
/* 5. E-Way / Item Bill Tab — upload bills per verified challan        */
/* ================================================================== */

function BillsTab({ user }: { user: SessionUser }) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans?accountVerified=true')

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading verified challans…</div>
  if (!data) return null

  const verified = data.challans

  return (
    <Card className="p-4">
      <SectionTitle
        icon="🧾"
        title="E-Way Bills & Item Bills"
        sub={`${verified.length} verified challan(s) — generate / upload bills`}
        right={<Btn size="sm" onClick={refresh}>↻ Refresh</Btn>}
      />
      {verified.length === 0 ? (
        <EmptyState icon="🧾" title="No verified challans" sub="Approve a payment first to enable bill upload" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {verified.map((c) => (
            <BillsCard key={c.id} challan={c} user={user} onSaved={refresh} />
          ))}
        </div>
      )}
    </Card>
  )
}

function BillsCard({ challan: c, user, onSaved }: { challan: Challan; user: SessionUser; onSaved: () => void }) {
  const [ewayNo, setEwayNo]       = useState(c.ewayBillNo || '')
  const [invNo, setInvNo]         = useState(c.invoiceNo || '')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const [ok, setOk]               = useState('')
  // PDF upload state (per type)
  const [ewayFile, setEwayFile]   = useState(c.ewayBillFile || '')
  const [invFile, setInvFile]     = useState(c.invoiceFile || '')
  const [ewayUploading, setEwayUploading] = useState(false)
  const [invUploading, setInvUploading]   = useState(false)
  const [ewayErr, setEwayErr]     = useState('')
  const [invErr, setInvErr]       = useState('')

  const hasEway    = !!ewayNo || !!ewayFile
  const hasInvoice = !!invNo || !!invFile

  // Upload PDF file to the server
  const uploadPdf = async (type: 'eway' | 'invoice', file: File) => {
    if (type === 'eway') { setEwayErr(''); setEwayUploading(true) }
    else { setInvErr(''); setInvUploading(true) }
    try {
      const fd = new FormData()
      fd.append('type', type)
      fd.append('file', file)
      const res = await fetch(`/api/challans/${c.id}/bills/upload`, { method: 'POST', body: fd })
      const text = await res.text()
      const data = text ? JSON.parse(text) : null
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      if (type === 'eway') { setEwayFile(data.filename); setOk('E-Way bill PDF uploaded') }
      else { setInvFile(data.filename); setOk('Invoice PDF uploaded') }
      onSaved()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      if (type === 'eway') setEwayErr(msg); else setInvErr(msg)
    } finally {
      if (type === 'eway') setEwayUploading(false); else setInvUploading(false)
    }
  }

  const save = async () => {
    setErr(''); setOk('')
    if (!ewayNo && !invNo && !ewayFile && !invFile) {
      setErr('Enter at least one bill number or upload a PDF')
      return
    }
    setSaving(true)
    try {
      await apiPost(`/api/challans/${c.id}/bills`, {
        ewayBillNo: ewayNo || undefined,
        ewayBillFile: ewayFile || undefined,
        invoiceNo: invNo || undefined,
        invoiceFile: invFile || undefined,
      })
      setOk('Bill numbers saved successfully')
      onSaved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold text-[#E4AF4A]">{c.challanNumber}</div>
          <div className="text-[13px] text-[#EDE4D0] truncate">{c.clientName} · {c.clientCity}</div>
          <div className="text-[10px] text-[#96A8BF]">
            Total {fmtINR(c.amountTotal)} · Paid {fmtINR(c.amountReceived)} · {c.paymentStatus}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge label={hasEway ? 'E-Way ✓' : 'E-Way ✗'}    color={hasEway ? ACCOUNT_ACCENT : '#4E6180'} />
          <Badge label={hasInvoice ? 'Invoice ✓' : 'Invoice ✗'} color={hasInvoice ? ACCOUNT_ACCENT : '#4E6180'} />
        </div>
      </div>

      {/* Two-column bill upload: E-Way | Invoice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        {/* E-Way Bill column */}
        <div className="rounded-lg border border-white/7 bg-[#0c1928] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#E4AF4A] font-semibold mb-2">🚚 E-Way Bill</div>
          <Input label="E-Way Bill Number" value={ewayNo} onChange={setEwayNo} placeholder="EWB-000000000" />
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4E6180] mb-1">PDF File</div>
            {ewayUploading ? (
              <div className="flex items-center gap-2 text-[11px] text-[#E09E3C] py-2"><span className="animate-spin">⏳</span> Uploading…</div>
            ) : ewayFile ? (
              <div className="space-y-1.5">
                <a href={`/uploads/bills/${ewayFile}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#3CB87A] hover:underline">📄 View PDF</a>
                <label className="block cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-center text-[10px] text-[#96A8BF] hover:border-[#3CB87A]/30 hover:text-[#3CB87A] transition-all">
                  Replace PDF
                  <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdf('eway', f); e.target.value = '' }} />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-[11px] text-[#96A8BF] hover:border-[#3CB87A]/30 hover:text-[#3CB87A] transition-all">
                <span>📤</span> Upload E-Way PDF
                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdf('eway', f); e.target.value = '' }} />
              </label>
            )}
            {ewayErr && <div className="text-[10px] text-[#E05050] mt-1">✗ {ewayErr}</div>}
          </div>
        </div>

        {/* Invoice column */}
        <div className="rounded-lg border border-white/7 bg-[#0c1928] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#E4AF4A] font-semibold mb-2">🧾 Item Bill / Invoice</div>
          <Input label="Invoice Number" value={invNo} onChange={setInvNo} placeholder="INV-2026-0001" />
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wider text-[#4E6180] mb-1">PDF File</div>
            {invUploading ? (
              <div className="flex items-center gap-2 text-[11px] text-[#E09E3C] py-2"><span className="animate-spin">⏳</span> Uploading…</div>
            ) : invFile ? (
              <div className="space-y-1.5">
                <a href={`/uploads/bills/${invFile}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#3CB87A] hover:underline">📄 View PDF</a>
                <label className="block cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-center text-[10px] text-[#96A8BF] hover:border-[#3CB87A]/30 hover:text-[#3CB87A] transition-all">
                  Replace PDF
                  <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdf('invoice', f); e.target.value = '' }} />
                </label>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-[11px] text-[#96A8BF] hover:border-[#3CB87A]/30 hover:text-[#3CB87A] transition-all">
                <span>📤</span> Upload Invoice PDF
                <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdf('invoice', f); e.target.value = '' }} />
              </label>
            )}
            {invErr && <div className="text-[10px] text-[#E05050] mt-1">✗ {invErr}</div>}
          </div>
        </div>
      </div>

      {/* Footer info */}
      {c.billsUploadedAt && c.billsUploadedBy && (
        <div className="text-[10px] text-[#4E6180] mb-2">
          Last uploaded by <span className="text-[#96A8BF]">{c.billsUploadedBy.name}</span> at <span className="text-[#96A8BF]">{fmtDate(c.billsUploadedAt)} {new Date(c.billsUploadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}

      {err && <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050] mb-2">{err}</div>}
      {ok && <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-2 text-xs text-[#3CB87A] mb-2">✓ {ok}</div>}

      <Btn variant="success" size="sm" className="w-full" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : '💾 Save Bill Numbers'}
      </Btn>
      <div className="text-[10px] text-[#4E6180] mt-2 text-center">
        PDFs upload instantly. Bill numbers saved by <span className="text-[#96A8BF]">{user.name}</span>
      </div>
    </div>
  )
}

/* ================================================================== */
/* Small shared helpers                                               */
/* ================================================================== */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase text-[#4E6180] tracking-wide">{label}</div>
      <div className="text-[12px] text-[#EDE4D0] break-words">{value}</div>
    </div>
  )
}

function Money({ label, value, valueStr, accent }: { label: string; value?: number; valueStr?: string; accent?: string }) {
  return (
    <div>
      <div className="text-[#4E6180] text-[10px] uppercase tracking-wide">{label}</div>
      <div className="font-semibold" style={{ color: accent || '#EDE4D0' }}>
        {valueStr !== undefined ? valueStr : fmtINR(value || 0)}
      </div>
    </div>
  )
}
