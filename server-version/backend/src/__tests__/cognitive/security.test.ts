import { describe, it, expect, beforeAll } from 'vitest'
import {
  encryptCognitivePayload,
  decryptCognitivePayload,
  getParticipantKey,
  hashTrialPayload,
  canonicalJson,
} from '../../modules/cognitive/cognitive.security'

// 64 hex 占位密钥（仅测试用）
const ENC = 'a'.repeat(64)
const PSEUDO = 'b'.repeat(64)

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = ENC
  process.env.DATA_PSEUDONYM_KEY = PSEUDO
})

describe('cognitive.security — strict envelope', () => {
  it('round-trips a numeric score and never stores plaintext', () => {
    const enc = encryptCognitivePayload(75)
    // 密文为 iv:authTag:data 三段 hex 格式，且不等于明文 JSON（值已被加密）
    expect(enc.split(':')).toHaveLength(3)
    expect(enc).not.toBe(JSON.stringify({ version: 1, value: 75 }))
    expect(decryptCognitivePayload<number>(enc)).toBe(75)
  })

  it('round-trips an object payload (metrics / qualityFlags)', () => {
    const metrics = { accuracy: 0.9, medianRt: 423 }
    const enc = encryptCognitivePayload(metrics)
    expect(decryptCognitivePayload<typeof metrics>(enc)).toEqual(metrics)
  })

  it('strict decrypt rejects plaintext JSON (no safeDecrypt fallback)', () => {
    expect(() => decryptCognitivePayload('{"foo":1}')).toThrow()
    expect(() => decryptCognitivePayload('plaintext-not-encrypted')).toThrow()
  })
})

describe('cognitive.security — participantKey (independent pseudonym key)', () => {
  it('is stable for the same user', () => {
    expect(getParticipantKey('user-1')).toBe(getParticipantKey('user-1'))
  })

  it('differs across users', () => {
    expect(getParticipantKey('user-1')).not.toBe(getParticipantKey('user-2'))
  })

  it('does not expose the userId and is a 64-hex HMAC', () => {
    const key = getParticipantKey('user-1')
    expect(key).not.toContain('user-1')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('cognitive.security — hashTrialPayload (keyed HMAC, canonical)', () => {
  it('is stable for identical payloads', () => {
    expect(hashTrialPayload({ a: 1, b: 2 })).toBe(hashTrialPayload({ a: 1, b: 2 }))
  })

  it('is order-independent (canonical JSON)', () => {
    expect(hashTrialPayload({ a: 1, b: 2 })).toBe(hashTrialPayload({ b: 2, a: 1 }))
  })

  it('changes when payload changes', () => {
    expect(hashTrialPayload({ a: 1 })).not.toBe(hashTrialPayload({ a: 2 }))
  })
})

describe('cognitive.security — canonicalJson', () => {
  it('sorts object keys', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })
})

describe('cognitive.security — key hex validation', () => {
  // 仅校验长度不足以排除非 hex 字符（如 64 个 'z'），必须强制 64 hex 校验。
  afterEach(() => {
    // 还原 beforeAll 设定的有效密钥，避免污染其他用例
    process.env.DATA_ENCRYPTION_KEY = ENC
    process.env.DATA_PSEUDONYM_KEY = PSEUDO
  })

  it('accepts a 64-char hex key (no throw, round-trips)', () => {
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    expect(() => getParticipantKey('u')).not.toThrow()
    expect(() => hashTrialPayload({ x: 1 })).not.toThrow()
  })

  it('rejects a 63-char hex key', () => {
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(63)
    expect(() => getParticipantKey('u')).toThrow(/DATA_PSEUDONYM_KEY/)
  })

  it('rejects a 65-char hex key', () => {
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(65)
    expect(() => getParticipantKey('u')).toThrow(/DATA_PSEUDONYM_KEY/)
  })

  it('rejects a 64-char non-hex key (e.g. all "z")', () => {
    process.env.DATA_PSEUDONYM_KEY = 'z'.repeat(64)
    expect(() => getParticipantKey('u')).toThrow(/DATA_PSEUDONYM_KEY/)
  })

  it('rejects a 64-char non-hex DATA_ENCRYPTION_KEY (integrity key)', () => {
    process.env.DATA_ENCRYPTION_KEY = 'z'.repeat(64)
    expect(() => hashTrialPayload({ x: 1 })).toThrow(/DATA_ENCRYPTION_KEY/)
  })
})
