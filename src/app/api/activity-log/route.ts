import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/activity-log — combined IN+OUT activity log
export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '100')
  const type = searchParams.get('type') // IN | OUT | undefined(both)

  const [inward, outward] = await Promise.all([
    type === 'OUT' ? [] : db.inwardLog.findMany({
      include: { enteredBy: { select: { name: true, role: true } } },
      orderBy: { date: 'desc' }, take: limit,
    }),
    type === 'IN' ? [] : db.outwardLog.findMany({
      include: { enteredBy: { select: { name: true, role: true } } },
      orderBy: { date: 'desc' }, take: limit,
    }),
  ])

  const combined = [
    ...inward.map((i) => ({
      id: i.id, type: 'IN', date: i.date, category: i.category, itemName: i.itemName,
      model: i.model, colour: i.colour, quantity: i.quantity, unit: i.unit,
      party: i.vendor || '—', challanNumber: null, billNumber: i.billNo,
      remarks: i.remarks, enteredBy: i.enteredBy,
    })),
    ...outward.map((o) => ({
      id: o.id, type: 'OUT', date: o.date, category: o.category, itemName: o.itemName,
      model: o.model, colour: o.colour, quantity: o.quantity, unit: o.unit,
      party: o.clientName, challanNumber: o.challanNumber, billNumber: o.billNumber,
      remarks: o.remarks, enteredBy: o.enteredBy,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, limit)

  return NextResponse.json({ logs: combined })
}
