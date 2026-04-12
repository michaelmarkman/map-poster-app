import React, { useRef, useLayoutEffect, useMemo, forwardRef, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './lib/error-boundary.jsx'
import { toastSuccess, toastError, toastInfo } from './lib/toasts.js'
import { initKeyboardShortcuts } from './lib/keyboard-shortcuts.js'
import { startOnboarding } from './lib/onboarding.js'
import { shouldWatermark, applyWatermark, canSaveView, canExportScale, showUpgradePrompt } from './lib/pricing.js'
import { showPrintExport } from './lib/print-export.js'
import { fireConfetti } from './lib/confetti.js'
import { initCameraHistory } from './lib/camera-history.js'
import { initCompareMode } from './lib/compare-mode.js'
import { initGalleryKeyboard } from './lib/gallery-keyboard.js'
import { initSceneSuggestions } from './lib/scene-suggestions.js'
import { initTheme } from './lib/theme.js'
import { initCollab } from './collab.jsx'
import { initVersionHistory } from './version-history.jsx'
import { initAIDescribe } from './ai-describe.jsx'
import { initSeasonalPresets } from './seasonal-presets.jsx'
import { initMockup } from './poster-mockup.jsx'
import { initEditor, compositeExport, isEditorActive } from './editor-overlay.jsx'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping, Bloom, Vignette, SSAO } from '@react-three/postprocessing'
import { EffectComposer as WrappedEffectComposer } from '@react-three/postprocessing'
import {
  NormalPass, EffectMaterial, EffectAttribute, BlendFunction, Effect,
  ToneMappingMode
} from 'postprocessing'
import { HalfFloatType, Uniform, Vector2, Vector3, Quaternion, Raycaster as RaycasterClass } from 'three'

import { GlobeControls, TilesRenderer, TilesPlugin, TilesAttributionOverlay } from '3d-tiles-renderer/r3f'
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, TileCompressionPlugin, TilesFadePlugin, UpdateOnChangePlugin } from '3d-tiles-renderer/plugins'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { Mesh, BufferGeometry } from 'three'

import { Atmosphere, AerialPerspective } from '@takram/three-atmosphere/r3f'
import { Clouds } from '@takram/three-clouds/r3f'
import { Geodetic, PointOfView, radians, Ellipsoid } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

// ─── Config ──────────────────────────────────────────────────
const API_KEY = localStorage.getItem('mapposter_google_key') || 'AIzaSyCIsBRv6ZcKXhIecWHAOOLkwmLKQcsocKg'  // Google 3D Tiles — client-side OK; do NOT use for Gemini

// One-time cleanup: an earlier build cached a Gemini key in localStorage.
// That key now lives server-side in /api/gemini — purge any stale local copies.
try { localStorage.removeItem('mapposter3d_gemini_key') } catch (e) {}
const EXPOSURE = 10

// ?reset=1|true|yes → clear all mapposter3d_* localStorage and reload clean
{
  const _resetParam = new URLSearchParams(location.search).get('reset')
  if (_resetParam === '1' || _resetParam === 'true' || _resetParam === 'yes') {
    Object.keys(localStorage).filter(k => k.startsWith('mapposter3d_')).forEach(k => localStorage.removeItem(k))
    location.replace(location.pathname)
  }
}

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

// Reused scratch vector for the sun-rotation zenith calculation (avoids per-frame alloc)
const _sunZenith = new Vector3()

// ─── Mutable state (no re-renders) ──────────────────────────
const state = {
  timeOfDay: 12,
  latitude: 40.748440,
  longitude: -73.985664,
  sunRotation: 0, // degrees — stylistic rotation of the sun's path around the local zenith
  bloom: { on: false },
  ssao: { on: false },
  vignette: { on: false },
  clouds: { on: true, coverage: 0.2, shadows: true, paused: false, speed: 1 },
  dof: {
    on: true,
    focalUV: [0.5, 0.5],
    tightness: 70,
    blur: 25,
    colorPop: 60,
    globalPop: false
  }
}

// ─── Custom EffectComposer (HalfFloat normal buffer) ─────────
function EffectComposer({ children, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const composer = ref.current
    if (!composer) return
    for (const pass of composer.passes) {
      if (pass instanceof NormalPass) {
        pass.renderTarget.texture.type = HalfFloatType
        pass.renderTarget.texture.needsUpdate = true
        break
      }
    }
  }, [])
  return (
    <WrappedEffectComposer ref={ref} enableNormalPass {...props}>
      {children}
    </WrappedEffectComposer>
  )
}

// ─── Creased Normals Plugin ──────────────────────────────────
class TileCreasedNormalsPlugin {
  constructor({ creaseAngle = 30 * Math.PI / 180 } = {}) {
    this.creaseAngle = creaseAngle
  }
  processTileModel(scene) {
    scene.traverse(obj => {
      if (obj instanceof Mesh && obj.geometry instanceof BufferGeometry) {
        try { obj.geometry = toCreasedNormals(obj.geometry, this.creaseAngle) } catch (e) {}
      }
    })
  }
}

// ─── Texture Anisotropy Plugin (crisp tile textures) ────────
class TextureAnisotropyPlugin {
  constructor({ anisotropy = 16 } = {}) {
    this.anisotropy = anisotropy
  }
  processTileModel(scene) {
    scene.traverse(obj => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of mats) {
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
            const tex = mat[key]
            if (tex) {
              tex.anisotropy = this.anisotropy
              tex.needsUpdate = true
            }
          }
        }
      }
    })
  }
}

// ─── Globe ───────────────────────────────────────────────────
// Plugin that tunes fidelity-related tile renderer options:
// - Patches setResolutionFromRenderer to use true framebuffer size (dpr-aware)
// - Bumps LRU cache so detailed tiles aren't evicted
// - Keeps active tiles loaded even when partially off-frustum
class FidelityPlugin {
  constructor() {
    this._v = new Vector2()
  }
  init(tiles) {
    const self = this
    tiles.setResolutionFromRenderer = function(camera, renderer) {
      renderer.getDrawingBufferSize(self._v)
      return this.setResolution(camera, self._v.x, self._v.y)
    }
    // Bigger cache — keep more detailed tiles in memory
    tiles.lruCache.minSize = 12000
    tiles.lruCache.maxSize = 16000
    tiles.lruCache.minBytesSize = 0.8 * 1024 * 1024 * 1024 // 0.8 GB
    tiles.lruCache.maxBytesSize = 1.2 * 1024 * 1024 * 1024 // 1.2 GB
    // Don't unload tiles just because they scroll off-screen briefly
    tiles.displayActiveTiles = true
  }
}

