import { useEffect, useLayoutEffect, useRef } from 'react'
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
  todUnlockedAtom,
} from '../atoms/scene'
import {
  fillModeAtom,
  aspectRatioAtom,
  textFieldsAtom,
  cameraReadoutAtom,
} from '../atoms/ui'
import {
  aiCleanArtifactsAtom,
  aiPromptAtom,
  defaultSavedViewIdAtom,
  exportResolutionAtom,
  onboardedAtom,
  savedViewMarkersOnAtom,
} from '../atoms/sidebar'

const SESSION_KEY = 'vedute_session'
const DEBOUNCE_MS = 500

// Module-local camera reference, populated by Scene via registerCamera().
// Used by the hook to serialize camera.position/quaternion/up/fov at save time.
let _camera = null

export function registerCamera(camera) {
  const wasNull = _camera === null
  _camera = camera
  // Race: persistence's first debounced save can fire before Scene's
  // useLayoutEffect runs registerCamera. The save then writes a session
  // blob with camera={tilt,heading,altitude,fovMm} from cameraReadout
  // but no position/quaternion/up. Nudge a save the first time the
  // camera registers so the next blob has the full ECEF.
  if (wasNull && camera) {
    try { window.dispatchEvent(new Event('camera-set')) } catch {}
  }
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
  const setTodUnlocked = useSetAtom(todUnlockedAtom)
  const setFillMode = useSetAtom(fillModeAtom)
  const setAspectRatio = useSetAtom(aspectRatioAtom)
  const setTextFields = useSetAtom(textFieldsAtom)
  const setSavedViewMarkersOn = useSetAtom(savedViewMarkersOnAtom)
  const setDefaultSavedViewId = useSetAtom(defaultSavedViewIdAtom)
  const setOnboarded = useSetAtom(onboardedAtom)
  const setAiCleanArtifacts = useSetAtom(aiCleanArtifactsAtom)
  const setExportResolution = useSetAtom(exportResolutionAtom)
  const setAiPrompt = useSetAtom(aiPromptAtom)

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
  const todUnlocked = useAtomValue(todUnlockedAtom)
  const fillMode = useAtomValue(fillModeAtom)
  const aspectRatio = useAtomValue(aspectRatioAtom)
  const textFields = useAtomValue(textFieldsAtom)
  const cameraReadout = useAtomValue(cameraReadoutAtom)
  const savedViewMarkersOn = useAtomValue(savedViewMarkersOnAtom)
  const defaultSavedViewId = useAtomValue(defaultSavedViewIdAtom)
  const onboarded = useAtomValue(onboardedAtom)
  const aiCleanArtifacts = useAtomValue(aiCleanArtifactsAtom)
  const exportResolution = useAtomValue(exportResolutionAtom)
  const aiPrompt = useAtomValue(aiPromptAtom)

  // Latest-value ref — updated inside an effect (NOT during render) so
  // React's concurrent features can't drop the write if a render bails.
  // Without this, the minified prod build was serializing stale default
  // values on save while the UI correctly reflected the new atom state.
  const latest = useRef({})
  useEffect(() => {
    latest.current = {
      timeOfDay, latitude, longitude, sunRotation, bloom, ssao, vignette,
      clouds, dof, todUnlocked, fillMode, aspectRatio,
      textFields, cameraReadout, savedViewMarkersOn, defaultSavedViewId, onboarded,
      aiCleanArtifacts, exportResolution, aiPrompt,
    }
  })

  // Restore — runs once on mount. Guarded by a ref so StrictMode's double
  // invocation doesn't overwrite freshly-set atoms with stale storage twice.
  // useLayoutEffect (not useEffect) so all the setAtom calls below batch
  // and re-render synchronously BEFORE the browser paints. With useEffect
  // there was a visible flash on cold load: OnboardingCard rendering
  // briefly with the default `onboarded=false` even for users who'd
  // already dismissed it, fillMode flipping, etc. Same applies to the
  // body class toggles below — they need to be in sync with the first
  // paint, not the second.
  const restored = useRef(false)
  useLayoutEffect(() => {
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
        if (s.dof) {
          const saved = { ...s.dof }
          // Legacy migration: sessions before the Scene/Focus split stored
          // a single `colorPop` + a boolean `globalPop`. Map forward:
          //   globalPop=true  → sceneColorPop=colorPop, focusColorPop=0
          //   globalPop=false → sceneColorPop=0, focusColorPop=colorPop
          if (!('sceneColorPop' in saved) && typeof saved.colorPop === 'number') {
            if (saved.globalPop) {
              saved.sceneColorPop = saved.colorPop
              saved.focusColorPop = 0
            } else {
              saved.sceneColorPop = 0
              saved.focusColorPop = saved.colorPop
            }
          }
          delete saved.colorPop
          delete saved.globalPop
          // The 2.7 cluster redesign drops `dof.on` in favor of "aperture
          // is the single source of truth"; the OFF detent of the cluster
          // pill writes aperture=0. Map old `dof.on=false` sessions onto
          // aperture=0 so the visual stays "DoF off" through the upgrade.
          // Also force useApertureCoC=true since the new cluster only
          // writes to aperture.
          if (saved.on === false) {
            saved.aperture = 0
          }
          delete saved.on
          if (typeof saved.useApertureCoC !== 'boolean') {
            saved.useApertureCoC = true
          }
          setDof(mergeObj(latest.current.dof, saved))
        }
        if (s.clouds) {
          const saved = { ...s.clouds }
          // Same shape change for clouds: `clouds.on=false` → coverage=0.
          if (saved.on === false) {
            saved.coverage = 0
          }
          delete saved.on
          setClouds(mergeObj(latest.current.clouds, saved))
        }
        if (s.bloom) setBloom(mergeObj(latest.current.bloom, s.bloom))
        if (s.ssao) setSsao(mergeObj(latest.current.ssao, s.ssao))
        if (s.vignette) setVignette(mergeObj(latest.current.vignette, s.vignette))
      }

      if (data.ui) {
        const u = data.ui
        if ('fillMode' in u) setFillMode(!!u.fillMode)
        // Mirror to body class IMMEDIATELY (in this useLayoutEffect, before
        // the first paint) so a restored fillMode=true session doesn't flash
        // the un-filled chrome for a frame before MockEditorShell's
        // useAspectSync catches up. The class name MUST match what
        // useAspectSync uses ('mock-fill-mode'); the legacy editor's
        // 'fill-mode' class targeted the sidebar shell's #main and stuck
        // around forever once set, since the new shell's toggle never
        // touched it.
        if ('fillMode' in u) {
          try {
            document.body.classList.toggle('mock-fill-mode', !!u.fillMode)
          } catch (e) {}
        }
        if (typeof u.aspectRatio === 'number') setAspectRatio(u.aspectRatio)
        else if (typeof u.aspectRatio === 'string') {
          const n = parseFloat(u.aspectRatio)
          if (!isNaN(n)) setAspectRatio(n)
        }
        if (u.textFields) setTextFields(mergeObj(latest.current.textFields, u.textFields))
        if ('todUnlocked' in u) setTodUnlocked(!!u.todUnlocked)
        // Guard with typeof check so old session blobs that pre-date this
        // field don't overwrite the default with `undefined`.
        if (typeof u.savedViewMarkersOn === 'boolean') {
          setSavedViewMarkersOn(u.savedViewMarkersOn)
        }
        if (typeof u.defaultSavedViewId === 'string' || u.defaultSavedViewId === null) {
          setDefaultSavedViewId(u.defaultSavedViewId)
        }
        if (typeof u.onboarded === 'boolean') {
          setOnboarded(u.onboarded)
        }
        if (typeof u.aiCleanArtifacts === 'boolean') {
          setAiCleanArtifacts(u.aiCleanArtifacts)
        }
        if (typeof u.exportResolution === 'number' && [1, 2, 3, 4, 6].includes(u.exportResolution)) {
          setExportResolution(u.exportResolution)
        }
        if (typeof u.aiPrompt === 'string') {
          setAiPrompt(u.aiPrompt)
        }
      }

      // Camera is rehydrated directly by Scene's useLayoutEffect reading
      // the same session blob — that runs before the first R3F frame so
      // there's no visible "reset to default then move to saved" flash.
      // The fov slider atom still needs an event so the Controls hook
      // aligns the DoF tightness etc.; fire it after a tick.
      if (data.camera && typeof data.camera.fovMm === 'number') {
        setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent('fov-change', { detail: data.camera.fovMm }))
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
        textFields: { ...v.textFields },
        todUnlocked: !!v.todUnlocked,
        savedViewMarkersOn: !!v.savedViewMarkersOn,
        defaultSavedViewId: v.defaultSavedViewId ?? null,
        onboarded: !!v.onboarded,
        aiCleanArtifacts: !!v.aiCleanArtifacts,
        exportResolution: v.exportResolution,
        aiPrompt: typeof v.aiPrompt === 'string' ? v.aiPrompt : undefined,
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
    clouds, dof, todUnlocked, fillMode, aspectRatio,
    textFields, savedViewMarkersOn, defaultSavedViewId, onboarded,
    aiCleanArtifacts, exportResolution, aiPrompt,
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

  // GlobeControls drag-to-orbit + WASD fly don't fire camera-set events —
  // they mutate camera.position/quaternion directly every frame. Poll the
  // registered camera at 1Hz and persist if anything moved by more than a
  // pixel-equivalent threshold. Gated on `restored.current` so we don't
  // clobber the saved session with defaults during the mount race.
  useEffect(() => {
    let last = null
    const POS_EPSILON = 0.5 // meters in ECEF — smaller than a pixel at any altitude
    const QUAT_EPSILON = 1e-4
    const tick = () => {
      if (!restored.current || !_camera) return
      const p = _camera.position, q = _camera.quaternion
      if (last) {
        const posMoved =
          Math.abs(p.x - last.px) > POS_EPSILON ||
          Math.abs(p.y - last.py) > POS_EPSILON ||
          Math.abs(p.z - last.pz) > POS_EPSILON
        const quatMoved =
          Math.abs(q.x - last.qx) > QUAT_EPSILON ||
          Math.abs(q.y - last.qy) > QUAT_EPSILON ||
          Math.abs(q.z - last.qz) > QUAT_EPSILON ||
          Math.abs(q.w - last.qw) > QUAT_EPSILON
        if (posMoved || quatMoved) writeNow()
      }
      last = { px: p.x, py: p.y, pz: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w }
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Last-chance save: capture the current camera before the tab is hidden
  // or the page unloads. Guarantees the final mouse-drag position survives
  // even if the user closes the tab mid-debounce.
  useEffect(() => {
    const onFlush = () => { if (restored.current) writeNow() }
    // visibilitychange fires when the tab is hidden (mobile lock, tab
    // switch, etc.) — flush so we don't lose state on backgrounding.
    // Hoisted so we can actually remove it on cleanup; the previous
    // anonymous form leaked one listener per mount cycle (StrictMode +
    // HMR + tests).
    const onVis = () => { if (document.visibilityState === 'hidden') onFlush() }
    window.addEventListener('beforeunload', onFlush)
    window.addEventListener('pagehide', onFlush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', onFlush)
      window.removeEventListener('pagehide', onFlush)
      document.removeEventListener('visibilitychange', onVis)
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
