import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// POST /api/challans/[id]/bills
// Body: { ewayBillNo, ewayBillFile, invoiceNo, invoiceFile }
// Account team uploads e-way bill and item bill
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ACCOUNT' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Account can upload bills' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { ewayBillNo, ewayBillFile, invoiceNo, invoiceFile } = body

  const challan = await db.challan.findUnique({ where: { id } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  const updateData: Record<string, unknown> = {
    billsUploadedAt: new Date(),
    billsUploadedById: user.id,
  }

  if (ewayBillNo !== undefined) updateData.ewayBillNo = ewayBillNo
  if (ewayBillFile !== undefined) updateData.ewayBillFile = ewayBillFile
  if (invoiceNo !== undefined) updateData.invoiceNo = invoiceNo
  if (invoiceFile !== undefined) updateData.invoiceFile = invoiceFile

  await db.challan.update({ where: { id }, data: updateData })

  // Mark stages done
  if (ewayBillNo || ewayBillFile) {
    await db.workflowStage.updateMany({
      where: { challanId: id, stage: 'EWAY_BILL' },
      data: { status: 'DONE', doneById: user.id, doneAt: new Date(),
        data: JSON.stringify({ ewayBillNo, ewayBillFile, uploadedBy: user.name }),
      },
    })
  }
  if (invoiceNo || invoiceFile) {
    await db.workflowStage.updateMany({
      where: { challanId: id, stage: 'ITEM_BILL' },
      data: { status: 'DONE', doneById: user.id, doneAt: new Date(),
        data: JSON.stringify({ invoiceNo, invoiceFile, uploadedBy: user.name }),
      },
    })
  }

  return NextResponse.json({ ok: true, message: 'Bills uploaded successfully' })
}
