import { atom } from 'jotai'

// Lab-only: render backdrop for graphic-editor mode. Same purpose as /app's.
export const editingBackdropAtom = atom(null)

// Lab-only: which of the three DoF popover UIs is showing.
//   'A' — today's sliders, aperture derived from Blur (stealth)
//   'B' — Aperture replaces Blur (camera-metaphor, keeps Tightness)
//   'C' — Aperture + Pop only (pure camera)
// Persisted to localStorage so a page refresh keeps your current comparison.
const LS_KEY = 'dof_lab_ui_variant'
const VALID = new Set(['A', 'B', 'C'])

const readInitial = () => {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v && VALID.has(v)) return v
  } catch (e) { /* localStorage unavailable */ }
  return 'B'
}

const baseAtom = atom(readInitial())

export const dofUiVariantAtom = atom(
  (get) => get(baseAtom),
  (get, set, next) => {
    if (!VALID.has(next)) return
    set(baseAtom, next)
    try { localStorage.setItem(LS_KEY, next) } catch (e) { /* ignore */ }
  },
)
