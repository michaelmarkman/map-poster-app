import { useEffect, useMemo, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { modalsAtom, lightboxEntryAtom } from '../../editor/atoms/modals'
import {
  aiPromptAtom,
  aiPresetAtom,
  aiApiKeyAtom,
  aiCleanArtifactsAtom,
  exportResolutionAtom,
  queueAtom,
} from '../../editor/atoms/sidebar'
import { galleryEntriesAtom } from '../../editor/atoms/gallery'
import '../styles/mock-render-sheet.css'

// ─── Style catalogue ──────────────────────────────────────────────────
// Keys match what useQueue / aiPresetAtom expect (don't change them).
// `file` is the slug used for `/style-photos/mapposter-${file}-2x-…png`
// preview images that ship in `public/style-photos/`. `sub` is the small
// ALL-CAPS subtitle on each card.
const PRESET_CATS = [
  {
    title: 'Photography',
    presets: [
      { key: 'realistic', label: 'Realistic',         file: 'realistic',        sub: 'PHOTOREAL' },
      { key: 'golden',    label: 'Golden Hour',       file: 'golden-hour',      sub: 'WARM' },
      { key: 'retro70s',  label: '70s Film',          file: '70s-film',         sub: 'FADED' },
      { key: 'polaroid',  label: 'Polaroid',          file: 'polaroid',         sub: 'INSTANT' },
      { key: 'postcard',  label: 'Vintage Postcard',  file: 'vintage-postcard', sub: 'HALFTONE' },
    ],
  },
  {
    title: 'Seasons & Weather',
    presets: [
      { key: 'night',    label: 'Night',          file: 'night',          sub: 'LIT' },
      { key: 'snowfall', label: 'Snowfall',       file: 'snowfall',       sub: 'WINTER' },
      { key: 'autumn',   label: 'Autumn',         file: 'autumn',         sub: 'COPPER' },
      { key: 'cherry',   label: 'Cherry Blossom', file: 'cherry-blossom', sub: 'SPRING' },
      { key: 'rainy',    label: 'Rainy',          file: 'rainy',          sub: 'WET' },
      { key: 'foggy',    label: 'Foggy Dawn',     file: 'foggy-dawn',     sub: 'MISTY' },
    ],
  },
  {
    title: 'Art Styles',
    presets: [
      { key: 'watercolor',   label: 'Watercolor',     file: 'watercolor',     sub: 'WASH' },
      { key: 'oilpaint',     label: 'Oil Painting',   file: 'oil-painting',   sub: 'IMPASTO' },
      { key: 'pastel',       label: 'Pastel Dream',   file: 'pastel-dream',   sub: 'SOFT' },
      { key: 'gouache',      label: 'Gouache',        file: 'gouache',        sub: 'MATTE' },
      { key: 'stainedglass', label: 'Stained Glass',  file: 'stained-glass',  sub: 'JEWEL' },
      { key: 'ghibli',       label: 'Studio Ghibli',  file: 'studio-ghibli',  sub: 'ANIME' },
      { key: 'travelposter', label: 'Travel Poster',  file: 'travel-poster',  sub: 'DECO' },
      { key: 'traveljournal',label: 'Travel Journal', file: 'travel-journal', sub: 'JOURNAL' },
      { key: 'woodblock',    label: 'Ukiyo-e Print',  file: 'ukiyo-e-print',  sub: 'BLOCK' },
    ],
  },
  {
    title: 'Media & Materials',
    presets: [
      { key: 'pencilsketch', label: 'Pencil Sketch',    file: 'pencil-sketch',    sub: 'GRAPHITE' },
      { key: 'charcoal',     label: 'Charcoal',         file: 'charcoal',         sub: 'SMUDGE' },
      { key: 'crosshatch',   label: 'Ink Crosshatch',   file: 'ink-crosshatch',   sub: 'ENGRAVING' },
      { key: 'lineart',      label: 'Line Drawing',     file: 'line-drawing',     sub: 'INK' },
      { key: 'architect',    label: 'Architect Marker', file: 'architect-marker', sub: 'MARKER' },
      { key: 'cyberpunk',    label: 'Cyberpunk',        file: 'cyberpunk',        sub: 'NEON' },
      { key: 'pixel',        label: 'Pixel Art',        file: 'pixel-art',        sub: '16-BIT' },
      { key: 'blueprint',    label: 'Blueprint',        file: 'blueprint',        sub: 'TECHNICAL' },
    ],
  },
]

const RAW_KEY = 'raw'
const CUSTOM_KEY = 'custom'
const LS_GEMINI_KEY = 'mapposter3d_gemini_key'

// Filename timestamps copied from the prototype's manifest. They're sequential
// from a single export run; if you re-render the previews you'll need to
// update both the disk + this map.
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
const photoFor = (file) => `/style-photos/mapposter-${file}-2x-${FILE_TS[file] || '20260422-1705'}.png`
const labelByKey = (key) => {
  if (key === RAW_KEY) return 'Raw export'
  if (key === CUSTOM_KEY) return 'Custom prompt'
  for (const c of PRESET_CATS) {
    const p = c.presets.find((x) => x.key === key)
    if (p) return p.label
  }
  return key
}
const fileByKey = (key) => {
  if (key === RAW_KEY) return 'raw'
  for (const c of PRESET_CATS) {
    const p = c.presets.find((x) => x.key === key)
    if (p) return p.file
  }
  return null
}

const RIBBON = { pending: 'Queued', active: 'Developing', done: 'Fixed', error: 'Spoiled' }
const RES_PX_HEIGHT = { 1: 1080, 2: 2160, 3: 3240, 4: 4320 }

function fire(name, detail) {
  window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name))
}

