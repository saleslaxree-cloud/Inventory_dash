'use client'
/**
 * Global Notification Provider
 *
 * - Connects to the notify mini-service via socket.io (port 3003 via XTransformPort)
 * - Shows a BIG, BEAUTIFUL, CENTERED MODAL popup for incoming notifications
 *   (bell illustration + title + structured body + action button), matching the
 *    reference design the user shared.
 * - Renders a bell icon with unread badge in the topbar
 * - Polls /api/notifications every 10s as a fallback (catches notifications
 *   that arrived while the socket was disconnected)
 * - The action button dispatches a `laxree:notification-action` window event
 *   so the page can switch to the relevant tab.
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
  const [queue, setQueue] = useState<AppNotification[]>([])
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
        const newOnes: AppNotification[] = []
        if (!firstFetchDone.current) {
          // ── INITIAL LOAD ──
          // Show the big popup for the most recent UNREAD notification so the
          // user immediately sees pending work when they open/refresh the page.
          // Older unread ones go into seenIds (no popup) but stay in the panel.
          const unreadNotifs = data.notifications.filter((n: AppNotification) => !n.read)
          if (unreadNotifs.length > 0) {
            const latest = unreadNotifs[0]
            newOnes.push(latest)
          }
          // Mark ALL as seen so polling doesn't re-toast them
          for (const n of data.notifications) seenIds.current.add(n.id)
        } else {
          // ── SUBSEQUENT POLLS ──
          // Any notification with a new ID = newly arrived → show popup
          for (const n of data.notifications) {
            if (!seenIds.current.has(n.id)) {
              seenIds.current.add(n.id)
              newOnes.push(n)
            }
          }
        }
        firstFetchDone.current = true
        setNotifications(data.notifications)
        setUnread(data.unreadCount || 0)
        if (newOnes.length > 0) {
          setQueue((prev) => [...prev, ...newOnes])
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
    })
    socketRef.current = sock

    sock.on('connect', () => {
      sock.emit('join', [user.role, '*'])
    })

    sock.on('notification', (n: AppNotification) => {
      // Dedupe — avoid double-show if polling also caught it
      if (seenIds.current.has(n.id)) return
      seenIds.current.add(n.id)

      setNotifications((prev) => {
        if (prev.some((p) => p.id === n.id)) return prev
        return [n, ...prev].slice(0, 50)
      })
      setUnread((u) => u + 1)

      // Show BIG modal popup
      setQueue((prev) => [...prev, n])
    })

    return () => { sock.disconnect() }
  }, [user.role])

  // ── Polling fallback every 5s (catches notifications even if socket.io is down) ──
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 5000)
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

  const dismissCurrent = useCallback(() => {
    setQueue((prev) => prev.slice(1))
  }, [])

  // The currently-visible modal (first in queue)
  const current = queue[0] || null
  const queueCount = queue.length

  return (
    <>
      {children}

      {/* ── Bell icon (fixed top-right) ── */}
      <button
        onClick={() => { setPanelOpen((o) => !o); if (!panelOpen && unread > 0) markAllRead() }}
        className="fixed top-3 right-3 z-[60] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0c1928] text-lg shadow-lg hover:border-[#C8922A]/40 transition-all"
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
        <div className="fixed top-14 right-3 z-[60] w-80 max-w-[calc(100vw-1.5rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0c1928] shadow-2xl">
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

      {/* ── BIG BEAUTIFUL CENTERED MODAL POPUP ── */}
      {current && (
        <BigNotificationModal
          n={current}
          queueCount={queueCount}
          onDismiss={dismissCurrent}
        />
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────────────
//  Big Centered Modal — bell illustration + structured body + action button
//  (matches the reference design: centered card, bell at top, button at bottom)
// ──────────────────────────────────────────────────────────────────────────
function BigNotificationModal({
  n,
  queueCount,
  onDismiss,
}: {
  n: AppNotification
  queueCount: number
  onDismiss: () => void
}) {
  const color = NOTIF_COLORS[n.type] || NOTIF_COLORS.INFO
  const isUrgent = n.type === 'PR_RAISED_URGENT'
  const [progress, setProgress] = useState(100)
  // Urgent PR popups stay longer (30s) so Sir has time to read & act.
  const DURATION = isUrgent ? 30000 : 20000

  useEffect(() => {
    const start = Date.now()
    const iv = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setProgress(pct)
      if (pct <= 0) { clearInterval(iv); onDismiss() }
    }, 80)
    return () => clearInterval(iv)
  }, [onDismiss])

  // Parse the body into an intro line + structured key/value rows
  const { intro, rows } = parseBody(n.body)
  const action = getAction(n)

  const handleAction = () => {
    // Tell the page to switch to the relevant tab
    window.dispatchEvent(new CustomEvent('laxree:notification-action', {
      detail: { type: n.type, challanId: n.challanId, tab: action.tab },
    }))
    onDismiss()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-[notifFade_0.25s_ease-out]"
      style={{ background: 'rgba(3,8,18,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-label={n.title}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border shadow-2xl bg-[#0c1928] animate-[notifPop_0.45s_cubic-bezier(0.22,1.2,0.36,1)]"
        style={{
          borderColor: `${color.border}66`,
          boxShadow: `0 30px 90px -10px ${color.glow}, 0 0 0 1px ${color.border}44, 0 0 120px -30px ${color.glow}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top gradient strip */}
        <div
          className="h-2"
          style={{ background: `linear-gradient(90deg, ${color.border}, ${color.accent}, ${color.border})` }}
        />

        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-[#96A8BF] hover:text-[#EDE4D0] hover:bg-white/10 transition-all"
          aria-label="Dismiss"
        >
          ✕
        </button>

        {/* Queue indicator */}
        {queueCount > 1 && (
          <div className="absolute top-4 left-4 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-white/10 text-[#EDE4D0] border border-white/10">
            +{queueCount - 1} more
          </div>
        )}

        {/* ── Bell illustration header ── */}
        <div className="relative flex flex-col items-center pt-8 pb-4 px-6">
          {/* Glow halo */}
          <div
            className="absolute top-2 w-48 h-48 rounded-full blur-3xl opacity-50 pointer-events-none"
            style={{ background: color.glow }}
          />
          {/* Concentric rings */}
          <div className="relative flex items-center justify-center">
            <div
              className="absolute h-32 w-32 rounded-full border-2 animate-ping opacity-30"
              style={{ borderColor: color.border }}
            />
            <div
              className="absolute h-24 w-24 rounded-full border opacity-50"
              style={{ borderColor: `${color.border}66` }}
            />
            {/* Bell icon box */}
            <div
              className="relative flex h-20 w-20 items-center justify-center rounded-2xl border-2 text-5xl bg-[#07101f] animate-[bellRing_1.8s_ease-in-out_infinite]"
              style={{
                borderColor: `${color.border}88`,
                boxShadow: `inset 0 0 24px ${color.glow}, 0 8px 30px ${color.glow}`,
              }}
            >
              <span className="drop-shadow-lg" style={{ filter: `drop-shadow(0 0 10px ${color.glow})` }}>
                {n.icon || '🔔'}
              </span>
              {/* notification dot */}
              <span
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-[#0c1928] animate-pulse"
                style={{ background: color.accent }}
              />
            </div>
          </div>

          {/* NEW badge */}
          <div className="mt-4">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black tracking-wider uppercase"
              style={{ background: `${color.border}22`, color: color.accent, border: `1px solid ${color.border}55` }}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isUrgent ? 'animate-ping' : 'animate-pulse'}`} style={{ background: color.accent }} />
              {isUrgent ? '⚠ Urgent Action Required' : 'New Notification'}
            </span>
          </div>
        </div>

        {/* ── Title ── */}
        <div className="px-6 pb-2 text-center">
          <h2 className="text-[22px] font-bold leading-tight" style={{ color: color.accent }}>
            {n.title}
          </h2>
          {intro && (
            <p className="mt-1.5 text-[13px] text-[#EDE4D0]/90 leading-relaxed">{intro}</p>
          )}
        </div>

        {/* ── Structured body rows ── */}
        {rows.length > 0 && (
          <div className="mx-6 mt-3 mb-4 rounded-2xl border border-white/8 bg-black/30 overflow-hidden">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-white/5' : ''}`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#4E6180] w-28 flex-shrink-0 pt-0.5">
                  {r.key}
                </span>
                <span className="text-[13.5px] font-semibold text-[#EDE4D0] flex-1 break-words leading-snug">
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── From + time ── */}
        <div className="flex items-center justify-center gap-2.5 px-6 pb-4">
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: `${color.border}1a`, color: color.accent, border: `1px solid ${color.border}44` }}
          >
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: color.accent }} />
            {n.fromRole ? n.fromRole.replace(/_/g, ' ') : 'SYSTEM'}
          </div>
          <span className="text-[11px] text-[#4E6180]">{fmtRelative(n.createdAt)}</span>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <button
            onClick={handleAction}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${color.border}, ${color.accent})`,
              color: '#07101f',
              boxShadow: `0 8px 24px -4px ${color.glow}`,
            }}
          >
            <span className="text-base">{action.icon}</span>
            {action.label}
          </button>
          <button
            onClick={onDismiss}
            className="rounded-xl px-4 py-3 text-[14px] font-semibold text-[#96A8BF] border border-white/10 hover:text-[#EDE4D0] hover:border-white/20 transition-all"
          >
            Dismiss
          </button>
        </div>

        {/* Auto-dismiss progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
          <div
            className="h-full transition-[width] duration-75 ease-linear"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${color.border}, ${color.accent})` }}
          />
        </div>

        <style>{`
          @keyframes notifFade { from { opacity: 0 } to { opacity: 1 } }
          @keyframes notifPop {
            0% { transform: scale(0.85) translateY(20px); opacity: 0 }
            55% { transform: scale(1.03) translateY(-4px); opacity: 1 }
            100% { transform: scale(1) translateY(0); opacity: 1 }
          }
          @keyframes bellRing {
            0%, 100% { transform: rotate(0deg) }
            10% { transform: rotate(-12deg) }
            20% { transform: rotate(10deg) }
            30% { transform: rotate(-8deg) }
            40% { transform: rotate(6deg) }
            50% { transform: rotate(-4deg) }
            60% { transform: rotate(2deg) }
            70% { transform: rotate(0deg) }
          }
        `}</style>
      </div>
    </div>
  )
}

