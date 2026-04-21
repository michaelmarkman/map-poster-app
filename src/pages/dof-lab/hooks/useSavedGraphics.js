import { useEffect } from 'react'
import { atom, useAtom } from 'jotai'

// Saved graphics — independent of saved views. Each entry is a serialized
// Fabric overlay you can re-apply later. Persists to localStorage so it
// survives reloads.
export const savedGraphicsAtom = atom([])
const LS_KEY = 'mapposter_saved_graphics'
const MAX_ENTRIES = 30

function readStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
function writeStorage(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch {}
}
function uuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {}
  return 'g-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}
function captureGraphics() {
  try {
    const fabric = window.__editorOverlayFabric
    if (!fabric || !fabric.getObjects) return null
    const objects = fabric.getObjects().filter((o) => !o.excludeFromExport)
    if (objects.length === 0) return null
    return JSON.stringify(
      fabric.toJSON(['name', 'editorType', 'lockMovementX', 'lockMovementY', 'excludeFromExport']),
    )
  } catch { return null }
}
async function applyGraphics(json) {
  try {
    const fabric = window.__editorOverlayFabric
    if (!fabric) return
    if (json) {
      await fabric.loadFromJSON(JSON.parse(json))
      fabric.renderAll?.()
    } else {
      fabric.clear?.()
      fabric.renderAll?.()
    }
  } catch {}
}

export default function useSavedGraphics() {
  const [items, setItems] = useAtom(savedGraphicsAtom)
  const itemsRef = { current: items }
  itemsRef.current = items

  useEffect(() => {
    setItems(readStorage())

    const onSave = (e) => {
      const json = captureGraphics()
      if (!json) return
      const name = (typeof e?.detail === 'string' ? e.detail : e?.detail?.name) || 'Layer'
      const entry = { id: uuid(), name, graphicsJSON: json, time: Date.now() }
      const next = [entry, ...itemsRef.current]
      if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES
      itemsRef.current = next
      setItems(next)
      writeStorage(next)
    }

    const onLoad = (e) => {
      const id = typeof e?.detail === 'string' ? e.detail : e?.detail?.id
      if (!id) return
      const entry = itemsRef.current.find((x) => x.id === id)
      if (entry) applyGraphics(entry.graphicsJSON)
    }

    const onDelete = (e) => {
      const id = typeof e?.detail === 'string' ? e.detail : e?.detail?.id
      if (!id) return
      const next = itemsRef.current.filter((x) => x.id !== id)
      itemsRef.current = next
      setItems(next)
      writeStorage(next)
    }

    const onClear = () => { applyGraphics(null) }

    window.addEventListener('save-graphics', onSave)
    window.addEventListener('load-graphics', onLoad)
    window.addEventListener('delete-graphics', onDelete)
    window.addEventListener('clear-graphics', onClear)
    return () => {
      window.removeEventListener('save-graphics', onSave)
      window.removeEventListener('load-graphics', onLoad)
      window.removeEventListener('delete-graphics', onDelete)
      window.removeEventListener('clear-graphics', onClear)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
