import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/analytics
export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await db.item.findMany({ where: { active: true } })
  const challans = await db.challan.findMany({
    include: { challanItems: true },
    orderBy: { createdAt: 'desc' },
  })

  const totalItems = items.length
  const totalStock = items.reduce((s, i) => s + i.currentStock, 0)
  const lowStock = items.filter((i) => i.currentStock <= i.minStock)
  const fastMoving = items.filter((i) => i.fastMoving).sort((a, b) => b.currentStock - a.currentStock)

  const byCategory: Record<string, number> = {}
  for (const it of items) {
    byCategory[it.category] = (byCategory[it.category] || 0) + it.currentStock
  }

  const challansByStatus: Record<string, number> = {}
  for (const c of challans) {
    challansByStatus[c.status] = (challansByStatus[c.status] || 0) + 1
  }

  const totalRevenue = challans.reduce((s, c) => s + c.amountTotal, 0)
  const totalReceived = challans.reduce((s, c) => s + c.amountReceived, 0)
  const totalPending = totalRevenue - totalReceived

  return NextResponse.json({
    totalItems,
    totalStock,
    lowStockCount: lowStock.length,
    fastMovingCount: fastMoving.length,
    lowStock,
    fastMoving: fastMoving.slice(0, 10),
    byCategory,
    challansByStatus,
    totalChallans: challans.length,
    totalRevenue,
    totalReceived,
    totalPending,
  })
}
