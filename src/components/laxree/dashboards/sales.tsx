'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFetch, apiPost, apiDelete } from '../use-fetch'
import { Badge, Btn, Card, EmptyState, Input, Modal, SectionTitle, Select, StatCard, Textarea } from '../ui'
import { fmtDate, fmtINR, STATUS_COLORS, SessionUser } from '../types'

/* ============================================================ */
/* Types                                                        */
/* ============================================================ */

type Item = {
  id: string
  category: string
  itemName: string
  model: string
  colour: string | null
  currentStock: number
}

type StockCheckItem = {
  id: string
  category: string
  itemName: string
  model: string
  colour: string | null
  unit: string
  currentStock: number
  heldQty: number
  availableStock: number
  minStock: number
  fastMoving: boolean
}

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
  status: string             // MATCHED | NOT_FOUND | WRONG_MODEL
  stockStatus: string        // AVAILABLE | ON_HOLD | WILL_BE_AVAILABLE
  stockRemark: string | null
  expectedAvailabilityDays: number | null
  availableQty: number | null
  matchedItem: Item | null
  matchedItemId: string | null
  auditStatus: string | null      // PENDING | APPROVED | REJECTED
  warehouseStatus: string | null  // PENDING | QUALITY_CHECK | PACKAGING | DONE
}

type Challan = {
  id: string
  challanNumber: string
  quotationNumber: string | null
  clientName: string
  clientCity: string
  clientMobile: string | null
  expectedDeliveryDate: string | null
  billingName: string | null
  billingAddress: string | null
  shippingAddress: string | null
  gstNumber: string | null
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
  accountVerified: boolean
  accountRejected: boolean
  accountRejectReason: string | null
  accountVerifiedBy: { id: string; name: string; role: string } | null
  accountVerifiedAt: string | null
  coordinatorApproved: boolean
  coordinatorApprovedAt: string | null
  warehouseCompleted: boolean
  warehouseCompletedAt: string | null
  vehicleArranged: boolean
  vehicleArrangedAt: string | null
  vehicleNumber: string | null
  transporterName: string | null
  freightAmount: number | null
  dispatchDate: string | null
  whatsappSent: boolean
  whatsappSentAt: string | null
  emailSent: boolean
  emailSentAt: string | null
  reviewReceived: string | null
  reviewReceivedAt: string | null
  reviewRating: number | null
  status: string
  pdfFileName: string | null
  createdAt: string
  uploadedBy: { id: string; name: string; role: string }
  challanItems: ChallanItem[]
  // Bill files uploaded by Account team
  ewayBillNo: string | null
  ewayBillFile: string | null
  invoiceNo: string | null
  invoiceFile: string | null
  billsUploadedAt: string | null
  billsUploadedBy: { name: string; role: string } | null
}

type DashboardData = {
  total: number
  totalAmount: number
  totalAdvance: number
  totalReceived: number
  byStatus: Record<string, number>
  byPaymentStatus: Record<string, number>
  monthly: Array<{ month: string; label: string; count: number; amount: number }>
  challans: Challan[]
}

type StockSummary = {
  available: number
  onHold: number
  willBeAvailable: number
}

type UploadResponse = {
  challan: Challan
  stockSummary: StockSummary
  message: string
  autoPR?: {
    prNumber: string
    items: { itemName: string; model: string | null; quantity: number }[]
  } | null
}

const STOCK_STATUS_COLOR: Record<string, string> = {
  AVAILABLE: '#3CB87A',
  ON_HOLD: '#E09E3C',
  WILL_BE_AVAILABLE: '#E05050',
  PENDING: '#96A8BF',
}

