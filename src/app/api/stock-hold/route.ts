import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/stock-hold — list stock holds
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'ACTIVE'
  const holds = await db.stockHold.findMany({
    where: { status: status === 'ALL' ? undefined : status },
    include: { item: true, heldBy: { select: { name: true, role: true } } },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json({ holds })
}

// POST /api/stock-hold — create stock hold (SALES, ADMIN)
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SALES', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Only Sales / Admin can hold stock' }, { status: 403 })
  }
  const body = await req.json()
  const { itemId, holdQty, clientName, advanceAmount, remarks } = body
  if (!itemId || !holdQty || !clientName) {
    return NextResponse.json({ error: 'itemId, holdQty, clientName required' }, { status: 400 })
  }
  const item = await db.item.findUnique({ where: { id: itemId } })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const qty = parseInt(holdQty)
  // Check available (current - active holds)
  const activeHolds = await db.stockHold.aggregate({
    where: { itemId, status: 'ACTIVE' },
    _sum: { holdQty: true },
  })
  const held = activeHolds._sum.holdQty || 0
  const available = item.currentStock - held
  if (qty > available) {
    return NextResponse.json({ error: `Cannot hold ${qty}. Available: ${available} (after ${held} already held)` }, { status: 400 })
  }

  const hold = await db.stockHold.create({
    data: {
      itemId, category: item.category, itemName: item.itemName, model: item.model,
      colour: item.colour, holdQty: qty, clientName,
      advanceAmount: parseFloat(advanceAmount) || 0, remarks, status: 'ACTIVE',
      heldById: user.id,
    },
  })
  return NextResponse.json({ hold, message: `Held ${qty} ${item.itemName} for ${clientName}` })
}

// PATCH /api/stock-hold — release/convert a hold
export async function PATCH(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SALES', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const { id, status } = body
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  const hold = await db.stockHold.update({ where: { id }, data: { status } })
  return NextResponse.json({ hold, message: `Hold ${status.toLowerCase()}` })
}
