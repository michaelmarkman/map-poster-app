import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  timeOfDayAtom,
  latitudeAtom,
  longitudeAtom,
  sunRotationAtom,
  bloomAtom,
  ssaoAtom,
  vignetteAtom,
  cloudsAtom,
  dofAtom,
  mapStyleAtom,
  todUnlockedAtom,
} from '../atoms/scene'
import {
  fillModeAtom,
  aspectRatioAtom,
  textOverlayAtom,
  textFieldsAtom,
  cameraReadoutAtom,
} from '../atoms/ui'

const SESSION_KEY = 'mapposter3d_poster_v2_session'
const DEBOUNCE_MS = 500

// Module-local camera reference, populated by Scene via registerCamera().
// Used by the hook to serialize camera.position/quaternion/up/fov at save time.
let _camera = null

export function registerCamera(camera) {
  _camera = camera
}

// Black-canvas heal: if a previous session saved with tod outside the safe
// daylight range (eg pitch-night 0.85 from a buggy save), clamp to noon in
// memory only. Stored session is untouched. Ported from prototype ~line 1636.
function healTimeOfDay(value) {
  if (typeof value === 'number' && (value < 8 || value > 18)) return 12
  return value
}

// Deep-ish merge helper — only overwrites known keys when present in saved.
// Defaults are preserved so future atom shape extensions don't break old sessions.
function mergeObj(defaults, saved) {
  if (!saved || typeof saved !== 'object') return defaults
  return { ...defaults, ...saved }
}

