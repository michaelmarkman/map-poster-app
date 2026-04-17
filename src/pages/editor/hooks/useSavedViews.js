import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { savedViewsAtom } from '../atoms/sidebar'
import {
  timeOfDayAtom,
  dofAtom,
} from '../atoms/scene'

// Saved views hook — mounted once from EditorShell. Owns the localStorage
// <-> savedViewsAtom sync and listens for the window events dispatched from
// ExportSection ('save-view', 'load-view', 'delete-view').
//
// Serialization shape matches prototypes/poster-v3-ui.jsx `buildSavedViewFromCapture`
// so views already in users' localStorage keep loading after the port:
//   { id, fromGalleryId, name, camera: {px,py,pz,qx,qy,qz,qw,fov},
//     tod, focalUV, dofTightness, dofBlur, dofColorPop, thumbnail? }
// The only shape drift is `id` — prototype used Date.now(), we use UUID.
// Old numeric ids still match via strict equality on load/delete lookups.

const VIEWS_KEY = 'mapposter3d_v2_views'
const MAX_VIEWS = 20
const WRITE_THROTTLE_MS = 100
const CAMERA_REPLY_TIMEOUT_MS = 500

function safeReadStorage() {
  try {
    const raw = localStorage.getItem(VIEWS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function safeWriteStorage(views) {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views))
  } catch (e) {}
}

// UUID with a fallback for environments missing crypto.randomUUID (old jsdom).
function uuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch (e) {}
  return 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
}

// Fire a toast event — no toast renderer in src yet, so this is a no-op
// until one is added. Decoupled channel matches the prototype's convention.
function fireToast(type, message) {
  try {
    window.dispatchEvent(new CustomEvent('toast', { detail: { type, message } }))
  } catch (e) {}
}

// Request current camera state from Scene via the get-camera event.
// Scene handles the event by calling detail.resolve({px,py,pz,qx,qy,qz,qw,fov}).
// Returns null on timeout (no listener mounted yet).
function requestCameraState() {
  return new Promise((resolve) => {
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), CAMERA_REPLY_TIMEOUT_MS)
    try {
      window.dispatchEvent(new CustomEvent('get-camera', {
        detail: {
          resolve: (cam) => {
            clearTimeout(timer)
            finish(cam || null)
          },
        },
      }))
    } catch (e) {
      clearTimeout(timer)
      finish(null)
    }
  })
}

// Compose a saved-view record identical in shape to the prototype's
// buildSavedViewFromCapture output, aside from a UUID `id`.
function buildSavedView({ camera, tod, focalUV, dofTightness, dofBlur, dofColorPop }, { name = 'View', fromGalleryId = null, thumbnail = null } = {}) {
  return {
    id: uuid(),
    fromGalleryId,
    name,
    camera: { ...camera },
    tod,
    focalUV: [...(focalUV || [0.5, 0.5])],
    dofTightness,
    dofBlur,
    dofColorPop,
    thumbnail: thumbnail || undefined,
  }
}

