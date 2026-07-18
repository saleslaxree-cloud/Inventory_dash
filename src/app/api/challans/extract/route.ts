import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// POST /api/challans/extract
// Accepts multipart/form-data with a `file` field (PDF)
// Proxies the PDF to the challan-extract mini-service (port 3031) which uses
// the z-ai-web-dev-sdk VLM (glm-4.6v) to parse the Laxree challan format and
// returns structured data matching the Sales upload form's Section A/B/C fields.
//
// The VLM call lives in a separate mini-service so the Next.js dev server
// doesn't OOM when importing the heavy z-ai-web-dev-sdk.
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const EXTRACT_SERVICE_URL = 'http://127.0.0.1:3031/'

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'SALES' && user.role !== 'OWNER' && user.role !== 'IT_MANAGER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only Sales / Owner can extract challan' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded. Send a PDF as multipart form field "file".' }, { status: 400 })
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    // Forward the file to the challan-extract mini-service
    const forwardForm = new FormData()
    forwardForm.append('file', file, file.name)

    const upstream = await fetch(EXTRACT_SERVICE_URL, {
      method: 'POST',
      body: forwardForm,
    })

    const text = await upstream.text()
    const data = text ? JSON.parse(text) : null

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error || `Extraction service error (${upstream.status})`, detail: data?.detail },
        { status: upstream.status }
      )
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[challans/extract] error:', msg)
    return NextResponse.json(
      { error: 'PDF extraction failed. Is the challan-extract mini-service running on port 3031?', detail: msg },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Health check — reports whether the upstream mini-service is alive
  try {
    const r = await fetch(EXTRACT_SERVICE_URL, { method: 'GET' })
    const data = await r.json()
    return NextResponse.json({ ok: true, upstream: data })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'challan-extract mini-service not reachable on port 3031' },
      { status: 503 }
    )
  }
}
