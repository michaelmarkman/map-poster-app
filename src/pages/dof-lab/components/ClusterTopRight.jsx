import { useAtom, useAtomValue } from 'jotai'
import HoverPopoverPill from './HoverPopoverPill'
import GuestSignInChip from './GuestSignInChip'
import { CloudIcon, ApertureIcon } from './icons'
import { cloudsAtom, dofAtom } from '../../editor/atoms/scene'
import { dofUiVariantAtom } from '../atoms'

// Shared slider primitive — identical layout to /app's MockSlider.
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

// ─── Aperture mapping helpers ───────────────────────────────────────────
// f-stops cover the common range f/1.4 – f/16 on a log scale (each stop
// halves aperture area). Variants A and B let the user drive aperture; in
// variant A we derive it from the existing `Blur` slider so the UI stays
// identical to /app. maxBlur in the shader is still driven by the `Blur`
// slider as a creative ceiling — aperture governs the *shape* of the
// falloff, blur governs how hard the ceiling is.
// 0–100 slider → f-stop, log-mapped. 0% = f/16 (deep focus), 100% = f/1.4.
const blurSliderToFStop = (blur) => {
  const t = Math.max(0, Math.min(100, blur)) / 100
  const logF = Math.log(16) + t * (Math.log(1.4) - Math.log(16))
  return Math.exp(logF)
}
const fStopFormat = (f) => `f/${f < 10 ? f.toFixed(1) : Math.round(f)}`
const fStopToPct = (f) => {
  const t = (Math.log(16) - Math.log(f)) / (Math.log(16) - Math.log(1.4))
  return Math.round(Math.max(0, Math.min(1, t)) * 100)
}

// ─── Tilt-shift layout (shared across all three variants) ───────────────
function TiltShiftControls({ dof, setDof }) {
  const bandPct = Math.round((dof.tiltBandHalf ?? 0.1) * 200)
  const centerPct = Math.round((dof.tiltCenter?.[1] ?? 0.5) * 100)
  const rotDeg = Math.round(((dof.tiltRotation ?? 0) * 180) / Math.PI)

  return (
    <>
      <MockSlider
        label="Band width"
        value={bandPct}
        min={2}
        max={100}
        onChange={(v) => setDof({ ...dof, tiltBandHalf: v / 200 })}
        suffix="%"
      />
      <MockSlider
        label="Band position"
        value={centerPct}
        min={0}
        max={100}
        onChange={(v) => setDof({
          ...dof,
          tiltCenter: [dof.tiltCenter?.[0] ?? 0.5, v / 100],
        })}
        suffix="%"
      />
      <MockSlider
        label="Rotation"
        value={rotDeg}
        min={-90}
        max={90}
        onChange={(v) => setDof({ ...dof, tiltRotation: (v * Math.PI) / 180 })}
        format={(v) => `${v}°`}
      />
      <MockSlider
        label="Pop"
        value={dof.focusColorPop ?? 0}
        min={0}
        max={100}
        onChange={(v) => setDof({ ...dof, focusColorPop: v })}
        suffix="%"
      />
    </>
  )
}

// ─── Variant A: derive aperture from Blur, UI identical to /app ─────────
function VariantA({ dof, setDof }) {
  return (
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
        onChange={(v) => setDof({
          ...dof,
          blur: v,
          useApertureCoC: true,
          aperture: blurSliderToFStop(v),
        })}
        suffix="%"
      />
    </>
  )
}

// ─── Variant B: Aperture replaces Blur ─────────────────────────────────
function VariantB({ dof, setDof }) {
  const fStop = dof.aperture ?? 4
  const blurPct = fStopToPct(fStop)
  return (
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
        label="Pop"
        value={dof.focusColorPop ?? 0}
        min={0}
        max={100}
        onChange={(v) => setDof({ ...dof, focusColorPop: v })}
        suffix="%"
      />
      <MockSlider
        label="Aperture"
        value={blurPct}
        min={0}
        max={100}
        onChange={(v) => setDof({
          ...dof,
          blur: v,
          useApertureCoC: true,
          aperture: blurSliderToFStop(v),
        })}
        format={() => fStopFormat(fStop)}
      />
    </>
  )
}

// ─── Variant C: Aperture + Pop only ────────────────────────────────────
function VariantC({ dof, setDof }) {
  const fStop = dof.aperture ?? 4
  const blurPct = fStopToPct(fStop)
  return (
    <>
      <MockSlider
        label="Aperture"
        value={blurPct}
        min={0}
        max={100}
        onChange={(v) => setDof({
          ...dof,
          blur: v,
          useApertureCoC: true,
          aperture: blurSliderToFStop(v),
        })}
        format={() => fStopFormat(fStop)}
      />
      <MockSlider
        label="Pop"
        value={dof.focusColorPop ?? 0}
        min={0}
        max={100}
        onChange={(v) => setDof({ ...dof, focusColorPop: v })}
        suffix="%"
      />
    </>
  )
}

export default function ClusterTopRight() {
  const [clouds, setClouds] = useAtom(cloudsAtom)
  const [dof, setDof] = useAtom(dofAtom)
  const variant = useAtomValue(dofUiVariantAtom)

  const tiltOn = !!dof.tiltShift

  let variantContent
  if (variant === 'A') variantContent = <VariantA dof={dof} setDof={setDof} />
  else if (variant === 'C') variantContent = <VariantC dof={dof} setDof={setDof} />
  else variantContent = <VariantB dof={dof} setDof={setDof} />

  return (
    <div className="mock-cluster mock-cluster--top-right">
      <GuestSignInChip />
      <HoverPopoverPill
        icon={<ApertureIcon />}
        label={`DoF: ${dof.on ? 'ON' : 'OFF'}`}
        active={dof.on}
        onToggle={() => setDof({ ...dof, on: !dof.on })}
      >
        <MockToggleRow
          label="Tilt-shift"
          on={tiltOn}
          onToggle={() => setDof({ ...dof, tiltShift: !tiltOn })}
        />
        <div className="mock-controls-group mock-controls-group--separated">
          {tiltOn
            ? <TiltShiftControls dof={dof} setDof={setDof} />
            : variantContent}
        </div>
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
