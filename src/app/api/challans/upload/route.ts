import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/upload
// Body: { challanNumber, clientName, clientCity, clientMobile, expectedDeliveryDate, amountTotal, amountAdvance, paymentType, items: [{itemName, itemNumber, model, quantity}] }
// System auto-analyzes each item against master inventory:
//   - MATCHED     -> itemName + model both found
//   - WRONG_MODEL -> itemName found but model differs
//   - NOT_FOUND   -> itemName not in master
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'SALES' && user.role !== 'OWNER' && user.role !== 'IT_MANAGER') {
    return NextResponse.json({ error: 'Only Sales / Owner can upload challan' }, { status: 403 })
  }

  const body = await req.json()
  const {
    challanNumber, clientName, clientCity, clientMobile, clientLocation,
    expectedDeliveryDate, amountTotal, amountAdvance, paymentType, items,
  } = body

  if (!challanNumber || !clientName || !items?.length) {
    return NextResponse.json({ error: 'challanNumber, clientName, items required' }, { status: 400 })
  }

  const existing = await db.challan.findUnique({ where: { challanNumber } })
  if (existing) {
    return NextResponse.json({ error: 'Challan number already exists' }, { status: 409 })
  }

  // ── AUTO-ANALYSIS: match each item against master inventory ──
  const allItems = await db.item.findMany()
  const analyzedItems: Array<{
    itemName: string; itemNumber: string | null; model: string | null; colour?: string | null
    quantity: number; status: string; matchedItemId: string | null;
  }> = []

  for (const ci of items) {
    const nameMatch = allItems.find(
      (m) => m.itemName.toLowerCase().trim() === String(ci.itemName).toLowerCase().trim()
    )
    let status = 'NOT_FOUND'
    let matchedItemId: string | null = null

    if (nameMatch) {
      matchedItemId = nameMatch.id
      if (ci.model && nameMatch.model.toLowerCase().trim() === String(ci.model).toLowerCase().trim()) {
        status = 'MATCHED'
      } else {
        status = 'WRONG_MODEL'
      }
    }

    analyzedItems.push({
      itemName: ci.itemName,
      itemNumber: ci.itemNumber || null,
      model: ci.model || null,
      colour: ci.colour || null,
      quantity: Number(ci.quantity) || 1,
      status,
      matchedItemId,
    })
  }

  const amtTotal = Number(amountTotal) || 0
  const amtAdvance = Number(amountAdvance) || 0
  const pType = paymentType || (amtAdvance >= amtTotal ? 'FULL' : amtAdvance > 0 ? 'ADVANCE' : 'NONE')
  const pStatus = pType === 'FULL' ? 'PAID' : pType === 'ADVANCE' ? 'PARTIAL' : 'PENDING'

  // ── Create challan with analyzed items ──
  const challan = await db.challan.create({
    data: {
      challanNumber,
      clientName,
      clientCity: clientCity || '',
      clientMobile: clientMobile || null,
      clientLocation: clientLocation || null,
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      amountTotal: amtTotal,
      amountAdvance: amtAdvance,
      amountReceived: amtAdvance,
      paymentType: pType,
      paymentStatus: pStatus,
      status: 'UPLOADED',
      uploadedById: user.id,
      challanItems: { create: analyzedItems },
    },
    include: { challanItems: { include: { matchedItem: true } } },
  })

  // ── Create workflow stages ──
  await db.workflowStage.createMany({
    data: [
      { challanId: challan.id, stage: 'PAYMENT_VERIFY',    assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'PACKING',            assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'QC',                 assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'VEHICLE_ARRANGEMENT',assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'EWAY_BILL',          assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'ITEM_BILL',          assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'DISPATCH',           assignedRole: 'SUPPORT',     status: 'PENDING', data: '{}' },
    ],
  })

  // ── Send message to Account team about advance ──
  if (amtAdvance > 0) {
    await db.message.create({
      data: {
        challanId: challan.id,
        fromRole: user.role,
        toRole: 'ACCOUNT',
        fromUserId: user.id,
        subject: `${pType === 'FULL' ? 'Full payment' : 'Advance payment'} received — ${challanNumber}`,
        body: `Client ${clientName} has paid ${pType === 'FULL' ? 'full amount' : 'advance'} of ₹${amtAdvance} against total ₹${amtTotal}. Please verify in bank and approve to proceed.`,
      },
    })
  }

  return NextResponse.json({ challan }, { status: 201 })
}
