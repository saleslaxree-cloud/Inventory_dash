import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/overview — Cross-cutting summary for the Overview tab
// Returns ONLY data that is NOT already shown in dedicated tabs
// (Current Stock, Fast Moving, Challans, PRs, Stock Register, Forecast, Activity Log).
export const GET = withDb(async () => {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const last30 = new Date(now.getTime() - 30 * 86400000)
  const last7 = new Date(now.getTime() - 7 * 86400000)

  // ── 1. System Health Score (0-100) ──
  // Composite metric: stock health + payment health + workflow health
  const [items, challans, users, activeHolds] = await Promise.all([
    db.item.findMany({ where: { active: true }, select: { currentStock: true, minStock: true, fastMoving: true } }),
    db.challan.findMany({ select: { status: true, paymentStatus: true, amountTotal: true, amountReceived: true, createdAt: true, dispatchDate: true } }),
    db.user.count({ where: { active: true } }),
    db.stockHold.count({ where: { status: 'ACTIVE' } }),
  ])

  const lowStockCount = items.filter((i) => i.currentStock <= i.minStock).length
  const outOfStockCount = items.filter((i) => i.currentStock === 0).length
  const stockHealth = items.length > 0
    ? Math.round(((items.length - outOfStockCount) / items.length) * 100)
    : 100

  const totalRevenue = challans.reduce((s, c) => s + c.amountTotal, 0)
  const totalReceived = challans.reduce((s, c) => s + c.amountReceived, 0)
  const paymentHealth = totalRevenue > 0
    ? Math.round((totalReceived / totalRevenue) * 100)
    : 100

  // Workflow health: % of challans past UPLOADED stage (i.e., progressing)
  const progressingChallans = challans.filter((c) => c.status !== 'UPLOADED').length
  const workflowHealth = challans.length > 0
    ? Math.round((progressingChallans / challans.length) * 100)
    : 100

  const overallHealth = Math.round((stockHealth + paymentHealth + workflowHealth) / 3)

  // ── 2. Alerts (actionable items needing attention) ──
  const alerts: { severity: 'critical' | 'warning' | 'info'; message: string; tab: string }[] = []

  if (outOfStockCount > 0) {
    alerts.push({ severity: 'critical', message: `${outOfStockCount} item(s) completely out of stock`, tab: 'stock' })
  }
  if (lowStockCount > 0) {
    alerts.push({ severity: 'warning', message: `${lowStockCount} item(s) below minimum stock level`, tab: 'stock' })
  }
  const pendingChallans = challans.filter((c) => c.status === 'UPLOADED' || c.paymentStatus === 'PENDING')
  if (pendingChallans.length > 0) {
    alerts.push({ severity: 'warning', message: `${pendingChallans.length} challan(s) awaiting payment/account approval`, tab: 'challans' })
  }
  const pendingPRs = await db.purchaseRequest.count({ where: { status: 'PENDING' } })
  if (pendingPRs > 0) {
    alerts.push({ severity: 'info', message: `${pendingPRs} purchase request(s) pending review`, tab: 'pr' })
  }
  if (activeHolds > 0) {
    alerts.push({ severity: 'info', message: `${activeHolds} active stock hold(s) for clients`, tab: 'stock' })
  }

  // ── 3. Last 30 days activity (counts, not details) ──
  const challansLast30 = challans.filter((c) => new Date(c.createdAt) >= last30).length
  const dispatchesLast30 = challans.filter((c) => c.dispatchDate && new Date(c.dispatchDate) >= last30).length

  // ── 4. Last 7 days activity (for mini trend) ──
  const challansLast7 = challans.filter((c) => new Date(c.createdAt) >= last7).length

  // ── 5. Stock distribution by category (pie data, not list) ──
  const byCategory: Record<string, number> = {}
  for (const it of items) {
    byCategory[it.category] = (byCategory[it.category] || 0) + it.currentStock
  }

  // ── 6. Revenue snapshot (cross-cutting: collection rate) ──
  const collectionRate = totalRevenue > 0 ? Math.round((totalReceived / totalRevenue) * 100) : 0
  const pendingAmount = Math.max(0, totalRevenue - totalReceived)

  return NextResponse.json({
    health: {
      overall: overallHealth,
      stock: stockHealth,
      payment: paymentHealth,
      workflow: workflowHealth,
    },
    alerts,
    activity: {
      challansLast30,
      challansLast7,
      dispatchesLast30,
      activeUsers: users,
      activeHolds,
    },
    snapshot: {
      totalSKUs: items.length,
      totalChallans: challans.length,
      lowStockCount,
      outOfStockCount,
      collectionRate,
      pendingAmount,
      totalRevenue,
      totalReceived,
    },
    byCategory,
  })
})
