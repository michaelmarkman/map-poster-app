import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import {
  cloudsAtom,
  dofAtom,
  latitudeAtom,
  timeOfDayAtom,
  todUnlockedAtom,
} from '../../editor/atoms/scene'
import { cameraReadoutAtom } from '../../editor/atoms/ui'
import { modalsAtom } from '../../editor/atoms/modals'

// HelpPill pulls onboardedAtom + nested PopoverPill; stub for layout tests.
vi.mock('../components/HelpPill', () => ({
  default: () => null,
}))

import ClusterBottomRight from '../components/ClusterBottomRight'

function renderWith({
  dof = { aperture: 4.5, sceneColorPop: 25, focusColorPop: 25 },
  clouds = { coverage: 0.2 },
  timeOfDay = 14.75,
  todUnlocked = false,
  latitude = 40.748,
  fovMm = 35,
} = {}) {
  const store = createStore()
  store.set(dofAtom, { ...store.get(dofAtom), ...dof })
  store.set(cloudsAtom, { ...store.get(cloudsAtom), ...clouds })
  store.set(timeOfDayAtom, timeOfDay)
  store.set(todUnlockedAtom, todUnlocked)
  store.set(latitudeAtom, latitude)
  store.set(cameraReadoutAtom, {
    tilt: 51,
    heading: 67,
    altitude: 472,
    fovMm,
  })
  return { store, ...render(
    <MemoryRouter>
      <Provider store={store}>
        <ClusterBottomRight />
      </Provider>
    </MemoryRouter>,
  ) }
}

// Phase 7 — ClusterBottomRight now holds the 4 scrub DragPills (moved
// from TR) and the Capture pill (moved from BM). Coverage moves
// in lockstep with the cluster.
describe('ClusterBottomRight (Phase 7 — scrub pills + Capture)', () => {
  beforeEach(() => {
    if (!localStorage.getItem('vedute_render_count')) {
      localStorage.setItem('vedute_render_count', '{"month":"2099-12","count":0}')
    }
  })

  // Phase 12 — value text appears in 3 places per pill (rest stack,
  // scrub chevrons, floating tooltip). Tests target the rest-state
  // span to avoid duplicate-match errors.
  const restValues = (container) =>
    Array.from(container.querySelectorAll('.mock-pill-stack .mock-pill-value'))
      .map((n) => n.textContent)

  it('renders 4 drag pills (Lens, DoF, Time, Clouds)', () => {
    const { container } = renderWith()
    const dragPills = container.querySelectorAll('.mock-pill.is-drag')
    expect(dragPills).toHaveLength(4)
  })

  it('lens pill shows fovMm with mm suffix', () => {
    const { container } = renderWith({ fovMm: 35 })
    expect(restValues(container)).toContain('35mm')
  })

  it('DoF pill shows f/X.X for an open f-stop', () => {
    const { container } = renderWith({ dof: { aperture: 4.5 } })
    expect(restValues(container)).toContain('f/4.5')
  })

  it('DoF pill shows f/— when DoF is off (aperture=0)', () => {
    const { container } = renderWith({ dof: { aperture: 0 } })
    expect(restValues(container)).toContain('f/—')
  })

  it('DoF pill stays within ~1 of the requested f-stop across the range', () => {
    const cases = [
      { aperture: 16, expected: /f\/(15|16)/ },
      { aperture: 8, expected: /f\/8/ },
      { aperture: 2.8, expected: /f\/2\.[789]/ },
      { aperture: 1.4, expected: /f\/1\.4/ },
    ]
    for (const c of cases) {
      const { container, unmount } = renderWith({ dof: { aperture: c.aperture } })
      const matched = restValues(container).find((t) => c.expected.test(t))
      expect(matched, `aperture=${c.aperture}`).toBeTruthy()
      unmount()
    }
  })

  it('Time pill shows 12-hour clock with am/pm', () => {
    const { container } = renderWith({ timeOfDay: 14.75 })
    expect(restValues(container)).toContain('2:45pm')
  })

  it('Clouds pill shows coverage as integer percent', () => {
    const { container } = renderWith({ clouds: { coverage: 0.2 } })
    expect(restValues(container)).toContain('20%')
  })

  it('Clouds pill shows 0% when clouds are off (coverage=0)', () => {
    const { container } = renderWith({ clouds: { coverage: 0 } })
    expect(restValues(container)).toContain('0%')
  })

  it('Capture pill opens a menu popover (Phase 16); More options opens the AI render sheet', () => {
    // Phase 16 — Capture is now a PopoverPill. Clicking the pill opens
    // the inline CaptureMenu popover. The "More options →" footer link
    // inside still opens the AIRenderModal for the advanced flow.
    const { store } = renderWith()
    const capture = screen.getByRole('button', { name: /Capture/ })
    fireEvent.click(capture)
    // Popover open → "More options →" button is in the DOM.
    const more = screen.getByText(/More options/)
    fireEvent.click(more)
    expect(store.get(modalsAtom).aiRender).toBe(true)
  })

  it('Capture pill → Render with no selection fires add-to-queue with preset=null', () => {
    const events = []
    const onAdd = (e) => events.push(e.detail)
    window.addEventListener('add-to-queue', onAdd)
    try {
      renderWith()
      fireEvent.click(screen.getByRole('button', { name: /Capture/ }))
      // Find the Render button inside the popover. There may be a
      // "Render N" form; the no-selection state shows just "Render".
      const render = screen.getByText(/^Render$/)
      fireEvent.click(render)
      expect(events).toHaveLength(1)
      expect(events[0].preset).toBe(null)
    } finally {
      window.removeEventListener('add-to-queue', onAdd)
    }
  })
})
