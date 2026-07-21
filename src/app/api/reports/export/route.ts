import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/reports/export
// Generates a CSV report of challans for the logged-in user's role.
// Query params:
//   period  = weekly | monthly | yearly
//   month   = 1..12  (used when period=monthly)
//   year    = YYYY    (used when period=monthly or yearly)
//   role    = SALES | ACCOUNT | COORDINATOR | SUPPORT | OWNER | ADMIN | IT_MANAGER (defaults to caller's role)
//   userId  = (for SALES, filters to that salesperson; defaults to caller)
//
// Returns text/csv with Content-Disposition attachment header.
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') || 'monthly'
  const role = searchParams.get('role') || user.role
  const userId = searchParams.get('userId') || user.id
  const now = new Date()
  const month = searchParams.get('month') ? Number(searchParams.get('month')) : now.getMonth() + 1
  const year = searchParams.get('year') ? Number(searchParams.get('year')) : now.getFullYear()

  // Build date range
  let start: Date
  let end: Date
  let periodLabel: string
  if (period === 'weekly') {
    // Current week (Mon-Sun)
    const day = now.getDay() || 7 // 0=Sun→7
    start = new Date(now)
    start.setDate(now.getDate() - day + 1)
    start.setHours(0, 0, 0, 0)
    end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    periodLabel = `Week of ${start.toLocaleDateString('en-IN')} – ${end.toLocaleDateString('en-IN')}`
  } else if (period === 'yearly') {
    start = new Date(year, 0, 1)
    end = new Date(year, 11, 31, 23, 59, 59)
    periodLabel = `Year ${year}`
  } else {
    // monthly (default)
    start = new Date(year, month - 1, 1)
    end = new Date(year, month, 0, 23, 59, 59)
    periodLabel = `${new Date(2000, month - 1, 1).toLocaleString('en-IN', { month: 'long' })} ${year}`
  }

  const where: Record<string, unknown> = {
    createdAt: { gte: start, lte: end },
  }
  if (role === 'SALES') where.uploadedById = userId

  const challans = await db.challan.findMany({
    where,
    include: {
      uploadedBy: { select: { name: true, role: true } },
      challanItems: true,
      accountVerifiedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Build CSV
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  const rows: string[][] = []
  // Title rows
  rows.push(['Laxree IMS — Challan Report'])
  rows.push(['Period', periodLabel])
  rows.push(['Role', role])
  rows.push(['Generated', new Date().toLocaleString('en-IN')])
  rows.push([])
  // Header
  rows.push([
    'Sl.No', 'Challan No', 'Quotation No', 'Client Name', 'Client City', 'Client Mobile',
    'Billing Name', 'GST Number', 'Expected Delivery',
    'Amount (excl GST)', 'GST %', 'Packing', 'Amount (with GST)', 'Amount Total',
    'Advance', 'Received', 'Balance', 'Payment Mode', 'Payment Status',
    'Account Verified', 'Account Verified By', 'Account Verified At',
    'Coordinator Approved', 'Coordinator Approved At',
    'Warehouse Completed', 'Warehouse Completed At',
    'Vehicle Arranged', 'Vehicle Arranged At', 'Vehicle Number', 'Transporter', 'Freight',
    'Dispatched', 'Dispatch Date',
    'Special Dispatch', 'Special Approved',
    'Uploaded By', 'Created At', 'Item Count', 'Total Qty',
    'Items',
  ])

  challans.forEach((c, i) => {
    const itemCount = c.challanItems.length
    const totalQty = c.challanItems.reduce((s, it) => s + it.quantity, 0)
    const itemsStr = c.challanItems
      .map((it) => `${it.itemName}${it.model ? ` (${it.model})` : ''} x${it.quantity}@${it.unitPrice}`)
      .join('; ')
    rows.push([
      String(i + 1),
      c.challanNumber, c.quotationNumber || '', c.clientName, c.clientCity, c.clientMobile || '',
      c.billingName || '', c.gstNumber || '',
      c.expectedDeliveryDate ? new Date(c.expectedDeliveryDate).toLocaleDateString('en-IN') : '',
      String(c.amountWithoutGst), String(c.gstPercentage), String(c.packingCharge),
      String(c.amountWithGst), String(c.amountTotal),
      String(c.amountAdvance), String(c.amountReceived),
      String(c.amountTotal - c.amountReceived),
      c.paymentMode || c.paymentType, c.paymentStatus,
      c.accountVerified ? 'Yes' : 'No',
      c.accountVerifiedBy?.name || '',
      c.accountVerifiedAt ? new Date(c.accountVerifiedAt).toLocaleDateString('en-IN') : '',
      c.coordinatorApproved ? 'Yes' : 'No',
      c.coordinatorApprovedAt ? new Date(c.coordinatorApprovedAt).toLocaleDateString('en-IN') : '',
      c.warehouseCompleted ? 'Yes' : 'No',
      c.warehouseCompletedAt ? new Date(c.warehouseCompletedAt).toLocaleDateString('en-IN') : '',
      c.vehicleArranged ? 'Yes' : 'No',
      c.vehicleArrangedAt ? new Date(c.vehicleArrangedAt).toLocaleDateString('en-IN') : '',
      c.vehicleNumber || '', c.transporterName || '', String(c.freightAmount || 0),
      c.dispatchDate ? 'Yes' : 'No',
      c.dispatchDate ? new Date(c.dispatchDate).toLocaleDateString('en-IN') : '',
      c.specialDispatchRequested ? 'Yes' : 'No',
      c.specialDispatchApproved ? 'Yes' : 'No',
      c.uploadedBy?.name || '',
      new Date(c.createdAt).toLocaleString('en-IN'),
      String(itemCount), String(totalQty),
      itemsStr,
    ])
  })

  // Totals row
  rows.push([])
  rows.push([
    '', '', '', '', '', '', '', '', '', 'TOTALS',
    '', '',
    String(challans.reduce((s, c) => s + c.amountWithGst, 0).toFixed(2)),
    String(challans.reduce((s, c) => s + c.amountTotal, 0).toFixed(2)),
    String(challans.reduce((s, c) => s + c.amountAdvance, 0).toFixed(2)),
    String(challans.reduce((s, c) => s + c.amountReceived, 0).toFixed(2)),
    String(challans.reduce((s, c) => s + (c.amountTotal - c.amountReceived), 0).toFixed(2)),
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    String(challans.length), '', '',
  ])

  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n')

  const filename = `Laxree_Report_${role}_${periodLabel.replace(/[^a-zA-Z0-9]+/g, '_')}.csv`

  return new NextResponse('\uFEFF' + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
