'use client'
import { useMemo, useState } from 'react'
import { useFetch } from './use-fetch'
import { Badge, Card, SectionTitle, Select } from './ui'

type Item = {
  id: string
  category: string
  itemName: string
  model: string
  colour: string | null
  unit: string
  currentStock: number
  minStock: number
  fastMoving: boolean
}

type StockRow = {
  id: string
  category: string
  itemName: string
  model: string
  colour: string | null
  unit: string
  inward: number
  dispatched: number
  balance: number
  onHold: number
  available: number
  minStock: number
  fastMoving: boolean
  status: 'OK' | 'LOW' | 'OUT_OF_STOCK'
}

/**
 * StockLookupCard — cascading dropdown to check live stock
 * Category  →  Item Name  →  Model  →  shows Current Stock / Available / Held / Status
 *
 * Drop this component into any dashboard's "Current Stock" / "Stock Register" tab.
 */
export function StockLookupCard({ compact = false }: { compact?: boolean }) {
  const { data: itemsData } = useFetch<{ items: Item[] }>('/api/items')
  const { data: regData } = useFetch<{ rows: StockRow[] }>('/api/stock-register')

  const [category, setCategory] = useState('')
  const [itemName, setItemName] = useState('')
  const [model, setModel] = useState('')

  const items = itemsData?.items || []

  // Step 1: unique categories
  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items],
  )

  // Step 2: item names within selected category (unique by itemName)
  const itemNames = useMemo(() => {
    const filtered = items.filter((i) => !category || i.category === category)
    return Array.from(new Set(filtered.map((i) => i.itemName))).sort()
  }, [items, category])

  // Step 3: models within selected item name (an item name may have multiple model variants)
  const modelOptions = useMemo(() => {
    const filtered = items.filter(
      (i) => (!category || i.category === category) && (!itemName || i.itemName === itemName),
    )
    // unique by model
    const seen = new Set<string>()
    const out: Item[] = []
    for (const it of filtered) {
      if (!seen.has(it.model)) {
        seen.add(it.model)
        out.push(it)
      }
    }
    return out
  }, [items, category, itemName])

  // Step 4: selected item (match by category + itemName + model)
  const selectedItem = useMemo(() => {
    if (!itemName || !model) return null
    return (
      items.find(
        (i) =>
          (!category || i.category === category) &&
          i.itemName === itemName &&
          i.model === model,
      ) || null
    )
  }, [items, category, itemName, model])

  // Live register row (includes held / available computed server-side)
  const regRow = useMemo(() => {
    if (!selectedItem) return null
    return regData?.rows.find((r) => r.id === selectedItem.id) || null
  }, [regData, selectedItem])

  const resetItem = () => { setItemName(''); setModel('') }
  const resetModel = () => { setModel('') }

  const statusColor = regRow?.status === 'OK' ? '#3CB87A'
    : regRow?.status === 'LOW' ? '#E09E3C'
    : regRow?.status === 'OUT_OF_STOCK' ? '#E05050'
    : '#96A8BF'
  const statusLabel = regRow?.status === 'OK' ? 'In Stock'
    : regRow?.status === 'LOW' ? 'Low Stock'
    : regRow?.status === 'OUT_OF_STOCK' ? 'Out of Stock'
    : '—'

  return (
    <Card className="p-4">
      <SectionTitle
        icon="🔍"
        title="Stock Lookup"
        sub="Select category → item → model to check live stock"
      />
      <div className={`grid gap-3 ${compact ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-3 lg:grid-cols-4'}`}>
        <Select
          label="Category"
          value={category}
          onChange={(v) => { setCategory(v); resetItem() }}
          options={[
            { value: '', label: '— All Categories —' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />
        <Select
          label="Item Name"
          value={itemName}
          onChange={(v) => { setItemName(v); resetModel() }}
          required
          options={[
            { value: '', label: '— Select Item —' },
            ...itemNames.map((n) => ({ value: n, label: n })),
          ]}
        />
        <Select
          label="Model / SKU"
          value={model}
          onChange={setModel}
          required
          options={[
            { value: '', label: '— Select Model —' },
            ...modelOptions.map((it) => ({
              value: it.model,
              label: it.colour ? `${it.model}  ·  ${it.colour}` : it.model,
            })),
          ]}
        />
        {!compact && (
          <div className="flex flex-col justify-end">
            {selectedItem ? (
              <div className="rounded-lg border border-white/10 bg-[#0c1928] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[#4E6180]">Status</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: statusColor }} />
                  <span className="text-[13px] font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
                  {selectedItem.fastMoving && <Badge label="⚡ Fast" color="#3CB87A" />}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-transparent px-3 py-2 text-[11px] text-[#4E6180]">
                Pick all 3 to view stock
              </div>
            )}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Stat label="Current Stock" value={selectedItem.currentStock} accent="#E4AF4A" />
          <Stat label="On Hold" value={regRow?.onHold ?? 0} accent="#9B6ED4" />
          <Stat label="Available" value={regRow?.available ?? selectedItem.currentStock} accent="#3CB87A" />
          <Stat label="Min Stock" value={selectedItem.minStock} accent="#96A8BF" />
          <Stat label="Inward" value={regRow?.inward ?? 0} accent="#3CB87A" />
          <Stat label="Dispatched" value={regRow?.dispatched ?? 0} accent="#E05050" />
          <div className="col-span-2 md:col-span-4 lg:col-span-6 rounded-lg border border-white/7 bg-white/[0.02] px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="text-[#4E6180]">Category: <span className="text-[#96A8BF]">{selectedItem.category}</span></span>
            <span className="text-[#4E6180]">Unit: <span className="text-[#96A8BF]">{selectedItem.unit || 'PCS'}</span></span>
            {selectedItem.colour && (
              <span className="text-[#4E6180]">Colour: <span className="text-[#96A8BF]">{selectedItem.colour}</span></span>
            )}
            <span className="text-[#4E6180]">Model: <span className="text-[#E4AF4A] font-mono">{selectedItem.model}</span></span>
          </div>
        </div>
      )}
    </Card>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
      <div className="text-[9.5px] uppercase tracking-wider text-[#4E6180] font-semibold mb-1">{label}</div>
      <div className="font-serif text-xl font-bold leading-none" style={{ color: accent }}>{value.toLocaleString('en-IN')}</div>
    </div>
  )
}
