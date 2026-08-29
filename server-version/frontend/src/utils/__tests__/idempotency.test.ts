import { describe, expect, it } from 'vitest'
import { fingerprintIdempotencyPayload, shouldClearIdempotencyKey } from '../idempotency'

describe('idempotency payload fingerprints', () => {
  it('ignores object key ordering for equivalent payloads', () => {
    expect(fingerprintIdempotencyPayload({ content: 'A', answers: { one: '1', two: '2' } }))
      .toBe(fingerprintIdempotencyPayload({ answers: { two: '2', one: '1' }, content: 'A' }))
  })

  it('changes when a submitted field changes', () => {
    expect(fingerprintIdempotencyPayload({ content: 'A', answers: {} }))
      .not.toBe(fingerprintIdempotencyPayload({ content: 'B', answers: {} }))
  })

  it('clears a key only for definitive client-side rejections', () => {
    expect(shouldClearIdempotencyKey({ status: 400 })).toBe(true)
    expect(shouldClearIdempotencyKey({ status: 409 })).toBe(true)
    expect(shouldClearIdempotencyKey({ status: 500 })).toBe(false)
    expect(shouldClearIdempotencyKey({ status: 408 })).toBe(false)
    expect(shouldClearIdempotencyKey({ status: 429 })).toBe(false)
    expect(shouldClearIdempotencyKey({ message: 'Network Error' })).toBe(false)
  })
})
