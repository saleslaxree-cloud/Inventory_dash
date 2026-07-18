/**
 * Server-side notification helper.
 *
 * Usage in API routes:
 *   import { notify } from '@/lib/notify'
 *   await notify({
 *     toRole: 'ACCOUNT',
 *     fromRole: user.role,
 *     fromUserId: user.id,
 *     challanId: challan.id,
 *     type: 'NEW_CHALLAN',
 *     title: 'New Challan Uploaded',
 *     body: `${user.name} sent challan ${challan.challanNumber}. Check payment received or not.`,
 *     icon: '🧾',
 *   })
 *
 * This function:
 *   1. Persists a Notification record in the DB (so it survives page refresh)
 *   2. POSTs to the notify mini-service (port 3003) which broadcasts via socket.io
 *   3. Never throws — notification failures should NOT break the main API flow
 */
import { db } from './db'

const NOTIFY_SERVICE_URL = 'http://127.0.0.1:3003/emit'

type NotifyArgs = {
  toRole: string               // ACCOUNT | COORDINATOR | SUPPORT | SALES | OWNER | ADMIN | IT_MANAGER | '*'
  fromRole?: string
  fromUserId?: string
  challanId?: string
  type: string                 // NEW_CHALLAN | PAYMENT_VERIFIED | COORDINATOR_APPROVED | WAREHOUSE_DONE | VEHICLE_ARRANGED | DISPATCHED | BILLS_UPLOADED | REJECTED | INFO
  title: string
  body: string
  icon?: string
}

export async function notify(args: NotifyArgs) {
  try {
    // 1. Persist to DB
    const record = await db.notification.create({
      data: {
        toRole: args.toRole,
        fromRole: args.fromRole || null,
        fromUserId: args.fromUserId || null,
        challanId: args.challanId || null,
        type: args.type,
        title: args.title,
        body: args.body,
        icon: args.icon || '🔔',
      },
    })

    // 2. Broadcast via socket.io (fire-and-forget, never block)
    fetch(NOTIFY_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toRole: args.toRole,
        notification: {
          id: record.id,
          toRole: args.toRole,
          fromRole: args.fromRole,
          type: args.type,
          title: args.title,
          body: args.body,
          icon: args.icon || '🔔',
          challanId: args.challanId,
          createdAt: record.createdAt.toISOString(),
        },
      }),
    }).catch(() => { /* silent — mini-service may be down */ })

    return record
  } catch {
    // Silent failure — notifications must never break the main workflow
    return null
  }
}
