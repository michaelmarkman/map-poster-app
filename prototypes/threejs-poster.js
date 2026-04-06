import * as THREE from 'three';
import { TilesRenderer, WGS84_ELLIPSOID, GlobeControls } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import {
  EffectComposer, RenderPass, EffectPass, Effect, BlendFunction,
  DepthOfFieldEffect, BloomEffect, VignetteEffect, NoiseEffect,
  SSAOEffect, ToneMappingEffect, ToneMappingMode
} from 'postprocessing';
import {
  AerialPerspectiveEffect,
  SkyMaterial,
  SunDirectionalLight,
  PrecomputedTexturesLoader,
  DEFAULT_PRECOMPUTED_TEXTURES_URL,
  getSunDirectionECEF
} from '@takram/three-atmosphere';
import { Ellipsoid } from '@takram/three-geospatial';

// ============================================================
//  STATE
// ============================================================

let renderer, scene, camera, composer;
let tiles, controls;
let dofEffect, bloomEffect, vignetteEffect, noiseEffect, tiltShiftEffect, ssaoEffect;
let dofPass, bloomPass, vignettePass, noisePass, tiltShiftPass, ssaoPass;
let aerialPerspectiveEffect, aerialPass;
let atmosphereTextureData = null;

const state = {
  dof: { on: true, focusDist: 500, blur: 30 },
  bloom: { on: false },
  ssao: { on: false },
  vignette: { on: false },
  clouds: { on: false }
};

// Default location: East Village NYC
const DEFAULT_LAT = 40.7330;
const DEFAULT_LNG = -73.9785;
const DEFAULT_ALT = 472;

// ============================================================
//  INIT
// ============================================================

function setStatus(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.opacity = '1';
}

function init(apiKey) {
  document.getElementById('api-key-prompt').style.display = 'none';
  setStatus('Initializing Three.js...');

  const container = document.getElementById('canvas-container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  // Renderer
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x111113);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(
    focalLengthToFov(41),
    w / h,
    1,
    1e8
  );

  // Load Google 3D Tiles
  setStatus('Loading Google 3D Tiles...');
  tiles = new TilesRenderer();
  const authPlugin = new GoogleCloudAuthPlugin({ apiToken: apiKey });
  tiles.registerPlugin(authPlugin);
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);

  tiles.addEventListener('load-tileset', () => {
    console.log('Root tileset loaded');
    setStatus('Tiles loading...');
  });

  scene.add(tiles.group);

  // Basic lighting (will be enhanced by atmosphere later)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(1, 1, 1).normalize();
  scene.add(dirLight);

  // Load atmosphere textures asynchronously
  loadAtmosphere();

  // Controls
  controls = new GlobeControls(scene, camera, renderer.domElement, tiles);
  controls.enableDamping = true;
  controls.dampingFactor = 0.15;

  // Set initial camera position
  const pos = new THREE.Vector3();
  WGS84_ELLIPSOID.getCartographicToPosition(
    DEFAULT_LAT * Math.PI / 180,
    DEFAULT_LNG * Math.PI / 180,
    DEFAULT_ALT,
    pos
  );
  camera.position.copy(pos);

  // Look slightly down at the city
  const target = new THREE.Vector3();
  WGS84_ELLIPSOID.getCartographicToPosition(
    DEFAULT_LAT * Math.PI / 180,
    DEFAULT_LNG * Math.PI / 180,
    0,
    target
  );
  camera.lookAt(target);

  // Post-processing
  setupPostProcessing();

  // UI wiring
  setupUI();
  setupAI();

  // Restore session
  restoreSession();

  // Auto-save on camera changes
  setInterval(saveSession, 2000);

  // Render loop
  animate();

  // Resize
  window.addEventListener('resize', onResize);

  // Fade status after tiles start loading
  setTimeout(() => {
    setStatus('Ready — orbit with mouse, scroll to zoom');
    setTimeout(() => {
      document.getElementById('status').style.opacity = '0';
    }, 3000);
  }, 2000);
}

// ============================================================
//  CAMERA HELPERS
// ============================================================

function focalLengthToFov(mm) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(12 / mm));
}

// ============================================================
//  ATMOSPHERE
// ============================================================

