import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  aiApiKeyAtom,
  aiCleanArtifactsAtom,
  aiEnhanceAtom,
  aiPresetAtom,
  aiPromptAtom,
  exportResolutionAtom,
  queueAtom,
  savedViewsAtom,
} from '../atoms/sidebar'
import { dofAtom } from '../atoms/scene'
import { textFieldsAtom } from '../atoms/ui'
import {
  applyWatermark,
  buildFilename,
  downloadDataUrl,
  snapshotCanvas,
} from '../utils/export'
import {
  canSubmitRender,
  canUseResolution,
  getTierLimits,
  shouldShowWatermark,
} from '../../../lib/entitlements'
import {
  getRenderCount,
  incrementRenderCount,
} from '../../../lib/renderCount'
import { fireToast } from '../../../lib/toast'

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
  dithered: {
    label: 'Dithered',
    // 1-bit / halftone graphic-design treatment. Bauhaus / risograph
    // / Massimo Vignelli vocabulary — flat shapes, hard edges, no
    // gradients, dot or line halftone for tone instead of value
    // gradients. Two-color palette (paper + ink) reads as printed
    // matter, not a photo. Same composition-lock pattern as the other
    // strong-style prompts.
    prompt:
      'Transform this into a 1-bit / halftone graphic-design print of the aerial cityscape. Use ONLY two colors: a warm cream paper tone (#f1ead6) for the background and a deep ink color (#1a1a1f) for everything else. No greys, no gradients — all tonal value comes from a fine halftone dot pattern, denser ink dots in shadow areas and sparser in highlights. Hard-edged shapes, flat fills, no photographic detail. Reads like a high-end editorial print, risograph or screen-printed poster, Massimo Vignelli / Swiss Style poster vocabulary. Slight visible registration offset between the two layers for a printed feel. NO text, labels, captions, signatures, ships, flags, ornaments. Only change the rendering style — do NOT change the camera angle, perspective, or framing. Do NOT add, remove, relocate, or resize any building. Keep the exact same buildings, streets, composition, and layout.',
  },
  vedute: {
    label: 'Vedute',
    // The brand's signature style — named after the 17th-/18th-century
    // Italian veduta tradition (Canaletto, Bellotto, Guardi). Hyper-
    // detailed atmospheric cityscape paintings with theatrical light,
    // careful linear perspective, and a luminous sky. Pinned as the
    // first card in the picker since it's the editor's namesake.
    //
    // Composition lock-down mirrors the Realistic + Travel Poster
    // prompts — explicit "Only change X / do NOT add Y" pattern so
    // the model doesn't redraw buildings to match its painting prior.
    prompt:
      'Transform this into an 18th-century Italian veduta painting in the tradition of Canaletto, Bellotto, and Guardi. Highly detailed, atmospheric cityscape painting with theatrical golden-hour light, careful linear perspective, luminous sky with soft cumulus clouds, painterly brushwork on rooftops and stone facades, subtle warm-cool color modulation across the depth of the scene, a slightly cinematic vantage that reads as a hand-painted aerial vista. Limited 18th-century palette: warm cream, terracotta, soft umber, sage green, dusty teal, pale gold. Visible brushwork in the sky and shadows; cleaner edges on the buildings. Only change the lighting, materials, color palette, and painterly texture — do NOT change the camera angle, perspective, or framing. Do NOT add, remove, relocate, or resize any building. Do NOT add cars, people, signage, text, ships, flags, banners, watermarks, or any element not visible in the source. Keep the exact same buildings, streets, composition, and layout.',
  },
  realistic: {
    label: 'Realistic',
    // Composition-preserving rewrite. The old prompt ("helicopter
    // DSLR photograph...subtly enhance realism") drifted heavily
    // because (a) "helicopter / DSLR" reframes the camera toward the
    // model's prior of oblique 30–45° stock helicopter photos, and
    // (b) "enhance realism / detail" with no negative constraints
    // reads as "fill in what a real city would have" — so the model
    // adds cars, trees, signage, even reshuffles blocks. The
    // "Only change X / Do NOT add Y" pattern (mirrored from Cyberpunk
    // and Travel Poster, which hold composition well) pins geometry.
    prompt:
      'Re-render this aerial scene as a photoreal daylight cityscape — natural sunlight, realistic building materials and roof textures, soft shadows, real-world surface detail on streets and rooftops. Only change the lighting, materials, and texture realism — do NOT change the camera angle, perspective, or framing. Do NOT add, remove, relocate, or resize any building. Do NOT add cars, people, signage, text, lens flares, watermarks, or any element not already visible in the source. Keep the exact same buildings, streets, composition, and layout.',
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

// DoF prompt suffix — returns '' when DoF is disabled (aperture <= 0,
// per the dofAtom doc in scene.js). Exported so the unit test pins
// the gate; this exact regression (missing prompt instruction when
// DoF was on) shipped to production silently when Phase 2.7 retired
// `dof.on` but didn't update the gate here.
export function dofPromptSuffix(aperture) {
  if (!Number.isFinite(aperture) || aperture <= 0) return ''
  const fStr = aperture < 10 ? aperture.toFixed(1) : String(Math.round(aperture))
  return (
    ` Preserve the depth-of-field blur EXACTLY as shown in the input — this was shot at approximately f/${fStr}. Keep the sharply-focused area tack-sharp, and reproduce the out-of-focus background and foreground blur with the same falloff radius and intensity. Do NOT sharpen blurred regions, do NOT add or remove blur, and do NOT shift the focal plane.`
  )
}

function emitStatus(text) {
  window.dispatchEvent(new CustomEvent('export-status', { detail: text || '' }))
}

// (getLocation that read document.getElementById('location-search') was
// dead code from /app-classic — that input lived in the sidebar's
// EnvironmentSection. /app uses textFieldsAtom.title as the canonical
// location label, populated by ClusterTopLeft on every search hit.
// useQueue threads textFields through settingsRef and reads .title at
// snapshot time.)

// Pull a user-facing error message from a failed /api/gemini response.
// Handles both error shapes in flight:
//   - our proxy returns { error: "string" } (no key / rate limit / upstream error)
//   - Gemini's upstream returns { error: { message: "..." } }
// Earlier code only honored the second shape, so the first collapsed to
// "API error 500" with no useful detail. Exported so unit tests can pin
// the shape across both proxies.
export function geminiErrorMessage(status, body) {
  let msg = `API error ${status}`
  if (body && typeof body === 'object') {
    const fromProxy = typeof body.error === 'string' ? body.error : null
    const fromUpstream = body.error?.message
    msg = fromProxy || fromUpstream?.slice(0, 200) || msg
  }
  // 500 with "not configured" is the recurring "no GEMINI_API_KEY"
  // case — translate it to a friendlier hint that points at BYOK.
  if (status === 500 && /not configured/i.test(msg)) {
    msg = 'Gemini key not set. Add one on /profile (BYOK), or set GEMINI_API_KEY in .env.local.'
  }
  return msg
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

  // 90-second hard ceiling on the request. Gemini image generation
  // typically returns in 6-15s. Without a timeout, an upstream Gemini
  // outage or a stalled connection leaves the request hanging
  // indefinitely — the queue UI keeps spinning, the progress-pulse
  // setInterval keeps firing, and the user has no way to recover
  // without a page reload. AbortController + 90s timeout means a
  // hung request fails as a normal job error and the user can retry.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 90_000)
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err?.name === 'AbortError') {
      throw new Error('Render timed out (90s) — try again')
    }
    throw err
  }
  clearTimeout(timeoutId)
  if (!res.ok) {
    let body = null
    try { body = await res.json() } catch {}
    throw new Error(geminiErrorMessage(res.status, body))
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
  const aiCleanArtifacts = useAtomValue(aiCleanArtifactsAtom)
  const resolution = useAtomValue(exportResolutionAtom)
  const savedViews = useAtomValue(savedViewsAtom)
  const dof = useAtomValue(dofAtom)
  const textFields = useAtomValue(textFieldsAtom)

  // Latest-settings ref — event listeners capture stale closures otherwise.
  // Writes happen in useEffect (not during render): under React 19 concurrent
  // rendering, ref writes inside the function body can be silently dropped
  // when a render is restarted, leaving listeners with stale state. See the
  // 2026-04-17 LEARNINGS entry on R19 concurrent rendering for the full
  // story — same fix applies here.
  const settingsRef = useRef({})
  // Phase 6 — clamp resolution to the user's tier max so a user who had
  // 4× selected before the entitlements layer landed (or after a downgrade)
  // doesn't keep rendering at 4×. UI gating disables the disallowed buttons;
  // this is the safety net at submission time.
  const tierMax = getTierLimits().maxResolutionMultiplier
  const clampedResolution = canUseResolution({ multiplier: resolution })
    ? resolution
    : tierMax
  useEffect(() => {
    settingsRef.current = {
      aiEnhance,
      aiPrompt,
      aiPreset,
      aiKey,
      aiCleanArtifacts,
      resolution: clampedResolution,
      savedViews,
      dof,
      textFields,
    }
  }, [
    aiEnhance,
    aiPrompt,
    aiPreset,
    aiKey,
    aiCleanArtifacts,
    clampedResolution,
    savedViews,
    dof,
    textFields,
  ])

  // Queue snapshot ref so async processors can read the newest array without
  // re-subscribing each tick. Same R19-concurrent-safe pattern as above.
  const queueRef = useRef(queue)
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

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

    // Has the user removed this job since runJob started? When yes, the
    // download + gallery-add + render-count bump should all skip — the
    // user explicitly cancelled. Without this guard, a user clicking
    // Remove on an active AI render still saw the result land in the
    // gallery (and got billed against the monthly cap) once the in-flight
    // fetch resolved, which contradicts the explicit cancel intent.
    function isJobLive(id) {
      return queueRef.current.some((j) => j.id === id)
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
        // Phase 6 — apply free-tier watermark (no-op for Pro). BYOK does
        // NOT bypass the watermark (see entitlements.js doc comment).
        const finalUrl = shouldShowWatermark()
          ? await applyWatermark(snapshotUrl)
          : snapshotUrl
        if (!isJobLive(job.id)) return
        downloadDataUrl(finalUrl, fname)
        dispatchGalleryAdd(job.label, fname, finalUrl, {
          batchId: job.batchId,
          batchLabel: job.batchLabel,
          view: job.view,
        })
        updateJob(job.id, {
          status: 'done',
          statusText: 'Done',
          progress: 100,
          resultUrl: finalUrl,
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
        const aiResult = await callGemini(snapshotUrl, job.prompt, job.apiKey)
        clearInterval(pulse)
        // Bail if the user removed the job during the fetch — don't
        // download, don't add to gallery, don't bump the render counter.
        if (!isJobLive(job.id)) return
        const fname = buildFilename(job.label, {
          resolution: job.resolution,
          location: job.location,
        })
        // Phase 6 — apply free-tier watermark.
        const finalUrl = shouldShowWatermark()
          ? await applyWatermark(aiResult)
          : aiResult
        if (!isJobLive(job.id)) return
        downloadDataUrl(finalUrl, fname)
        dispatchGalleryAdd(job.label, fname, finalUrl, {
          batchId: job.batchId,
          batchLabel: job.batchLabel,
          view: job.view,
        })
        updateJob(job.id, {
          status: 'done',
          statusText: 'Done',
          progress: 100,
          resultUrl: finalUrl,
        })
        // Phase 6.1 — bump the per-month render counter on a successful
        // AI render, IF the user isn't on BYOK. Failed renders don't count.
        if (!job.apiKey) incrementRenderCount(1)
      } catch (err) {
        clearInterval(pulse)
        if (!isJobLive(job.id)) return
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
      // Gate the photogrammetry cleanup on aiCleanArtifactsAtom so users
      // can flip it off when they actually want the mesh-faithful look
      // (e.g. low-poly art renders that lean into the source's polygon
      // character). Default-on; the toggle lives in the Render sheet.
      if (settingsRef.current.aiCleanArtifacts) {
        out +=
          ' The source is a 3D photogrammetry capture from satellite/aerial scanning — building corners, rooftop edges, and tree silhouettes may appear jagged, faceted, blocky, or crumpled due to polygon mesh artifacts. Interpret these as their real-world clean architectural form: straight vertical building corners, flat clean rooftops, smooth straight edges, well-defined silhouettes. Do not faithfully reproduce mesh facets, polygon jaggedness, or blocky distortion — render the architecture as it would actually look in real life, with crisp clean lines.'
      }
      // Phase 2.7 retired `dof.on` in favor of "aperture > 0 means on"
      // (see scene.js — the /app cluster writes aperture=0 to disable).
      // This gate was missed in that migration, so DoF-preservation
      // was silently skipped on EVERY render even with DoF on — the AI
      // happily sharpened the blurred regions. dofPromptSuffix is
      // module-scoped + exported so the regression test pins the gate.
      out += dofPromptSuffix(settingsRef.current.dof?.aperture)
      return out
    }

    function promptFor(presetKey, fallback) {
      const p = AI_PRESETS[presetKey]
      if (p) return appendEffectPrompts(p.prompt)
      return appendEffectPrompts(
        fallback ||
          // Mirrors AI_PRESETS.realistic — composition-anchored
          // fallback so a queue job with no preset and no custom
          // prompt produces the same fidelity as clicking Realistic.
          'Re-render this aerial scene as a photoreal daylight cityscape — natural sunlight, realistic building materials, soft shadows. Only change lighting, materials, and texture realism. Do NOT change the camera angle or framing. Do NOT add, remove, or relocate any building. Do NOT add cars, people, signage, or text. Keep the exact same buildings, streets, and composition.',
      )
    }

    // ─── Event handlers ─────────────────────────────────────────

    async function onQuickDownload() {
      const raw = snapshotCanvas(settingsRef.current.resolution)
      if (!raw) return
      const fname = buildFilename('raw', {
        resolution: settingsRef.current.resolution,
        location: (settingsRef.current.textFields?.title || ''),
      })
      // Phase 6 — quick downloads also get the free-tier watermark.
      // BYOK does NOT bypass — watermark is Vedute's product gating.
      const dataUrl = shouldShowWatermark()
        ? await applyWatermark(raw)
        : raw
      downloadDataUrl(dataUrl, fname)
      // Capture the current camera view so the gallery entry can power
      // 'Jump to view' later. Without this, quick-download entries have
      // view=null and the lightbox greys the button out.
      const view = await captureCurrentView()
      dispatchGalleryAdd('Quick', fname, dataUrl, { view })
    }

    // /app dispatches `add-to-queue` with a detail payload to override
    // settingsRef-derived behavior on a per-job basis:
    //   { preset: string|null, prompt?: string }
    // - preset === null  → raw export (no AI), regardless of aiPreset state
    // - preset === string → that preset is used for this single job
    // - prompt → custom prompt override (used by 'custom' preset)
    async function onAddToQueue(e) {
      const detail = e?.detail || {}
      const overridePreset = Object.hasOwn(detail, 'preset') ? detail.preset : undefined
      const overridePrompt = typeof detail.prompt === 'string' ? detail.prompt : null

      const s = settingsRef.current

      // Entitlement gate (Phase 6.1). Only AI submissions count toward
      // the per-month limit; raw exports stay free. BYOK bypasses the
      // gate entirely. profile is null today (no Supabase tier flag);
      // entitlements treats null as 'free' tier.
      const presetIsAi = overridePreset === undefined ? !!s.aiPreset : (overridePreset !== null)
      const wouldUseAi = !!s.aiEnhance && presetIsAi
      if (wouldUseAi) {
        const gate = canSubmitRender({
          // profile: undefined → entitlements reads from the active profile bridge
          count: getRenderCount(),
          byokKey: s.aiKey,
        })
        if (!gate.ok) {
          // Surface the gate reason via the shared toast channel rather
          // than window.alert (the rest of the app moved to toasts when
          // ToastHost shipped).
          fireToast('error', gate.reason)
          return
        }
      }

      const rawSnapshot = snapshotCanvas(s.resolution)
      if (!rawSnapshot) return

      const location = (settingsRef.current.textFields?.title || '')
      const view = await captureCurrentView()

      const presetKey = overridePreset !== undefined ? overridePreset : s.aiPreset
      const baseJob = {
        resolution: s.resolution,
        location,
        apiKey: s.aiKey,
        view,
        // Propagate batch info from the dispatcher (Render sheet sends
        // these when the user picks multiple styles at once so they
        // group as a single batch in the queue list).
        batchId: detail.batchId ?? null,
        batchLabel: detail.batchLabel ?? null,
      }

      if (presetKey === null) {
        addJob({
          ...baseJob,
          label: 'Raw',
          prompt: '',
          useAI: false,
          snapshot: rawSnapshot,
        })
      } else if (s.aiEnhance && presetKey) {
        const preset = AI_PRESETS[presetKey]
        addJob({
          ...baseJob,
          label: preset?.label || presetKey,
          prompt: promptFor(presetKey, overridePrompt ?? s.aiPrompt),
          useAI: true,
          snapshot: rawSnapshot,
          preset: presetKey,
        })
      } else {
        const useAI = !!s.aiEnhance
        const label = useAI ? 'Custom' : 'Raw'
        const prompt = useAI ? appendEffectPrompts(overridePrompt ?? s.aiPrompt) : ''
        addJob({
          ...baseJob,
          label,
          prompt,
          useAI,
          snapshot: rawSnapshot,
        })
      }

      processQueue()
    }

    // Multi-preset add — fired by the Render sheet when the user submits
    // 2+ styles at once. Snapshot ONCE here, fan out as N addJob calls
    // sharing a batchId so they group in the queue UI.
    async function onAddBatchToQueue(e) {
      const detail = e?.detail || {}
      const presetKeys = Array.isArray(detail.presets) ? detail.presets : []
      if (presetKeys.length === 0) return
      const overridePrompt = typeof detail.prompt === 'string' ? detail.prompt : null
      const batchId = detail.batchId || ('batch-' + Date.now())
      const batchLabel = detail.batchLabel || `${presetKeys.length} styles`

      const s = settingsRef.current

      // Entitlement gate (Phase 6.1). Each AI preset in the batch counts
      // as one render against the limit. Raw (preset === null) stays free.
      const aiCount = presetKeys.filter((k) => k !== null).length
      if (aiCount > 0) {
        const gate = canSubmitRender({
          // profile: undefined → entitlements reads from the active profile bridge
          count: getRenderCount() + aiCount - 1,
          byokKey: s.aiKey,
        })
        if (!gate.ok) {
          // Surface the gate reason via the shared toast channel rather
          // than window.alert (the rest of the app moved to toasts when
          // ToastHost shipped).
          fireToast('error', gate.reason)
          return
        }
      }

      const rawSnapshot = snapshotCanvas(s.resolution)
      if (!rawSnapshot) return
      const location = (settingsRef.current.textFields?.title || '')
      const view = await captureCurrentView()

      for (const presetKey of presetKeys) {
        const baseJob = {
          resolution: s.resolution,
          location,
          apiKey: s.aiKey,
          view,
          batchId,
          batchLabel,
        }
        if (presetKey === null) {
          addJob({
            ...baseJob,
            label: 'Raw',
            prompt: '',
            useAI: false,
            snapshot: rawSnapshot,
          })
        } else if (presetKey === 'custom') {
          addJob({
            ...baseJob,
            label: 'Custom',
            prompt: appendEffectPrompts(overridePrompt ?? s.aiPrompt),
            useAI: true,
            snapshot: rawSnapshot,
          })
        } else {
          const preset = AI_PRESETS[presetKey]
          addJob({
            ...baseJob,
            label: preset?.label || presetKey,
            prompt: promptFor(presetKey, overridePrompt ?? s.aiPrompt),
            useAI: true,
            snapshot: rawSnapshot,
            preset: presetKey,
          })
        }
      }

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

    // Reorder — move a pending job up or down by one slot. Detail:
    // { id, direction: 'up' | 'down' }. Active/done jobs stay in place
    // (reorder mid-flight would be confusing). Pending-only because that's
    // the only window where the user actually has scheduling control.
    function onReorder(e) {
      const id = e?.detail?.id
      const dir = e?.detail?.direction
      if (id == null || (dir !== 'up' && dir !== 'down')) return
      setQueue((cur) => {
        const idx = cur.findIndex((j) => j.id === id)
        if (idx < 0 || cur[idx].status !== 'pending') return cur
        const target = dir === 'up' ? idx - 1 : idx + 1
        if (target < 0 || target >= cur.length) return cur
        if (cur[target].status !== 'pending') return cur
        const next = [...cur]
        ;[next[idx], next[target]] = [next[target], next[idx]]
        queueRef.current = next
        return next
      })
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

    window.addEventListener('quick-download', onQuickDownload)
    window.addEventListener('add-to-queue', onAddToQueue)
    window.addEventListener('add-batch-to-queue', onAddBatchToQueue)
    window.addEventListener('queue-clear-done', onClearDone)
    window.addEventListener('clear-queue', onClearAll)
    window.addEventListener('queue-remove', onRemove)
    window.addEventListener('queue-retry', onRetry)
    window.addEventListener('queue-reorder', onReorder)

    return () => {
      window.removeEventListener('quick-download', onQuickDownload)
      window.removeEventListener('add-to-queue', onAddToQueue)
      window.removeEventListener('add-batch-to-queue', onAddBatchToQueue)
      window.removeEventListener('queue-clear-done', onClearDone)
      window.removeEventListener('clear-queue', onClearAll)
      window.removeEventListener('queue-remove', onRemove)
      window.removeEventListener('queue-retry', onRetry)
      window.removeEventListener('queue-reorder', onReorder)
    }
  }, [setQueue])
}
