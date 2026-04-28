import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  aiApiKeyAtom,
  aiEnhanceAtom,
  aiPresetAtom,
  aiPromptAtom,
  exportResolutionAtom,
  queueAtom,
  savedViewsAtom,
} from '../atoms/sidebar'
import { dofAtom } from '../atoms/scene'
import {
  buildFilename,
  composite,
  downloadDataUrl,
  snapshotCanvas,
} from '../utils/export'

// Queue hook — port of the export queue wiring from prototypes/poster-v3-ui.jsx
// (lines 1997-2425). The prototype kept `exportQueue` as a module-scoped
// array; here we mirror it through the queueAtom so the sidebar can render it
// without additional bookkeeping. Job status/progress updates go through the
// atom setter so UI re-renders on each transition.
//
// Events consumed (all dispatched on window via ExportSection / mobile UI):
//   quick-download      -> snapshot + download (no queue entry, no AI)
//   add-to-queue        -> create one job (AI preset selected or raw/custom)
//   generate-all        -> create one job per preset in AI_PRESETS, share batchId
//   queue-clear-done    -> drop entries with status === 'done'
//   queue-clear-all     -> drop everything
//   clear-queue         -> legacy alias dispatched by ExportSection
//   batch-export        -> for each saved view: restore -> snapshot -> queue
//
// Events emitted:
//   gallery-add          -> useGalleryData persists + mirrors into atom
//   export-status        -> human-readable status for the queue panel footer

