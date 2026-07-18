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
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Wraps an API route handler so that any thrown error (especially Prisma
 * connection errors on serverless platforms like Vercel) is caught and
 * returned as a proper JSON response instead of an empty body — which
 * previously caused "Unexpected end of JSON input" on the client.
 */
export function withDb<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : 'Internal server error'
      // Common Prisma connection errors on serverless
      const isDbError =
        rawMessage.includes('Prisma') ||
        rawMessage.includes('database') ||
        rawMessage.includes('connection') ||
        rawMessage.includes('connect') ||
        rawMessage.includes('TIMEDOUT') ||
        rawMessage.includes('Can\'t reach database') ||
        rawMessage.includes('URL must start with') ||
        rawMessage.includes('datasource')

      // Clean up verbose Prisma dev-mode error messages
      let message = rawMessage
      if (rawMessage.includes('URL must start with the protocol')) {
        message = 'Database URL is not configured. Please set DATABASE_URL to a valid PostgreSQL connection string (e.g. postgresql://user:pass@host/db).'
      } else if (rawMessage.includes('Can\'t reach database')) {
        message = 'Cannot connect to the database. Please check that your PostgreSQL database is running and accessible.'
      } else if (isDbError && rawMessage.length > 200) {
        message = rawMessage.slice(0, 200) + '…'
      }
      return Response.json(
        {
          error: message,
        },
        { status: 500 }
      )
    }
  }
}
