import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { notify } from '@/lib/notify'

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

  // Notify the Coordinator (and Sales) of the decision.
  // We use the shared `notify()` helper so the DB record is created AND the
  // socket.io push fires in one shot — previously the popup was only appearing
  // via the 5s polling fallback (noticeably delayed).
  const decision = action === 'approve' ? 'APPROVED' : 'REJECTED'
  const notifType = action === 'approve' ? 'SPECIAL_DISPATCH_APPROVED' : 'SPECIAL_DISPATCH_REJECTED'
  const notifTitle = `${action === 'approve' ? '✅' : '🚫'} Special Dispatch ${decision} — ${challan.challanNumber}`
  const notifIcon = action === 'approve' ? '✅' : '🚫'
  const notifBody =
    `Owner has ${decision.toLowerCase()} the special dispatch request for challan ${challan.challanNumber}.\n\n` +
    `Client: ${challan.clientName}\n` +
    `Challan No: ${challan.challanNumber}\n` +
    `Decision: ${decision}\n` +
    (notes ? `Owner's note: ${notes}` : '')

  await notify({
    toRole: 'COORDINATOR',
    fromRole: user.role,
    fromUserId: user.id,
    challanId: challan.id,
    type: notifType,
    title: notifTitle,
    body: notifBody,
    icon: notifIcon,
  })

  // Also notify Sales (so the rep knows whether dispatch will proceed)
  await notify({
    toRole: 'SALES',
    fromRole: user.role,
    fromUserId: user.id,
    challanId: challan.id,
    type: notifType,
    title: notifTitle,
    body: notifBody,
    icon: notifIcon,
  })

  // ── Inline message on the challan thread (audit trail) ──
  // Mirrors what the special-dispatch request route does so the Owner's
  // decision is recorded permanently on the challan message thread.
  await db.message.create({
    data: {
      challanId: challan.id,
      fromRole: user.role,
      toRole: 'COORDINATOR',
      fromUserId: user.id,
      subject: `Special dispatch ${decision.toLowerCase()} — ${challan.challanNumber}`,
      body:
        `Owner ${user.name} has ${decision.toLowerCase()} the special dispatch request for challan ${challan.challanNumber} (client: ${challan.clientName}). ` +
        `Total: ₹${challan.amountTotal.toLocaleString('en-IN')}, received: ₹${challan.amountReceived.toLocaleString('en-IN')}, balance: ₹${(challan.amountTotal - challan.amountReceived).toLocaleString('en-IN')}.` +
        (notes ? ` Owner's note: ${notes}` : '') +
        (action === 'approve'
          ? ' Coordinator may now proceed with vehicle arrangement and dispatch.'
          : ' Dispatch remains blocked — please follow up with the client for the balance payment.'),
    },
  })

  return NextResponse.json({
    ok: true,
    challan: updated,
    decision,
    message: `Special dispatch ${decision.toLowerCase()}`,
  })
}
