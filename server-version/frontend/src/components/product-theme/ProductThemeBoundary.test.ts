import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Read source bytes like the existing ScaleEdit contrast contract; Vitest stubs CSS imports.
const schoolCss = readFileSync('src/school/school-theme.css', 'utf8')
const teacherCss = readFileSync('src/huiteacher/huiteacher-theme.css', 'utf8')

const guard = ':not([data-cognitive-task-root],[data-cognitive-task-root] *)'
function selectors(css: string) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map(match => match[1].trim())
}
describe('product appearance never recolors scientific task controls', () => {
  it.each([['hs',schoolCss],['ht',teacherCss]])('%s guards every dark descendant rule including focus and placeholder', (prefix, css) => {
    const descendants=selectors(css).filter(selector => selector.startsWith(`.${prefix}-app[data-theme=dark] `))
    expect(descendants.length).toBeGreaterThan(20)
    for (const selector of descendants) expect(selector, selector).toContain(guard)
    for (const selector of descendants.filter(value=>value.includes('::placeholder'))) {
      expect(selector).toContain(`${guard}::placeholder`)
    }
  })
  it('excludes actual Stroop and DigitSpan secondary buttons while retaining the Teacher shell adapter', () => {
    const selector=selectors(teacherCss).find(value=>value.includes(':is(.btn-secondary,.ht-register-entry)'))!
    expect(selector).toBeTruthy()
    const app=document.createElement('div'); app.className='ht-app'; app.dataset.theme='dark'
    app.innerHTML='<button class="btn-secondary" data-shell></button><div data-cognitive-task-root><button class="btn-secondary" data-stroop></button><button class="btn-secondary" data-digitspan></button><input class="input" placeholder="answer"></div>'
    document.body.append(app)
    try {
      expect(app.querySelector('[data-shell]')!.matches(selector)).toBe(true)
      expect(app.querySelector('[data-stroop]')!.matches(selector)).toBe(false)
      expect(app.querySelector('[data-digitspan]')!.matches(selector)).toBe(false)
      const inputSelector=selectors(teacherCss).find(value=>value.includes('.ht-field input'))!
      expect(app.querySelector('input')!.matches(inputSelector)).toBe(false)
    } finally { app.remove() }
  })
})
