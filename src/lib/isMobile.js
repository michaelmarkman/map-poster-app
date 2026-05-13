// Mobile / capability detection. Evaluated once at module load — the values
// are stable for the lifetime of the page, so callers can read them as
// plain constants. atoms/scene.js previously inlined this same matchMedia
// check; that copy is kept for the (test/jsdom) module-load timing reasons
// noted there, and it now re-exports from this canonical source.

const safeMatchMedia = (q) => {
  try {
    return typeof window !== 'undefined' && window.matchMedia(q).matches
  } catch {
    return false
  }
}

// True when (a) the pointer is coarse (touch) AND (b) the viewport is at
// most 1024px wide. Both checks have to hold: iPad with Pencil reports
// coarse but is too wide to need phone layout; a narrow desktop window
// reports fine and shouldn't get touch-target sizing.
//
// Dev override: set localStorage.forceMobile='1' (or ='0') to force the
// flag on a regular desktop browser. Lets us exercise the mobile scene
// path (gradient sky, no clouds, low-sample DoF) in Chrome DevTools
// without needing a real device. Read once at module load — refresh to
// re-evaluate after toggling.
export const IS_MOBILE = (() => {
  try {
    const forced = typeof localStorage !== 'undefined' && localStorage.getItem('forceMobile')
    if (forced === '1') return true
    if (forced === '0') return false
  } catch {}
  return safeMatchMedia('(max-width: 1024px)') && safeMatchMedia('(pointer: coarse)')
})()

// iOS-family detection — iPhone, iPod, iPad-on-iPadOS (which masquerades
// as macOS, hence the maxTouchPoints heuristic). Used for iOS-Safari-
// specific workarounds (rAF throttling, mediump shader precision, etc).
export const IS_IOS = (() => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS reports "Mac" UA — disambiguate with touch capability.
  if (/Mac/.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
})()

// Probe shader-compile capability. Compiles a small, representative
// fragment shader that uses a loop + texture sampling — both of which
// some weak GPUs choke on. Returns 'high' if the compile + link
// succeeds, 'low' otherwise. Cached after first call. Caller decides
// whether to use the result (it costs a transient WebGL context).
let _gpuTier = null
export function GPU_TIER() {
  if (_gpuTier !== null) return _gpuTier
  if (typeof document === 'undefined') return (_gpuTier = 'high')

  let gl = null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return (_gpuTier = 'low')

    const vs = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vs, `
      attribute vec2 p;
      void main() { gl_Position = vec4(p, 0.0, 1.0); }
    `)
    gl.compileShader(vs)
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return (_gpuTier = 'low')

    // Loop + dynamic indexing — these are the patterns that crash weak
    // tile-based mobile GPUs. If it compiles + links, we're OK to run
    // the volumetric-cloud / multi-ring DoF kernels.
    const fs = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fs, `
      precision highp float;
      uniform sampler2D tex;
      uniform vec2 res;
      void main() {
        vec4 acc = vec4(0.0);
        for (int i = 0; i < 32; i++) {
          float a = float(i) * 0.196;
          vec2 off = vec2(cos(a), sin(a)) / res;
          acc += texture2D(tex, gl_FragCoord.xy / res + off);
        }
        gl_FragColor = acc / 32.0;
      }
    `)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return (_gpuTier = 'low')

    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return (_gpuTier = 'low')

    return (_gpuTier = 'high')
  } catch {
    return (_gpuTier = 'low')
  } finally {
    if (gl && typeof gl.getExtension === 'function') {
      const lose = gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
    }
  }
}
