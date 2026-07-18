import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/auth/me
export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user })
}

// PATCH /api/auth/me — change own password
export async function PATCH(req: Request) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { currentPassword, newPassword } = await req.json()
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current and new password required' }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
  }
  const dbUser = await db.user.findUnique({ where: { id: user.id } })
  if (!dbUser || dbUser.password !== currentPassword) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 })
  }
  await db.user.update({
    where: { id: user.id },
    data: { password: newPassword, forcePasswordChange: false },
  })
  return NextResponse.json({ ok: true, message: 'Password changed successfully' })
}
