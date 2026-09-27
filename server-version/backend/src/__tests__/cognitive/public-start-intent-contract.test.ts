import { describe, expect, it } from 'vitest'
import { cognitivePublicStartSchema } from '../../modules/cognitive/cognitive.schema'

describe('anonymous Cognitive HTTP START intent boundary', () => {
  it('requires a persisted retry secret for new admission', () => {
    expect(cognitivePublicStartSchema.safeParse({}).success).toBe(false)
    expect(cognitivePublicStartSchema.safeParse({ startIntent: 'A'.repeat(43) }).success).toBe(true)
    expect(cognitivePublicStartSchema.safeParse({ startIntent: 'short' }).success).toBe(false)
    expect(cognitivePublicStartSchema.safeParse({ startIntent: 'A'.repeat(44) }).success).toBe(false)
    expect(cognitivePublicStartSchema.safeParse({ startIntent: '+'.repeat(43) }).success).toBe(false)
  })
  it('keeps existing recovery credentials but rejects ambiguous credentials', () => {
    const recoveryToken = 'recovery-token-1234567890'
    expect(cognitivePublicStartSchema.safeParse({ recoveryToken }).success).toBe(true)
    expect(cognitivePublicStartSchema.safeParse({ recoveryToken, startIntent: 'A'.repeat(43) }).success).toBe(false)
  })
})
