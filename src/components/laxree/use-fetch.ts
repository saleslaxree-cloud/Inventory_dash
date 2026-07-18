'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * Safely parse a JSON response body.
 * Returns null if the body is empty or not valid JSON
 * (which happens on Vercel when a serverless function crashes/times out
 * and returns an empty body — previously threw "Unexpected end of JSON input").
 */
async function safeJson(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return null
  }
  const text = await res.text()
  if (!text || text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

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
      if (res.status === 204) { setData(null); return }
      const json = await safeJson(res)
      if (!res.ok) {
        const msg = json?.error || `Request failed (${res.status})`
        throw new Error(msg)
      }
      if (json === null) {
        throw new Error(`Server returned an empty response (${res.status}). The database may be unavailable.`)
      }
      setData(json as T)
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
  const json = await safeJson(res)
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  if (json === null) throw new Error(`Server returned an empty response (${res.status}). The database may be unavailable.`)
  return json
}

export async function apiPatch(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await safeJson(res)
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  if (json === null) throw new Error(`Server returned an empty response (${res.status}). The database may be unavailable.`)
  return json
}

export async function apiDelete(url: string) {
  const res = await fetch(url, { method: 'DELETE' })
  const json = await safeJson(res)
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)
  return json
}
