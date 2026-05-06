import { useMemo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import ReadoutPill from './ReadoutPill'
import RenderCountChip from './RenderCountChip'
import {
  cloudsAtom,
  dofAtom,
  latitudeAtom,
  timeOfDayAtom,
  todUnlockedAtom,
} from '../../editor/atoms/scene'
import { cameraReadoutAtom } from '../../editor/atoms/ui'
import { getSunTimes } from '../../editor/utils/sun'

// Phase 2.7 — top-right cluster collapses focal length + aperture +
// time-of-day + cloud coverage into one ReadoutPill (visually unified
// strip with hairline dividers between drag-scrubber segments).
//
// Aperture mapping: slider 0% = OFF (DoF disabled, readout = 'f/—').
// Slider 1–100% = f/16 → f/1.4 on a log scale (each f-stop halves
// the aperture area, so log-interp keeps the slider feel linear in
// stops).
//
// Clouds: slider 0% disables clouds (coverage=0); 1–100% maps to
// coverage 0.01–1.0.
//
// TOD: clamps to sunrise–sunset by default. Shift+drag flips
// todUnlocked so the user can drag past the natural day window into
// night.

// f-stop mapping: 0–100 slider maps log-linearly from f/16 (deep) to
// f/1.4 (shallow). 0 is the OFF detent (slider sentinel; outside the
// f-stop range entirely).
const APERTURE_STEPS = 100
const F_MIN = 1.4
const F_MAX = 16
const L_MIN = Math.log(F_MIN)
const L_MAX = Math.log(F_MAX)

const apertureValueToSlider = (aperture) => {
  if (!aperture || aperture <= 0) return 0
  // 1..100 maps log-linearly across f/16..f/1.4 (slider 1 ≈ f/16, 100 = f/1.4).
  const t = (L_MAX - Math.log(aperture)) / (L_MAX - L_MIN)
  return Math.max(1, Math.min(APERTURE_STEPS, 1 + Math.round(t * (APERTURE_STEPS - 1))))
}

const sliderToApertureValue = (slider) => {
  if (slider <= 0) return 0
  const t = (Math.max(1, Math.min(APERTURE_STEPS, slider)) - 1) / (APERTURE_STEPS - 1)
  return Math.exp(L_MAX + t * (L_MIN - L_MAX))
}

const formatAperture = (slider) => {
  const f = sliderToApertureValue(slider)
  if (!f) return 'f/—'
  return `f/${f < 10 ? f.toFixed(1) : Math.round(f)}`
}

const formatHour = (h) => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ap = hh >= 12 ? 'pm' : 'am'
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return `${h12}:${String(mm).padStart(2, '0')}${ap}`
}

export default function ClusterTopRight() {
  const [dof, setDof] = useAtom(dofAtom)
  const [clouds, setClouds] = useAtom(cloudsAtom)
  const [timeOfDay, setTimeOfDay] = useAtom(timeOfDayAtom)
  const setTodUnlocked = useSetAtom(todUnlockedAtom)
  const todUnlocked = useAtomValue(todUnlockedAtom)
  const latitude = useAtomValue(latitudeAtom)
  const readout = useAtomValue(cameraReadoutAtom)

  const todRange = useMemo(() => {
    if (todUnlocked) return { min: 0, max: 24 }
    const { sunrise, sunset } = getSunTimes(latitude)
    return { min: sunrise + 0.5, max: sunset - 0.5 }
  }, [latitude, todUnlocked])

  const setFov = (mm) => {
    window.dispatchEvent(new CustomEvent('fov-change', { detail: Math.round(mm) }))
  }

  // Aperture's atom value is the f-stop (or 0 = off). The scrubber
  // works in slider-units (0–100) so the drag delta is intuitive at
  // every f-stop. Wrap on each end to translate.
  const apertureSliderValue = apertureValueToSlider(dof.aperture)
  const setApertureFromSlider = (slider) => {
    setDof((d) => ({ ...d, aperture: sliderToApertureValue(slider) }))
  }

  // Cloud coverage's atom value is 0–1. Slider works in 0–100 percent
  // for parity with the rest of the pill; 0 disables clouds entirely.
  const cloudsSliderValue = Math.round((clouds.coverage || 0) * 100)
  const setCloudsFromSlider = (slider) => {
    setClouds((c) => ({ ...c, coverage: Math.max(0, Math.min(100, slider)) / 100 }))
  }

  return (
    <div className="mock-cluster mock-cluster--top-right">
      <RenderCountChip />
      <ReadoutPill
        segments={[
          {
            key: 'focal',
            label: 'Focal length',
            value: readout.fovMm,
            setValue: setFov,
            min: 14,
            max: 200,
            scale: 0.5,
            format: (v) => `${Math.round(v)}mm`,
          },
          {
            key: 'aperture',
            label: 'Aperture',
            value: apertureSliderValue,
            setValue: setApertureFromSlider,
            min: 0,
            max: APERTURE_STEPS,
            scale: 0.5,
            format: formatAperture,
          },
          {
            key: 'tod',
            label: 'Time of day',
            value: timeOfDay,
            setValue: setTimeOfDay,
            min: todRange.min,
            max: todRange.max,
            scale: 0.05,
            format: formatHour,
            // Shift+drag unlocks the day-window clamp so the user can
            // drag past sunset into night. Sticky once flipped — the
            // user re-clamps by clearing the session or unsetting in
            // a future settings panel.
            onShiftDrag: () => setTodUnlocked(true),
          },
          {
            key: 'clouds',
            label: 'Cloud coverage',
            value: cloudsSliderValue,
            setValue: setCloudsFromSlider,
            min: 0,
            max: 100,
            scale: 0.5,
            format: (v) => `${Math.round(v)}%`,
          },
        ]}
      />
    </div>
  )
}
