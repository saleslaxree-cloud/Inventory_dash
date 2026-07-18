import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/notifications
// Returns notifications for the current user's role (unread first, then recent read)
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') || 30)
  const unreadOnly = searchParams.get('unreadOnly') === 'true'

  const where: Record<string, unknown> = {
    OR: [{ toRole: user.role }, { toRole: '*' }],
  }
  if (unreadOnly) where.read = false

  const notifications = await db.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  })

  const unreadCount = await db.notification.count({
    where: { OR: [{ toRole: user.role }, { toRole: '*' }], read: false },
  })

  return NextResponse.json({ notifications, unreadCount })
}

// PATCH /api/notifications
// Body: { id } → mark single as read | { all: true } → mark all as read
export async function PATCH(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  if (body.all === true) {
    await db.notification.updateMany({
      where: { OR: [{ toRole: user.role }, { toRole: '*' }], read: false },
      data: { read: true },
    })
    return NextResponse.json({ ok: true, marked: 'all' })
  }

  if (body.id) {
    await db.notification.update({
      where: { id: body.id },
      data: { read: true },
    })
    return NextResponse.json({ ok: true, marked: body.id })
  }

  return NextResponse.json({ error: 'Provide { id } or { all: true }' }, { status: 400 })
}
