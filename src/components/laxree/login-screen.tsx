'use client'
import { useState } from 'react'
import { Role, ROLE_META, SessionUser } from './types'
import { Btn, Input } from './ui'

const DEMO_ACCOUNTS: { role: Role; email: string; password: string }[] = [
  { role: 'ADMIN',       email: 'admin@laxree.com',   password: 'admin123' },
  { role: 'OWNER',       email: 'owner@laxree.com',   password: 'laxree123' },
  { role: 'SALES',       email: 'sales@laxree.com',   password: 'laxree123' },
  { role: 'ACCOUNT',     email: 'account@laxree.com', password: 'laxree123' },
  { role: 'COORDINATOR', email: 'coord@laxree.com',   password: 'laxree123' },
  { role: 'SUPPORT',     email: 'support@laxree.com', password: 'laxree123' },
  { role: 'IT_MANAGER',  email: 'it@laxree.com',      password: 'laxree123' },
]

export function LoginScreen({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [email, setEmail] = useState('owner@laxree.com')
  const [password, setPassword] = useState('laxree123')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const text = await res.text()
      const data = text ? JSON.parse(text) : null
      if (!res.ok) throw new Error(data?.error || `Login failed (${res.status})`)
      if (!data) throw new Error('Server returned an empty response. The database may be unavailable.')
      onLogin(data)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (em: string, pw: string) => {
    setEmail(em)
    setPassword(pw)
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#07101f]">
      {/* Left — branding */}
      <div className="lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{
          background: 'radial-gradient(circle at 30% 20%, rgba(200,146,42,0.15), transparent 50%), radial-gradient(circle at 70% 80%, rgba(200,146,42,0.08), transparent 50%)'
        }} />
        <div className="relative z-10 text-center max-w-md">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#C8922A] overflow-hidden bg-white"
            style={{ boxShadow: '0 0 30px rgba(200,146,42,0.4), 0 0 60px rgba(200,146,42,0.15)' }}>
            <img src="/laxree-logo.png" alt="Laxree" className="h-full w-full object-contain p-1" />
          </div>
          <h1 className="font-serif text-3xl lg:text-4xl font-bold mb-2"
            style={{ background: 'linear-gradient(135deg, #E4AF4A, #F5D27A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Laxree
          </h1>
          <p className="text-[11px] uppercase tracking-[3px] text-[#4E6180] mb-6">Inventory Management System v4</p>
          <p className="text-sm text-[#96A8BF] leading-relaxed mb-8">
            Multi-role workflow platform — from challan upload to dispatch &amp; delivery feedback.
            Admin, Owner, Sales, Account, Coordinator, Support &amp; IT Manager — each with their own dashboard.
          </p>

          <div className="grid grid-cols-2 gap-2 text-left">
            {DEMO_ACCOUNTS.map((a) => {
              const meta = ROLE_META[a.role]
              return (
                <button
                  key={a.role}
                  onClick={() => quickLogin(a.email, a.password)}
                  className="group flex items-center gap-2.5 rounded-lg border border-white/7 bg-white/[0.02] px-3 py-2.5 text-left transition-all hover:border-[#C8922A]/30 hover:bg-white/5"
                >
                  <span className="text-lg">{meta.icon}</span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold truncate" style={{ color: meta.color }}>{meta.label}</div>
                    <div className="text-[9px] text-[#4E6180] truncate">{a.email}</div>
                  </div>
                </button>
              )
            })}
          </div>
          <p className="mt-4 text-[10px] text-[#4E6180]">Click a role to autofill credentials</p>
        </div>
      </div>

      {/* Right — login form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12 bg-gradient-to-br from-[#0c1928] to-[#07101f] border-l border-white/5">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="font-serif text-2xl font-bold text-[#EDE4D0] mb-1">Sign In</h2>
          <p className="text-xs text-[#96A8BF] mb-6">Enter your credentials to access your dashboard</p>

          <div className="space-y-4">
            <Input label="Email" value={email} onChange={setEmail} type="email" placeholder="you@laxree.com" required />
            <Input label="Password" value={password} onChange={setPassword} type="password" placeholder="••••••••" required />
          </div>

          {err && (
            <div className="mt-4 rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">
              {err}
            </div>
          )}

          <Btn type="submit" variant="gold" className="mt-6 w-full justify-center" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </Btn>

          <div className="mt-6 rounded-lg border border-white/7 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-wider text-[#4E6180] font-semibold mb-1.5">Default Credentials</p>
            <p className="text-[11px] text-[#96A8BF]">Admin: <span className="font-mono text-[#E05050]">admin@laxree.com / admin123</span></p>
            <p className="text-[11px] text-[#96A8BF]">Others: <span className="font-mono text-[#E4AF4A]">/ laxree123</span></p>
            <p className="text-[10px] text-[#3CB87A] mt-1">✓ Login directly — Admin can change passwords anytime</p>
          </div>
        </form>
      </div>
    </div>
  )
}