function Globe({ children }) {
  return (
    <TilesRenderer key={API_KEY} url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${API_KEY}`} errorTarget={2}>
      <TilesPlugin plugin={FidelityPlugin} />
      <TilesPlugin plugin={GoogleCloudAuthPlugin} args={{ apiToken: API_KEY, autoRefreshToken: true }} />
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <TilesPlugin plugin={TileCreasedNormalsPlugin} args={{ creaseAngle: 30 * Math.PI / 180 }} />
      <TilesPlugin plugin={TextureAnisotropyPlugin} args={{ anisotropy: 16 }} />
      {children}
    </TilesRenderer>
  )
}

// ─── Custom DoF Shader ───────────────────────────────────────
const DOF_FRAG = /* glsl */`
#define getViewZ(d) perspectiveDepthToViewZ(d, cameraNear, cameraFar)
uniform vec2 focalPoint;
uniform float depthRange;
uniform float maxBlur;
uniform float colorPop;
uniform float globalPop;

// Multi-ring disk sampler — concentric rings of samples for smooth bokeh
// 1 + 8 + 16 + 24 + 32 = 81 samples in a circular pattern
vec4 ringBlur(vec2 uv, float radius) {
  vec2 texelSize = 1.0 / vec2(textureSize(inputBuffer, 0));
  vec4 sum = texture(inputBuffer, uv);
  float tw = 1.0;

  // 4 rings with increasing sample count (8, 16, 24, 32)
  const int RING_COUNTS[4] = int[](8, 16, 24, 32);
  const float RING_RADII[4] = float[](0.25, 0.5, 0.75, 1.0);

  for (int r = 0; r < 4; r++) {
    int count = RING_COUNTS[r];
    float ringRadius = RING_RADII[r] * radius;
    float weight = 1.0 - RING_RADII[r] * 0.5; // outer rings weighted slightly less
    for (int i = 0; i < count; i++) {
      float angle = 6.2831853 * float(i) / float(count) + float(r) * 0.5;
      vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius * texelSize;
      sum += texture(inputBuffer, uv + offset) * weight;
      tw += weight;
    }
  }
  return sum / tw;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float rawDepth = readDepth(uv);
  float focalRaw = readDepth(focalPoint);

  if (focalRaw >= 1.0) { outputColor = inputColor; return; }

  if (rawDepth >= 1.0) {
    outputColor = ringBlur(uv, maxBlur);
    return;
  }

  float viewZ = getViewZ(rawDepth);
  float focalZ = getViewZ(focalRaw);
  float relDiff = abs(viewZ - focalZ) / abs(focalZ);
  float coc = smoothstep(0.0, depthRange, relDiff) * maxBlur;

  vec4 color = inputColor;
  if (coc >= 0.5) {
    color = ringBlur(uv, coc);
  }

  // Color pop — applied to focus zone (or everywhere if globalPop)
  float focusAmount = 1.0 - smoothstep(0.0, depthRange, relDiff);
  float popMask = mix(focusAmount, 1.0, globalPop);
  float pop = popMask * colorPop;
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

  // Saturation boost
  color.rgb = mix(vec3(luma), color.rgb, 1.0 + pop * 0.8);

  // Gentle contrast lift (protect shadows)
  float shadow = smoothstep(0.0, 0.3, luma);
  color.rgb = mix(color.rgb, mix(vec3(0.5), color.rgb, 1.0 + pop * 0.3), shadow);

  // Subtle warm shift
  color.r += pop * 0.015 * shadow;
  color.g += pop * 0.008 * shadow;

  // Desaturate blurred areas
  float blurAmt = 1.0 - focusAmount;
  color.rgb = mix(color.rgb, vec3(dot(color.rgb, vec3(0.299, 0.587, 0.114))), blurAmt * 0.12);

  outputColor = color;
}
`;

class CustomDofEffect extends Effect {
  constructor() {
    super('CustomDofEffect', DOF_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['focalPoint', new Uniform(new Vector2(0.5, 0.5))],
        ['depthRange', new Uniform(1.5)],
        ['maxBlur', new Uniform(20)],
        ['colorPop', new Uniform(0.5)],
        ['globalPop', new Uniform(0.0)]
      ])
    })
  }
}

const CustomDof = forwardRef(function CustomDof(_, ref) {
  const effect = useMemo(() => new CustomDofEffect(), [])
  React.useImperativeHandle(ref, () => effect, [effect])
  return <primitive object={effect} dispose={null} />
})

// ─── Subject coordinate listener ────────────────────────────
// Raycasts from the center of the screen to find what the camera is actually
// looking at (the subject), then converts the hit point to lat/lng. Used by
// Time Machine to research the subject rather than the camera's GPS position.
function SubjectListener() {
  const { camera, scene } = useThree()
  const raycaster = useRef(new RaycasterClass())
  const centerNDC = useRef(new Vector2(0, 0))

  useEffect(() => {
    const handler = (e) => {
      const resolve = e.detail?.resolve
      if (!resolve) return
      raycaster.current.setFromCamera(centerNDC.current, camera)
      const hits = raycaster.current.intersectObjects(scene.children, true)
      if (!hits.length) { resolve(null); return }
      try {
        const geo = new Geodetic().setFromECEF(hits[0].point)
        resolve({
          lat: geo.latitude * 180 / Math.PI,
          lng: geo.longitude * 180 / Math.PI,
        })
      } catch (err) {
        resolve(null)
      }
    }
    window.addEventListener('get-subject-coords', handler)
    return () => window.removeEventListener('get-subject-coords', handler)
  }, [camera, scene])

  return null
}

// ─── Click-to-focus ──────────────────────────────────────────
function ClickToFocus() {
  const { gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    let downPos = null
    const onDown = (e) => { downPos = { x: e.clientX, y: e.clientY } }
    const onUp = (e) => {
      if (!downPos || !state.dof.on) return
      const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y
      downPos = null
      if (Math.sqrt(dx * dx + dy * dy) > 8) return
      const rect = canvas.getBoundingClientRect()
      state.dof.focalUV = [
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height
      ]
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    return () => { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp) }
  }, [gl])
  return null
}

// ─── Date helper ─────────────────────────────────────────────
function getDateFromHour(hour, longitude) {
  const year = new Date().getFullYear()
  const dayOfYear = Math.floor((Date.now() - Date.UTC(year, 0, 1)) / 86400000) + 1
  const epoch = Date.UTC(year, 0, 1)
  const offset = longitude / 15
  return new Date(epoch + (dayOfYear * 24 + hour - offset) * 3600000)
}

// Approximate sunrise/sunset for a given latitude (civil twilight, ~6° below horizon)
// Returns { sunrise, sunset } in decimal hours (local solar time)
function getSunTimes(lat) {
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getFullYear(), 0, 1)) / 86400000) + 1
  // Solar declination (approximate)
  const decl = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81))
  const declRad = decl * Math.PI / 180
  const latRad = lat * Math.PI / 180
  // Hour angle for civil twilight (-6°)
  const zenith = (90 + 6) * Math.PI / 180
  const cosH = (Math.cos(zenith) - Math.sin(latRad) * Math.sin(declRad)) / (Math.cos(latRad) * Math.cos(declRad))
  if (cosH > 1) return { sunrise: 6, sunset: 18 } // sun never rises (polar night)
  if (cosH < -1) return { sunrise: 0, sunset: 24 } // midnight sun
  const H = Math.acos(cosH) * 180 / Math.PI / 15 // hours
  const sunrise = Math.max(0, Math.round((12 - H) * 4) / 4) // round to 15min
  const sunset = Math.min(24, Math.round((12 + H) * 4) / 4)
  return { sunrise, sunset }
}

function updateTodSliderRange() {
  const { sunrise, sunset } = getSunTimes(state.latitude)
  const min = sunrise + 0.5
  const max = sunset - 0.5
  const slider = document.getElementById('tod-slider')
  if (!slider) return
  slider.min = min
  slider.max = max
  const val = +slider.value
  if (val < min) { slider.value = min; state.timeOfDay = min }
  if (val > max) { slider.value = max; state.timeOfDay = max }
}

// ─── Scene ───────────────────────────────────────────────────
function Scene() {
  const camera = useThree(({ camera }) => camera)
  const composerRef = useRef(null)
  const atmosphereRef = useRef(null)
  const dofRef = useRef(null)
  const [, forceRender] = useState(0)
  const cloudsRef = useRef(null)
  const aerialRef = useRef(null)

  // Initial camera — East Village NYC (or restore from session)
  useLayoutEffect(() => {
    if (window._posterRestore && window._posterRestore(camera)) {
      // Restored from session
    } else {
      // Empire State Building, NY. Target is aimed at the building's mid-height (190m above base)
      // so the shader DoF (which samples depth at screen center = focalUV [0.5,0.5]) focuses on
      // the building rather than the ground. Distance is chosen so the eye altitude works out to 700m:
      //   eye.alt - target.h = distance * sin(|pitch|) = distance * 0.5
      //   (700 - 190) = 510 = 1020 * 0.5  →  distance = 1020
      // takram's PointOfView uses (distance, heading, pitch): heading measured from east so library
      // heading 70° → UI heading 90°-70°=20° (NNE), pitch -30° → UI tilt 60°.
      new PointOfView(1020, radians(70), radians(-30)).decompose(
        new Geodetic(radians(-73.985664), radians(40.748440), 190).toECEF(),
        camera.position, camera.quaternion, camera.up
      )
    }
  }, [camera])

  // Listen for save-session events
  useEffect(() => {
    const handler = () => { if (window._posterSave) window._posterSave(camera) }
    window.addEventListener('save-session', handler)
    return () => window.removeEventListener('save-session', handler)
  }, [camera])

  // Re-render when effects are toggled
  useEffect(() => {
    const handler = () => forceRender(n => n + 1)
    window.addEventListener('effects-changed', handler)
    return () => window.removeEventListener('effects-changed', handler)
  }, [])

  // Listen for fly-to events (from location search) — smooth animation
  const flyRef = useRef(null) // { startPos, startQuat, startUp, endPos, endQuat, endUp, progress }

  useEffect(() => {
    const handler = (e) => {
      const { lat, lng } = e.detail

      // Compute target camera state — nice default angle
      const endPos = new Vector3()
      const endQuat = new Quaternion()
      const endUp = new Vector3()
      new PointOfView(500, radians(45), radians(-35)).decompose(
        new Geodetic(radians(lng), radians(lat)).toECEF(),
        endPos, endQuat, endUp
      )

      flyRef.current = {
        startPos: camera.position.clone(),
        startQuat: camera.quaternion.clone(),
        startUp: camera.up.clone(),
        endPos, endQuat, endUp,
        progress: 0
      }
    }
    window.addEventListener('fly-to', handler)
    return () => window.removeEventListener('fly-to', handler)
  }, [camera])

  // Listen for camera-set events (tilt/heading/altitude sliders)
  useEffect(() => {
    const handler = (e) => {
      const { tilt, heading, altitude } = e.detail
      // Current lat/lng from camera position
      const geo = new Geodetic().setFromECEF(camera.position)
      // Place eye at (same lat/lng, new altitude)
      const newEye = new Geodetic(geo.longitude, geo.latitude, altitude).toECEF()

      // Local east/north/up at eye
      const up = newEye.clone().normalize()
      const pole = new Vector3(0, 0, 1)
      const east = new Vector3().crossVectors(pole, up).normalize()
      const north = new Vector3().crossVectors(up, east).normalize()

      // Compass heading: 0=N, 90=E. Horizontal direction:
      const hRad = radians(heading)
      const horizDir = new Vector3()
        .addScaledVector(north, Math.cos(hRad))
        .addScaledVector(east, Math.sin(hRad))

      // Tilt 0 = straight down, 90 = horizon
      // Angle below horizon = 90 - tilt
      const belowHorizon = radians(90 - tilt)
      const lookDir = new Vector3()
        .addScaledVector(horizDir, Math.cos(belowHorizon))
        .addScaledVector(up, -Math.sin(belowHorizon))
        .normalize()

      camera.position.copy(newEye)
      camera.up.copy(up)
      camera.lookAt(newEye.clone().add(lookDir.multiplyScalar(1000)))
    }
    window.addEventListener('camera-set', handler)
    return () => window.removeEventListener('camera-set', handler)
  }, [camera])

  useFrame(({ gl }, delta) => {
    // Animate fly-to
    const fly = flyRef.current
    if (fly && fly.progress < 1) {
      fly.progress = Math.min(1, fly.progress + delta / 2) // 2 second duration
      // Smoothstep ease
      const t = fly.progress
      const s = t * t * (3 - 2 * t)
      camera.position.lerpVectors(fly.startPos, fly.endPos, s)
      camera.quaternion.slerpQuaternions(fly.startQuat, fly.endQuat, s)
      camera.up.lerpVectors(fly.startUp, fly.endUp, s)
      if (fly.progress >= 1) flyRef.current = null
    }

    gl.toneMappingExposure = EXPOSURE

    // Update longitude/latitude from current camera position so sun tracks the place you're flying over
    try {
      const geo = new Geodetic().setFromECEF(camera.position)
      state.longitude = geo.longitude * 180 / Math.PI
      state.latitude = geo.latitude * 180 / Math.PI
    } catch (e) {}

    // Update atmosphere from time slider
    const date = getDateFromHour(state.timeOfDay, state.longitude)
    atmosphereRef.current?.updateByDate(date)

    // Stylistic sun rotation — rotate the sun's direction around the local zenith
    // (surface normal at the camera's current position). This shifts where the sun
    // rises and sets in the sky without changing its elevation arc.
    if (atmosphereRef.current?.sunDirection && state.sunRotation !== 0) {
      const zenith = _sunZenith.copy(camera.position).normalize()
      Ellipsoid.WGS84.getSurfaceNormal(camera.position, zenith)
      atmosphereRef.current.sunDirection.applyAxisAngle(zenith, state.sunRotation * Math.PI / 180)
    }

    // Update clouds
    const clouds = cloudsRef.current
    window._cloudsRef = clouds
    if (clouds) {
      clouds.coverage = state.clouds.on ? state.clouds.coverage : 0
      const spd = state.clouds.paused ? 0 : state.clouds.speed * 0.001
      clouds.localWeatherVelocity.set(spd, 0)
    }
    // Toggle cloud shadows on aerial perspective
    const aerial = aerialRef.current
    if (aerial) {
      if (!state.clouds.shadows) {
        aerial.shadow = null
      }
      // When shadows are on, the Clouds change event handler restores it automatically
    }

    // Update DoF uniforms
    const fx = dofRef.current
    if (fx && fx.uniforms) {
      // Color pop is independent of DoF and always applied. When DoF is off,
      // it's always global (no focus area to limit it to). When DoF is on,
      // the user's globalPop toggle decides limited-to-focus vs. whole scene.
      fx.uniforms.get('colorPop').value = state.dof.colorPop / 100
      if (!state.dof.on) {
        fx.uniforms.get('maxBlur').value = 0
        fx.uniforms.get('globalPop').value = 1.0
      } else {
        fx.uniforms.get('focalPoint').value.set(state.dof.focalUV[0], state.dof.focalUV[1])
        const t = state.dof.tightness / 100
        fx.uniforms.get('depthRange').value = 3.0 * (1.0 - t) * (1.0 - t) + 0.005
        fx.uniforms.get('maxBlur').value = 2 + (state.dof.blur / 100) * 48
        fx.uniforms.get('globalPop').value = state.dof.globalPop ? 1.0 : 0.0
      }
    }

    // Sync camera near/far into effects
    const composer = composerRef.current
    if (composer) {
      composer.passes.forEach(pass => {
        if (pass.fullscreenMaterial instanceof EffectMaterial) {
          pass.fullscreenMaterial.adoptCameraSettings(camera)
        }
      })
    }

    // Sync camera info to sidebar sliders
    syncCameraToUI(camera)
  })

  return (
    <Atmosphere ref={atmosphereRef} correctAltitude>
      <Globe>
        <GlobeControls enableDamping adjustHeight={false} maxAltitude={Math.PI * 0.55} />
      </Globe>
      <ClickToFocus />
      <SubjectListener />

      <EffectComposer ref={composerRef} multisampling={0}>
        <Clouds
          ref={cloudsRef}
          coverage={state.clouds.coverage}
          qualityPreset="high"
          shadow-farScale={0.25}
          localWeatherVelocity={[0.001, 0]}
        />
        <AerialPerspective ref={aerialRef} sky sunLight skyLight correctGeometricError albedoScale={2 / Math.PI} />
        {state.bloom.on && <Bloom intensity={0.5} luminanceThreshold={0.7} luminanceSmoothing={0.3} />}
        {state.ssao.on && <SSAO intensity={2} radius={0.05} luminanceInfluence={0.5} />}
        {state.vignette.on && <Vignette darkness={0.5} offset={0.3} />}
        <LensFlare />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <CustomDof ref={dofRef} />
        <SMAA />
        <Dithering />
      </EffectComposer>
    </Atmosphere>
  )
}

// ─── Sync camera → sidebar (runs in useFrame) ────────────────
let _lastSync = 0
let _currentTilt = 60, _currentHeading = 20, _currentAlt = 700
let _suppressSliderInput = false

// Log mapping for altitude slider: 0-1000 slider range → 100m-10000m altitude
const ALT_MIN = 100, ALT_MAX = 10000
function sliderToAlt(s) {
  const t = Math.max(0, Math.min(1000, s)) / 1000
  return ALT_MIN * Math.pow(ALT_MAX / ALT_MIN, t)
}
function altToSlider(alt) {
  const clamped = Math.max(ALT_MIN, Math.min(ALT_MAX, alt))
  return Math.round(1000 * Math.log(clamped / ALT_MIN) / Math.log(ALT_MAX / ALT_MIN))
}

function syncCameraToUI(camera) {
  const now = Date.now()
  if (now - _lastSync < 200) return
  _lastSync = now

  try {
    const pos = camera.position
    // Geodetic for altitude
    const geo = new Geodetic().setFromECEF(pos)
    const alt = Math.round(Math.max(0, geo.height))
    _currentAlt = alt

    // Compute local up at camera position (radial out from earth center)
    const up = pos.clone().normalize()

    // Camera forward direction
    const fwd = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize()

    // Tilt: angle between camera-down and forward (0 = straight down, 90 = horizon)
    const downDot = fwd.dot(up.clone().negate())
    const tilt = Math.round(Math.acos(Math.max(-1, Math.min(1, downDot))) * 180 / Math.PI)
    _currentTilt = Math.max(0, Math.min(90, tilt))

    // Heading: project forward onto local tangent plane, measure azimuth
    // East = (north pole × up).normalize()
    const pole = new Vector3(0, 0, 1)
    const east = new Vector3().crossVectors(pole, up).normalize()
    const north = new Vector3().crossVectors(up, east).normalize()
    const flatFwd = fwd.clone().sub(up.clone().multiplyScalar(fwd.dot(up))).normalize()
    const heading = Math.round(Math.atan2(flatFwd.dot(east), flatFwd.dot(north)) * 180 / Math.PI)
    _currentHeading = heading

    _suppressSliderInput = true
    const tiltVal = document.getElementById('tilt-val')
    if (tiltVal) tiltVal.textContent = _currentTilt + '\u00b0'
    const tiltSlider = document.getElementById('tilt-slider')
    if (tiltSlider) tiltSlider.value = _currentTilt

    const headingVal = document.getElementById('heading-val')
    if (headingVal) headingVal.textContent = heading + '\u00b0'
    const headingSlider = document.getElementById('heading-slider')
    if (headingSlider) headingSlider.value = heading

    const el = document.getElementById('range-val')
    if (el) el.textContent = alt.toLocaleString() + 'm'
    const rs = document.getElementById('range-slider')
    if (rs) rs.value = altToSlider(alt)

    // FOV → focal length
    const fov = camera.fov
    const mm = Math.round(12 / Math.tan(fov * Math.PI / 360))
    const fovVal = document.getElementById('fov-val')
    if (fovVal) fovVal.textContent = Math.max(14, Math.min(200, mm)) + 'mm'
    const fovSlider = document.getElementById('fov-slider')
    if (fovSlider) fovSlider.value = Math.max(14, Math.min(200, mm))
    _suppressSliderInput = false
  } catch (e) {}
}

// Dispatch camera-set event with desired tilt/heading/alt
function dispatchCameraSet(partial) {
  if (_suppressSliderInput) return
  window.dispatchEvent(new CustomEvent('camera-set', {
    detail: {
      tilt: partial.tilt ?? _currentTilt,
      heading: partial.heading ?? _currentHeading,
      altitude: partial.altitude ?? _currentAlt
    }
  }))
}

// ─── Wire sidebar controls ──────────────────────────────────
function wireUI() {
  // Hide API key prompt (we auto-load)
  const prompt = document.getElementById('api-key-prompt')
  if (prompt) prompt.style.display = 'none'

  // Status
  const status = document.getElementById('status')
  if (status) { status.textContent = 'Loading 3D tiles...'; setTimeout(() => { status.style.opacity = '0' }, 5000) }

  // Save view button
  document.getElementById('save-view-btn')?.addEventListener('click', () => {
    window.dispatchEvent(new Event('save-view'))
  })

  // Camera tilt/heading/altitude sliders
  document.getElementById('tilt-slider')?.addEventListener('input', (e) => {
    document.getElementById('tilt-val').textContent = e.target.value + '\u00b0'
    dispatchCameraSet({ tilt: +e.target.value })
  })
  document.getElementById('heading-slider')?.addEventListener('input', (e) => {
    document.getElementById('heading-val').textContent = e.target.value + '\u00b0'
    dispatchCameraSet({ heading: +e.target.value })
  })
  document.getElementById('range-slider')?.addEventListener('input', (e) => {
    const alt = sliderToAlt(+e.target.value)
    document.getElementById('range-val').textContent = Math.round(alt).toLocaleString() + 'm'
    dispatchCameraSet({ altitude: alt })
  })

  // Location search — Enter to geocode + fly
  document.getElementById('location-search')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    const query = e.target.value.trim()
    if (!query) return

    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, {
      headers: { 'User-Agent': 'MapPoster/1.0' }
    })
      .then(r => r.json())
      .then(results => {
        if (!results?.length) { alert('Location not found'); return }
        const lat = +results[0].lat
        const lng = +results[0].lon
        const name = results[0].display_name
        e.target.value = name

        // Adjust time of day to new location's local time
        const oldOffset = state.longitude / 15
        const newOffset = lng / 15
        const adjustedTime = state.timeOfDay + (newOffset - oldOffset)
        const wrappedTime = ((adjustedTime % 24) + 24) % 24

        state.latitude = lat
        state.longitude = lng
        updateTodSliderRange()

        // Apply adjusted time (clamped to sunrise/sunset)
        const { sunrise, sunset } = getSunTimes(lat)
        state.timeOfDay = Math.max(sunrise + 0.5, Math.min(sunset - 0.5, wrappedTime))
        const todSlider = document.getElementById('tod-slider')
        const todVal = document.getElementById('tod-val')
        if (todSlider) todSlider.value = state.timeOfDay
        const fmt = (h) => { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); const ap = hh >= 12 ? 'PM' : 'AM'; const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh; return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap }
        if (todVal) todVal.textContent = fmt(state.timeOfDay)

        // Dispatch fly-to for the R3F scene
        window.dispatchEvent(new CustomEvent('fly-to', { detail: { lat, lng } }))

        // Update text overlay
        const titleEl = document.getElementById('text-title')
        const overlayTitle = document.getElementById('overlay-title')
        const coordsInput = document.getElementById('text-coords')
        const overlayCoords = document.getElementById('overlay-coords')
        const shortName = name.split(',')[0]
        if (titleEl) titleEl.value = shortName
        if (overlayTitle) overlayTitle.textContent = shortName
        const coordStr = Math.abs(lat).toFixed(4) + '\u00b0 ' + (lat >= 0 ? 'N' : 'S') + ', ' +
          Math.abs(lng).toFixed(4) + '\u00b0 ' + (lng >= 0 ? 'E' : 'W')
        if (coordsInput) coordsInput.value = coordStr
        if (overlayCoords) overlayCoords.textContent = coordStr
      })
      .catch(() => alert('Geocoding failed'))
  })

  // Time of day
  const todSlider = document.getElementById('tod-slider')
  const todVal = document.getElementById('tod-val')
  if (todSlider) {
    todSlider.value = state.timeOfDay
    const fmt = (h) => { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); const ap = hh >= 12 ? 'PM' : 'AM'; const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh; return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap }
    if (todVal) todVal.textContent = fmt(state.timeOfDay)
    todSlider.addEventListener('input', (e) => {
      state.timeOfDay = +e.target.value
      if (todVal) todVal.textContent = fmt(+e.target.value)
    })
    updateTodSliderRange()
  }

  // Sun rotation — stylistic azimuth offset applied around the local zenith
  const sunRotSlider = document.getElementById('sun-rot-slider')
  const sunRotVal = document.getElementById('sun-rot-val')
  if (sunRotSlider) {
    sunRotSlider.value = state.sunRotation
    if (sunRotVal) sunRotVal.textContent = state.sunRotation + '°'
    sunRotSlider.addEventListener('input', (e) => {
      state.sunRotation = +e.target.value
      if (sunRotVal) sunRotVal.textContent = e.target.value + '°'
    })
  }

  // DoF toggle
  const toggleDof = document.getElementById('toggle-dof')
  if (toggleDof) {
    toggleDof.addEventListener('click', function () {
      this.classList.toggle('on')
      state.dof.on = this.classList.contains('on')
    })
  }

  // DoF sliders — repurpose focus distance as tightness, blur as blur
  const dofFocusSlider = document.getElementById('dof-focus-slider')
  const dofFocusVal = document.getElementById('dof-focus-val')
  if (dofFocusSlider) {
    dofFocusSlider.min = 0; dofFocusSlider.max = 100; dofFocusSlider.step = 1; dofFocusSlider.value = state.dof.tightness
    if (dofFocusVal) dofFocusVal.textContent = state.dof.tightness + '%'
    // Update label
    const label = dofFocusSlider.closest('.control-row')?.querySelector('.control-label span:first-child')
    if (label) label.textContent = 'Focus tightness'
    dofFocusSlider.addEventListener('input', (e) => {
      state.dof.tightness = +e.target.value
      if (dofFocusVal) dofFocusVal.textContent = e.target.value + '%'
    })
  }

  const dofBlurSlider = document.getElementById('dof-blur-slider')
  const dofBlurVal = document.getElementById('dof-blur-val')
  if (dofBlurSlider) {
    dofBlurSlider.value = state.dof.blur
    if (dofBlurVal) dofBlurVal.textContent = state.dof.blur + '%'
    dofBlurSlider.addEventListener('input', (e) => {
      state.dof.blur = +e.target.value
      if (dofBlurVal) dofBlurVal.textContent = e.target.value + '%'
    })
  }

  // Color pop slider
  const dofPopSlider = document.getElementById('dof-pop-slider')
  const dofPopVal = document.getElementById('dof-pop-val')
  if (dofPopSlider) {
    dofPopSlider.value = state.dof.colorPop
    if (dofPopVal) dofPopVal.textContent = state.dof.colorPop + '%'
    dofPopSlider.addEventListener('input', (e) => {
      state.dof.colorPop = +e.target.value
      if (dofPopVal) dofPopVal.textContent = e.target.value + '%'
    })
  }

  // Global pop toggle
  const toggleGlobalPop = document.getElementById('toggle-global-pop')
  if (toggleGlobalPop) {
    toggleGlobalPop.addEventListener('click', function () {
      this.classList.toggle('on')
      state.dof.globalPop = this.classList.contains('on')
    })
  }

  // Bloom toggle
  document.getElementById('toggle-bloom')?.addEventListener('click', function () {
    this.classList.toggle('on')
    state.bloom.on = this.classList.contains('on')
    window.dispatchEvent(new Event('effects-changed'))
  })

  // SSAO toggle
  document.getElementById('toggle-ssao')?.addEventListener('click', function () {
    this.classList.toggle('on')
    state.ssao.on = this.classList.contains('on')
    window.dispatchEvent(new Event('effects-changed'))
  })

  // Vignette toggle
  document.getElementById('toggle-vignette')?.addEventListener('click', function () {
    this.classList.toggle('on')
    state.vignette.on = this.classList.contains('on')
    window.dispatchEvent(new Event('effects-changed'))
  })

  // Clouds toggle — reflect current state.clouds.on (default: on)
  const toggleClouds = document.getElementById('toggle-clouds')
  if (toggleClouds) {
    toggleClouds.classList.toggle('on', !!state.clouds.on)
    toggleClouds.addEventListener('click', function () {
      this.classList.toggle('on')
      state.clouds.on = this.classList.contains('on')
    })
  }

  // Cloud coverage — sync initial slider/label from state
  const cloudCoverageSlider = document.getElementById('cloud-coverage-slider')
  const cloudCoverageVal = document.getElementById('cloud-coverage-val')
  if (cloudCoverageSlider) {
    cloudCoverageSlider.value = Math.round(state.clouds.coverage * 100)
    if (cloudCoverageVal) cloudCoverageVal.textContent = Math.round(state.clouds.coverage * 100) + '%'
    cloudCoverageSlider.addEventListener('input', (e) => {
      const v = +e.target.value
      state.clouds.coverage = v / 100
      if (cloudCoverageVal) cloudCoverageVal.textContent = v + '%'
    })
  }

  // Cloud speed (-10 rewind → 10 fast-forward)
  document.getElementById('cloud-speed-slider')?.addEventListener('input', (e) => {
    const v = +e.target.value
    state.clouds.speed = v
    document.getElementById('cloud-speed-val').textContent = v + 'x'
  })

  // Skip ahead — jumps the weather offset forward
  document.getElementById('cloud-skip-btn')?.addEventListener('click', () => {
    const clouds = window._cloudsRef
    if (clouds) clouds.localWeatherOffset.x += 10
  })

  // Cloud shadows toggle
  const toggleShadows = document.getElementById('toggle-cloud-shadows')
  if (toggleShadows) {
    toggleShadows.addEventListener('click', function () {
      this.classList.toggle('on')
      state.clouds.shadows = this.classList.contains('on')
    })
  }

  // Pause clouds toggle
  const togglePause = document.getElementById('toggle-cloud-pause')
  if (togglePause) {
    togglePause.addEventListener('click', function () {
      this.classList.toggle('on')
      state.clouds.paused = this.classList.contains('on')
    })
  }

  // Text overlay toggle
  const toggleText = document.getElementById('toggle-text-overlay')
  if (toggleText) {
    toggleText.addEventListener('click', function () {
      this.classList.toggle('on')
      const overlay = document.getElementById('text-overlay')
      if (overlay) overlay.style.display = this.classList.contains('on') ? 'block' : 'none'
    })
  }

  // Text inputs
  document.getElementById('text-title')?.addEventListener('input', (e) => {
    const el = document.getElementById('overlay-title')
    if (el) el.textContent = e.target.value
  })
  document.getElementById('text-subtitle')?.addEventListener('input', (e) => {
    const el = document.getElementById('overlay-subtitle')
    if (el) el.textContent = e.target.value
  })
  document.getElementById('text-coords')?.addEventListener('input', (e) => {
    const el = document.getElementById('overlay-coords')
    if (el) el.textContent = e.target.value
  })

  // FOV slider
  document.getElementById('fov-slider')?.addEventListener('input', (e) => {
    const mm = +e.target.value
    document.getElementById('fov-val').textContent = mm + 'mm'
    window.dispatchEvent(new CustomEvent('fov-change', { detail: mm }))
  })

  // Size buttons — wire up pre-rendered chips (portrait + landscape grids + fill button)
  const container = document.getElementById('canvas-container')
  const fillBtn = document.getElementById('size-fill-btn')
  const allRatioBtns = document.querySelectorAll('#size-grid-portrait .size-btn, #size-grid-landscape .size-btn')
  const hudRatio = document.getElementById('hud-ratio')

  function clearActive() {
    document.querySelectorAll('.size-btn.active').forEach(b => b.classList.remove('active'))
    if (fillBtn) fillBtn.classList.remove('active')
  }

  allRatioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      clearActive()
      btn.classList.add('active')
      const ratio = parseFloat(btn.dataset.ratio)
      document.body.classList.remove('fill-mode')
      container.style.setProperty('--ratio', ratio)
      if (hudRatio) hudRatio.textContent = btn.textContent
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    })
  })

  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      clearActive()
      fillBtn.classList.add('active')
      document.body.classList.add('fill-mode')
      container.style.removeProperty('--ratio')
      if (hudRatio) hudRatio.textContent = 'Fill'
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
    })
  }

  // Initial HUD ratio from whichever button is marked active in the markup
  const initActive = document.querySelector('.size-btn.active')
  if (initActive && hudRatio) hudRatio.textContent = initActive.textContent

  // Force a resize once the container has non-zero dimensions. R3F uses ResizeObserver internally,
  // but dispatching a synthetic resize after two rAFs guarantees the renderer/camera re-measure
  // after the fill-mode CSS has been applied.
  if (container) {
    const nudge = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        window.dispatchEvent(new Event('resize'))
        return true
      }
      return false
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!nudge()) {
          // Container still 0×0; watch for the first non-zero size
          const ro = new ResizeObserver(() => {
            if (nudge()) ro.disconnect()
          })
          ro.observe(container)
        }
      })
    })
  }
}

// ─── WASD Flight Controls ────────────────────────────────────
function WasdFly() {
  const camera = useThree(({ camera }) => camera)
  const keysRef = useRef({})

  useEffect(() => {
    const onDown = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      keysRef.current[e.key.toLowerCase()] = true
    }
    const onUp = (e) => { keysRef.current[e.key.toLowerCase()] = false }
    const onBlur = () => { keysRef.current = {} }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useFrame((_, delta) => {
    const k = keysRef.current
    if (!k.w && !k.a && !k.s && !k.d && !k.q && !k.e && !k[' ']) return

    // Speed scales with altitude so flight feels natural
    const geo = new Geodetic().setFromECEF(camera.position)
    const alt = Math.max(100, geo.height)
    let speed = alt * 0.8 * delta
    if (k.shift) speed *= 4

    const up = camera.position.clone().normalize()
    const fwd = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
    // Flatten forward onto tangent plane — W/S don't change altitude
    const flatFwd = fwd.clone().sub(up.clone().multiplyScalar(fwd.dot(up))).normalize()
    const right = new Vector3().crossVectors(flatFwd, up).normalize()

    const move = new Vector3()
    if (k.w) move.addScaledVector(flatFwd, speed)
    if (k.s) move.addScaledVector(flatFwd, -speed)
    if (k.d) move.addScaledVector(right, speed)
    if (k.a) move.addScaledVector(right, -speed)
    if (k.e || k[' ']) move.addScaledVector(up, speed)
    if (k.q) move.addScaledVector(up, -speed)

    camera.position.add(move)
  })

  return null
}

// ─── FOV listener with dolly zoom ────────────────────────────
function FovListener() {
  const { camera, scene } = useThree()
  const raycaster = useRef(new RaycasterClass())
  const centerNDC = useRef(new Vector2(0, 0))

  useEffect(() => {
    const handler = (e) => {
      const mm = e.detail
      // Read current camera fov directly — don't cache it, since session restore
      // or saved views can change it without us knowing
      const oldFov = camera.fov
      const newFov = 2 * Math.atan(12 / mm) * 180 / Math.PI
      if (Math.abs(oldFov - newFov) < 0.01) return

      // Dolly zoom: raycast center of screen to find target point
      raycaster.current.setFromCamera(centerNDC.current, camera)
      const hits = raycaster.current.intersectObjects(scene.children, true)

      if (hits.length > 0) {
        const target = hits[0].point
        const oldDist = camera.position.distanceTo(target)
        // visible_size ∝ dist * tan(fov/2)
        // newDist = oldDist * tan(oldFov/2) / tan(newFov/2)
        const oldHalfRad = (oldFov * Math.PI / 180) / 2
        const newHalfRad = (newFov * Math.PI / 180) / 2
        const newDist = oldDist * Math.tan(oldHalfRad) / Math.tan(newHalfRad)

        // Move camera along the vector from target to camera
        const dir = camera.position.clone().sub(target).normalize()
        camera.position.copy(target).add(dir.multiplyScalar(newDist))
      }

      camera.fov = newFov
      camera.updateProjectionMatrix()

      // Adjust DoF tightness to match focal length (longer lens = shallower DoF)
      if (state.dof.on) {
        const focalScale = Math.sqrt(mm / 41)
        const newTightness = Math.round(Math.min(100, Math.max(50, 55 + 20 * focalScale)))
        state.dof.tightness = newTightness
        const slider = document.getElementById('dof-focus-slider')
        const val = document.getElementById('dof-focus-val')
        if (slider) slider.value = newTightness
        if (val) val.textContent = newTightness + '%'
      }
    }
    window.addEventListener('fov-change', handler)
    return () => window.removeEventListener('fov-change', handler)
  }, [camera, scene])

  return null
}

// ─── Saved Views (R3F component — has camera access) ────────
const VIEWS_KEY = 'mapposter3d_v2_views'

function SavedViewsHandler() {
  const { camera, gl } = useThree()

  useEffect(() => {
    const onSave = () => {
      const canvas = gl.domElement
      // Thumbnail
      const thumb = document.createElement('canvas')
      thumb.width = 96; thumb.height = 72
      thumb.getContext('2d').drawImage(canvas, 0, 0, 96, 72)

      // GPS coords from camera ECEF position
      const geo = new Geodetic().setFromECEF(camera.position)
      const lat = geo.latitude * 180 / Math.PI
      const lng = geo.longitude * 180 / Math.PI
      const coordName = Math.abs(lat).toFixed(3) + '\u00b0' + (lat >= 0 ? 'N' : 'S') + ' ' +
        Math.abs(lng).toFixed(3) + '\u00b0' + (lng >= 0 ? 'E' : 'W')

      const view = {
        id: Date.now(),
        name: coordName, // fallback until reverse geocoding resolves
        camera: {
          px: camera.position.x, py: camera.position.y, pz: camera.position.z,
          qx: camera.quaternion.x, qy: camera.quaternion.y,
          qz: camera.quaternion.z, qw: camera.quaternion.w,
          fov: camera.fov
        },
        tod: +(document.getElementById('tod-slider')?.value || 12),
        focalUV: [...state.dof.focalUV],
        dofTightness: state.dof.tightness,
        dofBlur: state.dof.blur,
        dofColorPop: state.dof.colorPop,
        thumbnail: thumb.toDataURL('image/jpeg', 0.6)
      }

      const views = loadSavedViews()
      views.unshift(view)
      if (views.length > 20) views.pop()
      storeSavedViews(views)
      renderSavedViews()

      // Reverse-geocode for a nicer name
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`, {
        headers: { 'User-Agent': 'MapPoster/1.0' }
      })
        .then(r => r.json())
        .then(data => {
          const addr = data.address || {}
          const name =
            addr.neighbourhood || addr.suburb || addr.quarter || addr.hamlet ||
            addr.village || addr.town || addr.city_district ||
            addr.city || addr.municipality ||
            (data.display_name || '').split(',')[0] ||
            coordName
          const list = loadSavedViews()
          const target = list.find(v => v.id === view.id)
          if (target) {
            target.name = name
            storeSavedViews(list)
            renderSavedViews()
          }
        })
        .catch(() => {})
    }

    const onRestore = (e) => {
      const v = e.detail
      if (!v?.camera) return
      camera.position.set(v.camera.px, v.camera.py, v.camera.pz)
      camera.quaternion.set(v.camera.qx, v.camera.qy, v.camera.qz, v.camera.qw)
      if (v.camera.fov) { camera.fov = v.camera.fov; camera.updateProjectionMatrix() }
      if (v.tod !== undefined) {
        // Update lat/lng from the restored camera first so sun calc + clamping uses the new place
        try {
          const g = new Geodetic().setFromECEF(camera.position)
          state.latitude = g.latitude * 180 / Math.PI
          state.longitude = g.longitude * 180 / Math.PI
        } catch (e) {}
        updateTodSliderRange()
        state.timeOfDay = v.tod
        const todSlider = document.getElementById('tod-slider')
        if (todSlider) todSlider.value = v.tod
        const todVal = document.getElementById('tod-val')
        if (todVal) {
          const h = v.tod
          const hh = Math.floor(h)
          const mm = Math.round((h - hh) * 60)
          const ap = hh >= 12 ? 'PM' : 'AM'
          const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
          todVal.textContent = h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap
        }
      }
      if (v.focalUV) state.dof.focalUV = [...v.focalUV]
      if (v.dofTightness !== undefined) {
        state.dof.tightness = v.dofTightness
        const s = document.getElementById('dof-focus-slider')
        if (s) { s.value = v.dofTightness; }
        const sv = document.getElementById('dof-focus-val')
        if (sv) sv.textContent = v.dofTightness + '%'
      }
      if (v.dofBlur !== undefined) {
        state.dof.blur = v.dofBlur
        const s = document.getElementById('dof-blur-slider')
        if (s) s.value = v.dofBlur
        const sv = document.getElementById('dof-blur-val')
        if (sv) sv.textContent = v.dofBlur + '%'
      }
      if (v.dofColorPop !== undefined) {
        state.dof.colorPop = v.dofColorPop
        const s = document.getElementById('dof-pop-slider')
        if (s) s.value = v.dofColorPop
        const sv = document.getElementById('dof-pop-val')
        if (sv) sv.textContent = v.dofColorPop + '%'
      }
    }

    window.addEventListener('save-view', onSave)
    window.addEventListener('restore-view', onRestore)

    // Initial render
    renderSavedViews(camera)

    return () => {
      window.removeEventListener('save-view', onSave)
      window.removeEventListener('restore-view', onRestore)
    }
  }, [camera, gl])

  return null
}