async function loadAtmosphere() {
  try {
    setStatus('Loading atmosphere textures...');
    const loader = new PrecomputedTexturesLoader();
    atmosphereTextureData = await loader.loadAsync(
      DEFAULT_PRECOMPUTED_TEXTURES_URL,
      undefined,
      undefined,
      renderer
    );
    console.log('[atmosphere] Textures loaded');

    // Create aerial perspective effect
    aerialPerspectiveEffect = new AerialPerspectiveEffect(camera, {
      textureData: atmosphereTextureData,
      sky: true
    });

    // Insert aerial perspective pass before DoF in the composer
    // The order should be: RenderPass → AerialPerspective → DoF → Bloom → ...
    aerialPass = new EffectPass(camera, aerialPerspectiveEffect);
    // Insert at position 1 (after RenderPass, before DoF)
    const passes = composer.passes;
    const newPasses = [passes[0], aerialPass, ...passes.slice(1)];
    // Rebuild composer passes
    while (composer.passes.length > 0) composer.removePass(composer.passes[0]);
    newPasses.forEach(p => composer.addPass(p));

    // Update sun direction based on current date
    updateSunDirection();

    setStatus('Atmosphere loaded');
    setTimeout(() => {
      document.getElementById('status').style.opacity = '0';
    }, 2000);
  } catch (err) {
    console.error('[atmosphere] Failed to load:', err);
    setStatus('Atmosphere failed to load — continuing without it');
    setTimeout(() => {
      document.getElementById('status').style.opacity = '0';
    }, 3000);
  }
}

function updateSunDirection() {
  if (!aerialPerspectiveEffect) return;
  const now = new Date();
  const sunDir = getSunDirectionECEF(now, new THREE.Vector3());
  aerialPerspectiveEffect.sunDirection.copy(sunDir);
}

function updateSunForHour(hour) {
  if (!aerialPerspectiveEffect) return;
  // Create a date at the given hour today
  const d = new Date();
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  const sunDir = getSunDirectionECEF(d, new THREE.Vector3());
  aerialPerspectiveEffect.sunDirection.copy(sunDir);
}

// ============================================================
//  TILT-SHIFT EFFECT (custom postprocessing Effect)
// ============================================================

const tiltShiftFragmentShader = /* glsl */`
uniform float focusPos;
uniform float bandSize;
uniform float blurAmount;
uniform float falloff;
uniform float satBoost;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Distance from focus band center (in screen Y)
  float dist = abs(uv.y - focusPos) / max(bandSize, 0.001);
  dist = max(dist - 1.0, 0.0);
  float t = pow(min(dist, 1.0), max(falloff, 0.1));

  // Gather blurred samples using neighbor sampling
  float blur = t * blurAmount * 0.02;
  vec4 color = inputColor;

  if (blur > 0.001) {
    vec2 texelSize = 1.0 / vec2(textureSize(inputBuffer, 0));
    vec4 sum = vec4(0.0);
    float totalWeight = 0.0;
    float radius = blur * float(textureSize(inputBuffer, 0).y);

    // 13-tap Gaussian in both directions
    for (int i = -6; i <= 6; i++) {
      for (int j = -6; j <= 6; j++) {
        float fi = float(i);
        float fj = float(j);
        float w = exp(-(fi*fi + fj*fj) / (radius * radius * 0.5 + 0.01));
        vec2 offset = vec2(fi, fj) * texelSize * radius * 0.15;
        sum += texture(inputBuffer, uv + offset) * w;
        totalWeight += w;
      }
    }
    color = sum / totalWeight;
  }

  // Saturation boost in the focus zone
  float focusMask = 1.0 - t;
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(luma), color.rgb, 1.0 + satBoost * focusMask);

  // Subtle vignette
  float vig = 1.0 - 0.3 * pow(length(uv - 0.5) * 1.4, 2.0);
  color.rgb *= vig;

  outputColor = color;
}
`;

class TiltShiftEffect extends Effect {
  constructor({
    focusPos = 0.5,
    bandSize = 0.15,
    blurAmount = 30,
    falloff = 50,
    saturation = 50
  } = {}) {
    super('TiltShiftEffect', tiltShiftFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['focusPos', { value: focusPos }],
        ['bandSize', { value: bandSize }],
        ['blurAmount', { value: blurAmount }],
        ['falloff', { value: falloff / 100 * 2.2 + 0.3 }],
        ['satBoost', { value: saturation / 100 * 1.5 }]
      ])
    });
  }
}

// ============================================================
//  POST-PROCESSING
// ============================================================

