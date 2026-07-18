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

  // ── AUTO STOCK HOLD: reserve stock for each MATCHED item ──
  // When sales creates a challan, stock is put on hold so it cannot be double-sold.
  // Hold is linked to the challan (challanId) so it can be converted to outward on dispatch,
  // or released automatically if the challan is cancelled.
  const matchedItems = analyzedItems.filter(
    (i) => i.status === 'MATCHED' && i.matchedItemId && i.quantity > 0
  )
  if (matchedItems.length > 0) {
    // Aggregate quantities per item (a challan may list the same item twice)
    const perItem = new Map<string, number>()
    for (const mi of matchedItems) {
      const id = mi.matchedItemId!
      perItem.set(id, (perItem.get(id) || 0) + mi.quantity)
    }

    const holdData: Array<{
      itemId: string; category: string; itemName: string; model: string
      colour: string | null; holdQty: number; clientName: string
      advanceAmount: number; remarks: string; status: string
      heldById: string; challanId: string
    }> = []

    for (const [itemId, qty] of perItem.entries()) {
      const item = allItems.find((m) => m.id === itemId)
      if (!item) continue
      // Check available (current stock − existing active holds)
      const activeHolds = await db.stockHold.aggregate({
        where: { itemId, status: 'ACTIVE' },
        _sum: { holdQty: true },
      })
      const alreadyHeld = activeHolds._sum.holdQty || 0
      const available = item.currentStock - alreadyHeld
      // Only hold up to available; if insufficient, hold what's available (partial hold)
      const holdQty = Math.max(0, Math.min(qty, available))
      if (holdQty <= 0) continue
      holdData.push({
        itemId,
        category: item.category,
        itemName: item.itemName,
        model: item.model,
        colour: item.colour,
        holdQty,
        clientName,
        advanceAmount: amtAdvance > 0 ? amtAdvance / matchedItems.length : 0,
        remarks: `Auto-held on challan ${challanNumber} (qty requested: ${qty}${holdQty < qty ? `, only ${holdQty} available` : ''})`,
        status: 'ACTIVE',
        heldById: user.id,
        challanId: challan.id,
      })
    }

    if (holdData.length > 0) {
      await db.stockHold.createMany({ data: holdData })
    }
  }

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

  // Count auto-holds for the response message
  const autoHoldCount = matchedItems.length > 0
    ? await db.stockHold.count({ where: { challanId: challan.id, status: 'ACTIVE' } })
    : 0

  return NextResponse.json({
    challan,
    autoHoldCount,
    message: autoHoldCount > 0
      ? `Challan uploaded & analyzed. ${autoHoldCount} item(s) auto-held for ${clientName}.`
      : 'Challan uploaded & analyzed.',
  }, { status: 201 })
}
