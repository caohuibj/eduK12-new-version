import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const css = readFileSync('src/pages/ScaleEdit.css', 'utf8')

// Static CSS/contrast contract only. Real Chromium/axe remains the visual gate.
const luminance = (hex: string) => {
  const linear = [0, 2, 4].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return linear.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
}
const contrast = (foreground: string, background: string) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
  return (values[1] + 0.05) / (values[0] + 0.05)
}

describe('Scale editor header contrast contract', () => {
  it('scopes the correction to the native Training teacher scale header', () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
      .filter(([, selector]) => selector.includes('.hui-page-header__description'))
    expect(rules).toHaveLength(1)
    const selector = rules[0][1].replace(/\/\*[\s\S]*?\*\//g, '').trim()
    expect(selector).toBe('.hui-training.hui-app--teacher.training-workspace-shell.training-teacher-visual .scale-edit-page .hui-page-header__description')
    expect(rules[0][2].trim()).toBe('color: #53675d;')
  })

  it('exceeds 5:1 on the observed paper background and white surface', () => {
    expect(contrast('66756c', 'f8f5ee')).toBeLessThan(4.5)
    expect(contrast('53675d', 'f8f5ee')).toBeGreaterThan(5)
    expect(contrast('53675d', 'ffffff')).toBeGreaterThan(5)
  })
})
