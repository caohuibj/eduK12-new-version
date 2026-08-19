import { describe, it, expect } from 'vitest'
import {
  assertConfigCoreMutable,
  assertConfigStatusTransition,
} from '../../modules/cognitive/config-immutability'

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

describe('assertConfigStatusTransition', () => {
  it('allows DRAFT -> PUBLISHED', () => {
    expect(() => assertConfigStatusTransition('DRAFT', 'PUBLISHED')).not.toThrow()
  })

  it('allows PUBLISHED -> RETIRED', () => {
    expect(() => assertConfigStatusTransition('PUBLISHED', 'RETIRED')).not.toThrow()
  })

  it('rejects DRAFT -> RETIRED', () => {
    expect(() => assertConfigStatusTransition('DRAFT', 'RETIRED')).toThrow()
  })

  it('rejects PUBLISHED -> DRAFT', () => {
    expect(() => assertConfigStatusTransition('PUBLISHED', 'DRAFT')).toThrow()
  })

  it('rejects RETIRED -> DRAFT', () => {
    expect(() => assertConfigStatusTransition('RETIRED', 'DRAFT')).toThrow()
  })

  it('rejects RETIRED -> PUBLISHED', () => {
    expect(() => assertConfigStatusTransition('RETIRED', 'PUBLISHED')).toThrow()
  })

  it('rejects same-status as a non-transition', () => {
    expect(() => assertConfigStatusTransition('DRAFT', 'DRAFT')).toThrow()
    expect(() => assertConfigStatusTransition('PUBLISHED', 'PUBLISHED')).toThrow()
  })
})