// Build a coord-based display name from camera state so the saved-views list
// shows something useful before reverse-geocoding lands. Accepts any of the
// shapes get-camera can respond with:
//   { latitude, longitude, ... } — decimal degrees (Scene.jsx)
//   { px, py, pz, ... }          — ECEF (legacy/test fixture)
//   { position: [x, y, z], ... } — ECEF array
function coordName(cam) {
  try {
    let lat = cam?.latitude
    let lng = cam?.longitude
    if (lat == null || lng == null) {
      let x, y, z
      if (cam?.px != null) { x = cam.px; y = cam.py; z = cam.pz }
      else if (Array.isArray(cam?.position) && cam.position.length === 3) {
        [x, y, z] = cam.position
      } else {
        return 'View'
      }
      const r = Math.sqrt(x * x + y * y + z * z)
      if (!r) return 'View'
      lat = Math.asin(z / r) * 180 / Math.PI
      lng = Math.atan2(y, x) * 180 / Math.PI
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'View'
    const ns = lat >= 0 ? 'N' : 'S'
    const ew = lng >= 0 ? 'E' : 'W'
    return (
      Math.abs(lat).toFixed(3) + '\u00b0' + ns + ' ' +
      Math.abs(lng).toFixed(3) + '\u00b0' + ew
    )
  } catch (e) {
    return 'View'
  }
}

export default function useSavedViews() {
  const [savedViews, setSavedViews] = useAtom(savedViewsAtom)
  const setTimeOfDay = useSetAtom(timeOfDayAtom)
  const setDof = useSetAtom(dofAtom)

  // Latest snapshot of atoms — used by event handlers without retriggering
  // effect setup on every atom change.
  const dof = useAtomValue(dofAtom)
  const tod = useAtomValue(timeOfDayAtom)
  const stateRef = useRef({ dof, tod, views: savedViews })
  stateRef.current = { dof, tod, views: savedViews }

  // Throttled writer: coalesces rapid saves into one localStorage write.
  const writeTimerRef = useRef(null)
  const pendingWriteRef = useRef(null)

  useEffect(() => {
    // Hydrate on mount.
    const initial = safeReadStorage()
    setSavedViews(initial)
    stateRef.current.views = initial

    const flushWrite = () => {
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current)
        writeTimerRef.current = null
      }
      if (pendingWriteRef.current) {
        safeWriteStorage(pendingWriteRef.current)
        pendingWriteRef.current = null
      }
    }

    const scheduleWrite = (views) => {
      pendingWriteRef.current = views
      if (writeTimerRef.current) return
      writeTimerRef.current = setTimeout(flushWrite, WRITE_THROTTLE_MS)
    }

    const commitViews = (views) => {
      stateRef.current.views = views
      setSavedViews(views)
      scheduleWrite(views)
    }

    const onSave = async (e) => {
      const detail = e?.detail
      // Detail shapes accepted:
      //   undefined           → auto-name from coords
      //   { name: 'foo' }     → user-named save
      //   'foo'               → user-named save (legacy string detail)
      const userName =
        typeof detail === 'string' ? detail
        : detail && typeof detail === 'object' ? detail.name
        : null

      const cam = await requestCameraState()
      if (!cam) {
        fireToast('error', 'Camera not ready')
        return
      }
      const { dof: curDof, tod: curTod } = stateRef.current
      const view = buildSavedView(
        {
          camera: cam,
          tod: curTod,
          focalUV: curDof.focalUV,
          dofTightness: curDof.tightness,
          dofBlur: curDof.blur,
          dofColorPop: curDof.colorPop,
        },
        { name: userName || coordName(cam) },
      )

      const list = [view, ...stateRef.current.views]
      if (list.length > MAX_VIEWS) list.length = MAX_VIEWS
      commitViews(list)
      fireToast('success', 'View saved!')
    }

    // The prototype's `fire('load-view', view.id)` passes the id directly as
    // detail, but the Phase 5 spec defines `{ id }`. Accept both so either
    // caller shape works.
    const extractId = (detail) => {
      if (detail == null) return null
      if (typeof detail === 'object') return detail.id
      return detail
    }

    const onLoad = (e) => {
      const id = extractId(e?.detail)
      if (id == null) return
      const view = stateRef.current.views.find((v) => v.id === id)
      if (!view) return

      // Apply scene atoms directly.
      if (typeof view.tod === 'number') setTimeOfDay(view.tod)
      setDof((prev) => ({
        ...prev,
        focalUV: Array.isArray(view.focalUV) ? [...view.focalUV] : prev.focalUV,
        tightness: view.dofTightness ?? prev.tightness,
        blur: view.dofBlur ?? prev.blur,
        colorPop: view.dofColorPop ?? prev.colorPop,
      }))

      // Camera: dispatch a restore-view event with the full view detail. Scene
      // (or the session-persistence agent's Scene wiring) is responsible for
      // applying px/py/pz + quaternion. Matches the prototype channel name.
      try {
        window.dispatchEvent(new CustomEvent('restore-view', { detail: view }))
      } catch (err) {}
    }

    const onDelete = (e) => {
      const id = extractId(e?.detail)
      if (id == null) return
      const next = stateRef.current.views.filter((v) => v.id !== id)
      if (next.length === stateRef.current.views.length) return
      commitViews(next)
    }

    window.addEventListener('save-view', onSave)
    window.addEventListener('load-view', onLoad)
    window.addEventListener('delete-view', onDelete)

    return () => {
      window.removeEventListener('save-view', onSave)
      window.removeEventListener('load-view', onLoad)
      window.removeEventListener('delete-view', onDelete)
      flushWrite()
    }
    // setSavedViews/setTimeOfDay/setDof are stable Jotai setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
