import { describe, expect, it } from 'vitest'
import { dueCheckinSlot } from '../../services/checkinScheduleTiming'

const first = new Date('2026-10-21T09:00:00Z')
const at = (value: string) => new Date(value)
describe('checkin recurrence timing', () => {
  it('does not publish before the first time', () => expect(dueCheckinSlot(first, first, 1, 24, null, at('2026-10-21T08:59:59Z'))).toBeNull())
  it('publishes at the exact boundary and advances one day', () => expect(dueCheckinSlot(first, first, 1, 24, null, first)).toEqual({ publishAt: first, nextPublishAt: at('2026-10-22T09:00:00Z') }))
  it('does not repeat a slot when the cursor has advanced', () => expect(dueCheckinSlot(first, at('2026-10-22T09:00:00Z'), 1, 24, null, first)).toBeNull())
  it('recovers only the latest nonexpired slot instead of flooding missed days', () => expect(dueCheckinSlot(first, first, 1, 24, null, at('2026-10-26T10:00:00Z'))).toEqual({ publishAt: at('2026-10-26T09:00:00Z'), nextPublishAt: at('2026-10-27T09:00:00Z') }))
  it('skips an already expired latest occurrence but advances the cursor', () => expect(dueCheckinSlot(first, first, 1, 1, null, at('2026-10-26T10:00:00Z'))).toEqual({ publishAt: null, nextPublishAt: at('2026-10-27T09:00:00Z') }))
  it('includes an occurrence at the configured end boundary and then stops', () => expect(dueCheckinSlot(first, first, 1, 24, at('2026-10-22T09:00:00Z'), at('2026-10-22T09:00:00Z'))).toEqual({ publishAt: at('2026-10-22T09:00:00Z'), nextPublishAt: null }))
  it('can recover the final valid occurrence after the publication window closes', () => expect(dueCheckinSlot(first, first, 1, 48, at('2026-10-22T10:00:00Z'), at('2026-10-23T09:00:00Z'))).toEqual({ publishAt: at('2026-10-22T09:00:00Z'), nextPublishAt: null }))
  it('does not create old expired occurrences after the series ends', () => expect(dueCheckinSlot(first, first, 7, 24, first, at('2026-11-01T09:00:00Z'))).toEqual({ publishAt: null, nextPublishAt: null }))
})
