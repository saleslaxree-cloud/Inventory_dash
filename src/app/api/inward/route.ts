import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/inward — list inward logs (IT_MANAGER, ADMIN, OWNER)
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['IT_MANAGER', 'ADMIN', 'OWNER', 'ACCOUNT'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '200')
  const itemId = searchParams.get('itemId')
  const logs = await db.inwardLog.findMany({
    where: itemId ? { itemId } : {},
    include: { item: true, enteredBy: { select: { name: true, role: true } } },
    orderBy: { date: 'desc' },
    take: limit,
  })
  return NextResponse.json({ logs })
}

// POST /api/inward — create inward entry (IT_MANAGER, ADMIN)
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['IT_MANAGER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Only IT Manager / Admin can add inward entries' }, { status: 403 })
  }
  const body = await req.json()
  const { itemId, quantity, vendor, billNo, remarks, date } = body
  if (!itemId || !quantity) {
    return NextResponse.json({ error: 'itemId and quantity required' }, { status: 400 })
  }
  const item = await db.item.findUnique({ where: { id: itemId } })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const log = await db.inwardLog.create({
    data: {
      itemId, category: item.category, itemName: item.itemName, model: item.model,
      colour: item.colour, quantity: parseInt(quantity), vendor, billNo, remarks,
      enteredById: user.id, date: date ? new Date(date) : new Date(),
    },
  })
  // Update item stock
  await db.item.update({
    where: { id: itemId },
    data: {
      currentStock: { increment: parseInt(quantity) },
      inwardCount: { increment: parseInt(quantity) },
    },
  })
  return NextResponse.json({ log, message: `Inward: +${quantity} ${item.itemName}` })
}
