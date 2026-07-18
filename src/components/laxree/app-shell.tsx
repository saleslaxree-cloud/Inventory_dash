'use client'
import { ReactNode, useState } from 'react'
import { Role, ROLE_META, SessionUser } from './types'
import { Badge } from './ui'

export type NavItem = { id: string; label: string; icon: string; badge?: number }

export function AppShell({
  user, navItems, activeTab, onTabChange, onLogout, children,
}: {
  user: SessionUser
  navItems: NavItem[]
  activeTab: string
  onTabChange: (id: string) => void
  onLogout: () => void
  children: ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const meta = ROLE_META[user.role]
  const active = navItems.find((n) => n.id === activeTab)

  return (
    <div className="flex h-screen overflow-hidden bg-[#07101f] text-[#EDE4D0]">
      {/* Sidebar */}
      <aside className={`
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
        fixed lg:static z-40 inset-y-0 left-0 w-64 flex-shrink-0
        bg-[#0c1928] border-r border-white/7 flex flex-col transition-transform duration-200
      `}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/7 flex flex-col items-center gap-1.5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#C8922A] text-2xl"
            style={{ boxShadow: '0 0 20px rgba(200,146,42,0.35)' }}>
            🏨
          </div>
          <div className="font-serif text-sm font-bold text-center leading-tight"
            style={{ background: 'linear-gradient(135deg, #E4AF4A, #F5D27A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            LaxRee Hotel
          </div>
          <div className="text-[8px] uppercase tracking-[1.5px] text-[#4E6180]">IMS v3</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
          <div className="px-2 py-2 text-[9px] uppercase tracking-[1.5px] font-bold text-[#4E6180]">Menu</div>
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => { onTabChange(n.id); setSidebarOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium transition-all relative border ${
                activeTab === n.id
                  ? 'bg-gradient-to-r from-[#C8922A]/15 to-transparent text-[#E4AF4A] border-[#C8922A]/20'
                  : 'text-[#96A8BF] border-transparent hover:bg-white/5 hover:text-[#EDE4D0]'
              }`}
            >
              {activeTab === n.id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r bg-gradient-to-b from-[#C8922A] to-[#E4AF4A]" />
              )}
              <span className="text-[15px] w-5 text-center">{n.icon}</span>
              <span className="flex-1 text-left truncate">{n.label}</span>
              {n.badge ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#E05050]/20 text-[#E05050] border border-[#E05050]/25">
                  {n.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-white/7 p-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] p-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full text-lg flex-shrink-0"
              style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}44` }}>
              {meta.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-[#EDE4D0] truncate">{user.name}</div>
              <div className="text-[9.5px] truncate" style={{ color: meta.color }}>{meta.label}</div>
            </div>
            <button onClick={onLogout} title="Logout" className="text-[#96A8BF] hover:text-[#E05050] text-base p-1">
              ⏻
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="flex items-center justify-between gap-3 px-4 lg:px-6 h-14 border-b border-white/7 bg-[#0c1928] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-[#96A8BF] text-xl">☰</button>
            <div className="min-w-0">
              <h1 className="font-serif text-base font-bold text-[#E4AF4A] truncate">{active?.label || 'Dashboard'}</h1>
              <p className="text-[10px] text-[#4E6180] truncate">{meta.desc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge label={meta.label} color={meta.color} />
            <span className="text-[10px] text-[#4E6180] hidden sm:inline">{new Date().toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short' })}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="flex items-center justify-between px-4 lg:px-6 h-9 border-t border-white/7 bg-[#0c1928] flex-shrink-0 text-[10px] text-[#4E6180]">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#3CB87A] animate-pulse" /> System Online</span>
          <span>LaxRee IMS v3 • Multi-Role Workflow</span>
        </footer>
      </div>
    </div>
  )
}
