import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/forecast — forecast engine based on outward history
// Calculates avg/day dispatch and days-left per SKU
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await db.item.findMany({ where: { active: true }, orderBy: { category: 'asc' } })

  // Get first outward date per item + total dispatched in last 90 days
  const outwardLogs = await db.outwardLog.findMany({
    where: { date: { gte: new Date(Date.now() - 90 * 86400000) } },
    select: { itemId: true, quantity: true, date: true },
  })

  const firstOutDate = await db.outwardLog.groupBy({
    by: ['itemId'],
    _min: { date: true },
    _sum: { quantity: true },
  })
  const firstOutMap = new Map(firstOutDate.map((f) => [f.itemId, { firstDate: f._min.date, total: f._sum.quantity || 0 }]))

  // last 30 days dispatch
  const last30 = await db.outwardLog.groupBy({
    by: ['itemId'],
    where: { date: { gte: new Date(Date.now() - 30 * 86400000) } },
    _sum: { quantity: true },
  })
  const last30Map = new Map(last30.map((l) => [l.itemId, l._sum.quantity || 0]))

  // active holds
  const holds = await db.stockHold.groupBy({
    by: ['itemId'],
    where: { status: 'ACTIVE' },
    _sum: { holdQty: true },
  })
  const holdMap = new Map(holds.map((h) => [h.itemId, h._sum.holdQty || 0]))

  const now = Date.now()
  const forecasts = items.map((it) => {
    const fo = firstOutMap.get(it.id)
    const held = holdMap.get(it.id) || 0
    const available = it.currentStock - held
    const totalDispatched = fo?.total || it.outwardCount || 0
    const firstDate = fo?.firstDate ? new Date(fo.firstDate).getTime() : null
    const daySpan = firstDate ? Math.max(1, (now - firstDate) / 86400000) : 0
    const avgPerDay = daySpan > 0 ? totalDispatched / daySpan : 0
    const daysLeft = avgPerDay > 0 ? Math.round(available / avgPerDay) : null
    const last30Dispatch = last30Map.get(it.id) || 0
    const suggestedReorder = Math.max(50, Math.round(avgPerDay * 30))

    let status: 'critical' | 'warn' | 'ok' | 'nodata' = 'nodata'
    if (avgPerDay > 0 && daysLeft !== null) {
      if (daysLeft < 30) status = 'critical'
      else if (daysLeft < 90) status = 'warn'
      else status = 'ok'
    }

    return {
      id: it.id,
      category: it.category,
      itemName: it.itemName,
      model: it.model,
      colour: it.colour,
      balance: it.currentStock,
      held,
      available,
      minStock: it.minStock,
      totalDispatched,
      avgPerDay: parseFloat(avgPerDay.toFixed(2)),
      daysLeft,
      last30Dispatch,
      suggestedReorder,
      status,
    }
  })

  const summary = {
    totalSKUs: forecasts.length,
    critical: forecasts.filter((f) => f.status === 'critical').length,
    warn: forecasts.filter((f) => f.status === 'warn').length,
    ok: forecasts.filter((f) => f.status === 'ok').length,
    nodata: forecasts.filter((f) => f.status === 'nodata').length,
    topMoving: forecasts
      .filter((f) => f.last30Dispatch > 0)
      .sort((a, b) => b.last30Dispatch - a.last30Dispatch)
      .slice(0, 8),
    criticalItems: forecasts
      .filter((f) => f.status === 'critical')
      .sort((a, b) => (a.daysLeft || 999) - (b.daysLeft || 999))
      .slice(0, 8),
  }

  return NextResponse.json({ forecasts, summary })
}
