import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/purchase-requests
export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const prs = await db.purchaseRequest.findMany({
    include: {
      items: { include: { item: true } },
      raisedBy: { select: { name: true, role: true } },
      challan: { select: { challanNumber: true, clientName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ purchaseRequests: prs })
}

// POST /api/purchase-requests
// Body: { challanId?, items: [{itemId?, itemName, model?, quantity, notes?}], notes? }
// Auto-raises PR in name of "Laxree"
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'OWNER' && user.role !== 'IT_MANAGER') {
    return NextResponse.json({ error: 'Only Owner can raise PR' }, { status: 403 })
  }
  const body = await req.json()
  const { challanId, items, notes } = body
  if (!items?.length) return NextResponse.json({ error: 'items required' }, { status: 400 })

  const count = await db.purchaseRequest.count()
  const prNumber = `PR-2026-${String(count + 1).padStart(4, '0')}`

  const pr = await db.purchaseRequest.create({
    data: {
      prNumber,
      raisedByName: 'Laxree',
      raisedById: user.id,
      challanId: challanId || null,
      notes: notes || null,
      status: 'DRAFT',
      items: {
        create: items.map((it: { itemId?: string; itemName: string; model?: string; quantity: number; notes?: string }) => ({
          itemId: it.itemId || null,
          itemName: it.itemName,
          model: it.model || null,
          quantity: Number(it.quantity) || 1,
          notes: it.notes || null,
        })),
      },
    },
    include: { items: { include: { item: true } } },
  })

  return NextResponse.json({ purchaseRequest: pr }, { status: 201 })
}

// PATCH /api/purchase-requests  — mark as printed/sent
export async function PATCH(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, status } = await req.json()
  await db.purchaseRequest.update({ where: { id }, data: { status } })
  return NextResponse.json({ ok: true })
}
