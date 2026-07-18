import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/[id]/review
// Body: { action: 'request' | 'submit', reviewText?, rating? }
// Support team requests review (15 days after dispatch) OR submits client review
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'SUPPORT' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Support can manage reviews' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { action, reviewText, rating } = body

  const challan = await db.challan.findUnique({ where: { id } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  if (action === 'request') {
    await db.challan.update({
      where: { id },
      data: {
        reviewRequested: true,
        reviewRequestedAt: new Date(),
      },
    })

    // Build WhatsApp review request URL
    const phone = (challan.clientMobile || '').replace(/\D/g, '')
    const message = `Dear ${challan.clientName},

We hope you're satisfied with your recent order (Challan: ${challan.challanNumber}).

Could you please take a moment to share your feedback about the items received? Your review helps us improve our service.

⭐ Rate from 1-5 and share your experience.

Thank you!
Laxree`

    const reviewUrl = phone
      ? `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`

    return NextResponse.json({ ok: true, reviewUrl, message: 'Review request sent to client' })
  }

  if (action === 'submit') {
    await db.challan.update({
      where: { id },
      data: {
        reviewReceived: reviewText || null,
        reviewRating: rating ? Number(rating) : null,
        reviewReceivedAt: new Date(),
        status: 'CLOSED',
      },
    })

    return NextResponse.json({ ok: true, message: 'Client review saved' })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
