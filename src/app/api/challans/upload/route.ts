import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { notify } from '@/lib/notify'

// POST /api/challans/upload
// Body: { challanNumber, quotationNumber, clientName, clientCity, clientMobile,
//   billingName, billingAddress, shippingAddress, gstNumber,
//   expectedDeliveryDate, amountWithoutGst, amountWithGst, gstPercentage,
//   amountTotal, packingCharge, paymentMode, amountAdvance,
//   items: [{category, itemName, itemNumber, model, colour, quantity, unitPrice, totalPrice}],
//   pdfFileName }
// System auto-checks stock for each item: AVAILABLE / ON_HOLD / WILL_BE_AVAILABLE (25-30 days)
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'SALES' && user.role !== 'OWNER' && user.role !== 'IT_MANAGER') {
    return NextResponse.json({ error: 'Only Sales / Owner can upload challan' }, { status: 403 })
  }

  const body = await req.json()
  const {
    challanNumber, quotationNumber, clientName, clientCity, clientMobile, clientLocation,
    billingName, billingAddress, shippingAddress, gstNumber,
    expectedDeliveryDate, amountWithoutGst, amountWithGst, gstPercentage,
    amountTotal, packingCharge, paymentMode, amountAdvance, items, pdfFileName,
  } = body

  if (!challanNumber || !clientName || !items?.length) {
    return NextResponse.json({ error: 'challanNumber, clientName, items required' }, { status: 400 })
  }

  const existing = await db.challan.findUnique({ where: { challanNumber } })
  if (existing) {
    return NextResponse.json({ error: 'Challan number already exists' }, { status: 409 })
  }

  // ── AUTO STOCK CHECK: match each item against master inventory ──
  const allItems = await db.item.findMany({ where: { active: true } })
  const analyzedItems: Array<{
    category: string | null
    itemName: string
    itemNumber: string | null
    model: string | null
    colour: string | null
    quantity: number
    unitPrice: number
    totalPrice: number
    status: string
    stockStatus: string
    stockRemark: string
    expectedAvailabilityDays: number | null
    availableQty: number | null
    matchedItemId: string | null
  }> = []

  for (const ci of items) {
    // Find matching item in master inventory
    const nameMatch = allItems.find(
      (m) => m.itemName.toLowerCase().trim() === String(ci.itemName).toLowerCase().trim()
    )
    let status = 'NOT_FOUND'
    let matchedItemId: string | null = null
    let stockStatus = 'WILL_BE_AVAILABLE'
    let stockRemark = 'Item not in master inventory — will be procured in 25-30 days'
    let expectedAvailabilityDays: number | null = 30
    let availableQty: number | null = null

    if (nameMatch) {
      matchedItemId = nameMatch.id
      if (ci.model && nameMatch.model.toLowerCase().trim() === String(ci.model).toLowerCase().trim()) {
        status = 'MATCHED'
      } else {
        status = 'WRONG_MODEL'
      }

      // Check available stock (current − active holds)
      const activeHolds = await db.stockHold.aggregate({
        where: { itemId: nameMatch.id, status: 'ACTIVE' },
        _sum: { holdQty: true },
      })
      const held = activeHolds._sum.holdQty || 0
      const available = nameMatch.currentStock - held
      availableQty = Math.max(0, available)

      if (available >= Number(ci.quantity) || 1) {
        stockStatus = 'AVAILABLE'
        stockRemark = `In stock — ${available} units available`
        expectedAvailabilityDays = 0
      } else if (available > 0) {
        stockStatus = 'ON_HOLD'
        stockRemark = `Partial stock — ${available} available, ${Number(ci.quantity) - available} will arrive in 25-30 days`
        expectedAvailabilityDays = 30
      } else {
        stockStatus = 'WILL_BE_AVAILABLE'
        stockRemark = 'Out of stock — will be available in 25-30 days'
        expectedAvailabilityDays = 30
      }
    }

    analyzedItems.push({
      category: ci.category || null,
      itemName: ci.itemName,
      itemNumber: ci.itemNumber || null,
      model: ci.model || null,
      colour: ci.colour || null,
      quantity: Number(ci.quantity) || 1,
      unitPrice: Number(ci.unitPrice) || 0,
      totalPrice: Number(ci.totalPrice) || 0,
      status,
      stockStatus,
      stockRemark,
      expectedAvailabilityDays,
      availableQty,
      matchedItemId,
    })
  }

  const amtTotal = Number(amountTotal) || 0
  const amtAdvance = Number(amountAdvance) || 0
  const pMode = paymentMode || (amtAdvance >= amtTotal ? 'FULL' : amtAdvance > 0 ? 'PARTIAL' : 'NONE')
  const pType = pMode === 'FULL' ? 'FULL' : pMode === 'PARTIAL' ? 'ADVANCE' : 'NONE'
  const pStatus = pMode === 'FULL' ? 'PAID' : pMode === 'PARTIAL' ? 'PARTIAL' : 'PENDING'

  // ── Create challan with analyzed items ──
  const challan = await db.challan.create({
    data: {
      challanNumber,
      quotationNumber: quotationNumber || null,
      clientName,
      clientCity: clientCity || '',
      clientMobile: clientMobile || null,
      clientLocation: clientLocation || null,
      billingName: billingName || clientName,
      billingAddress: billingAddress || null,
      shippingAddress: shippingAddress || null,
      gstNumber: gstNumber || null,
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      amountWithoutGst: Number(amountWithoutGst) || 0,
      amountWithGst: Number(amountWithGst) || 0,
      gstPercentage: Number(gstPercentage) || 18,
      amountTotal: amtTotal,
      amountAdvance: amtAdvance,
      amountReceived: amtAdvance,
      packingCharge: Number(packingCharge) || 0,
      paymentType: pType,
      paymentStatus: pStatus,
      paymentMode: pMode,
      status: 'UPLOADED',
      uploadedById: user.id,
      pdfFileName: pdfFileName || null,
      challanItems: { create: analyzedItems },
    },
    include: { challanItems: { include: { matchedItem: true } } },
  })

  // ── Create workflow stages ──
  await db.workflowStage.createMany({
    data: [
      { challanId: challan.id, stage: 'PAYMENT_VERIFY',    assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'COORDINATOR_AUDIT', assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'WAREHOUSE',          assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'VEHICLE_ARRANGEMENT',assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'EWAY_BILL',          assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'ITEM_BILL',          assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'DISPATCH',           assignedRole: 'SUPPORT',     status: 'PENDING', data: '{}' },
      { challanId: challan.id, stage: 'PHOTOS_VIDEOS',      assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
    ],
  })

  // ── AUTO STOCK HOLD: reserve stock for each MATCHED + AVAILABLE item ──
  const matchedItems = analyzedItems.filter(
    (i) => i.matchedItemId && i.quantity > 0 && (i.stockStatus === 'AVAILABLE' || i.stockStatus === 'ON_HOLD')
  )
  if (matchedItems.length > 0) {
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
      const activeHolds = await db.stockHold.aggregate({
        where: { itemId, status: 'ACTIVE' },
        _sum: { holdQty: true },
      })
      const alreadyHeld = activeHolds._sum.holdQty || 0
      const available = item.currentStock - alreadyHeld
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

  // ── Send message to Account team about payment ──
  if (amtAdvance > 0 || pMode === 'FULL') {
    await db.message.create({
      data: {
        challanId: challan.id,
        fromRole: user.role,
        toRole: 'ACCOUNT',
        fromUserId: user.id,
        subject: `${pMode === 'FULL' ? 'Full payment' : 'Advance payment'} received — ${challanNumber}`,
        body: `Client ${clientName} has paid ${pMode === 'FULL' ? 'full amount' : 'advance'} of ₹${amtAdvance} against total ₹${amtTotal}.

Challan No: ${challanNumber}
Quotation No: ${quotationNumber || 'N/A'}
GST: ${gstNumber || 'N/A'}
Billing Name: ${billingName || clientName}
Shipping Address: ${shippingAddress || 'N/A'}

Please verify in bank and approve to proceed.`,
      },
    })
  }

  // ── FIRE NOTIFICATION to Account team: new challan, verify payment ──
  const paymentNote =
    pMode === 'FULL'
      ? `Full payment ₹${amtTotal} received.`
      : pMode === 'PARTIAL'
      ? `Advance ₹${amtAdvance} of ₹${amtTotal} received.`
      : `No payment received yet (total ₹${amtTotal}).`

  await notify({
    toRole: 'ACCOUNT',
    fromRole: user.role,
    fromUserId: user.id,
    challanId: challan.id,
    type: 'NEW_CHALLAN',
    title: '🧾 New Challan Uploaded',
    body: `${user.name} sent challan ${challanNumber} for ${clientName}. ${paymentNote} Check payment received or not.`,
    icon: '🧾',
  })

  // ── FIRE NOTIFICATION to Coordinator: new challan in pipeline ──
  await notify({
    toRole: 'COORDINATOR',
    fromRole: user.role,
    fromUserId: user.id,
    challanId: challan.id,
    type: 'NEW_CHALLAN',
    title: '🧾 New Challan in Pipeline',
    body: `Challan ${challanNumber} (${clientName}, ${clientCity || 'N/A'}) uploaded by ${user.name}. Pending account verification.`,
    icon: '🧾',
  })

  const availableCount = analyzedItems.filter((i) => i.stockStatus === 'AVAILABLE').length
  const willBeAvailableCount = analyzedItems.filter((i) => i.stockStatus === 'WILL_BE_AVAILABLE').length
  const onHoldCount = analyzedItems.filter((i) => i.stockStatus === 'ON_HOLD').length

  return NextResponse.json({
    challan,
    stockSummary: { available: availableCount, onHold: onHoldCount, willBeAvailable: willBeAvailableCount },
    message: `Challan uploaded & analyzed. ${availableCount} available, ${onHoldCount} partial, ${willBeAvailableCount} will be available in 25-30 days.`,
  }, { status: 201 })
}
