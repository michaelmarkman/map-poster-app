// Graphic Editor sidebar section — hidden until the Fabric.js overlay is
// properly ported to React.
//
// Status (2026-04-17): the legacy Fabric.js editor lives at
// prototypes/editor-overlay.jsx and creates its canvas as a child of
// #canvas-container. BUT — the toolbar (#editor-toolbar) and properties
// panel (#editor-props) DOM it wires up to only exist in the prototype's
// HTML, not in our React tree. Clicking "Open Editor" would create a
// blank Fabric canvas with no controls and no way to dismiss it, which
// is worse than not shipping the feature at all.
//
// Next port is: build real React components for the toolbar + props
// panel, migrate the template UI, thread Fabric's object state through
// a dedicated atom/store. Until then, return null so the section doesn't
// render in the sidebar.
export default function EditorSection() {
  return null
}
