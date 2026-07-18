import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// POST /api/challans/extract
// Accepts multipart/form-data with a `file` field (PDF).
// Calls the ZAI VLM (glm-4.6v) DIRECTLY to parse the Laxree challan format and
// returns structured data matching the Sales upload form's Section A/B/C fields.
//
// Why direct (not via mini-service)?
//   The original design proxied to a mini-service on port 3031, but that only
//   works inside the sandbox. On Vercel (or any other host) the mini-service
//   doesn't exist, so the proxy always failed. Calling VLM directly here means
//   the feature works anywhere the ZAI SDK can reach its API endpoint.
//
// Config resolution (in priority order):
//   1. /etc/.z-ai-config            (sandbox auto-provisioned)
//   2. <cwd>/.z-ai-config           (project-local override)
//   3. ~/.z-ai-config               (home dir override)
//   4. Env vars: ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_TOKEN, ZAI_USER_ID
//      (use these on Vercel — set them in Project Settings → Environment Variables)
//
// If no config is found, OR the VLM call fails, the route returns a clear error
// so the Sales person can fall back to filling the form manually.
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const EXTRACTION_PROMPT = `You are a challan/invoice parser for the Laxree Hotel Supplies company.
You will be given a challan PDF. Extract the following fields and return them as STRICT JSON
(no markdown, no commentary, only the JSON object). Use null for fields that are not present.

The Laxree challan typically contains:
- "Challan No. :" — challan number
- "Challan Date :" — issue date (DD/MM/YYYY HH:MMam/pm)
- "Committed Delivery :" — expected delivery date (DD/MM/YYYY)
- "Billing From :" — usually "LAXREE"
- "GST No. :" — GST number
- "Billing Name :" — customer company name
- "Billing Address :" — billing street address
- "Shipping Address :" — shipping street address
- "M/S :" — contact person / client name (person)
- "Quotation No. :" — quotation number
- "Site Add. :" — site city (use this as clientCity)
- "Phone :" — primary phone (use as clientMobile, digits only)
- "Mobile :" — alternate mobile (use as fallback for clientMobile)
- Items table with columns: Sr | Model | Description | Image | Colour | Qty | Discounted Price | Amount | GST | Total
  - Split "Model" into itemName (first part) and itemNumber (the alphanumeric code e.g. LRWA-...)
  - The "Description" can be a long sentence; keep it as the itemName if Model has no clear name, otherwise use Model as itemName
  - "Colour" is a single word (WHITE, BLACK, etc.)
  - "Qty" is an integer
  - "Discounted Price" is the per-unit price (without GST)
  - "Amount" = Qty x Discounted Price (without GST)
  - "GST" is a percentage like "18%"
  - "Total" = Amount + GST
- "Packing Charges" — packing charge
- "Total Without Tax" — amountWithoutGst (sum of item amounts)
- "Total With Tax" — amountWithGst
- "Grand Total" — amountTotal (usually = Total With Tax + Packing if packing is outside)

Return JSON with EXACTLY this shape:
{
  "challanNumber": string | null,
  "challanDate": string | null,
  "quotationNumber": string | null,
  "clientName": string | null,
  "clientCity": string | null,
  "clientMobile": string | null,
  "billingName": string | null,
  "billingAddress": string | null,
  "shippingAddress": string | null,
  "gstNumber": string | null,
  "expectedDeliveryDate": "YYYY-MM-DD" | null,
  "amountWithoutGst": number | null,
  "gstPercentage": number | null,
  "packingCharge": number | null,
  "amountWithGst": number | null,
  "amountTotal": number | null,
  "items": [
    {
      "category": null,
      "itemName": string,
      "itemNumber": string | null,
      "model": string | null,
      "colour": string | null,
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number
    }
  ]
}

Rules:
- Output ONLY the JSON object, no code fences, no commentary.
- Numbers must be numeric (not strings with the rupee symbol).
- expectedDeliveryDate must be ISO "YYYY-MM-DD".
- For clientName use M/S value (the person); if absent use Billing Name.
- For clientCity use the city from Site Add.
- For clientMobile use the primary phone digits (include country code 91 only if 10 digits).`

type ZaiConfig = {
  baseUrl: string
  apiKey: string
  chatId?: string
  token?: string
  userId?: string
}