// Preset catalog. Mirrors AI_PRESETS in prototypes/poster-v3-ui.jsx:1732 so
// generate-all and preset-keyed single jobs produce the same prompts the
// prototype used. Only the fields this hook actually needs (label, prompt)
// are kept.
const AI_PRESETS = {
  realistic: {
    label: 'Realistic',
    prompt:
      'Make this look like a real aerial photograph taken from a helicopter with a DSLR camera. Keep the exact same buildings and layout. Just enhance realism, lighting, and detail subtly.',
  },
  golden: {
    label: 'Golden Hour',
    prompt:
      'Make this look like it was photographed during golden hour. Warm amber sunlight casting long shadows, golden highlights on building facades, rich warm tones throughout. Keep the exact same buildings and layout.',
  },
  retro70s: {
    label: '70s Film',
    prompt:
      'Make this look like a faded 1970s aerial photograph. Warm color cast shifted toward amber and brown, slightly washed-out highlights, soft film grain, muted greens, the nostalgic look of old Kodachrome or Ektachrome film. Keep the exact same buildings and layout.',
  },
  polaroid: {
    label: 'Polaroid',
    prompt:
      'Give this image the color and tonal qualities of Polaroid instant film (SX-70 or 600). Washed-out highlights, slightly lifted blacks, warm cream-yellow color cast, gentle magenta tint in the shadows, soft dreamy quality, subtle haze. Do NOT add a white Polaroid border, frame, or the physical print look — this should still be a full-bleed aerial photo, just with the Polaroid color palette applied. Keep the exact same buildings and layout.',
  },
  postcard: {
    label: 'Vintage Postcard',
    prompt:
      'Transform this into an old printed aerial photograph from a mid-century vintage postcard. Limited offset-print color palette with slight registration offset, visible halftone dot pattern, muted saturated colors, soft painterly edges, faded white border feel, the look of a 1950s linen-texture postcard. Do NOT add any text, labels, captions, greetings, stamps, or written elements of any kind — just the image itself. Keep the exact same buildings and layout.',
  },
  travelposter: {
    label: 'Travel Poster',
    prompt:
      'Transform this into a vintage 1930s travel poster illustration in the style of Roger Broders or Cassandre. Bold flat colors, art deco stylization, simplified geometric shapes, strong diagonal composition, limited 4-5 color palette with warm oranges, deep teals, and cream. Clean hard-edged shapes with no photographic detail, graphic illustration feel. NO text or labels. Keep the exact same buildings, streets, and composition recognizable.',
  },
  night: {
    label: 'Night',
    prompt:
      'Transform this into a nighttime cityscape. Dark sky, buildings lit up with warm interior lights glowing from windows, street lights casting pools of light, subtle city glow on clouds. Keep the exact same buildings and layout.',
  },
  snowfall: {
    label: 'Snowfall',
    prompt:
      'Add a winter snowfall scene. Snow covering rooftops and streets, snowflakes falling, overcast sky, warm lights from windows contrasting with cold blue-white snow. Keep the exact same buildings and layout.',
  },
  autumn: {
    label: 'Autumn',
    prompt:
      'Transform all vegetation to peak autumn foliage — vibrant oranges, deep reds, golden yellows on every tree and park. Warm afternoon light, a few scattered fallen leaves on streets and rooftops. Keep the exact same buildings, streets, and layout.',
  },
  cherry: {
    label: 'Cherry Blossom',
    prompt:
      'Add cherry blossom trees in full bloom — soft pink and white blossoms on all trees, some petals drifting in the air, gentle spring light. Keep the exact same buildings, streets, and layout.',
  },
  rainy: {
    label: 'Rainy',
    prompt:
      'Make this a moody rainy day. Wet streets with reflections, overcast grey sky, puddles on flat surfaces, rain visible in the air, everything glistening. Muted, cool color palette. Keep the exact same buildings and layout.',
  },
  foggy: {
    label: 'Foggy Dawn',
    prompt:
      'Add thick low-lying fog rolling between the buildings at dawn. Tops of taller buildings poke above the fog layer, soft golden sunrise light filtering through, ethereal and dreamlike. Keep the exact same buildings and layout.',
  },
  watercolor: {
    label: 'Watercolor',
    prompt:
      'Render this as a beautiful watercolor painting. Soft wet-on-wet washes of color, visible paper texture, gentle color bleeding at edges, artistic and painterly feel. Keep the same composition and buildings.',
  },
  oilpaint: {
    label: 'Oil Painting',
    prompt:
      'Transform this into a rich oil painting with visible thick impasto brushstrokes, deep saturated colors, and dramatic chiaroscuro lighting. Think classic Dutch Golden Age cityscape painting but from an aerial view. Keep the same composition and buildings.',
  },
  lineart: {
    label: 'Line Drawing',
    prompt:
      'Transform this into a clean black and white line drawing. Thin ink lines on white background, architectural sketch style with clean outlines of buildings, streets, and details. No shading or fills, just precise linework. Keep the exact same layout.',
  },
  pastel: {
    label: 'Pastel Dream',
    prompt:
      'Transform this into a soft pastel dreamscape. Muted cotton candy colors — lavender, peach, mint, baby blue. Soft diffused light, everything looks gentle and dreamy like a tilt-shift architectural model render. Keep the exact same buildings and layout.',
  },
  blueprint: {
    label: 'Blueprint',
    prompt:
      'Transform this into an architectural blueprint style. White lines on dark blue background, technical drawing aesthetic, building outlines and structural details emphasized. Do NOT add any labels, text, callouts, annotations, dimensions, or measurement lines — just the line art of the buildings. Keep the exact same composition and layout.',
  },
  pixel: {
    label: 'Pixel Art',
    prompt:
      'Transform this into 16-bit pixel art style, like a retro top-down city builder game. Chunky visible pixels, limited color palette, clean pixel edges on buildings and roads, charming and nostalgic. Keep the exact same layout and composition.',
  },
  cyberpunk: {
    label: 'Cyberpunk',
    prompt:
      'Transform this into a cyberpunk cityscape. Rain-slicked streets with colorful reflections, dramatic pink and cyan lighting, neon-lit atmosphere, moody fog. Do NOT add any holograms, floating objects, signs, text, or new elements — only change the lighting, colors, and mood. Keep the exact same buildings, composition, and layout.',
  },
  ghibli: {
    label: 'Studio Ghibli',
    prompt:
      'Transform this into Studio Ghibli anime art style. Lush hand-painted look with rich greens and warm light, puffy cumulus clouds, whimsical and slightly fantastical atmosphere, the signature Miyazaki feeling of a lived-in, beautiful world seen from above. Keep the exact same buildings and layout.',
  },
  gouache: {
    label: 'Gouache',
    prompt:
      "Render this as an opaque gouache painting in the style of a mid-century children's storybook illustration — Miroslav Šašek or Alice and Martin Provensen. Matte flat paint with visible brushstrokes, warm earthy palette, naive simplified architectural forms, gentle storybook feel. Keep the same composition and buildings recognizable.",
  },
  stainedglass: {
    label: 'Stained Glass',
    prompt:
      'Transform this into a stained glass window. Thick black leading outlining every building, street, and shape, filled with vibrant saturated jewel-tone glass — deep blues, rich reds, amber, emerald, violet. Each color cell reads as a flat translucent pane of glass. The composition retains the same layout but is simplified into larger planar shapes. No text. Keep the same overall composition.',
  },
  pencilsketch: {
    label: 'Pencil Sketch',
    prompt:
      "Transform this into a detailed graphite pencil sketch on cream textured paper. Visible pencil strokes with varying pressure, soft shading on building facades, darker edges where shadows fall, subtle smudges and eraser marks, the unfinished spontaneous feel of an architect's field sketch. No color — only graphite tones on off-white paper. Keep the exact same buildings, streets, and composition.",
  },
  crosshatch: {
    label: 'Ink Crosshatch',
    prompt:
      'Transform this into a detailed ink crosshatching drawing in the style of Albrecht Dürer or a 19th-century steel engraving. Dense black ink crosshatch lines defining form and shadow, finer hatching for lighter surfaces, pure white highlights, cream-toned paper background. No solid fills — every tone built from crossed lines. Keep the exact same buildings, streets, and composition.',
  },
  charcoal: {
    label: 'Charcoal',
    prompt:
      'Transform this into an expressive charcoal drawing on off-white paper. Bold smudgy charcoal strokes, rich velvety blacks in the shadows, soft rubbed-in grey mid-tones, white highlights where the paper shows through, dramatic chiaroscuro. The energetic loose quality of a life drawing. No color — charcoal tones only. Keep the exact same composition and buildings.',
  },
  architect: {
    label: 'Architect Marker',
    prompt:
      "Transform this into a confident architect's presentation sketch. Loose black felt-tip pen lines with deliberate overshoots at building corners, soft grey and warm tan marker washes for shading, splashes of sky-blue marker for the sky, off-white paper background. The energetic professional look of a SketchUp presentation render or a loose Zaha Hadid working sketch. No text, annotations, dimensions, or measurements. Keep the exact same buildings and composition.",
  },
  traveljournal: {
    label: 'Travel Journal',
    prompt:
      'Transform this into a loose urban sketcher travel journal page in the style of Danny Gregory or Felix Scheinberger. Quick confident ink lines with imperfect hand-drawn perspective, watercolor washes dropped on top with soft color bleeds spilling beyond the lines, visible cream paper texture, unpainted areas of white paper, warm earth tones and pale sky blue, the spontaneous look of an in-situ sketch done on location. No text or captions. Keep the same composition and buildings recognizable.',
  },
  woodblock: {
    label: 'Ukiyo-e Print',
    prompt:
      'Transform this into a traditional Japanese ukiyo-e woodblock print in the style of Hokusai or Hiroshige. Bold black outlines with flat areas of muted color — prussian blue, soft vermilion, cream, pale green, mustard — using the characteristic flattened perspective and graphic simplification of architectural forms. Slight visible registration offsets between color blocks, subtle wood-grain texture in the flat color fields. No text. Keep the same composition and buildings recognizable.',
  },
}

