import { describe, it, expect } from 'vitest'
import { getDateFromHour, getSunTimes } from '../utils/sun'

describe('getDateFromHour', () => {
  it('returns a valid Date for noon UTC at longitude 0', () => {
    const d = getDateFromHour(12, 0)
    expect(d).toBeInstanceOf(Date)
    expect(Number.isNaN(d.getTime())).toBe(false)
  })

  it('returns a date 1 hour earlier at longitude 15 vs longitude 0', () => {
    // offset = longitude / 15 (hours), so +15° east shifts the UTC epoch 1h back
    // to keep local noon = scene noon.
    const d0 = getDateFromHour(12, 0)
    const d15 = getDateFromHour(12, 15)
    const diffHours = (d0.getTime() - d15.getTime()) / 3600000
    expect(diffHours).toBeCloseTo(1, 6)
  })

  it('moves forward by one hour for each hour of wallclock increase at fixed longitude', () => {
    const noon = getDateFromHour(12, 0)
    const onepm = getDateFromHour(13, 0)
    const diffHours = (onepm.getTime() - noon.getTime()) / 3600000
    expect(diffHours).toBeCloseTo(1, 6)
  })
})

describe('getSunTimes', () => {
  it('returns sunrise and sunset in [0, 24] for a mid-latitude', () => {
    const { sunrise, sunset } = getSunTimes(40.7)
    expect(sunrise).toBeGreaterThanOrEqual(0)
    expect(sunrise).toBeLessThanOrEqual(24)
    expect(sunset).toBeGreaterThanOrEqual(0)
    expect(sunset).toBeLessThanOrEqual(24)
    expect(sunset).toBeGreaterThan(sunrise)
  })

  it('returns approx { sunrise: 6, sunset: 18 } at the equator', () => {
    // At the equator, civil twilight gives ~6am / ~6pm year-round, modulo the
    // -6° civil zenith offset. The function rounds to 15-min intervals, so we
    // allow ~1h slack for the civil-twilight band.
    const { sunrise, sunset } = getSunTimes(0)
    expect(sunrise).toBeGreaterThanOrEqual(5)
    expect(sunrise).toBeLessThanOrEqual(7)
    expect(sunset).toBeGreaterThanOrEqual(17)
    expect(sunset).toBeLessThanOrEqual(19)
  })

  it('returns values rounded to 15-minute increments', () => {
    const { sunrise, sunset } = getSunTimes(30)
    expect((sunrise * 4) % 1).toBe(0)
    expect((sunset * 4) % 1).toBe(0)
  })
})
