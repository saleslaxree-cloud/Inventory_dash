import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/delete-bulk
// Body: { clientName?: string, ids?: string[] }
// Deletes all challans matching the clientName (case-insensitive, contains)
// OR all challans with id in the ids array.
// Admin / IT Manager only.
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['ADMIN', 'IT_MANAGER'].includes(user.role)) {
    return NextResponse.json({ error: 'Only Admin / IT Manager can bulk-delete challans' }, { status: 403 })
  }

  const body = await req.json()
  const { clientName, ids } = body as { clientName?: string; ids?: string[] }

  if (!clientName && !Array.isArray(ids)) {
    return NextResponse.json({ error: 'Provide clientName or ids[]' }, { status: 400 })
  }

  const where =
    clientName && clientName.trim()
      ? { clientName: { contains: clientName.trim(), mode: 'insensitive' as const } }
      : { id: { in: ids! } }

  const challans = await db.challan.findMany({
    where,
    select: { id: true, challanNumber: true, clientName: true },
  })

  if (challans.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, message: 'No matching challans found' })
  }

  const challanIds = challans.map((c) => c.id)

  await db.$transaction([
    db.notification.deleteMany({ where: { challanId: { in: challanIds } } }),
    db.message.deleteMany({ where: { challanId: { in: challanIds } } }),
    db.workflowStage.deleteMany({ where: { challanId: { in: challanIds } } }),
    db.stockHold.deleteMany({ where: { challanId: { in: challanIds } } }),
    db.purchaseRequestItem.deleteMany({
      where: { pr: { challanId: { in: challanIds } } },
    }),
    db.purchaseRequest.deleteMany({ where: { challanId: { in: challanIds } } }),
    db.supportChecklist.deleteMany({ where: { challanId: { in: challanIds } } }),
    db.challanItem.deleteMany({ where: { challanId: { in: challanIds } } }),
    db.challan.deleteMany({ where: { id: { in: challanIds } } }),
  ])

  return NextResponse.json({
    ok: true,
    deleted: challans.length,
    challans: challans.map((c) => ({ challanNumber: c.challanNumber, clientName: c.clientName })),
    message: `Deleted ${challans.length} challan(s)`,
  })
}
