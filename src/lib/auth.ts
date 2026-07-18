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
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get('laxree_uid')?.value
    if (!userId) return null
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, phone: true, forcePasswordChange: true },
    })
    return user
  } catch {
    // DB unavailable — treat as no session so the user sees the login screen
    // instead of a crash / "Unexpected end of JSON input" on the client.
    return null
  }
}
