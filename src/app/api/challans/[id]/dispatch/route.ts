import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { notify } from '@/lib/notify'

// POST /api/challans/[id]/dispatch
// Body: { }
// Coordinator marks final dispatch → sends to Support team
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'COORDINATOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Coordinator can dispatch' }, { status: 403 })
  }
  const { id } = await params

  const challan = await db.challan.findUnique({
    where: { id },
    include: { challanItems: { select: { dispatchImagePath: true } }, uploadedBy: true },
  })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  if (!challan.vehicleArranged) {
    return NextResponse.json({ error: 'Vehicle must be arranged before dispatch' }, { status: 400 })
  }

  await db.challan.update({
    where: { id },
    data: {
      dispatchDate: new Date(),
      status: 'DISPATCHED',
    },
  })

  await db.workflowStage.updateMany({
    where: { challanId: id, stage: 'DISPATCH' },
    data: { status: 'IN_PROGRESS', doneById: user.id, doneAt: new Date() },
  })
  await db.workflowStage.updateMany({
    where: { challanId: id, stage: 'PHOTOS_VIDEOS' },
    data: { status: 'DONE', doneById: user.id, doneAt: new Date() },
  })

  // Send message to Support team
  const dispatchImages = challan.challanItems.filter((i) => i.dispatchImagePath).length
  await db.message.create({
    data: {
      challanId: id,
      fromRole: 'COORDINATOR',
      toRole: 'SUPPORT',
      fromUserId: user.id,
      subject: `🚚 Challan DISPATCHED — ${challan.challanNumber}`,
      body: `Challan ${challan.challanNumber} has been dispatched!

CLIENT: ${challan.clientName}
CITY: ${challan.clientCity}
MOBILE: ${challan.clientMobile || 'N/A'}
CHALLAN NO: ${challan.challanNumber}
FREIGHT: ₹${challan.freightAmount}
TRANSPORTER: ${challan.transporterName || 'N/A'}
VEHICLE: ${challan.vehicleNumber || 'N/A'}
DISPATCH IMAGES: ${dispatchImages} item(s) with images

Please send tracking details to client via WhatsApp and email.`,
    },
  })

  // ── FIRE NOTIFICATION to Support: challan dispatched, send tracking ──
  await notify({
    toRole: 'SUPPORT',
    fromRole: 'COORDINATOR',
    fromUserId: user.id,
    challanId: id,
    type: 'DISPATCHED',
    title: '🚚 Challan Dispatched',
    body: `Challan ${challan.challanNumber} dispatched for ${challan.clientName} (${challan.clientCity}). Vehicle: ${challan.vehicleNumber || 'N/A'}. Send tracking details to client.`,
    icon: '🚚',
  })

  // ── FIRE NOTIFICATION to Sales: your challan dispatched ──
  await notify({
    toRole: 'SALES',
    fromRole: 'COORDINATOR',
    fromUserId: user.id,
    challanId: id,
    type: 'DISPATCHED',
    title: '🚚 Challan Dispatched',
    body: `Your challan ${challan.challanNumber} (${challan.clientName}) has been dispatched. Vehicle: ${challan.vehicleNumber || 'N/A'}.`,
    icon: '🚚',
  })

  // ── FIRE NOTIFICATION to Account: challan dispatched (FYI) ──
  await notify({
    toRole: 'ACCOUNT',
    fromRole: 'COORDINATOR',
    fromUserId: user.id,
    challanId: id,
    type: 'DISPATCHED',
    title: '🚚 Challan Dispatched',
    body: `Challan ${challan.challanNumber} (${challan.clientName}) dispatched by ${user.name}. Freight: ₹${challan.freightAmount}.`,
    icon: '🚚',
  })

  return NextResponse.json({ ok: true, message: 'Challan dispatched, sent to Support team' })
}
