import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ViewfinderBrackets from '../components/ViewfinderBrackets'

describe('ViewfinderBrackets', () => {
  it('renders the four L-shaped corner brackets', () => {
    const { container } = render(<ViewfinderBrackets />)
    const brackets = container.querySelectorAll('.mock-vf-bracket')
    expect(brackets.length).toBe(4)
    // One per corner — class checks pin the positioning modifier so
    // a future regression that drops the --tr or --br variant doesn't
    // silently leave the viewport asymmetric.
    expect(container.querySelector('.mock-vf-bracket--tl')).not.toBe(null)
    expect(container.querySelector('.mock-vf-bracket--tr')).not.toBe(null)
    expect(container.querySelector('.mock-vf-bracket--bl')).not.toBe(null)
    expect(container.querySelector('.mock-vf-bracket--br')).not.toBe(null)
  })

  it('marks the brackets aria-hidden so screen readers skip them', () => {
    const { container } = render(<ViewfinderBrackets />)
    for (const node of container.querySelectorAll('.mock-vf-bracket')) {
      expect(node.getAttribute('aria-hidden')).toBe('true')
    }
  })
})
