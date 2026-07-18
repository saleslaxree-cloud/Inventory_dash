import { db } from '../src/lib/db'

// LaxRee IMS v4 — Seed
// Roles: ADMIN | OWNER | SALES | ACCOUNT | COORDINATOR | SUPPORT | IT_MANAGER
// Owner = "Ashish Agarwal" (real person). All others use DEPARTMENT names (no person names).
// Default password: laxree123 — forcePasswordChange=true so users must change on first login.
// Admin password: admin123 (also forced change).

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
  console.log('🌱 Seeding LaxRee IMS v4...')

  // ── Users (7 roles, department names; Owner = Ashish Agarwal) ──
  const users = [
    { email: 'admin@laxree.com',    password: 'admin123',  name: 'Admin',              role: ROLES.ADMIN,      phone: '+91 98100 00000', forcePasswordChange: true },
    { email: 'owner@laxree.com',    password: 'laxree123', name: 'Ashish Agarwal',     role: ROLES.OWNER,      phone: '+91 98100 11111', forcePasswordChange: true },
    { email: 'sales@laxree.com',    password: 'laxree123', name: 'Sales Department',   role: ROLES.SALES,      phone: '+91 98100 22222', forcePasswordChange: true },
    { email: 'account@laxree.com',  password: 'laxree123', name: 'Account Department', role: ROLES.ACCOUNT,    phone: '+91 98100 33333', forcePasswordChange: true },
    { email: 'coord@laxree.com',    password: 'laxree123', name: 'Coordinator Department', role: ROLES.COORDINATOR, phone: '+91 98100 44444', forcePasswordChange: true },
    { email: 'support@laxree.com',  password: 'laxree123', name: 'Support Department', role: ROLES.SUPPORT,    phone: '+91 98100 55555', forcePasswordChange: true },
    { email: 'it@laxree.com',       password: 'laxree123', name: 'IT Department',      role: ROLES.IT_MANAGER, phone: '+91 98100 66666', forcePasswordChange: true },
  ]

  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    })
  }
  console.log(`✅ ${users.length} users seeded (Admin + Owner + 5 departments)`)

  // ── Master Items ──
  const items = [
    // Room Amenities
    { category: 'Room Amenities', itemName: 'MiniBar',            model: 'LR-MB-40L',   colour: 'Black',     currentStock: 24, minStock: 10, fastMoving: true },
    { category: 'Room Amenities', itemName: 'Tea Kettle',         model: 'LR-TK-1.8L',  colour: 'Steel',     currentStock: 8,  minStock: 15, fastMoving: true },
    { category: 'Room Amenities', itemName: 'Tea Kettle Tray',    model: 'LR-TKT-WD',   colour: 'Walnut',    currentStock: 30, minStock: 10, fastMoving: false },
    { category: 'Room Amenities', itemName: 'Safe Box',           model: 'LR-SB-20',    colour: 'Black',     currentStock: 12, minStock: 8,  fastMoving: true },
    { category: 'Room Amenities', itemName: 'Wooden Hanger',      model: 'LR-WH-17',    colour: 'Natural',   currentStock: 45, minStock: 20, fastMoving: true },
    { category: 'Room Amenities', itemName: 'Cloth Brush',        model: 'LR-CB-01',    colour: 'Wood',      currentStock: 6,  minStock: 10, fastMoving: false },
    { category: 'Room Amenities', itemName: 'Shoe Horn',          model: 'LR-SH-01',    colour: 'Wood',      currentStock: 18, minStock: 10, fastMoving: false },
    { category: 'Room Amenities', itemName: 'RFID Lock',          model: 'LR-RL-Pro',   colour: 'Gold',      currentStock: 4,  minStock: 8,  fastMoving: true },
    { category: 'Room Amenities', itemName: 'DND Set',            model: 'LR-DND-01',   colour: 'Gold',      currentStock: 22, minStock: 10, fastMoving: true },
    { category: 'Room Amenities', itemName: 'Energy Saver Switch',model: 'LR-ES-01',    colour: 'White',     currentStock: 14, minStock: 8,  fastMoving: true },
    { category: 'Room Amenities', itemName: 'Key Card',           model: 'LR-KC-RFID',  colour: 'Gold',      currentStock: 120,minStock: 50, fastMoving: true },
    { category: 'Room Amenities', itemName: 'Room Telephone',     model: 'LR-RT-02',    colour: 'Black',     currentStock: 9,  minStock: 10, fastMoving: false },
    { category: 'Room Amenities', itemName: 'Spring Mattress',    model: 'LR-SM-QN',    colour: 'White',     currentStock: 7,  minStock: 12, fastMoving: true },
    { category: 'Room Amenities', itemName: 'Steam Iron',         model: 'LR-SI-01',    colour: 'White',     currentStock: 11, minStock: 8,  fastMoving: false },
    { category: 'Room Amenities', itemName: 'Ironing Board',      model: 'LR-IB-01',    colour: 'White',     currentStock: 5,  minStock: 8,  fastMoving: false },
    { category: 'Room Amenities', itemName: 'Luggage Rack',       model: 'LR-LR-WD',    colour: 'Walnut',    currentStock: 16, minStock: 8,  fastMoving: false },
    { category: 'Room Amenities', itemName: 'Coffee Mug',         model: 'LR-CM-200',   colour: 'White',     currentStock: 60, minStock: 24, fastMoving: true },

    // Bathroom Amenities
    { category: 'Bathroom Amenities', itemName: 'Bath Tub',           model: 'LR-BT-1500', colour: 'White',     currentStock: 3,  minStock: 6,  fastMoving: true },
    { category: 'Bathroom Amenities', itemName: 'Bath Linen Set',     model: 'LR-BLS-01',  colour: 'Ivory',     currentStock: 40, minStock: 20, fastMoving: true },
    { category: 'Bathroom Amenities', itemName: 'Shower Curtain',      model: 'LR-SC-01',   colour: 'White',     currentStock: 25, minStock: 15, fastMoving: false },
    { category: 'Bathroom Amenities', itemName: 'Soap Dispenser',      model: 'LR-SD-01',   colour: 'Chrome',    currentStock: 13, minStock: 10, fastMoving: true },

    // Lobby Items
    { category: 'Lobby Items', itemName: 'Lobby Sofa',            model: 'LR-LS-3S',    colour: 'Burgundy',  currentStock: 4,  minStock: 4,  fastMoving: false },
    { category: 'Lobby Items', itemName: 'Reception Desk',        model: 'LR-RD-01',    colour: 'Walnut',    currentStock: 2,  minStock: 2,  fastMoving: false },
    { category: 'Lobby Items', itemName: 'Lobby Center Table',    model: 'LR-LCT-01',   colour: 'Walnut',    currentStock: 3,  minStock: 3,  fastMoving: false },

    // Banquet Furniture
    { category: 'Banquet Furniture', itemName: 'Banquet Chair',   model: 'LR-BC-01',    colour: 'Gold',      currentStock: 80, minStock: 40, fastMoving: true },
    { category: 'Banquet Furniture', itemName: 'Round Table',     model: 'LR-RT-60',    colour: 'Walnut',    currentStock: 20, minStock: 10, fastMoving: false },
    { category: 'Banquet Furniture', itemName: 'Stage Podium',    model: 'LR-SP-01',    colour: 'Walnut',    currentStock: 2,  minStock: 2,  fastMoving: false },

    // Linen
    { category: 'Linen', itemName: 'Bed Sheet Queen',     model: 'LR-BS-QN',  colour: 'White',   currentStock: 50, minStock: 25, fastMoving: true },
    { category: 'Linen', itemName: 'Pillow Cover',        model: 'LR-PC-01',  colour: 'White',   currentStock: 90, minStock: 40, fastMoving: true },
    { category: 'Linen', itemName: 'Duvet Queen',         model: 'LR-DV-QN',  colour: 'White',   currentStock: 18, minStock: 15, fastMoving: true },
    { category: 'Linen', itemName: 'Bath Towel',          model: 'LR-BT-70',  colour: 'White',   currentStock: 65, minStock: 30, fastMoving: true },
    { category: 'Linen', itemName: 'Hand Towel',          model: 'LR-HT-35',  colour: 'White',   currentStock: 70, minStock: 30, fastMoving: true },

    // Spare Parts
    { category: 'Spare Parts', itemName: 'Door Hinge',      model: 'LR-DH-01',  colour: 'Steel',  currentStock: 35, minStock: 20, fastMoving: false },
    { category: 'Spare Parts', itemName: 'Drawer Slider',   model: 'LR-DS-01',  colour: 'Steel',  currentStock: 28, minStock: 15, fastMoving: false },
    { category: 'Spare Parts', itemName: 'LED Bulb 9W',     model: 'LR-LB-9W',  colour: 'White',  currentStock: 100,minStock: 50, fastMoving: true },
  ]

  for (const it of items) {
    const existing = await db.item.findFirst({
      where: { category: it.category, itemName: it.itemName, model: it.model },
    })
    if (!existing) {
      await db.item.create({ data: it })
    }
  }
  console.log(`✅ ${items.length} master items seeded`)

  // ── Sample challan (so dashboards have real working data) ──
  const salesUser = await db.user.findUnique({ where: { email: 'sales@laxree.com' } })
  if (salesUser) {
    const existingChallan = await db.challan.findUnique({ where: { challanNumber: 'CH-2026-0001' } })
    if (!existingChallan) {
      const minibar = await db.item.findFirst({ where: { itemName: 'MiniBar' } })
      const kettle = await db.item.findFirst({ where: { itemName: 'Tea Kettle' } })
      const safe = await db.item.findFirst({ where: { itemName: 'Safe Box' } })
      const hanger = await db.item.findFirst({ where: { itemName: 'Wooden Hanger' } })

      const ch = await db.challan.create({
        data: {
          challanNumber: 'CH-2026-0001',
          clientName: 'The Grand Palace Resort',
          clientCity: 'Udaipur',
          clientMobile: '+91 99100 12345',
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
              { itemName: 'MiniBar',        itemNumber: 'MB-40L',  model: 'LR-MB-40L',  quantity: 10, status: 'MATCHED',    matchedItemId: minibar?.id },
              { itemName: 'Tea Kettle',     itemNumber: 'TK-1.8',  model: 'LR-TK-1.8L', quantity: 10, status: 'MATCHED',    matchedItemId: kettle?.id },
              { itemName: 'Safe Box',       itemNumber: 'SB-20',   model: 'LR-SB-21',   quantity: 10, status: 'WRONG_MODEL',matchedItemId: safe?.id },
              { itemName: 'Wooden Hanger',  itemNumber: 'WH-17',   model: 'LR-WH-17',   quantity: 50, status: 'MATCHED',    matchedItemId: hanger?.id },
              { itemName: 'Unknown Item',   itemNumber: 'XX-99',   model: 'ZZ-99',      quantity: 5,  status: 'NOT_FOUND' },
            ],
          },
        },
      })

      // Create initial workflow stages (all 8 stages)
      await db.workflowStage.createMany({
        data: [
          { challanId: ch.id, stage: 'PAYMENT_VERIFY',     assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
          { challanId: ch.id, stage: 'PACKING',            assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
          { challanId: ch.id, stage: 'QC',                 assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
          { challanId: ch.id, stage: 'VEHICLE_ARRANGEMENT',assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
          { challanId: ch.id, stage: 'PHOTOS_VIDEOS',      assignedRole: 'COORDINATOR', status: 'PENDING', data: '{}' },
          { challanId: ch.id, stage: 'EWAY_BILL',          assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
          { challanId: ch.id, stage: 'ITEM_BILL',          assignedRole: 'ACCOUNT',     status: 'PENDING', data: '{}' },
          { challanId: ch.id, stage: 'DISPATCH',           assignedRole: 'SUPPORT',     status: 'PENDING', data: '{}' },
        ],
      })

      // Message to account team
      await db.message.create({
        data: {
          challanId: ch.id,
          fromRole: 'SALES',
          toRole: 'ACCOUNT',
          fromUserId: salesUser.id,
          subject: `Advance payment received for ${ch.challanNumber}`,
          body: `Client ${ch.clientName} has paid an advance of ₹${ch.amountAdvance} against total ₹${ch.amountTotal}. Please verify and approve.`,
        },
      })

      console.log('✅ Sample challan CH-2026-0001 seeded (8 workflow stages + message)')
    }
  }

  console.log('🎉 Seed complete!')
  console.log('   Login credentials:')
  console.log('   Admin:  admin@laxree.com / admin123')
  console.log('   Owner:  owner@laxree.com / laxree123')
  console.log('   Others: sales/account/coord/support/it @laxree.com / laxree123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