function loadSavedViews() {
  try { return JSON.parse(localStorage.getItem(VIEWS_KEY)) || [] } catch(e) { return [] }
}
function storeSavedViews(views) {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)) } catch(e) {}
}

function renderSavedViews() {
  const list = document.getElementById('saved-views-list')
  if (!list) return
  while (list.firstChild) list.removeChild(list.firstChild)
  const views = loadSavedViews()

  views.forEach((v, idx) => {
    const el = document.createElement('div')
    el.className = 'saved-view'

    if (v.thumbnail) {
      const img = document.createElement('img')
      img.src = v.thumbnail
      el.appendChild(img)
    }

    const name = document.createElement('span')
    name.className = 'sv-name'
    name.textContent = v.name || 'View ' + (idx + 1)
    el.appendChild(name)

    const del = document.createElement('span')
    del.className = 'sv-delete'
    del.textContent = '\u00d7'
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      const views = loadSavedViews()
      views.splice(idx, 1)
      storeSavedViews(views)
      renderSavedViews()
    })
    el.appendChild(del)

    el.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('restore-view', { detail: v }))
    })

    list.appendChild(el)
  })
}

// ─── App ─────────────────────────────────────────────────────
function App() {
  return (
    <Canvas dpr={2} camera={{ fov: 37.8 }} gl={{ depth: false, preserveDrawingBuffer: true }} style={{ width: '100%', height: '100%' }}>
      <Scene />
      <FovListener />
      <SavedViewsHandler />
      <WasdFly />
    </Canvas>
  )
}

