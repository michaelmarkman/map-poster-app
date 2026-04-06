import * as THREE from 'three';
import { TilesRenderer, WGS84_ELLIPSOID, GlobeControls } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import {
  EffectComposer, RenderPass, EffectPass,
  DepthOfFieldEffect, BloomEffect, VignetteEffect, NoiseEffect,
  ToneMappingEffect, ToneMappingMode
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
let dofEffect, bloomEffect, vignetteEffect, noiseEffect;
let dofPass, bloomPass, vignettePass, noisePass;
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

  // Download
  document.getElementById('download-btn').addEventListener('click', () => {
    composer.render();
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'mapposter-threejs-' + Date.now() + '.png';
    link.href = dataUrl;
    link.click();
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
