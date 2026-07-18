/**
 * Text-based PDF extraction for the Laxree challan format.
 *
 * This is a ZERO-DEPENDENCY-ON-EXTERNAL-APIS alternative to the VLM-based
 * extraction. It uses `pdfjs-dist` to pull the raw text out of the PDF, then
 * applies regex rules tuned to the Laxree challan layout to extract all the
 * fields the Sales upload form needs.
 *
 * Why this exists:
 *   - Vercel can't reach internal-api.z.ai (private IPs).
 *   - The user's Gemini key had quota limit = 0 (free tier disabled).
 *   - This approach needs NO API key, NO external service, works on every
 *     cloud, costs nothing, and is fast (~100ms vs 10-30s for a VLM).
 *
 * Limitations:
 *   - Only works on text-based PDFs (not scanned images). The Laxree challan
 *     is generated digitally so it always has embedded text.
 *   - Regex is tuned to the current Laxree challan layout. If the layout
 *     changes, the regexes need updating.
 */

import type { NextRequest } from 'next/server'

export type ExtractedChallan = {
  challanNumber: string | null
  challanDate: string | null
  quotationNumber: string | null
  clientName: string | null
  clientCity: string | null
  clientMobile: string | null
  billingName: string | null
  billingAddress: string | null
  shippingAddress: string | null
  gstNumber: string | null
  expectedDeliveryDate: string | null
  amountWithoutGst: number | null
  gstPercentage: number | null
  packingCharge: number | null
  amountWithGst: number | null
  amountTotal: number | null
  items: Array<{
    category: string | null
    itemName: string
    itemNumber: string | null
    model: string | null
    colour: string | null
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  pdfFileName: string
  _meta: {
    fileName: string
    fileSize: number
    extractedAt: string
    method: 'text-regex'
  }
}

/**
 * Extract text from a PDF Buffer using pdfjs-dist.
 * Works in the Node.js runtime (Vercel serverless functions).
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  // Use the legacy build for Node.js compatibility
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(pdfBuffer)
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise

  let fullText = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // Join items with space; preserve line structure via 'hasEOL'
    const parts: string[] = []
    for (const item of content.items) {
      if ('str' in item) {
        parts.push(item.str)
      }
    }
    fullText += parts.join(' ') + '\n'
  }
  return fullText
}

/**
 * Parse a number from a string that may contain ₹, commas, spaces.
 * "₹ 1,912.50" → 1912.5
 */
function parseAmount(s: string | null | undefined): number | null {
  if (!s) return null
  const cleaned = s.replace(/[₹,\s]/g, '').match(/-?\d+(\.\d+)?/)
  if (!cleaned) return null
  const n = Number(cleaned[0])
  return Number.isFinite(n) ? n : null
}

/**
 * Convert "26/05/2026" or "26-05-2026" → "2026-05-26" (ISO).
 * Returns null if the input can't be parsed.
 */
function toIsoDate(s: string | null | undefined): string | null {
  if (!s) return null
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/)
  if (m) {
    const [, dd, mm, yyyy] = m
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  // Already ISO?
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return null
}

/**
 * Extract the value after a label like "Challan No. :".
 * The text from pdfjs is space-joined, so the value runs until the next label
 * or until 2+ spaces. We capture non-greedy up to the next known label or
 * double-space boundary.
 */
function extractField(text: string, label: RegExp): string | null {
  const m = text.match(label)
  if (!m || !m[1]) return null
  // Trim, collapse internal whitespace, strip trailing label-like artifacts
  let val = m[1].trim().replace(/\s+/g, ' ')
  // Cut off at common stop-words / next-label patterns that bleed in
  val = val.replace(/\s{2,}.*$/, '').trim()
  return val || null
}

/**
 * Extract all item rows from the challan text.
 *
 * Sample item line from pdfjs (space-joined):
 *   "1 LRWA - 382 MANUAL SOAP DISPENSER LEAKAGE PROOF ... WHITE ₹ 375 5 ₹ 1875 18% ₹ 2212.50"
 *
 * Note: the item code may be rendered as "LRWA - 382" (with spaces around the
 * dash) because pdfjs splits the model number across two text fragments at
 * different Y coordinates. We normalize by stripping spaces around dashes.
 *
 * Strategy: find lines starting with an Sr number (1, 2, 3...) followed by an
 * item code (like LRWA-382, LRWA-XXX), then parse the trailing numbers.
 */
function extractItems(text: string): ExtractedChallan['items'] {
  const items: ExtractedChallan['items'] = []

  // Normalize: collapse multiple spaces to single space
  const norm = text.replace(/\s+/g, ' ')

  // Item code pattern: 2-5 letters, optional space-dash-space, 2-4 digits, optional suffix
  // e.g. "LRWA - 382", "LRWA-382", "LRSR-101-A", "LRWA 201"
  const codePattern = '([A-Z]{2,5}\\s*-?\\s*\\d{2,4}(?:\\s*-?[A-Z])?)'

  // Match: Sr | item-code | description... | colour | ₹ price | qty | ₹ amount | gst% | ₹ total
  // Colour is optional (some items have no colour)
  const itemRegex = new RegExp(
    '(\\d+)\\s+' + codePattern + '\\s+' +
    '(.+?)\\s+' +
    '(WHITE|BLACK|BROWN|GREY|GRAY|RED|BLUE|GREEN|YELLOW|SILVER|GOLD|CREAM|BEIGE|IVORY|CHROME|MATT|MATTE|NA)\\s+' +
    '₹\\s*([\\d,]+\\.?\\d*)\\s+(\\d+)\\s+₹\\s*([\\d,]+\\.?\\d*)\\s+(\\d+)%\\s+₹\\s*([\\d,]+\\.?\\d*)',
    'g'
  )

  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(norm)) !== null) {
    const [, srStr, codeRaw, descRaw, colourRaw, priceStr, qtyStr, amountStr, gstStr, totalStr] = match
    // Normalize item code: "LRWA - 382" → "LRWA-382"
    const itemCode = codeRaw.replace(/\s*-\s*/g, '-').replace(/\s+/g, '').toUpperCase()
    const description = (descRaw || '').trim()
    const colour = colourRaw && colourRaw.toUpperCase() !== 'NA' ? colourRaw.toUpperCase() : null
    const quantity = Number(qtyStr) || 1
    const unitPrice = parseAmount(priceStr) || 0
    const totalPrice = parseAmount(totalStr) || parseAmount(amountStr) || quantity * unitPrice

    // itemName: prefer the description (more human-readable), fallback to code
    const itemName = description || itemCode

    items.push({
      category: null,
      itemName,
      itemNumber: itemCode,
      model: itemCode,
      colour,
      quantity,
      unitPrice,
      totalPrice,
    })
  }

  // Fallback 1: item without colour (some rows omit colour column)
  if (items.length === 0) {
    const noColourRegex = new RegExp(
      '(\\d+)\\s+' + codePattern + '\\s+' +
      '(.+?)\\s+' +
      '₹\\s*([\\d,]+\\.?\\d*)\\s+(\\d+)\\s+₹\\s*([\\d,]+\\.?\\d*)\\s+(\\d+)%\\s+₹\\s*([\\d,]+\\.?\\d*)',
      'g'
    )
    while ((match = noColourRegex.exec(norm)) !== null) {
      const [, , codeRaw, descRaw, priceStr, qtyStr, amountStr, , totalStr] = match
      const itemCode = codeRaw.replace(/\s*-\s*/g, '-').replace(/\s+/g, '').toUpperCase()
      const quantity = Number(qtyStr) || 1
      const unitPrice = parseAmount(priceStr) || 0
      const totalPrice = parseAmount(totalStr) || parseAmount(amountStr) || quantity * unitPrice
      items.push({
        category: null,
        itemName: (descRaw || '').trim() || itemCode,
        itemNumber: itemCode,
        model: itemCode,
        colour: null,
        quantity,
        unitPrice,
        totalPrice,
      })
    }
  }

  // Fallback 2: very loose — just Sr + code + price + qty (for partial matches)
  if (items.length === 0) {
    const looseRegex = new RegExp(
      '(\\d+)\\s+' + codePattern + '\\s+(.+?)\\s+₹\\s*([\\d,]+\\.?\\d*)\\s+(\\d+)\\s+₹\\s*([\\d,]+\\.?\\d*)',
      'g'
    )
    while ((match = looseRegex.exec(norm)) !== null) {
      const [, , codeRaw, descRaw, priceStr, qtyStr, amountStr] = match
      const itemCode = codeRaw.replace(/\s*-\s*/g, '-').replace(/\s+/g, '').toUpperCase()
      const quantity = Number(qtyStr) || 1
      const unitPrice = parseAmount(priceStr) || 0
      const totalPrice = parseAmount(amountStr) || quantity * unitPrice
      items.push({
        category: null,
        itemName: (descRaw || '').trim() || itemCode,
        itemNumber: itemCode,
        model: itemCode,
        colour: null,
        quantity,
        unitPrice,
        totalPrice,
      })
    }
  }

  return items
}

