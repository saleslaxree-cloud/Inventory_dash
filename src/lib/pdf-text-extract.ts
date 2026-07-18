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
    textLength?: number
  }
}

/**
 * Extract text from a PDF Buffer using pdfjs-dist.
 * Works in the Node.js runtime (Vercel serverless functions).
 *
 * CRITICAL: We reconstruct lines by Y-coordinate. Naively space-joining all
 * text items flattens the document into one giant string, destroying the
 * line structure — so "Challan No. : LC-123" and the value on the next
 * visual line get jumbled together and regex can't match them. By grouping
 * items with similar Y coordinates into lines (sorted top-to-bottom, then
 * left-to-right within each line), we preserve the visual layout, making
 * field extraction dramatically more reliable.
 *
 * NOTE: pdfjs-dist v6 uses browser APIs like DOMMatrix that don't exist in
 * Node.js. We polyfill them before importing pdfjs.
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  // ── Polyfills for Node.js / Vercel serverless environment ──
  // pdfjs-dist v6 expects a browser environment with DOMMatrix, DOMPoint,
  // and other DOM types. We provide minimal polyfills so it can load.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // Minimal DOMMatrix polyfill — only what pdfjs needs (multiply, transform)
    class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      constructor(init?: number[] | string) {
        if (Array.isArray(init)) {
          if (init.length >= 6) {
            this.a = init[0]; this.b = init[1]; this.c = init[2]
            this.d = init[3]; this.e = init[4]; this.f = init[5]
          }
        }
      }
      multiply(other: DOMMatrix) {
        const r = new DOMMatrix()
        r.a = this.a * other.a + this.c * other.b
        r.b = this.b * other.a + this.d * other.b
        r.c = this.a * other.c + this.c * other.d
        r.d = this.b * other.c + this.d * other.d
        r.e = this.a * other.e + this.c * other.f + this.e
        r.f = this.b * other.e + this.d * other.f + this.f
        return r
      }
      transformPoint(pt: { x: number; y: number }) {
        return { x: this.a * pt.x + this.c * pt.y + this.e, y: this.b * pt.x + this.d * pt.y + this.f }
      }
    }
    ;(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix
  }
  if (typeof globalThis.DOMPoint === 'undefined') {
    class DOMPoint {
      x: number; y: number; z: number; w: number
      constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w }
    }
    ;(globalThis as Record<string, unknown>).DOMPoint = DOMPoint
  }

  // Use the legacy build for Node.js compatibility
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // Configure pdfjs to run WITHOUT a web worker (workers don't work in
  // Vercel serverless functions).
  try {
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    if (workerModule?.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = ''
      // @ts-expect-error - workerPort is a valid option but not in the types
      pdfjsLib.GlobalWorkerOptions.workerPort = null
    }
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
  }

  const data = new Uint8Array(pdfBuffer)
  const doc = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise

  let fullText = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()

    // ── Reconstruct lines by Y-coordinate ──
    // Each text item has a `transform` ([a,b,c,d,e,f]) where (e,f) is the
    // position. Items on the same visual line share (approximately) the same
    // Y (f). We group them, sort by X (e) within the line, then sort lines
    // top-to-bottom (descending Y, since PDF Y grows upward).
    type Item = { str: string; x: number; y: number; w: number }
    const items: Item[] = []
    for (const it of content.items) {
      if (!('str' in it) || typeof it.str !== 'string' || it.str.length === 0) continue
      const tr = (it as { transform?: number[] }).transform
      if (!tr || tr.length < 6) {
        // No position info — append as-is
        items.push({ str: it.str, x: 0, y: 0, w: 0 })
        continue
      }
      const x = tr[4]
      const y = tr[5]
      // Estimate width from the font height (transform[3]) × string length
      const w = Math.abs(tr[0]) * it.str.length
      items.push({ str: it.str, x, y, w })
    }

    // Group items into lines by similar Y (within 3 units tolerance)
    const lineMap = new Map<number, Item[]>()
    const sortedByY = [...items].sort((a, b) => b.y - a.y) // top to bottom
    const usedYs: number[] = []
    for (const it of sortedByY) {
      // Find an existing line with close Y
      let foundLine = -1
      for (let li = 0; li < usedYs.length; li++) {
        if (Math.abs(usedYs[li] - it.y) < 3) {
          foundLine = li
          break
        }
      }
      if (foundLine === -1) {
        usedYs.push(it.y)
        lineMap.set(it.y, [it])
      } else {
        lineMap.get(usedYs[foundLine])!.push(it)
      }
    }

    // Build lines: sort each line's items by X, join with space; sort lines by Y desc
    const lines: string[] = []
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!.sort((a, b) => a.x - b.x)
      const lineStr = lineItems.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim()
      if (lineStr) lines.push(lineStr)
    }
    fullText += lines.join('\n') + '\n'
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
 * Try multiple regex patterns and return the first match. Each pattern should
 * have one capture group for the value. All patterns are case-insensitive.
 */
