import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/users
// Query: role=SALES (filter by role — accessible to COORDINATOR for employee search)
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role')

  // Coordinator can view sales employees for challan filtering
  if (user.role !== 'ADMIN' && user.role !== 'IT_MANAGER' && user.role !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const where: Record<string, unknown> = { active: true }
  if (role) where.role = role

  const users = await db.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true, phone: true, active: true, forcePasswordChange: true, createdAt: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ users })
}

// PATCH /api/users — toggle active  (ADMIN + IT_MANAGER)
export async function PATCH(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ADMIN' && user.role !== 'IT_MANAGER') {
    return NextResponse.json({ error: 'Only Admin or IT Manager can toggle users' }, { status: 403 })
  }
  const { id, active } = await req.json()
  await db.user.update({ where: { id }, data: { active: Boolean(active) } })
  return NextResponse.json({ ok: true })
}