function setupPostProcessing() {
  composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType
  });

  // Render pass
  composer.addPass(new RenderPass(scene, camera));

  // Depth of field
  dofEffect = new DepthOfFieldEffect(camera, {
    worldFocusDistance: state.dof.focusDist,
    worldFocusRange: 200,
    bokehScale: state.dof.blur / 10,
    resolutionScale: 0.5
  });
  dofPass = new EffectPass(camera, dofEffect);
  dofPass.enabled = state.dof.on;
  composer.addPass(dofPass);

  // Tilt-shift
  tiltShiftEffect = new TiltShiftEffect({
    focusPos: 0.5,
    bandSize: 0.15,
    blurAmount: 30,
    falloff: 50,
    saturation: 50
  });
  tiltShiftPass = new EffectPass(camera, tiltShiftEffect);
  tiltShiftPass.enabled = false;
  composer.addPass(tiltShiftPass);

  // SSAO
  ssaoEffect = new SSAOEffect(camera, null, {
    intensity: 2.0,
    radius: 0.05,
    luminanceInfluence: 0.5,
    bias: 0.025
  });
  ssaoPass = new EffectPass(camera, ssaoEffect);
  ssaoPass.enabled = false;
  composer.addPass(ssaoPass);

  // Bloom
  bloomEffect = new BloomEffect({
    intensity: 0.5,
    luminanceThreshold: 0.8,
    luminanceSmoothing: 0.3
  });
  bloomPass = new EffectPass(camera, bloomEffect);
  bloomPass.enabled = state.bloom.on;
  composer.addPass(bloomPass);

  // Vignette
  vignetteEffect = new VignetteEffect({
    darkness: 0.5,
    offset: 0.3
  });
  vignettePass = new EffectPass(camera, vignetteEffect);
  vignettePass.enabled = state.vignette.on;
  composer.addPass(vignettePass);

  // Film grain
  noiseEffect = new NoiseEffect({ premultiply: true });
  noisePass = new EffectPass(camera, noiseEffect);
  noisePass.enabled = false;
  composer.addPass(noisePass);

  // Tone mapping
  const toneMappingEffect = new ToneMappingEffect({
    mode: ToneMappingMode.AGX
  });
  composer.addPass(new EffectPass(camera, toneMappingEffect));
}

// ============================================================
//  RENDER LOOP
// ============================================================

function animate() {
  requestAnimationFrame(animate);

  if (tiles) tiles.update();
  if (controls) controls.update();

  composer.render();
}

// ============================================================
//  RESIZE
// ============================================================

function onResize() {
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}

// ============================================================
//  UI WIRING
// ============================================================

