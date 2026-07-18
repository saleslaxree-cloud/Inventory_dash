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
            }, 8000)
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
      // Auto-dismiss after 8 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== n.id))
      }, 8000)
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

      {/* ── Toast popups (bottom-right stack) ── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((n) => (
          <Toast key={n.id} n={n} onDismiss={() => dismissToast(n.id)} />
        ))}
      </div>
    </>
  )
}

function Toast({ n, onDismiss }: { n: AppNotification; onDismiss: () => void }) {
  const color = NOTIF_COLORS[n.type] || { bg: '#0c1928', border: '#C8922A', accent: '#E4AF4A' }
  return (
    <div
      className="rounded-xl border bg-[#0c1928] shadow-2xl overflow-hidden animate-[slideIn_0.3s_ease]"
      style={{ borderColor: `${color.border}55` }}
    >
      <div className="h-1" style={{ background: color.border }} />
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <span className="text-2xl flex-shrink-0">{n.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold" style={{ color: color.accent }}>{n.title}</div>
            <div className="text-[11.5px] text-[#EDE4D0] mt-1 break-words leading-relaxed">{n.body}</div>
            <div className="text-[9px] text-[#4E6180] mt-1.5">
              {n.fromRole ? `From ${n.fromRole} · ` : ''}{fmtRelative(n.createdAt)}
            </div>
          </div>
          <button onClick={onDismiss} className="text-[#4E6180] hover:text-[#EDE4D0] text-sm flex-shrink-0">✕</button>
        </div>
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(120%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </div>
  )
}

const NOTIF_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  NEW_CHALLAN:          { bg: '#0c1928', border: '#4A9EE0', accent: '#4A9EE0' },
  PAYMENT_VERIFIED:     { bg: '#0c1928', border: '#3CB87A', accent: '#3CB87A' },
  COORDINATOR_APPROVED: { bg: '#0c1928', border: '#9B6ED4', accent: '#9B6ED4' },
  WAREHOUSE_DONE:       { bg: '#0c1928', border: '#9B6ED4', accent: '#9B6ED4' },
  VEHICLE_ARRANGED:     { bg: '#0c1928', border: '#E09E3C', accent: '#E09E3C' },
  DISPATCHED:           { bg: '#0c1928', border: '#E09E3C', accent: '#E09E3C' },
  BILLS_UPLOADED:       { bg: '#0c1928', border: '#3CB87A', accent: '#3CB87A' },
  REJECTED:             { bg: '#0c1928', border: '#E05050', accent: '#E05050' },
  INFO:                 { bg: '#0c1928', border: '#96A8BF', accent: '#EDE4D0' },
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
