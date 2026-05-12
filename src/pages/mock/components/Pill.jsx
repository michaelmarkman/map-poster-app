// Base pill — dark glass chip with optional icon + label/value slots
// and click handler. All other pill variants compose this.
//
// MoMA recipe (Phase 1, prototypes/editor-chrome-moma-v1.html):
//
//   - Single-slot pills (existing API): pass `children` only — renders
//     as 11px mono with --value-track. Example: <Pill>Capture</Pill>.
//   - Two-slot pills (MoMA pattern):   pass `label` + `value` props.
//     The label slot becomes 9px uppercase with --label-track (dim),
//     the value slot stays bright 11px. Example:
//       <Pill label="Aspect" value="3:4" />  →  ASPECT 3:4
//     The CSS rule `.mock-pill-label:has(+ .mock-pill-value)` does the
//     downgrade automatically — there's no separate "two-slot" class.
//
// `children` still works as a one-slot fallback for any consumer that
// hasn't migrated to the new props yet; the visual is the value
// style. New call sites should prefer label + value.
export default function Pill({
  icon,
  label,
  value,
  children,
  onClick,
  active = false,
  className = '',
  innerRef,
  ...rest
}) {
  // Three slot configurations, all valid:
  //   1. label + value          → two-slot LABEL VALUE (MoMA prototype)
  //   2. value only             → value-only pill (matches prototype's
  //                               `.pill.search` — just an icon + value
  //                               like the location pill)
  //   3. label or children only → single-slot, existing API
  const twoSlot = label != null && value != null
  const valueOnly = label == null && value != null
  const singleContent = children ?? (label != null ? label : null)
  return (
    <button
      type="button"
      ref={innerRef}
      className={`mock-pill${active ? ' is-active' : ''}${className ? ' ' + className : ''}`}
      onClick={onClick}
      {...rest}
    >
      {icon ? <span className="mock-pill-icon">{icon}</span> : null}
      {twoSlot && (
        <>
          <span className="mock-pill-label">{label}</span>
          <span className="mock-pill-value">{value}</span>
        </>
      )}
      {valueOnly && <span className="mock-pill-value">{value}</span>}
      {!twoSlot && !valueOnly && singleContent != null && singleContent !== '' && (
        <span className="mock-pill-label">{singleContent}</span>
      )}
    </button>
  )
}
