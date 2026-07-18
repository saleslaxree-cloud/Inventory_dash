import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/stock-check
// Cascading stock check: category → itemName → model → colour
// Returns available stock (currentStock − active holds) for matching items
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const itemName = searchParams.get('itemName')
  const model = searchParams.get('model')
  const colour = searchParams.get('colour')

  // If no params, return distinct categories for first dropdown
  if (!category) {
    const cats = await db.item.findMany({
      where: { active: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    })
    return NextResponse.json({ categories: cats.map((c) => c.category) })
  }

  // If category but no itemName, return item names for that category
  if (category && !itemName) {
    const items = await db.item.findMany({
      where: { active: true, category },
      select: { itemName: true },
      distinct: ['itemName'],
      orderBy: { itemName: 'asc' },
    })
    return NextResponse.json({ itemNames: items.map((i) => i.itemName) })
  }

  // If category + itemName but no model, return models
  if (category && itemName && !model) {
    const items = await db.item.findMany({
      where: { active: true, category, itemName },
      select: { model: true },
      distinct: ['model'],
      orderBy: { model: 'asc' },
    })
    return NextResponse.json({ models: items.map((i) => i.model) })
  }

  // If category + itemName + model but no colour, return colours
  if (category && itemName && model && !colour) {
    const items = await db.item.findMany({
      where: { active: true, category, itemName, model },
      select: { colour: true },
      orderBy: { colour: 'asc' },
    })
    const colours = items.map((i) => i.colour || 'Default').filter((v, i, arr) => arr.indexOf(v) === i)
    return NextResponse.json({ colours })
  }

  // Full filter: return matching items with available stock
  const where: Record<string, unknown> = { active: true, category, itemName, model }
  if (colour && colour !== 'Default') where.colour = colour

  const items = await db.item.findMany({ where })

  // Calculate available stock (current − active holds) for each item
  const result: Array<{
    id: string; category: string; itemName: string; model: string; colour: string | null;
    unit: string; currentStock: number; heldQty: number; availableStock: number;
    minStock: number; fastMoving: boolean;
  }> = []
  for (const item of items) {
    const activeHolds = await db.stockHold.aggregate({
      where: { itemId: item.id, status: 'ACTIVE' },
      _sum: { holdQty: true },
    })
    const held = activeHolds._sum.holdQty || 0
    const available = item.currentStock - held
    result.push({
      id: item.id,
      category: item.category,
      itemName: item.itemName,
      model: item.model,
      colour: item.colour,
      unit: item.unit,
      currentStock: item.currentStock,
      heldQty: held,
      availableStock: Math.max(0, available),
      minStock: item.minStock,
      fastMoving: item.fastMoving,
    })
  }

  return NextResponse.json({ items: result })
}
