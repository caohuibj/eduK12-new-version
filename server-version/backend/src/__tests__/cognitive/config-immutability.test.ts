import { describe, it, expect } from 'vitest'
import { assertConfigCoreMutable } from '../../modules/cognitive/config-immutability'

describe('assertConfigCoreMutable', () => {
  it('allows editing a DRAFT config', () => {
    expect(() => assertConfigCoreMutable('DRAFT')).not.toThrow()
  })

  it('rejects editing a PUBLISHED config (must create new configVersion)', () => {
    expect(() => assertConfigCoreMutable('PUBLISHED')).toThrow()
  })

  it('rejects editing a RETIRED config', () => {
    expect(() => assertConfigCoreMutable('RETIRED')).toThrow()
  })
})
