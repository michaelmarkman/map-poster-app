import React, { useRef, useLayoutEffect, useMemo, forwardRef, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { EffectComposer as WrappedEffectComposer } from '@react-three/postprocessing'
import {
  NormalPass, EffectMaterial, EffectAttribute, BlendFunction, Effect,
  ToneMappingMode
} from 'postprocessing'
import { HalfFloatType, Uniform, Vector2 } from 'three'

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
const API_KEY = localStorage.getItem('mapposter_google_key') || 'AIzaSyCIsBRv6ZcKXhIecWHAOOLkwmLKQcsocKg'
const EXPOSURE = 10

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

// ─── Mutable state (no re-renders) ──────────────────────────
const state = {
  timeOfDay: new Date().getHours() + new Date().getMinutes() / 60,
  longitude: -73.9785,
  clouds: { on: false, coverage: 0.3, shadows: true, paused: false },
  dof: {
    on: true,
    focalUV: [0.5, 0.5],
    tightness: 30,
    blur: 40,
    colorPop: 50
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

// ─── Globe ───────────────────────────────────────────────────
function Globe({ children }) {
  return (
    <TilesRenderer key={API_KEY} url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${API_KEY}`}>
      <TilesPlugin plugin={GoogleCloudAuthPlugin} args={{ apiToken: API_KEY, autoRefreshToken: true }} />
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <TilesPlugin plugin={TileCreasedNormalsPlugin} args={{ creaseAngle: 30 * Math.PI / 180 }} />
      {children}
      <TilesAttributionOverlay />
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

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float rawDepth = readDepth(uv);
  if (rawDepth >= 1.0) { outputColor = inputColor; return; }

  float viewZ = getViewZ(rawDepth);
  float focalZ = getViewZ(readDepth(focalPoint));
  float relDiff = abs(viewZ - focalZ) / abs(focalZ);
  float coc = smoothstep(0.0, depthRange, relDiff) * maxBlur;

  if (coc < 0.5) { outputColor = inputColor; return; }

  vec2 texelSize = 1.0 / vec2(textureSize(inputBuffer, 0));
  float s = coc / 8.0;
  vec4 sum = inputColor * 0.16;
  float tw = 0.16;
  for (int i = -4; i <= 4; i++) {
    for (int j = -4; j <= 4; j++) {
      if (i == 0 && j == 0) continue;
      float fi = float(i), fj = float(j);
      float w = exp(-(fi*fi + fj*fj) / (s*s*2.0 + 0.01));
      sum += texture(inputBuffer, uv + vec2(fi, fj) * texelSize * s) * w;
      tw += w;
    }
  }
  vec4 color = sum / tw;

  float focusAmount = 1.0 - smoothstep(0.0, depthRange, relDiff);
  float pop = focusAmount * colorPop;
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(luma), color.rgb, 1.0 + pop * 0.5);

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
        ['colorPop', new Uniform(0.5)]
      ])
    })
  }
}

const CustomDof = forwardRef(function CustomDof(_, ref) {
  const effect = useMemo(() => new CustomDofEffect(), [])
  React.useImperativeHandle(ref, () => effect, [effect])
  return <primitive object={effect} dispose={null} />
})

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

// ─── Scene ───────────────────────────────────────────────────
function Scene() {
  const camera = useThree(({ camera }) => camera)
  const composerRef = useRef(null)
  const atmosphereRef = useRef(null)
  const dofRef = useRef(null)
  const cloudsRef = useRef(null)

  // Initial camera — East Village NYC
  useLayoutEffect(() => {
    new PointOfView(472, radians(67), radians(-39)).decompose(
      new Geodetic(radians(-73.9785), radians(40.7330)).toECEF(),
      camera.position, camera.quaternion, camera.up
    )
  }, [camera])

  useFrame(({ gl }) => {
    gl.toneMappingExposure = EXPOSURE

    // Update atmosphere from time slider
    const date = getDateFromHour(state.timeOfDay, state.longitude)
    atmosphereRef.current?.updateByDate(date)

    // Update clouds
    const clouds = cloudsRef.current
    if (clouds) {
      clouds.localWeatherVelocity.set(state.clouds.paused ? 0 : 0.001, 0)
      clouds.shadowPass.enabled = state.clouds.shadows
    }

    // Update DoF uniforms
    const fx = dofRef.current
    if (fx && fx.uniforms) {
      fx.uniforms.get('focalPoint').value.set(state.dof.focalUV[0], state.dof.focalUV[1])
      const t = state.dof.tightness / 100
      fx.uniforms.get('depthRange').value = 3.0 * (1.0 - t) * (1.0 - t) + 0.005
      fx.uniforms.get('maxBlur').value = 2 + (state.dof.blur / 100) * 48
      fx.uniforms.get('colorPop').value = state.dof.colorPop / 100
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

      <EffectComposer ref={composerRef} multisampling={0}>
        <Clouds
          ref={cloudsRef}
          coverage={state.clouds.coverage}
          qualityPreset="high"
          shadow-farScale={0.25}
          localWeatherVelocity={[0.001, 0]}
        />
        <AerialPerspective sky sunLight skyLight correctGeometricError albedoScale={2 / Math.PI} />
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
function syncCameraToUI(camera) {
  const now = Date.now()
  if (now - _lastSync < 200) return
  _lastSync = now

  try {
    const pos = camera.position
    // Approximate altitude from ECEF position
    const alt = Math.round(Math.max(0, pos.length() - 6371000))
    const el = document.getElementById('range-val')
    if (el) el.textContent = alt.toLocaleString() + 'm'
    const rs = document.getElementById('range-slider')
    if (rs) rs.value = Math.min(10000, Math.max(100, alt))

    // FOV → focal length
    const fov = camera.fov
    const mm = Math.round(12 / Math.tan(fov * Math.PI / 360))
    const fovVal = document.getElementById('fov-val')
    if (fovVal) fovVal.textContent = Math.max(14, Math.min(200, mm)) + 'mm'
    const fovSlider = document.getElementById('fov-slider')
    if (fovSlider) fovSlider.value = Math.max(14, Math.min(200, mm))
  } catch (e) {}
}

// ─── Wire sidebar controls ──────────────────────────────────
function wireUI() {
  // Hide API key prompt (we auto-load)
  const prompt = document.getElementById('api-key-prompt')
  if (prompt) prompt.style.display = 'none'

  // Status
  const status = document.getElementById('status')
  if (status) { status.textContent = 'Loading 3D tiles...'; setTimeout(() => { status.style.opacity = '0' }, 5000) }

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

  // Clouds toggle
  const toggleClouds = document.getElementById('toggle-clouds')
  if (toggleClouds) {
    toggleClouds.addEventListener('click', function () {
      this.classList.toggle('on')
      state.clouds.on = this.classList.contains('on')
    })
  }

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
    // FOV change needs to reach the camera — dispatch event
    window.dispatchEvent(new CustomEvent('fov-change', { detail: mm }))
  })
}

// ─── FOV listener inside R3F ─────────────────────────────────
function FovListener() {
  const camera = useThree(({ camera }) => camera)
  useEffect(() => {
    const handler = (e) => {
      const mm = e.detail
      camera.fov = 2 * Math.atan(12 / mm) * 180 / Math.PI
      camera.updateProjectionMatrix()
    }
    window.addEventListener('fov-change', handler)
    return () => window.removeEventListener('fov-change', handler)
  }, [camera])
  return null
}

// ─── App ─────────────────────────────────────────────────────
function App() {
  return (
    <Canvas gl={{ depth: false }} style={{ width: '100%', height: '100%' }}>
      <Scene />
      <FovListener />
    </Canvas>
  )
}

// Mount React into the canvas container
const container = document.getElementById('canvas-container')
createRoot(container).render(<App />)

// Wire sidebar after DOM is ready
wireUI()