// Monotonic job id. Module-scoped so ids stay unique across hook
// re-invocations (StrictMode double-mount, fast refresh) without having to
// thread a ref through every event handler.
let nextJobId = 1

function emitStatus(text) {
  window.dispatchEvent(new CustomEvent('export-status', { detail: text || '' }))
}

function getLocation() {
  try {
    return document.getElementById('location-search')?.value || ''
  } catch (e) {
    return ''
  }
}

// Gemini call — mirrors sendToGemini from poster-v3-ui.jsx:2215. The server
// proxy at /api/gemini expects the raw Gemini REST payload; `apiKey` is sent
// alongside so the server can fall back to the caller's key when no
// GEMINI_API_KEY env var is configured. Server strips `apiKey` from the body
// before forwarding to Gemini.
async function callGemini(snapshotDataUrl, prompt, apiKey) {
  // Scale to <=1024px on the long edge before sending — keeps the request
  // well under Gemini's inline-data limits and matches the prototype.
  const img = await loadImage(snapshotDataUrl)
  const maxDim = 1024
  const scl = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const sendCanvas = document.createElement('canvas')
  sendCanvas.width = Math.round(img.naturalWidth * scl)
  sendCanvas.height = Math.round(img.naturalHeight * scl)
  sendCanvas.getContext('2d').drawImage(img, 0, 0, sendCanvas.width, sendCanvas.height)
  const base64 = sendCanvas.toDataURL('image/jpeg', 0.85).split(',')[1]

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        ],
      },
    ],
    generationConfig: { responseModalities: ['image', 'text'] },
  }

  const url = '/api/gemini?model=gemini-3.1-flash-image-preview'
  const headers = { 'Content-Type': 'application/json' }
  const body = apiKey ? { ...payload, apiKey } : payload

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `API error ${res.status}`
    try { msg = (await res.json()).error?.message?.slice(0, 80) || msg } catch (e) {}
    throw new Error(msg)
  }
  const result = await res.json()
  for (const cand of result.candidates || []) {
    for (const part of cand.content?.parts || []) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
      }
    }
  }
  throw new Error('No image returned')
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

