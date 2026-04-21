import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import Pill from './Pill'
import PopoverPill from './PopoverPill'
import HoverPopoverPill from './HoverPopoverPill'
import { PencilIcon, FrameIcon, EyeIcon, EyeOffIcon, TrashIcon, LayersIcon, SaveIcon } from './icons'
import { aspectRatioAtom, fillModeAtom } from '../../editor/atoms/ui'
import { modalsAtom } from '../../editor/atoms/modals'
import { savedGraphicsAtom } from '../hooks/useSavedGraphics'
import { editingBackdropAtom } from '../atoms'
import { composite, buildFilename } from '../../editor/utils/export'

function fire(name, detail) {
  window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name))
}

const PORTRAIT_RATIOS = [
  { label: '4:5', ratio: 0.8 },
  { label: '2:3', ratio: 0.667 },
  { label: '3:4', ratio: 0.75 },
  { label: '9:16', ratio: 0.5625 },
]
const LANDSCAPE_RATIOS = [
  { label: '5:4', ratio: 1.25 },
  { label: '3:2', ratio: 1.5 },
  { label: '4:3', ratio: 1.333 },
  { label: '16:9', ratio: 1.778 },
]
const ALL_RATIOS = [...PORTRAIT_RATIOS, ...LANDSCAPE_RATIOS]

