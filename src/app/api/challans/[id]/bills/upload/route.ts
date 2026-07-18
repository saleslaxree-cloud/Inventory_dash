import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

// POST /api/challans/[id]/bills/upload
// Multipart/form-data: type ("eway" | "invoice"), file (PDF)
// Saves the file to /public/uploads/bills/{challanId}_{type}_{timestamp}.pdf
// Auth: only ACCOUNT and ADMIN
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ACCOUNT' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Account can upload bills' }, { status: 403 })
  }

  const { id } = await params

  // Verify challan exists
  const challan = await db.challan.findUnique({ where: { id } })
  if (!challan) return NextResponse.json({ error: 'Challan not found' }, { status: 404 })

  // Parse multipart form
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const type = String(formData.get('type') || '')
  const file = formData.get('file')

  if (!type || (type !== 'eway' && type !== 'invoice')) {
    return NextResponse.json({ error: 'type must be "eway" or "invoice"' }, { status: 400 })
  }
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'PDF file required' }, { status: 400 })
  }

  // Validate it's a PDF (mimetype or filename extension)
  const isPdfMime = file.type === 'application/pdf'
  const isPdfExt = /\.pdf$/i.test(file.name || '')
  if (!isPdfMime && !isPdfExt) {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
  }

  // Reasonable size limit (10 MB)
  const MAX_SIZE = 10 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'PDF too large (max 10 MB)' }, { status: 400 })
  }

  // Ensure upload directory exists
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'bills')
  await mkdir(uploadDir, { recursive: true })

  // Unique filename
  const filename = `${id}_${type}_${Date.now()}.pdf`
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(join(uploadDir, filename), buffer)

  // Update the challan record
  const field = type === 'eway' ? 'ewayBillFile' : 'invoiceFile'
  await db.challan.update({
    where: { id },
    data: {
      [field]: filename,
      billsUploadedAt: new Date(),
      billsUploadedById: user.id,
    },
  })

  // Mark workflow stage done (mirror existing /bills POST behaviour)
  try {
    if (type === 'eway') {
      await db.workflowStage.updateMany({
        where: { challanId: id, stage: 'EWAY_BILL' },
        data: {
          status: 'DONE',
          doneById: user.id,
          doneAt: new Date(),
          data: JSON.stringify({ ewayBillFile: filename, uploadedBy: user.name }),
        },
      })
    } else {
      await db.workflowStage.updateMany({
        where: { challanId: id, stage: 'ITEM_BILL' },
        data: {
          status: 'DONE',
          doneById: user.id,
          doneAt: new Date(),
          data: JSON.stringify({ invoiceFile: filename, uploadedBy: user.name }),
        },
      })
    }
  } catch {
    // Non-critical — stage may not exist; do not block upload success
  }

  // Notify coordinator & sales that a PDF was uploaded
  const label = type === 'eway' ? 'E-Way Bill PDF' : 'Item Bill / Invoice PDF'
  await notify({
    toRole: 'COORDINATOR',
    fromRole: 'ACCOUNT',
    fromUserId: user.id,
    challanId: id,
    type: 'BILLS_UPLOADED',
    title: '📄 Bill PDF Uploaded',
    body: `${label} uploaded for challan ${challan.challanNumber} (${challan.clientName}).`,
    icon: '📄',
  })
  await notify({
    toRole: 'SALES',
    fromRole: 'ACCOUNT',
    fromUserId: user.id,
    challanId: id,
    type: 'BILLS_UPLOADED',
    title: '📄 Bill PDF Uploaded',
    body: `${label} uploaded for challan ${challan.challanNumber}.`,
    icon: '📄',
  })

  return NextResponse.json({ ok: true, filename, type })
}