// Mount React into dedicated div inside canvas container
const container = document.getElementById('r3f-root')
createRoot(container).render(
  <ErrorBoundary name="editor">
    <App />
  </ErrorBoundary>
)

// Wire sidebar after DOM is ready
wireUI()

// Init graphic editor overlay (Fabric.js canvas on top of 3D view)
setTimeout(() => initEditor(), 500) // Delay to let R3F canvas mount first

// ─── Session persistence ────────────────────────────────────
const SESSION_KEY = 'mapposter3d_poster_v2_session'

function saveSession() {
  try {
    // We can't easily serialize camera from outside R3F, so we dispatch an event
    window.dispatchEvent(new CustomEvent('save-session'))
  } catch (e) {}
}

// Save periodically
setInterval(saveSession, 3000)

// The actual save happens inside a R3F component (see SessionSaver in Scene)
function _doSave(camera) {
  try {
    const data = {
      camera: {
        px: camera.position.x, py: camera.position.y, pz: camera.position.z,
        qx: camera.quaternion.x, qy: camera.quaternion.y,
        qz: camera.quaternion.z, qw: camera.quaternion.w,
        fov: camera.fov
      },
      state: {
        timeOfDay: state.timeOfDay,
        latitude: state.latitude,
        longitude: state.longitude,
        sunRotation: state.sunRotation,
        dof: { ...state.dof },
        bloom: { ...state.bloom },
        ssao: { ...state.ssao },
        vignette: { ...state.vignette },
        clouds: { ...state.clouds }
      },
      ui: {
        aiEnhance: !!document.getElementById('toggle-ai-enhance')?.classList.contains('on'),
        textOverlay: !!document.getElementById('toggle-text-overlay')?.classList.contains('on'),
        geminiPrompt: document.getElementById('gemini-prompt')?.value || '',
        exportRes: document.getElementById('export-res')?.value || '2',
        location: document.getElementById('location-search')?.value || '',
        fillMode: document.body.classList.contains('fill-mode'),
        aspectRatio: document.getElementById('canvas-container')?.style.getPropertyValue('--ratio') || '1.333',
        aspectLabel: (document.querySelector('#size-grid-portrait .size-btn.active, #size-grid-landscape .size-btn.active')?.textContent) || 'Fill'
      }
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch (e) {}
}

function restoreSession(camera) {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (data.camera) {
      camera.position.set(data.camera.px, data.camera.py, data.camera.pz)
      camera.quaternion.set(data.camera.qx, data.camera.qy, data.camera.qz, data.camera.qw)
      if (data.camera.fov) { camera.fov = data.camera.fov; camera.updateProjectionMatrix() }
    }
    if (data.state) {
      // Heal black-canvas bug: if saved tod is outside safe daylight [8,18] (e.g. 0.85 from a pitch-night save), clamp to noon in-memory only — don't mutate stored session
      if (typeof data.state.timeOfDay === 'number' && (data.state.timeOfDay < 8 || data.state.timeOfDay > 18)) {
        data.state.timeOfDay = 12
      }
      Object.assign(state, data.state)
      // Sync UI
      const todSlider = document.getElementById('tod-slider')
      if (todSlider) todSlider.value = state.timeOfDay
      const sunRotSlider = document.getElementById('sun-rot-slider')
      const sunRotVal = document.getElementById('sun-rot-val')
      if (sunRotSlider) sunRotSlider.value = state.sunRotation ?? 0
      if (sunRotVal) sunRotVal.textContent = (state.sunRotation ?? 0) + '°'
      const todVal = document.getElementById('tod-val')
      if (todVal) {
        const h = state.timeOfDay, hh = Math.floor(h), mm = Math.round((h - hh) * 60)
        const ap = hh >= 12 ? 'PM' : 'AM', h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
        todVal.textContent = h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap
      }
      const dofSlider = document.getElementById('dof-focus-slider')
      if (dofSlider) { dofSlider.value = state.dof.tightness; }
      const dofVal = document.getElementById('dof-focus-val')
      if (dofVal) dofVal.textContent = state.dof.tightness + '%'
      const blurSlider = document.getElementById('dof-blur-slider')
      if (blurSlider) blurSlider.value = state.dof.blur
      const blurVal = document.getElementById('dof-blur-val')
      if (blurVal) blurVal.textContent = state.dof.blur + '%'
      const popSlider = document.getElementById('dof-pop-slider')
      if (popSlider) popSlider.value = state.dof.colorPop
      const popVal = document.getElementById('dof-pop-val')
      if (popVal) popVal.textContent = state.dof.colorPop + '%'
      const toggleDof = document.getElementById('toggle-dof')
      if (toggleDof) toggleDof.classList.toggle('on', state.dof.on)
      const toggleGP = document.getElementById('toggle-global-pop')
      if (toggleGP) toggleGP.classList.toggle('on', !!state.dof.globalPop)
      const toggleBloom = document.getElementById('toggle-bloom')
      if (toggleBloom) toggleBloom.classList.toggle('on', !!state.bloom?.on)
      const toggleSsao = document.getElementById('toggle-ssao')
      if (toggleSsao) toggleSsao.classList.toggle('on', !!state.ssao?.on)
      const toggleVignette = document.getElementById('toggle-vignette')
      if (toggleVignette) toggleVignette.classList.toggle('on', !!state.vignette?.on)
      const toggleClouds = document.getElementById('toggle-clouds')
      if (toggleClouds) toggleClouds.classList.toggle('on', state.clouds.on)
    }
    if (data.ui) {
      const u = data.ui
      // AI enhance
      const aiToggle = document.getElementById('toggle-ai-enhance')
      const aiSettings = document.getElementById('ai-settings')
      if (aiToggle && u.aiEnhance) { aiToggle.classList.add('on'); if (aiSettings) aiSettings.style.display = 'block' }
      // Fill mode — toggle so restoring a non-fill session also clears any fill-mode set at init
      document.body.classList.toggle('fill-mode', !!u.fillMode)
      // Text overlay
      const textToggle = document.getElementById('toggle-text-overlay')
      const textOverlay = document.getElementById('text-overlay')
      if (textToggle && u.textOverlay) { textToggle.classList.add('on'); if (textOverlay) textOverlay.style.display = 'block' }
      // Gemini prompt
      const promptEl = document.getElementById('gemini-prompt')
      if (promptEl && u.geminiPrompt) promptEl.value = u.geminiPrompt
      // Export res
      const resEl = document.getElementById('export-res')
      if (resEl && u.exportRes) resEl.value = u.exportRes
      // Location
      const locEl = document.getElementById('location-search')
      if (locEl && u.location) locEl.value = u.location
      // Aspect ratio + active chip
      document.querySelectorAll('.size-btn.active').forEach(b => b.classList.remove('active'))
      document.getElementById('size-fill-btn')?.classList.remove('active')
      if (u.fillMode) {
        document.body.classList.add('fill-mode')
        document.getElementById('canvas-container')?.style.removeProperty('--ratio')
        document.getElementById('size-fill-btn')?.classList.add('active')
        const hudR = document.getElementById('hud-ratio'); if (hudR) hudR.textContent = 'Fill'
      } else {
        document.body.classList.remove('fill-mode')
        if (u.aspectRatio) {
          document.getElementById('canvas-container')?.style.setProperty('--ratio', u.aspectRatio)
        }
        if (u.aspectLabel) {
          const match = [...document.querySelectorAll('#size-grid-portrait .size-btn, #size-grid-landscape .size-btn')]
            .find(b => b.textContent === u.aspectLabel)
          if (match) {
            match.classList.add('active')
            const hudR = document.getElementById('hud-ratio'); if (hudR) hudR.textContent = match.textContent
          }
        }
      }
    }
    return true
  } catch (e) { return false }
}

// Expose for Scene component
window._posterSave = _doSave
window._posterRestore = restoreSession

// ─── AI Presets ─────────────────────────────────────────────
const AI_PRESETS = {
  // Photography
  realistic: { cat: 'photo', label: 'Realistic', dot: '#8b9a7b', prompt: 'Make this look like a real aerial photograph taken from a helicopter with a DSLR camera. Keep the exact same buildings and layout. Just enhance realism, lighting, and detail subtly.' },
  golden: { cat: 'photo', label: 'Golden Hour', dot: '#d4a24e', prompt: 'Make this look like it was photographed during golden hour. Warm amber sunlight casting long shadows, golden highlights on building facades, rich warm tones throughout. Keep the exact same buildings and layout.' },
  retro70s: { cat: 'photo', label: '70s Film', dot: '#c48a4a', prompt: 'Make this look like a faded 1970s aerial photograph. Warm color cast shifted toward amber and brown, slightly washed-out highlights, soft film grain, muted greens, the nostalgic look of old Kodachrome or Ektachrome film. Keep the exact same buildings and layout.' },
  polaroid: { cat: 'photo', label: 'Polaroid', dot: '#e8d4a0', prompt: 'Give this image the color and tonal qualities of Polaroid instant film (SX-70 or 600). Washed-out highlights, slightly lifted blacks, warm cream-yellow color cast, gentle magenta tint in the shadows, soft dreamy quality, subtle haze. Do NOT add a white Polaroid border, frame, or the physical print look — this should still be a full-bleed aerial photo, just with the Polaroid color palette applied. Keep the exact same buildings and layout.' },
  postcard: { cat: 'photo', label: 'Vintage Postcard', dot: '#7a9abc', prompt: 'Transform this into an old printed aerial photograph from a mid-century vintage postcard. Limited offset-print color palette with slight registration offset, visible halftone dot pattern, muted saturated colors, soft painterly edges, faded white border feel, the look of a 1950s linen-texture postcard. Do NOT add any text, labels, captions, greetings, stamps, or written elements of any kind — just the image itself. Keep the exact same buildings and layout.' },
  travelposter: { cat: 'photo', label: 'Travel Poster', dot: '#d46a5a', prompt: 'Transform this into a vintage 1930s travel poster illustration in the style of Roger Broders or Cassandre. Bold flat colors, art deco stylization, simplified geometric shapes, strong diagonal composition, limited 4-5 color palette with warm oranges, deep teals, and cream. Clean hard-edged shapes with no photographic detail, graphic illustration feel. NO text or labels. Keep the exact same buildings, streets, and composition recognizable.' },

  // Seasons & Weather
  night: { cat: 'weather', label: 'Night', dot: '#2a2a5a', prompt: 'Transform this into a nighttime cityscape. Dark sky, buildings lit up with warm interior lights glowing from windows, street lights casting pools of light, subtle city glow on clouds. Keep the exact same buildings and layout.' },
  snowfall: { cat: 'weather', label: 'Snowfall', dot: '#c8d4e0', prompt: 'Add a winter snowfall scene. Snow covering rooftops and streets, snowflakes falling, overcast sky, warm lights from windows contrasting with cold blue-white snow. Keep the exact same buildings and layout.' },
  autumn: { cat: 'weather', label: 'Autumn', dot: '#c45a2a', prompt: 'Transform all vegetation to peak autumn foliage — vibrant oranges, deep reds, golden yellows on every tree and park. Warm afternoon light, a few scattered fallen leaves on streets and rooftops. Keep the exact same buildings, streets, and layout.' },
  cherry: { cat: 'weather', label: 'Cherry Blossom', dot: '#e8a0b8', prompt: 'Add cherry blossom trees in full bloom — soft pink and white blossoms on all trees, some petals drifting in the air, gentle spring light. Keep the exact same buildings, streets, and layout.' },
  rainy: { cat: 'weather', label: 'Rainy', dot: '#5a6a7a', prompt: 'Make this a moody rainy day. Wet streets with reflections, overcast grey sky, puddles on flat surfaces, rain visible in the air, everything glistening. Muted, cool color palette. Keep the exact same buildings and layout.' },
  foggy: { cat: 'weather', label: 'Foggy Dawn', dot: '#8a8a7a', prompt: 'Add thick low-lying fog rolling between the buildings at dawn. Tops of taller buildings poke above the fog layer, soft golden sunrise light filtering through, ethereal and dreamlike. Keep the exact same buildings and layout.' },

  // Art Styles
  watercolor: { cat: 'art', label: 'Watercolor', dot: '#6a9ab8', prompt: 'Render this as a beautiful watercolor painting. Soft wet-on-wet washes of color, visible paper texture, gentle color bleeding at edges, artistic and painterly feel. Keep the same composition and buildings.' },
  oilpaint: { cat: 'art', label: 'Oil Painting', dot: '#8a6a3a', prompt: 'Transform this into a rich oil painting with visible thick impasto brushstrokes, deep saturated colors, and dramatic chiaroscuro lighting. Think classic Dutch Golden Age cityscape painting but from an aerial view. Keep the same composition and buildings.' },
  lineart: { cat: 'art', label: 'Line Drawing', dot: '#2a2a2a', prompt: 'Transform this into a clean black and white line drawing. Thin ink lines on white background, architectural sketch style with clean outlines of buildings, streets, and details. No shading or fills, just precise linework. Keep the exact same layout.' },
  pastel: { cat: 'art', label: 'Pastel Dream', dot: '#b8a0c8', prompt: 'Transform this into a soft pastel dreamscape. Muted cotton candy colors — lavender, peach, mint, baby blue. Soft diffused light, everything looks gentle and dreamy like a tilt-shift architectural model render. Keep the exact same buildings and layout.' },
  blueprint: { cat: 'art', label: 'Blueprint', dot: '#2a4a8a', prompt: 'Transform this into an architectural blueprint style. White lines on dark blue background, technical drawing aesthetic, building outlines and structural details emphasized. Do NOT add any labels, text, callouts, annotations, dimensions, or measurement lines — just the line art of the buildings. Keep the exact same composition and layout.' },
  pixel: { cat: 'art', label: 'Pixel Art', dot: '#4aaa4a', prompt: 'Transform this into 16-bit pixel art style, like a retro top-down city builder game. Chunky visible pixels, limited color palette, clean pixel edges on buildings and roads, charming and nostalgic. Keep the exact same layout and composition.' },

  cyberpunk: { cat: 'art', label: 'Cyberpunk', dot: '#aa2aaa', prompt: 'Transform this into a cyberpunk cityscape. Rain-slicked streets with colorful reflections, dramatic pink and cyan lighting, neon-lit atmosphere, moody fog. Do NOT add any holograms, floating objects, signs, text, or new elements — only change the lighting, colors, and mood. Keep the exact same buildings, composition, and layout.' },
  ghibli: { cat: 'art', label: 'Studio Ghibli', dot: '#5aaa8a', prompt: 'Transform this into Studio Ghibli anime art style. Lush hand-painted look with rich greens and warm light, puffy cumulus clouds, whimsical and slightly fantastical atmosphere, the signature Miyazaki feeling of a lived-in, beautiful world seen from above. Keep the exact same buildings and layout.' },
  gouache: { cat: 'art', label: 'Gouache', dot: '#c8b08a', prompt: 'Render this as an opaque gouache painting in the style of a mid-century children\'s storybook illustration — Miroslav Šašek or Alice and Martin Provensen. Matte flat paint with visible brushstrokes, warm earthy palette, naive simplified architectural forms, gentle storybook feel. Keep the same composition and buildings recognizable.' },
  stainedglass: { cat: 'art', label: 'Stained Glass', dot: '#c43a6a', prompt: 'Transform this into a stained glass window. Thick black leading outlining every building, street, and shape, filled with vibrant saturated jewel-tone glass — deep blues, rich reds, amber, emerald, violet. Each color cell reads as a flat translucent pane of glass. The composition retains the same layout but is simplified into larger planar shapes. No text. Keep the same overall composition.' },

  // Sketch & Drawing
  pencilsketch: { cat: 'sketch', label: 'Pencil Sketch', dot: '#7a7468', prompt: 'Transform this into a detailed graphite pencil sketch on cream textured paper. Visible pencil strokes with varying pressure, soft shading on building facades, darker edges where shadows fall, subtle smudges and eraser marks, the unfinished spontaneous feel of an architect\'s field sketch. No color — only graphite tones on off-white paper. Keep the exact same buildings, streets, and composition.' },
  crosshatch: { cat: 'sketch', label: 'Ink Crosshatch', dot: '#1c1a16', prompt: 'Transform this into a detailed ink crosshatching drawing in the style of Albrecht Dürer or a 19th-century steel engraving. Dense black ink crosshatch lines defining form and shadow, finer hatching for lighter surfaces, pure white highlights, cream-toned paper background. No solid fills — every tone built from crossed lines. Keep the exact same buildings, streets, and composition.' },
  charcoal: { cat: 'sketch', label: 'Charcoal', dot: '#4a4642', prompt: 'Transform this into an expressive charcoal drawing on off-white paper. Bold smudgy charcoal strokes, rich velvety blacks in the shadows, soft rubbed-in grey mid-tones, white highlights where the paper shows through, dramatic chiaroscuro. The energetic loose quality of a life drawing. No color — charcoal tones only. Keep the exact same composition and buildings.' },
  architect: { cat: 'sketch', label: 'Architect Marker', dot: '#a8a090', prompt: 'Transform this into a confident architect\'s presentation sketch. Loose black felt-tip pen lines with deliberate overshoots at building corners, soft grey and warm tan marker washes for shading, splashes of sky-blue marker for the sky, off-white paper background. The energetic professional look of a SketchUp presentation render or a loose Zaha Hadid working sketch. No text, annotations, dimensions, or measurements. Keep the exact same buildings and composition.' },
  traveljournal: { cat: 'sketch', label: 'Travel Journal', dot: '#b88558', prompt: 'Transform this into a loose urban sketcher travel journal page in the style of Danny Gregory or Felix Scheinberger. Quick confident ink lines with imperfect hand-drawn perspective, watercolor washes dropped on top with soft color bleeds spilling beyond the lines, visible cream paper texture, unpainted areas of white paper, warm earth tones and pale sky blue, the spontaneous look of an in-situ sketch done on location. No text or captions. Keep the same composition and buildings recognizable.' },
  woodblock: { cat: 'sketch', label: 'Ukiyo-e Print', dot: '#2a4f7a', prompt: 'Transform this into a traditional Japanese ukiyo-e woodblock print in the style of Hokusai or Hiroshige. Bold black outlines with flat areas of muted color — prussian blue, soft vermilion, cream, pale green, mustard — using the characteristic flattened perspective and graphic simplification of architectural forms. Slight visible registration offsets between color blocks, subtle wood-grain texture in the flat color fields. No text. Keep the same composition and buildings recognizable.' },
}

const PRESET_CATEGORIES = {
  photo: 'Photography',
  weather: 'Seasons & Weather',
  art: 'Art Styles',
  sketch: 'Sketch & Drawing'
}

// Wire AI presets
const geminiPromptEl = document.getElementById('gemini-prompt')

document.querySelectorAll('.ai-preset').forEach(btn => {
  btn.addEventListener('click', function () {
    this.classList.toggle('active')
    const selected = [...document.querySelectorAll('.ai-preset.active')]
    if (selected.length === 1 && geminiPromptEl) {
      geminiPromptEl.value = getPresetPrompt(selected[0].dataset.preset)
    }
  })
})

// AI enhance toggle
const toggleAI = document.getElementById('toggle-ai-enhance')
const aiSettings = document.getElementById('ai-settings')
if (toggleAI && aiSettings) {
  toggleAI.addEventListener('click', function () {
    this.classList.toggle('on')
    aiSettings.style.display = this.classList.contains('on') ? 'block' : 'none'
  })
}

// ─── Time Machine: decades, prompts, research ───────────────
const DECADES = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]