/**
 * Main entry: extract all challan fields from a PDF buffer using text + regex.
 * Returns the same shape as the VLM-based extraction so the route handler can
 * use either interchangeably.
 */
export async function extractChallanFromText(
  pdfBuffer: Buffer,
  fileName: string
): Promise<ExtractedChallan> {
  const text = await extractPdfText(pdfBuffer)

  // ── Field extraction (labels are from the actual Laxree challan template) ──
  const challanNumber = extractField(text, /Challan No\.\s*:\s*(.+?)(?=Committed|Challan Date|$)/)
  const challanDateRaw = extractField(text, /Challan Date\s*:\s*(.+?)(?=Laxree|Quotation|$)/)
  const committedDelivery = extractField(text, /Committed Delivery\s*:\s*(.+?)(?=Challan Date|$)/)
  const quotationNumber = extractField(text, /Quotation No\.\s*:\s*(.+?)(?=Dated|$)/)
  const billingName = extractField(text, /Billing Name\s*:\s*(.+?)(?=Billing Address|$)/)
  const billingAddress = extractField(text, /Billing Address\s*:\s*(.+?)(?=PO No|GST No|Shipping|$)/)
  const shippingAddress = extractField(text, /Shipping Address\s*:\s*(.+?)(?=Transportation|Phone|$)/)
  const gstNumber = extractField(text, /GST No\.\s*:\s*(.+?)(?=Shipping|Transportation|$)/)
  const msName = extractField(text, /M\/S\s*:\s*(.+?)(?=Site Add|Kind Attention|$)/)
  const siteAdd = extractField(text, /Site Add\.\s*:\s*(.+?)(?=Kind Attention|Challan No|$)/)
  const phoneRaw = extractField(text, /Phone\s*:\s*(.+?)(?=M\/S|Site Add|$)/)

  // Phone: "Primary: 7006637596, Alternate: 7006637596" → "7006637596"
  let clientMobile: string | null = null
  if (phoneRaw) {
    const primaryMatch = phoneRaw.match(/Primary:?\s*(\d{10,})/)
    if (primaryMatch) {
      clientMobile = primaryMatch[1]
    } else {
      const anyDigits = phoneRaw.match(/\d{10,}/)
      clientMobile = anyDigits ? anyDigits[0] : null
    }
  }
  // Fallback to "Mobile :" field if Phone didn't yield a number
  if (!clientMobile) {
    const mobileRaw = extractField(text, /Mobile\s*:\s*(\d{10,})/)
    clientMobile = mobileRaw
  }

  // ── Financial totals ──
  const totalWithoutTax = parseAmount(extractField(text, /Total Without Tax\s*₹?\s*([\d,]+\.?\d*)/i) || extractField(text, /Total Without Tax\s*:\s*₹?\s*([\d,]+\.?\d*)/i))
  const totalWithTax = parseAmount(extractField(text, /Total With Tax\s*₹?\s*([\d,]+\.?\d*)/i) || extractField(text, /Total With Tax\s*:\s*₹?\s*([\d,]+\.?\d*)/i))
  const grandTotal = parseAmount(extractField(text, /Grand Total\s*₹?\s*([\d,]+\.?\d*)/i) || extractField(text, /Grand Total\s*:\s*₹?\s*([\d,]+\.?\d*)/i))
  const packingCharge = parseAmount(extractField(text, /Packing Charges?\s*₹?\s*([\d,]+\.?\d*)/i) || extractField(text, /Packing Charges?\s*:\s*₹?\s*([\d,]+\.?\d*)/i))

  // GST percentage: take from first item's GST, or scan for an "18%" pattern near totals
  const gstMatch = text.match(/(\d{1,2})%\s*₹\s*[\d,]+\.?\d*/)
  const gstPercentage = gstMatch ? Number(gstMatch[1]) : null

  // ── Items ──
  const items = extractItems(text)

  // ── Normalize challanDate: keep raw (may include time), but also try ISO ──
  // "25/05/2026 04:49PM" — keep as-is for display, the form accepts it
  const challanDate = challanDateRaw ? challanDateRaw.replace(/\s+/g, ' ').trim() : null

  return {
    challanNumber,
    challanDate,
    quotationNumber,
    clientName: msName || billingName,
    clientCity: siteAdd ? siteAdd.replace(/\s+/g, ' ').trim() : null,
    clientMobile,
    billingName,
    billingAddress: billingAddress ? billingAddress.replace(/\s+/g, ' ').trim() : null,
    shippingAddress: shippingAddress ? shippingAddress.replace(/\s+/g, ' ').trim() : null,
    gstNumber,
    expectedDeliveryDate: toIsoDate(committedDelivery),
    amountWithoutGst: totalWithoutTax,
    gstPercentage,
    packingCharge,
    amountWithGst: totalWithTax,
    amountTotal: grandTotal || totalWithTax,
    items,
    pdfFileName: fileName,
    _meta: {
      fileName,
      fileSize: pdfBuffer.length,
      extractedAt: new Date().toISOString(),
      method: 'text-regex',
    },
  }
}

/**
 * Quickly check whether a request's uploaded file is a PDF.
 */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

// Re-export for the route to use the same request type
export type { NextRequest }
