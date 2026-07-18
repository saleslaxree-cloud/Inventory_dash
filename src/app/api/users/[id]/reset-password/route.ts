import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/users/[id]/reset-password  (ADMIN only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Admin can reset passwords' }, { status: 403 })
  }
  const { id } = await params
  const { newPassword } = await req.json()
  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  await db.user.update({
    where: { id },
    data: { password: newPassword, forcePasswordChange: true },
  })
  return NextResponse.json({ ok: true, message: `Password reset for ${target.name}` })
}
