import { useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { exportResolutionAtom } from '../../editor/atoms/sidebar'
import { modalsAtom } from '../../editor/atoms/modals'

// Phase 16 — Capture menu ported from the prototype's
// `.menu-capture` (in editor-chrome-moma-v1.html). Opens from the
// Capture pill in ClusterBottomRight as a popover instead of the
// AIRenderModal sheet. Compact flow:
//
//   - Resolution segment (1× / 2× / 3× / 4×)
//   - Category tabs (All / Photo / Season / Art / Sketch)
//   - Style grid (3-col cards with thumbnails) — multi-select
//   - Footer: "Open full sheet" link + Render CTA
//
// Selected presets are kept in local state (Set of keys). Render
// fires `add-to-queue` once per selected preset (or
// `add-batch-to-queue` if 2+ selected, mirroring AIRenderModal's
// batch handling). "Raw" lives as a separate row above the
// categories so it's always reachable.
//
// "Open full sheet" pivots to AIRenderModal for the advanced
// experience (queue tab, custom prompt, BYOK Gemini key field).

const PRESET_CATS = [
  {
    key: 'photo',
    title: 'Photo',
    presets: [
      { key: 'realistic', label: 'Realistic',        file: 'realistic',        sub: 'PHOTO' },
      { key: 'golden',    label: 'Golden Hour',      file: 'golden-hour',      sub: 'WARM' },
      { key: 'retro70s',  label: '70s Film',         file: '70s-film',         sub: 'FADED' },
      { key: 'polaroid',  label: 'Polaroid',         file: 'polaroid',         sub: 'INSTANT' },
      { key: 'postcard',  label: 'Vintage Postcard', file: 'vintage-postcard', sub: 'HALFTONE' },
    ],
  },
  {
    key: 'season',
    title: 'Season',
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
    key: 'art',
    title: 'Art',
    presets: [
      { key: 'watercolor',   label: 'Watercolor',     file: 'watercolor',     sub: 'WASH' },
      { key: 'oilpaint',     label: 'Oil Painting',   file: 'oil-painting',   sub: 'IMPASTO' },
      { key: 'pastel',       label: 'Pastel Dream',   file: 'pastel-dream',   sub: 'SOFT' },
      { key: 'gouache',      label: 'Gouache',        file: 'gouache',        sub: 'MATTE' },
      { key: 'stainedglass', label: 'Stained Glass',  file: 'stained-glass',  sub: 'JEWEL' },
      { key: 'ghibli',       label: 'Studio Ghibli',  file: 'studio-ghibli',  sub: 'ANIME' },
      { key: 'travelposter', label: 'Travel Poster',  file: 'travel-poster',  sub: 'DECO' },
      { key: 'cyberpunk',    label: 'Cyberpunk',      file: 'cyberpunk',      sub: 'NEON' },
    ],
  },
  {
    key: 'sketch',
    title: 'Sketch',
    presets: [
      { key: 'pencilsketch', label: 'Pencil Sketch',    file: 'pencil-sketch',    sub: 'GRAPHITE' },
      { key: 'charcoal',     label: 'Charcoal',         file: 'charcoal',         sub: 'SMUDGE' },
      { key: 'crosshatch',   label: 'Crosshatch',       file: 'ink-crosshatch',   sub: 'INK' },
      { key: 'lineart',      label: 'Line Drawing',     file: 'line-drawing',     sub: 'OUTLINE' },
      { key: 'architect',    label: 'Architect',        file: 'architect-marker', sub: 'MARKER' },
      { key: 'pixel',        label: 'Pixel Art',        file: 'pixel-art',        sub: '16-BIT' },
      { key: 'blueprint',    label: 'Blueprint',        file: 'blueprint',        sub: 'TECHNICAL' },
      { key: 'woodblock',    label: 'Ukiyo-e',          file: 'ukiyo-e-print',    sub: 'BLOCK' },
    ],
  },
]

// Filename-timestamp manifest (mirrors AIRenderModal's FILE_TS).
// Kept inline here so CaptureMenu doesn't depend on AIRenderModal.
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

const ALL_CATS = [{ key: 'all', title: 'All' }, ...PRESET_CATS.map((c) => ({ key: c.key, title: c.title }))]

export default function CaptureMenu({ onClose }) {
  const [selected, setSelected] = useState(() => new Set())
  const [activeCat, setActiveCat] = useState('all')
  const [exportRes, setExportRes] = useAtom(exportResolutionAtom)
  const setModals = useSetAtom(modalsAtom)

  const togglePreset = (key) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const visibleCats = activeCat === 'all'
    ? PRESET_CATS
    : PRESET_CATS.filter((c) => c.key === activeCat)

  const render = () => {
    if (selected.size === 0) {
      // No selection → fire raw export (uses RAW_KEY → preset: null).
      window.dispatchEvent(new CustomEvent('add-to-queue', { detail: { preset: null } }))
      onClose?.()
      return
    }
    const keys = Array.from(selected)
    // RAW_KEY → null per useQueue's contract; everything else passes through.
    const presets = keys.map((k) => (k === RAW_KEY ? null : k))
    if (presets.length === 1) {
      window.dispatchEvent(
        new CustomEvent('add-to-queue', { detail: { preset: presets[0] } }),
      )
    } else {
      const batchId = 'batch-' + Date.now()
      window.dispatchEvent(
        new CustomEvent('add-batch-to-queue', {
          detail: { presets, batchId, batchLabel: `${presets.length} styles` },
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

  const selectionCount = selected.size

  return (
    <div className="mock-menu-capture">
      <div className="mock-menu-capture-head">
        <span className="mock-menu-capture-title">Capture</span>
        <span className="mock-menu-capture-meta">
          {selectionCount === 0
            ? 'Pick styles or Render raw'
            : `${selectionCount} ${selectionCount === 1 ? 'style' : 'styles'} selected`}
        </span>
      </div>

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

      <div className="mock-menu-capture-cats" role="tablist" aria-label="Style category">
        {ALL_CATS.map((c) => (
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

      <button
        type="button"
        className={`mock-menu-capture-raw${selected.has(RAW_KEY) ? ' is-active' : ''}`}
        onClick={() => togglePreset(RAW_KEY)}
      >
        <span className="mock-menu-capture-raw-glyph" aria-hidden="true" />
        <span className="mock-menu-capture-raw-label">Raw</span>
        <span className="mock-menu-capture-raw-sub">No AI · scene as-is</span>
      </button>

      <div className="mock-menu-capture-grid" data-cat={activeCat}>
        {visibleCats.flatMap((c) =>
          c.presets.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`mock-menu-capture-style${selected.has(p.key) ? ' is-active' : ''}`}
              onClick={() => togglePreset(p.key)}
              title={p.label}
            >
              <div className="mock-menu-capture-style-thumb">
                <img src={photoFor(p.file)} alt={p.label} loading="lazy" />
              </div>
              <div className="mock-menu-capture-style-body">
                <span className="mock-menu-capture-style-label">{p.label}</span>
                <span className="mock-menu-capture-style-sub">{p.sub}</span>
              </div>
            </button>
          )),
        )}
      </div>

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
          onClick={render}
        >
          {selectionCount > 1 ? `Render ${selectionCount}` : 'Render'}
        </button>
      </div>
    </div>
  )
}
