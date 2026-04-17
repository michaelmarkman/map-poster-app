import { useState, useEffect } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import SidebarSection from './SidebarSection'
import {
  aiEnhanceAtom,
  aiPromptAtom,
  aiPresetAtom,
  aiApiKeyAtom,
  exportResolutionAtom,
  savedViewsAtom,
  queueAtom,
} from '../atoms/sidebar'
import { galleryCountAtom, galleryEntriesAtom } from '../atoms/gallery'
import { useSetAtom } from 'jotai'
import { modalsAtom, lightboxEntryAtom } from '../atoms/modals'

// Export sidebar section — ported from prototypes/poster-v3-ui.html lines
// 2473-2598. Contains: quick-download, render-styles dropdown (AI settings +
// preset grid), queue dropdown, time-machine / print / gallery nav-rows, and
// saved-views dropdown. Handler wiring for generate / time-machine / print /
// gallery / save-view / batch-export etc. lands in Phase 5; for now the row
// buttons just dispatch the same window events the prototype listens on.

// Preset catalog — matches the markup in poster-v3-ui.html exactly.
const PRESET_CATS = [
  {
    title: 'Photography',
    presets: [
      { key: 'realistic', label: 'Realistic', dot: '#8b9a7b' },
      { key: 'golden', label: 'Golden Hour', dot: '#d4a24e' },
      { key: 'retro70s', label: '70s Film', dot: '#c48a4a' },
      { key: 'polaroid', label: 'Polaroid', dot: '#e8d4a0' },
      { key: 'postcard', label: 'Vintage Postcard', dot: '#7a9abc' },
      { key: 'travelposter', label: 'Travel Poster', dot: '#d46a5a' },
    ],
  },
  {
    title: 'Seasons & Weather',
    presets: [
      { key: 'night', label: 'Night', dot: '#2a2a5a' },
      { key: 'snowfall', label: 'Snowfall', dot: '#c8d4e0' },
      { key: 'autumn', label: 'Autumn', dot: '#c45a2a' },
      { key: 'cherry', label: 'Cherry Blossom', dot: '#e8a0b8' },
      { key: 'rainy', label: 'Rainy', dot: '#5a6a7a' },
      { key: 'foggy', label: 'Foggy Dawn', dot: '#8a8a7a' },
    ],
  },
  {
    title: 'Art Styles',
    presets: [
      { key: 'watercolor', label: 'Watercolor', dot: '#6a9ab8' },
      { key: 'oilpaint', label: 'Oil Painting', dot: '#8a6a3a' },
      { key: 'gouache', label: 'Gouache', dot: '#c8b08a' },
      { key: 'pastel', label: 'Pastel Dream', dot: '#b8a0c8' },
      { key: 'stainedglass', label: 'Stained Glass', dot: '#c43a6a' },
      { key: 'pixel', label: 'Pixel Art', dot: '#4aaa4a' },
      { key: 'cyberpunk', label: 'Cyberpunk', dot: '#aa2aaa' },
      { key: 'ghibli', label: 'Studio Ghibli', dot: '#5aaa8a' },
    ],
  },
  {
    title: 'Sketch & Drawing',
    presets: [
      { key: 'pencilsketch', label: 'Pencil', dot: '#7a7468' },
      {
        key: 'crosshatch',
        label: 'Crosshatch',
        dot: '#1c1a16',
        border: '1px solid var(--ink-dim)',
      },
      { key: 'charcoal', label: 'Charcoal', dot: '#4a4642' },
      {
        key: 'lineart',
        label: 'Line Art',
        dot: '#2a2a2a',
        border: '1px solid var(--ink-dim)',
      },
      { key: 'architect', label: 'Architect', dot: '#a8a090' },
      { key: 'traveljournal', label: 'Travel Journal', dot: '#b88558' },
      { key: 'blueprint', label: 'Blueprint', dot: '#2a4a8a' },
      { key: 'woodblock', label: 'Ukiyo-e', dot: '#2a4f7a' },
    ],
  },
]

const LS_GEMINI_KEY = 'mapposter3d_gemini_key'

