import { describe, expect, it } from 'vitest'
import {
  assertExportLimits,
  EXPORT_MAX_BYTES,
  EXPORT_MAX_FIELDS,
  EXPORT_MAX_RECORDS,
  EXPORT_MAX_TRIALS,
} from '../services/exportStorage'

describe('export storage limits', () => {
  it.each([
    ['records', { records: EXPORT_MAX_RECORDS + 1 }],
    ['trials', { trials: EXPORT_MAX_TRIALS + 1 }],
    ['fields', { fields: EXPORT_MAX_FIELDS + 1 }],
    ['bytes', { bytes: EXPORT_MAX_BYTES + 1 }],
  ])('rejects oversized %s exports with HTTP 413', (_kind, input) => {
    let thrown: unknown
    try {
      assertExportLimits(input)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({ statusCode: 413 })
  })

  it('accepts an export at every configured boundary', () => {
    expect(() => assertExportLimits({
      records: EXPORT_MAX_RECORDS,
      trials: EXPORT_MAX_TRIALS,
      fields: EXPORT_MAX_FIELDS,
      bytes: EXPORT_MAX_BYTES,
    })).not.toThrow()
  })
})
