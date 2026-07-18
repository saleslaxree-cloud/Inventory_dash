import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/[id]/audit
// Body: { itemId, auditStatus: 'APPROVED'|'REJECTED'|'ON_HOLD', notes? }
// Coordinator per-item audit
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'COORDINATOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Coordinator can audit' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { itemId, auditStatus, notes } = body

  if (!itemId || !auditStatus) {
    return NextResponse.json({ error: 'itemId and auditStatus required' }, { status: 400 })
  }

  const item = await db.challanItem.findFirst({ where: { id: itemId, challanId: id } })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  await db.challanItem.update({
    where: { id: itemId },
    data: {
      auditStatus,
      auditNotes: notes || null,
      auditedAt: new Date(),
      auditedById: user.id,
    },
  })

  return NextResponse.json({ ok: true, message: `Item marked ${auditStatus}` })
}

// POST /api/challans/[id]/audit?action=submit
// Final submit after all items audited → marks coordinatorApproved, sends to warehouse
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'COORDINATOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Coordinator can submit audit' }, { status: 403 })
  }
  const { id } = await params

  const challan = await db.challan.findUnique({
    where: { id },
    include: { challanItems: true },
  })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  const pending = challan.challanItems.filter((i) => i.auditStatus === 'PENDING')
  if (pending.length > 0) {
    return NextResponse.json({ error: `${pending.length} item(s) still pending audit` }, { status: 400 })
  }

  const rejected = challan.challanItems.filter((i) => i.auditStatus === 'REJECTED' || i.auditStatus === 'ON_HOLD')
  if (rejected.length > 0) {
    return NextResponse.json({ error: `${rejected.length} item(s) are rejected/on-hold — cannot submit` }, { status: 400 })
  }

  await db.challan.update({
    where: { id },
    data: {
      coordinatorApproved: true,
      coordinatorApprovedById: user.id,
      coordinatorApprovedAt: new Date(),
      status: 'COORDINATOR_AUDITED',
    },
  })

  await db.workflowStage.updateMany({
    where: { challanId: id, stage: 'COORDINATOR_AUDIT' },
    data: { status: 'DONE', doneById: user.id, doneAt: new Date(),
      data: JSON.stringify({ approvedBy: user.name, itemCount: challan.challanItems.length }),
    },
  })

  // Activate warehouse stage
  await db.workflowStage.updateMany({
    where: { challanId: id, stage: 'WAREHOUSE' },
    data: { status: 'IN_PROGRESS' },
  })

  return NextResponse.json({ ok: true, message: 'Audit submitted, sent to warehouse' })
}
