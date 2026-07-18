import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/challans/[id]/workflow  -> list all stages for a challan
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const stages = await db.workflowStage.findMany({
    where: { challanId: id },
    orderBy: { createdAt: 'asc' },
    include: { doneBy: { select: { name: true, role: true } } },
  })
  return NextResponse.json({ stages })
}

// POST /api/challans/[id]/workflow
// Body: { stage, status: 'DONE'|'IN_PROGRESS', data?: {}, notes? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { stage, status, data, notes } = body

  const stageRow = await db.workflowStage.findFirst({ where: { challanId: id, stage } })
  if (!stageRow) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  // Role check
  const roleAllowed: Record<string, string[]> = {
    PACKING: ['COORDINATOR'],
    QC: ['COORDINATOR'],
    VEHICLE_ARRANGEMENT: ['COORDINATOR'],
    EWAY_BILL: ['ACCOUNT'],
    ITEM_BILL: ['ACCOUNT'],
    DISPATCH: ['SUPPORT', 'COORDINATOR'],
    PAYMENT_VERIFY: ['ACCOUNT'],
  }
  const allowed = roleAllowed[stage] || []
  if (allowed.length && !allowed.includes(user.role) && user.role !== 'IT_MANAGER') {
    return NextResponse.json({ error: `Only ${allowed.join('/')} can update this stage` }, { status: 403 })
  }

  await db.workflowStage.update({
    where: { id: stageRow.id },
    data: {
      status,
      data: data ? JSON.stringify(data) : stageRow.data,
      notes: notes ?? stageRow.notes,
      doneById: status === 'DONE' ? user.id : stageRow.doneById,
      doneAt: status === 'DONE' ? new Date() : stageRow.doneAt,
    },
  })

  // If DISPATCH done -> message support team
  if (stage === 'DISPATCH' && status === 'DONE') {
    const challan = await db.challan.findUnique({ where: { id } })
    if (challan) {
      await db.message.create({
        data: {
          challanId: id,
          fromRole: user.role,
          toRole: 'SUPPORT',
          fromUserId: user.id,
          subject: `Dispatch ready — fill support checklist — ${challan.challanNumber}`,
          body: `Items dispatched for ${challan.clientName}. Please fill the dispatch checklist (client name, mobile, location, invoice, boxes, transporter, vehicle, driver, dispatch date, lead time) and capture delivery feedback.`,
        },
      })
      await db.challan.update({ where: { id }, data: { status: 'DISPATCHED' } })
    }
  }

  // If PHOTOS_VIDEOS stage with attachments -> message admin/owner
  if (stage === 'PHOTOS_VIDEOS' && status === 'DONE' && data?.attachments?.length) {
    const challan = await db.challan.findUnique({ where: { id } })
    if (challan) {
      await db.message.create({
        data: {
          challanId: id,
          fromRole: user.role,
          toRole: 'OWNER',
          fromUserId: user.id,
          subject: `Photos/videos uploaded — ${challan.challanNumber}`,
          body: `Coordinator uploaded ${data.attachments.length} media file(s) for items in challan ${challan.challanNumber}. Files: ${data.attachments.join(', ')}`,
          attachments: JSON.stringify(data.attachments),
        },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
