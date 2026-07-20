import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/purchase-requests/[id]/sign
// Owner ("Sir") checks, signs and processes an auto-raised URGENT Purchase
// Request. Marks status = PROCESSED, records signedBy + signedAt + processedAt.
//
// Body (optional):
//   { action?: 'sign' | 'process' | 'reject', notes?: string }
//   - 'sign'    → status = SIGNED   (owner has signed, awaiting processing)
//   - 'process' → status = PROCESSED (signed + forwarded to purchase team)
//   - 'reject'  → status = REJECTED
//   Default action = 'process' (one-click "Sign & Process" — Sir checks,
//   signs and forwards in a single step, as the user requested).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only the Owner can sign & process PRs. Admin can too (backstop).
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the Owner can sign & process PRs' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action: 'sign' | 'process' | 'reject' = body.action || 'process'

  const existing = await db.purchaseRequest.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'PR not found' }, { status: 404 })

  if (existing.status === 'PROCESSED') {
    return NextResponse.json({ error: 'PR is already processed' }, { status: 400 })
  }

  const now = new Date()
  const patch: {
    status: string
    signedById?: string
    signedByName?: string
    signedAt?: Date
    processedAt?: Date | null
    notes?: string
  } = {
    signedById: user.id,
    signedByName: user.name,
    signedAt: now,
  }

  if (action === 'reject') {
    patch.status = 'REJECTED'
    patch.processedAt = null
    if (body.notes) patch.notes = String(body.notes)
  } else if (action === 'sign') {
    patch.status = 'SIGNED'
    patch.processedAt = null
  } else {
    // 'process' — sign + forward in one step
    patch.status = 'PROCESSED'
    patch.processedAt = now
  }

  const updated = await db.purchaseRequest.update({
    where: { id },
    data: patch,
    include: {
      items: { include: { item: true } },
      raisedBy: { select: { name: true, role: true } },
      challan: { select: { challanNumber: true, clientName: true } },
    },
  })

  return NextResponse.json({ purchaseRequest: updated })
}
