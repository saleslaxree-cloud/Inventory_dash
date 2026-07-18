import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/[id]/verify-payment
// Body: { verified: true, receivedAmount?: number }
// Account team verifies advance/full payment -> sends to coordinator
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ACCOUNT') {
    return NextResponse.json({ error: 'Only Account team can verify payment' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { verified, receivedAmount } = body

  const challan = await db.challan.findUnique({ where: { id }, include: { challanItems: true } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  if (!verified) {
    return NextResponse.json({ error: 'Payment not verified' }, { status: 400 })
  }

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
      data: JSON.stringify({ verified: true, receivedAmount: amtReceived, remaining: challan.amountTotal - amtReceived }),
    },
  })

  // Send message to Coordinator with checklist
  const remaining = challan.amountTotal - amtReceived
  const checklistMsg = `Payment verified for ${challan.challanNumber}.
Client: ${challan.clientName}, City: ${challan.clientCity}
Challan No: ${challan.challanNumber}
Expected Delivery: ${challan.expectedDeliveryDate?.toLocaleDateString() || 'TBD'}
Total: ₹${challan.amountTotal} | Received: ₹${amtReceived} | Remaining: ₹${remaining}

CHECKLIST:
☐ Send packing instructions to warehouse
☐ QC check
${remaining > 0 ? `⚠ Remaining payment ₹${remaining} — follow up with client` : '✓ Full payment received'}
☐ Vehicle arrangement`

  await db.message.create({
    data: {
      challanId: id,
      fromRole: 'ACCOUNT',
      toRole: 'COORDINATOR',
      fromUserId: user.id,
      subject: `Payment verified — proceed with dispatch checklist — ${challan.challanNumber}`,
      body: checklistMsg,
    },
  })

  return NextResponse.json({ ok: true, message: 'Payment verified, sent to Coordinator' })
}
