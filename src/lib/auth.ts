import { db } from './db'
import { cookies } from 'next/headers'

export type SessionUser = {
  id: string
  email: string
  name: string
  role: string
  phone: string | null
  forcePasswordChange: boolean
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const userId = cookieStore.get('laxree_uid')?.value
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, phone: true, forcePasswordChange: true },
  })
  return user
}