// Tiny helper — the prototype uses window.dispatchEvent for every cross-
// component handoff. Keeping that channel so Phase 5 hooks can pick up the
// same events unchanged.
function fire(name, detail) {
  window.dispatchEvent(
    detail !== undefined
      ? new CustomEvent(name, { detail })
      : new Event(name),
  )
}

export default function ExportSection() {
  // aiEnhanceAtom stays for useQueue's read path + session persistence
  // but we don't render a toggle; opening the Render Styles panel IS
  // the AI mode.
  useAtom(aiEnhanceAtom)
  const [aiPrompt, setAiPrompt] = useAtom(aiPromptAtom)
  const [aiPreset, setAiPreset] = useAtom(aiPresetAtom)
  const [aiKey, setAiKey] = useAtom(aiApiKeyAtom)
  const [exportRes, setExportRes] = useAtom(exportResolutionAtom)
  const [savedViews] = useAtom(savedViewsAtom)
  const [queue] = useAtom(queueAtom)
  const galleryCount = useAtomValue(galleryCountAtom)
  const galleryEntries = useAtomValue(galleryEntriesAtom)
  const setModals = useSetAtom(modalsAtom)
  const setLightboxEntry = useSetAtom(lightboxEntryAtom)

  // Click a finished queue job → open the gallery + focus its matching
  // entry in the lightbox. Match order of preference: batchId collision,
  // filename match, then resultUrl (dataUrl equality). If we can't find
  // the gallery entry yet (hook hasn't finished the gallery-add dance),
  // just open the gallery and scroll happens naturally.
  const openQueueJob = (job) => {
    if (job.status !== 'done') return
    const match =
      galleryEntries.find((e) => job.batchId && e.batchId === job.batchId && e.label === job.label) ||
      galleryEntries.find((e) => e.filename === job.filename) ||
      galleryEntries.find((e) => e.dataUrl === job.resultUrl)
    setModals((m) => ({ ...m, gallery: true }))
    if (match) {
      // Build a scoped entries list matching the gallery's own rule: if
      // the match is part of a batch, scope to that batch; otherwise
      // scope to singletons. Mirrors GalleryModal.openLightboxWith so
      // nav feels consistent.
      const scope = match.batchId
        ? galleryEntries.filter((e) => e.batchId === match.batchId)
        : galleryEntries.filter((e) => !e.batchId)
      const startIdx = scope.indexOf(match)
      if (startIdx === -1 || !scope.length) return
      const display = [...scope].reverse()
      const displayStart = scope.length - 1 - startIdx
      setLightboxEntry(match)
      window.dispatchEvent(
        new CustomEvent('open-lightbox', {
          detail: { entries: display, startIndex: displayStart },
        }),
      )
      setModals((m) => ({ ...m, gallery: true, lightbox: true }))
    }
  }

  // Dropdown open-state — each nav-row with `.dropdown-chev` toggles the
  // panel below. Tracked locally (matches the prototype's DOM-classlist
  // approach) since we don't need cross-section coordination.
  const [renderOpen, setRenderOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)

  // Export status text — shown below the queue list while a job is running.
  // For now we just listen to the `export-status` window event; the actual
  // text comes from the queue hook in Phase 5.
  const [exportStatus, setExportStatus] = useState('')

  // Hydrate the Gemini key from localStorage on first mount so the input
  // shows what the v2 exporter will read back.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_GEMINI_KEY) || ''
      if (stored && !aiKey) setAiKey(stored)
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Allow an external source to push queue auto-open (prototype used
  // window.__openQueueDropdown for this). Expose the same hook.
  useEffect(() => {
    window.__openQueueDropdown = () => setQueueOpen(true)
    return () => {
      if (window.__openQueueDropdown) delete window.__openQueueDropdown
    }
  }, [])

  // Pick up status updates from whatever hook drives the queue.
  useEffect(() => {
    const onStatus = (e) => setExportStatus(e?.detail ?? '')
    window.addEventListener('export-status', onStatus)
    return () => window.removeEventListener('export-status', onStatus)
  }, [])

  const handleKeyChange = (e) => {
    const v = e.target.value
    setAiKey(v)
    // Mirror to localStorage so the v2 exporter can read it back. Key was
    // purged at startup (see poster-v3-ui.jsx line 60); the sidebar now
    // re-adds the ability to set it as a local-only preference.
    try {
      if (v) localStorage.setItem(LS_GEMINI_KEY, v)
      else localStorage.removeItem(LS_GEMINI_KEY)
    } catch (err) {}
  }

  const togglePreset = (key) => {
    // Single-select — click the active preset to clear.
    setAiPreset((cur) => (cur === key ? null : key))
  }

  const clearDone = () => {
    // TODO(Phase 5): the queue hook owns the array. For now dispatch an
    // event so the legacy prototype handler (and the upcoming hook) can
    // respond. Atom-backed queue doesn't have mutable status entries yet.
    fire('queue-clear-done')
  }

  const clearAll = () => {
    fire('clear-queue')
  }

  return (
    <SidebarSection name="export" title="Export">
      <button className="primary-action" id="quick-download-btn" type="button" onClick={() => fire('quick-download')}>
        <span className="l">
          <span className="title">Quick download</span>
          <span className="sub">PNG &middot; 2x &middot; current frame</span>
        </span>
        <span className="arrow">&darr;</span>
      </button>

      {/* ─── Render styles dropdown ─────────────────────────────── */}
      <button
        className={`nav-row dropdown${renderOpen ? ' open' : ''}`}
        id="open-render-styles-btn"
        type="button"
        onClick={() => setRenderOpen((v) => !v)}
      >
        <span>Render styles</span>
        <span className="right">
          <span id="render-styles-count">0 styles</span>
          <span className="chev dropdown-chev">&rsaquo;</span>
        </span>
      </button>
      <div
        className={`dropdown-panel${renderOpen ? ' open' : ''}`}
        id="render-styles-panel"
      >
        {/* No AI-enhance toggle here — opening this panel implies AI
            rendering. Quick download (above) is the non-AI path. */}
        <div id="ai-settings">
          <input
            className="text-input"
            id="gemini-api-key"
            value={aiKey}
            placeholder="Gemini API key (optional)"
            autoComplete="off"
            onChange={handleKeyChange}
          />
          <input
            className="text-input"
            id="gemini-prompt"
            placeholder="Prompt (optional)"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <div id="ai-presets">
            {PRESET_CATS.map((cat) => (
              <div key={cat.title}>
                <div className="preset-cat">{cat.title}</div>
                <div className="preset-grid">
                  {cat.presets.map((p) => (
                    <button
                      key={p.key}
                      className={`ai-preset${aiPreset === p.key ? ' active' : ''}`}
                      data-preset={p.key}
                      type="button"
                      onClick={() => togglePreset(p.key)}
                    >
                      <span
                        className="preset-dot"
                        style={{ background: p.dot, ...(p.border ? { border: p.border } : null) }}
                      />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="render-actions">
          <select
            id="export-res"
            value={exportRes}
            onChange={(e) => setExportRes(+e.target.value)}
          >
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="3">3x</option>
            <option value="4">4x</option>
          </select>
          <button
            className="btn ghost"
            id="generate-all-btn"
            type="button"
            onClick={() => fire('generate-all')}
          >
            Generate all
          </button>
          <button
            className="btn primary"
            id="export-btn"
            type="button"
            onClick={() => fire('add-to-queue')}
          >
            Add to queue
          </button>
        </div>
      </div>

      {/* ─── Queue dropdown ─────────────────────────────────────── */}
      <button
        className={`nav-row dropdown${queueOpen ? ' open' : ''}`}
        id="open-queue-btn"
        type="button"
        onClick={() => setQueueOpen((v) => !v)}
      >
        <span>Queue</span>
        <span className="right">
          <span id="queue-count">{queue.length}</span>
          <span className="chev dropdown-chev">&rsaquo;</span>
        </span>
      </button>
      <div
        className={`dropdown-panel${queueOpen ? ' open' : ''}`}
        id="queue-panel"
      >
        <div id="export-queue">
          {/* TODO(Phase 5): render real queue cards once useQueue hook lands. */}
          {queue.map((job) => {
            const clickable = job.status === 'done'
            return (
              <div
                key={job.id}
                className={`queue-item${clickable ? ' clickable' : ''}`}
                data-status={job.status}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => openQueueJob(job) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openQueueJob(job)
                        }
                      }
                    : undefined
                }
                title={clickable ? 'View in gallery' : undefined}
              >
                <span>{job.label ?? job.id}</span>
                <span>{job.statusText ?? job.status}</span>
              </div>
            )
          })}
        </div>
        <div id="queue-empty" style={{ display: queue.length === 0 ? 'block' : 'none' }}>
          Queue is empty.
        </div>
        <div
          id="export-status"
          style={{
            marginTop: 8,
            fontSize: 10,
            color: 'var(--ink-dim)',
            textAlign: 'center',
            display: exportStatus ? 'block' : 'none',
          }}
        >
          {exportStatus}
        </div>
        <div className="queue-actions">
          <button
            className="btn ghost"
            id="queue-clear-done-btn"
            type="button"
            onClick={clearDone}
          >
            Clear done
          </button>
          <button
            className="btn ghost"
            id="queue-clear-all-btn"
            type="button"
            onClick={clearAll}
          >
            Clear all
          </button>
        </div>
      </div>

      {/* ─── Time machine — hidden until the producer pipeline (Phase 7+) is
          ready to stream historical decades. Keyboard shortcut 'T' still
          opens the modal for anyone who knows about it; the sidebar
          button is pulled so it doesn't look like a live feature. */}

      {/* ─── Print-ready export ─────────────────────────────────── */}
      <button
        className="nav-row"
        id="print-export-btn"
        type="button"
        onClick={() => fire('open-print-export')}
      >
        <span>Print-ready export</span>
        <span className="right">
          <span>300 DPI</span>
          <span className="chev">&rsaquo;</span>
        </span>
      </button>

      {/* ─── Gallery ────────────────────────────────────────────── */}
      <button
        className="nav-row"
        id="open-gallery-btn"
        type="button"
        onClick={() => fire('open-gallery')}
      >
        <span>Gallery</span>
        <span className="right">
          <span id="gallery-nav-count">{galleryCount}</span>
          <span className="chev">&rsaquo;</span>
        </span>
      </button>

      {/* ─── Saved views dropdown ───────────────────────────────── */}
      <button
        className={`nav-row dropdown${savedOpen ? ' open' : ''}`}
        id="open-saved-views-btn"
        type="button"
        onClick={() => setSavedOpen((v) => !v)}
      >
        <span>Saved views</span>
        <span className="right">
          <span id="saved-views-count">{savedViews.length}</span>
          <span className="chev dropdown-chev">&rsaquo;</span>
        </span>
      </button>
      <div
        className={`dropdown-panel${savedOpen ? ' open' : ''}`}
        id="saved-views-panel"
      >
        <div id="saved-views-list" style={{ display: savedViews.length ? 'block' : 'none' }}>
          {savedViews.map((view) => (
            <div key={view.id} className="saved-view-item">
              <button
                type="button"
                className="saved-view-load"
                onClick={() => fire('load-view', view.id)}
              >
                {view.name || 'Untitled view'}
              </button>
              <button
                type="button"
                className="saved-view-delete"
                aria-label="Delete saved view"
                onClick={(e) => {
                  e.stopPropagation()
                  fire('delete-view', view.id)
                }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <div id="saved-empty" style={{ display: savedViews.length ? 'none' : 'block' }}>
          No saved views yet.
        </div>
        <button
          className="btn primary"
          id="save-view-btn"
          type="button"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => fire('save-view')}
        >
          Save current view
        </button>
        <button
          className="btn"
          id="batch-export-btn"
          type="button"
          style={{
            width: '100%',
            marginTop: 6,
            background: 'var(--bg-2)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--ink)',
            fontSize: 12,
          }}
          onClick={() => fire('batch-export')}
        >
          &#128230; Batch export all
        </button>
      </div>
    </SidebarSection>
  )
}
