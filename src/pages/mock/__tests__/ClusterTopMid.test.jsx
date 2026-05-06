import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import {
  timeOfDayAtom,
  latitudeAtom,
  todUnlockedAtom,
} from '../../editor/atoms/scene'
import { cameraReadoutAtom } from '../../editor/atoms/ui'
import ClusterTopMid from '../components/ClusterTopMid'

function renderWithStore({
  timeOfDay = 12,
  latitude = 40,
  todUnlocked = false,
  cameraReadout = { tilt: 51, heading: 67, altitude: 472, fovMm: 41 },
} = {}) {
  const store = createStore()
  store.set(timeOfDayAtom, timeOfDay)
  store.set(latitudeAtom, latitude)
  store.set(todUnlockedAtom, todUnlocked)
  store.set(cameraReadoutAtom, cameraReadout)
  return render(
    <Provider store={store}>
      <ClusterTopMid />
    </Provider>,
  )
}

describe('ClusterTopMid', () => {
  it('renders the focal-length pill at the camera readout fovMm', () => {
    renderWithStore({ cameraReadout: { tilt: 0, heading: 0, altitude: 0, fovMm: 35 } })
    expect(screen.getByText('35mm')).toBeDefined()
  })

  it('formats the time-of-day pill in 12-hour with am/pm', () => {
    renderWithStore({ timeOfDay: 9 })
    expect(screen.getByText('9:00am')).toBeDefined()
  })

  it('handles midnight + half-hours correctly', () => {
    renderWithStore({ timeOfDay: 0 })
    expect(screen.getByText('12:00am')).toBeDefined()
  })

  it('formats noon as 12:00pm (not 0:00pm)', () => {
    renderWithStore({ timeOfDay: 12 })
    expect(screen.getByText('12:00pm')).toBeDefined()
  })

  it('formats afternoon hours past 12 in 12-hour form', () => {
    renderWithStore({ timeOfDay: 17.5 })
    expect(screen.getByText('5:30pm')).toBeDefined()
  })
})
