'use client'
import { useState } from 'react'
import { Btn, Input, Modal } from './ui'
import { SessionUser } from './types'

export function PasswordChangeModal({ user, open, onClose, onDone }: {
  user: SessionUser; open: boolean; onClose: () => void; onDone: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setErr('')
    if (!current || !next || !confirm) { setErr('All fields required'); return }
    if (next !== confirm) { setErr('New passwords do not match'); return }
    if (next.length < 6) { setErr('Password must be at least 6 characters'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setCurrent(''); setNext(''); setConfirm('')
      onDone()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Password" >
      <div className="space-y-4">
        <div className="rounded-lg border border-[#E09E3C]/30 bg-[#E09E3C]/10 p-3 text-[12px] text-[#E09E3C]">
          🔒 For security, you must change your password before continuing.
        </div>
        <Input label="Current Password" value={current} onChange={setCurrent} type="password" required />
        <Input label="New Password" value={next} onChange={setNext} type="password" placeholder="Min 6 characters" required />
        <Input label="Confirm New Password" value={confirm} onChange={setConfirm} type="password" required />
        {err && <div className="rounded-lg border border-[#E05050]/30 bg-[#E05050]/10 px-3 py-2 text-xs text-[#E05050]">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="gold" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Change Password'}</Btn>
        </div>
      </div>
    </Modal>
  )
}