// Per-decade style fallback used when research isn't available (network / API error).
// When research IS available it takes precedence — these are only generic era cues.
const DECADE_STYLE_FALLBACK = {
  1900: 'Sepia-toned Edwardian era: horse-drawn wagons, gas street lamps, cobblestone streets, pedestrians in long coats and hats, coal-smoke haze, hand-painted signs.',
  1910: 'Early monochrome photo: Model T automobiles mixing with horse carts, early electric lamps, bowler hats and long dresses, muted brown-grey palette.',
  1920: 'Roaring twenties: vintage boxy automobiles, art deco marquees, flappers and fedoras, warm sepia-amber film tint, early neon signs.',
  1930: 'Great Depression era: desaturated palette, streamline moderne details, fewer cars, art deco signage, overcast grey-brown tone, wool suits and flat caps.',
  1940: 'WWII wartime: khaki and olive tones, 1940s sedans, wartime fashion, propaganda posters, desaturated warm film stock.',
  1950: 'Post-war boom: chrome-heavy Cadillacs, neon diner signs, saturated Kodachrome palette, men in hats and women in swing dresses, sunny tone.',
  1960: 'Mid-century mod: muscle cars and station wagons, vibrant Kodachrome color, crisp signage, tree-lined streets, bright blue sky.',
  1970: 'Faded Kodak look: warm amber cast, boxy 70s sedans in browns and yellows, bell-bottoms, disco-era signage, hazy smoggy air.',
  1980: 'Neon 1980s: boxy sedans, bright neon signs, VHS saturation, pastel awnings, slightly hazy urban air.',
  1990: 'Early 90s film stock: minivans and boxy sedans, desaturated natural palette, grunge fashion, muted greens and browns.',
  2000: 'Early digital photography: SUVs and sedans, Y2K signage, cooler color temperature, no smartphones, crisp daylight.',
  2010: 'Smartphone era: modern sedans and hybrids, LED street lighting appearing, glass storefronts, contemporary digital photo look.',
  2020: 'Present day: modern vehicles including electric cars, LED lighting throughout, HDR digital photo, sharp daylight, modern casual wear.',
}

function buildDecadePrompt(year, researchBlurb) {
  // Camera-lock instructions must come first. If "transform" / "replace" language leads,
  // the image model reads it as permission to re-frame the shot.
  let prompt =
      `STRICT CAMERA LOCK — read this before anything else.\n`
    + `This is an oblique aerial photograph taken from a very specific camera position, altitude, tilt, heading, and field of view. `
    + `Your output MUST use the IDENTICAL camera as the input: same position, same altitude, same tilt angle, same heading, same FOV, same crop. `
    + `The horizon line must be at the exact same height in the frame. Vanishing points must land in the exact same places. `
    + `The four edges of the frame must show the exact same geographic extent. `
    + `The street grid — streets, intersections, curves, block shapes — must remain in the EXACT same pixel positions. `
    + `Do not rotate, pan, tilt, zoom, dolly, or re-crop. Do not change the perspective. Do not flatten or exaggerate the tilt. `
    + `If in doubt, copy the geometry of the input image pixel-for-pixel and only change surface appearance. `
    + `\n\n`
    + `WITHIN that locked camera, restyle the scene to show this EXACT location as it appeared in the ${year}s. `
    + `Buildings that DID exist in the ${year}s: restyle their surface appearance to match the era (period materials, colors, signage, weathering). `
    + `Keep their footprint and height unchanged. `
    + `Buildings that did NOT exist in the ${year}s: replace IN PLACE — their footprint in the frame stays the same, but show what was historically there `
    + `(empty lot, farmland, earlier and shorter structure, tenement, etc). The replacement must sit at the same spot in the frame and match the surrounding ground plane. `
    + `Apply ${year}s-appropriate street-level vehicles, lighting, vegetation, atmospheric tone, and film-stock color grading. `
    + `Do not add text, labels, captions, or watermarks.`

  if (researchBlurb && researchBlurb.trim()) {
    prompt += `\n\nHistorical context for this exact site in the ${year}s:\n${researchBlurb.trim()}\n\n`
            + `Apply this historical description WITHIN the locked camera framing described above. `
            + `Composition is non-negotiable; the historical content fills it.`
  } else {
    prompt += `\n\nStyle cues for the ${year}s: ${DECADE_STYLE_FALLBACK[year] || ''}`
  }
  return prompt
}

// timeMachineSets[setId] = { images: { [decade]: dataUrl }, research: { [decade]: text }, location: string }
const timeMachineSets = {}
let activeTimeMachineSetId = null
let nextTimeMachineSetId = 0
let tmBlurbVisible = true

async function researchDecades(lat, lng) {
  // Reverse geocode to enrich the prompt with address/neighborhood/city.
  let address = '', neighborhood = '', city = '', country = ''
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`,
      { headers: { 'User-Agent': 'MapPoster/1.0' } }
    )
    const data = await r.json()
    const addr = data.address || {}
    address = data.display_name || ''
    neighborhood = addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || ''
    city = addr.city || addr.town || addr.municipality || ''
    country = addr.country || ''
  } catch (e) { /* geocode is best-effort */ }

  const locHeader = address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`

  const prompt = `Research what was at this exact location in each decade from 1900 to 2020.

Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}
Address (reverse-geocoded): ${address || 'unknown'}
Neighborhood: ${neighborhood || 'unknown'}
City: ${city || 'unknown'}
Country: ${country || 'unknown'}

For each decade (1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020), write 3-4 sentences describing:
- What buildings, lots, or land use occupied this exact spot (or the nearest matching block)
- Era-appropriate street life, vehicles, vegetation, atmosphere
- If the current building did not exist yet, explicitly say what was there instead (empty lot, farmland, tenement, older structure, etc)
- Notable neighborhood character from that decade

Use search grounding to find historical records. If you cannot find the specific site, describe the neighborhood as it was in that decade.

Respond ONLY with a JSON object in this exact form, with no markdown code fences, no preface, and no trailing text:

{
  "1900": "...",
  "1910": "...",
  "1920": "...",
  "1930": "...",
  "1940": "...",
  "1950": "...",
  "1960": "...",
  "1970": "...",
  "1980": "...",
  "1990": "...",
  "2000": "...",
  "2010": "...",
  "2020": "..."
}`

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
  }

  const res = await fetch(
    '/api/gemini?model=gemini-2.5-pro',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  )

  if (!res.ok) {
    let msg = `Research API error ${res.status}`
    try { const err = await res.json(); msg = err.error?.message?.substring(0, 200) || msg } catch(e) {}
    throw new Error(msg)
  }

  const data = await res.json()
  let text = ''
  for (const cand of (data.candidates || [])) {
    for (const part of (cand.content?.parts || [])) {
      if (part.text) text += part.text
    }
  }

  // Strip markdown code fences if Gemini ignored the instruction and wrapped the JSON.
  text = text.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace > 0 || lastBrace < text.length - 1) {
    if (firstBrace >= 0 && lastBrace > firstBrace) text = text.slice(firstBrace, lastBrace + 1)
  }

  let parsed
  try { parsed = JSON.parse(text) }
  catch (e) { throw new Error('Could not parse research response: ' + text.substring(0, 120)) }

  // Normalize — accept numeric or string keys, with or without 's' suffix
  const normalized = {}
  for (const year of DECADES) {
    normalized[year] = parsed[year] || parsed[String(year)] || parsed[`${year}s`] || ''
  }
  return { research: normalized, location: locHeader }
}

// ─── Export helpers ─────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40)
}

function getPresetLabel(prompt) {
  for (const key in AI_PRESETS) {
    const p = AI_PRESETS[key]
    const pText = typeof p === 'string' ? p : p.prompt
    if (pText === prompt) return typeof p === 'string' ? key : p.label
  }
  return 'Custom'
}

function getPresetPrompt(key) {
  const p = AI_PRESETS[key]
  return typeof p === 'string' ? p : p?.prompt || ''
}

function getExportScale() {
  return +(document.getElementById('export-res')?.value) || 1
}

function buildFilename(style) {
  const parts = ['mapposter']
  const loc = document.getElementById('location-search')?.value || ''
  if (loc) parts.push(slugify(loc.split(',')[0]))
  if (style) parts.push(slugify(style))
  const scale = getExportScale()
  if (scale > 1) parts.push(scale + 'x')
  const d = new Date()
  parts.push(
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`,
    `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  )
  return parts.join('-')
}

// ─── Export Queue ────────────────────────────────────────────
const exportQueue = []
let exportProcessing = false
let exportNextId = 0
const queueContainer = document.getElementById('export-queue')

// Gallery: full-res images in IndexedDB, metadata in memory
const GALLERY_DB = 'mapposter_gallery'
const GALLERY_STORE = 'images'
const gallery = []

