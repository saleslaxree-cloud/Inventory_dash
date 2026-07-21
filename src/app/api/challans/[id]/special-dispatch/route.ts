import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/[id]/special-dispatch
// Coordinator requests special approval to dispatch a PARTIAL-payment challan.
// The Owner receives an URGENT popup with the client's overview so Sir can
// approve or reject. Until then, dispatch stays blocked.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['COORDINATOR', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Only Coordinator / Admin can request special dispatch' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const reason = String(body.reason || '').trim()

  const challan = await db.challan.findUnique({
    where: { id },
    include: {
      challanItems: true,
      uploadedBy: { select: { id: true, name: true, role: true } },
    },
  })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  // Must be partial payment
  if (challan.paymentStatus === 'PAID') {
    return NextResponse.json({ error: 'This challan is already fully paid — no special approval needed' }, { status: 400 })
  }

  // Update the challan
  const updated = await db.challan.update({
    where: { id },
    data: {
      specialDispatchRequested: true,
      specialDispatchRequestedAt: new Date(),
      specialDispatchRequestedById: user.id,
      specialDispatchReason: reason || `Partial payment pending — ₹${(challan.amountTotal - challan.amountReceived).toLocaleString('en-IN')} balance. Coordinator requests special approval to dispatch.`,
      // Reset any previous decision
      specialDispatchApproved: false,
      specialDispatchRejected: false,
    },
  })

  // ── URGENT notification to OWNER ──
  const balance = challan.amountTotal - challan.amountReceived
  const itemsList = challan.challanItems
    .map((it) => `${it.itemName}${it.model ? ` (${it.model})` : ''} ×${it.quantity}`)
    .join(', ')

  const notifBody =
    `Coordinator requests special approval to dispatch this challan despite partial payment.\n\n` +
    `Client Name: ${challan.clientName}\n` +
    `Challan No: ${challan.challanNumber} · ${challan.clientCity}\n` +
    `Total Amount: ₹${challan.amountTotal.toLocaleString('en-IN')}\n` +
    `Received: ₹${challan.amountReceived.toLocaleString('en-IN')}\n` +
    `Balance Pending: ₹${balance.toLocaleString('en-IN')}\n` +
    `Items: ${itemsList}\n` +
    `Uploaded By: ${challan.uploadedBy?.name || 'Sales'}\n` +
    `Reason: ${reason || 'Coordinator requests dispatch despite pending balance'}`

  const notification = await db.notification.create({
    data: {
      toRole: 'OWNER',
      fromRole: user.role,
      fromUserId: user.id,
      type: 'SPECIAL_DISPATCH_REQUEST',
      title: '🚨 Special Dispatch Approval Required — Partial Payment Pending',
      body: notifBody,
      icon: '🚨',
      challanId: challan.id,
      read: false,
    },
  })

  // Best-effort socket.io push for real-time OWNER popup
  try {
    await fetch('http://127.0.0.1:3003/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toRole: 'OWNER',
        notification: {
          id: notification.id,
          toRole: 'OWNER',
          fromRole: user.role,
          type: 'SPECIAL_DISPATCH_REQUEST',
          title: notification.title,
          body: notification.body,
          icon: notification.icon,
          challanId: challan.id,
          createdAt: notification.createdAt,
          read: false,
        },
      }),
    })
  } catch {
    // Non-fatal — polling will still deliver the notification
  }

  // Inline message on the challan thread
  await db.message.create({
    data: {
      challanId: challan.id,
      fromRole: user.role,
      toRole: 'OWNER',
      fromUserId: user.id,
      subject: `Special dispatch approval requested — ${challan.challanNumber}`,
      body: `Coordinator requests special approval to dispatch challan ${challan.challanNumber} for client ${challan.clientName}. Total ₹${challan.amountTotal.toLocaleString('en-IN')}, received ₹${challan.amountReceived.toLocaleString('en-IN')}, balance ₹${balance.toLocaleString('en-IN')}. ${reason ? `Reason: ${reason}` : ''} Please review and approve/reject so dispatch can proceed.`,
    },
  })

  return NextResponse.json({
    ok: true,
    challan: updated,
    message: 'Special dispatch request sent to Owner — awaiting approval',
  })
}
