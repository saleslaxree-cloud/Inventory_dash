import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/[id]/whatsapp
// Body: { trackingLink }
// Support team sends WhatsApp tracking link to client
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'SUPPORT' && user.role !== 'ADMIN' && user.role !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Only Support can send WhatsApp' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { trackingLink } = body

  const challan = await db.challan.findUnique({ where: { id } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  await db.challan.update({
    where: { id },
    data: {
      trackingLink: trackingLink || null,
      whatsappSent: true,
      whatsappSentAt: new Date(),
      status: 'IN_TRANSIT',
    },
  })

  // Build WhatsApp URL
  const phone = (challan.clientMobile || '').replace(/\D/g, '')
  const message = `Dear ${challan.clientName},

Your order has been dispatched! 🚚

Challan No: ${challan.challanNumber}
Freight Amount: ₹${challan.freightAmount}
${trackingLink ? `Track your shipment: ${trackingLink}` : ''}

Thank you for choosing LaxRee Hotel Supplies.`

  const whatsappUrl = phone
    ? `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`

  return NextResponse.json({ ok: true, whatsappUrl, message: 'WhatsApp link generated' })
}

// POST /api/challans/[id]/whatsapp?action=email
// Mark email sent
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'SUPPORT' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Support can mark email sent' }, { status: 403 })
  }
  const { id } = await params

  await db.challan.update({
    where: { id },
    data: { emailSent: true, emailSentAt: new Date() },
  })

  return NextResponse.json({ ok: true, message: 'Email marked as sent' })
}
