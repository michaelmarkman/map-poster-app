import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  defaultSavedViewIdAtom,
  savedViewsAtom,
} from '../../editor/atoms/sidebar'
import { dispatchFlyTo } from '../../editor/scene/events'
import presetData from '../../../data/presetViews.json'

const PRESETS = presetData.presets || []

// Phase 21 — restructured to match the prototype's `.menu-views`
// recipe byte-for-byte:
//
//   ┌ section label: SAVED VIEWS · N ┐
//   ├ + Save current view (.menu-action) ┤
//   ├ divider ────────────────────── ┤
//   ├ filter input (when N > 6) ──── ┤
//   ├ scrollable list, single-col   ┤
//   │   • thumb 36×24 · name · lens · pin · ×  ┤
//   │   …                            ┤
//   ├ divider ────────────────────── ┤
//   ├ section label: TOUR ────────── ┤
//   ├ tour rows (single-col, name · city sub) ┤
//   └────────────────────────────────┘
//
// Was: 2-col card grid for both saved views + tour, Save button at
// bottom. The prototype's single-col compact rows are more legible
// at the menu width and align with the prototype's MoMA menu
// vocabulary (`.menu-view-item` recipe).

function fire(name, detail) {
  window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name))
}

function ViewRow({ view, isDefault, onClose }) {
  // Phase 21 — compact single-line row matching the prototype's
  // `.menu-view-item`. Two hover affordances only (pin + delete);
  // rename + reorder are dropped from this menu surface for parity
  // with the prototype (the renderable view-name + inline edit
  // input — production-only product affordances — can return as a
  // contextual menu or detail view later).
  const lens = view.camera?.fov
    ? `${Math.round(2 * Math.atan(12 / (view.camera.fov / 2 * Math.PI / 180)))}mm`
    : view.lens || ''
  return (
    <li className="svp-row">
      <button
        type="button"
        className="svp-row-main"
        onClick={() => {
          fire('load-view', view.id)
          onClose?.()
        }}
        aria-label={`Load saved view ${view.name || 'untitled'}`}
      >
        <span className="svp-thumb">
          {view.thumbnail ? (
            <img src={view.thumbnail} alt="" draggable={false} />
          ) : (
            <span className="svp-thumb-placeholder" aria-hidden />
          )}
        </span>
        <span className="svp-name">{view.name || 'Untitled view'}</span>
        {lens && <span className="svp-lens">{lens}</span>}
      </button>

      <button
        type="button"
        className={`svp-pin${isDefault ? ' is-default' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          fire('set-default-view', { id: isDefault ? null : view.id })
        }}
        aria-label={isDefault ? 'Unset default' : 'Set as default'}
        title={isDefault ? 'Default view — opens on cold load' : 'Set as default'}
      >
        <svg viewBox="0 0 11 11" aria-hidden="true">
          <path
            d="M5.5 1l1.4 2.85 3.15.45-2.27 2.22.54 3.13L5.5 8.18 2.68 9.65l.54-3.13L.95 4.3l3.15-.45L5.5 1z"
            fill={isDefault ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </button>
      <button
        type="button"
        className="svp-del"
        onClick={(e) => {
          e.stopPropagation()
          // Saved views can't be undone — confirm first.
          if (!window.confirm(`Delete "${view.name || 'this view'}"?`)) return
          fire('delete-view', view.id)
        }}
        aria-label="Delete"
        title="Delete"
      >
        <svg viewBox="0 0 11 11" aria-hidden="true">
          <path d="M3 3l5 5M8 3l-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </li>
  )
}

const FILTER_THRESHOLD = 6

export default function SavedViewsPanel({ onClose }) {
  const savedViews = useAtomValue(savedViewsAtom)
  const [defaultId, setDefaultId] = useAtom(defaultSavedViewIdAtom)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const onSetDefault = (e) => {
      const id = e?.detail?.id
      setDefaultId(id ?? null)
    }
    window.addEventListener('set-default-view', onSetDefault)
    return () => window.removeEventListener('set-default-view', onSetDefault)
  }, [setDefaultId])

  const needle = filter.trim().toLowerCase()
  const visibleViews = needle
    ? savedViews.filter((v) => (v.name || '').toLowerCase().includes(needle))
    : savedViews
  const showFilter = savedViews.length > FILTER_THRESHOLD

  const flyToPreset = (preset) => {
    dispatchFlyTo({
      lat: preset.lat,
      lng: preset.lng,
      altitude: preset.altitude,
      tilt: preset.tilt,
      heading: preset.heading,
      fovMm: preset.fovMm,
    })
    onClose?.()
  }

  return (
    <div className="svp">
      <div className="svp-section-label">
        <span>Saved Views</span>
        {savedViews.length > 0 && (
          <span className="svp-count">{savedViews.length}</span>
        )}
      </div>

      <button
        type="button"
        className="svp-action"
        onClick={() => {
          fire('save-view')
          onClose?.()
        }}
      >
        <span className="svp-action-icon">
          <svg viewBox="0 0 9 9" aria-hidden="true">
            <path d="M4.5 1v7M1 4.5h7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
        <span>Save current view</span>
      </button>

      {showFilter && (
        <div className="svp-filter">
          <svg
            className="svp-filter-icon"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="4.5" cy="4.5" r="3" />
            <path d="M6.7 6.7 9 9" />
          </svg>
          <input
            className="svp-filter-input"
            type="text"
            value={filter}
            placeholder="Filter saved views…"
            aria-label="Filter saved views"
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setFilter('')
              }
            }}
          />
          {filter && (
            <button
              type="button"
              className="svp-filter-clear"
              onClick={() => setFilter('')}
              aria-label="Clear filter"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>
      )}

      {savedViews.length === 0 ? (
        <div className="svp-empty">
          <div className="svp-empty-text">No saved views yet.</div>
          <div className="svp-empty-hint">
            Frame a shot, hit Save current view above — or pick a tour below.
          </div>
        </div>
      ) : visibleViews.length === 0 ? (
        <div className="svp-empty svp-empty--filtered">
          <div className="svp-empty-text">No matches.</div>
        </div>
      ) : (
        <ul className="svp-list">
          {visibleViews.map((view) => (
            <ViewRow
              key={view.id}
              view={view}
              isDefault={view.id === defaultId}
              onClose={onClose}
            />
          ))}
        </ul>
      )}

      <div className="svp-divider" />

      <div className="svp-section-label">Tour</div>
      <ul className="svp-tour-list">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="svp-tour-row"
              onClick={() => flyToPreset(p)}
            >
              <span className="svp-tour-name">{p.name}</span>
              <span className="svp-tour-sub">{p.subtitle}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
