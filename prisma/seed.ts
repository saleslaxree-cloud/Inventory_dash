import { db } from '../src/lib/db'
import seedData from './seed-data.json'

// LaxRee IMS v6 — Seed with REAL data from original HTML inventory file
// 293 real SKUs across 6 categories (Room Amenities, Bathroom Amenities, Lobby Items, Bath Tubs, Banquet Furniture, Spare Parts)
// 13 real hotel clients, 54 real challan numbers, sample inward/outward transactions

const ROLES = {
  ADMIN: 'ADMIN',
  OWNER: 'OWNER',
  SALES: 'SALES',
  ACCOUNT: 'ACCOUNT',
  COORDINATOR: 'COORDINATOR',
  SUPPORT: 'SUPPORT',
  IT_MANAGER: 'IT_MANAGER',
} as const

async function main() {
  console.log('🌱 Seeding LaxRee IMS v6 with REAL inventory data...')

  // ── Users (7 roles, department names; Owner = Ashish Agarwal) ──
  const users = [
    { email: 'admin@laxree.com',    password: 'admin123',  name: 'Admin',                  role: ROLES.ADMIN,      phone: '+91 98100 00000', forcePasswordChange: false },
    { email: 'owner@laxree.com',    password: 'laxree123', name: 'Ashish Agarwal',         role: ROLES.OWNER,      phone: '+91 98100 11111', forcePasswordChange: false },
    { email: 'sales@laxree.com',    password: 'laxree123', name: 'Sales Department',       role: ROLES.SALES,      phone: '+91 98100 22222', forcePasswordChange: false },
    { email: 'account@laxree.com',  password: 'laxree123', name: 'Account Department',     role: ROLES.ACCOUNT,    phone: '+91 98100 33333', forcePasswordChange: false },
    { email: 'coord@laxree.com',    password: 'laxree123', name: 'Coordinator Department', role: ROLES.COORDINATOR, phone: '+91 98100 44444', forcePasswordChange: false },
    { email: 'support@laxree.com',  password: 'laxree123', name: 'Support Department',     role: ROLES.SUPPORT,    phone: '+91 98100 55555', forcePasswordChange: false },
    { email: 'it@laxree.com',       password: 'laxree123', name: 'IT Department',          role: ROLES.IT_MANAGER, phone: '+91 98100 66666', forcePasswordChange: false },
  ]

  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: { password: u.password, forcePasswordChange: false, active: true, name: u.name, role: u.role, phone: u.phone },
      create: u,
    })
  }
  console.log(`✅ ${users.length} users seeded`)

  const salesUser = await db.user.findUnique({ where: { email: 'sales@laxree.com' } })!
  const itUser = await db.user.findUnique({ where: { email: 'it@laxree.com' } })!
  const ownerUser = await db.user.findUnique({ where: { email: 'owner@laxree.com' } })!

  // ── Master Items (293 real SKUs from original HTML) ──
  const items = seedData.items as Array<{
    category: string; itemName: string; model: string; colour: string | null;
    currentStock: number; minStock: number; fastMoving: boolean;
    inwardCount: number; outwardCount: number;
  }>

  let itemCount = 0
  for (const it of items) {
    const existing = await db.item.findFirst({
      where: { category: it.category, itemName: it.itemName, model: it.model, colour: it.colour || '' },
    })
    if (!existing) {
      await db.item.create({ data: it })
      itemCount++
    } else {
      // Update stock counts to match real data
      await db.item.update({
        where: { id: existing.id },
        data: { currentStock: it.currentStock, inwardCount: it.inwardCount, outwardCount: it.outwardCount, minStock: it.minStock, fastMoving: it.fastMoving },
      })
    }
  }
  console.log(`✅ ${items.length} master items seeded (${itemCount} new)`)

  // ── Sample Inward Logs (30 entries) ──
  const inwardSamples = seedData.inwardSamples as Array<any>
  for (const inw of inwardSamples) {
    const item = await db.item.findFirst({ where: { category: inw.category, itemName: inw.itemName, model: inw.model, colour: inw.colour || '' } })
    if (item) {
      const existing = await db.inwardLog.findFirst({ where: { itemId: item.id, billNo: inw.billNo } })
      if (!existing) {
        await db.inwardLog.create({
          data: {
            itemId: item.id, category: inw.category, itemName: inw.itemName, model: inw.model,
            colour: inw.colour, quantity: inw.quantity, vendor: inw.vendor, billNo: inw.billNo,
            remarks: inw.remarks, enteredById: itUser.id,
            date: new Date(Date.now() - Math.random() * 90 * 86400000),
          },
        })
      }
    }
  }
  console.log(`✅ ${inwardSamples.length} inward log entries seeded`)

  // ── Sample Outward Logs (40 entries with real client names & challan numbers) ──
  const outwardSamples = seedData.outwardSamples as Array<any>
  for (const out of outwardSamples) {
    const item = await db.item.findFirst({ where: { category: out.category, itemName: out.itemName, model: out.model, colour: out.colour || '' } })
    if (item) {
      const existing = await db.outwardLog.findFirst({ where: { itemId: item.id, challanNumber: out.challanNumber, billNumber: out.billNumber } })
      if (!existing) {
        await db.outwardLog.create({
          data: {
            itemId: item.id, category: out.category, itemName: out.itemName, model: out.model,
            colour: out.colour, quantity: out.quantity, clientName: out.clientName,
            challanNumber: out.challanNumber, billNumber: out.billNumber, remarks: out.remarks,
            enteredById: salesUser.id,
            date: new Date(Date.now() - Math.random() * 60 * 86400000),
          },
        })
      }
    }
  }
  console.log(`✅ ${outwardSamples.length} outward log entries seeded`)

  // ── Sample Stock Holds (5 entries) ──
  const holdSamples = [
    { idx: 0, client: 'P HOSPITALITY', qty: 20, advance: 50000 },
    { idx: 5, client: 'HOTEL AJ INTERNATIONAL', qty: 15, advance: 30000 },
    { idx: 10, client: 'SANSKRITI INTERNATIONAL', qty: 30, advance: 75000 },
    { idx: 20, client: 'THE ORIKA CLUB', qty: 10, advance: 25000 },
    { idx: 30, client: 'SWOSTI PREMIUM LIMITED', qty: 25, advance: 60000 },
  ]
  for (const h of holdSamples) {
    const out = outwardSamples[h.idx]
    if (!out) continue
    const item = await db.item.findFirst({ where: { category: out.category, itemName: out.itemName, model: out.model, colour: out.colour || '' } })
    if (item) {
      const existing = await db.stockHold.findFirst({ where: { itemId: item.id, clientName: h.client } })
      if (!existing) {
        await db.stockHold.create({
          data: {
            itemId: item.id, category: out.category, itemName: out.itemName, model: out.model,
            colour: out.colour, holdQty: h.qty, clientName: h.client, advanceAmount: h.advance,
            remarks: 'Advance payment received', status: 'ACTIVE', heldById: salesUser.id,
          },
        })
      }
    }
  }
  console.log(`✅ 5 stock hold entries seeded`)

  // ── Sample Challan with real client & challan number ──
  const existingChallan = await db.challan.findUnique({ where: { challanNumber: 'LC-JPRL/26-27/0008' } })
  if (!existingChallan) {
    const minibar = await db.item.findFirst({ where: { itemName: 'MiniBar' } })
    const kettle = await db.item.findFirst({ where: { itemName: 'Tea Kettle' } })
    const safe = await db.item.findFirst({ where: { itemName: 'Safe Box' } })
    const hanger = await db.item.findFirst({ where: { itemName: 'Wooden Hanger' } })

    const ch = await db.challan.create({
      data: {
        challanNumber: 'LC-JPRL/26-27/0008',
        clientName: 'P HOSPITALITY',
        clientCity: 'Jaipur',
        clientMobile: '+91 99100 12345',
        clientLocation: 'Jaipur, Rajasthan',
        expectedDeliveryDate: new Date(Date.now() + 7 * 86400000),
        amountTotal: 285000,
        amountAdvance: 100000,
        amountReceived: 100000,
        paymentType: 'ADVANCE',
        paymentStatus: 'PARTIAL',
        status: 'UPLOADED',
        uploadedById: salesUser.id,
        challanItems: {
          create: [
            { itemName: 'MiniBar',        itemNumber: 'MB-40L',  model: minibar?.model || 'LR-MB-40L',  quantity: 10, status: 'MATCHED',     matchedItemId: minibar?.id },
            { itemName: 'Tea Kettle',     itemNumber: 'TK-1.8',  model: kettle?.model  || 'LR-TK-1.8L', quantity: 10, status: 'MATCHED',     matchedItemId: kettle?.id },
            { itemName: 'Safe Box',       itemNumber: 'SB-20',   model: 'LR-SB-21',                     quantity: 10, status: 'WRONG_MODEL', matchedItemId: safe?.id },
            { itemName: 'Wooden Hanger',  itemNumber: 'WH-17',   model: hanger?.model || 'LR-WH-17',    quantity: 50, status: 'MATCHED',     matchedItemId: hanger?.id },
            { itemName: 'Unknown Item',   itemNumber: 'XX-99',   model: 'ZZ-99',                        quantity: 5,  status: 'NOT_FOUND' },
          ],
        },
      },
    })

    await db.workflowStage.createMany({
      data: [
        { challanId: ch.id, stage: 'PAYMENT_VERIFY',      assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
        { challanId: ch.id, stage: 'PACKING',             assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
        { challanId: ch.id, stage: 'QC',                  assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
        { challanId: ch.id, stage: 'VEHICLE_ARRANGEMENT', assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
        { challanId: ch.id, stage: 'PHOTOS_VIDEOS',       assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
        { challanId: ch.id, stage: 'EWAY_BILL',           assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
        { challanId: ch.id, stage: 'ITEM_BILL',           assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
        { challanId: ch.id, stage: 'DISPATCH',            assignedRole: 'SUPPORT',     status: 'PENDING', data: '{}' },
      ],
    })

    await db.message.create({
      data: {
        challanId: ch.id,
        fromRole: 'SALES', toRole: 'ACCOUNT', fromUserId: salesUser.id,
        subject: `Advance payment received for ${ch.challanNumber}`,
        body: `Client ${ch.clientName} has paid an advance of ₹${ch.amountAdvance} against total ₹${ch.amountTotal}. Please verify and approve.`,
      },
    })
    console.log(`✅ Sample challan ${ch.challanNumber} seeded (P HOSPITALITY)`)
  }

  // ── Auto-create Purchase Requests for low-stock items ──
  const lowStockItems = await db.item.findMany({ where: { currentStock: { lte: 10 }, active: true } })
  let prCount = 0
  for (const item of lowStockItems.slice(0, 10)) {
    const prNumber = `PR-2026-${String(1001 + prCount).padStart(4, '0')}`
    const existingPR = await db.purchaseRequest.findUnique({ where: { prNumber } })
    if (!existingPR) {
      const reorderQty = Math.max(50, item.minStock * 5)
      await db.purchaseRequest.create({
        data: {
          prNumber, raisedByName: 'LaxRee Hotel', raisedById: ownerUser.id,
          status: 'PENDING', notes: `Auto-raised: ${item.itemName} stock (${item.currentStock}) below threshold`,
          items: { create: [{ itemId: item.id, itemName: item.itemName, model: item.model, quantity: reorderQty, notes: 'Reorder for low stock' }] },
        },
      })
      prCount++
    }
  }
  console.log(`✅ ${prCount} purchase requests auto-raised for low-stock items`)

  console.log('🎉 Seed complete!')
  console.log('   Login credentials:')
  console.log('   Admin:  admin@laxree.com / admin123')
  console.log('   Owner:  owner@laxree.com / laxree123')
  console.log('   Others: sales/account/coord/support/it @laxree.com / laxree123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