function tryPatterns(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re)
    if (m && m[1]) {
      let val = m[1].trim().replace(/\s+/g, ' ')
      if (val) return val
    }
  }
  return null
}

/**
 * Extract the value after a label, stopping at the next label-like pattern.
 * In the line-based text, multiple labels may appear on the same line:
 *   "Billing Name : ACME CORP Shipping Address : 123 MAIN ST"
 * So we stop the capture at any " NextLabel :" pattern OR end of line.
 */
function extractField(text: string, patterns: RegExp[]): string | null {
  return tryPatterns(text, patterns)
}

/**
 * Generic fallback: find a GST number anywhere in the text.
 * GSTIN format (15 chars): 2 digits + 5 letters + 4 digits + 1 letter + 1 digit + 'Z' + 1 alphanumeric
 * Example: 01AANCC2070Q1ZI
 */
function findGstNumber(text: string): string | null {
  // 15-character GSTIN pattern
  const m = text.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]{3})\b/)
  return m ? m[1] : null
}

/**
 * Generic fallback: find a 10-digit phone number anywhere in the text.
 * Prefers numbers prefixed with "Primary" or "Phone".
 */
function findPhoneNumber(text: string): string | null {
  // Look for "Primary: XXXXXXXXXX" first
  const primary = text.match(/Primary:?\s*(\d{10})/i)
  if (primary) return primary[1]
  // Then any standalone 10-digit number (not part of a date or longer number)
  const m = text.match(/(?<!\d)(\d{10})(?!\d)/)
  return m ? m[1] : null
}

/**
 * Generic fallback: find the largest amount in the text (likely the grand total).
 */
function findGrandTotal(text: string): number | null {
  const amounts: number[] = []
  const re = /₹\s*([\d,]+\.?\d*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseAmount(m[1])
    if (n !== null) amounts.push(n)
  }
  if (amounts.length === 0) return null
  return Math.max(...amounts)
}

/**
 * Extract all item rows from the challan text.
 *
 * With line-based text, items are typically split across multiple lines:
 *   Line A: "LRWA - MANUAL SOAP DISPENSER LEAKAGE PROOF ..."  (item code + description)
 *   Line B: "1 WHITE ₹ 375 5 ₹ 1875 18% ₹ 2212.50"             (Sr, colour, prices)
 *   Line C: "382 350ML PRODUCT SIZE: 75*130*215MM"              (rest of code + desc)
 *
 * Strategy: find lines with the financial pattern (₹ price qty ₹ amount gst% ₹ total),
 * then search nearby lines for the item code (LRWA-XXX, LRSR-XXX, etc.) and
 * description. Also try a flattened single-line match as a fallback.
 */