function fmtElapsed(ms) {
  if (ms < 1000) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
function fmtAgo(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export default function AIRenderModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const open = modals.aiRender
  const [aiPrompt, setAiPrompt] = useAtom(aiPromptAtom)
  const [cleanArtifacts, setCleanArtifacts] = useAtom(aiCleanArtifactsAtom)
  const setAiPreset = useSetAtom(aiPresetAtom)
  const [aiKey, setAiKey] = useAtom(aiApiKeyAtom)
  const [exportRes, setExportRes] = useAtom(exportResolutionAtom)
  const queue = useAtomValue(queueAtom)
  const galleryEntries = useAtomValue(galleryEntriesAtom)
  const setLightboxEntry = useSetAtom(lightboxEntryAtom)

  // ALL hooks must run unconditionally to satisfy React's rules-of-hooks —
  // the early `if (!open) return null` below comes AFTER every useState /
  // useEffect / useMemo. That's the bug that bit us last time around.
  const [pane, setPane] = useState('styles') // 'styles' | 'queue'
  const [selected, setSelected] = useState(() => new Set())
  const [includeGraphics, setIncludeGraphics] = useState(true)
  const [exportStatus, setExportStatus] = useState('')
  // Tick once a second so the Developing/Just-now timers update without
  // requiring a queue mutation to re-render.
  const [, setTick] = useState(0)

  // Restore Gemini key from localStorage when the sheet opens.
  useEffect(() => {
    if (!open) return
    try {
      const stored = localStorage.getItem(LS_GEMINI_KEY) || ''
      if (stored && !aiKey) setAiKey(stored)
    } catch { /* localStorage blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Surface export-status events (queued, downloading, error...) at the
  // bottom of the sheet body.
  useEffect(() => {
    const onStatus = (e) => setExportStatus(e?.detail ?? '')
    window.addEventListener('export-status', onStatus)
    return () => window.removeEventListener('export-status', onStatus)
  }, [])

  // Live timer for active jobs. 1Hz is enough for "0:42 elapsed" display.
  useEffect(() => {
    if (!open) return
    const hasLive = queue.some((j) => j.status === 'active' || j.status === 'pending')
    if (!hasLive) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [open, queue])

  const allPresetKeys = useMemo(
    () => PRESET_CATS.flatMap((c) => c.presets.map((p) => p.key)),
    [],
  )

  // Group queue jobs by batchId so multi-style submissions render as a
  // titled group ("3 styles · 1 / 3"). Solo jobs use synthetic keys.
  const groupedQueue = useMemo(() => {
    const groups = []
    const byKey = new Map()
    for (const job of queue) {
      const key = job.batchId || `solo-${job.id}`
      if (!byKey.has(key)) {
        const g = { key, batchId: job.batchId, label: job.batchLabel, jobs: [] }
        byKey.set(key, g)
        groups.push(g)
      }
      byKey.get(key).jobs.push(job)
    }
    return groups
  }, [queue])

  const sessionStats = useMemo(() => {
    const total = queue.length
    const done = queue.filter((j) => j.status === 'done').length
    const active = queue.filter((j) => j.status === 'active').length
    const pending = queue.filter((j) => j.status === 'pending').length
    const errored = queue.filter((j) => j.status === 'error').length
    const pct = total === 0 ? 0 : Math.round((done / total) * 100)
    return { total, done, active, pending, errored, pct }
  }, [queue])

  if (!open) return null

  const close = () => setModals((m) => ({ ...m, aiRender: false }))

  const handleKeyChange = (e) => {
    const v = e.target.value
    setAiKey(v)
    try {
      if (v) localStorage.setItem(LS_GEMINI_KEY, v)
      else localStorage.removeItem(LS_GEMINI_KEY)
    } catch { /* localStorage blocked */ }
  }

  const togglePreset = (key) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isCustomSelected = selected.has(CUSTOM_KEY)
  const isRawSelected = selected.has(RAW_KEY)
  const stagedCount = selected.size

  // The merge moment: clicking Render dispatches the queue events, clears
  // the selection, and flips the pane over to Queue so the user sees the
  // jobs land. Multi-select submissions get a shared batchId/label so
  // they group in the queue list.
  const submitSelected = () => {
    if (stagedCount === 0) return
    const keys = Array.from(selected)

    if (keys.length === 1) {
      // Single-style fast path — fire the existing add-to-queue event.
      // batchId stays null so it shows up as a solo card in the queue
      // list (no batch-group header).
      const key = keys[0]
      if (key === RAW_KEY) {
        fire('add-to-queue', { preset: null, includeGraphics })
      } else if (key === CUSTOM_KEY) {
        fire('add-to-queue', { preset: 'custom', includeGraphics, prompt: aiPrompt })
      } else {
        setAiPreset(key)
        fire('add-to-queue', { preset: key, includeGraphics, prompt: aiPrompt })
      }
    } else {
      // Multi-style — fire ONE batch event so the queue hook snapshots
      // the canvas exactly once and fans out N jobs sharing a batchId.
      // The naive per-preset fan-out used to lock the main thread for
      // several seconds at "Select all → Render" (28 GPU readbacks +
      // Fabric serializations + composites in a tight loop).
      // Map RAW_KEY → null and CUSTOM_KEY → 'custom' the way the queue
      // hook expects; the rest pass through as-is.
      const presets = keys.map((k) => (k === RAW_KEY ? null : k))
      fire('add-batch-to-queue', {
        presets,
        includeGraphics,
        prompt: aiPrompt,
        batchLabel: `${keys.length} styles`,
      })
    }

    setSelected(new Set())
    setPane('queue')
  }

  const selectAll = () => {
    setSelected((prev) => {
      const all = new Set(allPresetKeys)
      const allOn = allPresetKeys.every((k) => prev.has(k))
      // If everything's already staged, clicking "Select all" toggles to
      // clearing — matches the prototype's behavior. Custom + Raw aren't
      // part of the catalogue, leave them alone.
      if (allOn) {
        const next = new Set(prev)
        for (const k of allPresetKeys) next.delete(k)
        return next
      }
      const next = new Set(prev)
      for (const k of all) next.add(k)
      return next
    })
  }
  const allSelected = allPresetKeys.every((k) => selected.has(k))

  const removeJob = (id) => fire('queue-remove', { id })
  const retryJob = (id) => fire('queue-retry', { id })

  const openQueueJob = (job) => {
    if (job.status !== 'done') return
    const match =
      galleryEntries.find((e) => job.batchId && e.batchId === job.batchId && e.label === job.label) ||
      galleryEntries.find((e) => e.filename === job.filename) ||
      galleryEntries.find((e) => e.dataUrl === job.resultUrl)
    setModals((m) => ({ ...m, gallery: true }))
    if (match) {
      const scope = match.batchId
        ? galleryEntries.filter((e) => e.batchId === match.batchId)
        : galleryEntries.filter((e) => !e.batchId)
      const startIdx = scope.indexOf(match)
      if (startIdx === -1 || !scope.length) return
      const display = [...scope].reverse()
      const displayStart = scope.length - 1 - startIdx
      setLightboxEntry(match)
      window.dispatchEvent(
        new CustomEvent('open-lightbox', { detail: { entries: display, startIndex: displayStart } }),
      )
      setModals((m) => ({ ...m, gallery: true, lightbox: true }))
    }
  }

  return (
    <div className="mock-rs-overlay" onClick={close}>
      <aside
        className="mock-render-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Render"
      >
        {/* ─── Head: title + Styles/Queue tabs ───────────────────────── */}
        <header className="rs-head">
          <div className="rs-head-top">
            <h2 className="rs-title">Render</h2>
            <button
              type="button"
              className="rs-close"
              aria-label="Close"
              onClick={close}
            >
              ×
            </button>
          </div>
          <div className="rs-segbar" role="tablist" aria-label="Section">
            <button
              type="button"
              className={`rs-seg${pane === 'styles' ? ' is-active' : ''}`}
              role="tab"
              aria-selected={pane === 'styles'}
              onClick={() => setPane('styles')}
            >
              Styles
            </button>
            <button
              type="button"
              className={`rs-seg${pane === 'queue' ? ' is-active' : ''}`}
              role="tab"
              aria-selected={pane === 'queue'}
              onClick={() => setPane('queue')}
            >
              Queue
              <span className={`rs-seg-count${sessionStats.active > 0 ? ' is-pulsing' : ''}`}>
                {queue.length}
              </span>
            </button>
          </div>
        </header>

        {/* ─── Styles pane ─────────────────────────────────────────── */}
        {pane === 'styles' && (
          <div className="rs-pane is-active">
            <div className="rs-body">
              {/* Resolution selector */}
              <div className="rs-section">
                <div className="rs-section-head">Resolution</div>
                <div className="rs-resgroup">
                  {[1, 2, 3, 4].map((mult) => (
                    <button
                      key={mult}
                      type="button"
                      className={`rs-res-btn${exportRes === mult ? ' is-active' : ''}`}
                      onClick={() => setExportRes(mult)}
                    >
                      {mult}×
                    </button>
                  ))}
                </div>
              </div>

              {/* Staged-styles chip strip */}
              <div className={`rs-chip-strip${stagedCount === 0 ? ' is-empty' : ''}`}>
                <span className="rs-chip-strip-label">Staged</span>
                {stagedCount === 0 ? (
                  <span className="rs-chip-placeholder">Tap a style below to stage it</span>
                ) : (
                  Array.from(selected).map((key) => (
                    <span key={key} className="rs-chip" onClick={() => togglePreset(key)}>
                      {labelByKey(key)}
                      <span className="rs-chip-x">×</span>
                    </span>
                  ))
                )}
              </div>

              {/* Original (raw) card */}
              <div className="rs-section">
                <div className="rs-section-head">
                  <span>Original</span>
                  <span className="rs-section-head-count">Your scene, as-is</span>
                </div>
                <button
                  type="button"
                  className={`rs-raw${isRawSelected ? ' is-active' : ''}`}
                  onClick={() => togglePreset(RAW_KEY)}
                >
                  <div className="rs-raw-photo">
                    <img src={photoFor('raw')} alt="Raw / original scene" loading="lazy" />
                    <div className="rs-raw-check" />
                  </div>
                  <div className="rs-raw-body">
                    <div className="rs-raw-title">Raw export</div>
                    <div className="rs-raw-desc">No AI stylization — ships exactly what's on your canvas.</div>
                  </div>
                </button>
              </div>

              {/* Custom prompt */}
              <div className="rs-section">
                <div className="rs-section-head">
                  <span>Custom</span>
                  <span className="rs-section-head-count">Free-form prompt</span>
                </div>
                <button
                  type="button"
                  className={`rs-raw${isCustomSelected ? ' is-active' : ''}`}
                  onClick={() => togglePreset(CUSTOM_KEY)}
                >
                  <div className="rs-raw-photo" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)' }}>
                    <div className="rs-raw-check" />
                  </div>
                  <div className="rs-raw-body">
                    <div className="rs-raw-title">Custom prompt</div>
                    <div className="rs-raw-desc">{isCustomSelected ? 'Edit the prompt below.' : 'Describe a style — applied along with any selected presets.'}</div>
                  </div>
                </button>
                {isCustomSelected && (
                  <input
                    className="rs-input rs-custom"
                    type="text"
                    placeholder="A neon-soaked rainy night in Tokyo…"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                  />
                )}
              </div>

              {/* Provider key */}
              <div className="rs-section">
                <div className="rs-section-head">
                  <span>Gemini key</span>
                  <span className="rs-section-head-count">Stored locally</span>
                </div>
                <input
                  className="rs-input rs-provider"
                  type="password"
                  placeholder="API key (optional)"
                  value={aiKey}
                  autoComplete="off"
                  onChange={handleKeyChange}
                />
              </div>

              {/* Style catalogue — categorised grids */}
              {PRESET_CATS.map((cat) => (
                <div key={cat.title} className="rs-section">
                  <div className="rs-cat-head">
                    {cat.title}
                    <span className="rs-cat-sub">{cat.presets.length}</span>
                  </div>
                  <div className="rs-grid">
                    {cat.presets.map((p) => {
                      const on = selected.has(p.key)
                      return (
                        <button
                          key={p.key}
                          type="button"
                          className={`rs-card${on ? ' is-active' : ''}`}
                          onClick={() => togglePreset(p.key)}
                        >
                          <div className="rs-card-photo">
                            <img src={photoFor(p.file)} alt={p.label} loading="lazy" />
                            <div className="rs-card-check" />
                          </div>
                          <div className="rs-card-body">
                            <div className="rs-card-label">{p.label}</div>
                            <div className="rs-card-sub">{p.sub}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Include-graphics + cleanup toggles */}
              <div className="rs-section">
                <div className="rs-toggle-row">
                  <span>Include graphics in export</span>
                  <button
                    type="button"
                    className={`rs-toggle${includeGraphics ? ' is-on' : ''}`}
                    onClick={() => setIncludeGraphics((v) => !v)}
                    aria-pressed={includeGraphics}
                  />
                </div>
                <div className="rs-toggle-row" title="Tells the AI to clean up jagged building corners and faceted rooftops from the 3D source mesh. Turn off to keep the polygon-faceted look (e.g. for low-poly art renders).">
                  <span>Clean up mesh artifacts</span>
                  <button
                    type="button"
                    className={`rs-toggle${cleanArtifacts ? ' is-on' : ''}`}
                    onClick={() => setCleanArtifacts((v) => !v)}
                    aria-pressed={cleanArtifacts}
                  />
                </div>
              </div>

              {exportStatus && <div className="rs-footer-status">{exportStatus}</div>}
            </div>

            <footer className="rs-footer">
              <div className="rs-footer-row">
                <button type="button" className="rs-btn-ghost" onClick={selectAll}>
                  {allSelected ? 'Clear' : 'Select all'}
                </button>
                <button
                  type="button"
                  className="rs-btn-primary"
                  onClick={submitSelected}
                  disabled={stagedCount === 0}
                >
                  {stagedCount === 0
                    ? 'Pick a style'
                    : `Render ${stagedCount} ${stagedCount === 1 ? 'style' : 'styles'}`}
                </button>
              </div>
            </footer>
          </div>
        )}

        {/* ─── Queue pane ──────────────────────────────────────────── */}
        {pane === 'queue' && (
          <div className="rs-pane is-active">
            <div className={`rs-meter${sessionStats.active === 0 && sessionStats.pending === 0 ? ' is-idle' : ''}`}>
              <div className="rs-meter-label">
                {sessionStats.total === 0
                  ? 'Tray clear'
                  : sessionStats.active > 0
                    ? `Developing · ${sessionStats.pct}%`
                    : sessionStats.pending > 0
                      ? `Waiting · ${sessionStats.pct}% complete`
                      : `All fixed · ${sessionStats.done} / ${sessionStats.total}`}
              </div>
              <div className="rs-meter-counts">
                {sessionStats.done} done · {sessionStats.pending} queued
                {sessionStats.errored ? ` · ${sessionStats.errored} spoiled` : ''}
              </div>
              <div className="rs-meter-bar" style={{ '--rs-meter-pct': `${sessionStats.pct}%` }} />
            </div>

            <div className="rs-body rs-body--flush">
              <div className="rs-qlist">
                {queue.length === 0 ? (
                  <div className="rs-qempty">
                    <div className="rs-qempty-art" />
                    <div className="rs-qempty-title">Nothing brewing</div>
                    <div className="rs-qempty-body">
                      Pick a style on <em>Styles</em> and hit Render. Jobs stack up here and develop one at a time.
                    </div>
                  </div>
                ) : (
                  groupedQueue.map((group) => (
                    <div key={group.key}>
                      {group.batchId && (
                        <div className="rs-qbatch-head">
                          <div className="rs-qbatch-label">{group.label || 'Batch'}</div>
                          <div className="rs-qbatch-sub">
                            {group.jobs.filter((j) => j.status === 'done').length} / {group.jobs.length} ·{' '}
                            {group.jobs.length === 1 ? 'job' : 'jobs'}
                          </div>
                        </div>
                      )}
                      {group.jobs.map((job) => {
                        const fileSlug = fileByKey(job.preset) ?? 'raw'
                        const startedAt = job.startedAt || job.createdAt || Date.now()
                        let timer
                        if (job.status === 'active') timer = fmtElapsed(Date.now() - startedAt)
                        else if (job.status === 'done' || job.status === 'error') timer = fmtAgo(Date.now() - startedAt)
                        else timer = 'waiting'
                        const clickable = job.status === 'done'
                        const meta =
                          job.status === 'error'
                            ? null
                            : job.status === 'active'
                              ? job.statusText || 'Developing…'
                              : job.status === 'pending'
                                ? 'Waiting its turn'
                                : 'Ready in gallery'
                        return (
                          <article
                            key={job.id}
                            className={`rs-qcard${clickable ? ' is-clickable' : ''}`}
                            data-status={job.status}
                            onClick={clickable ? () => openQueueJob(job) : undefined}
                            role={clickable ? 'button' : undefined}
                            tabIndex={clickable ? 0 : undefined}
                          >
                            <div className="rs-qgutter">
                              <div className="rs-qgutter-dots" />
                            </div>
                            <div className="rs-qphoto">
                              <img src={photoFor(fileSlug)} alt={labelByKey(job.preset || RAW_KEY)} loading="lazy" />
                              <span className="rs-qribbon">{RIBBON[job.status] || job.status}</span>
                              {(job.status === 'done' || job.status === 'error') && (
                                <div className="rs-qbadge">{job.status === 'error' ? '×' : null}</div>
                              )}
                            </div>
                            <div className="rs-qbody">
                              <div className="rs-qbody-top">
                                <span className="rs-qtimer">{timer}</span>
                                <span> · </span>
                                <span>
                                  {job.resolution || exportRes}× · {RES_PX_HEIGHT[job.resolution || exportRes]}px
                                </span>
                              </div>
                              <div className="rs-qlabel">{labelByKey(job.preset || RAW_KEY)}</div>
                              {job.status === 'error' ? (
                                <div className="rs-qerror">{job.statusText || 'Render failed'}</div>
                              ) : meta ? (
                                <div className="rs-qmeta">{meta}</div>
                              ) : null}
                              <div className="rs-qactions">
                                {job.status === 'pending' && (
                                  <button type="button" className="rs-qact is-danger" onClick={(e) => { e.stopPropagation(); removeJob(job.id) }}>Remove</button>
                                )}
                                {job.status === 'active' && (
                                  <button type="button" className="rs-qact is-danger" onClick={(e) => { e.stopPropagation(); removeJob(job.id) }}>Stop</button>
                                )}
                                {job.status === 'done' && (
                                  <>
                                    <button type="button" className="rs-qact is-primary" onClick={(e) => { e.stopPropagation(); openQueueJob(job) }}>Open</button>
                                    <button type="button" className="rs-qact is-danger" onClick={(e) => { e.stopPropagation(); removeJob(job.id) }}>Remove</button>
                                  </>
                                )}
                                {job.status === 'error' && (
                                  <>
                                    <button type="button" className="rs-qact is-primary" onClick={(e) => { e.stopPropagation(); retryJob(job.id) }}>Retry</button>
                                    <button type="button" className="rs-qact is-danger" onClick={(e) => { e.stopPropagation(); removeJob(job.id) }}>Remove</button>
                                  </>
                                )}
                              </div>
                              {(job.status === 'active' || job.status === 'pending') && (
                                <div className="rs-qprogress" style={{ '--progress': `${job.progress || 0}%` }} />
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>

            <footer className="rs-footer">
              <div className="rs-footer-status">
                {sessionStats.total === 0 ? null : (
                  <>
                    <b>{sessionStats.done}</b>fixed · <b>{sessionStats.active}</b>developing · <b>{sessionStats.pending}</b>queued
                  </>
                )}
              </div>
              <button
                type="button"
                className="rs-btn-ghost is-quiet"
                onClick={() => fire('queue-clear-done')}
                disabled={sessionStats.done === 0}
              >
                Clear done
              </button>
              <button
                type="button"
                className="rs-btn-ghost is-danger"
                onClick={() => fire('clear-queue')}
                disabled={sessionStats.total === 0}
              >
                Clear all
              </button>
            </footer>
          </div>
        )}
      </aside>
    </div>
  )
}
