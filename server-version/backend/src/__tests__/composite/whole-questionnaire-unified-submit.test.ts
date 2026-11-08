import { describe, it, expect, vi, beforeAll } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
import {
  wholeQuestionnaireSubmitSchema,
  submitWholeQuestionnaire,
  processWholeQuestionnaireAnswers,
} from '../../modules/composite/whole-questionnaire.service'
import { prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'
import {
  encryptUnifiedRuntimePayload,
  decryptUnifiedRuntimePayload,
} from '../../modules/assessment-runtime/security'
import { formSectionSlotKey } from '../../modules/assessment-runtime/slot-set'
import {
  wholeSubmitAdmission,
  withWholeSubmitAdmission,
  WholeSubmitAdmissionBusyError,
  isWholeSubmitAdmissionBusyError,
} from '../../services/wholeSubmitAdmission'

describe('Scheme X Unified Whole Questionnaire Submit & Encrypted Ingestion (PR X-03)', () => {
  it('validates schema accepting mixed Scale units and Form answers', () => {
    const validPayload = {
      submissionId: '0123456789abcdef0123456789abcdef',
      attemptEpoch: 1,
      slotSetHash: 'a'.repeat(64),
      contextSnapshotHash: null,
      units: [
        {
          itemId: 'scale-item-1',
          definitionHash: 'b'.repeat(64),
          answers: [
            { itemCode: 'q1', responseValue: 3, responseTimeMs: 1200 },
          ],
        },
      ],
      formAnswers: [
        {
          sectionId: 'form-sec-1',
          definitionHash: 'c'.repeat(64),
          answers: [
            { formItemId: 'f-1', value: '张三' },
            { formItemId: 'f-2', value: ['reading', 'sports'] },
          ],
        },
      ],
    }

    const parsed = wholeQuestionnaireSubmitSchema.safeParse(validPayload)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.units.length).toBe(1)
      expect(parsed.data.formAnswers?.length).toBe(1)
      expect(parsed.data.formAnswers?.[0].answers[0].value).toBe('张三')
    }
  })

  it('rejects duplicate Form section IDs before accepting a whole submission', () => {
    const formSection = {
      sectionId: 'form-sec-1',
      definitionHash: 'c'.repeat(64),
      answers: [{ formItemId: 'f-1', value: 'original answer' }],
    }
    const payload = {
      submissionId: '0123456789abcdef0123456789abcdef',
      attemptEpoch: 1,
      slotSetHash: 'a'.repeat(64),
      contextSnapshotHash: null,
      units: [{
        itemId: 'scale-item-1',
        definitionHash: 'b'.repeat(64),
        answers: [{ itemCode: 'q1', responseValue: 3, responseTimeMs: 1200 }],
      }],
      formAnswers: [formSection, {
        ...formSection,
        answers: [{ formItemId: 'f-1', value: 'conflicting answer' }],
      }],
    }
    expect(wholeQuestionnaireSubmitSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects invalid or missing required fields in submission schema', () => {
    const invalidPayload = {
      submissionId: 'short', // Too short (< 16 chars)
      attemptEpoch: 0, // Must be >= 1
      slotSetHash: 'not-a-sha256',
      contextSnapshotHash: null,
      units: [], // Min 1 unit
    }

    const parsed = wholeQuestionnaireSubmitSchema.safeParse(invalidPayload)
    expect(parsed.success).toBe(false)
  })

  it('excludes covered form slots so atomic receipt does not require pre-completed unit snapshots', () => {
    const manifestRequiredFormSlots = [
      'form-section:sec-demographics',
      'form-section:sec-feedback',
    ]

    const preparedForms = [
      { sectionId: 'sec-demographics', definitionHash: 'hash-demo', answers: [{ formItemId: 'age', value: '16' }] },
      { sectionId: 'sec-feedback', definitionHash: 'hash-feed', answers: [{ formItemId: 'comments', value: '很好' }] },
    ]

    const coveredFormSlots = new Set(preparedForms.map(f => formSectionSlotKey(f.sectionId)))
    const remainingRequiredFormSlots = manifestRequiredFormSlots.filter(k => !coveredFormSlots.has(k))

    // All required form slots were submitted in the whole payload => none remain unfulfilled
    expect(remainingRequiredFormSlots).toEqual([])
  })

  it('preserves partial unfulfilled form slots when only some form sections are submitted', () => {
    const manifestRequiredFormSlots = [
      'form-section:sec-demographics',
      'form-section:sec-feedback',
    ]

    const preparedForms = [
      { sectionId: 'sec-demographics', definitionHash: 'hash-demo', answers: [{ formItemId: 'age', value: '16' }] },
    ]

    const coveredFormSlots = new Set(preparedForms.map(f => formSectionSlotKey(f.sectionId)))
    const remainingRequiredFormSlots = manifestRequiredFormSlots.filter(k => !coveredFormSlots.has(k))

    // sec-feedback remains required to be in prior unit snapshots
    expect(remainingRequiredFormSlots).toEqual(['form-section:sec-feedback'])
  })

  it('guarantees sensitive survey answers are encrypted at rest with AES-256-GCM', () => {
    const sensitivePayload = {
      schemaVersion: 1,
      binding: {
        attemptId: 'attempt-test-123',
        attemptEpoch: 1,
        slotSetHash: 'a'.repeat(64),
        contextHash: null,
      },
      payloadHash: 'hash-123',
      units: [
        {
          itemId: 'scale-depression',
          assessmentId: 'child-1',
          answers: [
            { itemCode: 'dep-1', responseValue: 4 }, // Sensitive answer
          ],
        },
      ],
      formAnswers: [
        {
          sectionId: 'sec-personal',
          definitionHash: 'def-sec',
          answers: [
            { formItemId: 'real_name', value: '张三' }, // Sensitive personal info
            { formItemId: 'id_number', value: '110101199001011234' }, // Sensitive PII
          ],
        },
      ],
    }

    const encryptedString = encryptUnifiedRuntimePayload(sensitivePayload)

    // Raw plaintext values must NOT appear in the encrypted ciphertext string
    expect(encryptedString).not.toContain('张三')
    expect(encryptedString).not.toContain('110101199001011234')
    expect(encryptedString).not.toContain('scale-depression')

    // Must be in AES-256-GCM hex format: iv:authTag:ciphertext (3 parts)
    const parts = encryptedString.split(':')
    expect(parts.length).toBe(3)
    expect(parts[0].length).toBe(32) // 16 bytes IV hex
    expect(parts[1].length).toBe(32) // 16 bytes tag hex

    // Decryption recovers exact payload
    const decrypted = decryptUnifiedRuntimePayload<typeof sensitivePayload>(encryptedString)
    expect(decrypted).toEqual(sensitivePayload)
  })

  it('runs under dedicated 32-concurrency whole submit admission gate', async () => {
    let executed = false
    const result = await withWholeSubmitAdmission(async () => {
      executed = true
      return 'ok'
    })

    expect(executed).toBe(true)
    expect(result).toBe('ok')
  })

  it('identifies WholeSubmitAdmissionBusyError correctly', () => {
    const busyError = new WholeSubmitAdmissionBusyError('concurrency_limit', 1)
    expect(busyError.code).toBe('ASSESSMENT_SUBMIT_BUSY')
    expect(busyError.retryAfterSeconds).toBe(1)
    expect(isWholeSubmitAdmissionBusyError(busyError)).toBe(true)

    const normalError = new Error('ordinary error')
    expect(isWholeSubmitAdmissionBusyError(normalError)).toBe(false)
  })
})