// ── Parse "intro line\nKey: Value\n..." into structured rows ──
function parseBody(body: string): { intro: string; rows: { key: string; value: string }[] } {
  if (!body) return { intro: '', rows: [] }
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: { key: string; value: string }[] = []
  let intro = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^([A-Za-z][A-Za-z /&.()-]{1,28}):\s*(.+)$/)
    if (m) {
      rows.push({ key: m[1].trim(), value: m[2].trim() })
    } else if (i === 0) {
      intro = line
    } else if (!intro) {
      intro = line
    } else {
      // append to intro if it's a continuation
      intro += ' ' + line
    }
  }
  return { intro, rows }
}

// ── Derive action button label/icon + target tab from notification type ──
function getAction(n: AppNotification): { label: string; icon: string; tab: string } {
  switch (n.type) {
    case 'NEW_CHALLAN':
      return { label: 'Check Payment Now', icon: '💰', tab: 'pending' }
    case 'PR_RAISED_URGENT':
      // Owner must check, sign & process the auto-raised PR
      return { label: 'Review & Sign PR', icon: '✍️', tab: 'pr' }
    case 'PAYMENT_VERIFIED':
      // Coordinator should start audit; Sales just views
      if (n.toRole === 'COORDINATOR') return { label: 'Start Audit', icon: '🔍', tab: 'process' }
      return { label: 'View Status', icon: '📋', tab: 'list' }
    case 'COORDINATOR_APPROVED':
    case 'WAREHOUSE_DONE':
      return { label: 'Open Warehouse', icon: '🏭', tab: 'warehouse' }
    case 'VEHICLE_ARRANGED':
      return { label: 'Arrange Dispatch', icon: '🚚', tab: 'dispatch' }
    case 'DISPATCHED':
      return { label: 'Send Tracking', icon: '📱', tab: 'tracking' }
    case 'BILLS_UPLOADED':
      return { label: 'View Bills', icon: '🧾', tab: 'bills' }
    case 'REJECTED':
      return { label: 'Review Issue', icon: '⚠️', tab: 'list' }
    default:
      return { label: 'Open Dashboard', icon: '📊', tab: 'dashboard' }
  }
}

const NOTIF_COLORS: Record<string, { border: string; accent: string; glow: string }> = {
  NEW_CHALLAN:          { border: '#4A9EE0', accent: '#7AB8F0', glow: 'rgba(74,158,224,0.45)' },
  PR_RAISED_URGENT:     { border: '#E05050', accent: '#FF6B6B', glow: 'rgba(224,80,80,0.55)' },
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
