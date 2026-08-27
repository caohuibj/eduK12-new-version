import { describe, expect, it } from 'vitest'
import {
  contextOptionsForKey,
  contextValueHint,
  parseDelimitedOptions,
  serializeDelimitedOptions,
} from './options'

describe('assessment context editor options', () => {
  it('provides canonical values for context-bound choice fields', () => {
    expect(contextOptionsForKey('sexAtBirth')).toEqual(expect.arrayContaining([
      { value: 'female', label: '女' },
      { value: 'not_disclosed', label: '不愿透露' },
    ]))
    expect(contextOptionsForKey('gradeLevel').map((option) => option.value)).toEqual(expect.arrayContaining(['K', '1', '12', 'other', 'not_disclosed']))
    expect(contextValueHint('primaryLanguage')).toContain('BCP 47')
  })

  it('round-trips compact value=label syntax without losing semantic values', () => {
    const options = parseDelimitedOptions('female=女,male=男,free text')
    expect(options).toEqual([
      { value: 'female', label: '女' },
      { value: 'male', label: '男' },
      { value: 'free text', label: 'free text' },
    ])
    expect(serializeDelimitedOptions(options)).toBe('female=女,male=男,free text=free text')
  })
})
