import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/support-checklist?challanId=
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const challanId = searchParams.get('challanId')

  const where: Record<string, unknown> = {}
  if (challanId) where.challanId = challanId

  const checklists = await db.supportChecklist.findMany({
    where,
    include: { challan: { select: { challanNumber: true, clientName: true, clientCity: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ checklists })
}

// POST /api/support-checklist
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'SUPPORT' && user.role !== 'IT_MANAGER') {
    return NextResponse.json({ error: 'Only Support team can create checklist' }, { status: 403 })
  }
  const body = await req.json()
  const {
    challanId, clientName, mobileNo, location, invoiceNo, challanNo,
    noOfBoxes, transporterName, vehicleTrackingNo, driverDetails,
    dispatchDate, leadTime,
    acknowledgementMessage, successfulDeliveryMessage, googleReview, generalFeedback,
    status,
  } = body

  if (!challanId || !clientName) {
    return NextResponse.json({ error: 'challanId, clientName required' }, { status: 400 })
  }

  // Upsert — one checklist per challan
  const existing = await db.supportChecklist.findUnique({ where: { challanId } })
  if (existing) {
    const updated = await db.supportChecklist.update({
      where: { challanId },
      data: {
        clientName, mobileNo, location, invoiceNo, challanNo,
        noOfBoxes: noOfBoxes ? Number(noOfBoxes) : null,
        transporterName, vehicleTrackingNo, driverDetails,
        dispatchDate: dispatchDate ? new Date(dispatchDate) : null,
        leadTime,
        acknowledgementMessage, successfulDeliveryMessage, googleReview, generalFeedback,
        status: status || existing.status,
      },
    })
    return NextResponse.json({ checklist: updated })
  }

  const checklist = await db.supportChecklist.create({
    data: {
      challanId,
      clientName, mobileNo, location, invoiceNo, challanNo,
      noOfBoxes: noOfBoxes ? Number(noOfBoxes) : null,
      transporterName, vehicleTrackingNo, driverDetails,
      dispatchDate: dispatchDate ? new Date(dispatchDate) : null,
      leadTime,
      acknowledgementMessage, successfulDeliveryMessage, googleReview, generalFeedback,
      status: status || 'DRAFT',
      createdById: user.id,
    },
  })

  // If status becomes DELIVERED/COMPLETED, message owner
  if (status === 'DELIVERED' || status === 'COMPLETED') {
    const challan = await db.challan.findUnique({ where: { id: challanId } })
    if (challan) {
      await db.message.create({
        data: {
          challanId,
          fromRole: 'SUPPORT',
          toRole: 'OWNER',
          fromUserId: user.id,
          subject: `Delivery ${status === 'COMPLETED' ? 'completed' : 'confirmed'} — ${challan.challanNumber}`,
          body: `Delivery for ${challan.clientName} marked as ${status}. Ack: ${acknowledgementMessage || 'N/A'}. Success msg: ${successfulDeliveryMessage || 'N/A'}. Review: ${googleReview || 'N/A'}. Feedback: ${generalFeedback || 'N/A'}`,
        },
      })
      await db.challan.update({ where: { id: challanId }, data: { status: status === 'COMPLETED' ? 'CLOSED' : 'DELIVERED' } })
    }
  }

  return NextResponse.json({ checklist }, { status: 201 })
}
