import { describe, expect, it } from 'vitest'
import { sanitizeHtml, sanitizeText } from '../sanitize'

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

describe('shared sanitization boundary after the DOMPurify security patch', () => {
  it.each([
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    '<svg><a xlink:href="javascript:alert(1)"><animate attributeName="href" values="javascript:alert(1)"/></a></svg>',
    '<a href="java&#x09;script:alert(1)" onclick="alert(1)">link</a><iframe srcdoc="<script>alert(1)</script>"></iframe>',
  ])('keeps alternate parser forms inert when the sanitized string reaches innerHTML: %s', payload => {
    const container = document.createElement('div')
    container.innerHTML = sanitizeHtml(payload)
    expect(container.querySelector('script,style,svg,math,img,iframe,object,embed')).toBeNull()
    for (const element of container.querySelectorAll('*')) {
      expect([...element.attributes].some(attribute => /^on/i.test(attribute.name))).toBe(false)
      if (element.hasAttribute('href')) expect(element.getAttribute('href')).toMatch(/^https:\/\//i)
    }
  })
  it('preserves normal headings, lists, emphasis and HTTPS links at the actual HTML sink', () => {
    const container = document.createElement('div')
    container.innerHTML = sanitizeHtml('<h2>Heading</h2><ul><li><strong>Text</strong></li></ul><a href="https://example.org/path">Resource</a>')
    expect(container.querySelector('h2')).toHaveTextContent('Heading')
    expect(container.querySelector('li strong')).toHaveTextContent('Text')
    expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.org/path')
  })
  it('keeps chart text free of active markup and handles absent input consistently', () => {
    const container = document.createElement('div')
    container.innerHTML = sanitizeText('<strong>Count &amp; total</strong><img src=x onerror=alert(1)>')
    expect(container.querySelector('*')).toBeNull()
    expect(container.textContent).toBe('Count & total')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeText(null)).toBe('')
  })
})