// ── Clear inventory status for the Sales user ──
// Maps the internal stockStatus + match status to a simple, friendly label:
//   ✅ Available        — model found in inventory AND enough stock
//   🔶 Partial Available — model found but not enough stock (back-order needed)
//   ❌ Not Available    — model NOT in inventory, or out of stock (25–30 days)
// This is what the "internal agent" reports back per item model number.
type StockInfo = { label: string; icon: string; color: string; detail: string }
function stockStatusInfo(stockStatus: string, matchStatus?: string, remark?: string | null, availableQty?: number | null): StockInfo {
  // NOT_FOUND = the model wasn't found in master inventory at all
  if (matchStatus === 'NOT_FOUND' || stockStatus === 'PENDING') {
    return {
      label: 'Not Available',
      icon: '❌',
      color: '#E05050',
      detail: remark || 'This model is not in our inventory — IT team will add it',
    }
  }
  switch (stockStatus) {
    case 'AVAILABLE':
      return {
        label: 'Available',
        icon: '✅',
        color: '#3CB87A',
        detail: remark || `${availableQty ?? 0} in stock`,
      }
    case 'ON_HOLD':
      return {
        label: 'Partial Available',
        icon: '🔶',
        color: '#E09E3C',
        detail: remark || `Only ${availableQty ?? 0} available — rest on back-order`,
      }
    case 'WILL_BE_AVAILABLE':
      return {
        label: 'Not Available',
        icon: '❌',
        color: '#E05050',
        detail: remark || 'Out of stock — will be available in 25–30 days',
      }
    default:
      return {
        label: 'Not Available',
        icon: '❌',
        color: '#96A8BF',
        detail: remark || 'Status unknown',
      }
  }
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

/* ── Smart availability (NO raw stock-qty disclosure) ──
   Used in Upload Result per-item table and Stock Check tab.
   Shows friendly status without exposing stock numbers, EXCEPT in the
   partial case where the user explicitly asked to show "X available,
   Y remaining" so they can plan around the back-order. */
type SmartInfo = { icon: string; color: string; label: string; message: string }

// For UploadResult: uses ci.stockStatus + ci.availableQty + requiredQty(=quantity)
function smartStockInfo(
  stockStatus: string,
  matchStatus?: string,
  availableQty?: number | null,
  requiredQty?: number,
): SmartInfo {
  const need = Math.max(1, Number(requiredQty) || 0)
  // NOT_FOUND / PENDING / WILL_BE_AVAILABLE → not available
  if (matchStatus === 'NOT_FOUND' || stockStatus === 'PENDING' || stockStatus === 'WILL_BE_AVAILABLE') {
    return {
      icon: '❌',
      color: '#E05050',
      label: 'Not Available',
      message: 'Will be available soon once order is finalized',
    }
  }
  if (stockStatus === 'AVAILABLE') {
    return { icon: '✅', color: '#3CB87A', label: 'Available', message: '' }
  }
  if (stockStatus === 'ON_HOLD') {
    const avail = Math.max(0, Number(availableQty) || 0)
    if (avail <= 0) {
      return {
        icon: '❌',
        color: '#E05050',
        label: 'Not Available',
        message: 'Will be available soon once order is finalized',
      }
    }
    if (avail >= need) {
      return { icon: '✅', color: '#3CB87A', label: 'Available', message: '' }
    }
    // Partial: do NOT disclose actual stock numbers — only say remaining will follow.
    return {
      icon: '🔶',
      color: '#E09E3C',
      label: 'Partial Available',
      message: 'Partial stock available — remaining quantity will be available in 24-30 days once order is finalized',
    }
  }
  return {
    icon: '❌',
    color: '#96A8BF',
    label: 'Not Available',
    message: 'Will be available soon once order is finalized',
  }
}

// For StockCheckTab: uses availableStock + requiredQty
// IMPORTANT: never disclose actual stock numbers — only Available / Partial / Not Available.
function stockCheckAvailability(availableStock: number, requiredQty: number): SmartInfo {
  const need = Math.max(1, Number(requiredQty) || 1)
  if (availableStock <= 0) {
    return {
      icon: '❌',
      color: '#E05050',
      label: 'Not Available',
      message: 'Will be available soon once order is finalized',
    }
  }
  if (availableStock >= need) {
    return { icon: '✅', color: '#3CB87A', label: 'Yes Available', message: '' }
  }
  // Partial: no numbers — only say remaining will follow once order is finalized.
  return {
    icon: '🔶',
    color: '#E09E3C',
    label: 'Partial Available',
    message: 'Partial stock available — remaining quantity will be available in 24-30 days once order is finalized',
  }
}

/* ============================================================ */
/* Main Dashboard                                               */
/* ============================================================ */

export function SalesDashboard({ user, activeTab, onTabChange }: {
  user: SessionUser
  activeTab: string
  onTabChange: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      {activeTab === 'stock-check'    && <StockCheckTab />}
      {activeTab === 'upload'         && <UploadTab user={user} onDone={() => onTabChange('list')} />}
      {activeTab === 'client-status'  && <ClientStatusTab user={user} />}
      {activeTab === 'bills'          && <BillsTab user={user} />}
      {activeTab === 'list'           && <MyChallansTab user={user} />}
      {activeTab === 'dashboard'      && <DashboardTab user={user} />}
      {activeTab === 'reports'        && <ReportsTab user={user} />}
    </div>
  )
}

/* ============================================================ */
/* Tab 1: Dashboard — monthly summary                           */
/* ============================================================ */

function DashboardTab({ user }: { user: SessionUser }) {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))

  const url = `/api/challans/dashboard?role=SALES&userId=${user.id}&month=${month}&year=${year}`
  const { data, loading, error, refresh } = useFetch<DashboardData>(url, [month, year])

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle
          icon="📊"
          title="Sales Dashboard"
          sub="Monthly performance summary"
          right={
            <div className="flex gap-2">
              <Select
                value={month}
                onChange={setMonth}
                options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
              />
              <Select
                value={year}
                onChange={setYear}
                options={[2024, 2025, 2026].map((y) => ({ value: String(y), label: String(y) }))}
              />
              <Btn size="sm" onClick={refresh}>↻</Btn>
            </div>
          }
        />

        {loading ? (
          <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
        ) : error ? (
          <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{error}</div>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Total Challans" value={data.total} accent="#E4AF4A" icon="🧾" />
              <StatCard label="Total Amount" value={fmtINR(data.totalAmount)} accent="#E4AF4A" icon="💰" />
              <StatCard label="Total Advance" value={fmtINR(data.totalAdvance)} accent="#3CB87A" icon="✅" />
              <StatCard label="Total Received" value={fmtINR(data.totalReceived)} accent="#3CB87A" icon="🏦" />
            </div>
          </>
        )}
      </Card>

      {data && !loading && (
        <>
          {/* Monthly breakdown — last 12 months */}
          <Card className="p-4">
            <SectionTitle icon="📈" title="Last 12 Months" sub="Challan count per month" />
            <MonthlyBars monthly={data.monthly} />
          </Card>

          {/* Status breakdown */}
          <Card className="p-4">
            <SectionTitle icon="🏷️" title="Status Breakdown" sub={`${MONTH_NAMES[Number(month) - 1]} ${year}`} />
            {Object.keys(data.byStatus).length === 0 ? (
              <EmptyState icon="🏷️" title="No challans this month" sub="Try another month or upload a new challan" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(data.byStatus).map(([status, count]) => (
                  <div key={status} className="rounded-lg border border-white/7 bg-[#0c1928]/60 px-3 py-2.5 flex items-center justify-between">
                    <Badge label={status.replace(/_/g, ' ')} color={STATUS_COLORS[status] || '#96A8BF'} />
                    <span className="font-serif text-lg font-bold text-[#EDE4D0]">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Calendar view — daily challan counts */}
          <CalendarView challans={data.challans} month={Number(month)} year={Number(year)} />
        </>
      )}
    </div>
  )
}

function MonthlyBars({ monthly }: { monthly: DashboardData['monthly'] }) {
  const max = Math.max(1, ...monthly.map((m) => m.count))
  return (
    <div className="flex items-end gap-1.5 h-32 overflow-x-auto pb-1">
      {monthly.map((m) => {
        const h = Math.max(4, Math.round((m.count / max) * 100))
        return (
          <div key={m.month} className="flex flex-col items-center gap-1 min-w-[44px] flex-1">
            <div className="text-[10px] text-[#96A8BF] font-semibold">{m.count}</div>
            <div
              className="w-full rounded-t-md transition-all"
              style={{
                height: `${h}%`,
                background: m.count > 0
                  ? 'linear-gradient(to top, #C8922A, #E4AF4A)'
                  : 'rgba(150,168,191,0.15)',
              }}
              title={`${m.label}: ${m.count} challans · ${fmtINR(m.amount)}`}
            />
            <div className="text-[9px] text-[#4E6180] whitespace-nowrap">{m.label}</div>
          </div>
        )
      })}
    </div>
  )
}

/* Calendar view — month grid with per-day challan counts */
function CalendarView({ challans, month, year }: { challans: Challan[]; month: number; year: number }) {
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // Group challans by day-of-month for the selected month
  const countsByDay = useMemo(() => {
    const map: Record<number, number> = {}
    for (const c of challans) {
      const d = new Date(c.createdAt)
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate()
        map[day] = (map[day] || 0) + 1
      }
    }
    return map
  }, [challans, month, year])

  const totalThisMonth = useMemo(() => Object.values(countsByDay).reduce((s, n) => s + n, 0), [countsByDay])

  const firstWeekday = new Date(year, month - 1, 1).getDay() // 0=Sun, 1=Mon, …, 6=Sat
  const daysInMonth = new Date(year, month, 0).getDate()

  // Build 7-col grid: leading blanks + day cells + trailing blanks (so rows are full)
  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <Card className="p-4">
      <SectionTitle
        icon="📅"
        title={`Calendar — ${monthLabel}`}
        sub={`${totalThisMonth} challan${totalThisMonth === 1 ? '' : 's'} created this month`}
        right={
          isCurrentMonth
            ? <Badge label="TODAY" color="#E4AF4A" />
            : undefined
        }
      />
      <div className="grid grid-cols-7 gap-1.5 mt-3">
        {weekdays.map((w) => (
          <div key={w} className="text-center text-[10px] uppercase tracking-wider text-[#4E6180] font-bold py-1">{w}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="aspect-square rounded-md bg-white/[0.01] border border-white/5" />
          }
          const count = countsByDay[day] || 0
          const isToday = isCurrentMonth && day === today.getDate()
          return (
            <div
              key={i}
              className={`aspect-square rounded-md border flex flex-col items-center justify-center gap-1 transition-all ${
                isToday
                  ? 'border-[#E4AF4A]/60 bg-[#C8922A]/15 shadow-[0_0_0_1px_rgba(228,175,74,0.35)]'
                  : count > 0
                    ? 'border-[#C8922A]/25 bg-[#C8922A]/8 hover:bg-[#C8922A]/15 cursor-default'
                    : 'border-white/7 bg-[#0c1928]/40'
              }`}
              title={count > 0 ? `${count} challan${count === 1 ? '' : 's'} on ${day} ${monthLabel}` : undefined}
            >
              <span className={`text-[12px] font-bold ${
                isToday ? 'text-[#E4AF4A]'
                : count > 0 ? 'text-[#EDE4D0]'
                : 'text-[#4E6180]'
              }`}>{day}</span>
              {count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold bg-gradient-to-br from-[#C8922A] to-[#E4AF4A] text-[#07101f]">
                  {count}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-[#4E6180]">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-[#E4AF4A]/60 bg-[#C8922A]/15" />
          Today
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-[#C8922A]/25 bg-[#C8922A]/8" />
          Has challans
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-white/7 bg-[#0c1928]/40" />
          No activity
        </span>
      </div>
    </Card>
  )
}

/* ============================================================ */
/* Tab 2: Check Stock — cascading dropdowns                     */
/* ============================================================ */

function StockCheckTab() {
  const [category, setCategory] = useState('')
  const [itemName, setItemName] = useState('')
  const [model, setModel] = useState('')
  const [colour, setColour] = useState('')

  const [itemNames, setItemNames] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [colours, setColours] = useState<string[]>([])

  const [catLoading, setCatLoading] = useState(false)
  const [nameLoading, setNameLoading] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [colourLoading, setColourLoading] = useState(false)

  // Per-item "Required Qty" — what the user needs for this client.
  // We DON'T disclose actual stock numbers; we only show smart availability
  // (Available / Partial / Not Available) based on requiredQty vs availableStock.
  const [requiredQtys, setRequiredQtys] = useState<Record<string, number>>({})
  const getRequiredQty = (id: string) => requiredQtys[id] ?? 1
  const setRequiredQty = (id: string, v: number) =>
    setRequiredQtys((prev) => ({ ...prev, [id]: Math.max(1, Number(v) || 1) }))

  // Step 1: fetch categories on mount
  const { data: catData, loading: catInitLoading } = useFetch<{ categories: string[] }>('/api/stock-check')
  const categories = catData?.categories || []

  // Step 2: when category changes, fetch item names
  useEffect(() => {
    if (!category) { setItemNames([]); return }
    setNameLoading(true)
    setItemName(''); setItemNames([])
    setModel(''); setModels([])
    setColour(''); setColours([])
    fetch(`/api/stock-check?category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((d) => setItemNames(d.itemNames || []))
      .finally(() => setNameLoading(false))
  }, [category])

  // Step 3: when itemName changes, fetch models
  useEffect(() => {
    if (!category || !itemName) { setModels([]); return }
    setModelLoading(true)
    setModel(''); setModels([])
    setColour(''); setColours([])
    fetch(`/api/stock-check?category=${encodeURIComponent(category)}&itemName=${encodeURIComponent(itemName)}`)
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .finally(() => setModelLoading(false))
  }, [category, itemName])

  // Step 4: when model changes, fetch colours
  useEffect(() => {
    if (!category || !itemName || !model) { setColours([]); return }
    setColourLoading(true)
    setColour(''); setColours([])
    fetch(`/api/stock-check?category=${encodeURIComponent(category)}&itemName=${encodeURIComponent(itemName)}&model=${encodeURIComponent(model)}`)
      .then((r) => r.json())
      .then((d) => setColours(d.colours || []))
      .finally(() => setColourLoading(false))
  }, [category, itemName, model])

  // Set catLoading for spinners
  useEffect(() => { setCatLoading(catInitLoading) }, [catInitLoading])

  // Step 5: when all selected, fetch items
  const finalUrl = (category && itemName && model && colour)
    ? `/api/stock-check?category=${encodeURIComponent(category)}&itemName=${encodeURIComponent(itemName)}&model=${encodeURIComponent(model)}&colour=${encodeURIComponent(colour)}`
    : ''
  const { data: resultData, loading: resultLoading } = useFetch<{ items: StockCheckItem[] }>(finalUrl, [colour])

  const result = resultData?.items || []
  const allReady = !!(category && itemName && model && colour)

  const reset = () => {
    setCategory(''); setItemName(''); setModel(''); setColour('')
    setItemNames([]); setModels([]); setColours([])
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle
          icon="📦"
          title="Check Stock"
          sub="Cascading lookup — find available stock before discussing with the client"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select
            label="Category"
            value={category}
            onChange={setCategory}
            required
            options={[
              { value: '', label: catLoading ? 'Loading…' : '— Select Category —' },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
          />
          <Select
            label="Item Name"
            value={itemName}
            onChange={setItemName}
            required
            options={[
              { value: '', label: !category ? '— Pick category first —' : nameLoading ? 'Loading…' : '— Select Item —' },
              ...itemNames.map((n) => ({ value: n, label: n })),
            ]}
          />
          <Select
            label="Model"
            value={model}
            onChange={setModel}
            required
            options={[
              { value: '', label: !itemName ? '— Pick item first —' : modelLoading ? 'Loading…' : '— Select Model —' },
              ...models.map((m) => ({ value: m, label: m })),
            ]}
          />
          <Select
            label="Colour"
            value={colour}
            onChange={setColour}
            required
            options={[
              { value: '', label: !model ? '— Pick model first —' : colourLoading ? 'Loading…' : '— Select Colour —' },
              ...colours.map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>

        {allReady && (
          <div className="flex justify-end mt-3">
            <Btn size="sm" onClick={reset}>↺ Reset</Btn>
          </div>
        )}
      </Card>

      {/* Results */}
      {allReady && (
        <Card className="p-4">
          <SectionTitle
            icon="🔍"
            title="Stock Result"
            sub={`${category} → ${itemName} → ${model} → ${colour}`}
          />
          {resultLoading ? (
            <div className="text-center py-6 text-[#96A8BF] text-sm">Checking stock…</div>
          ) : result.length === 0 ? (
            <EmptyState icon="❓" title="No matching item" sub="Try a different combination" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/8">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-[#0c1928] text-[11px] uppercase tracking-wider text-[#96A8BF]">
                    <th className="py-2.5 px-3 font-semibold">#</th>
                    <th className="py-2.5 px-3 font-semibold">Item</th>
                    <th className="py-2.5 px-3 font-semibold">Model</th>
                    <th className="py-2.5 px-3 font-semibold">Colour</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Required Qty</th>
                    <th className="py-2.5 px-3 font-semibold">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {result.map((it, idx) => {
                    // Smart availability — NO raw stock numbers shown to Sales.
                    const reqQty = getRequiredQty(it.id)
                    const avail = stockCheckAvailability(it.availableStock, reqQty)
                    return (
                      <tr
                        key={it.id}
                        className="border-t border-white/6 bg-[#0c1928]/40 hover:bg-[#0c1928]/70 transition-colors"
                      >
                        <td className="py-3 px-3 text-[12px] text-[#4E6180] font-mono">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <div className="font-serif text-[13.5px] font-bold text-[#EDE4D0]">{it.itemName}</div>
                          {it.fastMoving && (
                            <span className="inline-block mt-0.5 text-[10px] text-[#E4AF4A]">⚡ Fast Moving</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[12.5px] text-[#E4AF4A]">{it.model}</td>
                        <td className="py-3 px-3 text-[12.5px] text-[#EDE4D0]">{it.colour || '—'}</td>
                        <td className="py-3 px-3">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={reqQty}
                              onChange={(e) => setRequiredQty(it.id, Number(e.target.value))}
                              className="w-[88px] rounded-lg border border-white/10 bg-[#0c1928] px-2.5 py-1.5 text-center text-[14px] font-bold text-[#E4AF4A] focus:border-[#C8922A]/50 focus:outline-none focus:ring-1 focus:ring-[#C8922A]/30 transition-colors"
                            />
                            <span className="text-[10px] text-[#4E6180]">{it.unit || 'pcs'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div
                            className="inline-flex items-start gap-2 rounded-lg border px-3 py-2"
                            style={{
                              borderColor: `${avail.color}55`,
                              background: `${avail.color}12`,
                            }}
                          >
                            <span className="text-lg leading-none mt-0.5">{avail.icon}</span>
                            <div className="min-w-0">
                              <div
                                className="font-serif text-[13px] font-bold whitespace-nowrap"
                                style={{ color: avail.color }}
                              >
                                {avail.label}
                              </div>
                              {avail.message && (
                                <div className="text-[11px] text-[#EDE4D0]/90 mt-0.5 leading-snug max-w-[280px]">
                                  {avail.message}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function StockStat({ label, value, color, highlight }: { label: string; value: React.ReactNode; color: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${highlight ? 'border border-[#C8922A]/40 bg-[#C8922A]/8' : 'border border-white/7 bg-[#0c1928]/60'}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-[#4E6180] font-semibold mb-0.5">{label}</div>
      <div className="font-serif text-base font-bold" style={{ color }}>{value}</div>
    </div>
  )
}

/* ============================================================ */
/* Tab 3: Upload Challan — multi-section form                   */
/* ============================================================ */

type ItemRow = {
  category: string
  itemName: string
  itemNumber: string
  model: string
  colour: string
  quantity: number
  unitPrice: number
}

function UploadTab({ user, onDone }: { user: SessionUser; onDone: () => void }) {
  // Auto-extract state (PDF upload → VLM analysis → autofill A/B/C)
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState('')
  const [extractSuccess, setExtractSuccess] = useState('')
  const [extractedFileName, setExtractedFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Section A: Client details
  const [challanNumber, setChallanNumber] = useState('')
  const [quotationNumber, setQuotationNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientCity, setClientCity] = useState('')
  const [clientMobile, setClientMobile] = useState('')
  const [billingName, setBillingName] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [gstNumber, setGstNumber] = useState('')
  const [expectedDate, setExpectedDate] = useState('')

  // Section B: Financial details
  const [amountWithoutGst, setAmountWithoutGst] = useState('')
  const [gstPercentage, setGstPercentage] = useState('18')
  const [packingCharge, setPackingCharge] = useState('')

  // Section C: Items
  const [items, setItems] = useState<ItemRow[]>([
    { category: '', itemName: '', itemNumber: '', model: '', colour: '', quantity: 1, unitPrice: 0 },
  ])

  // Section D: PDF
  const [pdfFileName, setPdfFileName] = useState('')

  // Submit flow
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'PARTIAL' | null>(null)
  const [advanceInput, setAdvanceInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const [result, setResult] = useState<UploadResponse | null>(null)

  // Auto-calculations
  const amtWithoutGstNum = Number(amountWithoutGst) || 0
  const gstNum = Number(gstPercentage) || 0
  const packingNum = Number(packingCharge) || 0
  const amountWithGst = useMemo(() => amtWithoutGstNum * (1 + gstNum / 100), [amtWithoutGstNum, gstNum])
  const amountTotal = useMemo(() => amountWithGst + packingNum, [amountWithGst, packingNum])

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  const addItem = () => setItems((prev) => [...prev, { category: '', itemName: '', itemNumber: '', model: '', colour: '', quantity: 1, unitPrice: 0 }])
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  // Sync billing name default to client name when empty
  useEffect(() => {
    if (!billingName && clientName) setBillingName(clientName)
  }, [clientName, billingName])

  // ── Auto-fetch category from master inventory ──
  // When the user types an itemName or model, debounce-search the master
  // items (/api/items). On a match, auto-fill category (and itemNumber/
  // colour if empty). The Category field in the UI is read-only / auto-filled
  // with a "🔍 auto" badge; if no match, an "— not in master inventory —"
  // hint is shown so the Sales user knows IT will need to add it.
  const { data: masterData } = useFetch<{ items: Item[] }>('/api/items')
  const masterItems = useMemo(() => masterData?.items || [], [masterData])
  const masterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Signature string so the effect only fires when itemName/model change
  // (not when category/itemNumber/colour change — those are derived here).
  const itemsSignature = items.map((i) => `${i.itemName}||${i.model}`).join('::')
  useEffect(() => {
    if (!masterItems.length) return
    if (masterDebounceRef.current) clearTimeout(masterDebounceRef.current)
    masterDebounceRef.current = setTimeout(() => {
      setItems((prev) => prev.map((row) => {
        const q = row.itemName.trim().toLowerCase()
        const m = row.model.trim().toLowerCase()
        // Both empty → leave category alone (user cleared everything)
        if (!q && !m) return row
        // Find master match: if both itemName & model provided, both must
        // match (contains); otherwise match on whichever is provided.
        const match = masterItems.find((mi) => {
          const miName = mi.itemName.toLowerCase()
          const miModel = mi.model.toLowerCase()
          if (q && m) return miName.includes(q) && miModel.includes(m)
          if (q) return miName.includes(q)
          if (m) return miModel.includes(m)
          return false
        })
        if (!match) {
          // Typed something but no match — clear category so the UI shows
          // the "— not in master inventory —" hint.
          return { ...row, category: '' }
        }
        return {
          ...row,
          category: match.category,
          itemNumber: row.itemNumber || match.model,
          colour: row.colour || (match.colour || ''),
        }
      }))
    }, 350)
    return () => {
      if (masterDebounceRef.current) clearTimeout(masterDebounceRef.current)
    }
  }, [itemsSignature, masterItems])

  const validate = (): string | null => {
    if (!challanNumber.trim()) return 'Challan number is required'
    if (!clientName.trim()) return 'Client name is required'
    if (!clientCity.trim()) return 'Client city is required'
    const validItems = items.filter((i) => i.itemName.trim())
    if (validItems.length === 0) return 'Add at least one item with an item name'
    if (validItems.some((i) => i.quantity <= 0)) return 'All item quantities must be greater than 0'
    return null
  }

  const openPaymentModal = () => {
    const v = validate()
    if (v) { setErr(v); return }
    setErr('')
    setPaymentMode(null)
    setAdvanceInput('')
    setShowPaymentModal(true)
  }

  const confirmSubmit = async () => {
    if (!paymentMode) return
    const advance = paymentMode === 'FULL' ? amountTotal : Number(advanceInput) || 0
    if (paymentMode === 'PARTIAL' && advance <= 0) {
      setErr('Enter a valid advance amount')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const res = await apiPost('/api/challans/upload', {
        challanNumber: challanNumber.trim(),
        quotationNumber: quotationNumber.trim() || undefined,
        clientName: clientName.trim(),
        clientCity: clientCity.trim(),
        clientMobile: clientMobile.trim() || undefined,
        billingName: billingName.trim() || clientName.trim(),
        billingAddress: billingAddress.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        gstNumber: gstNumber.trim() || undefined,
        expectedDeliveryDate: expectedDate || undefined,
        amountWithoutGst: amtWithoutGstNum,
        amountWithGst,
        gstPercentage: gstNum,
        amountTotal,
        packingCharge: packingNum,
        paymentMode,
        amountAdvance: advance,
        items: items
          .filter((i) => i.itemName.trim())
          .map((i) => ({
            category: i.category.trim() || undefined,
            itemName: i.itemName.trim(),
            itemNumber: i.itemNumber.trim() || undefined,
            model: i.model.trim() || undefined,
            colour: i.colour.trim() || undefined,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.quantity * i.unitPrice,
          })),
        pdfFileName: pdfFileName || undefined,
      }) as UploadResponse
      setResult(res)
      setShowPaymentModal(false)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setChallanNumber(''); setQuotationNumber(''); setClientName(''); setClientCity(''); setClientMobile('')
    setBillingName(''); setBillingAddress(''); setShippingAddress(''); setGstNumber(''); setExpectedDate('')
    setAmountWithoutGst(''); setGstPercentage('18'); setPackingCharge('')
    setItems([{ category: '', itemName: '', itemNumber: '', model: '', colour: '', quantity: 1, unitPrice: 0 }])
    setPdfFileName('')
    setResult(null); setErr(''); setPaymentMode(null); setAdvanceInput('')
    setExtractSuccess(''); setExtractErr(''); setExtractedFileName('')
  }

  /* ---------- Auto-extract from PDF (VLM) ---------- */
  const handleExtract = async (file: File) => {
    setExtracting(true)
    setExtractErr('')
    setExtractSuccess('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/challans/extract', { method: 'POST', body: fd })
      const text = await res.text()
      const data = text ? JSON.parse(text) : null
      if (!res.ok) throw new Error(data?.error || `Extraction failed (${res.status})`)
      const d = data?.data
      if (!d) throw new Error('Empty extraction response')

      // Section A: Client details
      if (d.challanNumber) setChallanNumber(d.challanNumber)
      if (d.quotationNumber) setQuotationNumber(d.quotationNumber)
      if (d.clientName) setClientName(d.clientName)
      if (d.clientCity) setClientCity(d.clientCity)
      if (d.clientMobile) setClientMobile(d.clientMobile)
      if (d.billingName) setBillingName(d.billingName)
      if (d.billingAddress) setBillingAddress(d.billingAddress)
      if (d.shippingAddress) setShippingAddress(d.shippingAddress)
      if (d.gstNumber) setGstNumber(d.gstNumber)
      if (d.expectedDeliveryDate) setExpectedDate(d.expectedDeliveryDate)

      // Section B: Financial details
      if (typeof d.amountWithoutGst === 'number') setAmountWithoutGst(String(d.amountWithoutGst))
      if (typeof d.gstPercentage === 'number') setGstPercentage(String(d.gstPercentage))
      if (typeof d.packingCharge === 'number') setPackingCharge(String(d.packingCharge))

      // Section C: Items
      if (Array.isArray(d.items) && d.items.length > 0) {
        const mapped: ItemRow[] = d.items.map((it: {
          category?: string | null
          itemName?: string | null
          itemNumber?: string | null
          model?: string | null
          colour?: string | null
          quantity?: number
          unitPrice?: number
          totalPrice?: number
        }) => ({
          category: it.category || '',
          itemName: it.itemName || it.model || '',
          itemNumber: it.itemNumber || '',
          model: it.model || '',
          colour: it.colour || '',
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unitPrice) || 0,
        }))
        setItems(mapped)
      }

      // Section D: PDF filename
      if (d.pdfFileName) setPdfFileName(d.pdfFileName)
      setExtractedFileName(d.pdfFileName || file.name)

      const itemCount = Array.isArray(d.items) ? d.items.length : 0
      const warning = data?.warning as string | undefined
      if (warning) {
        // Partial extraction — some fields extracted, but not all. Show a softer
        // success message so the user knows to review and fill missing fields.
        setExtractSuccess(
          `✓ Partially auto-filled from "${d.pdfFileName || file.name}" — ${itemCount} item${itemCount === 1 ? '' : 's'} extracted. ${warning} Review the fields below and fill any gaps, then submit.`
        )
      } else {
        setExtractSuccess(
          `✓ Challan analyzed! Auto-filled ${itemCount} item${itemCount === 1 ? '' : 's'} and all client/financial details from "${d.pdfFileName || file.name}". Review below and submit.`
        )
      }
    } catch (e: unknown) {
      setExtractErr(e instanceof Error ? e.message : 'PDF analysis failed. You can still fill the form manually below.')
    } finally {
      setExtracting(false)
    }
  }

  /* ---------- Success view ---------- */
  if (result) {
    return <UploadResult result={result} onDone={onDone} onUploadAnother={resetForm} />
  }

  /* ---------- Form view ---------- */
  return (
    <div className="space-y-4">
      {/* ── Auto-fill from Challan PDF (AI-powered) ── */}
      <Card className="p-4 border-[#C8922A]/30 bg-gradient-to-br from-[#C8922A]/8 to-transparent">
        <SectionTitle
          icon="🤖"
          title="Auto-fill from Challan PDF"
          sub="Upload the customer challan — AI extracts all details below automatically"
          right={extractedFileName ? (
            <span className="text-[10px] text-[#3CB87A] font-mono truncate max-w-[180px]">📎 {extractedFileName}</span>
          ) : undefined}
        />
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
            <div className="flex-1">
              <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">Challan PDF (Laxree format)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                disabled={extracting}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleExtract(f)
                  e.target.value = ''
                }}
                className="w-full text-[12px] text-[#EDE4D0] file:mr-3 file:rounded-lg file:border-0 file:bg-[#C8922A] file:px-4 file:py-2 file:text-[#07101f] file:font-semibold hover:file:opacity-90 disabled:opacity-50"
              />
            </div>
            {extracting && (
              <div className="flex items-center gap-2 text-[12px] text-[#E4AF4A] bg-[#C8922A]/10 border border-[#C8922A]/25 rounded-lg px-3 py-2">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-[#E4AF4A] border-t-transparent animate-spin" />
                Analyzing challan with AI… (~10–15s)
              </div>
            )}
          </div>

          {extractSuccess && (
            <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-2.5 text-[12px] text-[#3CB87A]">
              {extractSuccess}
            </div>
          )}
          {extractErr && (
            <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2.5 text-[12px] text-[#E05050]">
              ⚠ {extractErr}
            </div>
          )}

          <div className="text-[10.5px] text-[#4E6180] leading-relaxed bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
            💡 <strong className="text-[#96A8BF]">How it works:</strong> The AI reads your PDF and fills Sections A (client), B (financials) and C (items) automatically. You can review &amp; edit any field before submitting. The existing manual entry fields below remain fully editable.
          </div>
        </div>
      </Card>

      {/* Section A: Client Details */}
      <Card className="p-4">
        <SectionTitle icon="👤" title="A · Client Details" sub="Customer & billing information" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Challan Number" value={challanNumber} onChange={setChallanNumber} placeholder="CH-2026-0001" required />
          <Input label="Quotation Number" value={quotationNumber} onChange={setQuotationNumber} placeholder="Q-2026-0001" />
          <Input label="Client Name" value={clientName} onChange={setClientName} placeholder="Hotel / Client name" required />
          <Input label="Client City" value={clientCity} onChange={setClientCity} placeholder="Mumbai" required />
          <Input label="Client Mobile" value={clientMobile} onChange={setClientMobile} placeholder="+91…" />
          <Input label="Billing Name" value={billingName} onChange={setBillingName} placeholder="(defaults to client name)" />
          <Input label="GST Number" value={gstNumber} onChange={setGstNumber} placeholder="27ABCDE1234F1Z5" />
          <Input label="Expected Delivery Date" type="date" value={expectedDate} onChange={setExpectedDate} />
          <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Textarea label="Billing Address" value={billingAddress} onChange={setBillingAddress} placeholder="Street, city, state, PIN" rows={2} />
            <Textarea label="Shipping Address" value={shippingAddress} onChange={setShippingAddress} placeholder="Street, city, state, PIN" rows={2} />
          </div>
        </div>
      </Card>

      {/* Section B: Financial Details */}
      <Card className="p-4">
        <SectionTitle icon="💰" title="B · Financial Details" sub="GST, packing & totals — auto-calculated" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input label="Amount Without GST (₹)" type="number" value={amountWithoutGst} onChange={setAmountWithoutGst} placeholder="0" step="0.01" />
          <Input label="GST Percentage (%)" type="number" value={gstPercentage} onChange={setGstPercentage} placeholder="18" step="0.01" />
          <Input label="Packing Charge (₹)" type="number" value={packingCharge} onChange={setPackingCharge} placeholder="0" step="0.01" />
          <ReadonlyField label="Amount With GST (auto)" value={fmtINR(amountWithGst)} />
          <ReadonlyField label="Amount Total (auto)" value={fmtINR(amountTotal)} accent />
          <div className="flex items-end">
            <div className="rounded-lg border border-[#4A9EE0]/25 bg-[#4A9EE0]/8 px-3 py-2 text-[11px] text-[#4A9EE0] w-full">
              🚚 Shipping charge will be decided by Coordinator
            </div>
          </div>
        </div>
      </Card>

      {/* Section C: Items */}
      <Card className="p-4">
        <SectionTitle
          icon="📦"
          title="C · Items"
          sub="Add one row per line item — total price auto-calculated"
          right={<Btn size="sm" variant="gold" onClick={addItem}>+ Add Item</Btn>}
        />
        <div className="space-y-2">
          {items.map((it, idx) => {
            const total = (it.quantity || 0) * (it.unitPrice || 0)
            return (
              <div key={idx} className="rounded-lg border border-white/7 bg-[#0c1928]/40 p-2.5">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 md:col-span-2">
                    {idx === 0 && <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">Category</span>}
                    <div
                      className={`rounded-lg border px-2.5 py-2 min-h-[38px] flex items-center ${
                        it.category
                          ? 'border-[#C8922A]/40 bg-[#C8922A]/8'
                          : 'border-white/10 bg-[#0c1928]/60'
                      }`}
                    >
                      {it.category ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#EDE4D0] font-medium min-w-0">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#C8922A]/25 text-[#E4AF4A] border border-[#C8922A]/40 font-bold flex-shrink-0">🔍 auto</span>
                          <span className="truncate">{it.category}</span>
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-[#4E6180] italic">
                          {(it.itemName.trim() || it.model.trim())
                            ? '— not in master inventory —'
                            : 'auto-filled from item name'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Input label={idx === 0 ? 'Item Name *' : undefined} value={it.itemName} onChange={(v) => updateItem(idx, { itemName: v })} placeholder="Bath Towel" required />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Input label={idx === 0 ? 'Item #' : undefined} value={it.itemNumber} onChange={(v) => updateItem(idx, { itemNumber: v })} placeholder="BT-001" />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Input label={idx === 0 ? 'Model' : undefined} value={it.model} onChange={(v) => updateItem(idx, { model: v })} placeholder="LR-BT-700" />
                  </div>
                  <div className="col-span-6 md:col-span-1">
                    <Input label={idx === 0 ? 'Colour' : undefined} value={it.colour} onChange={(v) => updateItem(idx, { colour: v })} placeholder="White" />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Input label={idx === 0 ? 'Qty' : undefined} type="number" value={it.quantity} onChange={(v) => updateItem(idx, { quantity: Number(v) || 0 })} placeholder="0" step="1" />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <Input label={idx === 0 ? 'Price ₹' : undefined} type="number" value={it.unitPrice} onChange={(v) => updateItem(idx, { unitPrice: Number(v) || 0 })} placeholder="0" step="0.01" />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                  <div className="text-[11px] text-[#96A8BF]">
                    Line total: <span className="font-serif text-[#E4AF4A] font-bold">{fmtINR(total)}</span>
                  </div>
                  {items.length > 1 && (
                    <Btn size="sm" variant="danger" onClick={() => removeItem(idx)}>✕ Remove</Btn>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {items.length === 0 && (
          <EmptyState icon="📦" title="No items yet" sub="Click + Add Item to add a line" />
        )}
      </Card>

      {/* Section D: PDF Upload */}
      <Card className="p-4">
        <SectionTitle icon="📎" title="D · PDF Upload (optional)" sub="Attach the customer challan / PO PDF" />
        <label className="block">
          <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">PDF File</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setPdfFileName(e.target.files?.[0]?.name || '')}
            className="w-full text-[12px] text-[#EDE4D0] file:mr-3 file:rounded-lg file:border-0 file:bg-[#C8922A] file:px-3 file:py-1.5 file:text-[#07101f] file:font-semibold hover:file:opacity-90"
          />
        </label>
        {pdfFileName && (
          <div className="mt-2.5 rounded-lg border border-[#3CB87A]/25 bg-[#3CB87A]/8 px-3 py-2 text-[12px] text-[#3CB87A]">
            ✓ PDF attached: <span className="font-mono">{pdfFileName}</span>
          </div>
        )}
      </Card>

      {err && (
        <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>
      )}

      <div className="flex justify-end gap-2">
        <Btn onClick={onDone}>Cancel</Btn>
        <Btn variant="gold" onClick={openPaymentModal}>📤 Submit Challan</Btn>
      </div>

      {/* Payment Modal */}
      <Modal open={showPaymentModal} onClose={() => !saving && setShowPaymentModal(false)} title="Confirm Payment" wide>
        <div className="space-y-4">
          <div className="rounded-lg border border-white/7 bg-[#0c1928]/60 p-3">
            <div className="text-[11px] text-[#96A8BF] mb-1">Challan Total</div>
            <div className="font-serif text-2xl font-bold text-[#E4AF4A]">{fmtINR(amountTotal)}</div>
            <div className="text-[11px] text-[#4E6180] mt-1">
              {challanNumber} · {clientName} ({clientCity})
            </div>
          </div>

          <div className="text-[12px] text-[#96A8BF]">
            How much has the client paid? This will be sent to the Account team for verification.
          </div>

          {!paymentMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMode('FULL')}
                className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-4 py-4 text-left hover:bg-[#3CB87A]/20 transition-colors"
              >
                <div className="font-serif text-base font-bold text-[#3CB87A]">✓ Full Amount Paid</div>
                <div className="text-[11px] text-[#96A8BF] mt-1">Mark advance = {fmtINR(amountTotal)}</div>
              </button>
              <button
                onClick={() => setPaymentMode('PARTIAL')}
                className="rounded-lg border border-[#E09E3C]/30 bg-[#E09E3C]/10 px-4 py-4 text-left hover:bg-[#E09E3C]/20 transition-colors"
              >
                <div className="font-serif text-base font-bold text-[#E09E3C]">🔶 Partial Amount Paid</div>
                <div className="text-[11px] text-[#96A8BF] mt-1">Enter advance amount received</div>
              </button>
            </div>
          )}

          {paymentMode === 'FULL' && (
            <div className="rounded-lg border border-[#3CB87A]/25 bg-[#3CB87A]/8 px-3 py-2.5 text-[12px] text-[#3CB87A]">
              ✓ Full payment mode — advance will be set to <strong>{fmtINR(amountTotal)}</strong>
            </div>
          )}

          {paymentMode === 'PARTIAL' && (
            <div>
              <Input
                label="Advance Amount Received (₹)"
                type="number"
                value={advanceInput}
                onChange={setAdvanceInput}
                placeholder="0"
                step="0.01"
                required
              />
              <div className="text-[11px] text-[#4E6180] mt-1.5">
                Remaining after advance: <span className="text-[#E09E3C] font-semibold">{fmtINR(amountTotal - (Number(advanceInput) || 0))}</span>
              </div>
            </div>
          )}

          {err && (
            <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-white/7">
            <Btn onClick={() => setShowPaymentModal(false)} disabled={saving}>Back</Btn>
            {paymentMode && (
              <Btn variant="gold" onClick={confirmSubmit} disabled={saving || (paymentMode === 'PARTIAL' && !advanceInput)}>
                {saving ? 'Uploading & Analyzing…' : `📤 Confirm & Upload (${paymentMode})`}
              </Btn>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

function UploadResult({ result, onDone, onUploadAnother }: {
  result: UploadResponse
  onDone: () => void
  onUploadAnother: () => void
}) {
  const { challan, stockSummary } = result
  const items = challan.challanItems

  return (
    <Card className="p-4">
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">✅</div>
        <h3 className="font-serif text-lg font-bold text-[#3CB87A]">Challan Uploaded &amp; Analyzed!</h3>
        <p className="text-[12px] text-[#96A8BF] mt-1">
          System auto-analyzed {items.length} item(s) against master inventory.
        </p>
      </div>

      {/* Compute real counts including NOT_FOUND items (backend stockSummary
          only counts AVAILABLE/ON_HOLD/WILL_BE_AVAILABLE — PENDING/NOT_FOUND
          items must be counted as Not Available here). NO raw stock numbers
          are disclosed — only counts of items in each bucket. */}
      {(() => {
        const available = items.filter((ci) => ci.stockStatus === 'AVAILABLE').length
        const partial = items.filter((ci) => ci.stockStatus === 'ON_HOLD').length
        const notAvailable = items.filter((ci) => ci.stockStatus !== 'AVAILABLE' && ci.stockStatus !== 'ON_HOLD').length
        return (
      <>
      {/* Inventory status summary — counts only, no stock numbers */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-[#4E6180] font-semibold mb-0.5">✅ Available</div>
          <div className="font-serif text-2xl font-bold text-[#3CB87A]">{available}</div>
          <div className="text-[9px] text-[#4E6180] mt-0.5">item{available === 1 ? '' : 's'} ready to ship</div>
        </div>
        <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-[#4E6180] font-semibold mb-0.5">❌ Not Available</div>
          <div className="font-serif text-2xl font-bold text-[#E05050]">{partial + notAvailable}</div>
          <div className="text-[9px] text-[#4E6180] mt-0.5">partial / out of stock / not in inventory</div>
        </div>
      </div>

      <div className="rounded-lg border border-[#C8922A]/25 bg-[#C8922A]/8 px-3 py-2 text-[12px] text-[#E4AF4A] mb-4">
        🤖 <strong>Inventory Agent checked {items.length} item(s)</strong> against master stock:{' '}
        <strong className="text-[#3CB87A]">{available} Available</strong>,{' '}
        <strong className="text-[#E09E3C]">{partial} Partial</strong>,{' '}
        <strong className="text-[#E05050]">{notAvailable} Not Available</strong>.
      </div>
      </>
        )
      })()}

      {/* ── Auto-raised Purchase Request banner ──
          When some items were Not Available, the system auto-raised an URGENT
          Purchase Request in Laxree's name. The Owner (Sir) gets an urgent
          popup to check, sign & process it — because the client has paid. */}
      {result.autoPR && (
        <div className="rounded-xl border-2 border-[#E05050]/40 bg-gradient-to-r from-[#E05050]/15 to-[#E05050]/5 px-4 py-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#E05050]/20 text-lg">🚨</div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-[#FF6B6B]">
                Purchase Request {result.autoPR.prNumber} auto-raised — Owner notified urgently
              </div>
              <div className="text-[11.5px] text-[#EDE4D0]/90 mt-0.5">
                {result.autoPR.items.length} item(s) were not available in stock. Since the client has paid in advance, an <strong>URGENT PR</strong> was raised automatically in Laxree's name. Sir just has to check, sign &amp; process it.
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {result.autoPR.items.map((it, i) => (
                  <span key={i} className="text-[10px] rounded-md bg-white/8 border border-white/10 px-2 py-0.5 text-[#EDE4D0]">
                    {it.itemName}{it.model ? ` (${it.model})` : ''} <span className="text-[#E4AF4A]">×{it.quantity}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-item availability — smart badge + message, NO raw stock qty
          (only the partial case shows "X available, Y remaining" because
          the user explicitly asked for that to plan back-orders). */}
      <SectionTitle icon="🔍" title="Per-Item Availability" sub={`Challan ${challan.challanNumber} — model-wise availability`} />
      <div className="rounded-lg border border-white/7 overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] bg-white/[0.02] border-b border-white/7">
              <th className="py-2 px-3">Item</th>
              <th className="py-2 px-3">Model #</th>
              <th className="py-2 px-3 text-right">Need</th>
              <th className="py-2 px-3">Availability</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ci) => {
              const info = smartStockInfo(ci.stockStatus, ci.status, ci.availableQty, ci.quantity)
              return (
                <tr key={ci.id} className="border-b border-white/5">
                  <td className="py-2 px-3 text-[#EDE4D0]">
                    {ci.itemName}
                    {ci.category && <div className="text-[10px] text-[#4E6180]">{ci.category}</div>}
                  </td>
                  <td className="py-2 px-3 text-[#96A8BF] font-mono">{ci.model || ci.itemNumber || '—'}</td>
                  <td className="py-2 px-3 text-right text-[#EDE4D0] font-semibold">{ci.quantity}</td>
                  <td className="py-2 px-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold"
                      style={{ background: `${info.color}1a`, color: info.color, border: `1px solid ${info.color}44` }}
                    >
                      <span className="text-[13px]">{info.icon}</span>
                      {info.label}
                    </span>
                    {info.message && (
                      <div className="text-[10px] text-[#96A8BF] mt-0.5 leading-relaxed">{info.message}</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Btn onClick={onUploadAnother}>📤 Upload Another</Btn>
        <Btn variant="gold" onClick={onDone}>Go to My Challans →</Btn>
      </div>
    </Card>
  )
}

/* ============================================================ */
/* Tab 4: My Challans — list with expandable stock status       */
/* ============================================================ */

function MyChallansTab({ user }: { user: SessionUser }) {
  const url = `/api/challans?role=SALES&userId=${user.id}`
  const { data, loading, error, refresh } = useFetch<{ challans: Challan[] }>(url)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteErr, setDeleteErr] = useState('')

  const handleDelete = async (id: string, challanNumber: string) => {
    if (!confirm(`Delete challan "${challanNumber}"? This will remove all its items, workflow stages, messages, and notifications. This cannot be undone.`)) return
    setDeletingId(id)
    setDeleteErr('')
    try {
      await apiDelete(`/api/challans/${id}`)
      refresh()
    } catch (e: unknown) {
      setDeleteErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (error) return (
    <Card className="p-4">
      <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{error}</div>
    </Card>
  )
  const challans = data?.challans || []

  return (
    <Card className="p-4">
      <SectionTitle
        icon="🧾"
        title="My Challans"
        sub={`${challans.length} uploaded by you`}
        right={<Btn size="sm" onClick={refresh}>↻ Refresh</Btn>}
      />

      {deleteErr && (
        <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050] mb-3">{deleteErr}</div>
      )}

      {challans.length === 0 ? (
        <EmptyState icon="🧾" title="No challans yet" sub="Upload your first challan to begin" />
      ) : (
        <div className="space-y-2">
          {challans.map((c) => {
            const isOpen = expanded === c.id
            const stockCounts = c.challanItems.reduce(
              (acc, ci) => {
                if (ci.stockStatus === 'AVAILABLE') acc.available += 1
                else if (ci.stockStatus === 'ON_HOLD') acc.partial += 1
                else acc.willBe += 1 // WILL_BE_AVAILABLE + PENDING (NOT_FOUND) = Not Available
                return acc
              },
              { available: 0, partial: 0, willBe: 0 },
            )

            const verifyBadge = c.accountRejected
              ? <Badge label="REJECTED" color="#E05050" />
              : c.accountVerified
                ? <Badge label="VERIFIED" color="#3CB87A" />
                : <Badge label="PENDING VERIFY" color="#E09E3C" />

            return (
              <div key={c.id} className="rounded-lg border border-white/7 bg-[#0c1928]/40 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : c.id)}
                  className="w-full text-left px-3.5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="font-mono text-[#E4AF4A] text-[13px] font-semibold">{c.challanNumber}</div>
                      <div className="text-[#EDE4D0] text-[13px] truncate">{c.clientName}</div>
                      <div className="text-[10px] text-[#4E6180]">{c.clientCity}</div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-[#96A8BF] whitespace-nowrap">{fmtDate(c.createdAt)}</span>
                      <span className="text-[#EDE4D0] font-semibold whitespace-nowrap">{fmtINR(c.amountTotal)}</span>
                      <Badge label={c.paymentStatus} color={STATUS_COLORS[c.paymentStatus]} />
                      {verifyBadge}
                      <span className="text-[#4E6180] text-[14px] leading-none">{isOpen ? '▾' : '▸'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2 text-[10px]">
                    <span className="text-[#4E6180]">🔍 Inventory:</span>
                    <span className="text-[#3CB87A] font-semibold">✅ {stockCounts.available} Available</span>
                    <span className="text-[#E09E3C]">· 🔶 {stockCounts.partial} Partial</span>
                    <span className="text-[#E05050]">· ❌ {stockCounts.willBe} Not Available</span>
                    <span className="text-[#4E6180]">· {c.challanItems.length} items total</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-white/7 px-3.5 py-3 space-y-3">
                    {/* Client + payment details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                      <DetailPair label="Quotation" value={c.quotationNumber || '—'} />
                      <DetailPair label="Mobile" value={c.clientMobile || '—'} />
                      <DetailPair label="Expected Delivery" value={fmtDate(c.expectedDeliveryDate)} />
                      <DetailPair label="GST Number" value={c.gstNumber || '—'} />
                      <DetailPair label="Amount (excl GST)" value={fmtINR(c.amountWithoutGst)} />
                      <DetailPair label="Amount (with GST)" value={fmtINR(c.amountWithGst)} />
                      <DetailPair label="Packing" value={fmtINR(c.packingCharge)} />
                      <DetailPair label="Advance" value={fmtINR(c.amountAdvance)} accent="#3CB87A" />
                    </div>

                    {c.billingAddress && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded border border-white/7 bg-[#07101f]/60 px-2.5 py-1.5">
                          <div className="text-[10px] uppercase text-[#4E6180] mb-0.5">Billing</div>
                          <div className="text-[#96A8BF]">{c.billingName || c.clientName}<br />{c.billingAddress}</div>
                        </div>
                        <div className="rounded border border-white/7 bg-[#07101f]/60 px-2.5 py-1.5">
                          <div className="text-[10px] uppercase text-[#4E6180] mb-0.5">Shipping</div>
                          <div className="text-[#96A8BF]">{c.shippingAddress || 'Same as billing'}</div>
                        </div>
                      </div>
                    )}

                    {/* Per-item inventory status — clear Available / Not Available per model */}
                    <div className="rounded-lg border border-white/7 overflow-hidden">
                      <div className="px-2.5 py-1.5 bg-white/[0.02] border-b border-white/7 text-[10px] uppercase tracking-wider text-[#4E6180] font-semibold flex items-center gap-1.5">
                        <span>🔍</span> Per-Item Inventory Status
                      </div>
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wider text-[#4E6180] bg-white/[0.02] border-b border-white/7">
                            <th className="py-2 px-2.5">Item</th>
                            <th className="py-2 px-2.5">Model #</th>
                            <th className="py-2 px-2.5 text-right">Need</th>
                            <th className="py-2 px-2.5 text-right">In Stock</th>
                            <th className="py-2 px-2.5">Inventory Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.challanItems.map((ci) => {
                            const info = stockStatusInfo(ci.stockStatus, ci.status, ci.stockRemark, ci.availableQty)
                            return (
                              <tr key={ci.id} className="border-b border-white/5">
                                <td className="py-1.5 px-2.5 text-[#EDE4D0]">{ci.itemName}</td>
                                <td className="py-1.5 px-2.5 text-[#96A8BF] font-mono">{ci.model || ci.itemNumber || '—'}</td>
                                <td className="py-1.5 px-2.5 text-right">{ci.quantity}</td>
                                <td className="py-1.5 px-2.5 text-right text-[#96A8BF]">{ci.availableQty ?? '—'}</td>
                                <td className="py-1.5 px-2.5">
                                  <span
                                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold"
                                    style={{ background: `${info.color}1a`, color: info.color, border: `1px solid ${info.color}44` }}
                                  >
                                    <span className="text-[13px]">{info.icon}</span>
                                    {info.label}
                                  </span>
                                  {info.detail && (
                                    <div className="text-[10px] text-[#4E6180] mt-0.5">{info.detail}</div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {c.accountRejected && c.accountRejectReason && (
                      <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-[12px] text-[#E05050]">
                        ✕ Account rejected: {c.accountRejectReason}
                      </div>
                    )}

                    {/* Bills uploaded by Account team */}
                    {(c.ewayBillNo || c.ewayBillFile || c.invoiceNo || c.invoiceFile) && (
                      <div className="rounded-lg border border-white/7 bg-[#0c1928] p-3">
                        <div className="text-[10px] uppercase tracking-wider text-[#3CB87A] font-semibold mb-2">🧾 Bills Uploaded by Account Team</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] text-[#4E6180] uppercase tracking-wide mb-0.5">E-Way Bill</div>
                            <div className="text-[12px] text-[#EDE4D0]">No: <span className="font-mono">{c.ewayBillNo || '—'}</span></div>
                            {c.ewayBillFile && (
                              <a href={`/uploads/bills/${c.ewayBillFile}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#3CB87A] hover:underline mt-1">📄 View E-Way PDF</a>
                            )}
                          </div>
                          <div>
                            <div className="text-[10px] text-[#4E6180] uppercase tracking-wide mb-0.5">Item Bill / Invoice</div>
                            <div className="text-[12px] text-[#EDE4D0]">No: <span className="font-mono">{c.invoiceNo || '—'}</span></div>
                            {c.invoiceFile && (
                              <a href={`/uploads/bills/${c.invoiceFile}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#3CB87A] hover:underline mt-1">📄 View Invoice PDF</a>
                            )}
                          </div>
                        </div>
                        {c.billsUploadedBy && (
                          <div className="text-[10px] text-[#4E6180] mt-2">
                            Uploaded by <span className="text-[#96A8BF]">{c.billsUploadedBy.name}</span>
                            {c.billsUploadedAt && <> at <span className="text-[#96A8BF]">{fmtDate(c.billsUploadedAt)}</span></>}
                          </div>
                        )}
                      </div>
                    )}

                    {c.pdfFileName && (
                      <div className="text-[11px] text-[#96A8BF]">📎 PDF: <span className="font-mono text-[#E4AF4A]">{c.pdfFileName}</span></div>
                    )}

                    {/* Delete button — only available before Account verifies */}
                    {!c.accountVerified && !c.dispatchDate && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleDelete(c.id, c.challanNumber)}
                          disabled={deletingId === c.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-1.5 text-[11px] font-semibold text-[#E05050] hover:bg-[#E05050]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {deletingId === c.id ? 'Deleting…' : '🗑 Delete Challan'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function DetailPair({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#4E6180] font-semibold mb-0.5">{label}</div>
      <div className="text-[12px]" style={{ color: accent || '#EDE4D0' }}>{value}</div>
    </div>
  )
}

/* ============================================================ */
/* Tab: E-Way & Item Bills — view PDFs uploaded by Account team  */
/* ============================================================ */

function BillsTab({ user }: { user: SessionUser }) {
  const url = `/api/challans?role=SALES&userId=${user.id}`
  const { data, loading, error, refresh } = useFetch<{ challans: Challan[] }>(url)

  const challans = data?.challans || []
  const withBills = challans.filter((c) => c.ewayBillNo || c.ewayBillFile || c.invoiceNo || c.invoiceFile)
  const waiting = challans.filter((c) =>
    c.accountVerified && !c.accountRejected &&
    !(c.ewayBillNo || c.ewayBillFile || c.invoiceNo || c.invoiceFile),
  )
  const needApproval = challans.filter((c) => !c.accountVerified && !c.accountRejected)

  const summary = useMemo(() => ({
    total: challans.length,
    ready: withBills.length,
    waiting: waiting.length,
    needApproval: needApproval.length,
  }), [challans, withBills, waiting, needApproval])

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading bills…</div>
  if (error) return (
    <Card className="p-4">
      <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{error}</div>
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Challans"   value={summary.total}        accent="#E4AF4A" icon="🧾" />
        <StatCard label="Bills Ready"      value={summary.ready}        accent="#3CB87A" icon="✅" />
        <StatCard label="Awaiting Bills"   value={summary.waiting}      accent="#E09E3C" icon="⏳" />
        <StatCard label="Needs Approval"   value={summary.needApproval} accent="#E05050" icon="🔒" />
      </div>

      <Card className="p-4">
        <SectionTitle
          icon="🧾"
          title="E-Way Bill & Item Bill"
          sub="PDFs uploaded by the Account team — view / download here"
          right={<Btn size="sm" onClick={refresh}>↻ Refresh</Btn>}
        />

        {challans.length === 0 ? (
          <EmptyState icon="🧾" title="No challans yet" sub="Upload a challan to begin" />
        ) : (
          <div className="space-y-3">
            {/* Ready bills first */}
            {withBills.length > 0 && (
              <div className="space-y-3">
                {/* "Kindly share with client" banner — eye-catching gold/green */}
                <div className="rounded-xl border-2 border-[#3CB87A]/45 bg-gradient-to-r from-[#3CB87A]/12 via-[#C8922A]/10 to-[#3CB87A]/12 px-4 py-3.5 shadow-[0_0_18px_rgba(60,184,122,0.18)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C8922A] to-[#E4AF4A] text-xl shadow-md">
                      📨
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-serif text-[14px] font-bold text-[#E4AF4A]">
                        Kindly share these bills with the client
                      </div>
                      <div className="text-[11.5px] text-[#EDE4D0]/90 mt-0.5 leading-relaxed">
                        {withBills.length} challan{withBills.length === 1 ? '' : 's'} below have e-way bill &amp; invoice PDFs ready. Please download and forward them to the client so they can verify the dispatch paperwork.
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge label="READY" color="#3CB87A" />
                      <span className="text-[10px] text-[#4E6180]">{withBills.length} pending share</span>
                    </div>
                  </div>
                </div>
                {withBills.map((c) => <BillCard key={c.id} challan={c} />)}
              </div>
            )}

            {/* Waiting for account team to upload */}
            {waiting.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wider text-[#E09E3C] font-semibold mb-2 px-1">
                  ⏳ Awaiting Account team to upload bills ({waiting.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {waiting.map((c) => (
                    <div key={c.id} className="rounded-lg border border-[#E09E3C]/20 bg-[#E09E3C]/5 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[12px] text-[#E4AF4A] font-semibold truncate">{c.challanNumber}</div>
                          <div className="text-[12px] text-[#EDE4D0] truncate">{c.clientName}</div>
                        </div>
                        <Badge label="AWAITING BILLS" color="#E09E3C" />
                      </div>
                      <div className="text-[10px] text-[#4E6180] mt-1">
                        Payment verified · Account team will upload E-Way &amp; Invoice soon
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Not yet verified */}
            {needApproval.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wider text-[#E05050] font-semibold mb-2 px-1">
                  🔒 Payment not yet verified ({needApproval.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {needApproval.map((c) => (
                    <div key={c.id} className="rounded-lg border border-[#E05050]/20 bg-[#E05050]/5 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[12px] text-[#E4AF4A] font-semibold truncate">{c.challanNumber}</div>
                          <div className="text-[12px] text-[#EDE4D0] truncate">{c.clientName}</div>
                        </div>
                        <Badge label="PENDING VERIFY" color="#E05050" />
                      </div>
                      <div className="text-[10px] text-[#4E6180] mt-1">
                        Bills unlock once Account team verifies payment
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

function BillCard({ challan: c }: { challan: Challan }) {
  const hasEway    = !!c.ewayBillNo || !!c.ewayBillFile
  const hasInvoice = !!c.invoiceNo || !!c.invoiceFile
  return (
    <div className="rounded-lg border border-[#3CB87A]/25 bg-[#3CB87A]/[0.03] p-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold text-[#E4AF4A]">{c.challanNumber}</div>
          <div className="text-[13px] text-[#EDE4D0] truncate">{c.clientName} · {c.clientCity}</div>
          <div className="text-[10px] text-[#96A8BF] mt-0.5">
            Total {fmtINR(c.amountTotal)} · Paid {fmtINR(c.amountReceived)} · {c.paymentStatus}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge label={hasEway ? 'E-Way ✓' : 'E-Way ✗'}    color={hasEway ? '#3CB87A' : '#4E6180'} />
          <Badge label={hasInvoice ? 'Invoice ✓' : 'Invoice ✗'} color={hasInvoice ? '#3CB87A' : '#4E6180'} />
        </div>
      </div>

      {/* Two-column bill view: E-Way | Invoice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* E-Way Bill column */}
        <div className="rounded-lg border border-white/7 bg-[#0c1928] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#E4AF4A] font-semibold mb-2">🚚 E-Way Bill</div>
          <div className="text-[11px] text-[#96A8BF] mb-1">Bill No.</div>
          <div className="font-mono text-[13px] text-[#EDE4D0] mb-2.5">{c.ewayBillNo || '—'}</div>
          {c.ewayBillFile ? (
            <a
              href={`/uploads/bills/${c.ewayBillFile}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-1.5 text-[11px] text-[#3CB87A] hover:bg-[#3CB87A]/20 transition-all"
            >
              📄 View E-Way PDF
            </a>
          ) : (
            <div className="text-[10px] text-[#4E6180]">No PDF uploaded</div>
          )}
        </div>

        {/* Invoice column */}
        <div className="rounded-lg border border-white/7 bg-[#0c1928] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#E4AF4A] font-semibold mb-2">🧾 Item Bill / Invoice</div>
          <div className="text-[11px] text-[#96A8BF] mb-1">Invoice No.</div>
          <div className="font-mono text-[13px] text-[#EDE4D0] mb-2.5">{c.invoiceNo || '—'}</div>
          {c.invoiceFile ? (
            <a
              href={`/uploads/bills/${c.invoiceFile}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-1.5 text-[11px] text-[#3CB87A] hover:bg-[#3CB87A]/20 transition-all"
            >
              📄 View Invoice PDF
            </a>
          ) : (
            <div className="text-[10px] text-[#4E6180]">No PDF uploaded</div>
          )}
        </div>
      </div>

      {/* Footer */}
      {c.billsUploadedBy && (
        <div className="text-[10px] text-[#4E6180] mt-2.5">
          Uploaded by <span className="text-[#96A8BF]">{c.billsUploadedBy.name}</span>
          {c.billsUploadedAt && <> on <span className="text-[#96A8BF]">{fmtDate(c.billsUploadedAt)} {new Date(c.billsUploadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></>}
        </div>
      )}
    </div>
  )
}

/* ============================================================ */
/* Tab: Client Status — full pipeline tracking timeline         */
/* ============================================================ */

type StageState = 'done' | 'active' | 'pending' | 'rejected'

type Stage = {
  key: string
  icon: string
  name: string
  state: StageState
  badge?: { label: string; color: string }
  detail: React.ReactNode
  timestamp?: string | null
  extra?: React.ReactNode
}

const STAGE_COLORS: Record<StageState, { ring: string; glow: string; line: string }> = {
  done:     { ring: '#3CB87A', glow: 'rgba(60,184,122,0.30)',  line: 'rgba(60,184,122,0.55)' },
  active:   { ring: '#E09E3C', glow: 'rgba(224,158,60,0.40)',  line: 'rgba(224,158,60,0.45)' },
  pending:  { ring: '#96A8BF', glow: 'rgba(150,168,191,0.10)', line: 'rgba(150,168,191,0.25)' },
  rejected: { ring: '#E05050', glow: 'rgba(224,80,80,0.30)',   line: 'rgba(224,80,80,0.45)' },
}

function computeCurrentStage(c: Challan): { label: string; color: string } {
  if (c.accountRejected)              return { label: 'REJECTED',  color: '#E05050' }
  if (c.reviewReceived)               return { label: 'REVIEWED',  color: '#3CB87A' }
  if (c.dispatchDate)                 return { label: 'DISPATCHED',color: '#3CB87A' }
  if (c.vehicleArranged)              return { label: 'VEHICLE',   color: '#E4AF4A' }
  if (c.warehouseCompleted)           return { label: 'PACKED',    color: '#E4AF4A' }
  const started = (c.challanItems || []).some((i) => i.warehouseStatus && i.warehouseStatus !== 'PENDING')
  if (started || c.coordinatorApproved) return { label: 'WAREHOUSE',color: '#E09E3C' }
  if (c.accountVerified)              return { label: 'VERIFIED',  color: '#3CB87A' }
  return { label: 'UPLOADED', color: '#96A8BF' }
}

function buildStages(c: Challan): Stage[] {
  const items = c.challanItems || []
  const total = items.length
  const approvedCount = items.filter((i) => i.auditStatus === 'APPROVED').length
  const qcDone       = items.filter((i) => ['QUALITY_CHECK','PACKAGING','DONE'].includes(i.warehouseStatus)).length
  const packingDone  = items.filter((i) => ['PACKAGING','DONE'].includes(i.warehouseStatus)).length
  const loadingDone  = items.filter((i) => i.warehouseStatus === 'DONE').length
  const stages: Stage[] = []

  // 1. Challan Uploaded (always done)
  stages.push({
    key: 'uploaded',
    icon: '📤',
    name: 'Challan Uploaded',
    state: 'done',
    badge: { label: 'DONE', color: '#3CB87A' },
    detail: (
      <>Challan created by <strong className="text-[#E4AF4A]">{c.uploadedBy?.name || 'Sales'}</strong> on {fmtDate(c.createdAt)}.</>
    ),
    timestamp: c.createdAt,
  })

  // 2. Account Payment Verification
  if (c.accountRejected) {
    stages.push({
      key: 'account',
      icon: '💰',
      name: 'Account Payment Verification',
      state: 'rejected',
      badge: { label: 'REJECTED', color: '#E05050' },
      detail: (
        <>✗ Rejected: <span className="text-[#E05050]">{c.accountRejectReason || 'No reason provided'}</span></>
      ),
    })
  } else if (c.accountVerified) {
    stages.push({
      key: 'account',
      icon: '💰',
      name: 'Account Payment Verification',
      state: 'done',
      badge: { label: 'VERIFIED', color: '#3CB87A' },
      detail: (
        <>✓ Verified by <strong className="text-[#E4AF4A]">{c.accountVerifiedBy?.name || 'Account Team'}</strong> on {fmtDate(c.accountVerifiedAt)}. Received <strong className="text-[#3CB87A]">{fmtINR(c.amountReceived)}</strong> / {fmtINR(c.amountTotal)}.</>
      ),
      timestamp: c.accountVerifiedAt,
    })
  } else {
    stages.push({
      key: 'account',
      icon: '💰',
      name: 'Account Payment Verification',
      state: 'active',
      badge: { label: 'PENDING', color: '#E09E3C' },
      detail: (
        <>⏳ Waiting for Account team to verify payment — received <strong className="text-[#E4AF4A]">{fmtINR(c.amountReceived)}</strong> against total <strong className="text-[#EDE4D0]">{fmtINR(c.amountTotal)}</strong>.</>
      ),
    })
  }

  // 3. Coordinator Audit
  if (c.coordinatorApproved) {
    stages.push({
      key: 'coordinator',
      icon: '🔍',
      name: 'Coordinator Audit',
      state: 'done',
      badge: { label: 'APPROVED', color: '#3CB87A' },
      detail: (
        <>✓ Audited on {fmtDate(c.coordinatorApprovedAt)}. <strong className="text-[#E4AF4A]">{approvedCount}</strong> of {total} item{total === 1 ? '' : 's'} approved.</>
      ),
      timestamp: c.coordinatorApprovedAt,
    })
  } else {
    const blocked = c.accountRejected
    stages.push({
      key: 'coordinator',
      icon: '🔍',
      name: 'Coordinator Audit',
      state: blocked ? 'pending' : (c.accountVerified ? 'active' : 'pending'),
      badge: { label: blocked ? 'BLOCKED' : 'PENDING', color: blocked ? '#4E6180' : '#96A8BF' },
      detail: blocked ? <>🔒 Blocked — payment was rejected.</> : <>⏳ Waiting for Coordinator audit.</>,
    })
  }

  // 4. Warehouse (QC → Packing → Loading)
  const warehouseStarted = qcDone > 0 || packingDone > 0 || loadingDone > 0
  const warehouseBlocked = c.accountRejected
  if (c.warehouseCompleted) {
    stages.push({
      key: 'warehouse',
      icon: '🏭',
      name: 'Warehouse — QC → Packing → Loading',
      state: 'done',
      badge: { label: 'COMPLETE', color: '#3CB87A' },
      detail: (
        <span>
          ✓ Warehouse complete on {fmtDate(c.warehouseCompletedAt)}.{' '}
          QC: <span className="text-[#3CB87A]">{qcDone}/{total}</span> ✓ ·{' '}
          Packing: <span className="text-[#3CB87A]">{packingDone}/{total}</span> ✓ ·{' '}
          Loading: <span className="text-[#3CB87A]">{loadingDone}/{total}</span> ✓
        </span>
      ),
      timestamp: c.warehouseCompletedAt,
    })
  } else {
    const isActive = warehouseStarted || (!warehouseBlocked && c.coordinatorApproved)
    stages.push({
      key: 'warehouse',
      icon: '🏭',
      name: 'Warehouse — QC → Packing → Loading',
      state: isActive ? 'active' : 'pending',
      badge: { label: warehouseStarted ? 'IN PROGRESS' : (warehouseBlocked ? 'BLOCKED' : 'PENDING'), color: warehouseStarted ? '#E09E3C' : (warehouseBlocked ? '#4E6180' : '#96A8BF') },
      detail: warehouseStarted ? (
        <span>
          QC: <span className="text-[#3CB87A]">{qcDone}/{total}</span> ✓ ·{' '}
          Packing: <span className="text-[#3CB87A]">{packingDone}/{total}</span> ✓ ·{' '}
          Loading: <span className="text-[#3CB87A]">{loadingDone}/{total}</span> ✓
        </span>
      ) : warehouseBlocked ? <>🔒 Blocked — payment was rejected.</> : <>⏳ Waiting for warehouse processing.</>,
      extra: warehouseStarted ? (
        <div className="mt-2 rounded-md border border-white/7 bg-[#0c1928]/60 overflow-hidden">
          <div className="text-[10px] uppercase tracking-wider text-[#4E6180] px-2.5 py-1.5 bg-white/[0.02] border-b border-white/7">
            Per-item warehouse status
          </div>
          <div className="divide-y divide-white/5">
            {items.map((ci) => (
              <div key={ci.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
                <div className="min-w-0">
                  <span className="text-[#EDE4D0] truncate">{ci.itemName}</span>
                  <span className="text-[#4E6180] ml-1.5">×{ci.quantity}</span>
                  {ci.model && <span className="text-[#4E6180] ml-1.5 font-mono">{ci.model}</span>}
                </div>
                <Badge
                  label={(ci.warehouseStatus || 'PENDING').replace(/_/g, ' ')}
                  color={
                    ci.warehouseStatus === 'DONE' ? '#3CB87A'
                    : ci.warehouseStatus === 'PACKAGING' ? '#E4AF4A'
                    : ci.warehouseStatus === 'QUALITY_CHECK' ? '#E09E3C'
                    : '#96A8BF'
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ) : null,
    })
  }

  // 5. Vehicle Arrangement
  if (c.vehicleArranged) {
    stages.push({
      key: 'vehicle',
      icon: '🚛',
      name: 'Vehicle Arrangement',
      state: 'done',
      badge: { label: 'ARRANGED', color: '#3CB87A' },
      detail: (
        <>✓ Vehicle: <strong className="text-[#E4AF4A]">{c.vehicleNumber || '—'}</strong>, Transporter: <strong className="text-[#E4AF4A]">{c.transporterName || '—'}</strong>, Freight: <strong className="text-[#3CB87A]">{fmtINR(c.freightAmount || 0)}</strong></>
      ),
      timestamp: c.vehicleArrangedAt,
    })
  } else {
    const blocked = c.accountRejected || !c.warehouseCompleted
    stages.push({
      key: 'vehicle',
      icon: '🚛',
      name: 'Vehicle Arrangement',
      state: blocked ? 'pending' : 'active',
      badge: { label: blocked ? 'BLOCKED' : 'PENDING', color: blocked ? '#4E6180' : '#96A8BF' },
      detail: blocked ? <>🔒 Waiting — warehouse not complete.</> : <>⏳ Waiting for vehicle arrangement.</>,
    })
  }

  // 6. Dispatch
  if (c.dispatchDate) {
    stages.push({
      key: 'dispatch',
      icon: '📦',
      name: 'Dispatch',
      state: 'done',
      badge: { label: 'DISPATCHED', color: '#3CB87A' },
      detail: <>✓ Dispatched on {fmtDate(c.dispatchDate)}.</>,
      timestamp: c.dispatchDate,
    })
  } else {
    const blocked = c.accountRejected || !c.vehicleArranged
    stages.push({
      key: 'dispatch',
      icon: '📦',
      name: 'Dispatch',
      state: blocked ? 'pending' : 'active',
      badge: { label: blocked ? 'BLOCKED' : 'PENDING', color: blocked ? '#4E6180' : '#96A8BF' },
      detail: blocked ? <>🔒 Waiting — vehicle not arranged.</> : <>⏳ Not yet dispatched.</>,
    })
  }

  // 7. Tracking Sent (WhatsApp + Email)
  const ws = c.whatsappSent
  const es = c.emailSent
  if (ws && es) {
    stages.push({
      key: 'tracking',
      icon: '📱',
      name: 'Tracking Sent',
      state: 'done',
      badge: { label: 'SENT', color: '#3CB87A' },
      detail: <>✓ WhatsApp sent on {fmtDate(c.whatsappSentAt)} · ✓ Email sent on {fmtDate(c.emailSentAt)}</>,
      timestamp: c.whatsappSentAt || c.emailSentAt,
    })
  } else if (ws || es) {
    stages.push({
      key: 'tracking',
      icon: '📱',
      name: 'Tracking Sent',
      state: 'active',
      badge: { label: 'PARTIAL', color: '#E09E3C' },
      detail: (
        <>{ws ? <>✓ WhatsApp on {fmtDate(c.whatsappSentAt)}</> : <>✗ WhatsApp pending</>} · {es ? <>✓ Email on {fmtDate(c.emailSentAt)}</> : <>✗ Email pending</>}</>
      ),
      timestamp: c.whatsappSentAt || c.emailSentAt,
    })
  } else {
    const blocked = c.accountRejected || !c.dispatchDate
    stages.push({
      key: 'tracking',
      icon: '📱',
      name: 'Tracking Sent',
      state: blocked ? 'pending' : 'active',
      badge: { label: blocked ? 'BLOCKED' : 'PENDING', color: blocked ? '#4E6180' : '#96A8BF' },
      detail: blocked ? <>🔒 Waiting — not dispatched.</> : <>⏳ Tracking not yet sent to client.</>,
    })
  }

  // 8. Client Review
  if (c.reviewReceived) {
    stages.push({
      key: 'review',
      icon: '⭐',
      name: 'Client Review',
      state: 'done',
      badge: { label: 'REVIEWED', color: '#E4AF4A' },
      detail: (
        <>
          {c.reviewRating != null && (
            <>Rating: <strong className="text-[#E4AF4A] font-mono">{'★'.repeat(c.reviewRating)}<span className="text-[#3a4a5e]">{'★'.repeat(Math.max(0, 5 - c.reviewRating))}</span></strong> · </>
          )}
          <span className="text-[#EDE4D0]">"{c.reviewReceived}"</span>
        </>
      ),
      timestamp: c.reviewReceivedAt,
    })
  } else {
    const blocked = c.accountRejected || !c.dispatchDate
    stages.push({
      key: 'review',
      icon: '⭐',
      name: 'Client Review',
      state: blocked ? 'pending' : 'active',
      badge: { label: blocked ? 'BLOCKED' : 'PENDING', color: blocked ? '#4E6180' : '#96A8BF' },
      detail: blocked ? <>🔒 Waiting — not dispatched.</> : <>⏳ Awaiting client review.</>,
    })
  }

  return stages
}

function StageRow({ stage, isLast }: { stage: Stage; isLast: boolean }) {
  const c = STAGE_COLORS[stage.state]
  const pulse = stage.state === 'active'
  return (
    <div className="flex gap-3">
      {/* Icon + connecting line column */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-[#0c1928] text-base ${pulse ? 'animate-pulse' : ''}`}
          style={{ borderColor: c.ring, boxShadow: `0 0 0 3px ${c.glow}` }}
        >
          {stage.icon}
        </div>
        {!isLast && (
          <div
            className="w-0.5 flex-1 my-1 min-h-[24px]"
            style={{ background: `linear-gradient(to bottom, ${c.line}, ${c.line}22)` }}
          />
        )}
      </div>
      {/* Content */}
      <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-5'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-serif text-sm font-bold text-[#EDE4D0]">{stage.name}</span>
          {stage.badge && <Badge label={stage.badge.label} color={stage.badge.color} />}
        </div>
        <div className="text-[12px] mt-1 text-[#96A8BF] leading-relaxed">{stage.detail}</div>
        {stage.timestamp && (
          <div className="text-[10px] mt-1 text-[#4E6180] font-mono">🕒 {fmtDate(stage.timestamp)}</div>
        )}
        {stage.extra}
      </div>
    </div>
  )
}

function ClientStatusTab({ user }: { user: SessionUser }) {
  const url = `/api/challans?role=SALES&userId=${user.id}`
  const { data, loading, error, refresh } = useFetch<{ challans: Challan[] }>(url)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const challans = data?.challans || []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return challans
    return challans.filter((c) =>
      c.challanNumber.toLowerCase().includes(q) ||
      c.clientName.toLowerCase().includes(q) ||
      c.clientCity.toLowerCase().includes(q),
    )
  }, [challans, search])

  // Derive the effective selection during render: keep the user's explicit pick
  // if it still exists, otherwise fall back to the first challan (or null).
  // This avoids cascading setState-in-effect re-renders.
  const explicitMatch = selectedId ? challans.find((c) => c.id === selectedId) : null
  const selected = explicitMatch || challans[0] || null

  const summary = useMemo(() => ({
    total: challans.length,
    pendingAccount: challans.filter((c) => !c.accountVerified && !c.accountRejected).length,
    inWarehouse: challans.filter((c) => c.coordinatorApproved && !c.warehouseCompleted).length,
    dispatched: challans.filter((c) => !!c.dispatchDate).length,
  }), [challans])

  if (loading) return <div className="text-center py-10 text-[#96A8BF] text-sm">Loading…</div>
  if (error) return (
    <Card className="p-4">
      <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{error}</div>
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Challans"   value={summary.total}          accent="#E4AF4A" icon="🧾" />
        <StatCard label="Pending Account"  value={summary.pendingAccount} accent="#E09E3C" icon="⏳" />
        <StatCard label="In Warehouse"     value={summary.inWarehouse}    accent="#E4AF4A" icon="🏭" />
        <StatCard label="Dispatched"       value={summary.dispatched}     accent="#3CB87A" icon="🚚" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Left: searchable list */}
        <Card className="p-3 lg:p-4 lg:sticky lg:top-4 lg:self-start">
          <SectionTitle
            icon="📍"
            title="Client Status"
            sub="Pick a challan to trace"
            right={<Btn size="sm" onClick={refresh}>↻</Btn>}
          />
          <Input value={search} onChange={setSearch} placeholder="Search client / challan no…" />
          {filtered.length === 0 ? (
            <div className="mt-3">
              <EmptyState icon="🔍" title="No matches" sub={challans.length === 0 ? 'Upload a challan first' : 'Try a different search'} />
            </div>
          ) : (
            <div
              className="mt-3 space-y-1.5 max-h-[70vh] overflow-y-auto pr-1"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#1e3350 transparent',
              }}
            >
              {filtered.map((c) => {
                const stage = computeCurrentStage(c)
                const isActive = c.id === selectedId
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                      isActive
                        ? 'border-[#C8922A]/50 bg-[#C8922A]/10 shadow-[0_0_0_1px_rgba(200,146,42,0.25)]'
                        : 'border-white/7 bg-[#0c1928]/40 hover:bg-white/[0.03] hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] text-[#E4AF4A] font-semibold truncate">{c.challanNumber}</span>
                      <span className="text-[10px] text-[#96A8BF] whitespace-nowrap">{fmtDate(c.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-[13px] text-[#EDE4D0] truncate">{c.clientName}</span>
                      <Badge label={stage.label} color={stage.color} />
                    </div>
                    <div className="text-[10px] text-[#4E6180] truncate mt-0.5">{c.clientCity} · {fmtINR(c.amountTotal)}</div>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* Right: pipeline timeline */}
        <Card className="p-4">
          {!selected ? (
            <EmptyState icon="📍" title="No challan selected" sub="Pick one from the left to view its full pipeline" />
          ) : (
            <PipelineTimeline challan={selected} />
          )}
        </Card>
      </div>
    </div>
  )
}

function PipelineTimeline({ challan }: { challan: Challan }) {
  const cur = computeCurrentStage(challan)
  const stages = useMemo(() => buildStages(challan), [challan])
  return (
    <>
      <SectionTitle
        icon="🧭"
        title={`Pipeline · ${challan.challanNumber}`}
        sub={`${challan.clientName} · ${challan.clientCity} · ${fmtINR(challan.amountTotal)}`}
        right={<Badge label={cur.label} color={cur.color} />}
      />
      <div>
        {stages.map((s, idx) => (
          <StageRow key={s.key} stage={s} isLast={idx === stages.length - 1} />
        ))}
      </div>
    </>
  )
}

/* ============================================================ */
/* Shared read-only display field                               */
/* ============================================================ */

function ReadonlyField({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">{label}</span>
      <div
        className={`w-full rounded-lg border px-3 py-2 text-[13px] font-mono ${
          accent
            ? 'border-[#C8922A]/40 bg-[#C8922A]/8 text-[#E4AF4A] font-bold'
            : 'border-white/10 bg-[#0c1928]/60 text-[#EDE4D0]'
        }`}
      >
        {value}
      </div>
    </label>
  )
}

/* ============================================================ */
/* Tab: Reports — CSV/Excel export                              */
/* ============================================================ */

function ReportsTab({ user }: { user: SessionUser }) {
  const now = new Date()
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly')
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  // Build the dashboard URL used for the preview count.
  // Weekly → current month (rough preview of the week's containing month).
  // Monthly → selected month/year. Yearly → selected year.
  const previewUrl = useMemo(() => {
    if (period === 'yearly') return `/api/challans/dashboard?role=SALES&userId=${user.id}&year=${year}`
    if (period === 'weekly') return `/api/challans/dashboard?role=SALES&userId=${user.id}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`
    return `/api/challans/dashboard?role=SALES&userId=${user.id}&month=${month}&year=${year}`
  }, [period, month, year, user.id])

  const { data, loading } = useFetch<DashboardData>(previewUrl, [period, month, year])
  const challanCount = data?.total ?? 0

  const periodLabel = useMemo(() => {
    if (period === 'weekly') {
      const day = now.getDay() || 7 // 0=Sun → 7
      const start = new Date(now)
      start.setDate(now.getDate() - day + 1)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `Week of ${start.toLocaleDateString('en-IN')} – ${end.toLocaleDateString('en-IN')}`
    }
    if (period === 'yearly') return `Year ${year}`
    return `${MONTH_FULL[Number(month) - 1]} ${year}`
  }, [period, month, year])

  // Year options: last year, this year, next year
  const yearOpts = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  const handleExport = async () => {
    setExporting(true)
    setExportMsg('')
    try {
      const params = new URLSearchParams({
        period,
        role: 'SALES',
        userId: user.id,
      })
      if (period === 'monthly') params.set('month', month)
      if (period === 'monthly' || period === 'yearly') params.set('year', year)
      const url = `/api/reports/export?${params.toString()}`
      // Trigger a download via a hidden <a download> link
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setExportMsg(`✓ Export started — your CSV (${challanCount} challan${challanCount === 1 ? '' : 's'}) is downloading. Opens directly in Excel.`)
    } catch (e: unknown) {
      setExportMsg(`✕ Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 border-[#C8922A]/35 bg-gradient-to-br from-[#C8922A]/10 via-[#C8922A]/4 to-transparent">
        <SectionTitle
          icon="📊"
          title="Reports & Export"
          sub="Export your challans as CSV (opens in Excel) — Sales sees only own challans"
          right={<Badge label="SALES" color="#E4AF4A" />}
        />

        <div className="space-y-4 mt-4">
          {/* Period selector */}
          <div>
            <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">Period</span>
            <div className="flex flex-wrap gap-2">
              {(['weekly', 'monthly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-lg px-4 py-2 text-[12px] font-semibold transition-all ${
                    period === p
                      ? 'bg-gradient-to-r from-[#C8922A] to-[#E4AF4A] text-[#07101f] shadow-md shadow-[#C8922A]/25'
                      : 'border border-white/10 bg-white/5 text-[#96A8BF] hover:bg-white/10 hover:text-[#EDE4D0]'
                  }`}
                >
                  {p === 'weekly' ? '📅 Weekly' : p === 'monthly' ? '🗓️ Monthly' : '📆 Yearly'}
                </button>
              ))}
            </div>
          </div>

          {/* Conditional selectors */}
          {period === 'monthly' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select
                label="Month"
                value={month}
                onChange={setMonth}
                options={MONTH_FULL.map((m, i) => ({ value: String(i + 1), label: m }))}
              />
              <Select
                label="Year"
                value={year}
                onChange={setYear}
                options={yearOpts.map((y) => ({ value: String(y), label: String(y) }))}
              />
            </div>
          )}
          {period === 'yearly' && (
            <Select
              label="Year"
              value={year}
              onChange={setYear}
              options={yearOpts.map((y) => ({ value: String(y), label: String(y) }))}
            />
          )}
          {period === 'weekly' && (
            <div className="rounded-lg border border-[#4A9EE0]/25 bg-[#4A9EE0]/8 px-3 py-2 text-[11px] text-[#4A9EE0]">
              📅 Exports the current week (Mon–Sun) — <strong>{periodLabel}</strong>
            </div>
          )}

          {/* Preview summary card */}
          <div className="rounded-xl border border-[#C8922A]/30 bg-[#0c1928]/70 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#C8922A]/25 to-[#E4AF4A]/15 border border-[#C8922A]/30 text-2xl flex-shrink-0">
                📋
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-[#4E6180] font-semibold">Preview</div>
                <div className="font-serif text-base font-bold text-[#EDE4D0]">
                  {loading ? 'Loading preview…' : `${challanCount} challan${challanCount === 1 ? '' : 's'} will be included`}
                </div>
                <div className="text-[11px] text-[#96A8BF] mt-0.5">{periodLabel}</div>
              </div>
            </div>
            {!loading && challanCount > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#4E6180]">Total Amount</div>
                  <div className="font-serif text-[#E4AF4A] font-bold">{fmtINR(data?.totalAmount ?? 0)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#4E6180]">Advance</div>
                  <div className="font-serif text-[#3CB87A] font-bold">{fmtINR(data?.totalAdvance ?? 0)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#4E6180]">Received</div>
                  <div className="font-serif text-[#3CB87A] font-bold">{fmtINR(data?.totalReceived ?? 0)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Export button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || exporting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C8922A] to-[#E4AF4A] text-[#07101f] font-bold px-6 py-3.5 text-[14px] hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#C8922A]/20"
          >
            {exporting ? (
              <>
                <span className="inline-block h-4 w-4 rounded-full border-2 border-[#07101f] border-t-transparent animate-spin" />
                Preparing export…
              </>
            ) : (
              <>
                <span className="text-lg">⬇</span>
                Export to Excel (CSV)
              </>
            )}
          </button>

          {!loading && challanCount === 0 && (
            <div className="rounded-lg border border-[#E09E3C]/30 bg-[#E09E3C]/10 px-3 py-2 text-[12px] text-[#E09E3C] text-center">
              ⚠ No challans found for {periodLabel}. The export will contain only the header row.
            </div>
          )}
          {exportMsg && (
            <div className="rounded-lg border border-[#3CB87A]/30 bg-[#3CB87A]/10 px-3 py-2 text-[12px] text-[#3CB87A]">
              {exportMsg}
            </div>
          )}

          <div className="text-[10.5px] text-[#4E6180] leading-relaxed bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
            💡 <strong className="text-[#96A8BF]">Note:</strong> The CSV file opens directly in Excel. It contains one row per challan with all client details, financials, items, and workflow status. A totals row appears at the bottom. The report is filtered to <strong className="text-[#96A8BF]">your challans only</strong> — Admin &amp; Owner can export everyone's.
          </div>
        </div>
      </Card>
    </div>
  )
}
