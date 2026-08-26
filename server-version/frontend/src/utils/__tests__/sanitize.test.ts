import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../sanitize'

describe('sanitizeHtml', () => {
  it('removes script, event handler, javascript URL, SVG, and style payloads', () => {
    const dirty = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href="javascript:alert(1)">click</a>',
      '<svg onload=alert(1)><circle /></svg>',
      '<style>body{background:url(javascript:alert(1))}</style>',
    ].join('')

    const clean = sanitizeHtml(dirty)

    expect(clean).not.toMatch(/script|onerror|onload|javascript:|<svg|<style/i)
  })

  it('preserves ordinary formatting text', () => {
    expect(sanitizeHtml('<p><strong>安全内容</strong></p>')).toContain('<strong>安全内容</strong>')
  })
})
