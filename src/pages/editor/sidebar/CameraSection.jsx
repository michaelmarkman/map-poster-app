import { useState } from 'react'
import { useAtom } from 'jotai'
import SidebarSection from './SidebarSection'
import { cameraReadoutAtom } from '../atoms/ui'
import { bloomAtom, ssaoAtom, vignetteAtom, dofAtom } from '../atoms/scene'
import { sliderToAlt, altToSlider, dispatchCameraSet } from '../utils/camera'
import { dispatchEffectsChanged } from '../scene/events'

// Camera sidebar section — focal length, DoF, color pop, and an expandable
// "More" panel with tilt/heading/altitude and effects toggles. Ported from
// prototypes/poster-v3-ui.html lines 2336-2394 and the matching wireUI
// handlers. Slider values are derived from cameraReadoutAtom so the live
// camera (written by Scene's useFrame) drives the UI.
export default function CameraSection() {
  const [readout] = useAtom(cameraReadoutAtom)
  const [dof, setDof] = useAtom(dofAtom)
  const [bloom, setBloom] = useAtom(bloomAtom)
  const [ssao, setSsao] = useAtom(ssaoAtom)
  const [vignette, setVignette] = useAtom(vignetteAtom)
  const [moreOpen, setMoreOpen] = useState(false)

  const altitude = Math.round(readout.altitude)

  return (
    <SidebarSection name="camera" title="Camera">
      <div className="control-row">
        <div className="control-label">
          <span>Focal length</span>
          <span className="control-value" id="fov-val">{readout.fovMm}mm</span>
        </div>
        <input
          type="range"
          id="fov-slider"
          min="14"
          max="200"
          step="1"
          value={readout.fovMm}
          onChange={(e) => {
            const mm = +e.target.value
            window.dispatchEvent(new CustomEvent('fov-change', { detail: mm }))
          }}
        />
      </div>

      <div className="toggle-row">
        <span>Depth of field</span>
        <div
          className={dof.on ? 'toggle on' : 'toggle'}
          id="toggle-dof"
          onClick={() => setDof({ ...dof, on: !dof.on })}
        />
      </div>
      {dof.on && (
        <div className="indent" id="dof-settings">
          <div className="control-row">
            <div className="control-label">
              <span>Focus tightness</span>
              <span className="control-value" id="dof-focus-val">{dof.tightness}%</span>
            </div>
            <input
              type="range"
              id="dof-focus-slider"
              min="0"
              max="100"
              step="1"
              value={dof.tightness}
              onChange={(e) => setDof({ ...dof, tightness: +e.target.value })}
            />
          </div>
          <div className="control-row">
            <div className="control-label">
              <span>Blur</span>
              <span className="control-value" id="dof-blur-val">{dof.blur}%</span>
            </div>
            <input
              type="range"
              id="dof-blur-slider"
              min="0"
              max="100"
              step="1"
              value={dof.blur}
              onChange={(e) => setDof({ ...dof, blur: +e.target.value })}
            />
          </div>
          <div className="toggle-row">
            <span>Pop whole scene</span>
            <div
              className={dof.globalPop ? 'toggle on' : 'toggle'}
              id="toggle-global-pop"
              onClick={() => setDof({ ...dof, globalPop: !dof.globalPop })}
            />
          </div>
        </div>
      )}

      <div className="control-row">
        <div className="control-label">
          <span>Color pop</span>
          <span className="control-value" id="dof-pop-val">{dof.colorPop}%</span>
        </div>
        <input
          type="range"
          id="dof-pop-slider"
          min="0"
          max="100"
          step="1"
          value={dof.colorPop}
          onChange={(e) => setDof({ ...dof, colorPop: +e.target.value })}
        />
      </div>

      <button
        className={moreOpen ? 'more-btn open' : 'more-btn'}
        id="camera-more-btn"
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
        More
      </button>
      <div className={moreOpen ? 'more-content open' : 'more-content'} id="camera-more">
        <div className="control-row">
          <div className="control-label">
            <span>Tilt</span>
            <span className="control-value" id="tilt-val">{readout.tilt}&deg;</span>
          </div>
          <input
            type="range"
            id="tilt-slider"
            min="0"
            max="90"
            step="1"
            value={readout.tilt}
            onChange={(e) => dispatchCameraSet({ tilt: +e.target.value })}
          />
        </div>
        <div className="control-row">
          <div className="control-label">
            <span>Heading</span>
            <span className="control-value" id="heading-val">{readout.heading}&deg;</span>
          </div>
          <input
            type="range"
            id="heading-slider"
            min="-180"
            max="180"
            step="1"
            value={readout.heading}
            onChange={(e) => dispatchCameraSet({ heading: +e.target.value })}
          />
        </div>
        <div className="control-row">
          <div className="control-label">
            <span>Altitude</span>
            <span className="control-value" id="range-val">{altitude.toLocaleString()}m</span>
          </div>
          <input
            type="range"
            id="range-slider"
            min="0"
            max="1000"
            step="1"
            value={altToSlider(readout.altitude)}
            onChange={(e) => dispatchCameraSet({ altitude: sliderToAlt(+e.target.value) })}
          />
        </div>
        <div className="toggle-row">
          <span>Bloom</span>
          <div
            className={bloom.on ? 'toggle on' : 'toggle'}
            id="toggle-bloom"
            onClick={() => {
              setBloom({ ...bloom, on: !bloom.on })
              dispatchEffectsChanged()
            }}
          />
        </div>
        <div className="toggle-row">
          <span>SSAO</span>
          <div
            className={ssao.on ? 'toggle on' : 'toggle'}
            id="toggle-ssao"
            onClick={() => {
              setSsao({ ...ssao, on: !ssao.on })
              dispatchEffectsChanged()
            }}
          />
        </div>
        <div className="toggle-row">
          <span>Vignette</span>
          <div
            className={vignette.on ? 'toggle on' : 'toggle'}
            id="toggle-vignette"
            onClick={() => {
              setVignette({ ...vignette, on: !vignette.on })
              dispatchEffectsChanged()
            }}
          />
        </div>
      </div>
    </SidebarSection>
  )
}