async function loadZaiConfig(): Promise<ZaiConfig | null> {
  // 1-3. Try file-based config (sandbox / local override)
  const candidates = [
    '/etc/.z-ai-config',
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
  ]
  for (const filePath of candidates) {
    try {
      const configStr = await fs.readFile(filePath, 'utf-8')
      const config = JSON.parse(configStr)
      if (config.baseUrl && config.apiKey) {
        return {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          chatId: config.chatId,
          token: config.token,
          userId: config.userId,
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[challans/extract] error reading ${filePath}:`, err)
      }
      // continue to next candidate
    }
  }

  // 4. Fall back to env vars (for Vercel — set in Project Settings → Environment Variables)
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    return {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      chatId: process.env.ZAI_CHAT_ID,
      token: process.env.ZAI_TOKEN,
      userId: process.env.ZAI_USER_ID,
    }
  }

  return null
}

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

    // Load ZAI config (file in sandbox, env vars on Vercel)
    const config = await loadZaiConfig()
    if (!config) {
      return NextResponse.json(
        {
          error:
            'PDF auto-extraction is not configured on this server. Set ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_TOKEN, ZAI_USER_ID environment variables, or fill the form manually below.',
        },
        { status: 503 }
      )
    }

    // Read PDF → base64 data URL
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    const dataUrl = `data:application/pdf;base64,${base64}`

    console.log(`[challans/extract] Processing PDF: ${file.name} (${buffer.length} bytes)`)

    // Dynamic import so the heavy SDK only loads when extraction is actually called
    const ZAIModule = (await import('z-ai-web-dev-sdk')).default
    const zai = new ZAIModule(config)

    const response = await zai.chat.completions.createVision({
      model: 'glm-4.6v',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'file_url', file_url: { url: dataUrl } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = response.choices?.[0]?.message?.content || ''
    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }

    let parsed_json: Record<string, unknown>
    try {
      parsed_json = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json(
        { error: 'Could not parse VLM output as JSON. Please try again or fill the form manually.', raw },
        { status: 502 }
      )
    }

    const items = Array.isArray(parsed_json.items) ? parsed_json.items : []
    const normalizedItems = items.map((it: Record<string, unknown>, idx: number) => ({
      category: typeof it.category === 'string' ? it.category : null,
      itemName: typeof it.itemName === 'string' ? it.itemName : (typeof it.model === 'string' ? it.model : `Item ${idx + 1}`),
      itemNumber: typeof it.itemNumber === 'string' ? it.itemNumber : null,
      model: typeof it.model === 'string' ? it.model : null,
      colour: typeof it.colour === 'string' ? it.colour : null,
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      totalPrice: Number(it.totalPrice) || (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
    }))

    const result = {
      challanNumber: typeof parsed_json.challanNumber === 'string' ? parsed_json.challanNumber : null,
      challanDate: typeof parsed_json.challanDate === 'string' ? parsed_json.challanDate : null,
      quotationNumber: typeof parsed_json.quotationNumber === 'string' ? parsed_json.quotationNumber : null,
      clientName: typeof parsed_json.clientName === 'string' ? parsed_json.clientName : null,
      clientCity: typeof parsed_json.clientCity === 'string' ? parsed_json.clientCity : null,
      clientMobile: typeof parsed_json.clientMobile === 'string' ? parsed_json.clientMobile : null,
      billingName: typeof parsed_json.billingName === 'string' ? parsed_json.billingName : null,
      billingAddress: typeof parsed_json.billingAddress === 'string' ? parsed_json.billingAddress : null,
      shippingAddress: typeof parsed_json.shippingAddress === 'string' ? parsed_json.shippingAddress : null,
      gstNumber: typeof parsed_json.gstNumber === 'string' ? parsed_json.gstNumber : null,
      expectedDeliveryDate: typeof parsed_json.expectedDeliveryDate === 'string' ? parsed_json.expectedDeliveryDate : null,
      amountWithoutGst: typeof parsed_json.amountWithoutGst === 'number' ? parsed_json.amountWithoutGst : null,
      gstPercentage: typeof parsed_json.gstPercentage === 'number' ? parsed_json.gstPercentage : null,
      packingCharge: typeof parsed_json.packingCharge === 'number' ? parsed_json.packingCharge : null,
      amountWithGst: typeof parsed_json.amountWithGst === 'number' ? parsed_json.amountWithGst : null,
      amountTotal: typeof parsed_json.amountTotal === 'number' ? parsed_json.amountTotal : null,
      items: normalizedItems,
      pdfFileName: file.name,
      _meta: {
        fileName: file.name,
        fileSize: buffer.length,
        extractedAt: new Date().toISOString(),
      },
    }

    console.log(`[challans/extract] Success: challan=${result.challanNumber}, items=${normalizedItems.length}`)
    return NextResponse.json({ ok: true, data: result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[challans/extract] error:', msg)

    // Distinguish "not configured" from "VLM call failed"
    const isNetworkError =
      /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|getaddrinfo|connect ETIMEDOUT/i.test(msg)

    return NextResponse.json(
      {
        error: isNetworkError
          ? 'PDF auto-extraction failed — the ZAI VLM service is not reachable from this deployment. Please fill the form manually below.'
          : `PDF extraction failed: ${msg}. You can still fill the form manually below.`,
        detail: msg,
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Health check — reports whether ZAI config is available
  const config = await loadZaiConfig()
  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'ZAI VLM not configured. Set ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_TOKEN, ZAI_USER_ID env vars (or provide /etc/.z-ai-config).',
      },
      { status: 503 }
    )
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    baseUrl: config.baseUrl,
    hasApiKey: true,
    hasToken: Boolean(config.token),
  })
}