function setupUI() {
  // FOV slider
  document.getElementById('fov-slider').addEventListener('input', (e) => {
    const mm = +e.target.value;
    document.getElementById('fov-val').textContent = mm + 'mm';
    camera.fov = focalLengthToFov(mm);
    camera.updateProjectionMatrix();
  });

  // Tilt slider (read-only — syncs from camera)
  // Heading slider (read-only — syncs from camera)
  // Range slider (read-only — syncs from camera)

  // Sync camera values to sliders periodically
  function syncSlidersFromCamera() {
    if (!camera) return;

    // Get altitude from camera position
    const carto = {};
    WGS84_ELLIPSOID.getPositionToCartographic(camera.position, carto);
    const alt = Math.round(carto.height || 0);
    document.getElementById('range-val').textContent = Math.max(0, alt).toLocaleString() + 'm';
    document.getElementById('range-slider').value = Math.min(10000, Math.max(100, alt));

    // Compute tilt (angle from straight-down)
    // Camera looking straight down = tilt 0, looking at horizon = tilt 90
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const up = camera.position.clone().normalize(); // up is away from earth center
    const dotUp = camDir.dot(up);
    // dotUp = -1 means looking straight down, 0 means looking at horizon
    const tiltDeg = Math.round(Math.max(0, Math.min(90, 90 + Math.asin(Math.max(-1, Math.min(1, dotUp))) * 180 / Math.PI)));
    document.getElementById('tilt-val').textContent = tiltDeg + '\u00B0';
    document.getElementById('tilt-slider').value = tiltDeg;

    // Heading — azimuth in the local ENU frame
    // Project camera forward onto the local tangent plane
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    const localUp = up.clone();
    // East = up × north_pole (approximate)
    const pole = new THREE.Vector3(0, 0, 1);
    east.crossVectors(pole, localUp).normalize();
    north.crossVectors(localUp, east).normalize();
    const flatDir = camDir.clone().sub(localUp.clone().multiplyScalar(camDir.dot(localUp))).normalize();
    const headingRad = Math.atan2(flatDir.dot(east), flatDir.dot(north));
    const headingDeg = Math.round(THREE.MathUtils.radToDeg(headingRad));
    document.getElementById('heading-val').textContent = headingDeg + '\u00B0';
    document.getElementById('heading-slider').value = headingDeg;

    // FOV → focal length
    const fov = camera.fov;
    const mm = Math.round(12 / Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    document.getElementById('fov-val').textContent = Math.max(14, Math.min(200, mm)) + 'mm';
    document.getElementById('fov-slider').value = Math.max(14, Math.min(200, mm));
  }

  setInterval(syncSlidersFromCamera, 200);

  // Time of day slider
  const todSlider = document.getElementById('tod-slider');
  const now = new Date();
  todSlider.value = now.getHours() + now.getMinutes() / 60;
  document.getElementById('tod-val').textContent = formatHour(+todSlider.value);

  todSlider.addEventListener('input', (e) => {
    const hour = +e.target.value;
    document.getElementById('tod-val').textContent = formatHour(hour);
    updateSunForHour(hour);
  });

  function formatHour(h) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh === 0 ? 12 : (hh > 12 ? hh - 12 : hh);
    return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ampm;
  }

  // DoF toggle
  document.getElementById('toggle-dof').addEventListener('click', function() {
    this.classList.toggle('on');
    state.dof.on = this.classList.contains('on');
    dofPass.enabled = state.dof.on;
  });

  // DoF focus distance
  document.getElementById('dof-focus-slider').addEventListener('input', (e) => {
    state.dof.focusDist = +e.target.value;
    document.getElementById('dof-focus-val').textContent = e.target.value + 'm';
    if (dofEffect && dofEffect.cocMaterial) {
      dofEffect.cocMaterial.worldFocusDistance = state.dof.focusDist;
    }
  });

  // DoF blur amount
  document.getElementById('dof-blur-slider').addEventListener('input', (e) => {
    state.dof.blur = +e.target.value;
    document.getElementById('dof-blur-val').textContent = e.target.value + '%';
    if (dofEffect) {
      if (dofEffect.cocMaterial) {
        dofEffect.cocMaterial.worldFocusRange = 50 + (100 - state.dof.blur) * 10;
      }
      dofEffect.bokehScale = state.dof.blur / 10;
    }
  });

  // Tilt-shift toggle + sliders
  document.getElementById('toggle-tiltshift').addEventListener('click', function() {
    this.classList.toggle('on');
    const on = this.classList.contains('on');
    tiltShiftPass.enabled = on;
    document.getElementById('tiltshift-settings').style.display = on ? '' : 'none';
  });
  document.getElementById('ts-pos-slider').addEventListener('input', (e) => {
    document.getElementById('ts-pos-val').textContent = e.target.value + '%';
    tiltShiftEffect.uniforms.get('focusPos').value = +e.target.value / 100;
  });
  document.getElementById('ts-band-slider').addEventListener('input', (e) => {
    document.getElementById('ts-band-val').textContent = e.target.value + '%';
    tiltShiftEffect.uniforms.get('bandSize').value = +e.target.value / 100;
  });
  document.getElementById('ts-blur-slider').addEventListener('input', (e) => {
    document.getElementById('ts-blur-val').textContent = e.target.value + '%';
    tiltShiftEffect.uniforms.get('blurAmount').value = +e.target.value;
  });

  // SSAO toggle
  document.getElementById('toggle-ssao').addEventListener('click', function() {
    this.classList.toggle('on');
    state.ssao.on = this.classList.contains('on');
    ssaoPass.enabled = state.ssao.on;
  });

  // Bloom toggle
  document.getElementById('toggle-bloom').addEventListener('click', function() {
    this.classList.toggle('on');
    state.bloom.on = this.classList.contains('on');
    bloomPass.enabled = state.bloom.on;
  });

  // Vignette toggle
  document.getElementById('toggle-vignette').addEventListener('click', function() {
    this.classList.toggle('on');
    state.vignette.on = this.classList.contains('on');
    vignettePass.enabled = state.vignette.on;
  });

  // Text overlay
  document.getElementById('toggle-text-overlay').addEventListener('click', function() {
    this.classList.toggle('on');
    document.getElementById('text-overlay').style.display = this.classList.contains('on') ? '' : 'none';
  });
  document.getElementById('text-title').addEventListener('input', (e) => {
    document.getElementById('overlay-title').textContent = e.target.value;
  });
  document.getElementById('text-subtitle').addEventListener('input', (e) => {
    document.getElementById('overlay-subtitle').textContent = e.target.value;
  });
  document.getElementById('text-coords').addEventListener('input', (e) => {
    document.getElementById('overlay-coords').textContent = e.target.value;
  });

  // Download with optional high-res
  document.getElementById('download-btn').addEventListener('click', () => {
    const scale = +(document.getElementById('export-res').value) || 1;
    const origPixelRatio = renderer.getPixelRatio();

    // Temporarily increase resolution
    if (scale > 1) {
      renderer.setPixelRatio(origPixelRatio * scale);
      const container = document.getElementById('canvas-container');
      composer.setSize(container.clientWidth, container.clientHeight);
    }

    composer.render();

    // Capture
    const dataUrl = renderer.domElement.toDataURL('image/png');

    // Composite text overlay onto the image
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Draw text overlay if visible
      const textOverlay = document.getElementById('text-overlay');
      if (textOverlay.style.display !== 'none') {
        const w = canvas.width, h = canvas.height;
        const barHeight = h * 0.12;
        const barY = h - barHeight;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, barY, w, barHeight);

        const title = document.getElementById('overlay-title').textContent;
        const subtitle = document.getElementById('overlay-subtitle').textContent;
        const coords = document.getElementById('overlay-coords').textContent;

        const titleSize = Math.round(w * 0.035);
        ctx.font = '600 ' + titleSize + 'px "Playfair Display", serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(title.toUpperCase(), w / 2, barY + barHeight * 0.42);

        ctx.font = Math.round(w * 0.015) + 'px "Inter", sans-serif';
        ctx.fillStyle = '#a1a1aa';
        ctx.fillText(subtitle, w / 2, barY + barHeight * 0.42 + titleSize * 0.7);

        ctx.font = Math.round(w * 0.012) + 'px "Space Mono", monospace';
        ctx.fillStyle = '#52525b';
        ctx.fillText(coords, w / 2, barY + barHeight * 0.42 + titleSize * 1.2);
      }

      // Download
      const link = document.createElement('a');
      link.download = 'mapposter-threejs-' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();

      // Restore resolution
      if (scale > 1) {
        renderer.setPixelRatio(origPixelRatio);
        const container = document.getElementById('canvas-container');
        composer.setSize(container.clientWidth, container.clientHeight);
      }
    };
    img.src = dataUrl;
  });

  // Click-to-focus for DoF — track mouse movement to distinguish click from drag
  let _mouseDownPos = null;
  renderer.domElement.addEventListener('mousedown', (e) => {
    _mouseDownPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('mouseup', (e) => {
    if (!state.dof.on || !_mouseDownPos) return;

    // Only focus if mouse didn't move much (click, not drag)
    const dx = e.clientX - _mouseDownPos.x;
    const dy = e.clientY - _mouseDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const intersects = raycaster.intersectObject(tiles.group, true);
    if (intersects.length > 0) {
      const dist = intersects[0].distance;
      state.dof.focusDist = dist;
      document.getElementById('dof-focus-slider').value = Math.min(5000, Math.round(dist));
      document.getElementById('dof-focus-val').textContent = Math.round(dist) + 'm';
      if (dofEffect && dofEffect.cocMaterial) {
        dofEffect.cocMaterial.worldFocusDistance = dist;
      }
      console.log('[focus] Set to', Math.round(dist) + 'm');
    }
  });

}

// ============================================================
//  AI EXPORT (Gemini Flash)
// ============================================================

const AI_PRESETS = {
  realistic: 'Make this look like a real aerial photograph taken from a helicopter with a DSLR camera. Keep the exact same buildings and layout. Just enhance realism, lighting, and detail subtly.',
  night: 'Transform this into a nighttime cityscape. Dark sky, buildings lit up with warm interior lights glowing from windows, street lights casting pools of light, subtle city glow on clouds. Keep the exact same buildings and layout.',
  golden: 'Make this look like it was photographed during golden hour. Warm amber sunlight casting long shadows, golden highlights on building facades, rich warm tones throughout. Keep the exact same buildings and layout.',
  cyberpunk: 'Transform this into a cyberpunk cityscape. Rain-slicked streets with colorful reflections, dramatic pink and cyan lighting, neon-lit atmosphere, moody fog. Do NOT add any holograms, floating objects, signs, text, or new elements — only change the lighting, colors, and mood. Keep the exact same buildings, composition, and layout.',
  watercolor: 'Render this as a beautiful watercolor painting. Soft wet-on-wet washes of color, visible paper texture, gentle color bleeding at edges, artistic and painterly feel. Keep the same composition and buildings.',
  blueprint: 'Transform this into an architectural blueprint style. White lines on dark blue background, technical drawing aesthetic, building outlines and structural details emphasized. Do NOT add any labels, text, callouts, annotations, dimensions, or measurement lines — just the line art of the buildings. Keep the exact same composition and layout.',
  infrared: 'Make this look like infrared photography. Vegetation appears bright white/pink, sky is dark and dramatic, buildings have an ethereal glow, surreal color palette with magentas and deep blues. Keep the exact same layout.',
  snowfall: 'Add a winter snowfall scene. Snow covering rooftops and streets, snowflakes falling, overcast sky, warm lights from windows contrasting with cold blue-white snow. Keep the exact same buildings and layout.',
  lineart: 'Transform this into a clean black and white line drawing. Thin ink lines on white background, architectural sketch style with clean outlines of buildings, streets, and details. No shading or fills, just precise linework. Keep the exact same layout.'
};

function setupAI() {
  // Gemini key persistence
  const cachedGeminiKey = localStorage.getItem('mapposter3d_gemini_key') || '';
  if (cachedGeminiKey) document.getElementById('gemini-api-key').value = cachedGeminiKey;
  document.getElementById('gemini-api-key').addEventListener('change', function() {
    localStorage.setItem('mapposter3d_gemini_key', this.value.trim());
  });

  // AI enhance toggle
  let aiEnhanceOn = false;
  document.getElementById('toggle-ai-enhance').addEventListener('click', function() {
    this.classList.toggle('on');
    aiEnhanceOn = this.classList.contains('on');
    document.getElementById('ai-settings').style.display = aiEnhanceOn ? '' : 'none';
  });

  // Preset buttons
  document.querySelectorAll('.ai-preset').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.ai-preset').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      document.getElementById('gemini-prompt').value = AI_PRESETS[this.dataset.preset];
    });
  });

  // Override download button when AI is on
  const origDownloadBtn = document.getElementById('download-btn');
  const statusEl = document.getElementById('export-status');

  origDownloadBtn.addEventListener('click', (e) => {
    if (!aiEnhanceOn) return; // normal download handled elsewhere
    e.stopImmediatePropagation();

    const geminiKey = document.getElementById('gemini-api-key').value.trim();
    if (!geminiKey) { alert('Enter your Gemini API key'); return; }

    const prompt = document.getElementById('gemini-prompt').value.trim() ||
      'Make this look like a real aerial photograph. Keep the exact same buildings and layout. Enhance realism subtly.';

    statusEl.style.display = '';
    statusEl.textContent = 'Capturing...';

    // Capture current view
    composer.render();
    const captureDataUrl = renderer.domElement.toDataURL('image/jpeg', 0.85);

    // Scale down for Gemini
    const img = new Image();
    img.onload = () => {
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const sendCanvas = document.createElement('canvas');
      sendCanvas.width = Math.round(img.width * scale);
      sendCanvas.height = Math.round(img.height * scale);
      sendCanvas.getContext('2d').drawImage(img, 0, 0, sendCanvas.width, sendCanvas.height);
      const base64Data = sendCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];

      statusEl.textContent = 'AI enhancing with Gemini Flash...';

      const payload = JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
        ]}],
        generationConfig: { responseModalities: ['image', 'text'] }
      });

      const xhr = new XMLHttpRequest();
      xhr.timeout = 120000;
      xhr.open('POST', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=' + geminiKey, true);
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.ontimeout = () => { statusEl.textContent = 'Timeout — try again'; };
      xhr.onerror = () => { statusEl.textContent = 'Network error'; };
      xhr.onload = () => {
        if (xhr.status !== 200) {
          let errMsg = 'API error ' + xhr.status;
          try { errMsg = JSON.parse(xhr.responseText).error.message.substring(0, 80); } catch(e) {}
          statusEl.textContent = errMsg;
          return;
        }
        let result;
        try { result = JSON.parse(xhr.responseText); } catch(e) {
          statusEl.textContent = 'Bad response'; return;
        }
        let imageData = null;
        for (const cand of (result.candidates || [])) {
          for (const part of (cand.content?.parts || [])) {
            if (part.inlineData?.data) { imageData = part.inlineData; break; }
          }
          if (imageData) break;
        }
        if (!imageData) { statusEl.textContent = 'No image returned'; return; }

        const enhancedUrl = 'data:' + (imageData.mimeType || 'image/png') + ';base64,' + imageData.data;
        statusEl.textContent = 'Downloading...';

        // Download the AI-enhanced image
        const link = document.createElement('a');
        link.download = 'mapposter-ai-' + Date.now() + '.png';
        link.href = enhancedUrl;
        link.click();

        statusEl.textContent = 'Done!';
        setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
      };
      xhr.send(payload);
    };
    img.src = captureDataUrl;
  }, true); // useCapture to fire before the normal download handler
}