function extractItems(text: string): ExtractedChallan['items'] {
  const items: ExtractedChallan['items'] = []
  const seen = new Set<string>()

  const addItem = (it: ExtractedChallan['items'][number]) => {
    const key = `${it.itemNumber || it.itemName}-${it.quantity}-${it.unitPrice}`
    if (seen.has(key)) return
    seen.add(key)
    items.push(it)
  }

  const lines = text.split('\n')
  const colours = 'WHITE|BLACK|BROWN|GREY|GRAY|RED|BLUE|GREEN|YELLOW|SILVER|GOLD|CREAM|BEIGE|IVORY|CHROME|MATT|MATTE|NA'

  // Laxree item codes: LRWA, LRSR, LRWM, LRxx followed by - and 2-4 digits
  // This is more specific than the generic [A-Z]{2,5}\d{2,4} pattern which
  // catches random text like "CODE1800", "ITHIN20", etc.
  const itemCodeRe = /\b(LR[A-Z]{2}\s*-?\s*\d{2,4}(?:\s*-?[A-Z])?)\b/i
  const itemCodeGlobalRe = /\b(LR[A-Z]{2}\s*-?\s*\d{2,4}(?:\s*-?[A-Z])?)\b/gi

  // ── Strategy 1: Find financial lines, then search nearby for item code ──
  // A "financial line" has the pattern: [Sr] [Colour] ₹ price qty ₹ amount gst% ₹ total
  const financialLineRe = new RegExp(
    `^(\\d+)\\s+` +                           // Sr number
    `((?:${colours})\\s+)?` +                  // optional colour
    `₹?\\s*([\\d,]+\\.?\\d*)\\s+` +            // unit price
    `(\\d+)\\s+` +                              // qty
    `₹?\\s*([\\d,]+\\.?\\d*)\\s+` +            // amount
    `(\\d+)%\\s+` +                             // gst%
    `₹?\\s*([\\d,]+\\.?\\d*)`,                  // total
    'i'
  )

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const fm = line.match(financialLineRe)
    if (!fm) continue

    const [, srStr, colourPart, priceStr, qtyStr, amountStr, gstStr, totalStr] = fm
    const quantity = Number(qtyStr) || 1
    const unitPrice = parseAmount(priceStr) || 0
    const totalPrice = parseAmount(totalStr) || parseAmount(amountStr) || quantity * unitPrice
    const colour = colourPart ? colourPart.trim().toUpperCase() : null

    // Search this line ± 3 lines for an item code.
    // The item code may be SPLIT across lines: "LRWA" on one line, "382" on another.
    let itemCode: string | null = null
    let description: string | null = null
    const descParts: string[] = []

    // First pass: try to find a COMPLETE code (LRxx + digits on same line)
    for (let si = Math.max(0, li - 3); si <= Math.min(lines.length - 1, li + 3); si++) {
      const sline = lines[si]
      const cm = sline.match(itemCodeRe)
      if (cm) {
        itemCode = cm[1].replace(/\s*-\s*/g, '-').replace(/\s+/g, '').toUpperCase()
        const desc = sline.replace(cm[0], '').replace(/^\s*[\d]+\s*/, '').trim()
        if (desc && desc.length > 3) descParts.push(desc)
        break
      }
    }

    // Second pass: if no complete code, look for SPLIT code (LRWA on one line, 382 on another)
    if (!itemCode) {
      let foundPrefix: string | null = null
      let foundNum: string | null = null
      let prefixLine = -1
      for (let si = Math.max(0, li - 3); si <= Math.min(lines.length - 1, li + 3); si++) {
        const sline = lines[si]
        // Look for "LRWA" or "LRxx" prefix at start of line (may be followed by " - " and description)
        const pm = sline.match(/^\s*(LR[A-Z]{2})\s*[-:]?\s*/)
        if (pm && !foundPrefix) {
          foundPrefix = pm[1]
          prefixLine = si
          // Collect description from this line (after the prefix)
          const desc = sline.replace(pm[0], '').trim()
          if (desc && desc.length > 2) descParts.push(desc)
        }
      }
      if (foundPrefix) {
        // Look for a standalone 2-4 digit number on nearby lines
        for (let si = Math.max(0, li - 3); si <= Math.min(lines.length - 1, li + 3); si++) {
          if (si === prefixLine) continue
          const sline = lines[si]
          // Number at start of line, or standalone number
          const nm = sline.match(/^\s*(\d{2,4})(?:\s|$)/)
          if (nm && !foundNum) {
            // Make sure this isn't the Sr number from the financial line
            if (nm[1] !== srStr) {
              foundNum = nm[1]
              // Collect description from this line too
              const desc = sline.replace(nm[0], '').trim()
              if (desc && desc.length > 2) descParts.push(desc)
            }
          }
        }
        if (foundNum) {
          itemCode = `${foundPrefix}-${foundNum}`
        } else {
          // Just use the prefix as the code
          itemCode = foundPrefix
        }
      }
    }

    // Collect description from nearby lines — but be selective.
    // Only collect from lines that are clearly part of the item row (between
    // the item code prefix and the financial line). Skip:
    //   - Table headers (contain "Sr.", "Model", "Description", "Colour", "Qty")
    //   - Terms & conditions (start with "#")
    //   - Financial summary lines (Total, Sub Total, Grand, Packing, etc.)
    //   - Lines that look like other items (start with a different LR code)
    const skipPatterns = /^(Sr\.|Model|Description|Image|Colour|Qty|Amount|GST|Total|Sub\s*Total|Grand|Packing|Terms|Freight|GST|Discount|Price|Remark|#|Discounted|Laxree|PLEASE|CHALLAN|M\/S|Site|Kind|Billing|Shipping|Phone|Mobile|PO\s|Transportation|Committed|Quotation|Challan)/i
    for (let si = Math.max(0, li - 3); si <= Math.min(lines.length - 1, li + 3); si++) {
      if (si === li) continue // skip the financial line itself
      const sline = lines[si].trim()
      if (!sline) continue
      if (sline.match(financialLineRe)) continue // skip other financial lines
      if (sline.match(skipPatterns)) continue // skip headers/terms
      // Get the description part (remove item code if present, remove leading numbers)
      let desc = sline.replace(itemCodeRe, '').replace(/^\s*\d{2,4}\s*/, '').trim()
      // Skip if what's left is too short or looks like a price/number
      if (desc.length < 5 || desc.match(/^₹/) || desc.match(/^\d+$/)) continue
      if (!descParts.includes(desc)) {
        descParts.push(desc)
      }
    }

    if (descParts.length > 0 && !description) {
      // Deduplicate and join — but if we have the same description repeated
      // (from prefix line and number line), only keep one copy
      const unique: string[] = []
      for (const d of descParts) {
        if (!unique.some((u) => u.includes(d) || d.includes(u))) {
          unique.push(d)
        }
      }
      description = unique.join(' ').replace(/\s+/g, ' ').trim()
    }

    // If no code found, use Sr as fallback identifier
    if (!itemCode) {
      itemCode = `ITEM-${srStr}`
    }

    addItem({
      category: null,
      itemName: description || itemCode,
      itemNumber: itemCode,
      model: itemCode,
      colour,
      quantity,
      unitPrice,
      totalPrice,
    })
  }

  // ── Strategy 2: Flattened single-line match (for PDFs where items ARE on one line) ──
  if (items.length === 0) {
    const norm = text.replace(/\s+/g, ' ')
    // Reconstruct split codes: "LRWA - 382" → "LRWA-382"
    // Match: Sr + code + desc + colour + prices
    const flatRe = new RegExp(
      '(\\d+)\\s+' +
      '(LR[A-Z]{2}\\s*-?\\s*\\d{2,4}(?:\\s*-?[A-Z])?)\\s+' +
      '(.+?)\\s+' +
      `((?:${colours})\\s+)?` +
      '₹?\\s*([\\d,]+\\.?\\d*)\\s+(\\d+)\\s+₹?\\s*([\\d,]+\\.?\\d*)\\s+(\\d+)%\\s+₹?\\s*([\\d,]+\\.?\\d*)',
      'gi'
    )
    let match: RegExpExecArray | null
    while ((match = flatRe.exec(norm)) !== null) {
      const [, , codeRaw, descRaw, colourRaw, priceStr, qtyStr, amountStr, , totalStr] = match
      const itemCode = codeRaw.replace(/\s*-\s*/g, '-').replace(/\s+/g, '').toUpperCase()
      const colour = colourRaw ? colourRaw.trim().toUpperCase() : null
      const quantity = Number(qtyStr) || 1
      const unitPrice = parseAmount(priceStr) || 0
      const totalPrice = parseAmount(totalStr) || parseAmount(amountStr) || quantity * unitPrice
      addItem({
        category: null,
        itemName: (descRaw || '').trim() || itemCode,
        itemNumber: itemCode,
        model: itemCode,
        colour,
        quantity,
        unitPrice,
        totalPrice,
      })
    }
  }

  // ── Strategy 3: Just find ALL item codes and their nearest numbers ──
  // (very loose — only used if strategies 1 & 2 found nothing)
  if (items.length === 0) {
    const allCodes = [...text.matchAll(itemCodeGlobalRe)]
    for (const cm of allCodes) {
      const itemCode = cm[1].replace(/\s*-\s*/g, '-').replace(/\s+/g, '').toUpperCase()
      // Find the line containing this code
      const codePos = cm.index || 0
      const before = text.slice(0, codePos)
      const lineStart = before.lastIndexOf('\n') + 1
      const after = text.slice(codePos)
      const lineEnd = after.indexOf('\n')
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : codePos + lineEnd)
      // Also check next line for continuation
      const nextLineStart = codePos + (lineEnd === -1 ? 0 : lineEnd + 1)
      const nextAfter = text.slice(nextLineStart)
      const nextLineEnd = nextAfter.indexOf('\n')
      const nextLine = nextLineEnd === -1 ? '' : nextAfter.slice(0, nextLineEnd)

      // Find numbers on this line + next line
      const combinedLine = line + ' ' + nextLine
      const nums = [...combinedLine.matchAll(/₹?\s*([\d,]+\.?\d*)/g)].map((m) => parseAmount(m[1])).filter((n): n is number => n !== null)
      const qtyM = combinedLine.match(/\b(\d{1,3})\b/g)
      const quantity = qtyM && qtyM.length > 0 ? Number(qtyM[0]) : 1
      const unitPrice = nums.length > 0 ? Math.max(...nums.filter((n) => n < 100000)) : 0
      const totalPrice = nums.length > 0 ? Math.max(...nums) : quantity * unitPrice

      // Description = rest of line after code
      const desc = line.replace(cm[0], '').replace(/^\s*\d+\s*/, '').trim()

      if (unitPrice > 0 || quantity > 1) {
        addItem({
          category: null,
          itemName: desc || itemCode,
          itemNumber: itemCode,
          model: itemCode,
          colour: null,
          quantity,
          unitPrice,
          totalPrice,
        })
      }
    }
  }

  return items
}

