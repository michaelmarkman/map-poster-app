import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { savedViewsAtom } from '../atoms/sidebar'
import {
  timeOfDayAtom,
  dofAtom,
} from '../atoms/scene'
import { reverseGeocodeName } from '../../../lib/geocode'
import { canSaveAnotherView } from '../../../lib/entitlements'
import { snapshotCanvas } from '../utils/export'

// Capture a small thumbnail for the saved view at the moment of save.
// Resolution 0.5 keeps the thumb tiny (typically ~150kB at 2x DPR);
// the SavedViewsPanel renders these at 56x56 so smaller is fine.
// Returns null on capture failure — callers treat thumbnail as
// optional in buildSavedView.
function captureThumbnail() {
  try {
    return snapshotCanvas(0.5) || null
  } catch {
    return null
  }
}

// Saved views hook — mounted once from MockEditorShell. Owns the
// localStorage <-> savedViewsAtom sync and listens for the window events
// dispatched from save-view UI ('save-view', 'load-view', 'delete-view').
//
// Serialization shape matches prototypes/poster-v3-ui.jsx `buildSavedViewFromCapture`
// so views already in users' localStorage keep loading after the port:
//   { id, fromGalleryId, name, camera: {px,py,pz,qx,qy,qz,qw,fov},
//     tod, focalUV, dofTightness, dofBlur, dofColorPop, thumbnail? }
// The only shape drift is `id` — prototype used Date.now(), we use UUID.
// Old numeric ids still match via strict equality on load/delete lookups.

const VIEWS_KEY = 'vedute_views'
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

// Compose a saved-view record. Shape matches the prototype's
// buildSavedViewFromCapture output, aside from a UUID `id` and (since
// Phase 1.3) no `graphicsJSON` field — the graphics editor is gone.
//
// Old views in localStorage may still carry `graphicsJSON`; we preserve
// that field on round-trip but no longer write or apply it.
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

