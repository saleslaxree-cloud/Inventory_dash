import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/upload
// Sales uploads a new challan. The server:
//   1. Validates input
//   2. Matches each ChallanItem against the master Item inventory
//   3. Computes per-item stock status (AVAILABLE / ON_HOLD / WILL_BE_AVAILABLE)
//   4. Creates the Challan + ChallanItems + initial WorkflowStages
//   5. Notifies the ACCOUNT team about the advance payment
//   6. (Optionally) creates a StockHold for matched items when an advance is paid
//   7. Returns the new challan + stock summary in the shape the frontend expects
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SALES', 'ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Only Sales / Admin can upload challans' }, { status: 403 })
  }

  const body = await req.json()

  // ── 1. Validate ──────────────────────────────────────────────
  const challanNumber = String(body.challanNumber || '').trim()
  const clientName = String(body.clientName || '').trim()
  const clientCity = String(body.clientCity || '').trim()

  if (!challanNumber) return NextResponse.json({ error: 'Challan number is required' }, { status: 400 })
  if (!clientName) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
  if (!clientCity) return NextResponse.json({ error: 'Client city is required' }, { status: 400 })

  const rawItems = Array.isArray(body.items) ? body.items : []
  const validItems = rawItems
    .map((it: any) => ({
      category: String(it.category || '').trim() || null,
      itemName: String(it.itemName || '').trim(),
      itemNumber: String(it.itemNumber || '').trim() || null,
      model: String(it.model || '').trim() || null,
      colour: String(it.colour || '').trim() || null,
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      totalPrice: Number(it.totalPrice) || (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    }))
    .filter((it: any) => it.itemName && it.quantity > 0)

  if (validItems.length === 0) {
    return NextResponse.json({ error: 'At least one item with a name and quantity is required' }, { status: 400 })
  }

  // Unique challan number
  const existing = await db.challan.findUnique({ where: { challanNumber } })
  if (existing) {
    return NextResponse.json({ error: `Challan number "${challanNumber}" already exists` }, { status: 409 })
  }

  // ── 2. Financials ────────────────────────────────────────────
  const amountWithoutGst = Number(body.amountWithoutGst) || 0
  const gstPercentage = Number(body.gstPercentage) || 0
  const packingCharge = Number(body.packingCharge) || 0
  const amountWithGst = Number(body.amountWithGst) || amountWithoutGst * (1 + gstPercentage / 100)
  const amountTotal = Number(body.amountTotal) || amountWithGst + packingCharge
  const amountAdvance = Number(body.amountAdvance) || 0
  const paymentMode = String(body.paymentMode || 'FULL') === 'PARTIAL' ? 'PARTIAL' : 'FULL'
  const paymentType = paymentMode === 'PARTIAL' ? 'ADVANCE' : 'FULL'
  const paymentStatus = amountAdvance >= amountTotal ? 'PAID' : amountAdvance > 0 ? 'PARTIAL' : 'PENDING'

  // ── 3. Match items against master inventory ─────────────────
  // Pull all master items once (small inventory) so we can match in JS.
  const masterItems = await db.item.findMany({ where: { active: true } })

  // Pull active stock holds so we can compute net available stock
  const holds = await db.stockHold.groupBy({
    by: ['itemId'],
    where: { status: 'ACTIVE' },
    _sum: { holdQty: true },
  })
  const holdMap = new Map<string, number>()
  for (const h of holds) holdMap.set(h.itemId, h._sum.holdQty || 0)

  const matchedItemRows: Array<{
    // For ChallanItem create
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
    stockRemark: string | null
    expectedAvailabilityDays: number | null
    availableQty: number | null
    matchedItemId: string | null
    // Extra context for stock-hold creation
    _matchedItem: typeof masterItems[number] | null
  }> = []

  for (const it of validItems) {
    let matched: typeof masterItems[number] | null = null

    // Match priority: itemNumber → itemName+model → itemName only
    if (it.itemNumber) {
      matched =
        masterItems.find((m) => (m.model || '').toLowerCase() === it.itemNumber!.toLowerCase()) ||
        masterItems.find((m) => (m.model || '').toLowerCase().includes(it.itemNumber!.toLowerCase())) ||
        null
    }
    if (!matched && it.model) {
      matched =
        masterItems.find(
          (m) =>
            m.itemName.toLowerCase() === it.itemName.toLowerCase() &&
            (m.model || '').toLowerCase() === it.model!.toLowerCase(),
        ) ||
        masterItems.find(
          (m) =>
            m.itemName.toLowerCase() === it.itemName.toLowerCase() &&
            (m.model || '').toLowerCase().includes(it.model!.toLowerCase()),
        ) ||
        null
    }
    if (!matched) {
      matched =
        masterItems.find((m) => m.itemName.toLowerCase() === it.itemName.toLowerCase()) ||
        masterItems.find((m) => m.itemName.toLowerCase().includes(it.itemName.toLowerCase())) ||
        null
    }

    if (!matched) {
      matchedItemRows.push({
        ...it,
        status: 'NOT_FOUND',
        stockStatus: 'PENDING',
        stockRemark: 'Item not found in master inventory — IT Manager to add it',
        expectedAvailabilityDays: null,
        availableQty: null,
        matchedItemId: null,
        _matchedItem: null,
      })
      continue
    }

    const held = holdMap.get(matched.id) || 0
    const netAvailable = matched.currentStock - held

    let stockStatus = 'WILL_BE_AVAILABLE'
    let stockRemark: string | null = null
    let expectedAvailabilityDays: number | null = 30
    let availableQty: number | null = Math.max(0, netAvailable)

    if (netAvailable >= it.quantity) {
      stockStatus = 'AVAILABLE'
      stockRemark = `${netAvailable} in stock (after ${held} on hold)`
      expectedAvailabilityDays = null
    } else if (netAvailable > 0) {
      stockStatus = 'ON_HOLD'
      stockRemark = `Only ${netAvailable} available (need ${it.quantity}); ${it.quantity - netAvailable} on back-order`
      expectedAvailabilityDays = 30
    } else {
      stockStatus = 'WILL_BE_AVAILABLE'
      stockRemark = `Out of stock — expected in 25–30 days`
      expectedAvailabilityDays = 30
      availableQty = 0
    }

    // Model mismatch check (item matched by name but model differs)
    const status =
      it.model && matched.model && it.model.toLowerCase() !== matched.model.toLowerCase()
        ? 'WRONG_MODEL'
        : 'MATCHED'

    matchedItemRows.push({
      ...it,
      status,
      stockStatus,
      stockRemark,
      expectedAvailabilityDays,
      availableQty,
      matchedItemId: matched.id,
      _matchedItem: matched,
    })
  }

  // ── 4. Create the Challan + items + workflow in a transaction ─
  const expectedDeliveryDate = body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null

  const challan = await db.challan.create({
    data: {
      challanNumber,
      quotationNumber: body.quotationNumber || null,
      clientName,
      clientCity,
      clientMobile: body.clientMobile || null,
      clientLocation: clientCity,
      expectedDeliveryDate,
      billingName: body.billingName || clientName,
      billingAddress: body.billingAddress || null,
      shippingAddress: body.shippingAddress || null,
      gstNumber: body.gstNumber || null,
      amountWithoutGst,
      amountWithGst,
      gstPercentage,
      amountTotal,
      amountAdvance,
      amountReceived: amountAdvance,
      packingCharge,
      paymentType,
      paymentStatus,
      paymentMode,
      pdfFileName: body.pdfFileName || null,
      status: 'UPLOADED',
      uploadedById: user.id,
      challanItems: {
        create: matchedItemRows.map((r) => ({
          category: r.category,
          itemName: r.itemName,
          itemNumber: r.itemNumber,
          model: r.model,
          colour: r.colour,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          totalPrice: r.totalPrice,
          status: r.status,
          stockStatus: r.stockStatus,
          stockRemark: r.stockRemark,
          expectedAvailabilityDays: r.expectedAvailabilityDays,
          availableQty: r.availableQty,
          matchedItemId: r.matchedItemId,
        })),
      },
      workflowStages: {
        create: [
          { stage: 'PAYMENT_VERIFY',      assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
          { stage: 'PACKING',             assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
          { stage: 'QC',                  assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
          { stage: 'VEHICLE_ARRANGEMENT', assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
          { stage: 'PHOTOS_VIDEOS',       assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
          { stage: 'EWAY_BILL',           assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
          { stage: 'ITEM_BILL',           assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
          { stage: 'DISPATCH',            assignedRole: 'SUPPORT',     status: 'PENDING', data: '{}' },
        ],
      },
    },
    include: {
      uploadedBy: { select: { id: true, name: true, role: true } },
      challanItems: { include: { matchedItem: true } },
      accountVerifiedBy: { select: { name: true, role: true } },
      billsUploadedBy: { select: { name: true, role: true } },
      _count: { select: { workflowStages: true, messages: true } },
    },
  })

  // ── 5. Notify ACCOUNT team about advance payment ────────────
  await db.message.create({
    data: {
      challanId: challan.id,
      fromRole: user.role,
      toRole: 'ACCOUNT',
      fromUserId: user.id,
      subject: `Advance payment received — ${challanNumber}`,
      body: `Client ${clientName} (${clientCity}) paid ₹${amountAdvance.toLocaleString('en-IN')} against total ₹${amountTotal.toLocaleString('en-IN')} for challan ${challanNumber}. Payment mode: ${paymentMode}. Please verify the payment and proceed.`,
    },
  })

  // ── 5b. Create a real-time Notification for ACCOUNT (big popup) ─
  // The frontend polls /api/notifications every 10s and shows a big toast.
  // We also try to push it via the socket.io notify-service (sandbox only —
  // on Vercel the emit silently fails and the 10s polling fallback catches it).
  const billingDisplay = (body.billingName || clientName)
  const notifBody =
    `Sales team processed the challan — check it.\n\n` +
    `Client Name: ${clientName}\n` +
    `Billing Name: ${billingDisplay}\n` +
    `Amount: ₹${amountTotal.toLocaleString('en-IN')} (Advance ₹${amountAdvance.toLocaleString('en-IN')})\n` +
    `Challan No: ${challanNumber} · ${clientCity}`

  const notification = await db.notification.create({
    data: {
      toRole: 'ACCOUNT',
      fromRole: user.role,
      fromUserId: user.id,
      type: 'NEW_CHALLAN',
      title: 'New Challan Uploaded — Action Required',
      body: notifBody,
      icon: '📤',
      challanId: challan.id,
      read: false,
    },
  })

  // Best-effort socket.io push (works in sandbox; silently skipped on Vercel)
  try {
    await fetch('http://127.0.0.1:3003/emit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toRole: 'ACCOUNT',
        notification: {
          id: notification.id,
          toRole: 'ACCOUNT',
          fromRole: user.role,
          type: 'NEW_CHALLAN',
          title: notification.title,
          body: notification.body,
          icon: notification.icon,
          challanId: challan.id,
          createdAt: notification.createdAt,
          read: false,
        },
      }),
    })
  } catch {
    // Non-fatal — polling will still deliver the notification
  }

  // ── 6. Stock-hold for matched AVAILABLE items when advance is paid ─
  if (amountAdvance > 0) {
    for (const row of matchedItemRows) {
      if (!row._matchedItem) continue
      if (row.stockStatus !== 'AVAILABLE' && row.stockStatus !== 'ON_HOLD') continue
      const holdQty = Math.min(row.quantity, row.availableQty ?? 0)
      if (holdQty <= 0) continue
      try {
        await db.stockHold.create({
          data: {
            itemId: row._matchedItem.id,
            category: row._matchedItem.category,
            itemName: row._matchedItem.itemName,
            model: row._matchedItem.model,
            colour: row._matchedItem.colour,
            holdQty,
            clientName,
            advanceAmount: amountAdvance,
            remarks: `Auto-held against challan ${challanNumber}`,
            status: 'ACTIVE',
            heldById: user.id,
            challanId: challan.id,
          },
        })
      } catch {
        // Non-fatal — hold failure should not break the upload
      }
    }
  }

  // ── 6b. Auto-raise URGENT Purchase Request for NOT-AVAILABLE items ──
  // When a client has paid in advance but some items are not in stock, the
  // system auto-raises a Purchase Request in Laxree's name. The Owner ("Sir")
  // just needs to check, sign and process it — an URGENT popup is sent.
  //
  // "Not available" = stockStatus is WILL_BE_AVAILABLE (out of stock) or
  // PENDING/NOT_FOUND (item not in master inventory). For ON_HOLD (partial),
  // we raise a PR for only the shortage quantity.
  const notAvailableRows = matchedItemRows.filter(
    (r) => r.stockStatus !== 'AVAILABLE',
  )

  let autoPR: {
    prNumber: string
    items: { itemName: string; model: string | null; quantity: number }[]
  } | null = null

  if (notAvailableRows.length > 0) {
    // Find the Owner (there is a single OWNER user — Ashish Agarwal)
    const owner = await db.user.findFirst({ where: { role: 'OWNER', active: true } })

    // Generate a unique PR number (max existing suffix + 1)
    const lastPR = await db.purchaseRequest.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { prNumber: true },
    })
    let nextSuffix = 1
    if (lastPR) {
      const m = lastPR.prNumber.match(/(\d+)$/)
      if (m) nextSuffix = parseInt(m[1], 10) + 1
    }
    const prNumber = `PR-2026-${String(nextSuffix).padStart(4, '0')}`

    const prItems = notAvailableRows.map((r) => {
      // For ON_HOLD (partial), order only the shortage; otherwise full qty
      const shortage =
        r.stockStatus === 'ON_HOLD'
          ? Math.max(0, r.quantity - (r.availableQty ?? 0))
          : r.quantity
      return {
        itemId: r.matchedItemId || null,
        itemName: r.itemName,
        model: r.model || null,
        quantity: shortage,
        notes: r.stockRemark || null,
      }
    })

    const pr = await db.purchaseRequest.create({
      data: {
        prNumber,
        raisedByName: 'Laxree',
        raisedById: owner?.id || user.id, // system auto-raise; fall back to uploader
        challanId: challan.id,
        status: 'PENDING_APPROVAL',
        notes: `Auto-raised — client ${clientName} paid ₹${amountAdvance.toLocaleString('en-IN')} advance. Items not available in stock. Sir to check, sign & process.`,
        autoRaised: true,
        priority: 'URGENT',
        advanceReceived: amountAdvance,
        clientName,
        challanNumber: challanNumber,
        reason: 'Out of stock / not in master inventory',
        items: { create: prItems },
      },
      include: { items: true },
    })

    autoPR = {
      prNumber: pr.prNumber,
      items: pr.items.map((it) => ({ itemName: it.itemName, model: it.model, quantity: it.quantity })),
    }

    // ── 6c. URGENT notification popup to OWNER ──
    const itemsList = pr.items
      .map((it) => `${it.itemName}${it.model ? ` (${it.model})` : ''} ×${it.quantity}`)
      .join(', ')

    const ownerNotifBody =
      `Client has paid the required payment in advance. PR raised automatically — Sir just has to check, sign & process.\n\n` +
      `PR Number: ${pr.prNumber}\n` +
      `Client Name: ${clientName}\n` +
      `Advance Paid: ₹${amountAdvance.toLocaleString('en-IN')}\n` +
      `Items Not Available: ${itemsList}\n` +
      `Challan No: ${challanNumber} · ${clientCity}`

    const ownerNotif = await db.notification.create({
      data: {
        toRole: 'OWNER',
        fromRole: user.role,
        fromUserId: user.id,
        type: 'PR_RAISED_URGENT',
        title: '🚨 URGENT: Purchase Request Auto-Raised — Sign & Process',
        body: ownerNotifBody,
        icon: '🚨',
        challanId: challan.id,
        read: false,
      },
    })

    // Best-effort socket.io push for the OWNER popup
    try {
      await fetch('http://127.0.0.1:3003/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toRole: 'OWNER',
          notification: {
            id: ownerNotif.id,
            toRole: 'OWNER',
            fromRole: user.role,
            type: 'PR_RAISED_URGENT',
            title: ownerNotif.title,
            body: ownerNotif.body,
            icon: ownerNotif.icon,
            challanId: challan.id,
            createdAt: ownerNotif.createdAt,
            read: false,
          },
        }),
      })
    } catch {
      // Non-fatal — polling will still deliver the notification
    }

    // Also leave an inline message for the Owner on the challan thread
    await db.message.create({
      data: {
        challanId: challan.id,
        fromRole: 'SYSTEM',
        toRole: 'OWNER',
        fromUserId: user.id,
        subject: `URGENT PR ${pr.prNumber} — ${notAvailableRows.length} item(s) out of stock`,
        body: `Client ${clientName} has paid ₹${amountAdvance.toLocaleString('en-IN')} in advance against challan ${challanNumber}, but ${notAvailableRows.length} item(s) are not available in stock. Purchase Request ${pr.prNumber} has been auto-raised. Please check, sign and process it so procurement can begin.\n\nItems: ${itemsList}`,
      },
    })
  }

  // ── 7. Build response ───────────────────────────────────────
  const stockSummary = {
    available: matchedItemRows.filter((r) => r.stockStatus === 'AVAILABLE').length,
    onHold: matchedItemRows.filter((r) => r.stockStatus === 'ON_HOLD').length,
    willBeAvailable: matchedItemRows.filter((r) => r.stockStatus === 'WILL_BE_AVAILABLE').length,
  }

  return NextResponse.json({
    challan,
    stockSummary,
    autoPR,
    message: `Challan ${challanNumber} uploaded successfully. ${stockSummary.available} item(s) available, ${stockSummary.onHold} partial, ${stockSummary.willBeAvailable} on back-order.`,
  })
}
