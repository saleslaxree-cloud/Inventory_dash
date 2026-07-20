import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// DELETE /api/challans/[id]
// Removes a challan and ALL its related records:
//   - ChallanItems
//   - WorkflowStages
//   - Messages
//   - Notifications
//   - StockHolds (auto-held against this challan)
//   - SupportChecklist
//   - PurchaseRequests (linked to this challan)
// Allowed for ADMIN, SALES (own challans only), and IT_MANAGER.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowedRoles = ['ADMIN', 'SALES', 'IT_MANAGER']
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Only Admin / Sales / IT Manager can delete challans' }, { status: 403 })
  }

  const { id } = await params

  const challan = await db.challan.findUnique({ where: { id } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  // Sales can only delete their own challans
  if (user.role === 'SALES' && challan.uploadedById !== user.id) {
    return NextResponse.json({ error: 'You can only delete your own challans' }, { status: 403 })
  }

  // Delete all related records first (some have cascade, some don't)
  await db.$transaction([
    db.notification.deleteMany({ where: { challanId: id } }),
    db.message.deleteMany({ where: { challanId: id } }),
    db.workflowStage.deleteMany({ where: { challanId: id } }),
    db.stockHold.deleteMany({ where: { challanId: id } }),
    db.purchaseRequestItem.deleteMany({
      where: { pr: { challanId: id } },
    }),
    db.purchaseRequest.deleteMany({ where: { challanId: id } }),
    db.supportChecklist.deleteMany({ where: { challanId: id } }),
    db.challanItem.deleteMany({ where: { challanId: id } }),
    db.challan.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true, message: `Challan ${challan.challanNumber} deleted` })
}
