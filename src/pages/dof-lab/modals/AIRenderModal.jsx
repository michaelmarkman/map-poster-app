import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { modalsAtom, lightboxEntryAtom } from '../../editor/atoms/modals'
import {
  aiPromptAtom,
  aiPresetAtom,
  aiApiKeyAtom,
  exportResolutionAtom,
  queueAtom,
} from '../../editor/atoms/sidebar'
import { galleryEntriesAtom } from '../../editor/atoms/gallery'

const PRESET_CATS = [
  {
    title: 'Photography',
    presets: [
      { key: 'realistic', label: 'Realistic', dot: '#8b9a7b' },
      { key: 'golden', label: 'Golden Hour', dot: '#d4a24e' },
      { key: 'retro70s', label: '70s Film', dot: '#c48a4a' },
      { key: 'polaroid', label: 'Polaroid', dot: '#e8d4a0' },
      { key: 'postcard', label: 'Vintage Postcard', dot: '#7a9abc' },
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
      { key: 'travelposter', label: 'Travel Poster', dot: '#d46a5a' },
    ],
  },
  {
    title: 'Sketch & Drawing',
    presets: [
      { key: 'pencilsketch', label: 'Pencil', dot: '#7a7468' },
      { key: 'crosshatch', label: 'Crosshatch', dot: '#1c1a16', border: '1px solid rgba(255,255,255,0.18)' },
      { key: 'charcoal', label: 'Charcoal', dot: '#4a4642' },
      { key: 'lineart', label: 'Line Art', dot: '#2a2a2a', border: '1px solid rgba(255,255,255,0.18)' },
      { key: 'architect', label: 'Architect', dot: '#a8a090' },
      { key: 'traveljournal', label: 'Travel Journal', dot: '#b88558' },
      { key: 'blueprint', label: 'Blueprint', dot: '#2a4a8a' },
      { key: 'woodblock', label: 'Ukiyo-e', dot: '#2a4f7a' },
    ],
  },
]
const CUSTOM_KEY = 'custom'
const LS_GEMINI_KEY = 'mapposter3d_gemini_key'

function fire(name, detail) {
  window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name))
}

