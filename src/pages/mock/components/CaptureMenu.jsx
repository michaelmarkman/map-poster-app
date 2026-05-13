import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  aiModifiersAtom,
  aiPromptAtom,
  exportResolutionAtom,
  locationContextAtom,
  modifiersThemesOpenAtom,
  modifiersThingsOpenAtom,
  queueAtom,
} from '../../editor/atoms/sidebar'
import { galleryEntriesAtom } from '../../editor/atoms/gallery'
import { modalsAtom } from '../../editor/atoms/modals'
import {
  PROMPT_MODIFIERS,
  applyModifierToggle,
  impliedAtomKeys,
} from '../../../data/promptModifiers'

// Phase 18 — Capture menu refined to match the prototype's
// `.menu-capture` recipe pixel-for-pixel:
//
//   - 440px wide × min-height 730px (locked footprint)
//   - Header: title (mono 13 uppercase) + meta line on the right
//   - Resolution segment: 4-button grid, 32px tall
//   - Section label "Style" with selection-count meta on the right
//   - Category pills (white-bg active) horizontally scrollable
//   - 3-col style grid with 4:3 cards (padding-top: 75%) — image
//     bg with brightness(0.65) filter, label overlaid bottom-left
//     with text-shadow, chartreuse-circle check top-right on active
//   - Raw + Custom live as is-pinned cards INSIDE the grid (always
//     visible regardless of active category)
//   - Custom prompt textarea below the grid (only when Custom
//     selected — keeps the menu compact otherwise)
//   - Footer: Render CTA (full width when none selected) +
//     "More options →" link to AIRenderModal

const PRESETS = [
  { key: 'realistic',    label: 'Realistic',        file: 'realistic',        tags: ['photo'] },
  { key: 'golden',       label: 'Golden Hour',      file: 'golden-hour',      tags: ['photo'] },
  { key: 'retro70s',     label: '70s Film',         file: '70s-film',         tags: ['film'] },
  { key: 'polaroid',     label: 'Polaroid',         file: 'polaroid',         tags: ['film'] },
  { key: 'postcard',     label: 'Vintage Postcard', file: 'vintage-postcard', tags: ['print'] },
  { key: 'night',        label: 'Night',            file: 'night',            tags: ['weather'] },
  { key: 'snowfall',     label: 'Snowfall',         file: 'snowfall',         tags: ['weather'] },
  { key: 'autumn',       label: 'Autumn',           file: 'autumn',           tags: ['weather'] },
  { key: 'cherry',       label: 'Cherry Blossom',   file: 'cherry-blossom',   tags: ['weather'] },
  { key: 'rainy',        label: 'Rainy',            file: 'rainy',            tags: ['weather'] },
  { key: 'foggy',        label: 'Foggy Dawn',       file: 'foggy-dawn',       tags: ['weather'] },
  { key: 'watercolor',   label: 'Watercolor',       file: 'watercolor',       tags: ['art'] },
  { key: 'oilpaint',     label: 'Oil Painting',     file: 'oil-painting',     tags: ['art'] },
  { key: 'pastel',       label: 'Pastel Dream',     file: 'pastel-dream',     tags: ['art'] },
  { key: 'gouache',      label: 'Gouache',          file: 'gouache',          tags: ['art'] },
  { key: 'stainedglass', label: 'Stained Glass',    file: 'stained-glass',    tags: ['art'] },
  { key: 'ghibli',       label: 'Studio Ghibli',    file: 'studio-ghibli',    tags: ['art'] },
  { key: 'travelposter', label: 'Travel Poster',    file: 'travel-poster',    tags: ['print'] },
  { key: 'cyberpunk',    label: 'Cyberpunk',        file: 'cyberpunk',        tags: ['neon'] },
  { key: 'pixel',        label: 'Pixel Art',        file: 'pixel-art',        tags: ['neon'] },
  { key: 'pencilsketch', label: 'Pencil Sketch',    file: 'pencil-sketch',    tags: ['ink'] },
  { key: 'charcoal',     label: 'Charcoal',         file: 'charcoal',         tags: ['ink'] },
  { key: 'crosshatch',   label: 'Crosshatch',       file: 'ink-crosshatch',   tags: ['ink'] },
  { key: 'lineart',      label: 'Line Drawing',     file: 'line-drawing',     tags: ['ink'] },
  { key: 'architect',    label: 'Architect',        file: 'architect-marker', tags: ['ink'] },
  { key: 'traveljournal',label: 'Travel Journal',   file: 'travel-journal',   tags: ['ink'] },
  { key: 'woodblock',    label: 'Ukiyo-e',          file: 'ukiyo-e-print',    tags: ['print'] },
  { key: 'blueprint',    label: 'Blueprint',        file: 'blueprint',        tags: ['print'] },
]

