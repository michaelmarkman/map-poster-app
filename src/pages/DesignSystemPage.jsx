import { useEffect, useState } from 'react'
import './mock/styles/mock.css'
import '../pages/editor/styles/index.css'
import './DesignSystemPage.css'

// Vedute Design System — single-page reference for everything visual
// that ships in /app. Auto-rendered against the actual mock.css so the
// docs can't drift from the source of truth: if a swatch reads wrong
// here, the live editor is wrong too. Tokens, typography, primitives,
// menus, chrome, motion — each block calls out the class names + key
// values plus a live rendered example.
//
// Reachable at /design-system (no auth). Pure reference; no canvas, no
// state outside local toggles for interactive states.

// ── Helpers ───────────────────────────────────────────────────
function Token({ name, value, swatch, swatchStyle }) {
  return (
    <div className="ds-token">
      {swatch && (
        <span className="ds-token-swatch" style={swatchStyle || { background: value }} />
      )}
      <div className="ds-token-text">
        <div className="ds-token-name">{name}</div>
        <div className="ds-token-value">{value}</div>
      </div>
    </div>
  )
}

function Spec({ children }) {
  return <div className="ds-spec">{children}</div>
}

function Section({ id, label, title, lead, children }) {
  return (
    <section id={id} className="ds-section">
      <div className="ds-section-head">
        <span className="ds-section-tag">{label}</span>
        <h2 className="ds-section-title">{title}</h2>
        {lead && <p className="ds-section-lead">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

function Block({ title, sub, demo, spec }) {
  return (
    <article className="ds-block">
      <header className="ds-block-head">
        <div className="ds-block-title">{title}</div>
        {sub && <div className="ds-block-sub">{sub}</div>}
      </header>
      <div className="ds-block-demo">{demo}</div>
      {spec && <div className="ds-block-spec">{spec}</div>}
    </article>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function DesignSystemPage() {
  // Active-state toggle for the interactive pill demos.
  const [pillActive, setPillActive] = useState(false)

  // body.mock-mounted scopes most pill / cluster styles. We mount it
  // here so the examples render with the editor-side variants; cleanup
  // on unmount so other pages that share .mock-* classes aren't
  // affected (e.g. the gallery preview popover used elsewhere).
  useEffect(() => {
    document.body.classList.add('mock-mounted', 'ds-page-mounted')
    return () => document.body.classList.remove('mock-mounted', 'ds-page-mounted')
  }, [])

  return (
    <div className="ds-root">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="ds-hero">
        <div className="ds-hero-tag">Vedute · Design System</div>
        <h1 className="ds-hero-title">
          <span className="ds-hero-serif">Vedute</span>
          <span className="ds-hero-divider">·</span>
          <span>v1</span>
        </h1>
        <p className="ds-hero-lead">
          A camera-shaped editor for cinematic city posters. The visual
          language is built around three families: <em>glass pills</em>{' '}
          (the chrome), <em>menus</em> (the actions), and{' '}
          <em>view-finders</em> (the camera identity). Each section below
          documents the recipe — tokens, classes, values — so anything
          new built into the editor stays in family.
        </p>
        <nav className="ds-hero-nav">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="ds-hero-nav-link">
              <span className="ds-hero-nav-num">{s.num}</span>
              <span className="ds-hero-nav-label">{s.label}</span>
            </a>
          ))}
        </nav>
      </header>

      {/* ── 01 Foundations ───────────────────────────────────── */}
      <Section
        id="foundations"
        label="01 · Foundations"
        title="Tokens"
        lead="All values defined under `:root` in mock.css. The chartreuse accent + dark glass tints are the load-bearing brand cues; everything downstream reads from them."
      >
        <div className="ds-token-grid">
          <Token name="--moma-accent" value="#9be57f" swatch swatchStyle={{ background: '#9be57f' }} />
          <Token name="--moma-accent-dark" value="#06120a" swatch swatchStyle={{ background: '#06120a' }} />
          <Token name="--accent-soft" value="rgba(155,229,127,0.12)" swatch swatchStyle={{ background: '#9be57f', opacity: 0.12 }} />
          <Token name="--moma-bg" value="#06080a" swatch swatchStyle={{ background: '#06080a' }} />
          <Token name="--moma-canvas" value="#08090b" swatch swatchStyle={{ background: '#08090b' }} />
          <Token name="--moma-pill" value="rgba(8,10,12,0.55)" swatch swatchStyle={{ background: 'rgba(8,10,12,0.55)' }} />
          <Token name="--ink" value="#fafafa" swatch swatchStyle={{ background: '#fafafa' }} />
          <Token name="--ink-soft" value="rgba(250,250,250,0.55)" swatch swatchStyle={{ background: 'rgba(250,250,250,0.55)' }} />
          <Token name="--ink-dim" value="rgba(250,250,250,0.16)" swatch swatchStyle={{ background: 'rgba(250,250,250,0.16)' }} />
          <Token name="status / done" value="#b9c4ad" swatch swatchStyle={{ background: '#b9c4ad' }} />
          <Token name="status / error" value="#d99a8a" swatch swatchStyle={{ background: '#d99a8a' }} />
          <Token name="vf-line" value="rgba(250,250,250,0.70)" swatch swatchStyle={{ background: 'rgba(250,250,250,0.70)' }} />
        </div>

        <div className="ds-spec-grid">
          <Block
            title="Glass pill recipe"
            sub="The chrome's load-bearing material"
            demo={
              <div className="ds-pill-stage">
                <div style={{ position: 'absolute', inset: 0, background: "url('/style-photos/vedute-realistic-2x-20260422-1705.png') center/cover" }} />
                <div className="ds-pill-stage-overlay">
                  <button type="button" className="mock-pill">
                    <span className="label">Aspect</span>
                    <span className="value">3:4</span>
                  </button>
                </div>
              </div>
            }
            spec={
              <Spec>
                <p><code>height: 28.5px · padding: 7px 11px · radius: 3px</code></p>
                <p><code>bg: rgba(8,10,12,0.55) · blur(7px)</code></p>
                <p><code>border: 1px rgba(250,250,250,0.10)</code></p>
                <p>Hover lifts bg → <code>rgba(12,14,18,0.78)</code> and tints the border <code>rgba(155,229,127,0.35)</code>.</p>
              </Spec>
            }
          />
          <Block
            title="Spacing scale"
            sub="Editor uses a coarse 4 / 8 / 12 / 24 set"
            demo={
              <div className="ds-spacing">
                {[4, 8, 12, 16, 24, 32, 48].map((n) => (
                  <div key={n} className="ds-spacing-row">
                    <span className="ds-spacing-bar" style={{ width: n }} />
                    <span className="ds-spacing-num">{n}px</span>
                  </div>
                ))}
              </div>
            }
            spec={
              <Spec>
                <p>Cluster offsets (top/right/bottom/left edge insets): <code>24px</code>.</p>
                <p>Bracket inset from cluster: <code>+40px vertical</code> = <code>64px</code> total.</p>
                <p>Menu interior padding: <code>14px</code>. Row padding: <code>5–8px vertical, 8–11px horizontal</code>.</p>
              </Spec>
            }
          />
        </div>
      </Section>

      {/* ── 02 Typography ────────────────────────────────────── */}
      <Section
        id="typography"
        label="02 · Type"
        title="Three families, three jobs"
        lead="JetBrains Mono for system labels + values (camera vocabulary). Bodoni Moda for editorial location titles. Instrument Serif for the render-sheet brand block."
      >
        <div className="ds-type-grid">
          <Block
            title="Bodoni Moda · 32px italic 500"
            sub="Lightbox title — editorial location"
            demo={
              <div className="ds-type-sample">
                <span style={{ font: "italic 500 32px/1.1 'Bodoni Moda', serif", fontVariationSettings: "'opsz' 96", color: '#fff', letterSpacing: '-0.012em' }}>
                  Brooklyn Bridge
                </span>
              </div>
            }
            spec={
              <Spec>
                <p><code>{`font: italic 500 32px/1.1 'Bodoni Moda'`}</code></p>
                <p><code>{`font-variation-settings: 'opsz' 96`}</code></p>
                <p>Tight tracking (<code>-0.012em</code>) to read as a place-name, not a headline.</p>
              </Spec>
            }
          />
          <Block
            title="JetBrains Mono · 13/500 + 10/400"
            sub="Title (uppercase) + meta (mixed)"
            demo={
              <div className="ds-type-sample">
                <div style={{ font: "500 13px/1 'JetBrains Mono', monospace", letterSpacing: '1.98px', textTransform: 'uppercase', color: 'var(--ink)' }}>
                  Capture
                </div>
                <div style={{ font: "400 10px/1 'JetBrains Mono', monospace", letterSpacing: '1.62px', color: 'var(--ink-soft)', marginTop: 8 }}>
                  2× · 2160px
                </div>
              </div>
            }
            spec={
              <Spec>
                <p>Title: <code>13/500 · upper · letter-spacing 1.98px</code></p>
                <p>Meta: <code>10/400 · tabular-nums · letter-spacing 1.62px</code></p>
                <p>Label-track <code>1.62px</code> for 9–10px text; value-track <code>0.88px</code> for 11–13px.</p>
              </Spec>
            }
          />
          <Block
            title="Section label · 9px upper"
            sub="Every menu group header"
            demo={
              <div className="ds-type-sample">
                <div className="mock-menu-section-label">
                  <span>Saved Views</span>
                  <span className="mock-menu-count">15</span>
                </div>
                <div className="mock-menu-section-label">
                  <span>Tour</span>
                </div>
              </div>
            }
            spec={
              <Spec>
                <p><code>font: 400 9px/1 mono · letter-spacing 1.62px</code></p>
                <p>Padding <code>8px 10px 4px</code> standalone; <code>14px 11px 8px</code> inside capture menu.</p>
              </Spec>
            }
          />
        </div>
      </Section>

      {/* ── 03 Pills ─────────────────────────────────────────── */}
      <Section
        id="pills"
        label="03 · Primitives"
        title="Pills"
        lead="The chrome's vocabulary. Three variants: trigger (opens a popover), readout (display-only), and drag (scrubs a value)."
      >
        <div className="ds-pill-row">
          <Block
            title="Trigger pill"
            sub=".mock-pill (default)"
            demo={
              <div className="ds-pill-stage">
                <div style={{ position: 'absolute', inset: 0, background: "url('/style-photos/vedute-realistic-2x-20260422-1705.png') center/cover" }} />
                <div className="ds-pill-stage-overlay">
                  <button
                    type="button"
                    className={`mock-pill${pillActive ? ' is-active' : ''}`}
                    onClick={() => setPillActive((v) => !v)}
                  >
                    <span className="label">Aspect</span>
                    <span className="value">3:4</span>
                  </button>
                </div>
              </div>
            }
            spec={
              <Spec>
                <p>Click to toggle the active state above — same recipe as the editor&apos;s real pills.</p>
                <p>Open / active state: <code>border-color rgba(155,229,127,0.50)</code> + label brightens.</p>
              </Spec>
            }
          />
          <Block
            title="Readout pill"
            sub=".mock-pill (display only)"
            demo={
              <div className="ds-pill-stage">
                <div style={{ position: 'absolute', inset: 0, background: "url('/style-photos/vedute-golden-hour-2x-20260422-1706.png') center/cover" }} />
                <div className="ds-pill-stage-overlay">
                  <div className="mock-pill" aria-hidden="true">
                    <span className="label">Lens</span>
                    <span className="value">35mm</span>
                  </div>
                </div>
              </div>
            }
            spec={
              <Spec>
                <p>Same shape, no <code>:hover</code> elevation. Used for non-interactive camera meta (lens, FOV).</p>
              </Spec>
            }
          />
          <Block
            title="Drag pill"
            sub=".mock-pill scrubbable"
            demo={
              <div className="ds-pill-stage">
                <div style={{ position: 'absolute', inset: 0, background: "url('/style-photos/vedute-cyberpunk-2x-20260422-1710.png') center/cover" }} />
                <div className="ds-pill-stage-overlay">
                  <div className="mock-pill mock-pill--drag" aria-hidden="true">
                    <span className="label">Time</span>
                    <span className="value">17:05</span>
                    <span className="ds-pill-scrub-rail" aria-hidden="true" />
                  </div>
                </div>
              </div>
            }
            spec={
              <Spec>
                <p>Adds a 1px chartreuse track under the pill to signal scrubbability. Real scrub state sets <code>[data-scrubbing]</code> to suppress hover.</p>
              </Spec>
            }
          />
        </div>
      </Section>

      {/* ── 04 Menus ─────────────────────────────────────────── */}
      <Section
        id="menus"
        label="04 · Menus"
        title="Popovers"
        lead="Every menu nests inside a `.mock-popover` chassis (dark glass + 1px hairline + 6px corners). Content varies; the chassis stays."
      >
        <div className="ds-menu-grid">
          <Block
            title="Section label + count"
            sub=".mock-menu-section-label"
            demo={
              <div className="ds-menu-stage">
                <div className="mock-menu-section-label">
                  <span>Saved Views</span>
                  <span className="mock-menu-count">15</span>
                </div>
              </div>
            }
          />
          <Block
            title="Item row"
            sub=".menu-item / .svp-row"
            demo={
              <div className="ds-menu-stage">
                <div className="svp-row">
                  <span className="svp-row-main" style={{ pointerEvents: 'none' }}>
                    <span className="svp-thumb">
                      <span className="svp-thumb-placeholder" />
                    </span>
                    <span className="svp-name">Empire State, Dusk</span>
                    <span className="svp-lens">50mm</span>
                  </span>
                </div>
                <div className="svp-row">
                  <span className="svp-row-main" style={{ pointerEvents: 'none' }}>
                    <span className="svp-thumb">
                      <span className="svp-thumb-placeholder" />
                    </span>
                    <span className="svp-name">Times Square, Night</span>
                    <span className="svp-lens">28mm</span>
                  </span>
                </div>
              </div>
            }
            spec={
              <Spec>
                <p>36×24 thumb · 12px mono name · 9px upper lens chip.</p>
                <p>Hover wraps in <code>rgba(155,229,127,0.08)</code> · pin + delete fade in on row-hover.</p>
              </Spec>
            }
          />
          <Block
            title="Action button"
            sub=".svp-action / .menu-action"
            demo={
              <div className="ds-menu-stage">
                <button type="button" className="svp-action">
                  <span className="svp-action-icon">
                    <svg viewBox="0 0 9 9" aria-hidden="true">
                      <path d="M4.5 1v7M1 4.5h7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </span>
                  <span>Save current view</span>
                </button>
              </div>
            }
            spec={
              <Spec>
                <p>Chartreuse text + outlined-square plus icon. Hover wraps in <code>rgba(155,229,127,0.10)</code>.</p>
              </Spec>
            }
          />
          <Block
            title="Filter input"
            sub=".svp-filter / .menu-views-filter"
            demo={
              <div className="ds-menu-stage">
                <div className="svp-filter">
                  <svg className="svp-filter-icon" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="4.5" cy="4.5" r="3" />
                    <path d="M6.7 6.7 9 9" />
                  </svg>
                  <input
                    className="svp-filter-input"
                    type="text"
                    defaultValue=""
                    placeholder="Filter saved views…"
                  />
                </div>
              </div>
            }
            spec={
              <Spec>
                <p>Surfaces only when filterable list count exceeds 6. <code>padding: 5px 8px · border 1px rgba(255,255,255,0.06)</code>.</p>
              </Spec>
            }
          />
        </div>
      </Section>

      {/* ── 05 Cards ─────────────────────────────────────────── */}
      <Section
        id="cards"
        label="05 · Cards"
        title="Style + Gallery"
        lead="Both use the 4:3 / padding-top:75% trick so CSS Grid picks up intrinsic block size. The thumb fills the absolute inset; label overlays at the bottom with a gradient bleed."
      >
        <div className="ds-card-grid">
          <div>
            <div className="ds-block-head">
              <div className="ds-block-title">Style card</div>
              <div className="ds-block-sub">.mock-menu-capture-style</div>
            </div>
            <div className="ds-card-row mock-menu-capture-styles">
              <button type="button" className="mock-menu-capture-style is-raw">
                <span className="mock-menu-capture-style-thumb" />
                <span className="mock-menu-capture-style-label">Raw</span>
              </button>
              <button type="button" className="mock-menu-capture-style is-active">
                <span
                  className="mock-menu-capture-style-thumb"
                  style={{ backgroundImage: "url('/style-photos/vedute-realistic-2x-20260422-1705.png')" }}
                />
                <span className="mock-menu-capture-style-label">Realistic</span>
                <span className="mock-menu-capture-style-check">✓</span>
              </button>
              <button type="button" className="mock-menu-capture-style">
                <span
                  className="mock-menu-capture-style-thumb"
                  style={{ backgroundImage: "url('/style-photos/vedute-cyberpunk-2x-20260422-1710.png')" }}
                />
                <span className="mock-menu-capture-style-label">Cyberpunk</span>
              </button>
            </div>
          </div>
          <div>
            <div className="ds-block-head">
              <div className="ds-block-title">Gallery tile</div>
              <div className="ds-block-sub">.mock-menu-gallery-tile</div>
            </div>
            <div className="ds-card-row ds-card-row--gallery">
              <div className="mock-menu-gallery-tile">
                <img
                  src="/style-photos/vedute-realistic-2x-20260422-1705.png"
                  alt=""
                />
                <span className="mock-menu-gallery-tile-meta">
                  <span className="mock-menu-gallery-tile-label">Realistic</span>
                  <span className="mock-menu-gallery-tile-time">2h ago</span>
                </span>
              </div>
              <div className="mock-menu-gallery-tile">
                <img
                  src="/style-photos/vedute-foggy-dawn-2x-20260422-1708.png"
                  alt=""
                />
                <span className="mock-menu-gallery-tile-meta">
                  <span className="mock-menu-gallery-tile-label">Foggy Dawn</span>
                  <span className="mock-menu-gallery-tile-time">just now</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 06 Queue ─────────────────────────────────────────── */}
      <Section
        id="queue"
        label="06 · Queue"
        title="Render queue rows"
        lead="Four status states: active (cream shimmer + per-row progress + elapsed timer), pending (dimmed thumb + #N badge), done (cream check badge top-right), error (terracotta × + error message). Hover surfaces the per-state action set."
      >
        <div className="ds-queue-stage">
          <article className="mock-menu-queue-row" data-status="active">
            <span className="mock-menu-queue-dot" />
            <span
              className="mock-menu-queue-thumb"
              style={{ backgroundImage: "url('/style-photos/vedute-realistic-2x-20260422-1705.png')" }}
            />
            <div className="mock-menu-queue-body">
              <div className="mock-menu-queue-top">
                <span className="mock-menu-queue-label">Realistic</span>
                <span className="mock-menu-queue-time">0:42</span>
              </div>
              <div className="mock-menu-queue-meta">2× · 2048px · rendering</div>
              <div className="mock-menu-queue-progress"><span style={{ width: '62%' }} /></div>
            </div>
            <div className="mock-menu-queue-actions" />
          </article>
          <article className="mock-menu-queue-row" data-status="pending">
            <span className="mock-menu-queue-dot" />
            <span
              className="mock-menu-queue-thumb"
              style={{ backgroundImage: "url('/style-photos/vedute-golden-hour-2x-20260422-1706.png')" }}
            />
            <div className="mock-menu-queue-body">
              <div className="mock-menu-queue-top">
                <span className="mock-menu-queue-label">Golden Hour</span>
                <span className="mock-menu-queue-time">#1</span>
              </div>
              <div className="mock-menu-queue-meta">2× · 2048px · waiting</div>
            </div>
            <div className="mock-menu-queue-actions" />
          </article>
          <article className="mock-menu-queue-row is-clickable" data-status="done">
            <span className="mock-menu-queue-dot" />
            <span
              className="mock-menu-queue-thumb"
              style={{ backgroundImage: "url('/style-photos/vedute-polaroid-2x-20260422-1706.png')" }}
            />
            <div className="mock-menu-queue-body">
              <div className="mock-menu-queue-top">
                <span className="mock-menu-queue-label">Moody</span>
                <span className="mock-menu-queue-time">3m ago</span>
              </div>
              <div className="mock-menu-queue-meta">2× · 2048px · in gallery</div>
            </div>
            <div className="mock-menu-queue-actions" />
          </article>
          <article className="mock-menu-queue-row" data-status="error">
            <span className="mock-menu-queue-dot" />
            <span
              className="mock-menu-queue-thumb"
              style={{ backgroundImage: "url('/style-photos/vedute-cyberpunk-2x-20260422-1710.png')" }}
            />
            <div className="mock-menu-queue-body">
              <div className="mock-menu-queue-top">
                <span className="mock-menu-queue-label">Night City</span>
                <span className="mock-menu-queue-time">2m ago</span>
              </div>
              <div className="mock-menu-queue-error">Model returned 503 — server overloaded.</div>
            </div>
            <div className="mock-menu-queue-actions" />
          </article>
        </div>
      </Section>

      {/* ── 07 Lightbox ──────────────────────────────────────── */}
      <Section
        id="lightbox"
        label="07 · Lightbox"
        title="Render preview"
        lead="Two-column grid: image stage on the left, dark-glass sidebar on the right. Sidebar is a real flex column with gap:24 — close, head, actions, metadata, danger stack naturally; no magic margins."
      >
        <div className="ds-lightbox-stage">
          <div className="ds-lightbox-image">
            <img
              src="/style-photos/vedute-realistic-2x-20260422-1705.png"
              alt="Realistic NYC"
              draggable={false}
            />
          </div>
          <aside className="ds-lightbox-side">
            <div className="ds-lightbox-side-head">
              <span className="ds-lightbox-side-title">Brooklyn Bridge</span>
              <span className="ds-lightbox-side-style">Realistic · 2h ago</span>
            </div>
            <div className="lb-meta-list">
              <div className="lb-meta-row">
                <span className="lb-meta-key">Style</span>
                <span className="lb-meta-val">Realistic</span>
              </div>
              <div className="lb-meta-row">
                <span className="lb-meta-key">Captured</span>
                <span className="lb-meta-val">Apr 22, 17:05</span>
              </div>
              <div className="lb-meta-row">
                <span className="lb-meta-key">Lens</span>
                <span className="lb-meta-val">35mm</span>
              </div>
              <div className="lb-meta-row">
                <span className="lb-meta-key">Time of day</span>
                <span className="lb-meta-val">3:30 pm</span>
              </div>
            </div>
            <button type="button" className="lb-danger">
              <svg viewBox="0 0 11 11" aria-hidden="true">
                <path d="M3 4h5M3.5 4v5.5M7.5 4v5.5M3 4l.5-1.5h4l.5 1.5"
                      fill="none" stroke="currentColor" strokeWidth="1.4"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Delete</span>
            </button>
          </aside>
        </div>
      </Section>

      {/* ── 08 Chrome ────────────────────────────────────────── */}
      <Section
        id="chrome"
        label="08 · Chrome"
        title="Camera identity"
        lead="The non-pill visual layer that sets the editor apart from a generic web canvas. Brackets frame the safe-area; the reticle locks the focus point on tap; the aspect frame masks the canvas into a poster crop."
      >
        <div className="ds-chrome-grid">
          <Block
            title="Viewfinder brackets"
            sub=".mock-vf-bracket — 24×14, 1px stroke"
            demo={
              <div className="ds-chrome-stage">
                <div className="ds-chrome-bracket ds-chrome-bracket--tl" />
                <div className="ds-chrome-bracket ds-chrome-bracket--tr" />
                <div className="ds-chrome-bracket ds-chrome-bracket--bl" />
                <div className="ds-chrome-bracket ds-chrome-bracket--br" />
              </div>
            }
            spec={
              <Spec>
                <p>White at 70% opacity. Inset 24px from each viewport edge; top offset +40 to clear the cluster row.</p>
                <p>Per-corner transform: <code>scaleX(-1)</code> / <code>scaleY(-1)</code> / <code>scale(-1,-1)</code>.</p>
              </Spec>
            }
          />
          <Block
            title="Focus reticle"
            sub=".mock-reticle — chartreuse 80×80"
            demo={
              <div className="ds-chrome-stage ds-chrome-stage--reticle">
                <div className="ds-chrome-reticle">
                  <div className="ds-chrome-reticle-bracket">
                    <span />
                    <span className="center" />
                    <span />
                  </div>
                  <div className="ds-chrome-reticle-label">Focus · 312m</div>
                </div>
              </div>
            }
            spec={
              <Spec>
                <p>Four L-corners (14×14, 1.25px stroke) + center dot. Plays 560ms snap-in on canvas tap.</p>
                <p>Real distance via raycaster; label shows <code>{`{m}m`}</code> rangefinder readout.</p>
              </Spec>
            }
          />
          <Block
            title="Aspect frame"
            sub=".mock-frame-border — 3px white"
            demo={
              <div className="ds-chrome-stage ds-chrome-stage--frame">
                <div className="ds-chrome-frame">
                  <div className="ds-chrome-frame-blur" />
                  <div className="ds-chrome-frame-border" />
                </div>
              </div>
            }
            spec={
              <Spec>
                <p>3px solid <code>rgba(255,255,255,0.95)</code> over a 14px-blurred dim sheet with a cut-out mask.</p>
                <p>Resize transitions <code>0.45s cubic-bezier(0.22, 1, 0.36, 1)</code>.</p>
              </Spec>
            }
          />
        </div>
      </Section>

      {/* ── 09 Motion ────────────────────────────────────────── */}
      <Section
        id="motion"
        label="09 · Motion"
        title="Timing palette"
        lead="Three durations cover everything. 120ms for color/hover, 220ms for entrance, 420–560ms for staged sequences. Easing is `cubic-bezier(0.2, 0.8, 0.3, 1)` (overshoot-and-settle) almost everywhere."
      >
        <div className="ds-motion-grid">
          <div className="ds-motion-row">
            <div className="ds-motion-meta">
              <div className="ds-motion-name">Hover lift</div>
              <div className="ds-motion-spec">120–180ms · ease</div>
            </div>
            <div className="ds-motion-demo">Background + border on .mock-pill / .mock-menu-queue-row</div>
          </div>
          <div className="ds-motion-row">
            <div className="ds-motion-meta">
              <div className="ds-motion-name">Popover entrance</div>
              <div className="ds-motion-spec">220ms · cubic-bezier(0.2, 0.8, 0.3, 1)</div>
            </div>
            <div className="ds-motion-demo">Lightbox fade-in, capture popover entrance</div>
          </div>
          <div className="ds-motion-row">
            <div className="ds-motion-meta">
              <div className="ds-motion-name">Load-in stagger</div>
              <div className="ds-motion-spec">320 / 420ms · 80ms inter-cluster delay</div>
            </div>
            <div className="ds-motion-demo">Brackets snap in, then frame, then 5 corner clusters left→right top→bottom</div>
          </div>
          <div className="ds-motion-row">
            <div className="ds-motion-meta">
              <div className="ds-motion-name">Focus reticle</div>
              <div className="ds-motion-spec">560ms · scale(1.5 → 1 → 0.94 → 1) + 1.5s opacity hold</div>
            </div>
            <div className="ds-motion-demo">Tap-to-focus on the canvas</div>
          </div>
          <div className="ds-motion-row">
            <div className="ds-motion-meta">
              <div className="ds-motion-name">Queue dot pulse</div>
              <div className="ds-motion-spec">1.4s · ease-in-out · infinite (active only)</div>
            </div>
            <div className="ds-motion-demo">Status indicator on rendering jobs + queue-link in header</div>
          </div>
          <div className="ds-motion-row">
            <div className="ds-motion-meta">
              <div className="ds-motion-name">Queue thumb shimmer</div>
              <div className="ds-motion-spec">1.6s · linear · infinite (active only)</div>
            </div>
            <div className="ds-motion-demo">Cream gradient slides across the thumbnail while rendering</div>
          </div>
        </div>
        <p className="ds-motion-note">
          <code>@media (prefers-reduced-motion: reduce)</code> drops every load-in animation
          and ambient pulse. Anything still moving under that flag is functionally required
          (drag tracking, page transitions).
        </p>
      </Section>

      <footer className="ds-foot">
        <div className="ds-foot-tag">Vedute · Design System · v1</div>
        <div className="ds-foot-meta">
          Source: <code>src/pages/mock/styles/mock.css</code> · <code>src/pages/editor/styles/modals.css</code>
        </div>
      </footer>
    </div>
  )
}

const SECTIONS = [
  { id: 'foundations', num: '01', label: 'Foundations' },
  { id: 'typography',  num: '02', label: 'Type' },
  { id: 'pills',       num: '03', label: 'Pills' },
  { id: 'menus',       num: '04', label: 'Menus' },
  { id: 'cards',       num: '05', label: 'Cards' },
  { id: 'queue',       num: '06', label: 'Queue' },
  { id: 'lightbox',    num: '07', label: 'Lightbox' },
  { id: 'chrome',      num: '08', label: 'Chrome' },
  { id: 'motion',      num: '09', label: 'Motion' },
]
