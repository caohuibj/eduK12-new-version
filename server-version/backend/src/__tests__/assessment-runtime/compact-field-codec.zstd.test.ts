import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptCompactField, encryptCompactField } from '../../modules/assessment-runtime/compact-field-codec'

const oldKey = process.env.DATA_ENCRYPTION_KEY
const oldCodec = process.env.ASSESSMENT_COMPACT_CODEC

describe('compact-field-codec zstd and high-ratio gzip support', () => {
  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    delete process.env.ASSESSMENT_COMPACT_CODEC
  })

  afterEach(() => {
    if (oldKey === undefined) delete process.env.DATA_ENCRYPTION_KEY
    else process.env.DATA_ENCRYPTION_KEY = oldKey
    if (oldCodec === undefined) delete process.env.ASSESSMENT_COMPACT_CODEC
    else process.env.ASSESSMENT_COMPACT_CODEC = oldCodec
  })

  it('emits ekc1:zs: when ASSESSMENT_COMPACT_CODEC=zstd and decrypts cleanly regardless of active write codec', () => {
    const sample = {
      schemaVersion: 1,
      units: Array.from({ length: 9 }, (_, u) => ({
        key: `scale_${u}`,
        scores: Array.from({ length: 6 }, (_, d) => ({ key: `dim_${d}`, value: 3.5 + d * 0.1, label: '维度描述' })),
      })),
    }

    const gzCipher = encryptCompactField(sample)
    expect(gzCipher.startsWith('ekc1:gz:')).toBe(true)

    process.env.ASSESSMENT_COMPACT_CODEC = 'zstd'
    const zsCipher = encryptCompactField(sample)
    expect(zsCipher.startsWith('ekc1:zs:')).toBe(true)
    expect(zsCipher.length).toBeLessThan(gzCipher.length)

    // Plaintext byte length in slot 4 remains exact for SQL storedScaleFieldSizeSql
    const plainBytes = Buffer.byteLength(JSON.stringify(sample), 'utf8')
    expect(Number(zsCipher.split(':')[3])).toBe(plainBytes)

    // Switching back to default gzip writer still reads zstd cipher seamlessly
    delete process.env.ASSESSMENT_COMPACT_CODEC
    expect(decryptCompactField(zsCipher)).toEqual(sample)
    expect(decryptCompactField(gzCipher)).toEqual(sample)

    // Tampered codec header fails AAD authentication
    expect(() => decryptCompactField(zsCipher.replace(':zs:', ':gz:'))).toThrow()
    expect(() => decryptCompactField(zsCipher.replace(':zs:', ':js:'))).toThrow()
  })
})
