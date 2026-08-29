import { describe, expect, it } from 'vitest'
import { fingerprintIdempotencyPayload } from '../idempotency'

describe('idempotency payload fingerprints', () => {
  it('ignores object key ordering for equivalent payloads', () => {
    expect(fingerprintIdempotencyPayload({ content: 'A', answers: { one: '1', two: '2' } }))
      .toBe(fingerprintIdempotencyPayload({ answers: { two: '2', one: '1' }, content: 'A' }))
  })

  it('changes when a submitted field changes', () => {
    expect(fingerprintIdempotencyPayload({ content: 'A', answers: {} }))
      .not.toBe(fingerprintIdempotencyPayload({ content: 'B', answers: {} }))
  })
})
