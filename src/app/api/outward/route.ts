import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/outward — list outward logs
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SALES', 'IT_MANAGER', 'ADMIN', 'OWNER', 'ACCOUNT', 'COORDINATOR', 'SUPPORT'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '200')
  const itemId = searchParams.get('itemId')
  const clientName = searchParams.get('clientName')
  const logs = await db.outwardLog.findMany({
    where: {
      ...(itemId ? { itemId } : {}),
      ...(clientName ? { clientName: { contains: clientName } } : {}),
    },
    include: { item: true, enteredBy: { select: { name: true, role: true } } },
    orderBy: { date: 'desc' },
    take: limit,
  })
  return NextResponse.json({ logs })
}

// POST /api/outward — create outward entry (SALES, IT_MANAGER, ADMIN)
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SALES', 'IT_MANAGER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Only Sales / IT Manager / Admin can add outward entries' }, { status: 403 })
  }
  const body = await req.json()
  const { itemId, quantity, clientName, challanNumber, billNumber, remarks, date } = body
  if (!itemId || !quantity || !clientName) {
    return NextResponse.json({ error: 'itemId, quantity, clientName required' }, { status: 400 })
  }
  const item = await db.item.findUnique({ where: { id: itemId } })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const qty = parseInt(quantity)
  // Check available stock (current - active holds)
  const activeHolds = await db.stockHold.aggregate({
    where: { itemId, status: 'ACTIVE' },
    _sum: { holdQty: true },
  })
  const held = activeHolds._sum.holdQty || 0
  const available = item.currentStock - held
  if (qty > available) {
    return NextResponse.json({ error: `Insufficient stock. Available: ${available} (after ${held} held)` }, { status: 400 })
  }

  const log = await db.outwardLog.create({
    data: {
      itemId, category: item.category, itemName: item.itemName, model: item.model,
      colour: item.colour, quantity: qty, clientName, challanNumber, billNumber, remarks,
      enteredById: user.id, date: date ? new Date(date) : new Date(),
    },
  })
  // Reduce item stock
  await db.item.update({
    where: { id: itemId },
    data: {
      currentStock: { decrement: qty },
      outwardCount: { increment: qty },
    },
  })
  return NextResponse.json({ log, message: `Outward: -${qty} ${item.itemName} → ${clientName}` })
}
