'use client'
import { useState } from 'react'
import { useFetch, apiPost, apiPatch } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard, Textarea } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, SessionUser } from '../types'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type SimpleUser = { id: string; name: string; role: string }

type ChallanItem = {
  id: string
  itemName: string
  model: string | null
  colour: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  status: string // MATCHED | NOT_FOUND | WRONG_MODEL
  stockStatus: string // AVAILABLE | ON_HOLD | WILL_BE_AVAILABLE | PENDING
  stockRemark: string | null
  expectedAvailabilityDays: number | null
  availableQty: number | null
  matchedItem: { id: string; model: string | null } | null
  // Coordinator audit
  auditStatus: string // PENDING | APPROVED | REJECTED | ON_HOLD
  auditNotes: string | null
  auditedAt: string | null
  auditedBy: SimpleUser | null
  // Warehouse workflow
  warehouseStatus: string // PENDING | QUALITY_CHECK | PACKAGING | DONE
  warehouseNotes: string | null
  warehouseDoneAt: string | null
  warehouseDoneBy: SimpleUser | null
  // Dispatch image
  dispatchImagePath: string | null
}

type Challan = {
  id: string
  challanNumber: string
  clientName: string
  clientCity: string
  clientMobile: string | null
  expectedDeliveryDate: string | null
  date: string
  createdAt: string
  amountTotal: number
  amountAdvance: number
  amountReceived: number
  paymentType: string
  paymentStatus: string
  paymentMode: string | null
  status: string // UPLOADED | PAYMENT_VERIFIED | COORDINATOR_AUDITED | WAREHOUSE_DONE | VEHICLE_ARRANGED | DISPATCHED
  accountVerified: boolean
  accountVerifiedBy: SimpleUser | null
  accountVerifiedAt: string | null
  // Coordinator
  coordinatorApproved: boolean
  coordinatorApprovedBy: SimpleUser | null
  coordinatorApprovedAt: string | null
  // Warehouse
  warehouseCompleted: boolean
  warehouseCompletedAt: string | null
  // Vehicle
  vehicleArranged: boolean
  vehicleArrangedBy: SimpleUser | null
  vehicleArrangedAt: string | null
  freightAmount: number
  transporterName: string | null
  vehicleNumber: string | null
  // Bills (uploaded by Account)
  ewayBillNo: string | null
  ewayBillFile: string | null
  invoiceNo: string | null
  invoiceFile: string | null
  billsUploadedAt: string | null
  billsUploadedBy: SimpleUser | null
  // Dispatch
  dispatchDate: string | null
  uploadedBy: SimpleUser
  challanItems: ChallanItem[]
}

// ─────────────────────────────────────────────
// Pipeline stages for Dashboard tab
// ─────────────────────────────────────────────
const PIPELINE: { key: string; label: string; icon: string }[] = [
  { key: 'UPLOADED',            label: 'Uploaded',          icon: '📤' },
  { key: 'PAYMENT_VERIFIED',    label: 'Payment Verified',  icon: '✅' },
  { key: 'COORDINATOR_AUDITED', label: 'Coordinator Audit', icon: '🔍' },
  { key: 'WAREHOUSE_DONE',      label: 'Warehouse Done',    icon: '🏭' },
  { key: 'VEHICLE_ARRANGED',    label: 'Vehicle Arranged',  icon: '🚛' },
  { key: 'DISPATCHED',          label: 'Dispatched',        icon: '📦' },
]

// ─────────────────────────────────────────────
// Main Coordinator Dashboard
// ─────────────────────────────────────────────
export function CoordinatorDashboard({ user, activeTab, onTabChange }: { user: SessionUser; activeTab: string; onTabChange: (id: string) => void }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedChallanId, setSelectedChallanId] = useState<string | null>(null)

  const triggerRefresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="space-y-4">
      {activeTab === 'dashboard' && <DashboardTab refreshKey={refreshKey} />}
      {activeTab === 'process'   && <ProcessTab onSelectChallan={(id) => { setSelectedChallanId(id); onTabChange('audit') }} />}
      {activeTab === 'audit'     && <AuditTab selectedChallanId={selectedChallanId} setSelectedChallanId={setSelectedChallanId} onChanged={triggerRefresh} />}
      {activeTab === 'warehouse' && <WarehouseTab refreshKey={refreshKey} onChanged={triggerRefresh} />}
      {activeTab === 'vehicle'   && <VehicleTab refreshKey={refreshKey} onChanged={triggerRefresh} />}
      {activeTab === 'review'    && <ReviewTab refreshKey={refreshKey} onChanged={triggerRefresh} />}
      {activeTab === 'bills'     && <BillsTab refreshKey={refreshKey} />}
    </div>
  )
}

// ─────────────────────────────────────────────
// Helper: loading & error states
// ─────────────────────────────────────────────
function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="text-center py-10 text-[#96A8BF] text-sm">{label}</div>
}

