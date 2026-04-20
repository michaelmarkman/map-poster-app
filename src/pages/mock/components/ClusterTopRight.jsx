import { useAtom } from 'jotai'
import HoverPopoverPill from './HoverPopoverPill'
import { CloudIcon, ApertureIcon } from './icons'
import { cloudsAtom, dofAtom } from '../../editor/atoms/scene'

function MockSlider({ label, value, min, max, step = 1, onChange, suffix = '' }) {
  return (
    <div className="mock-slider-row">
      <div className="mock-slider-head">
        <span>{label}</span>
        <span className="mock-slider-val">{value}{suffix}</span>
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
      <HoverPopoverPill
        icon={<ApertureIcon />}
        label={`DoF: ${dof.on ? 'ON' : 'OFF'}`}
        active={dof.on}
        onToggle={() => setDof({ ...dof, on: !dof.on })}
      >
        <MockSlider
          label="Tightness"
          value={dof.tightness}
          min={0}
          max={100}
          onChange={(v) => setDof({ ...dof, tightness: v })}
          suffix="%"
        />
        <MockSlider
          label="Pop"
          value={dof.focusColorPop ?? 0}
          min={0}
          max={100}
          onChange={(v) => setDof({ ...dof, focusColorPop: v })}
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
