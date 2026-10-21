import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CheckinRecurrenceFields from './CheckinRecurrenceFields'
import { localDateTime, recurrencePayload, type CheckinRecurrence } from './checkinRecurrence'

const value: CheckinRecurrence = { firstPublishAt: '', interval: 2, unit: 'weeks', durationHours: 48, endsAt: '', timezone: 'Asia/Shanghai' }
describe('checkin recurrence editor', () => {
  it('defaults to a single occurrence and enables an independent series', () => {
    const onChange = vi.fn()
    render(<CheckinRecurrenceFields onChange={onChange} />)
    expect(screen.getByRole('radio', { name: '单次打卡' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '周期打卡' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1, unit: 'days', durationHours: 24, firstPublishAt: '' }))
  })
  it('allows returning to a single occurrence without keeping schedule settings', () => {
    const onChange = vi.fn()
    render(<CheckinRecurrenceFields value={value} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: '单次打卡' }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })
  it('uses the save time for an immediate first occurrence and converts weeks to days', () => expect(recurrencePayload(value, new Date('2026-10-21T08:00:00Z'))).toEqual({ firstPublishAt: '2026-10-21T08:00:00.000Z', intervalDays: 14, durationHours: 48, endsAt: null, timezone: 'Asia/Shanghai' }))
  it('round trips local datetime inputs without shifting their actual deadline', () => {
    const original = '2026-10-21T08:00:00Z'
    expect(new Date(localDateTime(original)).toISOString()).toBe(new Date(original).toISOString())
  })
  it('serializes a chosen local publication date to an unambiguous UTC instant', () => {
    const output = recurrencePayload({ ...value, firstPublishAt: '2026-10-21T09:00', endsAt: '2026-10-31T09:00' })
    expect(output.firstPublishAt).toBe(new Date('2026-10-21T09:00').toISOString())
    expect(output.endsAt).toBe(new Date('2026-10-31T09:00').toISOString())
  })
  it.each([{ interval: 0 }, { interval: 53 }, { durationHours: 0 }, { endsAt: '2020-01-01T12:00' }])('blocks invalid series before submitting %j', change => expect(() => recurrencePayload({ ...value, ...change })).toThrow())
})
