'use client'
/**
 * Global Notification Provider
 *
 * - Connects to the notify mini-service via socket.io (port 3003 via XTransformPort)
 * - Shows toast popups for incoming notifications targeted at the user's role
 * - Renders a bell icon with unread badge in the topbar
 * - Polls /api/notifications every 30s as a fallback (catches notifications
 *   that arrived while the socket was disconnected)
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { SessionUser } from './types'

export type AppNotification = {
  id: string
  toRole: string
  fromRole?: string | null
  type: string
  title: string
  body: string
  icon: string
  challanId?: string | null
  createdAt: string
  read?: boolean
}

export function NotificationProvider({ user, children }: {
  user: SessionUser
  children: React.ReactNode
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [toasts, setToasts] = useState<AppNotification[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const seenIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)
  const firstFetchDone = useRef(false)

  // ── Fetch existing notifications on mount + poll for new ones ──
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=30')
      if (!res.ok) return
      const text = await res.text()
      if (!text) return
      const data = JSON.parse(text)
      if (data.notifications) {
        // Detect NEW notifications (not in seenIds) to show as toasts
        const newOnes: AppNotification[] = []
        for (const n of data.notifications) {
          if (!seenIds.current.has(n.id)) {
            seenIds.current.add(n.id)
            // Only toast on subsequent fetches (not the initial load)
            if (firstFetchDone.current) {
              newOnes.push(n)
            }
          }
        }
        firstFetchDone.current = true
        setNotifications(data.notifications)
        setUnread(data.unreadCount || 0)
        // Show toasts for newly-poll-detected notifications
        if (newOnes.length > 0) {
          setToasts((prev) => [...prev, ...newOnes])
          for (const n of newOnes) {
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== n.id))
            }, 12000)
          }
        }
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications()
  }, [])

  // ── Connect socket.io ──
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const sock = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      // path defaults to '/socket.io/' which caddy forwards to port 3003 via XTransformPort
    })
    socketRef.current = sock

    sock.on('connect', () => {
      sock.emit('join', [user.role, '*'])
    })

    sock.on('notification', (n: AppNotification) => {
      // Dedupe — avoid double-toast if polling also caught it
      if (seenIds.current.has(n.id)) return
      seenIds.current.add(n.id)

      setNotifications((prev) => {
        if (prev.some((p) => p.id === n.id)) return prev
        return [n, ...prev].slice(0, 50)
      })
      setUnread((u) => u + 1)

      // Show toast popup
      setToasts((prev) => [...prev, n])
      // Auto-dismiss after 12 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== n.id))
      }, 12000)
    })

    return () => { sock.disconnect() }
  }, [user.role])

  // ── Polling fallback every 10s (catches notifications even if socket.io is down) ──
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 10000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // ── Mark all as read ──
  const markAllRead = useCallback(async () => {
    setUnread(0)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } catch { /* silent */ }
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <>
      {children}

      {/* ── Bell icon (fixed top-right) ── */}
      <button
        onClick={() => { setPanelOpen((o) => !o); if (!panelOpen && unread > 0) markAllRead() }}
        className="fixed top-3 right-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0c1928] text-lg shadow-lg hover:border-[#C8922A]/40 transition-all"
        aria-label="Notifications"
      >
        <span>🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E05050] px-1 text-[10px] font-bold text-white animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── Notification panel ── */}
      {panelOpen && (
        <div className="fixed top-14 right-3 z-50 w-80 max-w-[calc(100vw-1.5rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0c1928] shadow-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-white/7 bg-[#0c1928] px-4 py-3">
            <span className="text-[13px] font-bold text-[#E4AF4A]">Notifications</span>
            <button onClick={() => setPanelOpen(false)} className="text-[#96A8BF] hover:text-[#EDE4D0] text-sm">✕</button>
          </div>
          <div className="divide-y divide-white/5">
            {notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-[12px] text-[#4E6180]">No notifications yet</div>
            )}
            {notifications.map((n) => (
              <div key={n.id} className={`px-4 py-3 ${n.read ? 'opacity-60' : 'bg-[#C8922A]/5'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-lg flex-shrink-0">{n.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-[#EDE4D0]">{n.title}</div>
                    <div className="text-[11px] text-[#96A8BF] mt-0.5 break-words">{n.body}</div>
                    <div className="text-[9px] text-[#4E6180] mt-1">{fmtRelative(n.createdAt)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Big beautiful toast popups (bottom-right stack) ── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 w-[520px] max-w-[calc(100vw-2rem)]">
        {toasts.map((n) => (
          <Toast key={n.id} n={n} onDismiss={() => dismissToast(n.id)} />
        ))}
      </div>
    </>
  )
}

function Toast({ n, onDismiss }: { n: AppNotification; onDismiss: () => void }) {
  const color = NOTIF_COLORS[n.type] || { border: '#C8922A', accent: '#E4AF4A', glow: 'rgba(200,146,42,0.45)' }
  const [progress, setProgress] = useState(100)
  useEffect(() => {
    const start = Date.now()
    const duration = 12000
    const iv = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(pct)
      if (pct <= 0) clearInterval(iv)
    }, 60)
    return () => clearInterval(iv)
  }, [])
  return (
    <div
      className="relative rounded-2xl overflow-hidden border shadow-2xl bg-[#0c1928] animate-[notifPop_0.5s_cubic-bezier(0.22,1.2,0.36,1)]"
      style={{
        borderColor: `${color.border}88`,
        boxShadow: `0 20px 60px -10px ${color.glow}, 0 0 0 1px ${color.border}33, 0 0 80px -20px ${color.glow}`,
      }}
    >
      {/* Thick gradient header strip */}
      <div
        className="h-2"
        style={{ background: `linear-gradient(90deg, ${color.border}, ${color.accent}, ${color.border})` }}
      />

      {/* Glow halo behind entire card */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top right, ${color.glow}, transparent 60%)` }}
      />

      <div className="relative p-5">
        <div className="flex items-start gap-4">
          {/* Big icon with pulsing ring */}
          <div className="relative flex-shrink-0">
            {/* Outer pulsing ring */}
            <div
              className="absolute -inset-1 rounded-2xl animate-ping opacity-40"
              style={{ background: color.glow }}
            />
            {/* Glow halo */}
            <div
              className="absolute inset-0 rounded-2xl blur-xl animate-pulse"
              style={{ background: color.glow }}
            />
            {/* Icon box */}
            <div
              className="relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 text-4xl bg-[#07101f]"
              style={{ borderColor: `${color.border}66`, boxShadow: `inset 0 0 16px ${color.glow}` }}
            >
              {n.icon}
            </div>
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {/* NEW badge */}
                <span
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase"
                  style={{ background: color.border, color: '#07101f' }}
                >
                  NEW
                </span>
                <div className="text-[18px] font-bold leading-tight" style={{ color: color.accent }}>
                  {n.title}
                </div>
              </div>
              <button
                onClick={onDismiss}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#4E6180] hover:text-[#EDE4D0] hover:bg-white/10 transition-all flex-shrink-0"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
            <div className="text-[14.5px] text-[#EDE4D0] mt-2 break-words leading-relaxed">
              {n.body}
            </div>
            <div className="flex items-center gap-2.5 mt-3">
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ background: `${color.border}1a`, color: color.accent, border: `1px solid ${color.border}44` }}
              >
                <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: color.accent }} />
                {n.fromRole ? n.fromRole.replace(/_/g, ' ') : 'SYSTEM'}
              </div>
              <span className="text-[11px] text-[#4E6180]">{fmtRelative(n.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
        <div
          className="h-full transition-[width] duration-75 ease-linear"
          style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${color.border}, ${color.accent})` }}
        />
      </div>

      <style>{`@keyframes notifPop { 0% { transform: translateX(120%) scale(0.8); opacity: 0 } 55% { transform: translateX(-10px) scale(1.03); opacity: 1 } 100% { transform: translateX(0) scale(1); opacity: 1 } }`}</style>
    </div>
  )
}

const NOTIF_COLORS: Record<string, { border: string; accent: string; glow: string }> = {
  NEW_CHALLAN:          { border: '#4A9EE0', accent: '#7AB8F0', glow: 'rgba(74,158,224,0.45)' },
  PAYMENT_VERIFIED:     { border: '#3CB87A', accent: '#5BD49A', glow: 'rgba(60,184,122,0.45)' },
  COORDINATOR_APPROVED: { border: '#9B6ED4', accent: '#B894E8', glow: 'rgba(155,110,212,0.45)' },
  WAREHOUSE_DONE:       { border: '#9B6ED4', accent: '#B894E8', glow: 'rgba(155,110,212,0.45)' },
  VEHICLE_ARRANGED:     { border: '#E09E3C', accent: '#F0B85C', glow: 'rgba(224,158,60,0.45)' },
  DISPATCHED:           { border: '#E09E3C', accent: '#F0B85C', glow: 'rgba(224,158,60,0.45)' },
  BILLS_UPLOADED:       { border: '#3CB87A', accent: '#5BD49A', glow: 'rgba(60,184,122,0.45)' },
  REJECTED:             { border: '#E05050', accent: '#F07070', glow: 'rgba(224,80,80,0.45)' },
  INFO:                 { border: '#C8922A', accent: '#E4AF4A', glow: 'rgba(200,146,42,0.45)' },
}

function fmtRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
