import { useAtom, useAtomValue } from 'jotai'
import { introDoneAtom, onboardedAtom } from '../../editor/atoms/sidebar'

// Phase 4.2 — first-run welcome card. Appears once until the user
// dismisses it (or runs through the steps). Lives at the bottom-center
// of the viewport so the editor's clusters around the corners aren't
// crowded.
//
// Persisted via onboardedAtom (session-persistence picks it up).
//
// Phase 2.7 follow-up: gated on introDoneAtom so the card waits for
// the boot intro to finish before rendering. Otherwise it'd sit
// behind the intro overlay (invisible) but still cost layout +
// animation work during the intro.
export default function OnboardingCard() {
  const [onboarded, setOnboarded] = useAtom(onboardedAtom)
  const introDone = useAtomValue(introDoneAtom)

  if (!introDone) return null
  if (onboarded) return null

  const dismiss = () => setOnboarded(true)

  return (
    <div className="vd-onboard" role="dialog" aria-label="Welcome to Vedute">
      <button
        type="button"
        className="vd-onboard-close"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
      <div className="vd-onboard-title">Welcome to Vedute</div>
      <div className="vd-onboard-body">
        Aerial city posters, made from 3D maps. Three things to know:
      </div>
      <ul className="vd-onboard-hints">
        <li>
          <span className="vd-onboard-key">drag</span>
          <span className="vd-onboard-text">pan around the city</span>
        </li>
        <li>
          <span className="vd-onboard-key">scroll</span>
          <span className="vd-onboard-text">zoom in / out</span>
        </li>
        <li>
          <span className="vd-onboard-key">click</span>
          <span className="vd-onboard-text">
            with DoF on, set the focus point
          </span>
        </li>
      </ul>
      <button
        type="button"
        className="vd-onboard-cta"
        onClick={dismiss}
      >
        Got it
      </button>
    </div>
  )
}
