import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// PATCH /api/items/[id]  (IT_MANAGER or ADMIN)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'IT_MANAGER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only IT Manager or Admin can edit items' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const existing = await db.item.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.category !== undefined) data.category = body.category
  if (body.itemName !== undefined) data.itemName = body.itemName
  if (body.model !== undefined) data.model = body.model
  if (body.colour !== undefined) data.colour = body.colour || null
  if (body.unit !== undefined) data.unit = body.unit
  if (body.currentStock !== undefined) {
    const newStock = Number(body.currentStock) || 0
    data.currentStock = newStock
    // Track inward if stock increased
    const diff = newStock - existing.currentStock
    if (diff > 0) data.inwardCount = existing.inwardCount + diff
    else if (diff < 0) data.outwardCount = existing.outwardCount + Math.abs(diff)
  }
  if (body.minStock !== undefined) data.minStock = Number(body.minStock) || 5
  if (body.fastMoving !== undefined) data.fastMoving = Boolean(body.fastMoving)
  if (body.active !== undefined) data.active = Boolean(body.active)

  const item = await db.item.update({ where: { id }, data })
  return NextResponse.json({ item })
}

// DELETE /api/items/[id]  (IT_MANAGER or ADMIN) — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'IT_MANAGER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only IT Manager or Admin can delete items' }, { status: 403 })
  }
  const { id } = await params
  await db.item.update({ where: { id }, data: { active: false } })
  return NextResponse.json({ ok: true })
}
