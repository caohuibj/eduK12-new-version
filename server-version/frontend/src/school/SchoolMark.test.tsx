import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SchoolHeroMark, SchoolMark } from './SchoolMark'

describe('Huischool original A1 forest identity', () => {
  it('uses the unchanged approved A1 source image rather than the former hand-drawn tree paths', () => {
    const { container } = render(<SchoolMark />)
    expect(screen.getByText('Huischool')).toBeInTheDocument()
    expect(screen.getByText('林间见心 · 校园心理健康')).toBeInTheDocument()
    const logo = container.querySelector('svg.hs-brand-icon')
    expect(logo).toHaveAttribute('viewBox', '51 70 273 197')
    expect(logo).toHaveAttribute('aria-hidden', 'true')
    const source = logo?.querySelector('image')
    expect(source?.getAttribute('href')).toContain('huischool-a1-source.png')
    expect(source).toHaveAttribute('width', '1180')
    expect(source).toHaveAttribute('height', '470')
    // All branches and greenery remain the original pixels. There must be
    // no replacement polygon/path drawing inside the approved product mark.
    expect(logo?.querySelector('path, rect, circle, polygon')).toBeNull()
  })

  it('reuses that exact image in the hero without exposing the B3/W2 panels', () => {
    const { container } = render(<><SchoolMark /><SchoolHeroMark /></>)
    const images = [...container.querySelectorAll('svg image')]
    expect(images).toHaveLength(2)
    expect(images[0]?.getAttribute('href')).toEqual(images[1]?.getAttribute('href'))
    expect(container.querySelector('.hs-hero-brand-art')).toHaveAttribute('aria-hidden', 'true')
    // The SVG crop ends before the next logo begins at source x=409.
    expect(container.querySelector('svg.hs-hero-brand-icon')).toHaveAttribute(
      'viewBox', '51 70 273 197',
    )
  })
})
