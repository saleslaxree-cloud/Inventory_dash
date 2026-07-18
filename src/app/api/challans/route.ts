import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/challans
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const where: Record<string, unknown> = {}
  if (status && status !== 'ALL') where.status = status

  const challans = await db.challan.findMany({
    where,
    include: {
      uploadedBy: { select: { name: true, role: true } },
      challanItems: { include: { matchedItem: true } },
      _count: { select: { workflowStages: true, messages: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ challans })
}