export default function useSessionPersistence() {
  // Atom setters (used on mount for restore).
  const setTimeOfDay = useSetAtom(timeOfDayAtom)
  const setLatitude = useSetAtom(latitudeAtom)
  const setLongitude = useSetAtom(longitudeAtom)
  const setSunRotation = useSetAtom(sunRotationAtom)
  const setBloom = useSetAtom(bloomAtom)
  const setSsao = useSetAtom(ssaoAtom)
  const setVignette = useSetAtom(vignetteAtom)
  const setClouds = useSetAtom(cloudsAtom)
  const setDof = useSetAtom(dofAtom)
  const setMapStyle = useSetAtom(mapStyleAtom)
  const setTodUnlocked = useSetAtom(todUnlockedAtom)
  const setFillMode = useSetAtom(fillModeAtom)
  const setAspectRatio = useSetAtom(aspectRatioAtom)
  const setTextOverlay = useSetAtom(textOverlayAtom)
  const setTextFields = useSetAtom(textFieldsAtom)

  // Atom values (subscribed so we know when to save).
  const timeOfDay = useAtomValue(timeOfDayAtom)
  const latitude = useAtomValue(latitudeAtom)
  const longitude = useAtomValue(longitudeAtom)
  const sunRotation = useAtomValue(sunRotationAtom)
  const bloom = useAtomValue(bloomAtom)
  const ssao = useAtomValue(ssaoAtom)
  const vignette = useAtomValue(vignetteAtom)
  const clouds = useAtomValue(cloudsAtom)
  const dof = useAtomValue(dofAtom)
  const mapStyle = useAtomValue(mapStyleAtom)
  const todUnlocked = useAtomValue(todUnlockedAtom)
  const fillMode = useAtomValue(fillModeAtom)
  const aspectRatio = useAtomValue(aspectRatioAtom)
  const textOverlay = useAtomValue(textOverlayAtom)
  const textFields = useAtomValue(textFieldsAtom)
  const cameraReadout = useAtomValue(cameraReadoutAtom)

  // Latest-value ref — updated inside an effect (NOT during render) so
  // React's concurrent features can't drop the write if a render bails.
  // Without this, the minified prod build was serializing stale default
  // values on save while the UI correctly reflected the new atom state.
  const latest = useRef({})
  useEffect(() => {
    latest.current = {
      timeOfDay, latitude, longitude, sunRotation, bloom, ssao, vignette,
      clouds, dof, mapStyle, todUnlocked, fillMode, aspectRatio, textOverlay,
      textFields, cameraReadout,
    }
  })

  // Restore — runs once on mount. Guarded by a ref so StrictMode's double
  // invocation doesn't overwrite freshly-set atoms with stale storage twice.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return
      const data = JSON.parse(raw)

      if (data.state) {
        const s = data.state
        if ('timeOfDay' in s) setTimeOfDay(healTimeOfDay(s.timeOfDay))
        if ('latitude' in s) setLatitude(s.latitude)
        if ('longitude' in s) setLongitude(s.longitude)
        if ('sunRotation' in s) setSunRotation(s.sunRotation)
        if (s.dof) setDof(mergeObj(latest.current.dof, s.dof))
        if (s.clouds) setClouds(mergeObj(latest.current.clouds, s.clouds))
        if (s.bloom) setBloom(mergeObj(latest.current.bloom, s.bloom))
        if (s.ssao) setSsao(mergeObj(latest.current.ssao, s.ssao))
        if (s.vignette) setVignette(mergeObj(latest.current.vignette, s.vignette))
      }

      if (data.ui) {
        const u = data.ui
        if ('fillMode' in u) setFillMode(!!u.fillMode)
        // Also mirror to body class immediately — CanvasSection normally owns
        // this but it may not be mounted when restore fires on first render.
        if ('fillMode' in u) {
          try { document.body.classList.toggle('fill-mode', !!u.fillMode) } catch (e) {}
        }
        if (typeof u.aspectRatio === 'number') setAspectRatio(u.aspectRatio)
        else if (typeof u.aspectRatio === 'string') {
          const n = parseFloat(u.aspectRatio)
          if (!isNaN(n)) setAspectRatio(n)
        }
        if ('textOverlay' in u) setTextOverlay(!!u.textOverlay)
        if (u.textFields) setTextFields(mergeObj(latest.current.textFields, u.textFields))
        if (u.mapStyle) setMapStyle(u.mapStyle)
        if ('todUnlocked' in u) setTodUnlocked(!!u.todUnlocked)
      }

      // Camera — dispatch events so Scene's existing handlers apply. Scene
      // listens for 'camera-set' (tilt/heading/altitude) and 'fov-change'
      // (fovMm). We dispatch on the next tick so Scene's useEffect listeners
      // are guaranteed to be attached by the time the event fires.
      if (data.camera) {
        const c = data.camera
        setTimeout(() => {
          try {
            if (typeof c.tilt === 'number' && typeof c.heading === 'number' && typeof c.altitude === 'number') {
              window.dispatchEvent(new CustomEvent('camera-set', {
                detail: { tilt: c.tilt, heading: c.heading, altitude: c.altitude },
              }))
            }
            if (typeof c.fovMm === 'number') {
              window.dispatchEvent(new CustomEvent('fov-change', { detail: c.fovMm }))
            }
          } catch (e) {}
        }, 0)
      }
    } catch (e) {
      // Corrupt localStorage — ignore and keep default atom values.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build the session payload from current atom values + registered camera.
  const buildPayload = () => {
    const v = latest.current
    const payload = {
      camera: {
        tilt: v.cameraReadout?.tilt,
        heading: v.cameraReadout?.heading,
        altitude: v.cameraReadout?.altitude,
        fovMm: v.cameraReadout?.fovMm,
      },
      state: {
        timeOfDay: v.timeOfDay,
        latitude: v.latitude,
        longitude: v.longitude,
        sunRotation: v.sunRotation,
        dof: { ...v.dof },
        clouds: { ...v.clouds },
        bloom: { ...v.bloom },
        ssao: { ...v.ssao },
        vignette: { ...v.vignette },
      },
      ui: {
        fillMode: !!v.fillMode,
        aspectRatio: v.aspectRatio,
        textOverlay: !!v.textOverlay,
        textFields: { ...v.textFields },
        mapStyle: v.mapStyle,
        todUnlocked: !!v.todUnlocked,
      },
      timestamp: Date.now(),
    }

    // Enrich camera with position/quaternion/up/fov if Scene has registered.
    if (_camera) {
      try {
        payload.camera.position = [_camera.position.x, _camera.position.y, _camera.position.z]
        payload.camera.quaternion = [
          _camera.quaternion.x, _camera.quaternion.y,
          _camera.quaternion.z, _camera.quaternion.w,
        ]
        payload.camera.up = [_camera.up.x, _camera.up.y, _camera.up.z]
      } catch (e) {}
    }
    return payload
  }

  const writeNow = () => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(buildPayload()))
    } catch (e) {}
  }

  // Debounced save — fires on any atom change this hook subscribes to.
  const debounceRef = useRef(null)
  useEffect(() => {
    // Skip the very first effect firing (initial values right after restore)
    // so we don't clobber what we just loaded.
    if (!restored.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(writeNow, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  // NOTE: `cameraReadout` is deliberately NOT in this deps list. Scene
  // pushes it ~5x/second via useFrame, which would reset the debounce
  // every 200ms and prevent the save from ever firing. Camera-derived
  // state still gets into the payload via latest.current, and the
  // camera-set + fov-change events below trigger their own saves when
  // the user actually moves the camera.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    timeOfDay, latitude, longitude, sunRotation, bloom, ssao, vignette,
    clouds, dof, mapStyle, todUnlocked, fillMode, aspectRatio, textOverlay,
    textFields,
  ])

  // Save on camera movement too — debounced so a drag-to-orbit gesture
  // only writes once when the user lets go.
  useEffect(() => {
    const scheduleSave = () => {
      if (!restored.current) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(writeNow, DEBOUNCE_MS)
    }
    window.addEventListener('camera-set', scheduleSave)
    window.addEventListener('fov-change', scheduleSave)
    return () => {
      window.removeEventListener('camera-set', scheduleSave)
      window.removeEventListener('fov-change', scheduleSave)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Immediate save on explicit request (Export, user-triggered saves, etc).
  useEffect(() => {
    const handler = () => writeNow()
    window.addEventListener('save-session', handler)
    return () => window.removeEventListener('save-session', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
