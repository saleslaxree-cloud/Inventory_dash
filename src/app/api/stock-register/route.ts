import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/stock-register — full stock register (all roles read-only)
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const lowStockOnly = searchParams.get('lowStock') === 'true'

  const items = await db.item.findMany({
    where: {
      active: true,
      ...(category && category !== 'ALL' ? { category } : {}),
    },
    orderBy: [{ category: 'asc' }, { itemName: 'asc' }, { model: 'asc' }],
  })

  // Get active holds per item
  const holds = await db.stockHold.groupBy({
    by: ['itemId'],
    where: { status: 'ACTIVE' },
    _sum: { holdQty: true },
  })
  const holdMap = new Map(holds.map((h) => [h.itemId, h._sum.holdQty || 0]))

  const rows = items
    .map((it) => {
      const held = holdMap.get(it.id) || 0
      const available = it.currentStock - held
      return {
        id: it.id,
        category: it.category,
        itemName: it.itemName,
        model: it.model,
        colour: it.colour,
        unit: it.unit,
        inward: it.inwardCount,
        dispatched: it.outwardCount,
        balance: it.currentStock,
        onHold: held,
        available,
        minStock: it.minStock,
        fastMoving: it.fastMoving,
        status: available <= 0 ? 'OUT_OF_STOCK' : available <= it.minStock ? 'LOW' : 'OK',
      }
    })
    .filter((r) => (lowStockOnly ? r.status !== 'OK' : true))

  // Summary
  const summary = {
    totalSKUs: rows.length,
    totalInward: rows.reduce((s, r) => s + r.inward, 0),
    totalDispatched: rows.reduce((s, r) => s + r.dispatched, 0),
    totalBalance: rows.reduce((s, r) => s + r.balance, 0),
    totalOnHold: rows.reduce((s, r) => s + r.onHold, 0),
    totalAvailable: rows.reduce((s, r) => s + r.available, 0),
    outOfStock: rows.filter((r) => r.status === 'OUT_OF_STOCK').length,
    lowStock: rows.filter((r) => r.status === 'LOW').length,
  }

  return NextResponse.json({ rows, summary })
}
