/**
 * OCR-based PDF extraction using Tesseract.js + @napi-rs/canvas.
 *
 * This is a FALLBACK for when text-based extraction (pdf-text-extract.ts)
 * returns no data — typically because the PDF is a scanned image with no
 * embedded text layer.
 *
 * How it works:
 *   1. Render each PDF page to a canvas using pdfjs-dist + @napi-rs/canvas
 *   2. Convert the canvas to a PNG buffer
 *   3. Pass the PNG to Tesseract.js for OCR
 *   4. Return the recognized text
 *
 * Limitations:
 *   - Slower than text extraction (5-15s per page vs ~100ms)
 *   - OCR accuracy depends on image quality (300 DPI recommended)
 *   - On Vercel serverless, may hit the 60s timeout for large PDFs
 *   - Downloads ~10MB of language data on first run (cached after)
 *
 * No API key needed — runs entirely in the serverless function.
 */

import type { Canvas, CanvasRenderingContext2D } from '@napi-rs/canvas'

/**
 * Polyfills needed for pdfjs-dist to render to a canvas in Node.js.
 */
function setupPdfjsCanvas() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) {
          this.a = init[0]; this.b = init[1]; this.c = init[2]
          this.d = init[3]; this.e = init[4]; this.f = init[5]
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
}

/**
 * Render a PDF to images and run OCR on each page.
 * Returns the concatenated text from all pages.
 *
 * @param pdfBuffer The PDF file as a Buffer
 * @param maxPages Maximum number of pages to OCR (default 3, to avoid timeouts)
 * @returns The OCR-extracted text, or null if OCR failed
 */
export async function extractPdfTextWithOcr(
  pdfBuffer: Buffer,
  maxPages = 3
): Promise<string | null> {
  try {
    setupPdfjsCanvas()

    // Dynamic imports so these heavy modules only load when OCR is actually needed
    const { createCanvas } = await import('@napi-rs/canvas')
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

    // Configure pdfjs worker — for rendering, we need the actual worker module.
    // In Node.js, we can use the worker_threads-based fake worker by pointing
    // workerSrc to the worker entry file.
    try {
      // Try to set up the worker via the worker entry module
      const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
      if (workerModule?.GlobalWorkerOptions) {
        // Use the worker module's GlobalWorkerOptions (same object)
        workerModule.GlobalWorkerOptions.workerSrc = ''
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    }

    // Provide a canvas factory so pdfjs can render to @napi-rs/canvas
    // instead of trying to use the browser DOM canvas
    const canvasFactory: {
      create: (w: number, h: number) => { canvas: Canvas; context: CanvasRenderingContext2D }
      reset: (o: { canvas: Canvas; context: CanvasRenderingContext2D }, w: number, h: number) => void
      destroy: (o: { canvas: Canvas; context: CanvasRenderingContext2D }) => void
    } = {
      create(width: number, height: number) {
        const canvas = createCanvas(width, height)
        const context = canvas.getContext('2d')
        return { canvas, context }
      },
      reset(obj: { canvas: Canvas; context: CanvasRenderingContext2D }, width: number, height: number) {
        obj.canvas.width = width
        obj.canvas.height = height
      },
      destroy(obj: { canvas: Canvas; context: CanvasRenderingContext2D }) {
        obj.canvas.width = 0
        obj.canvas.height = 0
      },
    }

    const data = new Uint8Array(pdfBuffer)
    const doc = await pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      // @ts-expect-error - canvasFactory is a valid option
      canvasFactory,
    }).promise

    const pageCount = Math.min(doc.numPages, maxPages)
    const pageTexts: string[] = []

    // Lazy-load tesseract only when we actually need it
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng', 1, {
      // Use a minimal logger to suppress noisy output
      logger: () => {},
    })

    try {
      for (let i = 1; i <= pageCount; i++) {
        const page = await doc.getPage(i)
        const viewport = page.getViewport({ scale: 2.0 }) // 2x for better OCR accuracy

        const canvas = createCanvas(viewport.width, viewport.height)
        const context = canvas.getContext('2d')

        // White background (PDFs may have transparent backgrounds)
        context.fillStyle = 'white'
        context.fillRect(0, 0, viewport.width, viewport.height)

        await page.render({
          // @ts-expect-error - canvasContext is the correct property name
          canvasContext: context,
          viewport,
          // @ts-expect-error - canvasFactory is valid
          canvasFactory,
        }).promise

        // Convert canvas to PNG buffer
        const pngBuffer = canvas.toBuffer('image/png')

        // Run OCR on the page image
        const { data: { text } } = await worker.recognize(pngBuffer)
        if (text && text.trim()) {
          pageTexts.push(text.trim())
        }
      }
    } finally {
      await worker.terminate()
    }

    return pageTexts.length > 0 ? pageTexts.join('\n') : null
  } catch (err) {
    console.error('[pdf-ocr] OCR failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}
