import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/challans/dashboard?role=SALES&userId=xxx&month=1&year=2025
// Returns dashboard summary: monthly challan counts, totals, status breakdown
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role') || user.role
  const userId = searchParams.get('userId') || user.id
  const month = searchParams.get('month') // 1-12
  const year = searchParams.get('year')

  // Base filter
  const where: Record<string, unknown> = {}
  if (role === 'SALES') {
    where.uploadedById = userId
  }

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
      challanItems: { select: { id: true, quantity: true, status: true, stockStatus: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Summary stats
  const total = challans.length
  const totalAmount = challans.reduce((s, c) => s + c.amountTotal, 0)
  const totalAdvance = challans.reduce((s, c) => s + c.amountAdvance, 0)
  const totalReceived = challans.reduce((s, c) => s + c.amountReceived, 0)

  const byStatus: Record<string, number> = {}
  const byPaymentStatus: Record<string, number> = {}
  for (const c of challans) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1
    byPaymentStatus[c.paymentStatus] = (byPaymentStatus[c.paymentStatus] || 0) + 1
  }

  // Monthly breakdown (last 12 months)
  const now = new Date()
  const monthly: Array<{ month: string; label: string; count: number; amount: number }> = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mStart = d
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
    const monthChallans = await db.challan.findMany({
      where: { ...where, createdAt: { gte: mStart, lte: mEnd } },
      select: { amountTotal: true },
    })
    monthly.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      count: monthChallans.length,
      amount: monthChallans.reduce((s, c) => s + c.amountTotal, 0),
    })
  }

  return NextResponse.json({
    total,
    totalAmount,
    totalAdvance,
    totalReceived,
    byStatus,
    byPaymentStatus,
    monthly,
    challans: challans.slice(0, 10), // latest 10
  })
}
