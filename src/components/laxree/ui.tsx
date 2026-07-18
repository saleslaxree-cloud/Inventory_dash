'use client'
import { ReactNode } from 'react'

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-xl border border-white/7 bg-gradient-to-br from-[#111f32] to-[#0c1928] ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ icon, title, sub, right }: { icon?: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="text-lg">{icon}</span>}
        <div className="min-w-0">
          <h2 className="font-serif text-base font-bold text-[#E4AF4A] truncate">{title}</h2>
          {sub && <p className="text-[11px] text-[#96A8BF] truncate">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const c = color || '#96A8BF'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: `${c}22`, color: c, border: `1px solid ${c}33` }}
    >
      {label}
    </span>
  )
}

export function StatCard({ label, value, sub, accent = '#E4AF4A', icon }: { label: string; value: ReactNode; sub?: string; accent?: string; icon?: string }) {
  return (
    <Card className="p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#96A8BF] font-semibold mb-1.5">{label}</div>
          <div className="font-serif text-2xl font-bold text-[#EDE4D0] leading-none">{value}</div>
          {sub && <div className="text-[10.5px] text-[#4E6180] mt-1.5">{sub}</div>}
        </div>
        {icon && <div className="text-xl opacity-80">{icon}</div>}
      </div>
    </Card>
  )
}

export function Btn({ children, onClick, variant = 'default', size = 'md', type = 'button', disabled }: {
  children: ReactNode; onClick?: () => void; variant?: 'default'|'gold'|'success'|'danger'|'ghost'; size?: 'sm'|'md'; type?: 'button'|'submit'; disabled?: boolean
}) {
  const variants = {
    default: 'border border-white/10 bg-white/5 text-[#EDE4D0] hover:bg-white/10',
    gold: 'bg-gradient-to-r from-[#C8922A] to-[#E4AF4A] text-[#07101f] font-semibold hover:opacity-90',
    success: 'bg-[#3CB87A]/15 border border-[#3CB87A]/30 text-[#3CB87A] hover:bg-[#3CB87A]/25',
    danger: 'bg-[#E05050]/15 border border-[#E05050]/30 text-[#E05050] hover:bg-[#E05050]/25',
    ghost: 'text-[#96A8BF] hover:text-[#EDE4D0] hover:bg-white/5',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-[11px]', md: 'px-3.5 py-2 text-xs' }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all ${variants[variant]} ${sizes[size]} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

export function Input({ label, value, onChange, type = 'text', placeholder, required, step }: {
  label?: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean; step?: string
}) {
  return (
    <label className="block">
      {label && <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">{label}{required && <span className="text-[#E05050]"> *</span>}</span>}
      <input
        type={type}
        value={value}
        step={step}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-[#0c1928] px-3 py-2 text-[13px] text-[#EDE4D0] placeholder:text-[#4E6180] focus:border-[#C8922A]/50 focus:outline-none focus:ring-1 focus:ring-[#C8922A]/30 transition-colors"
      />
    </label>
  )
}

export function Select({ label, value, onChange, options, required }: {
  label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean
}) {
  return (
    <label className="block">
      {label && <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">{label}{required && <span className="text-[#E05050]"> *</span>}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-[#0c1928] px-3 py-2 text-[13px] text-[#EDE4D0] focus:border-[#C8922A]/50 focus:outline-none focus:ring-1 focus:ring-[#C8922A]/30 transition-colors"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function Textarea({ label, value, onChange, placeholder, required, rows = 3 }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; rows?: number
}) {
  return (
    <label className="block">
      {label && <span className="block text-[11px] text-[#96A8BF] mb-1.5 font-medium">{label}{required && <span className="text-[#E05050]"> *</span>}</span>}
      <textarea
        value={value}
        rows={rows}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-[#0c1928] px-3 py-2 text-[13px] text-[#EDE4D0] placeholder:text-[#4E6180] focus:border-[#C8922A]/50 focus:outline-none focus:ring-1 focus:ring-[#C8922A]/30 transition-colors resize-y"
      />
    </label>
  )
}

export function EmptyState({ icon = '📭', title, sub }: { icon?: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="text-3xl mb-2 opacity-60">{icon}</div>
      <div className="text-sm font-medium text-[#96A8BF]">{title}</div>
      {sub && <div className="text-[11px] text-[#4E6180] mt-1">{sub}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-[#111f32] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 sticky top-0 bg-[#111f32] z-10">
          <h3 className="font-serif text-base font-bold text-[#E4AF4A]">{title}</h3>
          <button onClick={onClose} className="text-[#96A8BF] hover:text-[#EDE4D0] text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
