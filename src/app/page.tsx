'use client'
import { useEffect, useState } from 'react'
import { SessionUser } from '@/components/laxree/types'
import { LoginScreen } from '@/components/laxree/login-screen'
import { AppShell, NavItem } from '@/components/laxree/app-shell'
import { AdminDashboard } from '@/components/laxree/dashboards/admin'
import { OwnerDashboard } from '@/components/laxree/dashboards/owner'
import { SalesDashboard } from '@/components/laxree/dashboards/sales'
import { AccountDashboard } from '@/components/laxree/dashboards/account'
import { CoordinatorDashboard } from '@/components/laxree/dashboards/coordinator'
import { SupportDashboard } from '@/components/laxree/dashboards/support'
import { ITManagerDashboard } from '@/components/laxree/dashboards/it-manager'
import { NotificationProvider } from '@/components/laxree/notification-provider'

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Check existing session on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (r) => {
        if (!r.ok) return null
        const text = await r.text()
        try { return text ? JSON.parse(text) : null } catch { return null }
      })
      .then((d) => { if (d?.user) setUser(d.user) })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    setUser(null)
    setActiveTab('overview')
  }

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const text = await res.text()
        const d = text ? JSON.parse(text) : null
        if (d?.user) setUser(d.user)
      }
    } catch {}
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07101f]">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#C8922A] overflow-hidden bg-white animate-pulse"
            style={{ boxShadow: '0 0 30px rgba(200,146,42,0.4)' }}>
            <img src="/laxree-logo.png" alt="Laxree" className="h-full w-full object-contain p-1" />
          </div>
          <div className="font-serif text-lg font-bold text-[#E4AF4A]">Laxree</div>
          <div className="text-[11px] text-[#4E6180] mt-1">Loading…</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onLogin={(u) => { setUser(u); setActiveTab('overview') }} />
  }

  // Role-based nav + default tab
  const roleNav: Record<string, NavItem[]> = {
    ADMIN: [
      { id:'overview', label:'System Overview', icon:'📊' },
      { id:'users', label:'User Management', icon:'👥' },
      { id:'challans', label:'All Challans', icon:'🧾' },
      { id:'items', label:'All Items', icon:'📦' },
      { id:'messages', label:'All Messages', icon:'✉️' },
    ],
    OWNER: [
      { id:'overview', label:'Overview', icon:'📊' },
      { id:'stock', label:'Current Stock', icon:'📦' },
      { id:'fast', label:'Fast Moving', icon:'⚡' },
      { id:'challans', label:'Challans', icon:'🧾' },
      { id:'pr', label:'Purchase Requests', icon:'📋' },
      { id:'register', label:'Stock Register', icon:'📋' },
      { id:'forecast', label:'Forecast', icon:'📈' },
      { id:'activity', label:'Activity Log', icon:'📜' },
    ],
    SALES: [
      { id:'stock-check', label:'Check Stock', icon:'📦' },
      { id:'upload', label:'Upload Challan', icon:'📤' },
      { id:'client-status', label:'Client Status', icon:'📍' },
      { id:'bills', label:'E-Way & Item Bill', icon:'🧾' },
      { id:'list', label:'My Challans', icon:'📋' },
      { id:'dashboard', label:'Dashboard', icon:'📊' },
    ],
    ACCOUNT: [
      { id:'dashboard', label:'Dashboard', icon:'📊' },
      { id:'pending', label:'Pending Approval', icon:'⏳' },
      { id:'partial', label:'Partial Paid', icon:'🔶' },
      { id:'fullpaid', label:'Full Paid', icon:'✅' },
      { id:'bills', label:'E-Way / Item Bill', icon:'🧾' },
    ],
    COORDINATOR: [
      { id:'dashboard', label:'Dashboard', icon:'📊' },
      { id:'process', label:'Process Challan', icon:'📋' },
      { id:'audit', label:'Audit', icon:'🔍' },
      { id:'warehouse', label:'Warehouse', icon:'🏭' },
      { id:'vehicle', label:'Vehicle Arrangement', icon:'🚛' },
      { id:'review', label:'Final Review', icon:'📸' },
      { id:'bills', label:'Latest Bills', icon:'🧾' },
    ],
    SUPPORT: [
      { id:'dashboard', label:'Dashboard', icon:'📊' },
      { id:'dispatch', label:'Client Dispatch', icon:'🚚' },
      { id:'tracking', label:'Send Tracking', icon:'📱' },
      { id:'review', label:'Client Reviews', icon:'⭐' },
    ],
    IT_MANAGER: [
      { id:'items', label:'Item Master', icon:'📦' },
      { id:'add', label:'Add Item', icon:'➕' },
      { id:'inward', label:'Inward Entry', icon:'📥' },
      { id:'register', label:'Stock Register', icon:'📋' },
      { id:'activity', label:'Activity Log', icon:'📜' },
      { id:'forecast', label:'Forecast', icon:'📈' },
      { id:'analytics', label:'Analytics', icon:'📊' },
      { id:'users', label:'Users', icon:'👥' },
      { id:'all-challans', label:'All Challans', icon:'🧾' },
    ],
  }

  const nav = roleNav[user.role] || []
  const currentTab = nav.find((n) => n.id === activeTab) ? activeTab : nav[0]?.id

  return (
    <NotificationProvider user={user}>
      <AppShell
        user={user}
        navItems={nav}
        activeTab={currentTab}
        onTabChange={setActiveTab}
        onLogout={logout}
        onPasswordChanged={refreshUser}
      >
        {user.role === 'ADMIN' && <AdminDashboard user={user} activeTab={currentTab} onTabChange={setActiveTab} />}
        {user.role === 'OWNER' && <OwnerDashboard user={user} activeTab={currentTab} onTabChange={setActiveTab} />}
        {user.role === 'SALES' && <SalesDashboard user={user} activeTab={currentTab} onTabChange={setActiveTab} />}
        {user.role === 'ACCOUNT' && <AccountDashboard user={user} activeTab={currentTab} onTabChange={setActiveTab} />}
        {user.role === 'COORDINATOR' && <CoordinatorDashboard user={user} activeTab={currentTab} onTabChange={setActiveTab} />}
        {user.role === 'SUPPORT' && <SupportDashboard user={user} activeTab={currentTab} onTabChange={setActiveTab} />}
        {user.role === 'IT_MANAGER' && <ITManagerDashboard user={user} activeTab={currentTab} onTabChange={setActiveTab} />}
      </AppShell>
    </NotificationProvider>
  )
}