// IndexedDB helpers
function openGalleryDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GALLERY_DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(GALLERY_STORE)) {
        db.createObjectStore(GALLERY_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveToGalleryDB(item) {
  try {
    const db = await openGalleryDB()
    const tx = db.transaction(GALLERY_STORE, 'readwrite')
    tx.objectStore(GALLERY_STORE).put({
      id: item.id,
      label: item.label,
      filename: item.filename,
      dataUrl: item.dataUrl,
      time: item.time.toISOString(),
      batchId: item.batchId || null,
      batchLabel: item.batchLabel || null
    })
  } catch (e) { console.warn('[gallery] IndexedDB save failed:', e) }
}

async function loadGalleryDB() {
  try {
    const db = await openGalleryDB()
    return new Promise((resolve) => {
      const tx = db.transaction(GALLERY_STORE, 'readonly')
      const req = tx.objectStore(GALLERY_STORE).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch (e) { return [] }
}

async function deleteFromGalleryDB(id) {
  try {
    const db = await openGalleryDB()
    const tx = db.transaction(GALLERY_STORE, 'readwrite')
    tx.objectStore(GALLERY_STORE).delete(id)
  } catch (e) {}
}

// Restore gallery from IndexedDB on load
loadGalleryDB().then(items => {
  items.sort((a, b) => new Date(a.time) - new Date(b.time))
  items.forEach(item => {
    gallery.push({
      id: item.id,
      label: item.label,
      filename: item.filename,
      dataUrl: item.dataUrl,
      time: new Date(item.time),
      batchId: item.batchId || null,
      batchLabel: item.batchLabel || null
    })
  })
  if (gallery.length > 0) {
    const btn = document.getElementById('open-gallery-btn')
    if (btn) btn.style.display = ''
  }
  renderGallery()
})

// Clean up old localStorage gallery data
try { localStorage.removeItem('mapposter3d_gallery') } catch(e) {}

function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild)
}

function renderQueue() {
  if (!queueContainer) return
  clearElement(queueContainer)
  exportQueue.forEach(job => {
    const el = document.createElement('div')
    el.className = 'queue-item' +
      (job.status === 'done' ? ' qi-done' : '') +
      (job.status === 'error' ? ' qi-error' : '') +
      (job.status === 'active' ? ' qi-active' : '')

    const label = document.createElement('span')
    label.className = 'qi-label'
    label.textContent = job.label
    el.appendChild(label)

    const statusEl = document.createElement('span')
    statusEl.className = 'qi-status'
    statusEl.textContent = job.statusText
    el.appendChild(statusEl)

    if (job.status === 'active') {
      const bar = document.createElement('span')
      bar.className = 'qi-bar'
      const fill = document.createElement('span')
      fill.className = 'qi-bar-fill'
      fill.style.width = job.progress + '%'
      bar.appendChild(fill)
      el.appendChild(bar)
    }

    if (job.status === 'pending') {
      const remove = document.createElement('span')
      remove.className = 'qi-remove'
      remove.textContent = '\u00d7'
      remove.addEventListener('click', (e) => {
        e.stopPropagation()
        const idx = exportQueue.indexOf(job)
        if (idx >= 0) exportQueue.splice(idx, 1)
        renderQueue()
      })
      el.appendChild(remove)
    }

    if (job.status === 'done' && job.resultUrl) {
      el.classList.add('qi-clickable')
      el.addEventListener('click', () => {
        // Prefer the stored gallery index; fall back to dataUrl match
        let gi = (typeof job.galleryIdx === 'number' && gallery[job.galleryIdx]?.dataUrl === job.resultUrl)
          ? job.galleryIdx
          : gallery.findIndex(g => g.dataUrl === job.resultUrl)
        if (gi < 0) return
        // Open the gallery modal behind the lightbox so closing the lightbox lands in the gallery
        document.getElementById('gallery-overlay')?.classList.add('open')
        renderGallery()
        openLightbox(gi)
      })
    }

    queueContainer.appendChild(el)
  })
  // Keep the sidebar queue count badge in sync
  try { window.__updateQueueCount?.() } catch (e) {}
}

function updateJob(job, fields) {
  Object.assign(job, fields)
  renderQueue()
}

function addToGallery(label, filename, dataUrl, opts = {}) {
  const item = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    label, filename, dataUrl,
    time: new Date(),
    batchId: opts.batchId || null,
    batchLabel: opts.batchLabel || null
  }
  gallery.push(item)
  saveToGalleryDB(item)
  renderGallery()
  const btn = document.getElementById('open-gallery-btn')
  if (btn) btn.style.display = ''
  return gallery.length - 1 // index of newly added item
}

function processQueue() {
  if (exportProcessing) return
  const job = exportQueue.find(j => j.status === 'pending')
  if (!job) return

  exportProcessing = true
  updateJob(job, { status: 'active', statusText: 'Capturing...', progress: 10 })

  // Use the snapshot captured when the job was queued (locks the view at that moment)
  const snapshotUrl = job.snapshot
  if (!snapshotUrl) {
    updateJob(job, { status: 'error', statusText: 'No snapshot' })
    exportProcessing = false
    processQueue()
    return
  }

  if (!job.useAI) {
    updateJob(job, { statusText: 'Exporting...', progress: 60 })
    const fname = buildFilename('raw')
    job.resultUrl = snapshotUrl
    const link = document.createElement('a')
    link.download = fname + '.png'
    link.href = snapshotUrl
    link.click()
    addToGallery(job.label, fname, snapshotUrl, { batchId: job.batchId, batchLabel: job.batchLabel })
    updateJob(job, { status: 'done', statusText: 'Done', progress: 100 })
    exportProcessing = false
    processQueue()
    return
  }

  updateJob(job, { statusText: 'AI enhancing...', progress: 25 })

  // Load the snapshot into an Image to scale it down for Gemini
  const img = new Image()
  img.onload = () => sendToGemini(img, job)
  img.onerror = () => { updateJob(job, { status: 'error', statusText: 'Snapshot load failed' }); exportProcessing = false; processQueue() }
  img.src = snapshotUrl
}

function sendToGemini(img, job) {
  const maxDim = 1024
  const srcW = img.naturalWidth, srcH = img.naturalHeight
  const scl = Math.min(1, maxDim / Math.max(srcW, srcH))
  const sendCanvas = document.createElement('canvas')
  sendCanvas.width = Math.round(srcW * scl)
  sendCanvas.height = Math.round(srcH * scl)
  sendCanvas.getContext('2d').drawImage(img, 0, 0, sendCanvas.width, sendCanvas.height)
  const base64Data = sendCanvas.toDataURL('image/jpeg', 0.85).split(',')[1]

  const payload = JSON.stringify({
    contents: [{ parts: [
      { text: job.prompt },
      { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
    ]}],
    generationConfig: { responseModalities: ['image', 'text'] }
  })

  const xhr = new XMLHttpRequest()
  xhr.timeout = 120000
  xhr.open('POST', '/api/gemini?model=gemini-3.1-flash-image-preview', true)
  xhr.setRequestHeader('Content-Type', 'application/json')

  const pulseInterval = setInterval(() => {
    if (job.progress < 75) updateJob(job, { progress: job.progress + 2 })
  }, 1000)

  const finish = () => { clearInterval(pulseInterval); exportProcessing = false; processQueue() }

  xhr.ontimeout = () => { updateJob(job, { status: 'error', statusText: 'Timeout' }); finish() }
  xhr.onerror = () => { updateJob(job, { status: 'error', statusText: 'Network error' }); finish() }
  xhr.onload = () => {
    if (xhr.status !== 200) {
      let msg = 'API error ' + xhr.status
      try { msg = JSON.parse(xhr.responseText).error?.message?.substring(0, 80) || msg } catch(e) {}
      updateJob(job, { status: 'error', statusText: msg }); finish(); return
    }
    let result
    try { result = JSON.parse(xhr.responseText) } catch(e) {
      updateJob(job, { status: 'error', statusText: 'Bad response' }); finish(); return
    }
    let imageData = null
    for (const cand of (result.candidates || [])) {
      for (const part of (cand.content?.parts || [])) {
        if (part.inlineData?.data) { imageData = part.inlineData; break }
      }
      if (imageData) break
    }
    if (!imageData) { updateJob(job, { status: 'error', statusText: 'No image returned' }); finish(); return }

    const dataUrl = `data:${imageData.mimeType || 'image/png'};base64,${imageData.data}`
    const fname = buildFilename(job.label)
    job.resultUrl = dataUrl
    // Skip auto-download for time machine jobs (13 jobs per set would spam the user);
    // the user can still download individual decades from the gallery or scrubber.
    if (job.setId == null) {
      const link = document.createElement('a')
      link.download = fname + '.png'
      link.href = dataUrl
      link.click()
    }
    job.galleryIdx = addToGallery(job.label, fname, dataUrl, { batchId: job.batchId, batchLabel: job.batchLabel })
    // If this was a time machine job, wire it into the overlay
    if (job.setId != null && job.decade != null) {
      if (!timeMachineSets[job.setId]) timeMachineSets[job.setId] = { images: {}, research: {} }
      if (!timeMachineSets[job.setId].images) timeMachineSets[job.setId].images = {}
      timeMachineSets[job.setId].images[job.decade] = dataUrl
      try { onTimeMachineJobComplete(job.setId, job.decade) } catch (e) {}
    }
    updateJob(job, { status: 'done', statusText: 'Done', progress: 100 })
    finish()
  }
  xhr.send(payload)
}

// ─── Queue buttons ──────────────────────────────────────────
function appendEffectPrompts(prompt) {
  if (state.dof.on) prompt += ' Preserve the depth-of-field blur effect — keep the focused area sharp and the background/foreground blurred exactly as shown.'
  return prompt
}

// Snapshot the current canvas — used to lock job to current view
function snapshotCanvas() {
  const canvas = document.querySelector('#r3f-root canvas')
  if (!canvas) return null
  return canvas.toDataURL('image/png')
}

// Async snapshot that composites the editor overlay onto the 3D render
async function snapshotWithOverlay() {
  const result = await compositeExport()
  return result || snapshotCanvas()
}

document.getElementById('export-btn')?.addEventListener('click', async () => {
  const aiOn = toggleAI?.classList.contains('on')
  const selected = [...document.querySelectorAll('.ai-preset.active')]
  const snapshot = await snapshotWithOverlay() // capture view + overlay at click time

  if (aiOn && selected.length > 0) {
    // Queue each selected preset
    selected.forEach(btn => {
      const key = btn.dataset.preset
      const preset = AI_PRESETS[key]
      const prompt = appendEffectPrompts(getPresetPrompt(key))
      exportQueue.push({
        id: exportNextId++,
        label: preset?.label || btn.textContent,
        prompt, useAI: true, snapshot,
        status: 'pending', statusText: 'Queued', progress: 0, resultUrl: null
      })
    })
  } else {
    // Single job — custom prompt or raw
    let prompt = geminiPromptEl?.value.trim() ||
      'Make this look like a real aerial photograph. Keep the exact same buildings and layout. Enhance realism subtly.'
    prompt = appendEffectPrompts(prompt)
    exportQueue.push({
      id: exportNextId++,
      label: aiOn ? 'Custom' : 'Raw',
      prompt, useAI: aiOn, snapshot,
      status: 'pending', statusText: 'Queued', progress: 0, resultUrl: null
    })
  }
  // Clear the current selection so the user can pick something new without their old choice sticking
  document.querySelectorAll('.ai-preset.active').forEach(b => b.classList.remove('active'))
  if (geminiPromptEl) geminiPromptEl.value = ''
  renderQueue()
  try { window.__openQueueDropdown?.() } catch (e) {}
  processQueue()
})

document.getElementById('quick-download-btn')?.addEventListener('click', async () => {
  const dataUrl = await snapshotWithOverlay()
  if (!dataUrl) return
  const fname = buildFilename('raw')
  const link = document.createElement('a')
  link.download = fname + '.png'
  link.href = dataUrl
  link.click()
  addToGallery('Quick', fname, dataUrl)
  fireConfetti()
})

document.getElementById('generate-all-btn')?.addEventListener('click', async () => {
  const snapshot = await snapshotWithOverlay()
  // Create a batch — all jobs in this click share the same batchId so they group in the gallery
  const batchId = 'batch-' + Date.now()
  const loc = document.getElementById('location-search')?.value?.split(',')[0] || 'All Styles'
  const batchLabel = loc + ' · All Styles'
  for (const key in AI_PRESETS) {
    const preset = AI_PRESETS[key]
    const prompt = appendEffectPrompts(getPresetPrompt(key))
    exportQueue.push({
      id: exportNextId++, label: preset.label || key,
      prompt, useAI: true, snapshot,
      batchId, batchLabel,
      status: 'pending', statusText: 'Queued', progress: 0, resultUrl: null
    })
  }
  renderQueue()
  try { window.__openQueueDropdown?.() } catch (e) {}
  processQueue()
})

// ─── Batch Export ────────────────────────────────────────────
document.getElementById('batch-export-btn')?.addEventListener('click', async () => {
  const views = loadSavedViews()
  if (views.length === 0) {
    toastInfo('No saved views to export')
    return
  }

  const btn = document.getElementById('batch-export-btn')
  const origText = btn.textContent
  btn.disabled = true
  btn.textContent = `Exporting 0/${views.length}...`

  // For each saved view: restore, wait for render, snapshot, download
  for (let i = 0; i < views.length; i++) {
    btn.textContent = `Exporting ${i + 1}/${views.length}...`

    // Restore the view
    window.dispatchEvent(new CustomEvent('restore-view', { detail: views[i] }))

    // Wait for scene to settle
    await new Promise(r => setTimeout(r, 1500))

    // Snapshot and download
    const dataUrl = snapshotCanvas()
    if (dataUrl) {
      const safeName = (views[i].name || `view-${i + 1}`).replace(/[^a-zA-Z0-9°. -]/g, '_').slice(0, 60)
      const link = document.createElement('a')
      link.download = `mapposter_${safeName}.png`
      link.href = dataUrl
      link.click()
    }

    // Small delay between downloads so browser doesn't block them
    if (i < views.length - 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  btn.disabled = false
  btn.textContent = origText
  toastSuccess(`Exported ${views.length} view${views.length > 1 ? 's' : ''}`)
})

// ─── Time Machine ───────────────────────────────────────────
const tmOverlay = document.getElementById('tm-overlay')
const tmImage = document.getElementById('tm-image')
const tmEmpty = document.getElementById('tm-empty')
const tmLabel = document.getElementById('tm-year-label')
const tmSlider = document.getElementById('tm-slider')
const tmProgress = document.getElementById('tm-progress')
const tmClose = document.getElementById('tm-close')
const tmBlurb = document.getElementById('tm-blurb')
const tmStatus = document.getElementById('tm-status')
const tmBlurbToggle = document.getElementById('tm-blurb-toggle')
const tmLocation = document.getElementById('tm-location')

function nearestCompletedDecade(year, completed) {
  if (!completed.length) return null
  return completed.reduce((best, d) =>
    Math.abs(d - year) < Math.abs(best - year) ? d : best, completed[0])
}

function setTimeMachineStatus(text) {
  if (!tmStatus) return
  tmStatus.textContent = text || ''
  tmStatus.style.display = text ? 'block' : 'none'
}

function updateTimeMachineUI(setId) {
  if (setId !== activeTimeMachineSetId) return
  const entry = timeMachineSets[setId] || {}
  const images = entry.images || {}
  const research = entry.research || {}
  const completed = DECADES.filter(d => images[d])

  if (tmProgress) tmProgress.textContent = `${completed.length} / ${DECADES.length} rendered`
  if (tmLocation) {
    tmLocation.textContent = entry.location || ''
    tmLocation.style.display = entry.location ? 'block' : 'none'
  }

  // Slider label always tracks the actual slider position (research is pre-fetched,
  // so dragging smoothly updates the label/blurb even while images are still rendering).
  const requested = +(tmSlider?.value || 2020)
  if (tmLabel) tmLabel.textContent = `${requested}s`

  // Image: show nearest completed decade, or the empty state if nothing is ready yet.
  if (completed.length) {
    const nearest = images[requested] ? requested : nearestCompletedDecade(requested, completed)
    if (tmImage) { tmImage.style.display = 'block'; tmImage.src = images[nearest] }
    if (tmEmpty) tmEmpty.style.display = 'none'
  } else {
    if (tmImage) tmImage.style.display = 'none'
    if (tmEmpty) tmEmpty.style.display = 'block'
  }

  // Research blurb tracks the actual slider value, not the nearest-rendered image.
  const blurb = research[requested] || ''
  if (tmBlurb) {
    tmBlurb.textContent = blurb
    tmBlurb.style.display = (tmBlurbVisible && blurb) ? 'block' : 'none'
  }
  if (tmBlurbToggle) {
    tmBlurbToggle.textContent = tmBlurbVisible ? 'hide notes' : 'show notes'
    tmBlurbToggle.style.display = (Object.keys(research).length > 0) ? 'block' : 'none'
  }
}

function showTimeMachineOverlay(setId) {
  if (!tmOverlay) return
  activeTimeMachineSetId = setId
  tmOverlay.classList.add('open')
  updateTimeMachineUI(setId)
}

function onTimeMachineJobComplete(setId, decade) {
  if (setId !== activeTimeMachineSetId) return
  // When the first decade's image arrives, snap the slider to it so the user sees something.
  const entry = timeMachineSets[setId] || {}
  const images = entry.images || {}
  const prevCount = Object.keys(images).length - 1
  if (prevCount === 0 && tmSlider) tmSlider.value = decade
  updateTimeMachineUI(setId)
}

tmSlider?.addEventListener('input', () => {
  if (activeTimeMachineSetId != null) updateTimeMachineUI(activeTimeMachineSetId)
})

tmClose?.addEventListener('click', () => {
  tmOverlay?.classList.remove('open')
})

tmBlurbToggle?.addEventListener('click', () => {
  tmBlurbVisible = !tmBlurbVisible
  if (activeTimeMachineSetId != null) updateTimeMachineUI(activeTimeMachineSetId)
})

// Ask SubjectListener for the lat/lng the camera is currently aimed at.
// Falls back to null after 250ms if the R3F listener hasn't responded.
function getSubjectCoords() {
  return new Promise(resolve => {
    let settled = false
    const finish = (v) => { if (!settled) { settled = true; resolve(v) } }
    window.dispatchEvent(new CustomEvent('get-subject-coords', { detail: { resolve: finish } }))
    setTimeout(() => finish(null), 250)
  })
}

document.getElementById('render-decades-btn')?.addEventListener('click', async () => {
  const snapshot = await snapshotWithOverlay()
  if (!snapshot) { alert('Canvas not ready'); return }

  const setId = nextTimeMachineSetId++
  timeMachineSets[setId] = { images: {}, research: {}, location: '' }
  showTimeMachineOverlay(setId)
  setTimeMachineStatus('Locating subject…')

  // Raycast screen-center to get the ground point the camera is looking at.
  // That's what we want to research, not the camera's own GPS position.
  const subject = await getSubjectCoords()
  const lat = subject?.lat ?? state.latitude
  const lng = subject?.lng ?? state.longitude

  setTimeMachineStatus('Researching historical context (Gemini 2.5 Pro + Google Search)…')

  let research = {}
  try {
    const result = await researchDecades(lat, lng)
    research = result.research
    timeMachineSets[setId].research = research
    timeMachineSets[setId].location = result.location
  } catch (e) {
    console.warn('Research failed:', e)
    setTimeMachineStatus('Research failed: ' + e.message.substring(0, 120) + ' — rendering with style-only prompts.')
  }

  updateTimeMachineUI(setId)
  setTimeout(() => {
    if (activeTimeMachineSetId === setId) setTimeMachineStatus('')
  }, 2000)

  for (const year of DECADES) {
    exportQueue.push({
      id: exportNextId++,
      label: `${year}s`,
      prompt: appendEffectPrompts(buildDecadePrompt(year, research[year])),
      useAI: true,
      snapshot,
      setId,
      decade: year,
      status: 'pending',
      statusText: 'Queued',
      progress: 0,
      resultUrl: null,
    })
  }
  renderQueue()
  try { window.__openQueueDropdown?.() } catch (e) {}
  processQueue()
})

// ─── Gallery ────────────────────────────────────────────────
const galleryOverlay = document.getElementById('gallery-overlay')
const galleryGrid = document.getElementById('gallery-grid')
const galleryCount = document.getElementById('gallery-count')
let galleryView = 'grid'

// Group gallery into display entries: regular items as-is, batch items grouped.
// Returns array of entries, each either { type: 'item', item, idx } or { type: 'batch', items: [{item, idx}], label, time }
function buildGalleryEntries() {
  const batches = new Map()
  const entries = []
  gallery.forEach((item, idx) => {
    if (item.batchId) {
      if (!batches.has(item.batchId)) {
        const entry = {
          type: 'batch',
          batchId: item.batchId,
          label: item.batchLabel || 'Batch',
          items: [],
          time: item.time
        }
        batches.set(item.batchId, entry)
        entries.push(entry)
      }
      batches.get(item.batchId).items.push({ item, idx })
      // Update batch time to the latest item's time
      if (item.time > batches.get(item.batchId).time) {
        batches.get(item.batchId).time = item.time
      }
    } else {
      entries.push({ type: 'item', item, idx })
    }
  })
  // Newest first
  entries.reverse()
  return entries
}

function renderGallery() {
  if (!galleryGrid) return
  clearElement(galleryGrid)
  galleryGrid.className = 'gallery-grid' + (galleryView !== 'grid' ? ` view-${galleryView}` : '')
  if (galleryCount) galleryCount.textContent = gallery.length + ' image' + (gallery.length !== 1 ? 's' : '')

  const entries = buildGalleryEntries()

  entries.forEach(entry => {
    if (entry.type === 'item') {
      galleryGrid.appendChild(buildGalleryCard(entry.item, entry.idx))
    } else {
      galleryGrid.appendChild(buildBatchCard(entry))
    }
  })
}

function buildGalleryCard(item, idx) {
  const card = document.createElement('div')
  card.className = 'gallery-card'
  card.addEventListener('click', () => openLightbox(idx))

  const img = document.createElement('img')
  img.src = item.dataUrl
  card.appendChild(img)

  const dl = document.createElement('div')
  dl.className = 'gc-dl'
  dl.textContent = '\u2193'
  dl.addEventListener('click', (e) => {
    e.stopPropagation()
    const link = document.createElement('a')
    link.download = item.filename + '.png'
    link.href = item.dataUrl
    link.click()
  })
  card.appendChild(dl)

  const sh = document.createElement('div')
  sh.className = 'gc-dl'
  sh.style.cssText = 'right:38px;font-size:11px;'
  sh.textContent = '\u2191'
  sh.title = 'Share to Community'
  sh.addEventListener('click', (e) => {
    e.stopPropagation()
    openShareModal(item.dataUrl)
  })
  card.appendChild(sh)

  const info = document.createElement('div')
  info.className = 'gc-info'
  const lbl = document.createElement('span')
  lbl.className = 'gc-label'
  lbl.textContent = item.label
  const tm = document.createElement('span')
  tm.className = 'gc-time'
  tm.textContent = item.time.getHours() + ':' + String(item.time.getMinutes()).padStart(2, '0')
  info.appendChild(lbl)
  info.appendChild(tm)
  card.appendChild(info)
  return card
}

function buildBatchCard(entry) {
  const card = document.createElement('div')
  card.className = 'gallery-card gallery-batch'
  card.addEventListener('click', () => openBatchGrid(entry))

  // Mosaic preview: up to 4 images in a 2x2
  const mosaic = document.createElement('div')
  mosaic.className = 'gc-mosaic'
  const previews = entry.items.slice(0, 4)
  previews.forEach(({ item }) => {
    const im = document.createElement('img')
    im.src = item.dataUrl
    mosaic.appendChild(im)
  })
  card.appendChild(mosaic)

  // Badge showing count
  const badge = document.createElement('div')
  badge.className = 'gc-badge'
  badge.textContent = entry.items.length + ' styles'
  card.appendChild(badge)

  const info = document.createElement('div')
  info.className = 'gc-info'
  const lbl = document.createElement('span')
  lbl.className = 'gc-label'
  lbl.textContent = entry.label
  const tm = document.createElement('span')
  tm.className = 'gc-time'
  tm.textContent = entry.time.getHours() + ':' + String(entry.time.getMinutes()).padStart(2, '0')
  info.appendChild(lbl)
  info.appendChild(tm)
  card.appendChild(info)
  return card
}

// Open a batch — show all items in the batch as a sub-grid via the existing gallery overlay
// For simplicity: open the lightbox on the first item of the batch, with nav scoped to the batch
function openBatchGrid(entry) {
  if (!entry.items.length) return
  openLightboxScoped(entry.items.map(({ idx }) => idx), 0, entry.label)
}

document.getElementById('open-gallery-btn')?.addEventListener('click', () => {
  galleryOverlay?.classList.add('open')
  renderGallery()
})
document.getElementById('gallery-close')?.addEventListener('click', () => {
  galleryOverlay?.classList.remove('open')
})

document.querySelectorAll('.view-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-toggle').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    galleryView = btn.dataset.view
    renderGallery()
  })
})

document.getElementById('gallery-download-all')?.addEventListener('click', () => {
  gallery.forEach(item => {
    const link = document.createElement('a')
    link.download = item.filename + '.png'
    link.href = item.dataUrl
    link.click()
  })
})

// ─── Lightbox ───────────────────────────────────────────────
const lightbox = document.getElementById('lightbox')
const lbImg = document.getElementById('lb-img')
const lbLabel = document.getElementById('lb-label')
let lbIdx = 0
let lbScope = null // null = full gallery, array = scoped to these gallery indices
let lbScopePos = 0 // position within the scoped array
let lbScopeLabel = ''

function openLightbox(idx) {
  lbIdx = idx
  lbScope = null
  lbScopePos = 0
  lbScopeLabel = ''
  updateLightbox()
  lightbox?.classList.add('open')
}

function openLightboxScoped(indices, startPos, label) {
  lbScope = indices.slice()
  lbScopePos = startPos
  lbScopeLabel = label || ''
  lbIdx = lbScope[lbScopePos]
  updateLightbox()
  lightbox?.classList.add('open')
}

// The full gallery is displayed newest-first (buildGalleryEntries reverses the array),
// so "prev" (left arrow) should walk toward NEWER items = higher gallery indices,
// and "next" (right arrow) should walk toward OLDER items = lower gallery indices.
// Scoped mode (batches) preserves queue order in the scope array, so it stays linear.
function lbCanPrev() {
  return lbScope ? lbScopePos > 0 : lbIdx < gallery.length - 1
}
function lbCanNext() {
  return lbScope ? lbScopePos < lbScope.length - 1 : lbIdx > 0
}
function lbPrev() {
  if (lbScope) { lbScopePos--; lbIdx = lbScope[lbScopePos] }
  else { lbIdx++ }
  updateLightbox()
}
function lbNext() {
  if (lbScope) { lbScopePos++; lbIdx = lbScope[lbScopePos] }
  else { lbIdx-- }
  updateLightbox()
}

function updateLightbox() {
  const item = gallery[lbIdx]
  if (!item) return
  if (lbImg) lbImg.src = item.dataUrl
  if (lbLabel) {
    const prefix = lbScopeLabel ? lbScopeLabel + ' · ' : ''
    const pos = lbScope ? ` (${lbScopePos + 1}/${lbScope.length})` : ''
    lbLabel.textContent = prefix + item.label + pos
  }
}

document.getElementById('lb-close')?.addEventListener('click', () => lightbox?.classList.remove('open'))
lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.classList.remove('open') })
document.getElementById('lb-prev')?.addEventListener('click', (e) => {
  e.stopPropagation()
  if (lbCanPrev()) lbPrev()
})
document.getElementById('lb-next')?.addEventListener('click', (e) => {
  e.stopPropagation()
  if (lbCanNext()) lbNext()
})
document.getElementById('lb-download')?.addEventListener('click', (e) => {
  e.stopPropagation()
  const item = gallery[lbIdx]
  if (!item) return
  const link = document.createElement('a')
  link.download = item.filename + '.png'
  link.href = item.dataUrl
  link.click()
})

