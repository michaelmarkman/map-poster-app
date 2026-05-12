import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'

// RenderCountChip pulls auth/profile context that doesn't matter for
// these layout-focused tests. Stub it so we don't need to mount the
// full AuthProvider chain.
vi.mock('../components/RenderCountChip', () => ({
  default: () => null,
}))

import ClusterTopRight from '../components/ClusterTopRight'
import {
  cloudsAtom,
  dofAtom,
  latitudeAtom,
  timeOfDayAtom,
  todUnlockedAtom,
} from '../../editor/atoms/scene'
import { cameraReadoutAtom } from '../../editor/atoms/ui'

function renderWith({
  dof = { aperture: 4.5, sceneColorPop: 25, focusColorPop: 25 },
  clouds = { coverage: 0.2 },
  timeOfDay = 14.75, // 2:45pm — matches the mockup
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
        <ClusterTopRight />
      </Provider>
    </MemoryRouter>,
  ) }
}

describe('ClusterTopRight (Phase 6 — four DragPills)', () => {
  beforeEach(() => {
    // RenderCountChip queries this; stub.
    if (!localStorage.getItem('vedute_render_count')) {
      localStorage.setItem('vedute_render_count', '{"month":"2099-12","count":0}')
    }
  })

  it('renders 4 drag pills (focal/lens, aperture/DoF, TOD/time, clouds)', () => {
    const { container } = renderWith()
    // Phase 6 — ReadoutPill split into 4 DragPills. Each carries
    // `is-drag` modifier; count those.
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

  it('DoF pill shows the f-stop within ~1 of the requested value across the range', () => {
    // The slider quantizes to 100 steps across f/16..f/1.4 log;
    // round-trip is approximate but should land within a tenth of
    // an f-stop. Check a few canonical points.
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

  it('TOD segment shows 12-hour clock with am/pm', () => {
    renderWith({ timeOfDay: 14.75 })
    expect(screen.getByText('2:45pm')).toBeDefined()
  })

  it('clouds segment shows coverage as integer percent', () => {
    renderWith({ clouds: { coverage: 0.2 } })
    expect(screen.getByText('20%')).toBeDefined()
  })

  it('clouds segment shows 0% when clouds are off (coverage=0)', () => {
    renderWith({ clouds: { coverage: 0 } })
    expect(screen.getByText('0%')).toBeDefined()
  })
})
