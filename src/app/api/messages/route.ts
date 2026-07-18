import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/messages
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role')

  const where: Record<string, unknown> = {}
  if (role) where.toRole = role

  const messages = await db.message.findMany({
    where,
    include: {
      fromUser: { select: { name: true, role: true } },
      challan: { select: { challanNumber: true, clientName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ messages })
}

// PATCH /api/messages  — mark as read
export async function PATCH(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await db.message.update({ where: { id }, data: { read: true } })
  return NextResponse.json({ ok: true })
}
