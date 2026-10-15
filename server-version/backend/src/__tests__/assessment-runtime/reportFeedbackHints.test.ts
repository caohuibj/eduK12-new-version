import { describe, expect, it } from 'vitest'
import { readWholeReportFeedbackHint, rememberWholeReportFeedbackHint } from '../../services/reportFeedbackHints'
describe('advisory bounded whole-report feedback hints', () => {
  it('grants fast pacing only to a first durable task and binds it to the submission', () => {
    expect(rememberWholeReportFeedbackHint('one', 'receipt-one', 1, 1000)).toEqual({ profile: 'FAST_START', retryAfterSeconds: 0.25 })
    expect(readWholeReportFeedbackHint('one', 'different-receipt', 1000).profile).toBe('QUEUED')
    expect(rememberWholeReportFeedbackHint('two', 'receipt-two', 2, 1000)).toEqual({ profile: 'QUEUED', retryAfterSeconds: 2 })
  })
  it('falls back when hints expire or are missing, while the durable receipt remains independently valid', () => {
    rememberWholeReportFeedbackHint('expires', 'receipt', 1, 1000)
    expect(readWholeReportFeedbackHint('expires', 'receipt', 6000).profile).toBe('QUEUED')
    expect(readWholeReportFeedbackHint('not-in-this-process', 'receipt', 1000).profile).toBe('QUEUED')
  })
  it('caps transient hint memory by evicting old pacing hints', () => {
    for (let i = 0; i < 129; i++) rememberWholeReportFeedbackHint('bounded-' + i, 'receipt-' + i, 1, 1000)
    expect(readWholeReportFeedbackHint('bounded-0', 'receipt-0', 1000).profile).toBe('QUEUED')
    expect(readWholeReportFeedbackHint('bounded-128', 'receipt-128', 1000).profile).toBe('FAST_START')
  })
})
