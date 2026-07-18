// Mini-service: Challan PDF extraction via VLM (glm-4.6v)
// Runs on port 3031. Accepts POST multipart/form-data with a `file` field (PDF).
// Returns structured JSON matching the Sales upload form's A/B/C sections.
//
// This is a separate process so the Next.js dev server doesn't OOM
// when importing the heavy z-ai-web-dev-sdk.

import { createServer } from 'http'
import ZAI from 'z-ai-web-dev-sdk'

const PORT = 3031

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

// ── Simple multipart/form-data parser (only needs the file field) ──
function parseMultipart(buffer: Buffer, boundary: string): { file?: { name: string; type: string; data: Buffer } } {
  const result: { file?: { name: string; type: string; data: Buffer } } = {}
  const boundaryBuffer = Buffer.from('--' + boundary)
  let start = 0
  while (true) {
    const bStart = buffer.indexOf(boundaryBuffer, start)
    if (bStart === -1) break
    const nextBStart = buffer.indexOf(boundaryBuffer, bStart + boundaryBuffer.length)
    if (nextBStart === -1) break
    const part = buffer.slice(bStart + boundaryBuffer.length, nextBStart)
    // Find headers end (\r\n\r\n)
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) { start = nextBStart; continue }
    const headerStr = part.slice(0, headerEnd).toString('utf-8')
    const body = part.slice(headerEnd + 4, part.length - 2) // strip trailing \r\n
    // Parse Content-Disposition
    const nameMatch = headerStr.match(/name="([^"]+)"/)
    const filenameMatch = headerStr.match(/filename="([^"]*)"/)
    const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i)
    if (nameMatch && nameMatch[1] === 'file') {
      result.file = {
        name: filenameMatch ? filenameMatch[1] : 'upload.pdf',
        type: ctMatch ? ctMatch[1].trim() : 'application/pdf',
        data: body,
      }
    }
    start = nextBStart
  }
  return result
}

const server = createServer(async (req, res) => {
  // CORS + health
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'challan-extract', port: PORT }))
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    // Read full body
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    const body = Buffer.concat(chunks)
    const ct = req.headers['content-type'] || ''
    const boundaryMatch = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/)
    if (!boundaryMatch) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing multipart boundary' }))
      return
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2]
    const parsed = parseMultipart(body, boundary)
    if (!parsed.file) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No file uploaded. Send a PDF as multipart form field "file".' }))
      return
    }
    if (parsed.file.type !== 'application/pdf' && !parsed.file.name.toLowerCase().endsWith('.pdf')) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Only PDF files are supported' }))
      return
    }

    const base64 = parsed.file.data.toString('base64')
    const dataUrl = `data:application/pdf;base64,${base64}`

    console.log(`[challan-extract] Processing PDF: ${parsed.file.name} (${parsed.file.data.length} bytes)`)

    const zai = await ZAI.create()
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
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Could not parse VLM output as JSON', raw }))
      return
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
      pdfFileName: parsed.file.name,
      _meta: {
        fileName: parsed.file.name,
        fileSize: parsed.file.data.length,
        extractedAt: new Date().toISOString(),
      },
    }

    console.log(`[challan-extract] Success: challan=${result.challanNumber}, items=${normalizedItems.length}`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, data: result }))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[challan-extract] error:', msg)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'PDF extraction failed', detail: msg }))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[challan-extract] VLM extraction service listening on http://127.0.0.1:${PORT}`)
})