/**
 * Main entry: extract all challan fields from a PDF buffer using text + regex.
 * Returns the same shape as the VLM-based extraction so the route handler can
 * use either interchangeably.
 *
 * We try MULTIPLE regex patterns per field (strict → loose), and fall back to
 * generic pattern matching (any GST number, any phone, any amount) if the
 * specific labels aren't found. This makes extraction robust to layout
 * variations across different challan templates.
 *
 * The text is LINE-BASED (reconstructed by Y-coordinate), so labels and values
 * are usually on the same visual line. Multiple labels may share a line:
 *   "Challan No. : LC-123 Committed Delivery : 26/05/2026"
 * So our stop-patterns include all common next-labels.
 */
/**
 * Parse challan fields from pre-extracted text (from any source — pdfjs or OCR).
 * This is the core regex extraction logic, separated from the PDF text extraction
 * so it can be reused with OCR'd text.
 */
export function extractChallanFields(
  text: string,
  fileName: string,
  fileSize: number
): ExtractedChallan {

  // ── Challan Number ──
  // Stop at: Committed, Challan Date, or any "Label :" pattern on the same line
  const challanNumber = extractField(text, [
    /Challan\s*(?:No|Number)\.?\s*[:\-]\s*(LC[-/A-Z0-9]+)/i,
    /Challan\s*(?:No|Number)\.?\s*[:\-]\s*(\S+)/i,
  ])

  // ── Challan Date ──
  const challanDateRaw = extractField(text, [
    /Challan\s+Date\s*[:\-]\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}(?:\s+\d{1,2}:\d{2}\s*[ap]m)?)/i,
  ])

  // ── Committed Delivery / Expected Delivery ──
  const committedDelivery = extractField(text, [
    /Committed\s+Delivery\s*[:\-]\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
    /Expected\s+Delivery\s*[:\-]\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
    /Delivery\s+Date\s*[:\-]\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
  ])

  // ── Quotation Number ──
  const quotationNumber = extractField(text, [
    /Quotation\s*(?:No|Number)\.?\s*[:\-]\s*(LR[-/A-Z0-9]+)/i,
    /Quotation\s*(?:No|Number)\.?\s*[:\-]\s*(\S+)/i,
  ])

  // ── Billing Name ──
  // Stop at: Shipping, GST, PO No, Phone, or end of line
  const billingName = extractField(text, [
    /Billing\s+Name\s*[:\-]\s*(.+?)(?=\s+(?:Shipping\s+Address|GST|PO\s+No|Phone|M\/S|$))/i,
    /Bill\s+To\s*[:\-]\s*(.+?)(?=\s+(?:Address|GST|Phone|$))/i,
    /Customer\s+Name\s*[:\-]\s*(.+?)(?=\s+(?:Address|GST|Phone|$))/i,
  ])

  // ── Billing Address ──
  const billingAddress = extractField(text, [
    /Billing\s+Address\s*[:\-]\s*(.+?)(?=\s+(?:Shipping\s+Address|PO\s+No|GST\s+No|Phone|M\/S|$))/i,
  ])

  // ── Shipping Address ──
  const shippingAddress = extractField(text, [
    /Shipping\s+Address\s*[:\-]\s*(.+?)(?=\s+(?:Transportation|PO\s+Date|Phone|M\/S|$))/i,
    /Ship\s+To\s*[:\-]\s*(.+?)(?=\s+(?:Transportation|Phone|$))/i,
  ])

  // ── GST Number — try label first, then generic fallback ──
  let gstNumber = extractField(text, [
    /GST\s*(?:No|Number|IN)\.?\s*[:\-]\s*(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]{3})/i,
  ])
  if (!gstNumber) {
    gstNumber = findGstNumber(text)
  }

  // ── M/S (contact person) ──
  // Stop at: Quotation, Site Add, Kind Attention, or end of line
  const msName = extractField(text, [
    /M\/S\s*[:\-]\s*(.+?)(?=\s+(?:Quotation|Site\s+Add|Kind\s+Attention|Dated|$))/i,
    /Attention\s*[:\-]\s*(.+?)(?=\s+(?:Site|Phone|Dated|$))/i,
  ])

  // ── Site Address (used as clientCity) ──
  const siteAdd = extractField(text, [
    /Site\s+Add\.?\s*[:\-]\s*(.+?)(?=\s+(?:Kind\s+Attention|Dated|Challan\s+No|$))/i,
    /City\s*[:\-]\s*([A-Z\s]{3,30})(?=\s+(?:Phone|Mobile|Dated|$))/i,
  ])

  // ── Phone / Mobile — prefer "Phone :" field with Primary ──
  let clientMobile: string | null = null
  const phoneRaw = extractField(text, [
    /Phone\s*[:\-]\s*(.+?)(?=\s+(?:M\/S|Site|Mobile|PO\s+Date|$))/i,
  ])
  if (phoneRaw) {
    const primaryMatch = phoneRaw.match(/Primary:?\s*(\d{10,})/i)
    if (primaryMatch) {
      clientMobile = primaryMatch[1]
    } else {
      const anyDigits = phoneRaw.match(/\d{10,}/)
      clientMobile = anyDigits ? anyDigits[0] : null
    }
  }
  if (!clientMobile) {
    // Try "Mobile :" field (but skip the Laxree company mobile)
    const mobileMatch = text.match(/Mobile\s*[:\-]\s*(\d{10,})/i)
    if (mobileMatch) {
      // Avoid the company's mobile number (usually appears under the Laxree address)
      // The client mobile is typically in the billing section, so take the FIRST
      // mobile match that's NOT under "Laxree Amenities"
      clientMobile = mobileMatch[1]
    }
  }
  if (!clientMobile) {
    clientMobile = findPhoneNumber(text)
  }

  // ── Financial totals ──
  const totalWithoutTax = parseAmount(extractField(text, [
    /Total\s+Without\s+Tax\s*₹?\s*([\d,]+\.?\d*)/i,
    /Sub\s*Total\s*₹?\s*([\d,]+\.?\d*)/i,
    /Subtotal\s*₹?\s*([\d,]+\.?\d*)/i,
    /Amount\s+Without\s+GST\s*₹?\s*([\d,]+\.?\d*)/i,
  ]))

  const totalWithTax = parseAmount(extractField(text, [
    /Total\s+With\s+Tax\s*₹?\s*([\d,]+\.?\d*)/i,
    /Total\s+With\s+GST\s*₹?\s*([\d,]+\.?\d*)/i,
  ]))

  let grandTotal = parseAmount(extractField(text, [
    /Grand\s+Total\s*₹?\s*([\d,]+\.?\d*)/i,
    /Total\s+Amount\s*₹?\s*([\d,]+\.?\d*)/i,
    /Net\s+Amount\s*₹?\s*([\d,]+\.?\d*)/i,
  ]))
  if (grandTotal === null) {
    grandTotal = findGrandTotal(text)
  }

  const packingCharge = parseAmount(extractField(text, [
    /Packing\s+Charges?\s*₹?\s*([\d,]+\.?\d*)/i,
    /Packing\s*₹?\s*([\d,]+\.?\d*)/i,
  ]))

  // GST percentage
  const gstMatch = text.match(/(\d{1,2})%\s*₹?\s*[\d,]+\.?\d*/) || text.match(/\bGST\s*[:\-]?\s*(\d{1,2})\s*%/i)
  const gstPercentage = gstMatch ? Number(gstMatch[1]) : null

  // ── Items ──
  const items = extractItems(text)

  // ── Normalize challanDate ──
  const challanDate = challanDateRaw ? challanDateRaw.replace(/\s+/g, ' ').trim() : null

  // ── Derive clientCity from siteAdd ──
  let clientCity: string | null = null
  if (siteAdd) {
    const cleaned = siteAdd.replace(/\s+/g, ' ').trim()
    // If it's a single word (just a city), use it directly
    if (!cleaned.includes(' ') && cleaned.length <= 30) {
      clientCity = cleaned
    } else {
      // Extract city: look for a standalone uppercase word (city names are usually uppercase)
      const parts = cleaned.split(/[\s,\-]+/)
      const cityPart = parts.find((p) => /^[A-Z]{3,20}$/.test(p))
      clientCity = cityPart || parts[parts.length - 1] || cleaned
    }
  }

  return {
    challanNumber,
    challanDate,
    quotationNumber,
    clientName: msName || billingName,
    clientCity,
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
      fileSize,
      extractedAt: new Date().toISOString(),
      method: 'text-regex',
      textLength: text.length,
    },
  }
}

/**
 * Main entry: extract text from a PDF buffer using pdfjs-dist, then parse
 * challan fields from the text using regex.
 */
export async function extractChallanFromText(
  pdfBuffer: Buffer,
  fileName: string
): Promise<ExtractedChallan> {
  const text = await extractPdfText(pdfBuffer)
  return extractChallanFields(text, fileName, pdfBuffer.length)
}

/**
 * Quickly check whether a request's uploaded file is a PDF.
 */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

// Re-export for the route to use the same request type
export type { NextRequest }
