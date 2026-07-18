import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// POST /api/challans/extract
// Accepts multipart/form-data with a `file` field (PDF).
// Uses a VLM to parse the Laxree challan format and returns structured data
// matching the Sales upload form's Section A/B/C fields.
//
// Provider resolution (first available wins):
//   1. ZAI (sandbox)        — /etc/.z-ai-config OR ZAI_BASE_URL+ZAI_API_KEY env vars
//   2. Google Gemini        — GEMINI_API_KEY env var (recommended for Vercel)
//
// The sandbox auto-provisions a ZAI config pointing at internal-api.z.ai which
// is only reachable inside the Z.ai sandbox network. On Vercel (or any other
// public cloud) set GEMINI_API_KEY instead — Gemini supports PDF understanding
// natively, has a generous free tier, and works everywhere.
//
// If no provider is configured, returns a clear error so the Sales person can
// fall back to filling the form manually.
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

// ── Provider types ──
type VlmProvider =
  | { kind: 'zai'; baseUrl: string; apiKey: string; chatId?: string; token?: string; userId?: string }
  | { kind: 'gemini'; apiKey: string; model?: string }

/**
 * Resolve which VLM provider is available.
 * Priority: ZAI config file → ZAI env vars → Gemini env var.
 */
async function loadProvider(): Promise<VlmProvider | null> {
  // ── 1. ZAI config file (sandbox auto-provisioned at /etc/.z-ai-config) ──
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
          kind: 'zai',
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
    }
  }

  // ── 2. ZAI env vars (if user has their own public ZAI key) ──
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    return {
      kind: 'zai',
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      chatId: process.env.ZAI_CHAT_ID,
      token: process.env.ZAI_TOKEN,
      userId: process.env.ZAI_USER_ID,
    }
  }

  // ── 3. Gemini env var (recommended for Vercel / public clouds) ──
  if (process.env.GEMINI_API_KEY) {
    return {
      kind: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    }
  }

  return null
}

/**
 * Call the VLM with the PDF + extraction prompt. Returns the raw text response.
 * Dispatches to the configured provider.
 */
async function callVlm(provider: VlmProvider, pdfBuffer: Buffer, fileName: string): Promise<string> {
  const base64 = pdfBuffer.toString('base64')

  if (provider.kind === 'zai') {
    return callZai(provider, base64)
  }
  return callGemini(provider, base64, fileName)
}

/** ZAI (glm-4.6v) — used in the sandbox via /etc/.z-ai-config */
async function callZai(cfg: Extract<VlmProvider, { kind: 'zai' }>, base64: string): Promise<string> {
  const dataUrl = `data:application/pdf;base64,${base64}`
  // Dynamic import so the heavy SDK only loads when ZAI is actually used
  const ZAIModule = (await import('z-ai-web-dev-sdk')).default
  const zai = new ZAIModule({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    chatId: cfg.chatId,
    token: cfg.token,
    userId: cfg.userId,
  })
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
  return response.choices?.[0]?.message?.content || ''
}

