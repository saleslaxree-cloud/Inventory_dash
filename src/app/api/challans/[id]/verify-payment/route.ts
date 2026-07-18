import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { notify } from '@/lib/notify'

// POST /api/challans/[id]/verify-payment
// Body: { verified: boolean, receivedAmount?, rejectReason? }
// Account team approves or rejects payment → sends to Coordinator (approve) or back to Sales (reject)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ACCOUNT') {
    return NextResponse.json({ error: 'Only Account team can verify payment' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { verified, receivedAmount, rejectReason } = body

  const challan = await db.challan.findUnique({ where: { id }, include: { challanItems: true } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  // ── REJECT ──
  if (!verified) {
    await db.challan.update({
      where: { id },
      data: {
        accountRejected: true,
        accountRejectedById: user.id,
        accountRejectedAt: new Date(),
        accountRejectReason: rejectReason || 'Payment could not be verified',
        status: 'UPLOADED',
      },
    })

    await db.message.create({
      data: {
        challanId: id,
        fromRole: 'ACCOUNT',
        toRole: 'SALES',
        fromUserId: user.id,
        subject: `Payment REJECTED — ${challan.challanNumber}`,
        body: `Payment for challan ${challan.challanNumber} (client: ${challan.clientName}) has been rejected.

Reason: ${rejectReason || 'Payment could not be verified in bank'}

Please follow up with the client and re-upload with corrected payment details.`,
      },
    })

    // ── FIRE NOTIFICATION to Sales: payment rejected ──
    await notify({
      toRole: 'SALES',
      fromRole: 'ACCOUNT',
      fromUserId: user.id,
      challanId: id,
      type: 'REJECTED',
      title: '⚠️ Payment Rejected',
      body: `Payment for challan ${challan.challanNumber} (${challan.clientName}) was rejected by ${user.name}. Reason: ${rejectReason || 'could not be verified'}. Follow up with client.`,
      icon: '⚠️',
    })

    return NextResponse.json({ ok: true, message: 'Payment rejected, sent back to Sales' })
  }

  // ── APPROVE ──
  const amtReceived = Number(receivedAmount) || challan.amountReceived
  const newStatus = amtReceived >= challan.amountTotal ? 'PAID' : 'PARTIAL'

  await db.challan.update({
    where: { id },
    data: {
      accountVerified: true,
      accountVerifiedById: user.id,
      accountVerifiedAt: new Date(),
      amountReceived: amtReceived,
      paymentStatus: newStatus,
      status: 'PAYMENT_VERIFIED',
    },
  })

  // Mark PAYMENT_VERIFY stage done
  await db.workflowStage.updateMany({
    where: { challanId: id, stage: 'PAYMENT_VERIFY' },
    data: { status: 'DONE', doneById: user.id, doneAt: new Date(),
      data: JSON.stringify({ verified: true, receivedAmount: amtReceived, remaining: challan.amountTotal - amtReceived, approvedBy: user.name }),
    },
  })

  // Send message to Coordinator
  const remaining = challan.amountTotal - amtReceived
  const checklistMsg = `Payment verified for ${challan.challanNumber}.

CLIENT DETAILS:
• Client: ${challan.clientName}, City: ${challan.clientCity}
• Billing Name: ${challan.billingName || challan.clientName}
• GST Number: ${challan.gstNumber || 'N/A'}
• Shipping Address: ${challan.shippingAddress || 'N/A'}
• Challan No: ${challan.challanNumber}
• Quotation No: ${challan.quotationNumber || 'N/A'}
• Expected Delivery: ${challan.expectedDeliveryDate?.toLocaleDateString() || 'TBD'}

PAYMENT:
• Total: ₹${challan.amountTotal}
• Received: ₹${amtReceived}
• Remaining: ₹${remaining}
• Status: ${newStatus}

APPROVED BY: ${user.name} at ${new Date().toLocaleString('en-IN')}

Please proceed with coordinator audit → warehouse → vehicle arrangement → dispatch.`

  await db.message.create({
    data: {
      challanId: id,
      fromRole: 'ACCOUNT',
      toRole: 'COORDINATOR',
      fromUserId: user.id,
      subject: `✅ Payment verified — proceed with audit — ${challan.challanNumber}`,
      body: checklistMsg,
    },
  })

  // ── FIRE NOTIFICATION to Coordinator: payment verified, start audit ──
  await notify({
    toRole: 'COORDINATOR',
    fromRole: 'ACCOUNT',
    fromUserId: user.id,
    challanId: id,
    type: 'PAYMENT_VERIFIED',
    title: '✅ Payment Verified',
    body: `${user.name} verified payment for challan ${challan.challanNumber} (${challan.clientName}). Received ₹${amtReceived} of ₹${challan.amountTotal}. Proceed with coordinator audit.`,
    icon: '✅',
  })

  // ── FIRE NOTIFICATION to Sales: your challan payment is verified ──
  await notify({
    toRole: 'SALES',
    fromRole: 'ACCOUNT',
    fromUserId: user.id,
    challanId: id,
    type: 'PAYMENT_VERIFIED',
    title: '✅ Payment Verified',
    body: `Payment for your challan ${challan.challanNumber} (${challan.clientName}) has been verified by ${user.name}. Now in coordinator audit.`,
    icon: '✅',
  })

  return NextResponse.json({ ok: true, message: 'Payment verified, sent to Coordinator' })
}
