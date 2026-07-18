import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/items?category=&fastMoving=
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const fastMoving = searchParams.get('fastMoving')

  const where: Record<string, unknown> = { active: true }
  if (category && category !== 'ALL') where.category = category
  if (fastMoving === 'true') where.fastMoving = true

  const items = await db.item.findMany({
    where,
    orderBy: [{ category: 'asc' }, { itemName: 'asc' }],
  })
  return NextResponse.json({ items })
}

// POST /api/items  (IT_MANAGER only)
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'IT_MANAGER') return NextResponse.json({ error: 'Only IT Manager can add items' }, { status: 403 })

  const body = await req.json()
  const { category, itemName, model, colour, unit, currentStock, minStock, fastMoving } = body
  if (!category || !itemName || !model) {
    return NextResponse.json({ error: 'category, itemName, model required' }, { status: 400 })
  }
  const item = await db.item.create({
    data: {
      category, itemName, model,
      colour: colour || null,
      unit: unit || 'PCS',
      currentStock: Number(currentStock) || 0,
      minStock: Number(minStock) || 5,
      fastMoving: Boolean(fastMoving),
    },
  })
  return NextResponse.json({ item }, { status: 201 })
}
