import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/[id]/vehicle
// Body: { freightAmount, transporterName, vehicleNumber }
// Only after warehouse completed. Coordinator arranges vehicle.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'COORDINATOR' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Coordinator can arrange vehicle' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { freightAmount, transporterName, vehicleNumber } = body

  const challan = await db.challan.findUnique({ where: { id } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  if (!challan.warehouseCompleted) {
    return NextResponse.json({ error: 'Warehouse must be completed before vehicle arrangement' }, { status: 400 })
  }

  await db.challan.update({
    where: { id },
    data: {
      freightAmount: Number(freightAmount) || 0,
      transporterName: transporterName || null,
      vehicleNumber: vehicleNumber || null,
      vehicleArranged: true,
      vehicleArrangedAt: new Date(),
      vehicleArrangedById: user.id,
      status: 'VEHICLE_ARRANGED',
    },
  })

  await db.workflowStage.updateMany({
    where: { challanId: id, stage: 'VEHICLE_ARRANGEMENT' },
    data: { status: 'DONE', doneById: user.id, doneAt: new Date(),
      data: JSON.stringify({ freightAmount, transporterName, vehicleNumber, arrangedBy: user.name }),
    },
  })

  return NextResponse.json({ ok: true, message: 'Vehicle arranged successfully' })
}
