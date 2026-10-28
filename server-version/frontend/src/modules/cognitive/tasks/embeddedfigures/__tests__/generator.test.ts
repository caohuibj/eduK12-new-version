import { describe, expect, it } from 'vitest'
import { EMBEDDEDFIGURES_BANK_SIZE, EMBEDDEDFIGURES_FROZEN_BANK, EMBEDDEDFIGURES_FIELD_SHAPES, embeddedfiguresItem } from '../generator'

describe('embeddedfigures generator', () => {
  it('serves frozen bank items for the first trials regardless of seed', () => {
    const a = embeddedfiguresItem('seed-a', 0)
    const b = embeddedfiguresItem('seed-b', 0)
    expect(a).toEqual(b)
    expect(EMBEDDEDFIGURES_FROZEN_BANK).toHaveLength(EMBEDDEDFIGURES_BANK_SIZE)
  })

  it('generates seed-stable fields with exactly one triangle target after the bank', () => {
    const item = embeddedfiguresItem('seed-1', 10)
    expect(item.field).toHaveLength(EMBEDDEDFIGURES_FIELD_SHAPES)
    const triangles = item.field.filter((poly) => poly.family === 'triangle')
    expect(triangles).toHaveLength(1)
    expect(triangles[0].id).toBe(item.targetId)
    expect(new Set(item.field.map((poly) => poly.id)).size).toBe(EMBEDDEDFIGURES_FIELD_SHAPES)
  })

  it('differs across seeds for generated items', () => {
    expect(embeddedfiguresItem('seed-a', 12)).not.toEqual(embeddedfiguresItem('seed-b', 12))
  })

  it('keeps every frozen item target inside its own field', () => {
    for (const item of EMBEDDEDFIGURES_FROZEN_BANK) {
      expect(item.field.some((poly) => poly.id === item.targetId)).toBe(true)
      const target = item.field.find((poly) => poly.id === item.targetId)!
      expect(target.family).toBe('triangle')
    }
  })
})