// ─────────────────────────────────────────────
// 1. Dashboard Tab — Overview + Pipeline
// ─────────────────────────────────────────────
function DashboardTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans', [refreshKey])
  if (loading) return <Loading />
  if (!data) return null

  const all = data.challans
  const toProcess    = all.filter((c) => c.accountVerified && !c.coordinatorApproved).length
  const pendingAudit = all.filter((c) => c.accountVerified && !c.coordinatorApproved).length
  const inWarehouse  = all.filter((c) => c.coordinatorApproved && !c.warehouseCompleted).length
  const readyVehicle = all.filter((c) => c.warehouseCompleted && !c.vehicleArranged).length
  const dispatched   = all.filter((c) => c.dispatchDate !== null).length

  // Count by status for pipeline
  const stageCount = (key: string) => all.filter((c) => c.status === key).length

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="To Process"      value={toProcess}    icon="📋" accent="#9B6ED4" sub="Account verified" />
        <StatCard label="Pending Audit"   value={pendingAudit} icon="🔍" accent="#E09E3C" sub="Awaiting approval" />
        <StatCard label="In Warehouse"    value={inWarehouse}  icon="🏭" accent="#E4AF4A" sub="QC + packaging" />
        <StatCard label="Ready Vehicle"   value={readyVehicle} icon="🚛" accent="#3CB87A" sub="Need arrangement" />
        <StatCard label="Dispatched"      value={dispatched}   icon="📦" accent="#9B6ED4" sub="Sent to support" />
      </div>

      {/* Pipeline visualization */}
      <Card className="p-4">
        <SectionTitle icon="📊" title="Workflow Pipeline" sub="Challans at each stage" />
        <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
          {PIPELINE.map((stage, idx) => {
            const count = stageCount(stage.key)
            const isLast = idx === PIPELINE.length - 1
            return (
              <div key={stage.key} className="flex items-stretch gap-2 flex-shrink-0">
                <div
                  className={`rounded-lg border p-3 min-w-[140px] ${
                    count > 0
                      ? 'border-[#9B6ED4]/30 bg-[#9B6ED4]/5'
                      : 'border-white/7 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base">{stage.icon}</span>
                    <span className="text-[11px] font-semibold text-[#EDE4D0]">{stage.label}</span>
                  </div>
                  <div className="font-serif text-2xl font-bold text-[#E4AF4A] leading-none">{count}</div>
                  <div className="text-[10px] text-[#4E6180] mt-1">challan{count === 1 ? '' : 's'}</div>
                </div>
                {!isLast && (
                  <div className="flex items-center text-[#4E6180] text-lg">→</div>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────
// 2. Process Challan Tab — Filters + Latest list
// ─────────────────────────────────────────────
function ProcessTab({ onSelectChallan }: { onSelectChallan: (id: string) => void }) {
  const now = new Date()
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1))
  const [year, setYear] = useState<string>(String(now.getFullYear()))
  const [employeeId, setEmployeeId] = useState<string>('')

  const { data: employeesData } = useFetch<{ users: { id: string; name: string; role: string }[] }>('/api/users?role=SALES', [])
  const url = `/api/challans?month=${month}&year=${year}`
  const { data, loading, error } = useFetch<{ challans: Challan[] }>(url, [month, year])

  const employees = employeesData?.users || []
  const challans = data?.challans || []
  const filtered = employeeId ? challans.filter((c) => c.uploadedBy?.id === employeeId) : challans

  const monthOpts = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }) }))
  const yearOpts = [2024, 2025, 2026].map((y) => ({ value: String(y), label: String(y) }))

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle icon="📋" title="Process Challans" sub="Filter by month, year, and sales employee" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select label="Month" value={month} onChange={setMonth} options={monthOpts} />
          <Select label="Year" value={year} onChange={setYear} options={yearOpts} />
          <Select
            label="Sales Employee"
            value={employeeId}
            onChange={setEmployeeId}
            options={[{ value: '', label: 'All Employees' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
          <div className="flex items-end">
            <div className="rounded-lg border border-white/7 bg-white/[0.02] px-3 py-2 text-[11px] text-[#96A8BF] w-full">
              <span className="text-[#E4AF4A] font-semibold">{filtered.length}</span> challan{filtered.length === 1 ? '' : 's'} found
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle icon="🧾" title="Latest Challans" sub="Account-verified or beyond" />
        {loading ? (
          <Loading />
        ) : error ? (
          <EmptyState icon="⚠️" title="Failed to load" sub={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="📭" title="No challans" sub="Try adjusting the filters" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3 hover:bg-white/5 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold">{c.challanNumber}</span>
                  <Badge label={c.status.replace(/_/g, ' ')} color={STATUS_COLORS[c.status] || '#96A8BF'} />
                </div>
                <div className="text-[13px] text-[#EDE4D0] font-medium mb-0.5">{c.clientName}</div>
                <div className="text-[11px] text-[#96A8BF] mb-2">{c.clientCity} • {fmtDate(c.date)}</div>
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                  <div>
                    <div className="text-[#4E6180]">Amount</div>
                    <div className="text-[#EDE4D0] font-semibold">{fmtINR(c.amountTotal)}</div>
                  </div>
                  <div>
                    <div className="text-[#4E6180]">Uploaded By</div>
                    <div className="text-[#EDE4D0]">{c.uploadedBy?.name || '—'}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/7">
                  <span className="text-[10px] text-[#96A8BF]">{c.challanItems.length} items</span>
                  {c.accountVerified && !c.coordinatorApproved ? (
                    <Btn size="sm" variant="gold" onClick={() => onSelectChallan(c.id)}>Start Audit →</Btn>
                  ) : c.coordinatorApproved && !c.warehouseCompleted ? (
                    <Btn size="sm" variant="success" onClick={() => onSelectChallan(c.id)}>Open Warehouse →</Btn>
                  ) : (
                    <Btn size="sm" onClick={() => onSelectChallan(c.id)}>View →</Btn>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────
// 3. Audit Tab — Per-item Approve / Reject / On Hold + Submit
// ─────────────────────────────────────────────
function AuditTab({
  selectedChallanId,
  setSelectedChallanId,
  onChanged,
}: {
  selectedChallanId: string | null
  setSelectedChallanId: (id: string | null) => void
  onChanged: () => void
}) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans', [selectedChallanId])
  const [submitOpen, setSubmitOpen] = useState(false)
  const [rejectModal, setRejectModal] = useState<{ itemId: string; mode: 'REJECTED' | 'ON_HOLD' } | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (loading) return <Loading />
  if (!data) return null

  // Eligible: account-verified, not yet coordinator-approved
  const eligible = data.challans.filter((c) => c.accountVerified && !c.coordinatorApproved)
  const selectedChallan = selectedChallanId
    ? data.challans.find((c) => c.id === selectedChallanId) || null
    : eligible[0] || null

  const auditItem = async (itemId: string, auditStatus: 'APPROVED' | 'REJECTED' | 'ON_HOLD', itemNotes?: string) => {
    if (!selectedChallan) return
    setBusy(true); setMsg('')
    try {
      await apiPost(`/api/challans/${selectedChallan.id}/audit`, { itemId, auditStatus, notes: itemNotes })
      setMsg(`✓ Item marked ${auditStatus}`)
      refresh(); onChanged()
    } catch (e: unknown) {
      setMsg(`✕ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setBusy(false)
      setRejectModal(null); setNotes('')
    }
  }

  const submitAudit = async () => {
    if (!selectedChallan) return
    setBusy(true)
    try {
      await apiPatch(`/api/challans/${selectedChallan.id}/audit`, {})
      setMsg('✓ Audit submitted — sent to warehouse')
      setSubmitOpen(false)
      refresh(); onChanged()
    } catch (e: unknown) {
      setMsg(`✕ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setBusy(false)
    }
  }

  if (eligible.length === 0 && !selectedChallan) {
    return (
      <Card className="p-4">
        <EmptyState icon="🔍" title="Nothing to audit" sub="All account-verified challans have been audited" />
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: challan picker */}
      <Card className="p-4 lg:col-span-1">
        <SectionTitle icon="🔍" title="Challans to Audit" sub={`${eligible.length} pending`} />
        {eligible.length === 0 ? (
          <EmptyState icon="✅" title="All audited" />
        ) : (
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
            {eligible.map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelectedChallanId(c.id); setMsg('') }}
                className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                  selectedChallan?.id === c.id ? 'border-[#9B6ED4]/30 bg-[#9B6ED4]/5' : 'border-white/7 hover:bg-white/5'
                }`}
              >
                <div className="font-mono text-[12px] text-[#E4AF4A]">{c.challanNumber}</div>
                <div className="text-[12px] text-[#EDE4D0]">{c.clientName}</div>
                <div className="text-[10px] text-[#96A8BF]">{c.clientCity} • {fmtINR(c.amountTotal)}</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Right: audit detail */}
      <Card className="p-4 lg:col-span-2">
        {selectedChallan ? (
          <AuditDetail
            challan={selectedChallan}
            busy={busy}
            msg={msg}
            onApprove={(itemId) => auditItem(itemId, 'APPROVED')}
            onReject={(itemId, mode) => { setRejectModal({ itemId, mode }); setNotes('') }}
            onSubmit={() => setSubmitOpen(true)}
          />
        ) : (
          <EmptyState icon="👈" title="Select a challan" sub="Pick from the list to begin audit" />
        )}
      </Card>

      {/* Reject / On Hold notes modal */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title={rejectModal?.mode === 'REJECTED' ? 'Reject Item' : 'Put Item On Hold'}>
        {rejectModal && (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#E05050]/20 bg-[#E05050]/5 p-3 text-[11px] text-[#E05050]">
              {rejectModal.mode === 'REJECTED'
                ? 'Rejection will permanently flag this item. Provide a clear reason.'
                : 'On-hold items will wait for further clarification. Provide context.'}
            </div>
            <Textarea label="Notes / Reason" value={notes} onChange={setNotes} placeholder="Explain why this item is being rejected or held…" required rows={4} />
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setRejectModal(null)}>Cancel</Btn>
              <Btn
                variant={rejectModal.mode === 'REJECTED' ? 'danger' : 'gold'}
                disabled={busy || !notes.trim()}
                onClick={() => auditItem(rejectModal.itemId, rejectModal.mode, notes.trim())}
              >
                {rejectModal.mode === 'REJECTED' ? '✕ Reject Item' : '⏸ Hold Item'}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Submit audit confirmation */}
      <Modal open={submitOpen} onClose={() => setSubmitOpen(false)} title="Submit Audit?">
        {selectedChallan && (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#9B6ED4]/20 bg-[#9B6ED4]/5 p-3 text-[12px] text-[#EDE4D0]">
              You are about to submit the audit for <span className="text-[#E4AF4A] font-semibold">{selectedChallan.challanNumber}</span> ({selectedChallan.clientName}).
              On submit, the challan moves to the warehouse stage.
            </div>
            {selectedChallan.challanItems.some((i) => i.auditStatus === 'REJECTED' || i.auditStatus === 'ON_HOLD') && (
              <div className="rounded-lg border border-[#E09E3C]/30 bg-[#E09E3C]/10 p-3 text-[11px] text-[#E09E3C]">
                ⚠ Some items are rejected / on-hold. They will remain flagged. Only APPROVED items proceed to warehouse.
              </div>
            )}
            <div className="text-[11px] text-[#96A8BF]">
              Are you sure? Yes / No
            </div>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setSubmitOpen(false)}>No, Cancel</Btn>
              <Btn variant="success" disabled={busy} onClick={submitAudit}>Yes, Submit Audit</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function AuditDetail({
  challan, busy, msg, onApprove, onReject, onSubmit,
}: {
  challan: Challan
  busy: boolean
  msg: string
  onApprove: (itemId: string) => void
  onReject: (itemId: string, mode: 'REJECTED' | 'ON_HOLD') => void
  onSubmit: () => void
}) {
  const items = challan.challanItems
  const allApproved = items.length > 0 && items.every((i) => i.auditStatus === 'APPROVED')
  const hasRejectedOrHeld = items.some((i) => i.auditStatus === 'REJECTED' || i.auditStatus === 'ON_HOLD')

  return (
    <div>
      <SectionTitle icon="🔍" title={challan.challanNumber} sub={challan.clientName} />

      {/* WPS Checklist header */}
      <div className="rounded-lg border border-[#9B6ED4]/20 bg-[#9B6ED4]/5 p-3 mb-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
          <div>
            <div className="text-[#4E6180]">Client</div>
            <div className="text-[#EDE4D0] font-semibold">{challan.clientName}</div>
          </div>
          <div>
            <div className="text-[#4E6180]">City</div>
            <div className="text-[#EDE4D0]">{challan.clientCity}</div>
          </div>
          <div>
            <div className="text-[#4E6180]">Mobile</div>
            <div className="text-[#EDE4D0]">{challan.clientMobile || '—'}</div>
          </div>
          <div>
            <div className="text-[#4E6180]">Expected Delivery</div>
            <div className="text-[#EDE4D0]">{fmtDate(challan.expectedDeliveryDate)}</div>
          </div>
          <div>
            <div className="text-[#4E6180]">Total Amount</div>
            <div className="text-[#E4AF4A] font-semibold">{fmtINR(challan.amountTotal)}</div>
          </div>
          <div>
            <div className="text-[#4E6180]">Received</div>
            <div className="text-[#3CB87A] font-semibold">{fmtINR(challan.amountReceived)}</div>
          </div>
          <div>
            <div className="text-[#4E6180]">Uploaded By</div>
            <div className="text-[#EDE4D0]">{challan.uploadedBy?.name || '—'}</div>
          </div>
          <div>
            <div className="text-[#4E6180]">Payment Mode</div>
            <div className="text-[#EDE4D0]">{challan.paymentMode || challan.paymentType}</div>
          </div>
        </div>
      </div>

      {/* Items audit table */}
      <div className="rounded-lg border border-white/7 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0c1928] text-[10px] uppercase tracking-wider text-[#96A8BF] font-semibold">
          <div className="col-span-4">Item</div>
          <div className="col-span-2">Qty</div>
          <div className="col-span-2">Stock</div>
          <div className="col-span-2">Audit</div>
          <div className="col-span-2 text-right">Action</div>
        </div>
        <div className="divide-y divide-white/5">
          {items.map((ci) => (
            <div key={ci.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-[11px]">
              <div className="col-span-4">
                <div className="text-[#EDE4D0] font-medium">{ci.itemName}</div>
                {(ci.model || ci.colour) && (
                  <div className="text-[10px] text-[#4E6180] font-mono">
                    {ci.model || '—'}{ci.colour ? ` • ${ci.colour}` : ''}
                  </div>
                )}
                {ci.auditNotes && (
                  <div className="text-[10px] text-[#E09E3C] mt-0.5">📝 {ci.auditNotes}</div>
                )}
              </div>
              <div className="col-span-2 text-[#EDE4D0]">
                ×{ci.quantity}
                {ci.availableQty != null && (
                  <div className="text-[10px] text-[#4E6180]">Avail: {ci.availableQty}</div>
                )}
              </div>
              <div className="col-span-2">
                <Badge label={(ci.stockStatus || 'PENDING').replace(/_/g, ' ')} color={STATUS_COLORS[ci.stockStatus] || '#96A8BF'} />
                {ci.stockRemark && <div className="text-[9px] text-[#4E6180] mt-0.5">{ci.stockRemark}</div>}
              </div>
              <div className="col-span-2">
                <Badge label={(ci.auditStatus || 'PENDING').replace(/_/g, ' ')} color={
                  ci.auditStatus === 'APPROVED' ? '#3CB87A'
                  : ci.auditStatus === 'REJECTED' ? '#E05050'
                  : ci.auditStatus === 'ON_HOLD' ? '#E09E3C'
                  : '#96A8BF'
                } />
              </div>
              <div className="col-span-2 flex justify-end gap-1">
                {ci.auditStatus === 'APPROVED' ? (
                  <span className="text-[#3CB87A] text-[11px]">✓ Approved</span>
                ) : (
                  <>
                    <Btn size="sm" variant="success" disabled={busy} onClick={() => onApprove(ci.id)}>✓</Btn>
                    <Btn size="sm" variant="danger"  disabled={busy} onClick={() => onReject(ci.id, 'REJECTED')}>✕</Btn>
                    <Btn size="sm" variant="gold"    disabled={busy} onClick={() => onReject(ci.id, 'ON_HOLD')}>⏸</Btn>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Message line */}
      {msg && (
        <div className={`mt-3 rounded-lg border p-2.5 text-[11px] ${
          msg.startsWith('✓') ? 'border-[#3CB87A]/20 bg-[#3CB87A]/5 text-[#3CB87A]' : 'border-[#E05050]/20 bg-[#E05050]/5 text-[#E05050]'
        }`}>{msg}</div>
      )}

      {/* Rejected/on-hold warning */}
      {hasRejectedOrHeld && (
        <div className="mt-3 rounded-lg border border-[#E09E3C]/30 bg-[#E09E3C]/10 p-3 text-[11px] text-[#E09E3C]">
          ⚠ Not approved items will be On Hold. Only APPROVED items proceed to warehouse.
        </div>
      )}

      {/* Submit button */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px] text-[#96A8BF]">
          {items.filter((i) => i.auditStatus === 'APPROVED').length}/{items.length} approved
          {hasRejectedOrHeld && (
            <span className="text-[#E09E3C] ml-2">• {items.filter((i) => i.auditStatus === 'REJECTED' || i.auditStatus === 'ON_HOLD').length} flagged</span>
          )}
        </div>
        <Btn variant="gold" disabled={busy || !allApproved} onClick={onSubmit}>
          ✓ Submit Audit
        </Btn>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 4. Warehouse Tab — Quality Check → Packaging → Done
// ─────────────────────────────────────────────
function WarehouseTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans?coordinatorApproved=true', [refreshKey])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (loading) return <Loading />
  if (!data) return null

  const pending = data.challans.filter((c) => c.coordinatorApproved && !c.warehouseCompleted)
  const completed = data.challans.filter((c) => c.warehouseCompleted)

  const updateWarehouse = async (challanId: string, itemId: string, warehouseStatus: 'QUALITY_CHECK' | 'PACKAGING' | 'DONE') => {
    setBusy(true); setMsg('')
    try {
      await apiPost(`/api/challans/${challanId}/warehouse`, { itemId, warehouseStatus })
      setMsg(`✓ Item moved to ${warehouseStatus.replace(/_/g, ' ')}`)
      refresh(); onChanged()
    } catch (e: unknown) {
      setMsg(`✕ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg border p-2.5 text-[11px] ${
          msg.startsWith('✓') ? 'border-[#3CB87A]/20 bg-[#3CB87A]/5 text-[#3CB87A]' : 'border-[#E05050]/20 bg-[#E05050]/5 text-[#E05050]'
        }`}>{msg}</div>
      )}

      <Card className="p-4">
        <SectionTitle icon="🏭" title="Warehouse Workflow" sub={`${pending.length} in progress • ${completed.length} completed`} />
        {pending.length === 0 ? (
          <EmptyState icon="🏭" title="Nothing in warehouse" sub="Audited challans will appear here for QC + packaging" />
        ) : (
          <div className="space-y-3">
            {pending.map((c) => {
              const doneCount = c.challanItems.filter((i) => i.warehouseStatus === 'DONE').length
              const totalCount = c.challanItems.length
              const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
              return (
                <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold">{c.challanNumber}</span>
                      <span className="text-[12px] text-[#EDE4D0] ml-2">{c.clientName}</span>
                      <span className="text-[10px] text-[#96A8BF] ml-2">{c.clientCity}</span>
                    </div>
                    <Badge label={`${doneCount}/${totalCount} done`} color={pct === 100 ? '#3CB87A' : '#E09E3C'} />
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
                    <div className="h-full bg-gradient-to-r from-[#C8922A] to-[#E4AF4A] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  {/* Items */}
                  <div className="space-y-2">
                    {c.challanItems.map((ci) => (
                      <WarehouseItemRow
                        key={ci.id}
                        challanId={c.id}
                        item={ci}
                        busy={busy}
                        onUpdate={updateWarehouse}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {completed.length > 0 && (
        <Card className="p-4">
          <SectionTitle icon="✅" title="Warehouse Completed" sub={`${completed.length} ready for vehicle arrangement`} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {completed.map((c) => (
              <div key={c.id} className="rounded-lg border border-[#3CB87A]/20 bg-[#3CB87A]/5 p-3">
                <div className="font-mono text-[12px] text-[#E4AF4A] font-semibold mb-0.5">{c.challanNumber}</div>
                <div className="text-[12px] text-[#EDE4D0]">{c.clientName}</div>
                <div className="text-[10px] text-[#96A8BF] mt-1">
                  Completed: {fmtDate(c.warehouseCompletedAt)} • {c.challanItems.length} items
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function WarehouseItemRow({
  challanId, item, busy, onUpdate,
}: {
  challanId: string
  item: ChallanItem
  busy: boolean
  onUpdate: (challanId: string, itemId: string, status: 'QUALITY_CHECK' | 'PACKAGING' | 'DONE') => void
}) {
  const stages: { key: string; label: string }[] = [
    { key: 'PENDING',       label: 'Pending' },
    { key: 'QUALITY_CHECK', label: 'QC' },
    { key: 'PACKAGING',     label: 'Packaging' },
    { key: 'DONE',          label: 'Done' },
  ]
  const currentIdx = stages.findIndex((s) => s.key === (item.warehouseStatus || 'PENDING'))

  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0">
          <span className="text-[12px] text-[#EDE4D0] font-medium">{item.itemName}</span>
          <span className="text-[11px] text-[#96A8BF] ml-2">×{item.quantity}</span>
          {item.model && <span className="text-[10px] text-[#4E6180] ml-2 font-mono">{item.model}</span>}
        </div>
        <Badge label={(item.warehouseStatus || 'PENDING').replace(/_/g, ' ')} color={
          item.warehouseStatus === 'DONE' ? '#3CB87A'
          : item.warehouseStatus === 'PACKAGING' ? '#E4AF4A'
          : item.warehouseStatus === 'QUALITY_CHECK' ? '#E09E3C'
          : '#96A8BF'
        } />
      </div>

      {/* Step tracker */}
      <div className="flex items-center gap-1 mb-2">
        {stages.map((s, idx) => (
          <div key={s.key} className="flex items-center gap-1 flex-1">
            <div className={`h-1.5 flex-1 rounded-full ${idx <= currentIdx ? 'bg-[#9B6ED4]' : 'bg-white/5'}`} />
            <span className={`text-[9px] ${idx === currentIdx ? 'text-[#9B6ED4] font-semibold' : idx < currentIdx ? 'text-[#4E6180]' : 'text-[#4E6180]/50'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <Btn size="sm" variant="ghost" disabled={busy || currentIdx >= 1} onClick={() => onUpdate(challanId, item.id, 'QUALITY_CHECK')}>
          ✓ QC
        </Btn>
        <Btn size="sm" variant="ghost" disabled={busy || currentIdx >= 2 || currentIdx < 1} onClick={() => onUpdate(challanId, item.id, 'PACKAGING')}>
          ✓ Packaging
        </Btn>
        <Btn size="sm" variant="success" disabled={busy || currentIdx >= 3 || currentIdx < 2} onClick={() => onUpdate(challanId, item.id, 'DONE')}>
          ✓ Done
        </Btn>
      </div>
      {item.warehouseDoneBy && (
        <div className="text-[10px] text-[#4E6180] mt-1.5">Done by {item.warehouseDoneBy.name} • {fmtDate(item.warehouseDoneAt)}</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 5. Vehicle Arrangement Tab
// ─────────────────────────────────────────────
function VehicleTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans', [refreshKey])
  const [form, setForm] = useState<Record<string, { freight: string; transporter: string; vehicle: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  if (loading) return <Loading />
  if (!data) return null

  const needArrangement = data.challans.filter((c) => c.warehouseCompleted && !c.vehicleArranged)
  const arranged = data.challans.filter((c) => c.vehicleArranged)

  const arrange = async (challanId: string) => {
    const f = form[challanId] || { freight: '', transporter: '', vehicle: '' }
    if (!f.freight || !f.transporter || !f.vehicle) {
      setMsg('✕ Please fill freight, transporter, and vehicle number')
      return
    }
    setBusy(challanId); setMsg('')
    try {
      await apiPost(`/api/challans/${challanId}/vehicle`, {
        freightAmount: Number(f.freight),
        transporterName: f.transporter,
        vehicleNumber: f.vehicle,
      })
      setMsg(`✓ Vehicle arranged for challan`)
      setForm({ ...form, [challanId]: { freight: '', transporter: '', vehicle: '' } })
      refresh(); onChanged()
    } catch (e: unknown) {
      setMsg(`✕ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg border p-2.5 text-[11px] ${
          msg.startsWith('✓') ? 'border-[#3CB87A]/20 bg-[#3CB87A]/5 text-[#3CB87A]' : 'border-[#E05050]/20 bg-[#E05050]/5 text-[#E05050]'
        }`}>{msg}</div>
      )}

      <Card className="p-4">
        <SectionTitle icon="🚛" title="Vehicle Arrangement" sub={`${needArrangement.length} need arrangement • ${arranged.length} arranged`} />
        {needArrangement.length === 0 ? (
          <EmptyState icon="🚛" title="None pending" sub="Warehouse-completed challans will appear here" />
        ) : (
          <div className="space-y-3">
            {needArrangement.map((c) => {
              const f = form[c.id] || { freight: '', transporter: '', vehicle: '' }
              return (
                <div key={c.id} className="rounded-lg border border-[#9B6ED4]/20 bg-[#9B6ED4]/5 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold">{c.challanNumber}</span>
                      <span className="text-[12px] text-[#EDE4D0] ml-2">{c.clientName}</span>
                      <span className="text-[10px] text-[#96A8BF] ml-2">{c.clientCity}</span>
                      {c.clientMobile && <span className="text-[10px] text-[#9B6ED4] ml-2">📞 {c.clientMobile}</span>}
                    </div>
                    <Badge label="Ready" color="#3CB87A" />
                  </div>

                  {/* Bills preview (uploaded by account) */}
                  {(c.ewayBillNo || c.invoiceNo) && (
                    <div className="rounded-md border border-white/7 bg-[#0c1928] p-2 mb-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-[#4E6180]">E-Way Bill</div>
                        <div className="text-[#EDE4D0]">{c.ewayBillNo || '—'}</div>
                        {c.ewayBillFile && <a href={`/uploads/bills/${c.ewayBillFile}`} target="_blank" rel="noreferrer" className="text-[10px] text-[#3CB87A] hover:underline">📄 View E-Way PDF</a>}
                      </div>
                      <div>
                        <div className="text-[#4E6180]">Invoice</div>
                        <div className="text-[#EDE4D0]">{c.invoiceNo || '—'}</div>
                        {c.invoiceFile && <a href={`/uploads/bills/${c.invoiceFile}`} target="_blank" rel="noreferrer" className="text-[10px] text-[#3CB87A] hover:underline">📄 View Invoice PDF</a>}
                      </div>
                    </div>
                  )}

                  {/* Items summary */}
                  <div className="text-[11px] text-[#96A8BF] mb-3">
                    {c.challanItems.length} items • {fmtINR(c.amountTotal)}
                  </div>

                  {/* Vehicle form */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input
                      label="Freight Amount (₹)"
                      type="number"
                      value={f.freight}
                      onChange={(v) => setForm({ ...form, [c.id]: { ...f, freight: v } })}
                      placeholder="5000"
                    />
                    <Input
                      label="Transporter Name"
                      value={f.transporter}
                      onChange={(v) => setForm({ ...form, [c.id]: { ...f, transporter: v } })}
                      placeholder="ABC Transport Co."
                    />
                    <Input
                      label="Vehicle Number"
                      value={f.vehicle}
                      onChange={(v) => setForm({ ...form, [c.id]: { ...f, vehicle: v } })}
                      placeholder="RJ01 AB 1234"
                    />
                  </div>
                  <div className="flex justify-end mt-2">
                    <Btn variant="gold" disabled={busy === c.id} onClick={() => arrange(c.id)}>
                      {busy === c.id ? 'Arranging…' : '🚛 Arrange Vehicle'}
                    </Btn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {arranged.length > 0 && (
        <Card className="p-4">
          <SectionTitle icon="✅" title="Already Arranged" sub={`${arranged.length} challans dispatched for vehicle`} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {arranged.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold">{c.challanNumber}</span>
                  <Badge label={c.dispatchDate ? 'Dispatched' : 'Arranged'} color={c.dispatchDate ? '#9B6ED4' : '#3CB87A'} />
                </div>
                <div className="text-[12px] text-[#EDE4D0] mb-2">
                  {c.clientName} • {c.clientCity}
                  {c.clientMobile && <span className="text-[10px] text-[#9B6ED4]"> • 📞 {c.clientMobile}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-[#4E6180]">Freight</div>
                    <div className="text-[#E4AF4A] font-semibold">{fmtINR(c.freightAmount || 0)}</div>
                  </div>
                  <div>
                    <div className="text-[#4E6180]">Transporter</div>
                    <div className="text-[#EDE4D0]">{c.transporterName || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[#4E6180]">Vehicle No</div>
                    <div className="text-[#EDE4D0] font-mono">{c.vehicleNumber || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[#4E6180]">Arranged By</div>
                    <div className="text-[#EDE4D0]">{c.vehicleArrangedBy?.name || '—'}</div>
                  </div>
                </div>
                <div className="text-[10px] text-[#4E6180] mt-2">
                  Arranged at {fmtDate(c.vehicleArrangedAt)}
                  {c.dispatchDate && <span className="text-[#9B6ED4]"> • Dispatched {fmtDate(c.dispatchDate)}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 6. Final Review Tab — Dispatch images + dispatch
// ─────────────────────────────────────────────
function ReviewTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, loading, refresh } = useFetch<{ challans: Challan[] }>('/api/challans', [refreshKey])
  const [fileInputs, setFileInputs] = useState<Record<string, string>>({})
  const [dispatchModal, setDispatchModal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (loading) return <Loading />
  if (!data) return null

  const pending = data.challans.filter((c) => c.vehicleArranged && !c.dispatchDate)

  const uploadImage = async (challanId: string, itemId: string) => {
    const path = fileInputs[itemId]?.trim()
    if (!path) { setMsg('✕ Enter a filename'); return }
    setBusy(true); setMsg('')
    try {
      await apiPatch(`/api/challans/${challanId}/warehouse`, { itemId, dispatchImagePath: path })
      setMsg('✓ Dispatch image uploaded')
      setFileInputs({ ...fileInputs, [itemId]: '' })
      refresh(); onChanged()
    } catch (e: unknown) {
      setMsg(`✕ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setBusy(false)
    }
  }

  const dispatch = async () => {
    if (!dispatchModal) return
    setBusy(true); setMsg('')
    try {
      await apiPost(`/api/challans/${dispatchModal}/dispatch`, {})
      setMsg('✓ Challan dispatched — sent to Support team')
      setDispatchModal(null)
      refresh(); onChanged()
    } catch (e: unknown) {
      setMsg(`✕ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-lg border p-2.5 text-[11px] ${
          msg.startsWith('✓') ? 'border-[#3CB87A]/20 bg-[#3CB87A]/5 text-[#3CB87A]' : 'border-[#E05050]/20 bg-[#E05050]/5 text-[#E05050]'
        }`}>{msg}</div>
      )}

      <Card className="p-4">
        <SectionTitle icon="📸" title="Final Review & Dispatch" sub={`${pending.length} awaiting dispatch images`} />
        {pending.length === 0 ? (
          <EmptyState icon="📸" title="None pending" sub="Vehicle-arranged challans will appear here" />
        ) : (
          <div className="space-y-3">
            {pending.map((c) => {
              const withImg = c.challanItems.filter((i) => i.dispatchImagePath).length
              const total = c.challanItems.length
              const allImaged = total > 0 && withImg === total
              return (
                <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold">{c.challanNumber}</span>
                      <span className="text-[12px] text-[#EDE4D0] ml-2">{c.clientName}</span>
                      <span className="text-[10px] text-[#96A8BF] ml-2">{c.clientCity}</span>
                      {c.clientMobile && <span className="text-[10px] text-[#9B6ED4] ml-2">📞 {c.clientMobile}</span>}
                    </div>
                    <Badge label={`${withImg}/${total} images`} color={allImaged ? '#3CB87A' : '#E09E3C'} />
                  </div>

                  {/* Vehicle info */}
                  <div className="rounded-md border border-white/7 bg-[#0c1928] p-2 mb-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-[#4E6180]">Transporter</div>
                      <div className="text-[#EDE4D0]">{c.transporterName || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[#4E6180]">Vehicle</div>
                      <div className="text-[#EDE4D0] font-mono">{c.vehicleNumber || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[#4E6180]">Freight</div>
                      <div className="text-[#E4AF4A] font-semibold">{fmtINR(c.freightAmount || 0)}</div>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-2">
                    {c.challanItems.map((ci) => (
                      <div key={ci.id} className="rounded-md border border-white/5 bg-white/[0.02] p-2.5">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-[12px] text-[#EDE4D0] font-medium">{ci.itemName}</span>
                            <span className="text-[11px] text-[#96A8BF] ml-2">×{ci.quantity}</span>
                            {ci.model && <span className="text-[10px] text-[#4E6180] ml-2 font-mono">{ci.model}</span>}
                          </div>
                          {ci.dispatchImagePath ? (
                            <Badge label="Image uploaded" color="#3CB87A" />
                          ) : (
                            <Badge label="No image" color="#96A8BF" />
                          )}
                        </div>
                        {ci.dispatchImagePath && (
                          <div className="text-[10px] text-[#9B6ED4] mb-1.5">📎 {ci.dispatchImagePath}</div>
                        )}
                        <div className="flex gap-2 items-end">
                          <Input
                            label="Dispatch image filename"
                            value={fileInputs[ci.id] || ''}
                            onChange={(v) => setFileInputs({ ...fileInputs, [ci.id]: v })}
                            placeholder="dispatch-item-1.jpg"
                          />
                          <Btn size="sm" variant="gold" disabled={busy} onClick={() => uploadImage(c.id, ci.id)}>
                            📤 Upload
                          </Btn>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Dispatch button */}
                  <div className="flex justify-end mt-3 pt-2 border-t border-white/7">
                    <Btn
                      variant="success"
                      disabled={busy || !allImaged}
                      onClick={() => setDispatchModal(c.id)}
                    >
                      📦 Dispatch Challan
                    </Btn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Modal open={!!dispatchModal} onClose={() => setDispatchModal(null)} title="Confirm Dispatch?">
        {dispatchModal && (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#9B6ED4]/20 bg-[#9B6ED4]/5 p-3 text-[12px] text-[#EDE4D0]">
              You are about to mark this challan as <span className="text-[#E4AF4A] font-semibold">DISPATCHED</span>.
              A message will be sent to the Support team to handle tracking and client communication.
            </div>
            <div className="text-[11px] text-[#96A8BF]">Are you sure? Yes / No</div>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setDispatchModal(null)}>No, Cancel</Btn>
              <Btn variant="success" disabled={busy} onClick={dispatch}>Yes, Dispatch</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─────────────────────────────────────────────
// 7. Latest Bills Tab — Read-only view of account bills
// ─────────────────────────────────────────────
function BillsTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans', [refreshKey])
  if (loading) return <Loading />
  if (!data) return null

  const withBills = data.challans.filter((c) => c.ewayBillNo || c.invoiceNo || c.ewayBillFile || c.invoiceFile)

  return (
    <Card className="p-4">
      <SectionTitle icon="🧾" title="Latest Bills" sub={`${withBills.length} challans with bills uploaded by Account team`} />
      {withBills.length === 0 ? (
        <EmptyState icon="🧾" title="No bills uploaded" sub="E-way bills and item bills uploaded by the Account team will appear here" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {withBills.map((c) => (
            <div key={c.id} className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold">{c.challanNumber}</span>
                <Badge label={c.status.replace(/_/g, ' ')} color={STATUS_COLORS[c.status] || '#96A8BF'} />
              </div>
              <div className="text-[12px] text-[#EDE4D0] mb-2">{c.clientName} • {c.clientCity}</div>

              <div className="space-y-2 text-[11px]">
                {/* E-Way Bill */}
                <div className="rounded-md border border-white/7 bg-[#0c1928] p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#4E6180] uppercase tracking-wide text-[10px] font-semibold">E-Way Bill</span>
                    {c.ewayBillNo ? <Badge label="✓ Uploaded" color="#3CB87A" /> : <Badge label="—" color="#96A8BF" />}
                  </div>
                  {c.ewayBillNo && (
                    <div className="text-[#EDE4D0] mt-1">No: <span className="font-mono">{c.ewayBillNo}</span></div>
                  )}
                  {c.ewayBillFile && (
                    <a href={`/uploads/bills/${c.ewayBillFile}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[#3CB87A] hover:underline mt-0.5">📄 View E-Way PDF</a>
                  )}
                </div>

                {/* Invoice */}
                <div className="rounded-md border border-white/7 bg-[#0c1928] p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#4E6180] uppercase tracking-wide text-[10px] font-semibold">Item Bill / Invoice</span>
                    {c.invoiceNo ? <Badge label="✓ Uploaded" color="#3CB87A" /> : <Badge label="—" color="#96A8BF" />}
                  </div>
                  {c.invoiceNo && (
                    <div className="text-[#EDE4D0] mt-1">No: <span className="font-mono">{c.invoiceNo}</span></div>
                  )}
                  {c.invoiceFile && (
                    <a href={`/uploads/bills/${c.invoiceFile}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[#3CB87A] hover:underline mt-0.5">📄 View Invoice PDF</a>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-[#4E6180] mt-2 pt-2 border-t border-white/7">
                Uploaded by {c.billsUploadedBy?.name || '—'} • {fmtDate(c.billsUploadedAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
