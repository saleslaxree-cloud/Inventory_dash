import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/challans
// Query params: status, role, userId, month, year, accountVerified, coordinatorApproved
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const role = searchParams.get('role') || user.role
  const userId = searchParams.get('userId') || user.id
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const accountVerified = searchParams.get('accountVerified')
  const coordinatorApproved = searchParams.get('coordinatorApproved')
  const paymentStatus = searchParams.get('paymentStatus')

  const where: Record<string, unknown> = {}

  // Role-based filtering
  if (role === 'SALES') {
    where.uploadedById = userId
  }

  if (status && status !== 'ALL') where.status = status
  if (accountVerified === 'true') where.accountVerified = true
  if (accountVerified === 'false') where.accountVerified = false
  if (coordinatorApproved === 'true') where.coordinatorApproved = true
  if (coordinatorApproved === 'false') where.coordinatorApproved = false
  if (paymentStatus && paymentStatus !== 'ALL') where.paymentStatus = paymentStatus

  // Monthly filter
  if (month && year) {
    const m = Number(month)
    const y = Number(year)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59)
    where.createdAt = { gte: start, lte: end }
  } else if (year) {
    const y = Number(year)
    const start = new Date(y, 0, 1)
    const end = new Date(y, 11, 31, 23, 59, 59)
    where.createdAt = { gte: start, lte: end }
  }

  const challans = await db.challan.findMany({
    where,
    include: {
      uploadedBy: { select: { id: true, name: true, role: true } },
      challanItems: { include: { matchedItem: true } },
      accountVerifiedBy: { select: { name: true, role: true } },
      billsUploadedBy: { select: { name: true, role: true } },
      _count: { select: { workflowStages: true, messages: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ challans })
}