// Pull lat/lng out of whatever shape get-camera responded with — same
// permissive parsing as coordName() below.
function extractLatLng(cam) {
  let lat = cam?.latitude
  let lng = cam?.longitude
  if (lat == null || lng == null) {
    let x, y, z
    if (cam?.px != null) { x = cam.px; y = cam.py; z = cam.pz }
    else if (Array.isArray(cam?.position) && cam.position.length === 3) {
      [x, y, z] = cam.position
    } else {
      return [null, null]
    }
    const r = Math.sqrt(x * x + y * y + z * z)
    if (!r) return [null, null]
    lat = Math.asin(z / r) * 180 / Math.PI
    lng = Math.atan2(y, x) * 180 / Math.PI
  }
  return [lat, lng]
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

    // Phase 4.3 — first-run auto-load of the default saved view.
    // If the user has marked a view as default AND there's no session
    // blob (i.e. we're on a cold load with no camera state to restore),
    // dispatch restore-view for that default view a moment after mount
    // so Scene's listener has registered. Session-restore takes
    // precedence over this — no-op if the user already has a session.
    try {
      const SESSION_KEY = 'vedute_session'
      const hasSession = !!localStorage.getItem(SESSION_KEY)
      const sessionRaw = hasSession ? localStorage.getItem(SESSION_KEY) : null
      const sessionData = sessionRaw ? JSON.parse(sessionRaw) : null
      const hasCamera = !!sessionData?.camera?.position
      const defaultId = sessionData?.ui?.defaultSavedViewId
      if (!hasCamera && defaultId) {
        const view = initial.find((v) => v.id === defaultId)
        if (view) {
          // Defer past Scene's mount + get-camera listener attach.
          setTimeout(() => {
            try {
              window.dispatchEvent(new CustomEvent('restore-view', { detail: view }))
            } catch {}
          }, 600)
        }
      }
    } catch {}

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

      // Phase 6 entitlement gate. Free tier capped at 5 saved views.
      // profile is read from the active-profile bridge in entitlements.
      if (!canSaveAnotherView({ currentCount: stateRef.current.views.length })) {
        fireToast(
          'error',
          'Free tier saves up to 5 views. Delete one or upgrade to Pro.',
        )
        return
      }

      const cam = await requestCameraState()
      if (!cam) {
        fireToast('error', 'Camera not ready')
        return
      }
      const { dof: curDof, tod: curTod } = stateRef.current
      // Save with the coord-based name immediately so the UI updates
      // synchronously (tests + perceived snappiness depend on this). Then
      // fire reverse-geocode in the background; if it returns a place
      // name, patch the view's name in-place.
      const initialName = userName || coordName(cam)
      // Phase 2.3 thumbnail — 0.5x snapshot, ~150kB, used by SavedViewsPanel.
      const thumbnail = captureThumbnail()
      const view = buildSavedView(
        {
          camera: cam,
          tod: curTod,
          focalUV: curDof.focalUV,
          dofTightness: curDof.tightness,
          dofBlur: curDof.blur,
          dofColorPop: curDof.colorPop,
        },
        { name: initialName, thumbnail },
      )

      if (!userName) {
        const [lat, lng] = extractLatLng(cam)
        if (lat != null && lng != null) {
          reverseGeocodeName(lat, lng).then((place) => {
            if (!place) return
            const next = stateRef.current.views.map((v) =>
              v.id === view.id ? { ...v, name: place } : v,
            )
            commitViews(next)
          })
        }
      }

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

    // Rename: detail = { id, name }
    const onRename = (e) => {
      const detail = e?.detail
      if (!detail?.id || typeof detail.name !== 'string') return
      const trimmed = detail.name.trim()
      if (!trimmed) return
      const next = stateRef.current.views.map((v) =>
        v.id === detail.id ? { ...v, name: trimmed } : v,
      )
      commitViews(next)
    }

    // Reorder: detail = { id, direction: 'up' | 'down' }
    const onReorder = (e) => {
      const detail = e?.detail
      if (!detail?.id || (detail.direction !== 'up' && detail.direction !== 'down')) return
      const list = stateRef.current.views
      const idx = list.findIndex((v) => v.id === detail.id)
      if (idx < 0) return
      const target = detail.direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= list.length) return
      const next = [...list]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      commitViews(next)
    }

    // Lightbox bridges — Jump-to-view on a gallery entry should restore the
    // camera that produced it; Save-view should add it to the saved-views
    // list. Both read entry.view (captured at queue time).
    const onLightboxSave = (e) => {
      const entry = e?.detail
      if (!entry?.view) return
      const cam = entry.view.camera || entry.view
      const view = buildSavedView(
        {
          camera: cam,
          tod: entry.view.tod ?? stateRef.current.tod,
          focalUV: entry.view.focalUV,
          dofTightness: entry.view.dofTightness,
          dofBlur: entry.view.dofBlur,
          dofColorPop: entry.view.dofColorPop,
        },
        { name: entry.label || 'View', fromGalleryId: entry.id ?? null },
      )
      const list = [view, ...stateRef.current.views]
      if (list.length > MAX_VIEWS) list.length = MAX_VIEWS
      commitViews(list)
      fireToast('success', 'View saved!')
    }

    const onLightboxJump = (e) => {
      const entry = e?.detail
      if (!entry?.view) return
      // Apply tod / dof if the entry captured them, else leave current.
      if (typeof entry.view.tod === 'number') setTimeOfDay(entry.view.tod)
      if (entry.view.dofTightness != null || entry.view.dofBlur != null) {
        setDof((prev) => ({
          ...prev,
          tightness: entry.view.dofTightness ?? prev.tightness,
          blur: entry.view.dofBlur ?? prev.blur,
        }))
      }
      // Restore camera. Scene accepts either the bare camera object or a
      // wrapped { camera } detail — pass whatever shape we have.
      try {
        const detail = entry.view.camera ? entry.view : { camera: entry.view }
        window.dispatchEvent(new CustomEvent('restore-view', { detail }))
      } catch {}
    }

    window.addEventListener('save-view', onSave)
    window.addEventListener('load-view', onLoad)
    window.addEventListener('delete-view', onDelete)
    window.addEventListener('rename-view', onRename)
    window.addEventListener('reorder-view', onReorder)
    window.addEventListener('lightbox-save-view', onLightboxSave)
    window.addEventListener('lightbox-jump-view', onLightboxJump)

    return () => {
      window.removeEventListener('save-view', onSave)
      window.removeEventListener('load-view', onLoad)
      window.removeEventListener('delete-view', onDelete)
      window.removeEventListener('lightbox-save-view', onLightboxSave)
      window.removeEventListener('lightbox-jump-view', onLightboxJump)
      window.removeEventListener('rename-view', onRename)
      window.removeEventListener('reorder-view', onReorder)
      flushWrite()
    }
    // setSavedViews/setTimeOfDay/setDof are stable Jotai setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