/** Google Gemini — recommended for Vercel / public clouds (supports PDF natively) */
async function callGemini(cfg: Extract<VlmProvider, { kind: 'gemini' }>, base64: string, _fileName: string): Promise<string> {
  // Try the configured model first; if it 404s (model deprecated/renamed), fall back to
  // a list of known-good PDF-capable models. This makes the integration resilient to
  // Google deprecating model versions.
  const requestedModel = cfg.model || 'gemini-2.0-flash'
  const fallbackChain = [requestedModel, 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash']
    .filter((m, i, arr) => arr.indexOf(m) === i) // dedupe

  let lastError: Error | null = null
  for (const model of fallbackChain) {
    try {
      return await callGeminiOnce(cfg.apiKey, model, base64)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      lastError = err instanceof Error ? err : new Error(msg)
      // If it's a 404 (model not found) or "not supported for generateContent" → try next model
      if (/404|not found|not supported for generateContent|is not a valid model/i.test(msg)) {
        console.warn(`[challans/extract] Gemini model "${model}" unavailable, trying next...`)
        continue
      }
      // For any other error (auth, location, safety, quota), don't retry with another model
      throw err
    }
  }
  throw lastError || new Error('All Gemini models failed')
}

/** Single Gemini call attempt. */
async function callGeminiOnce(apiKey: string, model: string, base64: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: EXTRACTION_PROMPT },
          { inline_data: { mime_type: 'application/pdf', data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    let errMsg = `Gemini API error (${res.status})`
    let errStatus = ''
    try {
      const errJson = JSON.parse(errText)
      errMsg = errJson.error?.message || errMsg
      errStatus = errJson.error?.status || ''
    } catch {
      errMsg = `${errMsg}: ${errText.slice(0, 200)}`
    }

    // Surface a clearer, actionable error for the common geographic restriction
    // (Gemini API is not available in mainland China / Hong Kong / some regions).
    // On Vercel (servers in US/EU/Asia-Pacific ex-China) this should never happen.
    if (/location is not supported/i.test(errMsg)) {
      throw new Error(
        'Gemini API is not available in this server region. If you are on Vercel, redeploy in a US/EU region. ' +
          'If you are testing locally from a restricted region, deploy to Vercel or use a VPN. ' +
          `Original error: ${errMsg}`
      )
    }
    // Surface invalid API key clearly
    if (res.status === 400 && /API key not valid/i.test(errMsg)) {
      throw new Error(
        'The Gemini API key is invalid or has been revoked. Get a fresh key at https://aistudio.google.com/apikey ' +
          'and update the GEMINI_API_KEY environment variable in Vercel → Project Settings → Environment Variables.'
      )
    }
    // Permission / quota errors
    if (errStatus === 'PERMISSION_DENIED' || res.status === 403) {
      throw new Error(
        `Gemini permission denied: ${errMsg}. Make sure the Generative Language API is enabled for your Google Cloud project, ` +
          'and that the API key has access to the Gemini model you selected.'
      )
    }
    throw new Error(errMsg)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || '')
    .join('') || ''

  if (!text) {
    const blockReason = data?.promptFeedback?.blockReason
    if (blockReason) {
      throw new Error(
        `Gemini blocked the request (${blockReason}). The PDF may contain content Gemini considers unsafe. ` +
          'Try a different file or fill the form manually below.'
      )
    }
    // Check finish reason — could be MAX_TOKENS or RECITATION
    const finishReason = data?.candidates?.[0]?.finishReason
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(
        `Gemini stopped generating (reason: ${finishReason}). The challan may be too long. ` +
          'Try removing extra pages or fill the form manually below.'
      )
    }
    throw new Error(
      'Gemini returned an empty response. The PDF may be empty, corrupted, or scanned without OCR text. ' +
        'Try a different file or fill the form manually below.'
    )
  }
  return text
}

/** Extract the JSON object from a VLM text response (handles code fences + leading/trailing prose). */
function parseVlmJson(raw: string): Record<string, unknown> {
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  }
  return JSON.parse(jsonStr)
}

/** Normalize the parsed JSON into the final response shape. */
function normalizeResult(parsed_json: Record<string, unknown>, fileName: string, fileSize: number) {
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

  return {
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
    pdfFileName: fileName,
    _meta: {
      fileName,
      fileSize,
      extractedAt: new Date().toISOString(),
    },
  }
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

    // ── Resolve VLM provider ──
    const provider = await loadProvider()
    if (!provider) {
      return NextResponse.json(
        {
          error:
            'PDF auto-extraction is not configured. Set GEMINI_API_KEY (recommended — free tier at aistudio.google.com/apikey) OR ZAI_BASE_URL + ZAI_API_KEY in environment variables. You can also fill the form manually below.',
        },
        { status: 503 }
      )
    }

    // ── Read PDF ──
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log(`[challans/extract] Processing PDF: ${file.name} (${buffer.length} bytes) via ${provider.kind}`)

    // ── Call VLM ──
    const raw = await callVlm(provider, buffer, file.name)

    // ── Parse + normalize ──
    let parsed_json: Record<string, unknown>
    try {
      parsed_json = parseVlmJson(raw)
    } catch {
      return NextResponse.json(
        { error: 'Could not parse VLM output as JSON. Please try again or fill the form manually.', raw },
        { status: 502 }
      )
    }

    const result = normalizeResult(parsed_json, file.name, buffer.length)
    console.log(`[challans/extract] Success: challan=${result.challanNumber}, items=${result.items.length}`)
    return NextResponse.json({ ok: true, data: result, provider: provider.kind })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[challans/extract] error:', msg)

    const isNetworkError =
      /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network|getaddrinfo|connect ETIMEDOUT/i.test(msg)

    return NextResponse.json(
      {
        error: isNetworkError
          ? 'PDF auto-extraction failed — the VLM service is not reachable from this server. Fill the form manually below, or configure GEMINI_API_KEY.'
          : `PDF extraction failed: ${msg}. You can still fill the form manually below.`,
        detail: msg,
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Health check — reports which VLM provider is configured
  const provider = await loadProvider()
  if (!provider) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No VLM configured. Set GEMINI_API_KEY (recommended) or ZAI_BASE_URL + ZAI_API_KEY env vars.',
      },
      { status: 503 }
    )
  }
  return NextResponse.json({
    ok: true,
    provider: provider.kind,
    ...(provider.kind === 'gemini' ? { model: provider.model } : { baseUrl: provider.baseUrl }),
  })
}