export default function AIRenderModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const open = modals.aiRender
  const [aiPrompt, setAiPrompt] = useAtom(aiPromptAtom)
  const setAiPreset = useSetAtom(aiPresetAtom)
  const [aiKey, setAiKey] = useAtom(aiApiKeyAtom)
  const [exportRes, setExportRes] = useAtom(exportResolutionAtom)
  const queue = useAtomValue(queueAtom)
  const galleryEntries = useAtomValue(galleryEntriesAtom)
  const setLightboxEntry = useSetAtom(lightboxEntryAtom)

  // Local state — multi-select presets, graphics-include toggle, status.
  const [selected, setSelected] = useState(() => new Set())
  const [includeGraphics, setIncludeGraphics] = useState(true)
  const [exportStatus, setExportStatus] = useState('')

  useEffect(() => {
    if (!open) return
    try {
      const stored = localStorage.getItem(LS_GEMINI_KEY) || ''
      if (stored && !aiKey) setAiKey(stored)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    const onStatus = (e) => setExportStatus(e?.detail ?? '')
    window.addEventListener('export-status', onStatus)
    return () => window.removeEventListener('export-status', onStatus)
  }, [])

  if (!open) return null

  const handleKeyChange = (e) => {
    const v = e.target.value
    setAiKey(v)
    try {
      if (v) localStorage.setItem(LS_GEMINI_KEY, v)
      else localStorage.removeItem(LS_GEMINI_KEY)
    } catch {}
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
  const queueCount = selected.size

  const exportRaw = () => {
    fire('add-to-queue', { preset: null, includeGraphics })
  }

  const queueSelected = () => {
    if (selected.size === 0) return
    Array.from(selected).forEach((preset) => {
      // Update the atom too so /app sidebar (which reads aiPresetAtom) shows
      // the latest selection if the user hops over.
      setAiPreset(preset)
      fire('add-to-queue', { preset, includeGraphics, prompt: aiPrompt })
    })
    setSelected(new Set())
  }

  // Skip the Custom slot — its prompt depends on user input. "Add all"
  // means the curated catalogue, not free-form prompts.
  const allPresetKeys = PRESET_CATS.flatMap((c) => c.presets.map((p) => p.key))

  const queueAll = () => {
    allPresetKeys.forEach((preset) => {
      setAiPreset(preset)
      fire('add-to-queue', { preset, includeGraphics, prompt: aiPrompt })
    })
    setSelected(new Set())
  }

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
    <div className="mock-airender-backdrop" onClick={() => setModals((m) => ({ ...m, aiRender: false }))}>
      <aside
        className="mock-airender-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Render"
      >
        <header className="mock-airender-head">
          <h2>Render</h2>
          <button
            type="button"
            className="mock-airender-close"
            aria-label="Close"
            onClick={() => setModals((m) => ({ ...m, aiRender: false }))}
          >
            ×
          </button>
        </header>

        <div className="mock-airender-body">
          {/* ─── Common settings ─── */}
          <div className="mock-airender-section">
            <div className="mock-airender-section-head">Resolution</div>
            <div className="mock-resgroup">
              {[1, 2, 3, 4].map((mult) => (
                <button
                  key={mult}
                  type="button"
                  className={`mock-res-btn${exportRes === mult ? ' is-active' : ''}`}
                  onClick={() => setExportRes(mult)}
                >
                  {mult}×
                </button>
              ))}
            </div>
          </div>

          {/* ─── No stylization ─── */}
          <div className="mock-airender-section">
            <div className="mock-airender-section-head">No stylization</div>
            <button type="button" className="mock-btn-ghost mock-airender-raw" onClick={exportRaw}>
              Add raw export to queue
            </button>
          </div>

          {/* ─── AI styles ─── */}
          <div className="mock-airender-section">
            <div className="mock-airender-section-head">
              AI styles{queueCount ? ` · ${queueCount} selected` : ''}
            </div>
            <input
              className="mock-input mock-input--block"
              type="password"
              placeholder="Gemini API key (optional)"
              value={aiKey}
              autoComplete="off"
              onChange={handleKeyChange}
            />

            {PRESET_CATS.map((cat) => (
              <div key={cat.title} className="mock-preset-cat">
                <div className="mock-preset-cat-title">{cat.title}</div>
                <div className="mock-preset-grid">
                  {cat.presets.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`mock-preset${selected.has(p.key) ? ' is-active' : ''}`}
                      onClick={() => togglePreset(p.key)}
                    >
                      <span
                        className="mock-preset-dot"
                        style={{ background: p.dot, ...(p.border ? { border: p.border } : null) }}
                      />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Custom preset — always available, but the prompt textbox only
             * appears when this preset is selected. */}
            <div className="mock-preset-cat">
              <div className="mock-preset-cat-title">Custom</div>
              <div className="mock-preset-grid">
                <button
                  type="button"
                  className={`mock-preset${isCustomSelected ? ' is-active' : ''}`}
                  style={{ gridColumn: 'span 2' }}
                  onClick={() => togglePreset(CUSTOM_KEY)}
                >
                  <span className="mock-preset-dot" style={{ background: '#888' }} />
                  Custom prompt
                </button>
              </div>
              {isCustomSelected ? (
                <input
                  className="mock-input mock-input--block"
                  type="text"
                  placeholder="Describe the style…"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              ) : null}
            </div>
          </div>

          {/* ─── Queue ─── */}
          <div className="mock-airender-queue">
            <div className="mock-airender-queue-head">
              <span>Queue</span>
              <span className="mock-pill-label">{queue.length}</span>
            </div>
            {queue.length === 0 ? (
              <div className="mock-empty">Queue is empty.</div>
            ) : (
              <ul className="mock-airender-queue-list">
                {queue.map((job) => {
                  const clickable = job.status === 'done'
                  return (
                    <li
                      key={job.id}
                      className={`mock-airender-queue-item${clickable ? ' is-clickable' : ''}`}
                      data-status={job.status}
                      onClick={clickable ? () => openQueueJob(job) : undefined}
                      role={clickable ? 'button' : undefined}
                      tabIndex={clickable ? 0 : undefined}
                    >
                      <span>{job.label ?? job.id}</span>
                      <span className="mock-airender-queue-status">{job.statusText ?? job.status}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            {exportStatus ? <div className="mock-airender-status">{exportStatus}</div> : null}
            <div className="mock-airender-queue-actions">
              <button type="button" className="mock-btn-ghost" onClick={() => fire('queue-clear-done')}>
                Clear done
              </button>
              <button type="button" className="mock-btn-ghost" onClick={() => fire('clear-queue')}>
                Clear all
              </button>
            </div>
          </div>
        </div>

        <footer className="mock-airender-footer">
          <div className="mock-toggle-row" style={{ marginBottom: 10 }}>
            <span>Include graphics in export</span>
            <button
              type="button"
              className={`mock-toggle${includeGraphics ? ' is-on' : ''}`}
              onClick={() => setIncludeGraphics((v) => !v)}
              aria-pressed={includeGraphics}
            />
          </div>
          <div className="mock-airender-footer-row">
            <button
              type="button"
              className="mock-btn-ghost"
              onClick={queueAll}
              title={`Render every style in the catalogue (${allPresetKeys.length} jobs)`}
            >
              Add all {allPresetKeys.length}
            </button>
            <button
              type="button"
              className="mock-btn-primary"
              onClick={queueSelected}
              disabled={queueCount === 0}
              style={{ marginTop: 0 }}
            >
              {queueCount > 0 ? `Add ${queueCount} to queue` : 'Pick a style'}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