export default function ClusterBottomLeft() {
  const [aspectRatio, setAspectRatio] = useAtom(aspectRatioAtom)
  const [fillMode, setFillMode] = useAtom(fillModeAtom)
  const [modals, setModals] = useAtom(modalsAtom)
  const [editorActive, setEditorActive] = useState(false)
  const [graphicsHidden, setGraphicsHidden] = useState(false)
  const savedGraphics = useAtomValue(savedGraphicsAtom)
  const editingBackdrop = useAtomValue(editingBackdropAtom)
  const setEditingBackdrop = useSetAtom(editingBackdropAtom)

  // Save the current edit on a rendered photo (backdrop + Fabric overlay)
  // back to the gallery as a new entry, then exit edit-render mode.
  const saveRenderEdit = async () => {
    if (!editingBackdrop) return
    let final = editingBackdrop
    try {
      const composed = await composite(editingBackdrop, { includeGraphics: true })
      if (composed) final = composed
    } catch {}
    let graphicsJSON = null
    try {
      const fabric = window.__editorOverlayFabric
      if (fabric && fabric.getObjects && fabric.getObjects().filter((o) => !o.excludeFromExport).length > 0) {
        graphicsJSON = JSON.stringify(
          fabric.toJSON(['name', 'editorType', 'lockMovementX', 'lockMovementY', 'excludeFromExport']),
        )
      }
    } catch {}
    const filename = buildFilename('edited', { resolution: 1 })
    window.dispatchEvent(new CustomEvent('gallery-add', {
      detail: {
        label: 'Edited',
        filename,
        dataUrl: final,
        opts: {
          baseImage: editingBackdrop,
          graphicsJSON,
        },
      },
    }))
    setEditingBackdrop(null)
    // Exit the editor too — render-edit doesn't persist into a normal scene
    // edit session.
    if (editorActive) window.dispatchEvent(new Event('toggle-graphic-editor'))
  }

  const discardRenderEdit = () => {
    setEditingBackdrop(null)
    if (editorActive) window.dispatchEvent(new Event('toggle-graphic-editor'))
  }

  useEffect(() => {
    const onChange = (e) => {
      const active = !!e?.detail?.active
      setEditorActive(active)
      // Entering edit mode forces graphics back on — you can't edit what
      // you can't see.
      if (active) setGraphicsHidden(false)
    }
    window.addEventListener('graphic-editor-changed', onChange)
    return () => window.removeEventListener('graphic-editor-changed', onChange)
  }, [])

  // Toggle a body class so CSS can hide the Fabric overlay visually.
  // Independent from the Render modal's "include graphics in export"
  // toggle — this is just about what's visible on the canvas right now.
  useEffect(() => {
    document.body.classList.toggle('mock-graphics-hidden', graphicsHidden)
    return () => document.body.classList.remove('mock-graphics-hidden')
  }, [graphicsHidden])

  // Editor only makes sense when there's a poster to edit. If the user
  // flips fill mode on while editing, exit the editor automatically so
  // they don't get stranded with no pill to toggle off.
  useEffect(() => {
    if (fillMode && editorActive) {
      window.dispatchEvent(new Event('toggle-graphic-editor'))
    }
  }, [fillMode, editorActive])

  const ratioLabel =
    ALL_RATIOS.find((r) => r.ratio === aspectRatio)?.label ?? '4:3'
  const sizeLabel = fillMode ? 'Preview' : ratioLabel

  const pickRatio = (r) => {
    setFillMode(false)
    setAspectRatio(r)
  }

  return (
    <div className="mock-cluster mock-cluster--bottom-left">
      <HoverPopoverPill
        label={sizeLabel}
        active={!fillMode}
        onToggle={() => setFillMode((v) => !v)}
        alwaysShowPopover
        align="left"
        drop="up"
        className="mock-aspect-pill-wrap"
      >
        <div className="mock-aspect-grid">
          <div className="mock-aspect-label">Portrait</div>
          <div className="mock-aspect-row">
            {PORTRAIT_RATIOS.map(({ label, ratio }) => (
              <button
                key={label}
                type="button"
                className={`mock-aspect-btn${!fillMode && ratio === aspectRatio ? ' is-active' : ''}`}
                onClick={() => pickRatio(ratio)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mock-aspect-label">Landscape</div>
          <div className="mock-aspect-row">
            {LANDSCAPE_RATIOS.map(({ label, ratio }) => (
              <button
                key={label}
                type="button"
                className={`mock-aspect-btn${!fillMode && ratio === aspectRatio ? ' is-active' : ''}`}
                onClick={() => pickRatio(ratio)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </HoverPopoverPill>

      {!fillMode && (
        <Pill
          icon={<PencilIcon />}
          active={editorActive}
          onClick={() => window.dispatchEvent(new Event('toggle-graphic-editor'))}
        >
          {editorActive ? 'Exit' : 'Edit'}
        </Pill>
      )}

      {!fillMode && editorActive && (
        <PopoverPill
          icon={<LayersIcon />}
          align="left"
          drop="up"
          aria-label="Saved graphics"
          title="Saved graphics"
        >
          {({ close }) => (
            <div className="mock-saved-views">
              {savedGraphics.length === 0 ? (
                <div className="mock-empty">No saved graphics yet.</div>
              ) : (
                <ul className="mock-saved-list">
                  {savedGraphics.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        className="mock-saved-row"
                        onClick={() => { fire('load-graphics', g.id); close() }}
                      >
                        {g.name || 'Layer'}
                      </button>
                      <button
                        type="button"
                        className="mock-saved-del"
                        aria-label="Delete saved graphics"
                        onClick={(e) => { e.stopPropagation(); fire('delete-graphics', g.id) }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="mock-btn-primary"
                onClick={() => { fire('save-graphics'); close() }}
              >
                Save current graphics
              </button>
            </div>
          )}
        </PopoverPill>
      )}

      {!fillMode && editorActive && (
        <Pill
          icon={<TrashIcon />}
          onClick={() => fire('clear-graphics')}
          aria-label="Clear graphics"
          title="Clear graphics"
        />
      )}

      {/* Render-edit controls — only shown when the user opened "Edit
       * graphics" on a gallery entry (backdrop is set). Save composites
       * the current state into a new gallery entry; Discard exits without
       * saving. The regular Exit/Edit pill above also exits and is
       * equivalent to Discard. */}
      {editingBackdrop && (
        <Pill
          icon={<SaveIcon />}
          active
          onClick={saveRenderEdit}
          aria-label="Save edited render"
          title="Save edited render to gallery"
        >
          Save
        </Pill>
      )}
      {editingBackdrop && (
        <Pill
          onClick={discardRenderEdit}
          aria-label="Discard edits"
          title="Discard edits"
        >
          Discard
        </Pill>
      )}

      {!fillMode && !editorActive && (
        <Pill
          icon={graphicsHidden ? <EyeOffIcon /> : <EyeIcon />}
          active={!graphicsHidden}
          onClick={() => setGraphicsHidden((v) => !v)}
          aria-label={graphicsHidden ? 'Show graphics' : 'Hide graphics'}
          title={graphicsHidden ? 'Show graphics' : 'Hide graphics'}
        />
      )}

      {!fillMode && (
        <Pill
          icon={<FrameIcon />}
          active={modals.posterPreview}
          onClick={() => setModals((m) => ({ ...m, posterPreview: !m.posterPreview }))}
          aria-label="Toggle poster preview"
          title="Poster preview"
        />
      )}
    </div>
  )
}
