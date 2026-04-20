import { useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import DragPill from './DragPill'
import { SunIcon, CameraIcon } from './icons'
import { timeOfDayAtom, latitudeAtom, todUnlockedAtom } from '../../editor/atoms/scene'
import { cameraReadoutAtom } from '../../editor/atoms/ui'
import { getSunTimes } from '../../editor/utils/sun'

function fmtHourShort(h) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ap = hh >= 12 ? 'pm' : 'am'
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return `${h12}:${String(mm).padStart(2, '0')}${ap}`
}

// Center-top cluster — the camera + time-of-day scrubbers. Visually anchors
// to the middle of the workbench so it reads like a primary photo control.
export default function ClusterTopMid() {
  const [timeOfDay, setTimeOfDay] = useAtom(timeOfDayAtom)
  const latitude = useAtomValue(latitudeAtom)
  const todUnlocked = useAtomValue(todUnlockedAtom)
  const readout = useAtomValue(cameraReadoutAtom)

  const todRange = useMemo(() => {
    if (todUnlocked) return { min: 0, max: 24 }
    const { sunrise, sunset } = getSunTimes(latitude)
    return { min: sunrise + 0.5, max: sunset - 0.5 }
  }, [latitude, todUnlocked])

  const setFov = (mm) => {
    window.dispatchEvent(new CustomEvent('fov-change', { detail: Math.round(mm) }))
  }

  return (
    <div className="mock-cluster mock-cluster--top-mid">
      <DragPill
        icon={<CameraIcon />}
        value={readout.fovMm}
        setValue={setFov}
        min={14}
        max={200}
        scale={0.5}
        format={(v) => `${Math.round(v)}mm`}
      />
      <DragPill
        icon={<SunIcon />}
        value={timeOfDay}
        setValue={setTimeOfDay}
        min={todRange.min}
        max={todRange.max}
        scale={0.05}
        format={fmtHourShort}
      />
    </div>
  )
}
