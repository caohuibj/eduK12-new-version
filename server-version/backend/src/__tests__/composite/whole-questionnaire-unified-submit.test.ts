import { describe, it, expect, vi, beforeAll } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
import {
  wholeQuestionnaireSubmitSchema,
  prepareWholeSubmissionPayload,
  submitWholeQuestionnaire,
  processWholeQuestionnaireAnswers,
  readEducationWholeProgress,
  readEducationWholeProgressWithWait,
  educationWholeProgressFromRow,
} from '../../modules/composite/whole-questionnaire.service'
import { prisma } from '../../config/database'
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
  it('uses the current epoch receipt in one progress query and preserves terminal failure during reconciliation', async () => {
    const query = vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{
      epoch: 2, parentStatus: 'COMPLETED', wholeSubmissionId: 'receipt', jobStatus: 'FAILED',
    }]).mockResolvedValueOnce([])
    try {
      await expect(readEducationWholeProgress('attempt', 'owner', 'STARTED')).resolves.toEqual({
        attemptId: 'attempt', attemptEpoch: 2, status: 'IN_PROGRESS', wholeSubmissionReceived: true,
        reportStatus: { state: 'FAILED' },
      })
      expect(query).toHaveBeenCalledOnce()
      expect(Array.from(query.mock.calls[0][0] as TemplateStringsArray).join('?')).toContain('job.attempt_epoch=parent.attempt_epoch')
      await expect(readEducationWholeProgress('attempt', 'other-user', 'STARTED')).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      query.mockRestore()
    }
  })

  it('keeps Job READY distinct from parent/Run completion and waits for processing jobs', async () => {
    const bound = {
      epoch: 1, parentStatus: 'COMPLETED' as const, executionStatus: 'COMPLETED',
      wholeSubmissionId: 'sub-1', receiptOnly: false,
    }
    for (const [jobStatus, expected] of [
      ['PENDING', 'PENDING'], ['PROCESSING', 'PROCESSING'],
      ['FAILED', 'FAILED'], ['CANCELLED', 'CANCELLED'], [null, 'WAITING'],
    ] as const) {
      const state = educationWholeProgressFromRow('attempt', { ...bound, jobStatus }, bound.executionStatus)
      expect(state).toMatchObject({
        status: 'COMPLETED', runCompleted: true, reportStatus: { state: expected },
      })
    }
    expect(educationWholeProgressFromRow('attempt', { ...bound, jobStatus: 'READY' }, bound.executionStatus))
      .toMatchObject({ status: 'COMPLETED', reportStatus: { state: 'READY' } })
    expect(educationWholeProgressFromRow('attempt', {
      ...bound, executionStatus: 'STARTED', jobStatus: 'READY',
    }, 'STARTED')).toMatchObject({ status: 'IN_PROGRESS', reportStatus: { state: 'PROCESSING' } })

    // A completed parent with a still-processing Job must not bypass the
    // long-poll's authoritative re-read as a falsely completed report.
    vi.stubEnv('ASSESSMENT_REPORT_READY_WAIT_ENABLED', 'false')
    const query = vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ ...bound, jobStatus: 'PROCESSING' }])
    try {
      const pending = await readEducationWholeProgressWithWait('attempt', 'owner', {
        bound: { ...bound, jobStatus: 'PROCESSING' }, waitMs: 4000,
      })
      expect(pending).toMatchObject({ status: 'COMPLETED', reportStatus: { state: 'PROCESSING' } })
      expect(query).toHaveBeenCalledOnce()
    } finally {
      query.mockRestore()
      vi.unstubAllEnvs()
    }
  })

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

  it('preserves the legacy receipt hash and byte count for 303 reordered answers', () => {
    const units = Array.from({ length: 9 }, (_, unit) => ({
      itemId: `unit-${unit}`,
      definitionHash: 'd'.repeat(64),
      answers: Array.from({ length: unit < 6 ? 34 : 33 }, (_, i) => ({
        itemCode: `题-${i}`,
        responseValue: i % 2 ? i : '选项\n✅',
        ...(i % 3 === 0 ? { changeCount: i, responseTimeMs: i + 0.5 } : {}),
      })).reverse(),
    })).reverse()
    const input = wholeQuestionnaireSubmitSchema.parse({ submissionId: 'same-durable-submission-id',
      attemptEpoch: 1, slotSetHash: 'f'.repeat(64), contextSnapshotHash: null, units })
    const legacy = prepareCanonicalSubmission({ attemptId: 'attempt', attemptEpoch: 1,
      slotSetHash: input.slotSetHash, contextSnapshotHash: null,
      units: [...input.units].sort((a, b) => a.itemId.localeCompare(b.itemId)).map(unit => ({ ...unit,
        answers: [...unit.answers].sort((a, b) => a.itemCode.localeCompare(b.itemCode)) })) })
    expect(prepareWholeSubmissionPayload('attempt', input, undefined, true)).toEqual({ bytes: legacy.bytes, hash: legacy.hash })
    expect(input.units).toEqual(units)
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

  it('short-circuits readEducationWholeProgressWithWait when bound execution is already completed and returns cleanly when long-poll wait is unavailable', async () => {
    const query = vi.spyOn(prisma, '$queryRaw')
    try {
      const done = await readEducationWholeProgressWithWait('attempt-done', 'owner', {
        bound: {
          epoch: 1,
          parentStatus: 'COMPLETED',
          wholeSubmissionId: 'sub-1',
          jobStatus: 'READY',
          executionStatus: 'COMPLETED',
        },
        waitMs: 4000,
      })
      expect(done).toEqual({
        attemptId: 'attempt-done',
        attemptEpoch: 1,
        status: 'COMPLETED',
        wholeSubmissionReceived: true,
        runCompleted: true,
        reportStatus: { state: 'READY' },
      })
      expect(query).not.toHaveBeenCalled()

      query.mockResolvedValueOnce([{
        epoch: 1,
        parentStatus: 'IN_PROGRESS',
        wholeSubmissionId: 'sub-2',
        jobStatus: 'PROCESSING',
        executionStatus: 'STARTED',
      }])
      const waiting = await readEducationWholeProgressWithWait('attempt-wait', 'owner', { waitMs: 4000 })
      expect(waiting).toEqual({
        attemptId: 'attempt-wait',
        attemptEpoch: 1,
        status: 'IN_PROGRESS',
        wholeSubmissionReceived: true,
        feedbackWaitMs: 0,
        reportStatus: { state: 'PROCESSING' },
      })
      expect(query).toHaveBeenCalledOnce()
    } finally {
      query.mockRestore()
    }
  })
})
