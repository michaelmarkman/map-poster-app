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

  it('renders 4 drag pills (Lens, DoF, Time, Clouds)', () => {
    const { container } = renderWith()
    const dragPills = container.querySelectorAll('.mock-pill.is-drag')
    expect(dragPills).toHaveLength(4)
  })

  it('lens pill shows fovMm with mm suffix', () => {
    renderWith({ fovMm: 35 })
    expect(screen.getByText('35mm')).toBeDefined()
  })

  it('DoF pill shows f/X.X for an open f-stop', () => {
    renderWith({ dof: { aperture: 4.5 } })
    expect(screen.getByText('f/4.5')).toBeDefined()
  })

  it('DoF pill shows f/— when DoF is off (aperture=0)', () => {
    renderWith({ dof: { aperture: 0 } })
    expect(screen.getByText('f/—')).toBeDefined()
  })

  it('DoF pill stays within ~1 of the requested f-stop across the range', () => {
    const cases = [
      { aperture: 16, expected: /f\/(15|16)/ },
      { aperture: 8, expected: /f\/8/ },
      { aperture: 2.8, expected: /f\/2\.[789]/ },
      { aperture: 1.4, expected: /f\/1\.4/ },
    ]
    for (const c of cases) {
      const { unmount } = renderWith({ dof: { aperture: c.aperture } })
      const matched = Array.from(document.querySelectorAll('.mock-pill.is-drag'))
        .map((n) => n.textContent)
        .find((t) => c.expected.test(t))
      expect(matched, `aperture=${c.aperture}`).toBeTruthy()
      unmount()
    }
  })

  it('Time pill shows 12-hour clock with am/pm', () => {
    renderWith({ timeOfDay: 14.75 })
    expect(screen.getByText('2:45pm')).toBeDefined()
  })

  it('Clouds pill shows coverage as integer percent', () => {
    renderWith({ clouds: { coverage: 0.2 } })
    expect(screen.getByText('20%')).toBeDefined()
  })

  it('Clouds pill shows 0% when clouds are off (coverage=0)', () => {
    renderWith({ clouds: { coverage: 0 } })
    expect(screen.getByText('0%')).toBeDefined()
  })

  it('renders a Capture pill that opens the AI render sheet', () => {
    const { store } = renderWith()
    const capture = screen.getByRole('button', { name: /Capture/ })
    fireEvent.click(capture)
    expect(store.get(modalsAtom).aiRender).toBe(true)
  })
})
