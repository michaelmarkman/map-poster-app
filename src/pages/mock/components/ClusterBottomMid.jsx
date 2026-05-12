// Phase 7 — Capture moved BM → BR per the prototype's geography. This
// cluster now renders empty; mock.css's `.mock-cluster--bottom-mid:empty
// { display: none }` rule keeps the slot from leaving a visual gap.
//
// The component itself stays mounted so future MoMA-aligned slots
// (e.g. a center status pill, brand affordance, or a new center
// action) can be reintroduced without retracing the mount path.
export default function ClusterBottomMid() {
  return <div className="mock-cluster mock-cluster--bottom-mid" />
}
