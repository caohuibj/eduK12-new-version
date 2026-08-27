import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildAssessmentContext,
  hashAssessmentContext,
  readContextFormAnswer,
  readContextFormAnswers,
  stableContextJson,
  writeContextFormAnswer,
} from '../../modules/assessment-context'
import { isEncrypted } from '../../utils/encryption'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.ASSESSMENT_CONTEXT_HASH_KEY = 'b'.repeat(64)

describe('context form answer privacy boundary', () => {
  it('encrypts only context-bound values and decrypts them for server consumers', () => {
    const stored = writeContextFormAnswer('sexAtBirth', 'female')

    expect(stored).not.toBe('female')
    expect(isEncrypted(stored)).toBe(true)
    expect(readContextFormAnswer('sexAtBirth', stored)).toBe('female')
    expect(writeContextFormAnswer(null, 'ordinary answer')).toBe('ordinary answer')
    expect(() => readContextFormAnswer('sexAtBirth', 'female')).toThrow()
  })

  it('decrypts context rows without changing ordinary form rows', () => {
    const contextValue = writeContextFormAnswer('gradeLevel', '7')
    const answers = readContextFormAnswers(
      [
        { id: 'grade', contextKey: 'gradeLevel' },
        { id: 'note', contextKey: null },
      ],
      [
        { formItemId: 'grade', value: contextValue },
        { formItemId: 'note', value: 'ordinary answer' },
      ],
    )

    expect(answers).toEqual([
      { formItemId: 'grade', value: '7' },
      { formItemId: 'note', value: 'ordinary answer' },
    ])
  })

  it('uses a keyed fingerprint instead of a bare SHA-256 digest', () => {
    const context = buildAssessmentContext({
      items: [{ id: 'grade', type: 'single_choice', contextKey: 'gradeLevel', options: [{ value: '7' }] }],
      answers: [{ formItemId: 'grade', value: '7' }],
      frozenAt: new Date('2026-08-27T00:00:00.000Z'),
    })

    const keyed = hashAssessmentContext(context)
    const bare = createHash('sha256').update(stableContextJson(context)).digest('hex')
    expect(keyed).not.toBe(bare)

    process.env.ASSESSMENT_CONTEXT_HASH_KEY = 'c'.repeat(64)
    expect(hashAssessmentContext(context)).not.toBe(keyed)
    process.env.ASSESSMENT_CONTEXT_HASH_KEY = 'b'.repeat(64)
  })
})