// ============================================================
//  SESSION PERSISTENCE
// ============================================================

const SESSION_KEY = 'mapposter3d_threejs_session';
let _saveTimer = null;

function saveSession() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (!camera) return;
    const carto = {};
    WGS84_ELLIPSOID.getPositionToCartographic(camera.position, carto);
    const data = {
      camera: {
        lat: carto.lat * 180 / Math.PI,
        lng: carto.lon * 180 / Math.PI,
        height: carto.height,
        qx: camera.quaternion.x,
        qy: camera.quaternion.y,
        qz: camera.quaternion.z,
        qw: camera.quaternion.w
      },
      fov: camera.fov,
      state: state,
      tod: document.getElementById('tod-slider') ? +document.getElementById('tod-slider').value : 12
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch(e) {}
  }, 500);
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function restoreSession() {
  const saved = loadSession();
  if (!saved || !saved.camera) return;

  // Restore camera position
  const pos = new THREE.Vector3();
  WGS84_ELLIPSOID.getCartographicToPosition(
    saved.camera.lat * Math.PI / 180,
    saved.camera.lng * Math.PI / 180,
    saved.camera.height,
    pos
  );
  camera.position.copy(pos);
  camera.quaternion.set(saved.camera.qx, saved.camera.qy, saved.camera.qz, saved.camera.qw);

  // Restore FOV
  if (saved.fov) {
    camera.fov = saved.fov;
    camera.updateProjectionMatrix();
  }

  // Restore time of day
  if (saved.tod !== undefined) {
    document.getElementById('tod-slider').value = saved.tod;
    document.getElementById('tod-val').textContent = formatHourGlobal(saved.tod);
    updateSunForHour(saved.tod);
  }

  // Restore effect states
  if (saved.state) {
    Object.assign(state, saved.state);
    dofPass.enabled = state.dof.on;
    document.getElementById('toggle-dof').classList.toggle('on', state.dof.on);
    bloomPass.enabled = state.bloom.on;
    document.getElementById('toggle-bloom').classList.toggle('on', state.bloom.on);
    vignettePass.enabled = state.vignette.on;
    document.getElementById('toggle-vignette').classList.toggle('on', state.vignette.on);
    ssaoPass.enabled = state.ssao.on;
    document.getElementById('toggle-ssao').classList.toggle('on', state.ssao.on);
  }
}

// Global formatHour for use outside setupUI
function formatHourGlobal(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh === 0 ? 12 : (hh > 12 ? hh - 12 : hh);
  return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ampm;
}

// ============================================================
//  API KEY HANDLING
// ============================================================

// Try the Google key from the Cesium prototype first
const KNOWN_KEY = 'AIzaSyCIsBRv6ZcKXhIecWHAOOLkwmLKQcsocKg';
const cachedKey = localStorage.getItem('mapposter_google_key') || KNOWN_KEY;
const keyInput = document.getElementById('api-key-input');

if (cachedKey) {
  keyInput.value = cachedKey;
  init(cachedKey);
}

document.getElementById('api-key-submit').addEventListener('click', () => {
  const key = keyInput.value.trim();
  if (!key) return;
  localStorage.setItem('mapposter_google_key', key);
  init(key);
});

keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('api-key-submit').click();
});
