import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { notify } from '@/lib/notify'

// POST /api/challans/[id]/warehouse
// Body: { itemId, warehouseStatus: 'QUALITY_CHECK'|'PACKAGING'|'DONE', notes? }
// Per-item warehouse workflow: PENDING → QUALITY_CHECK → PACKAGING → DONE
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'COORDINATOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Coordinator can update warehouse' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { itemId, warehouseStatus, notes } = body

  if (!itemId || !warehouseStatus) {
    return NextResponse.json({ error: 'itemId and warehouseStatus required' }, { status: 400 })
  }

  const item = await db.challanItem.findFirst({ where: { id: itemId, challanId: id } })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  await db.challanItem.update({
    where: { id: itemId },
    data: {
      warehouseStatus,
      warehouseNotes: notes || item.warehouseNotes,
      warehouseDoneAt: warehouseStatus === 'DONE' ? new Date() : item.warehouseDoneAt,
      warehouseDoneById: warehouseStatus === 'DONE' ? user.id : item.warehouseDoneById,
    },
  })

  // Check if all items are DONE → mark warehouse completed
  if (warehouseStatus === 'DONE') {
    const challan = await db.challan.findUnique({
      where: { id },
      include: { challanItems: { select: { warehouseStatus: true } } },
    })
    if (challan && challan.challanItems.every((i) => i.warehouseStatus === 'DONE')) {
      await db.challan.update({
        where: { id },
        data: {
          warehouseCompleted: true,
          warehouseCompletedAt: new Date(),
          status: 'WAREHOUSE_DONE',
        },
      })
      await db.workflowStage.updateMany({
        where: { challanId: id, stage: 'WAREHOUSE' },
        data: { status: 'DONE', doneById: user.id, doneAt: new Date() },
      })
      // Activate vehicle arrangement stage
      await db.workflowStage.updateMany({
        where: { challanId: id, stage: 'VEHICLE_ARRANGEMENT' },
        data: { status: 'IN_PROGRESS' },
      })

      // ── FIRE NOTIFICATION: warehouse done (QC + packing complete) ──
      const whChallan = await db.challan.findUnique({ where: { id }, select: { challanNumber: true, clientName: true } })
      if (whChallan) {
        await notify({
          toRole: 'ACCOUNT',
          fromRole: 'COORDINATOR',
          fromUserId: user.id,
          challanId: id,
          type: 'WAREHOUSE_DONE',
          title: '🏭 Warehouse Complete',
          body: `QC & packing done for challan ${whChallan.challanNumber} (${whChallan.clientName}). Upload E-Way Bill & Item Bill now.`,
          icon: '🏭',
        })
        await notify({
          toRole: 'SALES',
          fromRole: 'COORDINATOR',
          fromUserId: user.id,
          challanId: id,
          type: 'WAREHOUSE_DONE',
          title: '🏭 Warehouse Complete',
          body: `QC & packing complete for your challan ${whChallan.challanNumber} (${whChallan.clientName}). Vehicle arrangement in progress.`,
          icon: '🏭',
        })
      }
    }
  }

  return NextResponse.json({ ok: true, message: `Item warehouse status: ${warehouseStatus}` })
}

// PATCH /api/challans/[id]/warehouse
// Body: { itemId, dispatchImagePath }
// Upload dispatch image for an item (final review)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'COORDINATOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Coordinator can upload dispatch images' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { itemId, dispatchImagePath } = body

  if (!itemId || !dispatchImagePath) {
    return NextResponse.json({ error: 'itemId and dispatchImagePath required' }, { status: 400 })
  }

  await db.challanItem.update({
    where: { id: itemId },
    data: { dispatchImagePath },
  })

  return NextResponse.json({ ok: true, message: 'Dispatch image uploaded' })
}
