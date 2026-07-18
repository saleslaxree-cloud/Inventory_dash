import { PrismaClient } from '@prisma/client'
import { config as loadEnv } from 'dotenv'

// Ensure environment variables are loaded (needed when running scripts
// like `bun run db:seed` outside of Next.js, which auto-loads .env).
// `override: true` ensures the .env file always wins over any stale
// process.env value (e.g. a leftover SQLite URL from a previous session).
loadEnv({ override: true })

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    // Serverless-friendly defaults (Vercel, etc.)
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Wraps an API route handler so that any thrown error (especially Prisma
 * connection errors on serverless platforms like Vercel) is caught and
 * returned as a proper JSON response instead of an empty body — which
 * previously caused "Unexpected end of JSON input" on the client.
 *
 * We keep the REAL error message (just truncated) so the user can diagnose
 * the actual problem (e.g. missing env var, network timeout, wrong URL).
 */
export function withDb<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : 'Internal server error'

      // Detect common configuration mistakes and add helpful guidance
      let hint = ''
      if (!process.env.DATABASE_URL) {
        hint = ' [Hint: DATABASE_URL environment variable is not set. Add it in Vercel → Settings → Environment Variables.]'
      } else if (rawMessage.includes('URL must start with the protocol')) {
        hint = ' [Hint: DATABASE_URL is not a valid postgresql:// connection string.]'
      } else if (rawMessage.includes("Can't reach database") || rawMessage.includes('TIMEDOUT') || rawMessage.includes('timed out')) {
        hint = ' [Hint: Cannot reach the database. If on Vercel: 1) Ensure DATABASE_URL uses the -pooler hostname with pgbouncer=true. 2) Remove channel_binding=require. 3) Check Neon dashboard that the DB is active.]'
      } else if (rawMessage.includes('password authentication failed') || rawMessage.includes('authentication')) {
        hint = ' [Hint: Database password is incorrect. Check the credentials in DATABASE_URL.]'
      } else if (rawMessage.includes('does not exist') && rawMessage.includes('database')) {
        hint = ' [Hint: Database tables do not exist. Run: bun run db:push && bun run db:seed]'
      }

      // Truncate very long Prisma error messages but keep the useful part
      let message = rawMessage
      if (rawMessage.length > 300) {
        message = rawMessage.slice(0, 300) + '…'
      }

      return Response.json(
        {
          error: message + hint,
        },
        { status: 500 }
      )
    }
  }
}
