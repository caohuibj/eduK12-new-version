import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LocalDateTimeInput, { localDateTimeValue, parseLocalDateTime } from '../LocalDateTimeInput'

describe('explicit local date-time input', () => {
  it('rejects rolled-over dates, incomplete entries and out-of-range time', () => {
    for (const value of ['2026-02-31 12:30', '2026-02-29T09:00', '2026-10-14T24:00', '2026-10-14T12:60', '2026-10', 'tomorrow']) expect(parseLocalDateTime(value)).toBeNull()
    expect(parseLocalDateTime('2028-02-29 23:59')).not.toBeNull()
  })
  it('preserves a local minute and round-trips its UTC storage value', () => {
    const local = '2026-10-14T23:59'
    expect(localDateTimeValue(parseLocalDateTime(local)!.toISOString())).toBe(local)
    expect(localDateTimeValue('2026-10')).toBe('2026-10')
  })
  it('allows partial typing without coercing it to another date and marks invalid input', () => {
    function Fixture() { const [value, setValue] = useState(''); return <label>截止时间<LocalDateTimeInput value={value} onChange={event => setValue(event.target.value)} /></label> }
    render(<Fixture />)
    const input = screen.getByLabelText('截止时间')
    fireEvent.change(input, { target: { value: '2026-10' } })
    expect(input).toHaveValue('2026-10')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input, { target: { value: '2026-10-14 23:59' } })
    expect(input).toHaveValue('2026-10-14 23:59')
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })
})
