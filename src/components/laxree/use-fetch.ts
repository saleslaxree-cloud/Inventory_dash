'use client'
import { useCallback, useEffect, useState } from 'react'

export function useFetch<T>(url: string, deps: unknown[] = []): { data: T | null; loading: boolean; error: string; refresh: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(url)
      if (res.status === 401) { setData(null); setError('Unauthorized'); return }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Request failed')
      setData(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => { load() }, [load, ...deps])

  return { data, loading, error, refresh: load }
}

export async function apiPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json
}

export async function apiPatch(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json
}
