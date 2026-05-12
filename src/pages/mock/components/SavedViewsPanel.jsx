import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  defaultSavedViewIdAtom,
  savedViewsAtom,
} from '../../editor/atoms/sidebar'
import { dispatchFlyTo } from '../../editor/scene/events'
import presetData from '../../../data/presetViews.json'

const PRESETS = presetData.presets || []

// Phase 2.3 — saved views revamp.
//
// Image-led list with thumbnail, inline rename, up/down reorder, delete,
// "set as default" toggle.
//
// Drag-to-reorder is deferred — adding @dnd-kit just for this is heavy.
// Up/down arrow buttons cover the use case until we have other drag-y UI.

function fire(name, detail) {
  window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name))
}

function ViewRow({ view, index, total, isDefault, onClose }) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(view.name || '')

  const commitRename = () => {
    const next = draftName.trim()
    if (next && next !== view.name) {
      fire('rename-view', { id: view.id, name: next })
    }
    setEditing(false)
  }

  return (
    <li className="svp-row">
      <button
        type="button"
        className="svp-row-main"
        onClick={() => {
          if (editing) return
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
        {editing ? (
          <input
            className="svp-rename"
            value={draftName}
            autoFocus
            // useSavedViews truncates renames at 60 chars on commit;
            // mirror the cap on the input so the user can't even type
            // past it (less surprising than getting silently truncated).
            maxLength={60}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setDraftName(view.name || '')
                setEditing(false)
              }
            }}
          />
        ) : (
          <span className="svp-name">{view.name || 'Untitled view'}</span>
        )}
      </button>

      <div className="svp-actions">
        <button
          type="button"
          className={`svp-action${isDefault ? ' is-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            fire('set-default-view', { id: isDefault ? null : view.id })
          }}
          aria-label={isDefault ? 'Unset default' : 'Set as default'}
          title={isDefault ? 'Default view' : 'Set as default'}
        >
          {isDefault ? '★' : '☆'}
        </button>
        <button
          type="button"
          className="svp-action"
          onClick={(e) => {
            e.stopPropagation()
            setDraftName(view.name || '')
            setEditing(true)
          }}
          aria-label="Rename"
          title="Rename"
        >
          ✎
        </button>
        <button
          type="button"
          className="svp-action"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation()
            fire('reorder-view', { id: view.id, direction: 'up' })
          }}
          aria-label="Move up"
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          className="svp-action"
          disabled={index === total - 1}
          onClick={(e) => {
            e.stopPropagation()
            fire('reorder-view', { id: view.id, direction: 'down' })
          }}
          aria-label="Move down"
          title="Move down"
        >
          ↓
        </button>
        <button
          type="button"
          className="svp-action svp-action--danger"
          onClick={(e) => {
            e.stopPropagation()
            // Saved views can't be undone — confirm first. Mirrors the
            // gallery-card delete flow so the two delete UIs feel
            // consistent.
            if (!window.confirm(`Delete "${view.name || 'this view'}"?`)) return
            fire('delete-view', view.id)
          }}
          aria-label="Delete"
          title="Delete"
        >
          ×
        </button>
      </div>
    </li>
  )
}

// Filter threshold — show the filter input only when saved-views count
// exceeds this. Below the threshold the list is short enough to scan.
// Mirrors the prototype's `.menu-views.has-filter` toggle.
const FILTER_THRESHOLD = 6

export default function SavedViewsPanel({ onClose }) {
  const savedViews = useAtomValue(savedViewsAtom)
  const [defaultId, setDefaultId] = useAtom(defaultSavedViewIdAtom)
  const [filter, setFilter] = useState('')

  // Listen for set-default-view. The original implementation attached
  // a listener during render guarded by a window-global flag — that's
  // a React side-effect-in-render rule violation AND it leaked the
  // listener forever after the first mount. useEffect with a cleanup
  // is the right shape: tied to the panel's lifecycle, removed when
  // the popover closes, re-attached cleanly on next mount.
  useEffect(() => {
    const onSetDefault = (e) => {
      const id = e?.detail?.id
      setDefaultId(id ?? null)
    }
    window.addEventListener('set-default-view', onSetDefault)
    return () => window.removeEventListener('set-default-view', onSetDefault)
  }, [setDefaultId])

  // Filter views by name substring (case-insensitive). When the panel
  // is below the threshold or the input is empty, return all views.
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
            Frame a shot, then hit Save current view below — or pick a tour.
          </div>
        </div>
      ) : visibleViews.length === 0 ? (
        <div className="svp-empty svp-empty--filtered">
          <div className="svp-empty-text">No matches.</div>
        </div>
      ) : (
        <ul className="svp-list">
          {visibleViews.map((view) => {
            // index/total derived from the FULL saved-views list so
            // reorder up/down arrows stay correct under filter.
            const idx = savedViews.findIndex((v) => v.id === view.id)
            return (
              <ViewRow
                key={view.id}
                view={view}
                index={idx}
                total={savedViews.length}
                isDefault={view.id === defaultId}
                onClose={onClose}
              />
            )
          })}
        </ul>
      )}

      <div className="svp-tour">
        <div className="svp-tour-label">Tour</div>
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

      <button
        type="button"
        className="mock-btn-primary svp-save"
        onClick={() => {
          fire('save-view')
          onClose?.()
        }}
      >
        Save current view
      </button>
    </div>
  )
}
