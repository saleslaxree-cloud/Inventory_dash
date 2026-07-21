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
  // Special dispatch approval (partial-payment bypass)
  specialDispatchRequested: boolean
  specialDispatchRequestedAt: string | null
  specialDispatchReason: string | null
  specialDispatchApproved: boolean
  specialDispatchApprovedAt: string | null
  specialDispatchRejected: boolean
  specialDispatchRejectedAt: string | null
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
      {activeTab === 'reports'   && <ReportsTab refreshKey={refreshKey} />}
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
      const submittedNo = selectedChallan.challanNumber
      const submittedClient = selectedChallan.clientName
      await apiPatch(`/api/challans/${selectedChallan.id}/audit`, {})
      // Auto-advance: clear selection so the next eligible challan loads
      setSelectedChallanId(null)
      setMsg(`✓ ${submittedNo} (${submittedClient}) audited & sent to warehouse — moved out of audit queue`)
      setSubmitOpen(false)
      refresh(); onChanged()
      // Auto-clear the success toast after a few seconds so the new challan's UI is clean
      setTimeout(() => setMsg(''), 6000)
    } catch (e: unknown) {
      setMsg(`✕ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setBusy(false)
    }
  }

  if (eligible.length === 0 && !selectedChallan) {
    return (
      <div className="space-y-4">
        {msg && (
          <div className={`rounded-lg border p-3 text-[12px] ${
            msg.startsWith('✓') ? 'border-[#3CB87A]/30 bg-[#3CB87A]/10 text-[#3CB87A]' : 'border-[#E05050]/30 bg-[#E05050]/10 text-[#E05050]'
          }`}>{msg}</div>
        )}
        <Card className="p-4">
          <EmptyState icon="✅" title="All audited" sub="All account-verified challans have been audited — nothing left in the audit queue" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Prominent success / error toast — stays visible across auto-advance */}
      {msg && (
        <div className={`rounded-lg border p-3 text-[12px] font-medium animate-in fade-in slide-in-from-top-2 ${
          msg.startsWith('✓')
            ? 'border-[#3CB87A]/30 bg-gradient-to-r from-[#3CB87A]/10 to-transparent text-[#3CB87A]'
            : 'border-[#E05050]/30 bg-gradient-to-r from-[#E05050]/10 to-transparent text-[#E05050]'
        }`}>
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: challan picker */}
      <Card className="p-4 lg:col-span-1">
        <SectionTitle icon="🔍" title="Challans to Audit" sub={`${eligible.length} pending`} />
        {eligible.length === 0 ? (
          <EmptyState icon="✅" title="All audited" sub="Queue is empty" />
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

      {/* Summary header — totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="In Progress"   value={pending.length}   icon="🏭" accent="#E09E3C" sub="Audited, awaiting QC + packaging" />
        <StatCard label="Completed"     value={completed.length} icon="✅" accent="#3CB87A" sub="Ready for vehicle arrangement" />
        <StatCard label="Items In QC"   value={pending.reduce((s, c) => s + c.challanItems.filter((i) => i.warehouseStatus === 'QUALITY_CHECK').length, 0)} icon="🔬" accent="#9B6ED4" sub="Currently in quality check" />
        <StatCard label="Items Packing" value={pending.reduce((s, c) => s + c.challanItems.filter((i) => i.warehouseStatus === 'PACKAGING').length, 0)} icon="📦" accent="#E4AF4A" sub="Currently being packed" />
      </div>

      <Card className="p-4">
        <SectionTitle icon="🏭" title="Warehouse Workflow" sub="Only audited challans appear here — once all items are DONE, the challan moves to Vehicle Arrangement" />
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
          <SectionTitle icon="✅" title="Warehouse Completed" sub={`${completed.length} ready for vehicle arrangement — moves to Vehicle tab`} />
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
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between mb-3">
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

      {/* Polished horizontal stepper — circles + connectors + checkmarks */}
      <div className="flex items-start mb-3 px-1">
        {stages.map((s, idx) => {
          const isComplete = idx < currentIdx
          const isCurrent  = idx === currentIdx
          const isLast     = idx === stages.length - 1
          return (
            <div key={s.key} className={`flex items-start ${isLast ? 'flex-shrink-0' : 'flex-1'}`}>
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold border-2 transition-all ${
                    isComplete
                      ? 'bg-[#3CB87A] border-[#3CB87A] text-[#07101f] shadow-[0_0_12px_rgba(60,184,122,0.45)]'
                      : isCurrent
                        ? 'bg-[#9B6ED4]/15 border-[#9B6ED4] text-[#9B6ED4] shadow-[0_0_12px_rgba(155,110,212,0.45)]'
                        : 'bg-white/5 border-white/10 text-[#4E6180]'
                  }`}
                >
                  {isComplete ? '✓' : idx + 1}
                </div>
                <span className={`text-[9.5px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                  isComplete ? 'text-[#3CB87A]' : isCurrent ? 'text-[#9B6ED4]' : 'text-[#4E6180]'
                }`}>{s.label}</span>
              </div>
              {/* Connector line — horizontally aligned with circle center */}
              {!isLast && (
                <div className="flex-1 h-0.5 mx-1 self-start mt-[17px] rounded-full overflow-hidden bg-white/10">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isComplete ? 'bg-[#3CB87A] w-full' : isCurrent ? 'bg-gradient-to-r from-[#9B6ED4] to-[#9B6ED4]/30 w-full' : 'w-0'
                    }`}
                  />
                </div>
              )}
            </div>
          )
        })}
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
// Payment-gate helpers & components (partial-payment → special-dispatch workflow)
// ─────────────────────────────────────────────

/** A challan can be dispatched (vehicle arranged / finally dispatched) only when
 *  the payment is fully received OR the Owner has explicitly approved a special
 *  dispatch for the pending balance. */
function canDispatch(challan: Challan): boolean {
  if (challan.paymentStatus === 'PAID') return true
  if (challan.specialDispatchApproved) return true
  return false
}

type SpecialDispatchState = 'initial' | 'awaiting' | 'approved' | 'rejected'

function getSpecialDispatchState(c: Challan): SpecialDispatchState {
  if (c.specialDispatchApproved) return 'approved'
  if (c.specialDispatchRejected) return 'rejected'
  if (c.specialDispatchRequested) return 'awaiting'
  return 'initial'
}

function SpecialApprovalModal({
  open, onClose, challan, onSuccess,
}: {
  open: boolean
  onClose: () => void
  challan: Challan
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const balance = challan.amountTotal - challan.amountReceived

  const submit = async () => {
    if (!reason.trim()) { setError('Please provide a clear reason for the Owner'); return }
    setBusy(true); setError('')
    try {
      await apiPost(`/api/challans/${challan.id}/special-dispatch`, { reason: reason.trim() })
      setReason('')
      onSuccess()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send request')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🚨 Request Special Dispatch Approval">
      <div className="space-y-3">
        {/* Urgent context */}
        <div className="rounded-lg border border-[#E05050]/30 bg-gradient-to-r from-[#E05050]/10 to-transparent p-3 text-[11px]">
          <div className="text-[#E05050] font-semibold mb-1.5">⚠ Urgent approval required from Owner</div>
          <div className="text-[#EDE4D0] space-y-0.5">
            <div><span className="text-[#96A8BF]">Challan:</span> <span className="font-mono text-[#E4AF4A]">{challan.challanNumber}</span></div>
            <div><span className="text-[#96A8BF]">Client:</span> {challan.clientName} • {challan.clientCity}</div>
            <div><span className="text-[#96A8BF]">Total:</span> <span className="text-[#E4AF4A] font-semibold">{fmtINR(challan.amountTotal)}</span></div>
            <div><span className="text-[#96A8BF]">Received:</span> <span className="text-[#3CB87A] font-semibold">{fmtINR(challan.amountReceived)}</span></div>
            <div><span className="text-[#96A8BF]">Balance pending:</span> <span className="text-[#E05050] font-semibold">{fmtINR(balance)}</span></div>
          </div>
        </div>

        <div className="text-[11px] text-[#96A8BF]">
          Submitting this will pop up an <span className="text-[#E05050] font-semibold">URGENT</span> notification to the Owner
          with this challan&apos;s overview. Dispatch stays blocked until the Owner approves.
        </div>

        <Textarea
          label="Reason for special dispatch"
          value={reason}
          onChange={setReason}
          placeholder="e.g. Client is a long-term partner and has committed to pay the balance within 7 days. Dispatch needed urgently for site deadline."
          required
          rows={4}
        />

        {error && (
          <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 p-2.5 text-[11px] text-[#E05050]">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="danger" disabled={busy || !reason.trim()} onClick={submit}>
            {busy ? 'Sending…' : '🚨 Send Request to Owner'}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Renders the partial-payment warning banner + the special-approval UI.
 * Returns null when the challan is fully paid (no gate needed).
 * The parent uses `canDispatch(challan)` to enable/disable its own action button.
 */
function PartialPaymentGate({ challan, onChanged }: { challan: Challan; onChanged: () => void }) {
  const [modalOpen, setModalOpen] = useState(false)

  // Fully paid → no gate
  if (challan.paymentStatus === 'PAID') return null

  const balance = challan.amountTotal - challan.amountReceived
  const state = getSpecialDispatchState(challan)

  return (
    <>
      {/* Always-visible warning banner while payment is partial */}
      <div className="rounded-lg border border-[#E09E3C]/40 bg-gradient-to-r from-[#E09E3C]/15 via-[#E09E3C]/5 to-transparent p-3 mb-3">
        <div className="flex items-start gap-2.5">
          <span className="text-lg leading-none mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-[#E09E3C] font-semibold mb-0.5">
              Partial payment is still pending — {fmtINR(balance)} remaining.
            </div>
            <div className="text-[11px] text-[#EDE4D0]">
              Dispatch requires <span className="text-[#E4AF4A] font-semibold">full payment</span> or
              <span className="text-[#9B6ED4] font-semibold"> special Owner approval</span>.
            </div>
          </div>
        </div>
      </div>

      {/* State-specific panel */}
      {state === 'initial' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Option 1: special approval */}
          <button
            onClick={() => setModalOpen(true)}
            className="text-left rounded-lg border border-[#9B6ED4]/30 bg-[#9B6ED4]/5 hover:bg-[#9B6ED4]/10 hover:border-[#9B6ED4]/50 transition-all p-3 group"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-7 h-7 rounded-full bg-[#9B6ED4]/15 flex items-center justify-center text-[13px]">🚨</span>
              <span className="text-[12px] text-[#9B6ED4] font-semibold group-hover:underline">Process on Special Approval</span>
            </div>
            <div className="text-[11px] text-[#96A8BF]">
              Sends an urgent popup to the Owner with this challan&apos;s overview. Dispatch stays blocked until approved.
            </div>
          </button>
          {/* Option 2: wait for full payment */}
          <div className="rounded-lg border border-[#E4AF4A]/25 bg-[#E4AF4A]/5 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-7 h-7 rounded-full bg-[#E4AF4A]/15 flex items-center justify-center text-[13px]">💰</span>
              <span className="text-[12px] text-[#E4AF4A] font-semibold">Approve Full Payment</span>
            </div>
            <div className="text-[11px] text-[#96A8BF]">
              Waiting for full payment verification by the Account team. The challan will be auto-unblocked once
              <span className="text-[#3CB87A]"> PAID</span>.
            </div>
          </div>
        </div>
      )}

      {state === 'awaiting' && (
        <div className="rounded-lg border border-[#E09E3C]/40 bg-[#E09E3C]/10 p-3 mb-3 flex items-start gap-2.5">
          <span className="text-lg leading-none mt-0.5 animate-pulse">⏳</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-[#E09E3C] font-semibold mb-0.5">
              Awaiting Owner approval — special dispatch request sent
            </div>
            <div className="text-[11px] text-[#EDE4D0]">
              Requested {fmtDate(challan.specialDispatchRequestedAt)}.
              {challan.specialDispatchReason && (
                <span className="block text-[10px] text-[#96A8BF] mt-1 italic">&ldquo;{challan.specialDispatchReason}&rdquo;</span>
              )}
            </div>
          </div>
          <Badge label="Pending" color="#E09E3C" />
        </div>
      )}

      {state === 'approved' && (
        <div className="rounded-lg border border-[#3CB87A]/40 bg-[#3CB87A]/10 p-3 mb-3 flex items-start gap-2.5">
          <span className="text-lg leading-none mt-0.5">✅</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-[#3CB87A] font-semibold mb-0.5">
              Special dispatch approved by Owner — you may proceed
            </div>
            <div className="text-[11px] text-[#EDE4D0]">
              Approved {fmtDate(challan.specialDispatchApprovedAt)}. Balance of {fmtINR(balance)} remains pending but Owner has authorised dispatch.
            </div>
          </div>
          <Badge label="Approved" color="#3CB87A" />
        </div>
      )}

      {state === 'rejected' && (
        <div className="rounded-lg border border-[#E05050]/40 bg-[#E05050]/10 p-3 mb-3 flex items-start gap-2.5">
          <span className="text-lg leading-none mt-0.5">🚫</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-[#E05050] font-semibold mb-0.5">
              Special dispatch rejected by Owner — dispatch blocked
            </div>
            <div className="text-[11px] text-[#EDE4D0]">
              Rejected {fmtDate(challan.specialDispatchRejectedAt)}. Please resolve the pending balance
              ({fmtINR(balance)}) with the Account team, or contact the Owner directly.
            </div>
          </div>
          <Badge label="Rejected" color="#E05050" />
        </div>
      )}

      <SpecialApprovalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        challan={challan}
        onSuccess={() => { onChanged(); setModalOpen(false) }}
      />
    </>
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
        <SectionTitle icon="🚛" title="Vehicle Arrangement" sub="Only warehouse-completed challans appear here. Partial-payment challans need Owner approval before vehicle arrangement." />
        {needArrangement.length === 0 ? (
          <EmptyState icon="🚛" title="None pending" sub="Warehouse-completed challans will appear here" />
        ) : (
          <div className="space-y-3">
            {needArrangement.map((c) => {
              const f = form[c.id] || { freight: '', transporter: '', vehicle: '' }
              const dispatchAllowed = canDispatch(c)
              return (
                <div key={c.id} className={`rounded-lg border p-3 ${dispatchAllowed ? 'border-[#9B6ED4]/20 bg-[#9B6ED4]/5' : 'border-[#E09E3C]/30 bg-[#E09E3C]/[0.03]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold">{c.challanNumber}</span>
                      <span className="text-[12px] text-[#EDE4D0] ml-2">{c.clientName}</span>
                      <span className="text-[10px] text-[#96A8BF] ml-2">{c.clientCity}</span>
                      {c.clientMobile && <span className="text-[10px] text-[#9B6ED4] ml-2">📞 {c.clientMobile}</span>}
                    </div>
                    {dispatchAllowed
                      ? <Badge label="Ready" color="#3CB87A" />
                      : <Badge label="Payment Gate" color="#E09E3C" />}
                  </div>

                  {/* Partial-payment gate — warning + special-approval options.
                      Returns null when challan is fully paid. */}
                  <PartialPaymentGate challan={c} onChanged={() => { refresh(); onChanged() }} />

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
                    {!dispatchAllowed && (
                      <span className="text-[#E09E3C] ml-2">• balance {fmtINR(c.amountTotal - c.amountReceived)} pending</span>
                    )}
                  </div>

                  {/* Vehicle form — inputs still editable but action is gated */}
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
                  <div className="flex items-center justify-end gap-2 mt-2">
                    {!dispatchAllowed && (
                      <span className="text-[10px] text-[#E09E3C]">🔒 Resolve payment or get Owner approval to arrange vehicle</span>
                    )}
                    <Btn
                      variant="gold"
                      disabled={busy === c.id || !dispatchAllowed}
                      onClick={() => arrange(c.id)}
                    >
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
        <SectionTitle icon="📸" title="Final Review & Dispatch" sub="Vehicle-arranged challans awaiting dispatch images. Partial-payment challans need Owner approval before final dispatch." />
        {pending.length === 0 ? (
          <EmptyState icon="📸" title="None pending" sub="Vehicle-arranged challans will appear here" />
        ) : (
          <div className="space-y-3">
            {pending.map((c) => {
              const withImg = c.challanItems.filter((i) => i.dispatchImagePath).length
              const total = c.challanItems.length
              const allImaged = total > 0 && withImg === total
              const dispatchAllowed = canDispatch(c)
              return (
                <div key={c.id} className={`rounded-lg border p-3 ${dispatchAllowed ? 'border-white/7 bg-white/[0.02]' : 'border-[#E09E3C]/30 bg-[#E09E3C]/[0.03]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold">{c.challanNumber}</span>
                      <span className="text-[12px] text-[#EDE4D0] ml-2">{c.clientName}</span>
                      <span className="text-[10px] text-[#96A8BF] ml-2">{c.clientCity}</span>
                      {c.clientMobile && <span className="text-[10px] text-[#9B6ED4] ml-2">📞 {c.clientMobile}</span>}
                    </div>
                    {dispatchAllowed
                      ? <Badge label={`${withImg}/${total} images`} color={allImaged ? '#3CB87A' : '#E09E3C'} />
                      : <Badge label="Payment Gate" color="#E09E3C" />}
                  </div>

                  {/* Partial-payment gate — warning + special-approval options.
                      Returns null when challan is fully paid. */}
                  <PartialPaymentGate challan={c} onChanged={() => { refresh(); onChanged() }} />

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

                  {/* Dispatch button — gated by both image upload AND payment */}
                  <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-white/7">
                    {!dispatchAllowed && (
                      <span className="text-[10px] text-[#E09E3C]">🔒 Resolve payment or get Owner approval before dispatch</span>
                    )}
                    {!allImaged && dispatchAllowed && (
                      <span className="text-[10px] text-[#E09E3C]">📷 Upload all dispatch images first</span>
                    )}
                    <Btn
                      variant="success"
                      disabled={busy || !allImaged || !dispatchAllowed}
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

// ─────────────────────────────────────────────
// CSV download helper
// ─────────────────────────────────────────────
function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadFromUrl(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  a.target = '_self'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ─────────────────────────────────────────────
// 8. Reports Tab — Audit / Dispatched / Bills / Full Export
// ─────────────────────────────────────────────
function ReportsTab({ refreshKey }: { refreshKey: number }) {
  const { data, loading } = useFetch<{ challans: Challan[] }>('/api/challans', [refreshKey])
  const [section, setSection] = useState<'audit' | 'dispatched' | 'bills' | 'full'>('audit')

  // Full-export period controls
  const now = new Date()
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly')
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1))
  const [year, setYear] = useState<string>(String(now.getFullYear()))

  if (loading) return <Loading />
  if (!data) return null

  const all = data.challans
  const audited = all.filter((c) => c.coordinatorApproved)
  const dispatched = all.filter((c) => c.dispatchDate !== null)
  const withBills = all.filter((c) => c.ewayBillNo || c.invoiceNo)

  const monthOpts = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' }),
  }))
  const yearOpts = [2024, 2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }))

  const exportAuditCsv = () => {
    const rows: (string | number | null | undefined)[][] = [
      ['Laxree IMS — Coordinator Audit Report'],
      ['Generated', new Date().toLocaleString('en-IN')],
      ['Total Audited Challans', audited.length],
      [],
      ['Sl.No', 'Challan No', 'Client Name', 'Client City', 'Audit Date', 'Audited By', 'Item Count', 'Approved', 'Rejected/On-Hold', 'Amount Total', 'Amount Received'],
    ]
    audited.forEach((c, i) => {
      const items = c.challanItems
      const approved = items.filter((it) => it.auditStatus === 'APPROVED').length
      const flagged = items.filter((it) => it.auditStatus === 'REJECTED' || it.auditStatus === 'ON_HOLD').length
      rows.push([
        i + 1, c.challanNumber, c.clientName, c.clientCity,
        c.coordinatorApprovedAt ? new Date(c.coordinatorApprovedAt).toLocaleDateString('en-IN') : '',
        c.coordinatorApprovedBy?.name || '—',
        items.length, approved, flagged,
        c.amountTotal, c.amountReceived,
      ])
    })
    downloadCsv(`Laxree_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const exportDispatchedCsv = () => {
    const rows: (string | number | null | undefined)[][] = [
      ['Laxree IMS — Dispatched Challans Report'],
      ['Generated', new Date().toLocaleString('en-IN')],
      ['Total Dispatched', dispatched.length],
      [],
      ['Sl.No', 'Challan No', 'Client Name', 'Client City', 'Dispatch Date', 'Vehicle Number', 'Transporter', 'Freight', 'Item Count', 'Amount Total'],
    ]
    dispatched.forEach((c, i) => {
      rows.push([
        i + 1, c.challanNumber, c.clientName, c.clientCity,
        c.dispatchDate ? new Date(c.dispatchDate).toLocaleDateString('en-IN') : '',
        c.vehicleNumber || '',
        c.transporterName || '',
        c.freightAmount || 0,
        c.challanItems.length,
        c.amountTotal,
      ])
    })
    downloadCsv(`Laxree_Dispatched_Report_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const exportBillsCsv = () => {
    const rows: (string | number | null | undefined)[][] = [
      ['Laxree IMS — Bills Report'],
      ['Generated', new Date().toLocaleString('en-IN')],
      ['Total Challans with Bills', withBills.length],
      [],
      ['Sl.No', 'Challan No', 'Client Name', 'Client City', 'E-Way Bill No', 'Invoice No', 'Uploaded By', 'Uploaded At'],
    ]
    withBills.forEach((c, i) => {
      rows.push([
        i + 1, c.challanNumber, c.clientName, c.clientCity,
        c.ewayBillNo || '',
        c.invoiceNo || '',
        c.billsUploadedBy?.name || '—',
        c.billsUploadedAt ? new Date(c.billsUploadedAt).toLocaleDateString('en-IN') : '',
      ])
    })
    downloadCsv(`Laxree_Bills_Report_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const exportFullCsv = () => {
    const params = new URLSearchParams()
    params.set('role', 'COORDINATOR')
    params.set('period', period)
    if (period === 'monthly') { params.set('month', month); params.set('year', year) }
    if (period === 'yearly')  { params.set('year', year) }
    downloadFromUrl(`/api/reports/export?${params.toString()}`)
  }

  const sections = [
    { key: 'audit' as const,      label: 'Audit Report',      icon: '🔍', count: audited.length,    color: '#9B6ED4' },
    { key: 'dispatched' as const, label: 'Dispatched',        icon: '🚚', count: dispatched.length, color: '#3CB87A' },
    { key: 'bills' as const,      label: 'Bills',             icon: '🧾', count: withBills.length,  color: '#E4AF4A' },
    { key: 'full' as const,       label: 'Full Report',       icon: '📑', count: all.length,        color: '#E09E3C' },
  ]

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Audited"        value={audited.length}    icon="🔍" accent="#9B6ED4" sub="Coordinator approved" />
        <StatCard label="Dispatched"     value={dispatched.length} icon="🚚" accent="#3CB87A" sub="Sent to support" />
        <StatCard label="With Bills"     value={withBills.length}  icon="🧾" accent="#E4AF4A" sub="E-way / invoice" />
        <StatCard label="Total Challans" value={all.length}        icon="📑" accent="#E09E3C" sub="All time" />
      </div>

      {/* Sub-section switcher */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12px] font-medium transition-all ${
                section === s.key
                  ? 'border-transparent text-[#07101f]'
                  : 'border-white/10 bg-white/5 text-[#96A8BF] hover:bg-white/10 hover:text-[#EDE4D0]'
              }`}
              style={section === s.key ? { background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)` } : undefined}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  background: section === s.key ? 'rgba(7,16,31,0.25)' : `${s.color}22`,
                  color: section === s.key ? '#07101f' : s.color,
                }}
              >{s.count}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* ── Audit sub-section ── */}
      {section === 'audit' && (
        <Card className="p-4">
          <SectionTitle
            icon="🔍"
            title="Audit Report"
            sub={`${audited.length} challan(s) you have audited`}
            right={<Btn variant="gold" onClick={exportAuditCsv}>⬇ Export Audit (CSV)</Btn>}
          />
          {audited.length === 0 ? (
            <EmptyState icon="🔍" title="No audited challans" sub="Audited challans will appear here" />
          ) : (
            <div className="rounded-lg border border-white/7 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0c1928] text-[10px] uppercase tracking-wider text-[#96A8BF] font-semibold">
                <div className="col-span-2">Challan No</div>
                <div className="col-span-3">Client</div>
                <div className="col-span-2">Audit Date</div>
                <div className="col-span-1 text-center">Items</div>
                <div className="col-span-1 text-center">Approved</div>
                <div className="col-span-1 text-center">Flagged</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>
              <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                {audited.map((c) => {
                  const items = c.challanItems
                  const approved = items.filter((it) => it.auditStatus === 'APPROVED').length
                  const flagged = items.filter((it) => it.auditStatus === 'REJECTED' || it.auditStatus === 'ON_HOLD').length
                  return (
                    <div key={c.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-[11px]">
                      <div className="col-span-2 font-mono text-[#E4AF4A] font-semibold">{c.challanNumber}</div>
                      <div className="col-span-3">
                        <div className="text-[#EDE4D0] font-medium">{c.clientName}</div>
                        <div className="text-[10px] text-[#4E6180]">{c.clientCity}</div>
                      </div>
                      <div className="col-span-2 text-[#96A8BF]">{fmtDate(c.coordinatorApprovedAt)}</div>
                      <div className="col-span-1 text-center text-[#EDE4D0]">{items.length}</div>
                      <div className="col-span-1 text-center"><span className="text-[#3CB87A] font-semibold">{approved}</span></div>
                      <div className="col-span-1 text-center"><span className={flagged > 0 ? 'text-[#E05050] font-semibold' : 'text-[#4E6180]'}>{flagged}</span></div>
                      <div className="col-span-2 text-right text-[#E4AF4A] font-semibold">{fmtINR(c.amountTotal)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Dispatched sub-section ── */}
      {section === 'dispatched' && (
        <Card className="p-4">
          <SectionTitle
            icon="🚚"
            title="Dispatched Report"
            sub={`${dispatched.length} challan(s) dispatched`}
            right={<Btn variant="gold" onClick={exportDispatchedCsv}>⬇ Export Dispatched (CSV)</Btn>}
          />
          {dispatched.length === 0 ? (
            <EmptyState icon="🚚" title="No dispatched challans" sub="Dispatched challans will appear here" />
          ) : (
            <div className="rounded-lg border border-white/7 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0c1928] text-[10px] uppercase tracking-wider text-[#96A8BF] font-semibold">
                <div className="col-span-2">Challan No</div>
                <div className="col-span-3">Client</div>
                <div className="col-span-2">Dispatch Date</div>
                <div className="col-span-2">Vehicle</div>
                <div className="col-span-2">Transporter</div>
                <div className="col-span-1 text-right">Freight</div>
              </div>
              <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                {dispatched.map((c) => (
                  <div key={c.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-[11px]">
                    <div className="col-span-2 font-mono text-[#E4AF4A] font-semibold">{c.challanNumber}</div>
                    <div className="col-span-3">
                      <div className="text-[#EDE4D0] font-medium">{c.clientName}</div>
                      <div className="text-[10px] text-[#4E6180]">{c.clientCity}</div>
                    </div>
                    <div className="col-span-2 text-[#3CB87A]">{fmtDate(c.dispatchDate)}</div>
                    <div className="col-span-2 font-mono text-[#EDE4D0]">{c.vehicleNumber || '—'}</div>
                    <div className="col-span-2 text-[#EDE4D0]">{c.transporterName || '—'}</div>
                    <div className="col-span-1 text-right text-[#E4AF4A] font-semibold">{fmtINR(c.freightAmount || 0)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Bills sub-section ── */}
      {section === 'bills' && (
        <Card className="p-4">
          <SectionTitle
            icon="🧾"
            title="Bills Report"
            sub={`${withBills.length} challan(s) with e-way / invoice bills uploaded`}
            right={<Btn variant="gold" onClick={exportBillsCsv}>⬇ Export Bills (CSV)</Btn>}
          />
          {withBills.length === 0 ? (
            <EmptyState icon="🧾" title="No bills uploaded" sub="Challans with bills will appear here" />
          ) : (
            <div className="rounded-lg border border-white/7 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#0c1928] text-[10px] uppercase tracking-wider text-[#96A8BF] font-semibold">
                <div className="col-span-2">Challan No</div>
                <div className="col-span-3">Client</div>
                <div className="col-span-2">E-Way No</div>
                <div className="col-span-2">Invoice No</div>
                <div className="col-span-2">Uploaded By</div>
                <div className="col-span-1 text-right">Date</div>
              </div>
              <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                {withBills.map((c) => (
                  <div key={c.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-[11px]">
                    <div className="col-span-2 font-mono text-[#E4AF4A] font-semibold">{c.challanNumber}</div>
                    <div className="col-span-3">
                      <div className="text-[#EDE4D0] font-medium">{c.clientName}</div>
                      <div className="text-[10px] text-[#4E6180]">{c.clientCity}</div>
                    </div>
                    <div className="col-span-2 font-mono text-[#EDE4D0]">{c.ewayBillNo || '—'}</div>
                    <div className="col-span-2 font-mono text-[#EDE4D0]">{c.invoiceNo || '—'}</div>
                    <div className="col-span-2 text-[#EDE4D0]">{c.billsUploadedBy?.name || '—'}</div>
                    <div className="col-span-1 text-right text-[#96A8BF]">{fmtDate(c.billsUploadedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Full Report (server-side CSV) ── */}
      {section === 'full' && (
        <Card className="p-4">
          <SectionTitle
            icon="📑"
            title="Full Report (CSV)"
            sub="Generate a complete CSV with all challan columns — opens directly in Excel"
            right={<Btn variant="gold" onClick={exportFullCsv}>⬇ Download Full Report</Btn>}
          />
          <div className="rounded-lg border border-[#9B6ED4]/20 bg-[#9B6ED4]/5 p-4 space-y-4">
            <div className="text-[12px] text-[#EDE4D0]">
              Pick a period and download the complete challan report. The export includes every column
              (client, amounts, payment, audit, warehouse, vehicle, dispatch, special-dispatch, items) and a totals row.
            </div>

            {/* Period selector */}
            <div>
              <div className="text-[11px] text-[#96A8BF] mb-1.5 font-medium">Period</div>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'weekly' as const,  label: '📅 Weekly',  hint: 'Current week (Mon–Sun)' },
                  { key: 'monthly' as const, label: '🗓️ Monthly', hint: 'Pick a month & year' },
                  { key: 'yearly' as const,  label: '📆 Yearly',  hint: 'Whole calendar year' },
                ]).map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={`rounded-lg border px-3.5 py-2 text-[12px] font-medium transition-all ${
                      period === p.key
                        ? 'border-[#9B6ED4]/40 bg-[#9B6ED4]/15 text-[#EDE4D0]'
                        : 'border-white/10 bg-white/5 text-[#96A8BF] hover:bg-white/10'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Month / Year selectors */}
            {period === 'monthly' && (
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <Select label="Month" value={month} onChange={setMonth} options={monthOpts} />
                <Select label="Year"  value={year}  onChange={setYear}  options={yearOpts} />
              </div>
            )}
            {period === 'yearly' && (
              <div className="max-w-xs">
                <Select label="Year" value={year} onChange={setYear} options={yearOpts} />
              </div>
            )}
            {period === 'weekly' && (
              <div className="rounded-md border border-white/7 bg-[#0c1928] p-3 text-[11px] text-[#96A8BF]">
                Exports the current week (Monday to Sunday). No additional selections needed.
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/7">
              <div className="text-[11px] text-[#96A8BF]">
                <span className="text-[#E4AF4A] font-semibold">{all.length}</span> total challans in system •
                CSV will be filtered to the selected period
              </div>
              <Btn variant="gold" onClick={exportFullCsv}>⬇ Download Full Report (CSV)</Btn>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
