import { useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import {
  aiPromptAtom,
  exportResolutionAtom,
} from '../../editor/atoms/sidebar'
import { modalsAtom } from '../../editor/atoms/modals'

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

// Resolution → pixel-height map for the meta readout.
const RES_PX = { 1: 1080, 2: 2160, 3: 3240, 4: 4320 }

export default function CaptureMenu({ onClose }) {
  const [selected, setSelected] = useState(() => new Set())
  const [activeCat, setActiveCat] = useState('all')
  const [exportRes, setExportRes] = useAtom(exportResolutionAtom)
  const [aiPrompt, setAiPrompt] = useAtom(aiPromptAtom)
  const setModals = useSetAtom(modalsAtom)

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
      onClose?.()
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
    onClose?.()
  }

  const openFullSheet = () => {
    setModals((m) => ({ ...m, aiRender: true }))
    onClose?.()
  }

  // Visible presets: filtered by active category.
  const visible = activeCat === 'all'
    ? PRESETS
    : PRESETS.filter((p) => p.tags.includes(activeCat))

  return (
    <div className="mock-menu-capture">
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
        {/* Raw + Custom are pinned cards: always visible regardless of
            active category. Raw uses a stripe-pattern thumb; Custom
            uses a flat gradient with a sparkle icon. */}
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
        <button
          type="button"
          className="mock-menu-capture-render"
          onClick={dispatchRender}
        >
          {selectionCount > 1 ? `Render ${selectionCount}` : 'Render'}
        </button>
      </div>
    </div>
  )
}