// View in Frame from lightbox — also dismiss the gallery modal so the
// 3D frame preview isn't hidden behind it (gallery is z:200, preview is z:150).
document.getElementById('lb-frame')?.addEventListener('click', (e) => {
  e.stopPropagation()
  const item = gallery[lbIdx]
  if (!item) return
  lightbox?.classList.remove('open')
  document.getElementById('gallery-overlay')?.classList.remove('open')
  if (window.openPosterPreview) window.openPosterPreview(item.dataUrl, item.label, lbIdx)
})

// ─── Share to Community ────────────────────────────────────
const shareModal = document.getElementById('share-modal')
const shareTitle = document.getElementById('share-title')
const shareDesc = document.getElementById('share-desc')
const shareLocation = document.getElementById('share-location')
const shareStatus = document.getElementById('share-status')
let shareImageDataUrl = null

function openShareModal(dataUrl) {
  shareImageDataUrl = dataUrl
  if (shareTitle) shareTitle.value = ''
  if (shareDesc) shareDesc.value = ''
  // Auto-fill location from search bar
  const locInput = document.getElementById('location-search')
  if (shareLocation) shareLocation.value = locInput?.value || ''
  if (shareStatus) { shareStatus.style.display = 'none'; shareStatus.textContent = '' }
  if (shareModal) { shareModal.style.display = 'flex' }
}

document.getElementById('lb-share')?.addEventListener('click', (e) => {
  e.stopPropagation()
  const item = gallery[lbIdx]
  if (!item) return
  openShareModal(item.dataUrl)
})

document.getElementById('share-modal-close')?.addEventListener('click', () => {
  if (shareModal) shareModal.style.display = 'none'
})
document.getElementById('share-cancel')?.addEventListener('click', () => {
  if (shareModal) shareModal.style.display = 'none'
})
shareModal?.addEventListener('click', (e) => {
  if (e.target === shareModal) shareModal.style.display = 'none'
})

document.getElementById('share-submit')?.addEventListener('click', async () => {
  if (!shareImageDataUrl) return
  const title = shareTitle?.value?.trim()
  if (!title) { shareTitle?.focus(); return }

  if (shareStatus) { shareStatus.style.display = 'block'; shareStatus.textContent = 'Uploading...' }

  try {
    const { createPost } = await import('./lib/community.js')
    const { supabase } = await import('./lib/supabase.js')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      if (shareStatus) shareStatus.textContent = 'Please sign in first to share.'
      return
    }

    // Convert data URL to blob
    const resp = await fetch(shareImageDataUrl)
    const blob = await resp.blob()

    await createPost({
      title,
      description: shareDesc?.value?.trim() || '',
      location_name: shareLocation?.value?.trim() || '',
      image_blob: blob,
      user_id: session.user.id
    })

    if (shareStatus) { shareStatus.textContent = 'Shared! 🎉'; shareStatus.style.color = '#5ec269' }
    setTimeout(() => { if (shareModal) shareModal.style.display = 'none' }, 1200)
  } catch (err) {
    if (shareStatus) { shareStatus.textContent = 'Error: ' + (err.message || 'Upload failed'); shareStatus.style.color = '#e25555' }
  }
})

document.addEventListener('keydown', (e) => {
  if (shareModal?.style.display === 'flex') {
    if (e.key === 'Escape') shareModal.style.display = 'none'
    return
  }
  if (posterPreview?.classList.contains('open')) {
    if (e.key === 'Escape') closePosterPreview()
    if (e.key === 'ArrowLeft') ppNavigate(-1)
    if (e.key === 'ArrowRight') ppNavigate(1)
  } else if (lightbox?.classList.contains('open')) {
    if (e.key === 'ArrowLeft' && lbCanPrev()) lbPrev()
    if (e.key === 'ArrowRight' && lbCanNext()) lbNext()
    if (e.key === 'Escape') lightbox.classList.remove('open')
  } else if (galleryOverlay?.classList.contains('open')) {
    if (e.key === 'Escape') galleryOverlay.classList.remove('open')
  }
})

// ─── 3D Poster Preview ─────────────────────────────────────
const posterPreview = document.getElementById('poster-preview')
const ppFrame = document.getElementById('pp-frame')
const ppImage = document.getElementById('pp-image')
const ppLabel = document.getElementById('pp-label')

let ppRotX = -5 // slight upward tilt
let ppRotY = 15  // slight right rotation
let ppDragging = false
let ppLastX = 0, ppLastY = 0
let ppVelX = 0, ppVelY = 0

function updatePosterTransform() {
  if (ppFrame) {
    ppFrame.style.transform = `rotateX(${ppRotX}deg) rotateY(${ppRotY}deg)`
    // Shift shadow based on rotation for parallax feel
    const shadowX = -ppRotY * 1.5
    const shadowY = ppRotX * 1.5 + 30
    ppFrame.style.boxShadow =
      `${shadowX}px ${shadowY}px 60px rgba(0,0,0,0.5), ` +
      `${shadowX * 0.3}px ${shadowY * 0.3}px 20px rgba(0,0,0,0.3), ` +
      `inset 0 0 0 1px rgba(255,255,255,0.04)`
  }
}

let ppGalleryIdx = -1 // -1 = not from gallery (canvas capture)
const ppScene = document.getElementById('pp-scene')

function fitPosterScene(imgW, imgH) {
  if (!ppScene) return
  // Viewport minus sidebar (320px)
  const availW = window.innerWidth - 320
  const maxW = Math.min(800, availW * 0.8)
  const maxH = Math.min(900, window.innerHeight * 0.85)
  const aspect = imgW / imgH
  let w, h
  if (aspect > maxW / maxH) {
    w = maxW
    h = maxW / aspect
  } else {
    h = maxH
    w = maxH * aspect
  }
  ppScene.style.width = w + 'px'
  ppScene.style.height = h + 'px'
}

function loadAndFit(src) {
  const img = new Image()
  img.onload = () => fitPosterScene(img.naturalWidth, img.naturalHeight)
  img.src = src
}

let ppLiveMode = false

function closePosterPreview() {
  posterPreview?.classList.remove('open')
  document.body.classList.remove('preview-open')
  ppLiveMode = false
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
}

function openPosterPreview(imageSrc, label, galleryIdx) {
  if (!posterPreview || !ppImage) return
  ppImage.src = imageSrc
  loadAndFit(imageSrc)
  if (ppLabel) ppLabel.textContent = label || ''
  ppGalleryIdx = galleryIdx ?? -1
  ppLiveMode = galleryIdx === undefined // live if opened from canvas, not gallery
  ppRotX = -5; ppRotY = 15
  updatePosterTransform()
  posterPreview.classList.add('open')
  document.body.classList.add('preview-open')
  // Nudge R3F to resize canvas
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
  if (ppLiveMode) startLiveUpdate()
}

// Get the currently selected aspect ratio (from the active size chip or fill button)
function getSelectedAspect() {
  const fillActive = document.getElementById('size-fill-btn')?.classList.contains('active')
  if (fillActive) return null
  const active = document.querySelector('#size-grid-portrait .size-btn.active, #size-grid-landscape .size-btn.active')
  const ratio = active?.dataset?.ratio
  return ratio ? parseFloat(ratio) : null
}

const _cropCanvas = document.createElement('canvas')

