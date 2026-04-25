import { useAtom } from 'jotai'
import HoverPopoverPill from './HoverPopoverPill'
import GuestSignInChip from './GuestSignInChip'
import { CloudIcon, ApertureIcon } from './icons'
import { cloudsAtom, dofAtom } from '../../editor/atoms/scene'

// Aperture mode mapping: 0–100 slider → f-stop on a log scale.
// 0% = f/16 (deep focus, almost no blur), 100% = f/1.4 (shallow + creamy).
// Each f-stop halves the aperture area, so log-interp keeps the slider feel
// linear in stops. Mirrors /dof-lab variant C.
const sliderToFStop = (s) => {
  const t = Math.max(0, Math.min(100, s)) / 100
  return Math.exp(Math.log(16) + t * (Math.log(1.4) - Math.log(16)))
}
const fStopToSlider = (f) => {
  const t = (Math.log(16) - Math.log(f)) / (Math.log(16) - Math.log(1.4))
  return Math.round(Math.max(0, Math.min(1, t)) * 100)
}
const fmtFStop = (f) => `f/${f < 10 ? f.toFixed(1) : Math.round(f)}`

function MockSlider({ label, value, min, max, step = 1, onChange, suffix = '', format }) {
  return (
    <div className="mock-slider-row">
      <div className="mock-slider-head">
        <span>{label}</span>
        <span className="mock-slider-val">{format ? format(value) : `${value}${suffix}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  )
}

function MockToggleRow({ label, on, onToggle }) {
  return (
    <div className="mock-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className={`mock-toggle${on ? ' is-on' : ''}`}
        onClick={onToggle}
        aria-pressed={on}
      />
    </div>
  )
}

export default function ClusterTopRight() {
  const [clouds, setClouds] = useAtom(cloudsAtom)
  const [dof, setDof] = useAtom(dofAtom)

  return (
    <div className="mock-cluster mock-cluster--top-right">
      <GuestSignInChip />
      <HoverPopoverPill
        icon={<ApertureIcon />}
        label={`DoF: ${dof.on ? 'ON' : 'OFF'}`}
        active={dof.on}
        onToggle={() => setDof({ ...dof, on: !dof.on })}
      >
        {/* Mode toggle — Aperture mode replaces Tightness+Blur with one
            f-stop slider that drives both depthRange and maxBlur via the
            shader's `useApertureCoC` branch. Manual mode keeps the legacy
            two-knob workflow. Both modes share Pop. */}
        <MockToggleRow
          label="Aperture mode"
          on={!!dof.useApertureCoC}
          onToggle={() => setDof({ ...dof, useApertureCoC: !dof.useApertureCoC })}
        />
        {dof.useApertureCoC ? (
          <MockSlider
            label="Aperture"
            value={fStopToSlider(dof.aperture ?? 4)}
            min={0}
            max={100}
            onChange={(v) => setDof({ ...dof, aperture: sliderToFStop(v) })}
            format={() => fmtFStop(dof.aperture ?? 4)}
          />
        ) : (
          <>
            <MockSlider
              label="Tightness"
              value={dof.tightness}
              min={0}
              max={100}
              onChange={(v) => setDof({ ...dof, tightness: v })}
              suffix="%"
            />
            <MockSlider
              label="Blur"
              value={dof.blur}
              min={0}
              max={100}
              onChange={(v) => setDof({ ...dof, blur: v })}
              suffix="%"
            />
          </>
        )}
        <MockSlider
          label="Pop"
          value={dof.focusColorPop ?? 0}
          min={0}
          max={100}
          onChange={(v) => setDof({ ...dof, focusColorPop: v })}
          suffix="%"
        />
      </HoverPopoverPill>
      <HoverPopoverPill
        icon={<CloudIcon />}
        label={`Clouds: ${clouds.on ? 'ON' : 'OFF'}`}
        active={clouds.on}
        onToggle={() => setClouds({ ...clouds, on: !clouds.on })}
        alwaysShowPopover
      >
        <div
          className={`mock-controls-group${clouds.on ? '' : ' is-disabled'}`}
          aria-disabled={!clouds.on}
        >
          <MockSlider
            label="Coverage"
            value={Math.round(clouds.coverage * 100)}
            min={0}
            max={100}
            onChange={(v) => setClouds({ ...clouds, coverage: v / 100 })}
            suffix="%"
          />
          <MockSlider
            label="Speed"
            value={clouds.speed}
            min={-10}
            max={10}
            step={0.5}
            onChange={(v) => setClouds({ ...clouds, speed: v })}
            suffix="x"
          />
          <MockToggleRow
            label="Shadows"
            on={!!clouds.shadows}
            onToggle={() => setClouds({ ...clouds, shadows: !clouds.shadows })}
          />
          <MockToggleRow
            label="Pause"
            on={!!clouds.paused}
            onToggle={() => setClouds({ ...clouds, paused: !clouds.paused })}
          />
        </div>
        <div className="mock-controls-group mock-controls-group--separated">
          <MockSlider
            label="Color Pop"
            value={dof.sceneColorPop ?? 0}
            min={0}
            max={100}
            onChange={(v) => setDof({ ...dof, sceneColorPop: v })}
            suffix="%"
          />
        </div>
      </HoverPopoverPill>
    </div>
  )
}
