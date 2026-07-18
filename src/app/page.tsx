'use client'

import { useState } from 'react'
import { Eye, FileCode2, Maximize2, Minimize2, Download, RefreshCw, ExternalLink } from 'lucide-react'

export default function Home() {
  const [fullscreen, setFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const fileName = 'LaxRee_Inventory_2026-06-18.html'
  const fileUrl = '/laxree-inventory.html'

  const handleRefresh = () => setIframeKey((k) => k + 1)

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = fileUrl
    a.download = 'LaxRee_Inventory_2026-06-18.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0f1a] text-slate-200">
      {/* Header */}
      {!fullscreen && (
        <header className="border-b border-amber-500/20 bg-gradient-to-r from-[#0c1928] to-[#111f32] px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30">
                <FileCode2 className="h-6 w-6 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-serif text-lg sm:text-xl font-bold bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
                    File Preview
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    <Eye className="h-3 w-3" /> HTML
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400 truncate max-w-[60vw] sm:max-w-md">
                  {fileName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New Tab</span>
              </a>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
              <button
                onClick={() => setFullscreen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2 text-xs font-semibold text-[#0a0f1a] transition-opacity hover:opacity-90"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Fullscreen</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Fullscreen exit button */}
      {fullscreen && (
        <button
          onClick={() => setFullscreen(false)}
          className="fixed top-3 right-3 z-50 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0c1928]/90 px-3 py-2 text-xs font-medium text-amber-300 backdrop-blur transition-colors hover:bg-[#111f32]"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          Exit Fullscreen
        </button>
      )}

      {/* Preview area */}
      <main className="flex-1 relative">
        <iframe
          key={iframeKey}
          src={fileUrl}
          title="LaxRee Inventory Preview"
          className="absolute inset-0 h-full w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </main>

      {/* Footer */}
      {!fullscreen && (
        <footer className="mt-auto border-t border-amber-500/20 bg-[#0c1928] px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Preview rendered from uploaded file</span>
            </div>
            <div className="flex items-center gap-3">
              <span>Source: <code className="text-amber-400/80">/upload/</code></span>
              <span>Size: ~1.1 MB</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
