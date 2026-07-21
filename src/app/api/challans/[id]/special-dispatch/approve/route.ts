import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/[id]/special-dispatch/approve
// Owner approves or rejects a Coordinator's special-dispatch request for a
// partial-payment challan. Body: { action: 'approve' | 'reject', notes? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['OWNER', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Only Owner / Admin can approve special dispatch' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body.action === 'reject' ? 'reject' : 'approve'
  const notes = String(body.notes || '').trim()

  const challan = await db.challan.findUnique({ where: { id } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  if (!challan.specialDispatchRequested) {
    return NextResponse.json({ error: 'No special dispatch request pending for this challan' }, { status: 400 })
  }

  const now = new Date()
  const data: Record<string, unknown> = {
    specialDispatchApprovedById: user.id,
  }
  if (action === 'approve') {
    data.specialDispatchApproved = true
    data.specialDispatchApprovedAt = now
    data.specialDispatchRejected = false
  } else {
    data.specialDispatchRejected = true
    data.specialDispatchRejectedAt = now
    data.specialDispatchApproved = false
  }

  const updated = await db.challan.update({ where: { id }, data })

  // Notify the Coordinator (and Sales) of the decision
  const decision = action === 'approve' ? 'APPROVED' : 'REJECTED'
  const notifBody =
    `Owner has ${decision.toLowerCase()} the special dispatch request for challan ${challan.challanNumber}.\n\n` +
    `Client: ${challan.clientName}\n` +
    `Challan No: ${challan.challanNumber}\n` +
    `Decision: ${decision}\n` +
    (notes ? `Owner's note: ${notes}` : '')

  await db.notification.create({
    data: {
      toRole: 'COORDINATOR',
      fromRole: user.role,
      fromUserId: user.id,
      type: action === 'approve' ? 'SPECIAL_DISPATCH_APPROVED' : 'SPECIAL_DISPATCH_REJECTED',
      title: `${action === 'approve' ? '✅' : '🚫'} Special Dispatch ${decision} — ${challan.challanNumber}`,
      body: notifBody,
      icon: action === 'approve' ? '✅' : '🚫',
      challanId: challan.id,
      read: false,
    },
  })

  // Also notify Sales
  await db.notification.create({
    data: {
      toRole: 'SALES',
      fromRole: user.role,
      fromUserId: user.id,
      type: action === 'approve' ? 'SPECIAL_DISPATCH_APPROVED' : 'SPECIAL_DISPATCH_REJECTED',
      title: `${action === 'approve' ? '✅' : '🚫'} Special Dispatch ${decision} — ${challan.challanNumber}`,
      body: notifBody,
      icon: action === 'approve' ? '✅' : '🚫',
      challanId: challan.id,
      read: false,
    },
  })

  return NextResponse.json({
    ok: true,
    challan: updated,
    decision,
    message: `Special dispatch ${decision.toLowerCase()}`,
  })
}