const CATS = [
  { key: 'all',     title: 'All' },
  { key: 'photo',   title: 'Photo' },
  { key: 'film',    title: 'Film' },
  { key: 'art',     title: 'Art' },
  { key: 'ink',     title: 'Ink' },
  { key: 'neon',    title: 'Neon' },
  { key: 'weather', title: 'Weather' },
  { key: 'print',   title: 'Print' },
]

// Filename-timestamp manifest (mirrors AIRenderModal's FILE_TS).
const FILE_TS = {
  'raw':              '20260422-1714',
  'realistic':        '20260422-1705',
  'golden-hour':      '20260422-1706',
  '70s-film':         '20260422-1706',
  'polaroid':         '20260422-1706',
  'vintage-postcard': '20260422-1706',
  'night':            '20260422-1707',
  'snowfall':         '20260422-1707',
  'autumn':           '20260422-1707',
  'cherry-blossom':   '20260422-1708',
  'rainy':            '20260422-1708',
  'foggy-dawn':       '20260422-1708',
  'watercolor':       '20260422-1708',
  'oil-painting':     '20260422-1709',
  'pastel-dream':     '20260422-1709',
  'gouache':          '20260422-1709',
  'cyberpunk':        '20260422-1710',
  'pixel-art':        '20260422-1710',
  'stained-glass':    '20260422-1710',
  'studio-ghibli':    '20260422-1711',
  'travel-poster':    '20260422-1711',
  'pencil-sketch':    '20260422-1711',
  'ink-crosshatch':   '20260422-1711',
  'charcoal':         '20260422-1712',
  'line-drawing':     '20260422-1712',
  'architect-marker': '20260422-1712',
  'travel-journal':   '20260422-1713',
  'ukiyo-e-print':    '20260422-1713',
  'blueprint':        '20260422-1713',
}
const photoFor = (file) =>
  `/style-photos/vedute-${file}-2x-${FILE_TS[file] || '20260422-1705'}.png`

const RAW_KEY = 'raw'
const CUSTOM_KEY = 'custom'
const VEDUTE_KEY = 'vedute'
const DITHERED_KEY = 'dithered'
const RISO_KEY = 'riso'

// Resolution → pixel-height map for the meta readout.
const RES_PX = { 1: 1080, 2: 2160, 3: 3240, 4: 4320 }

