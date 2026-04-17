// Skeleton DOM for the Fabric.js graphic editor. This component owns no
// state — it renders the fixed toolbar + sliding properties panel with
// the IDs the prototype's editor-overlay.jsx wires up to (`ed-tool-*`,
// `editor-toolbar`, `editor-props`, `editor-props-content`, `ep-close`,
// `ed-img-input`). Visibility is CSS-gated: `.active` on the toolbar,
// `.open` on the props panel — editor-overlay toggles those as the user
// enters/exits the editor and selects objects.
//
// The heavy lifting (creating the Fabric canvas as a child of
// #canvas-container, hooking its events, building the properties UI,
// history, snap guides, templates, persistence) stays in the legacy
// prototype file which `useGraphicEditor` loads lazily on first use.
// We just give it a home in the DOM so the IDs exist before `initEditor`
// calls `document.getElementById(...)`.

// Compact SVG icons for the toolbar — inline so there's no asset loading.
function Icon({ name }) {
  const paths = {
    text: <path d="M5 5h14M12 5v14M8 19h8" />,
    rect: <rect x="4" y="6" width="16" height="12" rx="1" />,
    circle: <circle cx="12" cy="12" r="7" />,
    line: <path d="M5 19 19 5" />,
    arrow: <path d="M5 19 19 5M13 5h6v6" />,
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="m3 18 5-5 4 4 3-3 6 6" />
      </>
    ),
    undo: <path d="M4 9h11a5 5 0 1 1 0 10H9M4 9l4-4M4 9l4 4" />,
    redo: <path d="M20 9H9a5 5 0 1 0 0 10h6M20 9l-4-4M20 9l-4 4" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  )
}

function ToolButton({ id, title, iconName }) {
  return (
    <button className="ed-btn" id={id} type="button" title={title} aria-label={title}>
      <Icon name={iconName} />
    </button>
  )
}

export default function GraphicEditorOverlay() {
  return (
    <>
      {/* Hidden file input — the image tool clicks this via JS. Must exist
          on mount so `wireToolbar` can find it and attach the change
          listener. */}
      <input type="file" id="ed-img-input" accept="image/*" style={{ display: 'none' }} />

      {/* Floating bottom-center toolbar. Hidden by default; editor-overlay
          toggles `.active` when the editor is on. */}
      <div id="editor-toolbar" role="toolbar" aria-label="Graphic editor tools">
        <ToolButton id="ed-tool-text" title="Add text (T)" iconName="text" />
        <ToolButton id="ed-tool-rect" title="Rectangle" iconName="rect" />
        <ToolButton id="ed-tool-circle" title="Circle" iconName="circle" />
        <ToolButton id="ed-tool-line" title="Line" iconName="line" />
        <ToolButton id="ed-tool-arrow" title="Arrow" iconName="arrow" />
        <ToolButton id="ed-tool-image" title="Upload image" iconName="image" />
        <div className="ed-sep" />
        <ToolButton id="ed-tool-undo" title="Undo (⌘Z)" iconName="undo" />
        <ToolButton id="ed-tool-redo" title="Redo (⌘⇧Z)" iconName="redo" />
        <div className="ed-sep" />
        <ToolButton id="ed-tool-delete" title="Delete selected (⌫)" iconName="trash" />
      </div>

      {/* Properties panel — slides in from the right when an object is
          selected. editor-overlay populates `#editor-props-content` with
          object-specific controls. */}
      <aside id="editor-props" aria-label="Selected object properties">
        <header className="ep-header">
          <span className="ep-header-title">Selection</span>
          <button className="ep-close" id="ep-close" type="button" aria-label="Close properties">
            <Icon name="close" />
          </button>
        </header>
        <div id="editor-props-content" />
      </aside>
    </>
  )
}
