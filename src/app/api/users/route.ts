import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/users (IT_MANAGER only)
export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'IT_MANAGER') return NextResponse.json({ error: 'Only IT Manager' }, { status: 403 })

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, phone: true, active: true, createdAt: true },
    orderBy: { role: 'asc' },
  })
  return NextResponse.json({ users })
}
