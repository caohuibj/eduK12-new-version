import { describe, expect, it } from 'vitest'
import { sizecongruityConfigSchema } from '../../modules/cognitive/schemas/sizecongruity.config'
import { sizecongruityTrialSchema } from '../../modules/cognitive/schemas/sizecongruity.trial'

const config = {
  totalTrials: 40,
  congruentRatio: 0.5,
  minDigit: 1,
  maxDigit: 9,
  minGap: 2,
  fontLargeRem: 2.8,
  fontSmallRem: 1.3,
  fixationMs: 500,
  timeoutMs: 3000,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('sizecongruity schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(sizecongruityConfigSchema.safeParse(config).success).toBe(true)
    expect(sizecongruityTrialSchema.safeParse({
      leftDigit: 7,
      rightDigit: 3,
      leftFontScale: 'small',
      rightFontScale: 'large',
      response: 'left',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects unbalanced conditions, equal digits and client-derived fields', () => {
    expect(sizecongruityConfigSchema.safeParse({ ...config, congruentRatio: 0 }).success).toBe(false)
    expect(sizecongruityConfigSchema.safeParse({ ...config, minGap: 0 }).success).toBe(false)
    expect(sizecongruityTrialSchema.safeParse({
      leftDigit: 5,
      rightDigit: 5,
      leftFontScale: 'small',
      rightFontScale: 'large',
      response: 'left',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(sizecongruityTrialSchema.safeParse({
      leftDigit: 7,
      rightDigit: 3,
      leftFontScale: 'small',
      rightFontScale: 'large',
      response: 'left',
      rtMs: 312,
      interrupted: false,
      isCongruent: true,
    }).success).toBe(false)
  })

  it('uses response/rt null together for timeout facts', () => {
    expect(sizecongruityTrialSchema.safeParse({
      leftDigit: 7,
      rightDigit: 3,
      leftFontScale: 'small',
      rightFontScale: 'large',
      response: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(sizecongruityTrialSchema.safeParse({
      leftDigit: 7,
      rightDigit: 3,
      leftFontScale: 'small',
      rightFontScale: 'large',
      response: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