export default function useQueue() {
  const [queue, setQueue] = useAtom(queueAtom)
  const aiEnhance = useAtomValue(aiEnhanceAtom)
  const aiPrompt = useAtomValue(aiPromptAtom)
  const aiPreset = useAtomValue(aiPresetAtom)
  const aiKey = useAtomValue(aiApiKeyAtom)
  const resolution = useAtomValue(exportResolutionAtom)
  const savedViews = useAtomValue(savedViewsAtom)
  const dof = useAtomValue(dofAtom)

  // Latest-settings ref — event listeners capture stale closures otherwise.
  const settingsRef = useRef({})
  settingsRef.current = {
    aiEnhance,
    aiPrompt,
    aiPreset,
    aiKey,
    resolution,
    savedViews,
    dof,
  }

  // Queue snapshot ref so async processors can read the newest array without
  // re-subscribing each tick.
  const queueRef = useRef(queue)
  queueRef.current = queue

  // Processor loop — single-concurrency like the prototype's exportProcessing
  // flag. Runs until there are no more pending jobs, then releases.
  const processingRef = useRef(false)

  useEffect(() => {
    function updateJob(id, fields) {
      setQueue((cur) => cur.map((j) => (j.id === id ? { ...j, ...fields } : j)))
      // Keep queueRef in sync inline so the running processor sees the latest
      // values immediately (React batches setQueue across microtasks).
      queueRef.current = queueRef.current.map((j) =>
        j.id === id ? { ...j, ...fields } : j,
      )
    }

    function addJob(job) {
      const entry = {
        id: nextJobId++,
        status: 'pending',
        statusText: 'Queued',
        progress: 0,
        resultUrl: null,
        startedAt: Date.now(),
        ...job,
      }
      setQueue((cur) => [...cur, entry])
      queueRef.current = [...queueRef.current, entry]
      return entry
    }

    async function runJob(job) {
      // Already-captured snapshot locks the view to the moment the job was
      // created — matches the prototype (see poster-v3-ui.jsx:2312).
      const snapshotUrl = job.snapshot
      if (!snapshotUrl) {
        updateJob(job.id, { status: 'error', statusText: 'No snapshot' })
        return
      }

      updateJob(job.id, { status: 'active', statusText: 'Capturing...', progress: 10 })

      if (!job.useAI) {
        updateJob(job.id, { statusText: 'Exporting...', progress: 60 })
        const fname = buildFilename(job.label === 'Raw' ? 'raw' : job.label, {
          resolution: job.resolution,
          location: job.location,
        })
        // Auto-download when the job wasn't part of a batch (matches prototype).
        if (!job.batchId) downloadDataUrl(snapshotUrl, fname)
        dispatchGalleryAdd(job.label, fname, snapshotUrl, {
          batchId: job.batchId,
          batchLabel: job.batchLabel,
          view: job.view,
          baseImage: job.baseImage || snapshotUrl,
          graphicsJSON: job.graphicsJSON || null,
        })
        updateJob(job.id, {
          status: 'done',
          statusText: 'Done',
          progress: 100,
          resultUrl: snapshotUrl,
        })
        return
      }

      updateJob(job.id, { statusText: 'AI enhancing...', progress: 25 })

      // Light progress pulse while the request is in flight — purely cosmetic.
      const pulse = setInterval(() => {
        const cur = queueRef.current.find((j) => j.id === job.id)
        if (cur && cur.status === 'active' && cur.progress < 75) {
          updateJob(job.id, { progress: cur.progress + 2 })
        }
      }, 1000)

      try {
        // Send the raw snapshot to Gemini (no graphics baked in — they get
        // re-stylized otherwise). Composite the saved graphics layer back
        // on top of the AI result here so text/shapes stay pixel-crisp.
        const aiResult = await callGemini(snapshotUrl, job.prompt, job.apiKey)
        clearInterval(pulse)
        let finalUrl = aiResult
        if (job.includeGraphicsAfter !== false && job.graphicsJSON) {
          try {
            updateJob(job.id, { statusText: 'Compositing...', progress: 90 })
            finalUrl = (await composite(aiResult, { includeGraphics: true })) || aiResult
          } catch {}
        }
        const fname = buildFilename(job.label, {
          resolution: job.resolution,
          location: job.location,
        })
        if (!job.batchId) downloadDataUrl(finalUrl, fname)
        dispatchGalleryAdd(job.label, fname, finalUrl, {
          batchId: job.batchId,
          batchLabel: job.batchLabel,
          view: job.view,
          baseImage: aiResult,
          graphicsJSON: job.graphicsJSON || null,
        })
        updateJob(job.id, {
          status: 'done',
          statusText: 'Done',
          progress: 100,
          resultUrl: finalUrl,
        })
      } catch (err) {
        clearInterval(pulse)
        updateJob(job.id, {
          status: 'error',
          statusText: err?.message?.slice(0, 80) || 'Error',
        })
      }
    }

    async function processQueue() {
      if (processingRef.current) return
      processingRef.current = true
      try {
        while (true) {
          const next = queueRef.current.find((j) => j.status === 'pending')
          if (!next) break
          emitStatus(`Rendering ${next.label || 'job'}…`)
          // eslint-disable-next-line no-await-in-loop
          await runJob(next)
        }
        emitStatus('')
      } finally {
        processingRef.current = false
      }
    }

    function dispatchGalleryAdd(label, filename, dataUrl, opts) {
      window.dispatchEvent(
        new CustomEvent('gallery-add', {
          detail: { label, filename, dataUrl, opts: opts || {} },
        }),
      )
    }

    // Request the current camera state from Scene so we can persist it on a
    // gallery entry. Returns null if Scene's get-camera listener doesn't
    // reply within 300ms (e.g. Scene not mounted). Same pattern as
    // useSavedViews.requestCameraState.
    function captureCurrentView() {
      return new Promise((resolve) => {
        let done = false
        const finish = (v) => { if (!done) { done = true; resolve(v) } }
        const timer = setTimeout(() => finish(null), 300)
        try {
          window.dispatchEvent(new CustomEvent('get-camera', {
            detail: { resolve: (cam) => { clearTimeout(timer); finish(cam || null) } },
          }))
        } catch {
          clearTimeout(timer)
          finish(null)
        }
      })
    }

    // Universal instructions appended to every preset prompt.
    //
    // 1. Photogrammetry cleanup — the source is a Google 3D Tiles render,
    //    which means building corners, rooftop edges, and tree silhouettes
    //    are made of polygon facets that read as jagged, blocky, or
    //    crumpled at close zoom. Without this instruction the AI faithfully
    //    reproduces those artifacts as if they were intentional features
    //    (visible in early renders: woodblock buildings with "wavy"
    //    corners, watercolor rooftops that look crumpled). Tell the model
    //    to interpret the source as a 3D-mesh approximation of real
    //    architecture, not as photographic ground truth.
    //
    // 2. DoF preservation — when the user has DoF on, keep the focused
    //    area sharp and reproduce the OOF blur falloff (otherwise the AI
    //    "fixes" the blur and the focal plane is lost).
    //
    // Mirrors `appendEffectPrompts` in the prototype (poster-v3-ui.jsx:~2291).
    function appendEffectPrompts(prompt) {
      let out = prompt
      out +=
        ' The source is a 3D photogrammetry capture from satellite/aerial scanning — building corners, rooftop edges, and tree silhouettes may appear jagged, faceted, blocky, or crumpled due to polygon mesh artifacts. Interpret these as their real-world clean architectural form: straight vertical building corners, flat clean rooftops, smooth straight edges, well-defined silhouettes. Do not faithfully reproduce mesh facets, polygon jaggedness, or blocky distortion — render the architecture as it would actually look in real life, with crisp clean lines.'
      if (settingsRef.current.dof?.on) {
        out +=
          ' Preserve the depth-of-field blur exactly as shown in the input — keep the focused area tack-sharp and reproduce the background and foreground blur with the same falloff and intensity. Do not sharpen blurred regions.'
      }
      return out
    }

    function promptFor(presetKey, fallback) {
      const p = AI_PRESETS[presetKey]
      if (p) return appendEffectPrompts(p.prompt)
      return appendEffectPrompts(
        fallback ||
          'Make this look like a real aerial photograph. Keep the exact same buildings and layout. Enhance realism subtly.',
      )
    }

    // ─── Event handlers ─────────────────────────────────────────

    async function onQuickDownload() {
      const raw = snapshotCanvas(settingsRef.current.resolution)
      if (!raw) return
      // Composite is a no-op today (see utils/export.js) but we route through
      // it so wiring the overlay in a later phase only touches that util.
      const dataUrl = await composite(raw)
      const fname = buildFilename('raw', {
        resolution: settingsRef.current.resolution,
        location: getLocation(),
      })
      downloadDataUrl(dataUrl, fname)
      // Capture the current camera view so the gallery entry can power
      // 'Jump to view' later. Without this, quick-download entries have
      // view=null and the lightbox greys the button out.
      const view = await captureCurrentView()
      dispatchGalleryAdd('Quick', fname, dataUrl, { view })
    }

    // /mock dispatches `add-to-queue` with a detail payload to override
    // settingsRef-derived behavior on a per-job basis:
    //   { preset: string|null, includeGraphics: boolean, prompt?: string }
    // - preset === null  → raw export (no AI), regardless of aiPreset state
    // - preset === string → that preset is used for this single job
    // - includeGraphics === false → graphics layer is dropped from the result
    // - prompt → custom prompt override (used by 'custom' preset)
    // /app's ExportSection still fires `add-to-queue` with no detail; that
    // path falls through to settingsRef as before.
    //
    // IMPORTANT: graphics are *never* sent to Gemini — we always snapshot
    // raw and composite the Fabric overlay back on top of the AI result
    // afterwards. This keeps text/shapes pixel-crisp instead of getting
    // re-stylized by the AI. The graphics layer is also captured as JSON
    // and stored on the gallery entry so it can be hidden / edited later.
    async function onAddToQueue(e) {
      const detail = e?.detail || {}
      const overridePreset = Object.hasOwn(detail, 'preset') ? detail.preset : undefined
      const includeGraphics = detail.includeGraphics !== false // default true
      const overridePrompt = typeof detail.prompt === 'string' ? detail.prompt : null

      // Raw snapshot — no graphics baked in. Used as-is for AI; composited
      // for raw exports below.
      const rawSnapshot = snapshotCanvas(settingsRef.current.resolution)
      if (!rawSnapshot) return

      // Capture the live Fabric state at queue time so a later edit/replay
      // can rebuild the graphics layer exactly as it was at this moment.
      let graphicsJSON = null
      try {
        const fabric = window.__editorOverlayFabric
        if (fabric && fabric.getObjects && fabric.getObjects().filter((o) => !o.excludeFromExport).length > 0) {
          graphicsJSON = JSON.stringify(
            fabric.toJSON(['name', 'editorType', 'lockMovementX', 'lockMovementY', 'excludeFromExport']),
          )
        }
      } catch {}

      const s = settingsRef.current
      const location = getLocation()
      const view = await captureCurrentView()

      const presetKey = overridePreset !== undefined ? overridePreset : s.aiPreset
      const baseJob = {
        resolution: s.resolution,
        location,
        apiKey: s.aiKey,
        view,
        graphicsJSON,
        includeGraphicsAfter: includeGraphics,
        // Propagate batch info from the dispatcher (Render sheet sends
        // these when the user picks multiple styles at once so they
        // group as a single batch in the queue list).
        batchId: detail.batchId ?? null,
        batchLabel: detail.batchLabel ?? null,
      }

      if (presetKey === null) {
        // Raw — composite graphics now and queue.
        const final = includeGraphics ? await composite(rawSnapshot, { includeGraphics: true }) : rawSnapshot
        addJob({
          ...baseJob,
          label: 'Raw',
          prompt: '',
          useAI: false,
          snapshot: final,
          baseImage: rawSnapshot,
        })
      } else if (s.aiEnhance && presetKey) {
        const preset = AI_PRESETS[presetKey]
        addJob({
          ...baseJob,
          label: preset?.label || presetKey,
          prompt: promptFor(presetKey, overridePrompt ?? s.aiPrompt),
          useAI: true,
          snapshot: rawSnapshot, // sent to Gemini raw
          preset: presetKey,
        })
      } else {
        const useAI = !!s.aiEnhance
        const label = useAI ? 'Custom' : 'Raw'
        const prompt = useAI ? appendEffectPrompts(overridePrompt ?? s.aiPrompt) : ''
        const final = !useAI && includeGraphics
          ? await composite(rawSnapshot, { includeGraphics: true })
          : rawSnapshot
        addJob({
          ...baseJob,
          label,
          prompt,
          useAI,
          snapshot: final,
          baseImage: rawSnapshot,
        })
      }

      try { window.__openQueueDropdown?.() } catch (e) {}
      processQueue()
    }

    async function onGenerateAll() {
      const snapshot = await composite(snapshotCanvas(settingsRef.current.resolution))
      if (!snapshot) return
      const s = settingsRef.current
      const location = getLocation()
      const batchId = 'batch-' + Date.now()
      const batchLabel = (location ? location.split(',')[0] : 'All Styles') + ' · All Styles'

      // If a single preset is selected, only render that one; otherwise fan
      // out across every preset. Matches the spec ("each active AI preset
      // (or just the selected one)").
      const keys = s.aiPreset ? [s.aiPreset] : Object.keys(AI_PRESETS)
      for (const key of keys) {
        const preset = AI_PRESETS[key]
        addJob({
          label: preset.label || key,
          prompt: promptFor(key),
          useAI: true,
          snapshot,
          resolution: s.resolution,
          location,
          apiKey: s.aiKey,
          preset: key,
          batchId,
          batchLabel,
        })
      }
      try { window.__openQueueDropdown?.() } catch (e) {}
      processQueue()
    }

    function onClearDone() {
      setQueue((cur) => cur.filter((j) => j.status !== 'done'))
      queueRef.current = queueRef.current.filter((j) => j.status !== 'done')
    }

    function onClearAll() {
      setQueue([])
      queueRef.current = []
      emitStatus('')
    }

    // Per-job removal — Render sheet's "Remove" / "Stop" buttons.
    // For a pending job we just drop it. For an active job the running
    // promise is hard to interrupt mid-flight (Gemini fetch + decode),
    // so we mark its id rejected; processQueue's next tick will skip
    // promoting it to done and the UI reflects the gone-ness.
    function onRemove(e) {
      const id = e?.detail?.id
      if (id == null) return
      setQueue((cur) => cur.filter((j) => j.id !== id))
      queueRef.current = queueRef.current.filter((j) => j.id !== id)
    }

    // Retry — reset a failed job back to pending and kick the queue.
    // Only `error` jobs are eligible; pending/active/done are no-ops.
    function onRetry(e) {
      const id = e?.detail?.id
      if (id == null) return
      setQueue((cur) =>
        cur.map((j) =>
          j.id === id && j.status === 'error'
            ? { ...j, status: 'pending', statusText: 'Queued', startedAt: Date.now(), progress: 0 }
            : j,
        ),
      )
      queueRef.current = queueRef.current.map((j) =>
        j.id === id && j.status === 'error'
          ? { ...j, status: 'pending', statusText: 'Queued', startedAt: Date.now(), progress: 0 }
          : j,
      )
      processQueue()
    }

    async function onBatchExport() {
      // TODO(Phase 6+): drive the full batch-export loop (restore view ->
      // wait for scene settle -> snapshot -> queue entry -> next). Needs the
      // saved-views restore event and a reliable "scene is rendered" signal
      // before we can run it without races. For now, fall back to snapshotting
      // the current view once per saved view so the button isn't dead.
      const views = settingsRef.current.savedViews || []
      if (!views.length) return
      for (const view of views) {
        window.dispatchEvent(new CustomEvent('restore-view', { detail: view }))
        // Settle delay matches the prototype's 1500ms (poster-v3-ui.jsx:2404).
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1500))
        // eslint-disable-next-line no-await-in-loop
        const snapshot = await composite(snapshotCanvas(settingsRef.current.resolution))
        if (!snapshot) continue
        addJob({
          label: view.name || 'View',
          prompt: '',
          useAI: false,
          snapshot,
          resolution: settingsRef.current.resolution,
          location: getLocation(),
          view,
        })
      }
      processQueue()
    }

    window.addEventListener('quick-download', onQuickDownload)
    window.addEventListener('add-to-queue', onAddToQueue)
    window.addEventListener('generate-all', onGenerateAll)
    window.addEventListener('queue-clear-done', onClearDone)
    window.addEventListener('queue-clear-all', onClearAll)
    // Legacy alias — ExportSection.jsx dispatches 'clear-queue'. Keep both
    // wired so Phase-5 UI changes don't have to happen in lockstep.
    window.addEventListener('clear-queue', onClearAll)
    window.addEventListener('queue-remove', onRemove)
    window.addEventListener('queue-retry', onRetry)
    window.addEventListener('batch-export', onBatchExport)

    return () => {
      window.removeEventListener('quick-download', onQuickDownload)
      window.removeEventListener('add-to-queue', onAddToQueue)
      window.removeEventListener('generate-all', onGenerateAll)
      window.removeEventListener('queue-clear-done', onClearDone)
      window.removeEventListener('queue-clear-all', onClearAll)
      window.removeEventListener('clear-queue', onClearAll)
      window.removeEventListener('queue-remove', onRemove)
      window.removeEventListener('queue-retry', onRetry)
      window.removeEventListener('batch-export', onBatchExport)
    }
  }, [setQueue])
}
