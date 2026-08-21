import { describe, expect, it } from 'vitest'
import {
  addCompositeItemSchema,
  compositeExportRequestSchema,
  compositeSaveSchema,
  compositeScaleAnswerSchema,
  compositeFormAnswerSchema,
  createCompositeSchema,
  createCompositeTokenSchema,
  publicRecoverySchema,
} from '../../modules/composite/composite.schema'

describe('composite assessment schemas', () => {
  it('accepts scale, cognitive and form modules with strict fields', () => {
    expect(addCompositeItemSchema.parse({ type: 'SCALE', scaleId: 'scale-1' }).required).toBe(true)
    expect(addCompositeItemSchema.parse({ type: 'COGNITIVE', cognitiveAssignmentId: 'assignment-1' }).type).toBe('COGNITIVE')
    expect(addCompositeItemSchema.parse({
      type: 'FORM',
      formType: 'single_choice',
      formLabel: '年级',
      formOptions: [{ value: '3', label: '三年级' }],
    }).formType).toBe('single_choice')
    expect(() => addCompositeItemSchema.parse({ type: 'FORM', formType: 'single_choice', formLabel: '年级' })).toThrow()
    expect(() => addCompositeItemSchema.parse({ type: 'SCALE', scaleId: 'scale-1', userId: 'student-1' })).toThrow()
  })

  it('requires a valid time window for public templates and tokens', () => {
    expect(() => createCompositeSchema.parse({
      code: 'COMPOSITE-1',
      name: '综合测评',
      publicEnabled: true,
    })).not.toThrow()
    expect(() => createCompositeTokenSchema.parse({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: 10,
    })).not.toThrow()
    expect(() => createCompositeTokenSchema.parse({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: -1,
    })).toThrow()
  })

  it('keeps recovery credentials out of strict read/export query shapes', () => {
    expect(publicRecoverySchema.parse({ recoveryToken: 'a'.repeat(24) }).recoveryToken).toHaveLength(24)
    expect(() => publicRecoverySchema.parse({ recoveryToken: 'a'.repeat(24), attemptId: 'attempt-1' })).toThrow()
    expect(compositeExportRequestSchema.parse({ detail: 'full', format: 'csv' }).anonymize).toBe(true)
  })

  it('allows an empty form draft but requires both draft fields together', () => {
    expect(compositeSaveSchema.parse({ itemId: 'form-1', value: '' })).toEqual({ itemId: 'form-1', value: '' })
    expect(compositeSaveSchema.parse({})).toEqual({})
    expect(() => compositeSaveSchema.parse({ itemId: 'form-1' })).toThrow()
    expect(() => compositeSaveSchema.parse({ value: 'draft' })).toThrow()
  })

  it('bounds submitted answers and validates scale values', () => {
    expect(() => compositeScaleAnswerSchema.parse({ itemId: 'question-1', value: 1.5 })).toThrow()
    expect(() => compositeFormAnswerSchema.parse({ itemId: 'form-1', value: 'x'.repeat(10001) })).toThrow()
  })
})
