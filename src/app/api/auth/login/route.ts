import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/auth/login
export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!user || user.password !== password) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  if (!user.active) {
    return NextResponse.json({ error: 'Account disabled. Contact Admin.' }, { status: 403 })
  }
  const res = NextResponse.json({
    id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone,
    forcePasswordChange: user.forcePasswordChange,
  })
  res.cookies.set('laxree_uid', user.id, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
