import * as THREE from 'three';
import { TilesRenderer, WGS84_ELLIPSOID, GlobeControls } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import {
  EffectComposer, RenderPass, EffectPass,
  DepthOfFieldEffect, BloomEffect, VignetteEffect, NoiseEffect,
  ToneMappingEffect, ToneMappingMode
} from 'postprocessing';

// ============================================================
//  STATE
// ============================================================

let renderer, scene, camera, composer;
let tiles, controls;
let dofEffect, bloomEffect, vignetteEffect, noiseEffect;
let dofPass, bloomPass, vignettePass, noisePass;

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

  // Add some ambient light so tiles are visible before atmosphere is added
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(1, 1, 1).normalize();
  scene.add(dirLight);

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
//  POST-PROCESSING
// ============================================================

function setupPostProcessing() {
  composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: 4
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

  // Tilt / heading / range sliders — these are display-only for now
  // (GlobeControls handles camera interaction, sliders sync from camera)

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

  // Click-to-focus for DoF
  renderer.domElement.addEventListener('click', (e) => {
    if (!state.dof.on) return;
    // Don't focus on drag
    if (controls && controls.isActive) return;

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

  // Sync camera sliders from controls
  if (controls) {
    const syncSliders = () => {
      if (!camera) return;
      const pos = new THREE.Vector3();
      const target = {};
      WGS84_ELLIPSOID.getPositionToCartographic(camera.position, target);
      const alt = Math.round(target.height || 0);
      document.getElementById('range-val').textContent = alt.toLocaleString() + 'm';
      document.getElementById('range-slider').value = Math.min(10000, alt);

      // FOV to focal length
      const fov = camera.fov;
      const mm = Math.round(12 / Math.tan(THREE.MathUtils.degToRad(fov) / 2));
      document.getElementById('fov-val').textContent = Math.max(14, Math.min(200, mm)) + 'mm';
      document.getElementById('fov-slider').value = Math.max(14, Math.min(200, mm));
    };

    // Sync periodically
    setInterval(syncSliders, 500);
  }
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