function cropToAspect(srcCanvas, aspect) {
  const sw = srcCanvas.width, sh = srcCanvas.height
  if (aspect == null) return srcCanvas // Fill = no crop
  const srcAspect = sw / sh
  let cw, ch, cx, cy
  if (srcAspect > aspect) {
    // source is wider — crop sides
    ch = sh
    cw = Math.round(sh * aspect)
    cx = Math.round((sw - cw) / 2)
    cy = 0
  } else {
    // source is taller — crop top/bottom
    cw = sw
    ch = Math.round(sw / aspect)
    cx = 0
    cy = Math.round((sh - ch) / 2)
  }
  _cropCanvas.width = cw
  _cropCanvas.height = ch
  _cropCanvas.getContext('2d').drawImage(srcCanvas, cx, cy, cw, ch, 0, 0, cw, ch)
  return _cropCanvas
}

let _liveLastKey = ''
function startLiveUpdate() {
  const tick = () => {
    if (!posterPreview?.classList.contains('open') || !ppLiveMode) return
    const canvas = document.querySelector('#r3f-root canvas')
    if (canvas) {
      const aspect = getSelectedAspect()
      const out = cropToAspect(canvas, aspect)
      ppImage.src = out.toDataURL('image/jpeg', 0.85)
      const key = out.width + 'x' + out.height
      if (key !== _liveLastKey) {
        _liveLastKey = key
        fitPosterScene(out.width, out.height)
      }
    }
    requestAnimationFrame(tick)
  }
  _liveLastKey = ''
  requestAnimationFrame(tick)
}

function ppNavigate(dir) {
  if (ppGalleryIdx < 0 || gallery.length === 0) return
  const next = ppGalleryIdx + dir
  if (next < 0 || next >= gallery.length) return
  ppGalleryIdx = next
  ppLiveMode = false
  const item = gallery[ppGalleryIdx]
  if (ppImage) ppImage.src = item.dataUrl
  loadAndFit(item.dataUrl)
  if (ppLabel) ppLabel.textContent = item.label
}

// Open from canvas
document.getElementById('poster-3d-btn')?.addEventListener('click', () => {
  const canvas = document.querySelector('#r3f-root canvas')
  if (!canvas) return
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  const loc = document.getElementById('location-search')?.value || 'MapPoster'
  openPosterPreview(dataUrl, loc.split(',')[0])
})

// Close
document.getElementById('pp-close')?.addEventListener('click', closePosterPreview)

// Drag to orbit
posterPreview?.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.pp-close')) return
  ppDragging = true
  ppLastX = e.clientX
  ppLastY = e.clientY
  ppVelX = 0; ppVelY = 0
  e.preventDefault()
})

window.addEventListener('pointermove', (e) => {
  if (!ppDragging) return
  const dx = e.clientX - ppLastX
  const dy = e.clientY - ppLastY
  ppRotY += dx * 0.4
  ppRotX -= dy * 0.3
  ppRotX = Math.max(-30, Math.min(30, ppRotX))
  ppRotY = Math.max(-45, Math.min(45, ppRotY))
  ppVelX = dx * 0.4
  ppVelY = -dy * 0.3
  ppLastX = e.clientX
  ppLastY = e.clientY
  updatePosterTransform()
})

window.addEventListener('pointerup', () => {
  if (!ppDragging) return
  ppDragging = false
  // Momentum coast
  const coast = () => {
    if (ppDragging) return
    if (Math.abs(ppVelX) < 0.1 && Math.abs(ppVelY) < 0.1) return
    ppRotY += ppVelX
    ppRotX += ppVelY
    ppRotX = Math.max(-30, Math.min(30, ppRotX))
    ppRotY = Math.max(-45, Math.min(45, ppRotY))
    ppVelX *= 0.92
    ppVelY *= 0.92
    updatePosterTransform()
    requestAnimationFrame(coast)
  }
  requestAnimationFrame(coast)
})

// Also allow opening from gallery lightbox — expose globally
window.openPosterPreview = openPosterPreview

// ─── v3 UI: Modal open/close, More expander, HUD, counts ────────────
;(function v3UI() {
  // Close a modal by id (used by close buttons, backdrop click, ESC)
  function closeModal(id) {
    const m = document.getElementById(id)
    if (!m) return
    m.classList.remove('open')
  }

  // Render Styles — inline collapsible dropdown
  const renderBtn = document.getElementById('open-render-styles-btn')
  const renderPanel = document.getElementById('render-styles-panel')
  if (renderBtn && renderPanel) {
    renderBtn.addEventListener('click', () => {
      const open = renderPanel.classList.toggle('open')
      renderBtn.classList.toggle('open', open)
    })
  }

  // Saved Views — inline collapsible dropdown (same pattern)
  const savedBtn = document.getElementById('open-saved-views-btn')
  const savedPanel = document.getElementById('saved-views-panel')
  if (savedBtn && savedPanel) {
    savedBtn.addEventListener('click', () => {
      const open = savedPanel.classList.toggle('open')
      savedBtn.classList.toggle('open', open)
      if (open) {
        // Re-render from storage so new items show up
        try { renderSavedViews() } catch (e) {}
        updateSavedViewsEmpty()
      }
    })
  }

  // Map Style — CSS filter-based map appearance
  const mapStyleBtn = document.getElementById('open-map-style-btn')
  const mapStylePanel = document.getElementById('map-style-panel')
  const mapStyleLabel = document.getElementById('map-style-label')
  const mapStyleGrid = document.getElementById('map-style-grid')
  const canvasContainer = document.getElementById('canvas-container')

  const MAP_STYLES = {
    default:     { label: 'Default',    filter: 'none' },
    satellite:   { label: 'Vivid',      filter: 'saturate(1.4) contrast(1.1)' },
    warm:        { label: 'Warm',       filter: 'sepia(0.15) saturate(1.2) brightness(1.05)' },
    cool:        { label: 'Cool',       filter: 'saturate(0.9) hue-rotate(15deg) brightness(1.02)' },
    desaturated: { label: 'Muted',      filter: 'saturate(0.4) brightness(1.05)' },
    noir:        { label: 'Noir',       filter: 'grayscale(1) contrast(1.3) brightness(0.9)' },
    sepia:       { label: 'Sepia',      filter: 'sepia(0.6) saturate(0.8) brightness(0.95)' },
    blueprint:   { label: 'Blueprint',  filter: 'grayscale(1) brightness(0.7) contrast(1.5) sepia(0.3) hue-rotate(190deg) saturate(2)' },
    neon:        { label: 'Neon',       filter: 'saturate(2) contrast(1.2) brightness(1.1)' },
  }

  if (mapStyleBtn && mapStylePanel) {
    mapStyleBtn.addEventListener('click', () => {
      const open = mapStylePanel.classList.toggle('open')
      mapStyleBtn.classList.toggle('open', open)
    })
  }

  if (mapStyleGrid && canvasContainer) {
    mapStyleGrid.querySelectorAll('[data-map-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.mapStyle
        const style = MAP_STYLES[key]
        if (!style) return

        // Apply CSS filter to canvas container
        canvasContainer.style.filter = style.filter

        // Update active state
        mapStyleGrid.querySelectorAll('[data-map-style]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')

        // Update label
        if (mapStyleLabel) mapStyleLabel.textContent = style.label

        // Store preference
        try { localStorage.setItem('mapposter_map_style', key) } catch (e) {}
      })
    })

    // Restore stored preference
    try {
      const stored = localStorage.getItem('mapposter_map_style')
      if (stored && MAP_STYLES[stored]) {
        canvasContainer.style.filter = MAP_STYLES[stored].filter
        mapStyleGrid.querySelectorAll('[data-map-style]').forEach(b => {
          b.classList.toggle('active', b.dataset.mapStyle === stored)
        })
        if (mapStyleLabel) mapStyleLabel.textContent = MAP_STYLES[stored].label
      }
    } catch (e) {}
  }

  // Queue — independent collapsible dropdown + clear buttons
  const queueBtn = document.getElementById('open-queue-btn')
  const queuePanel = document.getElementById('queue-panel')
  if (queueBtn && queuePanel) {
    queueBtn.addEventListener('click', () => {
      const open = queuePanel.classList.toggle('open')
      queueBtn.classList.toggle('open', open)
    })
  }

  // Clear done — remove finished + errored jobs, leave pending/active
  document.getElementById('queue-clear-done-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (typeof exportQueue === 'undefined') return
    for (let i = exportQueue.length - 1; i >= 0; i--) {
      if (exportQueue[i].status === 'done' || exportQueue[i].status === 'error') {
        exportQueue.splice(i, 1)
      }
    }
    try { renderQueue() } catch (err) {}
    updateQueueCount()
  })

  // Clear all — only safe when nothing is actively running
  document.getElementById('queue-clear-all-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    if (typeof exportQueue === 'undefined') return
    const hasActive = exportQueue.some(j => j.status === 'active')
    if (hasActive && !confirm('A render is in progress — clear anyway?')) return
    // Keep active jobs; drop everything else. If user confirmed, drop active too.
    for (let i = exportQueue.length - 1; i >= 0; i--) {
      if (hasActive && exportQueue[i].status === 'active') continue
      exportQueue.splice(i, 1)
    }
    try { renderQueue() } catch (err) {}
    updateQueueCount()
  })

  // Keep the queue count badge in sync
  function updateQueueCount() {
    const el = document.getElementById('queue-count')
    if (!el || typeof exportQueue === 'undefined') return
    el.textContent = String(exportQueue.length)
  }
  // Expose so renderQueue (defined elsewhere) can call it after each change
  window.__updateQueueCount = updateQueueCount
  // Also auto-open the queue when a job is added (initial open only)
  window.__openQueueDropdown = () => {
    if (queuePanel && !queuePanel.classList.contains('open')) {
      queuePanel.classList.add('open')
      queueBtn?.classList.add('open')
    }
  }
  updateQueueCount()

  // Section collapse/expand — click the section head to toggle, persist to localStorage
  const COLLAPSE_KEY = 'mapposter_v3ui_collapsed_sections'
  let collapsedSet
  try { collapsedSet = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')) }
  catch (e) { collapsedSet = new Set() }

  document.querySelectorAll('.sidebar-section').forEach(section => {
    const key = section.dataset.sec
    if (!key) return
    if (collapsedSet.has(key)) section.classList.add('collapsed')
    const head = section.querySelector('.section-head')
    head?.addEventListener('click', () => {
      const collapsed = section.classList.toggle('collapsed')
      if (collapsed) collapsedSet.add(key); else collapsedSet.delete(key)
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedSet])) } catch (e) {}
    })
  })

  // Close buttons: [data-close="modal-id"]
  document.querySelectorAll('.modal [data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  })

  // Backdrop click to close
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('open')
    })
  })

  // ESC closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'))
  })

  // "More" expander in Camera section
  const moreBtn = document.getElementById('camera-more-btn')
  const moreContent = document.getElementById('camera-more')
  if (moreBtn && moreContent) {
    moreBtn.addEventListener('click', () => {
      const open = moreContent.classList.toggle('open')
      moreBtn.classList.toggle('open', open)
    })
  }

  // HUD: lens + dof badges — reflect control state
  const hudLens = document.getElementById('hud-lens')
  const hudDof = document.getElementById('hud-dof')
  const fovSlider = document.getElementById('fov-slider')
  const todSlider = document.getElementById('tod-slider')
  const cornerTime = document.getElementById('corner-time')
  const cornerCoords = document.getElementById('corner-coords')

  function fmtTime(h) {
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    const ap = hh >= 12 ? 'pm' : 'am'
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
    return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap
  }

  function syncHudLens() {
    if (!hudLens || !fovSlider) return
    hudLens.textContent = fovSlider.value + 'mm'
  }
  function syncHudDof() {
    if (!hudDof) return
    const on = document.getElementById('toggle-dof')?.classList.contains('on')
    hudDof.textContent = on ? 'DoF on' : 'DoF off'
    hudDof.style.color = on ? 'var(--accent)' : 'var(--ink-dim)'
  }
  function syncCornerTime() {
    if (!cornerTime || !todSlider) return
    cornerTime.textContent = fmtTime(+todSlider.value)
  }

  fovSlider?.addEventListener('input', syncHudLens)
  todSlider?.addEventListener('input', syncCornerTime)
  document.getElementById('toggle-dof')?.addEventListener('click', () => setTimeout(syncHudDof, 0))
  document.getElementById('location-search')?.addEventListener('change', () => {
    if (cornerCoords) cornerCoords.textContent = document.getElementById('location-search')?.value || ''
  })

  // Initial sync
  syncHudLens()
  syncHudDof()
  syncCornerTime()

  // Counts
  function updateSavedViewsCount() {
    try {
      const n = (JSON.parse(localStorage.getItem('mapposter3d_v2_views') || '[]')).length
      const el = document.getElementById('saved-views-count')
      if (el) el.textContent = n + ' saved'
    } catch (e) {}
  }
  function updateSavedViewsEmpty() {
    const list = document.getElementById('saved-views-list')
    const empty = document.getElementById('saved-empty')
    if (!list || !empty) return
    empty.style.display = list.children.length === 0 ? 'block' : 'none'
  }
  function updateGalleryCount() {
    const el = document.getElementById('gallery-nav-count')
    if (el && typeof gallery !== 'undefined') el.textContent = String(gallery.length)
  }
  function updateRenderStylesCount() {
    const n = document.querySelectorAll('#ai-presets .ai-preset').length
    const el = document.getElementById('render-styles-count')
    if (el) el.textContent = n + ' styles'
  }

  // Keep counts in sync after a view is saved
  window.addEventListener('save-view', () => setTimeout(() => { updateSavedViewsCount(); updateSavedViewsEmpty() }, 100))

  // Periodic count sync (cheap)
  setInterval(() => {
    updateSavedViewsCount()
    updateGalleryCount()
    updateSavedViewsEmpty()
  }, 1000)

  updateSavedViewsCount()
  updateGalleryCount()
  updateRenderStylesCount()
  updateSavedViewsEmpty()
})();

// ─── Phase 5: Polish integrations ───────────────────────────

// Keyboard shortcuts
initKeyboardShortcuts()

// Onboarding (first-time users only, delayed to let the 3D scene load)
setTimeout(() => startOnboarding(), 3000)

// Print-ready export button
document.getElementById('print-export-btn')?.addEventListener('click', () => {
  const canvas = document.querySelector('#r3f-root canvas')
  if (!canvas) { toastError('Canvas not ready'); return }
  const dataUrl = canvas.toDataURL('image/png')
  showPrintExport(dataUrl)
})

// Toast notifications for existing actions
window.addEventListener('save-view', () => toastSuccess('View saved!'))

// Watermark on free-tier exports: patch the snapshotCanvas function
const _origSnapshotCanvas = window.snapshotCanvas || snapshotCanvas
const _patchedSnapshot = () => {
  const canvas = document.querySelector('#r3f-root canvas')
  if (!canvas) return null
  if (!shouldWatermark()) return canvas.toDataURL('image/png')

  // Create a copy canvas to add watermark without affecting the live canvas
  const copy = document.createElement('canvas')
  copy.width = canvas.width
  copy.height = canvas.height
  const ctx = copy.getContext('2d')
  ctx.drawImage(canvas, 0, 0)
  applyWatermark(copy)
  return copy.toDataURL('image/png')
}

// Tier-gated export resolution: warn on high-res if free
const exportResSelect = document.getElementById('export-res')
if (exportResSelect) {
  exportResSelect.addEventListener('change', () => {
    const scale = +exportResSelect.value
    if (!canExportScale(scale)) {
      showUpgradePrompt('High-resolution exports (3x, 4x) require a Pro subscription.')
      exportResSelect.value = '1'
    }
  })
}

// Tier-gated saved views
const saveViewBtn = document.getElementById('save-view-btn')
if (saveViewBtn) {
  const origClickHandlers = saveViewBtn.onclick
  saveViewBtn.addEventListener('click', (e) => {
    try {
      const views = JSON.parse(localStorage.getItem('mapposter3d_v2_views') || '[]')
      if (!canSaveView(views.length)) {
        e.stopImmediatePropagation()
        showUpgradePrompt('Free accounts can save up to 5 views. Upgrade to Pro for unlimited saved views.')
      }
    } catch (err) {}
  }, true) // capture phase to intercept before save handler
}

// ─── Phase 6: v2 feature integrations ─────────────────────────
initTheme()
initCameraHistory()
initCompareMode()
initGalleryKeyboard()
initSceneSuggestions()
initCollab()
initVersionHistory()
initAIDescribe()
initSeasonalPresets(state)
initMockup()
