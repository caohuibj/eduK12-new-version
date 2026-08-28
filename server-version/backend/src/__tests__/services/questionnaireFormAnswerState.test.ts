import { describe, expect, it } from 'vitest'
import { QuestionnaireFormAnswerStatus } from '@prisma/client'
import {
  answerStatus,
  isFormAnswerComplete,
  isFormAnswerRequiredComplete,
} from '../../services/questionnaireFormAnswerState'

describe('questionnaire form answer state', () => {
  it('keeps legacy non-null rows compatible with ANSWERED', () => {
    expect(answerStatus({ value: 'legacy' })).toBe(QuestionnaireFormAnswerStatus.ANSWERED)
    expect(isFormAnswerComplete({ required: true }, { value: 'legacy' })).toBe(true)
  })

  it('requires a non-blank value for ANSWERED rows', () => {
    expect(isFormAnswerComplete({ required: true }, { status: 'ANSWERED', value: '   ' })).toBe(false)
    expect(isFormAnswerRequiredComplete({ required: true }, { status: 'ANSWERED', value: '   ' })).toBe(false)
  })

  it('allows SKIPPED only for optional non-context fields', () => {
    const skipped = { status: QuestionnaireFormAnswerStatus.SKIPPED, value: null }
    expect(isFormAnswerComplete({ required: false }, skipped)).toBe(true)
    expect(isFormAnswerRequiredComplete({ required: false }, skipped)).toBe(true)
    expect(isFormAnswerComplete({ required: true }, skipped)).toBe(false)
    expect(isFormAnswerComplete({ required: false, contextKey: 'gender' }, skipped)).toBe(false)
  })

  it('treats materialized PENDING slots as incomplete', () => {
    const pending = { status: QuestionnaireFormAnswerStatus.PENDING, value: null }
    expect(isFormAnswerComplete({ required: false }, pending)).toBe(false)
    expect(isFormAnswerRequiredComplete({ required: false }, pending)).toBe(false)
  })
})