export default function CaptureMenu({ onClose }) {
  const [selected, setSelected] = useState(() => new Set())
  const [activeCat, setActiveCat] = useState('all')
  const [exportRes, setExportRes] = useAtom(exportResolutionAtom)
  const [aiPrompt, setAiPrompt] = useAtom(aiPromptAtom)
  const setModals = useSetAtom(modalsAtom)
  const queue = useAtomValue(queueAtom)
  const [aiModifiers, setAiModifiers] = useAtom(aiModifiersAtom)
  const locationContext = useAtomValue(locationContextAtom)
  const [themesOpen, setThemesOpen] = useAtom(modifiersThemesOpenAtom)
  const [thingsOpen, setThingsOpen] = useAtom(modifiersThingsOpenAtom)
  const impliedKeys = impliedAtomKeys(aiModifiers)
  const toggleMod = (key) => {
    setAiModifiers((prev) => applyModifierToggle(prev, key))
  }

  // Phase swap — 'picker' (style + resolution) or 'queue' (in-progress
  // + recent renders). Every open of the Capture pill starts on the
  // picker (the capture view); dispatchRender flips to queue inline so
  // the user sees their jobs progress, and the dedicated Queue button
  // in the footer is the only way back. Closing + reopening returns to
  // picker — the queue is a transient view, the picker is the home.
  //
  // No auto-flip-back-to-picker effect on queue.length === 0 — useQueue's
  // add-to-queue handler is async (awaits a canvas snapshot before
  // calling addJob), so right after dispatchRender the queue is briefly
  // empty. An auto-flip would race the snapshot and bounce us back to
  // picker before the user ever sees the queue populate.
  const [phase, setPhase] = useState('picker')
  // True between dispatchRender() and the first time queueAtom reflects
  // the new job. Lets the queue view show a "Capturing snapshot…"
  // placeholder instead of the "queue empty" state during the snapshot
  // window (useQueue's add-to-queue handler awaits a canvas snapshot
  // before calling addJob — typically 50–500ms).
  const [pendingDispatch, setPendingDispatch] = useState(false)
  // Clear pendingDispatch as soon as the first job lands so we render the
  // real queue rows.
  useEffect(() => {
    if (queue.length > 0 && pendingDispatch) setPendingDispatch(false)
  }, [queue.length, pendingDispatch])
  // Safety net: if the snapshot fails silently and no job ever appears,
  // bail out of the placeholder after 6s so the queue view doesn't sit
  // on "Capturing snapshot…" forever.
  useEffect(() => {
    if (!pendingDispatch) return undefined
    const t = setTimeout(() => setPendingDispatch(false), 6000)
    return () => clearTimeout(t)
  }, [pendingDispatch])

  const togglePreset = (key) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const customSelected = selected.has(CUSTOM_KEY)
  const selectionCount = selected.size

  const dispatchRender = () => {
    if (selected.size === 0) {
      // No selection → raw export.
      window.dispatchEvent(new CustomEvent('add-to-queue', { detail: { preset: null } }))
      setPendingDispatch(true)
      setPhase('queue')
      return
    }
    const keys = Array.from(selected)
    const presets = keys.map((k) => (k === RAW_KEY ? null : k))
    const prompt = customSelected ? aiPrompt : null
    if (presets.length === 1) {
      window.dispatchEvent(
        new CustomEvent('add-to-queue', {
          detail: { preset: presets[0], prompt },
        }),
      )
    } else {
      const batchId = 'batch-' + Date.now()
      window.dispatchEvent(
        new CustomEvent('add-batch-to-queue', {
          detail: {
            presets,
            prompt,
            batchId,
            batchLabel: `${presets.length} styles`,
          },
        }),
      )
    }
    setSelected(new Set())
    // Phase 21 — keep the menu open and flip to the queue phase so the
    // user can watch their jobs progress. Was: onClose() which dropped
    // them back to the canvas and forced them to re-open the menu to
    // see status. The picker phase swap is one click away via the
    // queue-link in the footer.
    setPendingDispatch(true)
    setPhase('queue')
  }

  const openFullSheet = () => {
    setModals((m) => ({ ...m, aiRender: true }))
    onClose?.()
  }

  // Visible presets: filtered by active category.
  const visible = activeCat === 'all'
    ? PRESETS
    : PRESETS.filter((p) => p.tags.includes(activeCat))

  // Queue counts surfaced in the queue-link badge + header meta.
  const activeJobs  = queue.filter((j) => j.status === 'active')
  const pendingJobs = queue.filter((j) => j.status === 'pending')
  const doneJobs    = queue.filter((j) => j.status === 'done')
  const errorJobs   = queue.filter((j) => j.status === 'error')
  const inflightCount = activeJobs.length + pendingJobs.length
  const queueLinkCount = inflightCount > 0 ? inflightCount : queue.length

  if (phase === 'queue') {
    return (
      <div className="mock-menu-capture" data-phase="queue">
        <QueueView
          queue={queue}
          activeJobs={activeJobs}
          pendingJobs={pendingJobs}
          doneJobs={doneJobs}
          errorJobs={errorJobs}
          starting={pendingDispatch && queue.length === 0}
          onCaptureMore={() => setPhase('picker')}
        />
      </div>
    )
  }

  return (
    <div className="mock-menu-capture" data-phase="picker">
      <div className="mock-menu-capture-head">
        <span className="mock-menu-capture-title">Capture</span>
        <span className="mock-menu-capture-meta">
          {exportRes}× · {RES_PX[exportRes]}px
        </span>
      </div>

      <div className="mock-menu-section-label">Resolution</div>
      <div className="mock-menu-capture-seg" role="tablist" aria-label="Export resolution">
        {[1, 2, 3, 4].map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            className={`mock-menu-capture-seg-btn${exportRes === r ? ' is-active' : ''}`}
            aria-selected={exportRes === r}
            onClick={() => setExportRes(r)}
          >
            {r}×
          </button>
        ))}
      </div>

      {/* Modifier chip strip — composites first ("Themes") then atoms
       *  ("Add things"). Each chip's `appliesTo` is matched against the
       *  detected `locationContext`; non-matching chips are dimmed but
       *  still clickable so the user can override the detector.
       *  An atom that's `implied` by an active composite renders in an
       *  outline-only state (chartreuse border, no fill) — its prompt
       *  is already covered by the composite. */}
      <ModifierSection
        title="Themes"
        kind="composite"
        active={aiModifiers}
        impliedKeys={impliedKeys}
        context={locationContext}
        onToggle={toggleMod}
        open={themesOpen}
        setOpen={setThemesOpen}
      />
      <ModifierSection
        title="Add things"
        kind="atom"
        active={aiModifiers}
        impliedKeys={impliedKeys}
        context={locationContext}
        onToggle={toggleMod}
        open={thingsOpen}
        setOpen={setThingsOpen}
      />

      <div className="mock-menu-section-label">
        <span>Style</span>
        {selectionCount > 0 && (
          <span className="mock-menu-count">{selectionCount} selected</span>
        )}
      </div>

      <div className="mock-menu-capture-cats" role="tablist" aria-label="Style category">
        {CATS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={activeCat === c.key}
            className={`mock-menu-capture-cat${activeCat === c.key ? ' is-active' : ''}`}
            onClick={() => setActiveCat(c.key)}
          >
            {c.title}
          </button>
        ))}
      </div>

      <div className="mock-menu-capture-styles">
        {/* Raw + Custom stay pinned at the top — they're the action
            primitives ("no AI" / "I'll write the prompt"), not aesthetic
            choices, so they belong above the visual catalog. */}
        <button
          type="button"
          className={`mock-menu-capture-style is-raw is-pinned${selected.has(RAW_KEY) ? ' is-active' : ''}`}
          onClick={() => togglePreset(RAW_KEY)}
        >
          <span className="mock-menu-capture-style-thumb" />
          <svg className="mock-menu-capture-style-icon" viewBox="0 0 12 12"
               fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M2 4V2h2M10 4V2h-2M2 8v2h2M10 8v2h-2" />
          </svg>
          <span className="mock-menu-capture-style-label">Raw</span>
          <span className="mock-menu-capture-style-check">✓</span>
        </button>
        <button
          type="button"
          className={`mock-menu-capture-style is-custom is-pinned${customSelected ? ' is-active' : ''}`}
          onClick={() => togglePreset(CUSTOM_KEY)}
        >
          <span className="mock-menu-capture-style-thumb" />
          <svg className="mock-menu-capture-style-icon" viewBox="0 0 12 12"
               fill="currentColor" stroke="none" aria-hidden="true">
            <path d="M6 1l.7 2.6L9.3 4.3 6.7 5l-.7 2.6L5.3 5l-2.6-.7 2.6-.7L6 1zM9 7l.3 1.3L10.7 9 9.3 9.3 9 10.7 8.7 9.3 7.3 9l1.4-.3L9 7z" />
          </svg>
          <span className="mock-menu-capture-style-label">Custom</span>
          <span className="mock-menu-capture-style-check">✓</span>
        </button>
        {visible.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`mock-menu-capture-style${selected.has(p.key) ? ' is-active' : ''}`}
            onClick={() => togglePreset(p.key)}
            title={p.label}
          >
            <span
              className="mock-menu-capture-style-thumb"
              style={{ backgroundImage: `url('${photoFor(p.file)}')` }}
            />
            <span className="mock-menu-capture-style-label">{p.label}</span>
            <span className="mock-menu-capture-style-check">✓</span>
          </button>
        ))}
        {/* Signature pinned styles — Vedute (painterly), Dithered
         *  (1-bit print), Riso (color print). Pinned at the END of
         *  the grid: they sit alongside Custom as an "if none of the
         *  presets fit, try one of these" cap. They stay rendered
         *  across category filters since they're hardcoded
         *  unconditionally. CSS thumbs (no photo asset) so they
         *  visually telegraph "this isn't a photo style". */}
        <button
          type="button"
          className={`mock-menu-capture-style is-vedute is-pinned${selected.has(VEDUTE_KEY) ? ' is-active' : ''}`}
          onClick={() => togglePreset(VEDUTE_KEY)}
          title="Vedute — our signature painterly cityscape"
        >
          <span className="mock-menu-capture-style-thumb" />
          <span className="mock-menu-capture-style-vedute-mark" aria-hidden="true">V</span>
          <span className="mock-menu-capture-style-label">Vedute</span>
          <span className="mock-menu-capture-style-check">✓</span>
        </button>
        <button
          type="button"
          className={`mock-menu-capture-style is-dithered is-pinned${selected.has(DITHERED_KEY) ? ' is-active' : ''}`}
          onClick={() => togglePreset(DITHERED_KEY)}
          title="Dithered — 1-bit halftone print poster"
        >
          <span className="mock-menu-capture-style-thumb" />
          <span className="mock-menu-capture-style-label">Dithered</span>
          <span className="mock-menu-capture-style-check">✓</span>
        </button>
        <button
          type="button"
          className={`mock-menu-capture-style is-riso is-pinned${selected.has(RISO_KEY) ? ' is-active' : ''}`}
          onClick={() => togglePreset(RISO_KEY)}
          title="Riso — color-dithered risograph print"
        >
          <span className="mock-menu-capture-style-thumb" />
          <span className="mock-menu-capture-style-label">Riso</span>
          <span className="mock-menu-capture-style-check">✓</span>
        </button>
      </div>

      {customSelected && (
        <textarea
          className="mock-menu-capture-prompt"
          placeholder="Custom prompt — describe how you want the scene to look…"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          aria-label="Custom prompt"
        />
      )}

      <div className="mock-menu-capture-foot">
        <button
          type="button"
          className="mock-menu-capture-more"
          onClick={openFullSheet}
        >
          More options →
        </button>
        <div className="mock-menu-capture-foot-actions">
          {queue.length > 0 && (
            <button
              type="button"
              className="mock-menu-capture-queue-link"
              onClick={() => setPhase('queue')}
              title="View render queue"
            >
              {inflightCount > 0 && (
                <span className="mock-menu-capture-queue-link-dot" aria-hidden="true" />
              )}
              <span>Queue</span>
              <span className="mock-menu-capture-queue-link-count">
                {queueLinkCount}
              </span>
            </button>
          )}
          <button
            type="button"
            className="mock-menu-capture-render"
            onClick={dispatchRender}
          >
            {selectionCount > 1 ? `Render ${selectionCount}` : 'Render'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modifier chip strip ───────────────────────────────────────────
// Renders one section (composite or atom). Each chip = one modifier
// in PROMPT_MODIFIERS, filtered by `kind`. Visual states:
//   - .is-active        — modifier is in aiModifiers (chartreuse fill)
//   - .is-implied       — atom covered by an active composite
//                          (chartreuse OUTLINE only, no fill — clicking
//                           still toggles, just visually distinct)
//   - .is-inapplicable  — modifier's appliesTo doesn't match the
//                          detected locationContext (dimmed; still
//                          clickable so the user can override)
function ModifierSection({ title, kind, active, impliedKeys, context, onToggle, open, setOpen }) {
  const mods = PROMPT_MODIFIERS.filter((m) => m.kind === kind)
  if (mods.length === 0) return null
  const panelId = `mock-mods-${kind}`
  return (
    <>
      {/* Section header — entire row is the toggle button. The chevron
       *  on the right is opacity 0 by default; it fades up on hover
       *  via CSS so the row reads as a static label until the user
       *  approaches it. aria-expanded + aria-controls wire the chips
       *  panel to assistive tech. */}
      <button
        type="button"
        className={`mock-menu-section-label mock-menu-section-toggle${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span>{title}</span>
        <span className="mock-menu-section-toggle-right">
          {/* Context badge — only the FIRST section renders it so we don't
           *  duplicate the chip on both Themes + Add things. */}
          {kind === 'composite' && context && (
            <span
              className="mock-menu-modifier-context"
              title="Auto-detected from the camera location"
            >
              {context}
            </span>
          )}
          <span className="mock-menu-section-toggle-chev" aria-hidden="true">
            <svg viewBox="0 0 10 10">
              <path d="M2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor"
                    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
      </button>
      {open && (
        <div
          className="mock-menu-capture-mods"
          id={panelId}
          role="group"
          aria-label={title}
        >
          {mods.map((m) => {
            const isActive = active.has(m.key)
            const isImplied = m.kind === 'atom' && impliedKeys.has(m.key) && !isActive
            const isInapplicable = context && m.appliesTo !== 'all' && m.appliesTo !== context
            const cls = [
              'mock-menu-capture-mod',
              isActive && 'is-active',
              isImplied && 'is-implied',
              isInapplicable && !isActive && !isImplied && 'is-inapplicable',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={m.key}
                type="button"
                className={cls}
                onClick={() => onToggle(m.key)}
                aria-pressed={isActive}
                title={m.appliesTo === 'all'
                  ? m.label
                  : `${m.label} — best for ${m.appliesTo}`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// ── Queue phase ──────────────────────────────────────────────────
// Ported from the MoMA prototype's `.menu-capture[data-phase="queue"]`
// view. Three sections: Active (only when something's rendering),
// Queued (pending), Recent (done + error). Each row: status-dot ·
// thumb · body · actions. Done rows open the lightbox on click.

function fmtRelative(ms) {
  if (!ms) return ''
  const dt = Date.now() - ms
  if (dt < 60 * 1000) return 'just now'
  if (dt < 60 * 60 * 1000) return `${Math.floor(dt / 60000)}m ago`
  if (dt < 24 * 60 * 60 * 1000) return `${Math.floor(dt / 3600000)}h ago`
  return `${Math.floor(dt / 86400000)}d ago`
}

function fmtElapsed(startedAt) {
  if (!startedAt) return ''
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const mm = Math.floor(sec / 60)
  const ss = sec % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

function QueueRow({ job, idx, isFirstPending }) {
  const galleryEntries = useAtomValue(galleryEntriesAtom)
  const setModals = useSetAtom(modalsAtom)

  const status = job.status || 'pending'
  // Prefer the finished result so the user sees the actual render;
  // fall back to the pre-AI snapshot for in-flight + pending jobs.
  const thumbBg = job.resultUrl || job.snapshot || ''
  const resPx = RES_PX[job.resolution] || RES_PX[2]

  // Right-side meta string — "0:42" for active, "#N" for pending,
  // relative time for done/error. Matches prototype.
  let timeText = ''
  if (status === 'active')  timeText = fmtElapsed(job.startedAt)
  else if (status === 'pending') timeText = `#${idx + 1}`
  else if (status === 'done')    timeText = fmtRelative(job.finishedAt || job.startedAt)
  else if (status === 'error')   timeText = fmtRelative(job.startedAt)

  let meta = ''
  if (status === 'active')  meta = `${job.resolution || 2}× · ${resPx}px · ${job.statusText || 'rendering'}`
  else if (status === 'pending') meta = `${job.resolution || 2}× · ${resPx}px · waiting`
  else if (status === 'done')    meta = `${job.resolution || 2}× · ${resPx}px · in gallery`
  // error: error message rendered via .mock-menu-queue-error below

  const onCancel = (e) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('queue-remove', { detail: { id: job.id } }))
  }
  const onRetry = (e) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('queue-retry', { detail: { id: job.id } }))
  }
  const onReorder = (dir) => (e) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('queue-reorder', { detail: { id: job.id, direction: dir } }))
  }
  const onOpen = (e) => {
    e.stopPropagation()
    // Find the gallery entry that came from this job. The matching is
    // approximate (filename + label) since useQueue doesn't echo the
    // gallery id back into the job; relies on dispatchGalleryAdd's
    // most-recent insertion for this label.
    const match = galleryEntries.find((g) => g.dataUrl === job.resultUrl)
      || galleryEntries.find((g) => g.label === job.label && g.dataUrl)
    if (!match) return
    const flatList = galleryEntries.slice().reverse()
    const startIndex = Math.max(0, flatList.findIndex((g) => g.id === match.id))
    window.dispatchEvent(new CustomEvent('open-lightbox', {
      detail: { entries: flatList, startIndex },
    }))
    setModals((m) => ({ ...m, lightbox: true }))
  }

  return (
    <article
      className={`mock-menu-queue-row${status === 'done' ? ' is-clickable' : ''}`}
      data-status={status}
      onClick={status === 'done' ? onOpen : undefined}
    >
      <span className="mock-menu-queue-dot" />
      <span
        className="mock-menu-queue-thumb"
        style={thumbBg ? { backgroundImage: `url('${thumbBg}')` } : undefined}
      />
      <div className="mock-menu-queue-body">
        <div className="mock-menu-queue-top">
          <span className="mock-menu-queue-label">{job.label || 'Render'}</span>
          <span className="mock-menu-queue-time">{timeText}</span>
        </div>
        {status === 'error' ? (
          <div className="mock-menu-queue-error">
            {job.statusText || 'Render failed.'}
          </div>
        ) : (
          <div className="mock-menu-queue-meta">{meta}</div>
        )}
        {status === 'active' && (
          <div className="mock-menu-queue-progress">
            <span style={{ width: `${job.progress || 0}%` }} />
          </div>
        )}
      </div>
      <div className="mock-menu-queue-actions">
        {status === 'active' && (
          <button
            type="button"
            className="mock-menu-queue-action"
            onClick={onCancel}
            title="Cancel"
            aria-label="Cancel render"
          >
            <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 3l5 5M8 3l-5 5" />
            </svg>
          </button>
        )}
        {status === 'pending' && (
          <>
            {!isFirstPending && (
              <button
                type="button"
                className="mock-menu-queue-action"
                onClick={onReorder('up')}
                title="Move earlier"
                aria-label="Move earlier"
              >
                <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5.5 3v5M3 5.5L5.5 3 8 5.5" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="mock-menu-queue-action"
              onClick={onCancel}
              title="Remove"
              aria-label="Remove from queue"
            >
              <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 3l5 5M8 3l-5 5" />
              </svg>
            </button>
          </>
        )}
        {status === 'done' && (
          <button
            type="button"
            className="mock-menu-queue-action is-primary"
            onClick={onOpen}
            title="Open in lightbox"
            aria-label="Open in lightbox"
          >
            <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 8.5L8 3M4 3h4v4" />
            </svg>
          </button>
        )}
        {status === 'error' && (
          <>
            <button
              type="button"
              className="mock-menu-queue-action is-primary"
              onClick={onRetry}
              title="Retry"
              aria-label="Retry render"
            >
              <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 5.5a3 3 0 1 0 1-2.25L2 4.5M2 2v2.5h2.5" />
              </svg>
            </button>
            <button
              type="button"
              className="mock-menu-queue-action"
              onClick={onCancel}
              title="Dismiss"
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 3l5 5M8 3l-5 5" />
              </svg>
            </button>
          </>
        )}
      </div>
    </article>
  )
}

function QueueView({ queue, activeJobs, pendingJobs, doneJobs, errorJobs, starting, onCaptureMore }) {
  // Force a re-render every second so the active row's elapsed timer
  // updates. Only spin when there's an active job — otherwise idle.
  const [, force] = useState(0)
  useEffect(() => {
    if (activeJobs.length === 0) return
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [activeJobs.length])

  // Overall progress across all in-flight + pending jobs.
  const inflightTotal = activeJobs.length + pendingJobs.length
  const overallPct = inflightTotal === 0
    ? 100
    : Math.round(
        activeJobs.reduce((s, j) => s + (j.progress || 0), 0) / Math.max(1, activeJobs.length),
      )

  // Recent = done + error, most-recent first.
  const recent = [...doneJobs, ...errorJobs].sort(
    (a, b) => (b.finishedAt || b.startedAt || 0) - (a.finishedAt || a.startedAt || 0),
  )

  const clearDone = () => {
    window.dispatchEvent(new Event('queue-clear-done'))
  }

  const headerMeta = starting
    ? 'Starting render…'
    : activeJobs.length > 0
      ? `${activeJobs.length} active · ${pendingJobs.length} queued · ${overallPct}%`
      : pendingJobs.length > 0
        ? `${pendingJobs.length} queued`
        : queue.length > 0
          ? `${doneJobs.length} done · ${errorJobs.length} failed`
          : 'No jobs yet'

  return (
    <>
      <div className="mock-menu-capture-head">
        <span className="mock-menu-capture-title">
          {starting || activeJobs.length > 0 ? 'Rendering' : 'Queue'}
        </span>
        <span className="mock-menu-capture-meta">{headerMeta}</span>
      </div>

      {(starting || activeJobs.length > 0) && (
        <div className="mock-menu-queue-overall">
          <div
            className="mock-menu-queue-overall-fill"
            style={{ width: starting ? '5%' : `${overallPct}%` }}
          />
        </div>
      )}

      <div className="mock-menu-queue-scroll">
        {starting && activeJobs.length === 0 && pendingJobs.length === 0 && (
          <div className="mock-menu-queue-list">
            <article className="mock-menu-queue-row" data-status="active">
              <span className="mock-menu-queue-dot" />
              <span className="mock-menu-queue-thumb" />
              <div className="mock-menu-queue-body">
                <div className="mock-menu-queue-top">
                  <span className="mock-menu-queue-label">Capturing snapshot…</span>
                  <span className="mock-menu-queue-time">0:00</span>
                </div>
                <div className="mock-menu-queue-meta">Preparing the canvas frame</div>
              </div>
            </article>
          </div>
        )}

        {activeJobs.length > 0 && (
          <>
            <div className="mock-menu-section-label">Active</div>
            <div className="mock-menu-queue-list">
              {activeJobs.map((j, i) => (
                <QueueRow key={j.id} job={j} idx={i} />
              ))}
            </div>
          </>
        )}

        {pendingJobs.length > 0 && (
          <>
            <div className="mock-menu-section-label">
              <span>Queued</span>
              <span className="mock-menu-count">{pendingJobs.length} waiting</span>
            </div>
            <div className="mock-menu-queue-list">
              {pendingJobs.map((j, i) => (
                <QueueRow
                  key={j.id}
                  job={j}
                  idx={i}
                  isFirstPending={i === 0}
                />
              ))}
            </div>
          </>
        )}

        {recent.length > 0 && (
          <>
            <div className="mock-menu-section-label">
              <span>Recent</span>
              <span className="mock-menu-count">
                {doneJobs.length} done{errorJobs.length > 0 ? ` · ${errorJobs.length} failed` : ''}
              </span>
            </div>
            <div className="mock-menu-queue-list">
              {recent.map((j, i) => (
                <QueueRow key={j.id} job={j} idx={i} />
              ))}
            </div>
          </>
        )}

        {queue.length === 0 && !starting && (
          <div className="mock-menu-queue-empty">
            <div className="mock-menu-queue-empty-title">Queue empty</div>
            <div className="mock-menu-queue-empty-sub">
              Pick a style and hit Render to start.
            </div>
          </div>
        )}
      </div>

      <div className="mock-menu-capture-foot">
        {doneJobs.length > 0 ? (
          <button
            type="button"
            className="mock-menu-capture-more"
            onClick={clearDone}
          >
            Clear done
          </button>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <button
          type="button"
          className="mock-menu-capture-render mock-menu-capture-render-ghost"
          onClick={onCaptureMore}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6h7M6 3v6" />
            </svg>
            Capture more
          </span>
        </button>
      </div>
    </>
  )
}
