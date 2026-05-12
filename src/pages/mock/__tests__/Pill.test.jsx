import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Pill from '../components/Pill'

describe('Pill', () => {
  it('renders a button with the children as the label', () => {
    render(<Pill>Save</Pill>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
  })

  it('attaches `mock-pill` and the `is-active` class only when active', () => {
    const { rerender, container } = render(<Pill>Off</Pill>)
    expect(container.querySelector('.mock-pill')).toBeDefined()
    expect(container.querySelector('.mock-pill.is-active')).toBe(null)
    rerender(<Pill active>On</Pill>)
    expect(container.querySelector('.mock-pill.is-active')).toBeDefined()
  })

  it('appends the className prop without losing mock-pill', () => {
    const { container } = render(<Pill className="extra">Pill</Pill>)
    const el = container.querySelector('button')
    expect(el.className).toContain('mock-pill')
    expect(el.className).toContain('extra')
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(<Pill onClick={onClick}>Click</Pill>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the icon span only when icon is provided', () => {
    const { rerender, container } = render(<Pill>Plain</Pill>)
    expect(container.querySelector('.mock-pill-icon')).toBe(null)
    rerender(<Pill icon={<svg data-testid="icon" />}>With icon</Pill>)
    expect(container.querySelector('.mock-pill-icon')).toBeDefined()
    expect(container.querySelector('[data-testid=icon]')).toBeDefined()
  })

  it("uses type=button (not the form-default 'submit')", () => {
    // Without an explicit type, a <button> inside a form submits it on
    // Enter. Pill has type=button so e.g. the search input on the same
    // row doesn't accidentally submit if the user hits Enter.
    render(<Pill>P</Pill>)
    expect(screen.getByRole('button').getAttribute('type')).toBe('button')
  })

  it('forwards arbitrary props (aria-label, title, data-*)', () => {
    render(
      <Pill aria-label="Toggle clouds" title="hover hint" data-testid="x">
        Clouds
      </Pill>,
    )
    const el = screen.getByLabelText('Toggle clouds')
    expect(el.getAttribute('title')).toBe('hover hint')
    expect(el.getAttribute('data-testid')).toBe('x')
  })

  it('forwards innerRef to the button', () => {
    const ref = { current: null }
    render(<Pill innerRef={ref}>R</Pill>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  // Two-slot LABEL VALUE pattern (MoMA prototype). Both props must be
  // passed for the two-slot recipe to activate; passing only one
  // falls back to the single-slot path so unmigrated call sites stay
  // stable.
  describe('two-slot label/value', () => {
    it('emits label + value spans when both props are passed', () => {
      const { container } = render(<Pill label="Aspect" value="3:4" />)
      expect(container.querySelector('.mock-pill-label')?.textContent).toBe('Aspect')
      expect(container.querySelector('.mock-pill-value')?.textContent).toBe('3:4')
    })

    it('falls back to single-slot when only label is passed', () => {
      const { container } = render(<Pill label="Save" />)
      expect(container.querySelector('.mock-pill-value')).toBe(null)
      expect(container.querySelector('.mock-pill-label')?.textContent).toBe('Save')
    })

    it('value-only (no label, no children) renders just the value span', () => {
      // Matches the prototype's search pill: icon + value, no label.
      const { container } = render(<Pill value="New York, NY" />)
      expect(container.querySelector('.mock-pill-label')).toBe(null)
      expect(container.querySelector('.mock-pill-value')?.textContent).toBe('New York, NY')
    })

    it('value + children: value takes precedence (single-value pattern)', () => {
      // When a caller passes both `value` (new API) and `children`
      // (legacy API), value-only wins — it's the more explicit signal.
      const { container } = render(<Pill value="42">Foo</Pill>)
      expect(container.querySelector('.mock-pill-value')?.textContent).toBe('42')
      expect(container.querySelector('.mock-pill-label')).toBe(null)
    })
  })
})
