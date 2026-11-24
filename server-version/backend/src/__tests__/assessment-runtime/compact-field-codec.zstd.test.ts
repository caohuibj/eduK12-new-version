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

  it('defaults to ekc1:zs: on Node 24 zstd, supports explicit gzip opt-out, and decrypts both seamlessly', () => {
    const sample = {
      schemaVersion: 1,
      units: Array.from({ length: 9 }, (_, u) => ({
        key: `scale_${u}`,
        scores: Array.from({ length: 6 }, (_, d) => ({ key: `dim_${d}`, value: 3.5 + d * 0.1, label: '维度描述' })),
      })),
    }

    const defaultZsCipher = encryptCompactField(sample)
    expect(defaultZsCipher.startsWith('ekc1:zs:')).toBe(true)

    process.env.ASSESSMENT_COMPACT_CODEC = 'gzip'
    const gzCipher = encryptCompactField(sample)
    expect(gzCipher.startsWith('ekc1:gz:')).toBe(true)
    expect(defaultZsCipher.length).toBeLessThan(gzCipher.length)

    // Plaintext byte length in slot 4 remains exact for SQL storedScaleFieldSizeSql
    const plainBytes = Buffer.byteLength(JSON.stringify(sample), 'utf8')
    expect(Number(defaultZsCipher.split(':')[3])).toBe(plainBytes)

    // Switching codecs still reads both zstd and gzip ciphers seamlessly
    expect(decryptCompactField(defaultZsCipher)).toEqual(sample)
    delete process.env.ASSESSMENT_COMPACT_CODEC
    expect(decryptCompactField(gzCipher)).toEqual(sample)
    expect(decryptCompactField(defaultZsCipher)).toEqual(sample)

    // Tampered codec header fails AAD authentication
    expect(() => decryptCompactField(defaultZsCipher.replace(':zs:', ':gz:'))).toThrow()
    expect(() => decryptCompactField(defaultZsCipher.replace(':zs:', ':js:'))).toThrow()
  })
})
