import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'

// GET /api/db-health — Diagnostic endpoint to check database connectivity
// Returns connection status, env var presence, and table counts.
// Useful for debugging "Cannot connect to database" errors on Vercel.
export const GET = withDb(async () => {
  const dbUrlSet = !!process.env.DATABASE_URL
  const directUrlSet = !!process.env.DIRECT_URL
  const dbUrlMasked = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')
    : null
  const hasPgbouncer = process.env.DATABASE_URL?.includes('pgbouncer=true') ?? false
  const hasChannelBinding = process.env.DATABASE_URL?.includes('channel_binding') ?? false

  // Try a simple query to verify connectivity
  const userCount = await db.user.count()
  const itemCount = await db.item.count()
  const challanCount = await db.challan.count()

  return NextResponse.json({
    status: 'ok',
    message: 'Database connection successful!',
    config: {
      DATABASE_URL_set: dbUrlSet,
      DIRECT_URL_set: directUrlSet,
      DATABASE_URL_masked: dbUrlMasked,
      pgbouncer_enabled: hasPgbouncer,
      channel_binding_present: hasChannelBinding,
    },
    counts: {
      users: userCount,
      items: itemCount,
      challans: challanCount,
    },
  })
})
