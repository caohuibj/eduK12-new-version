import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  known: { projectId: 'project', waveId: 'wave', attemptId: 'parent', publicationId: 'publication', definitionDigest: 'digest' },
  snapshot: { definition: { scenes: [] } },
  row: {} as Record<string, unknown>, host: {} as Record<string, unknown>,
  prefixHash: '', reads: vi.fn(), view: vi.fn(), access: vi.fn(), prefix: vi.fn(),
  prepare: vi.fn(), derive: vi.fn(), commit: vi.fn(), transaction: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../services/questionnaireProgressService', () => ({ withFinalOnlyCompletionTransaction: state.transaction }))
vi.mock('../../modules/survey/admission.service', () => ({ verifiedSurveyAttempt: vi.fn(async () => state.known) }))
vi.mock('../../modules/survey/task-authority', () => ({ lockSurveyTaskAccess: state.access }))
vi.mock('../../modules/survey/flow.assignment', () => ({ assertSurveyFlowAssignment: vi.fn(), assignedSurveySnapshot: (snapshot: unknown) => snapshot, ensureSurveyFlowAssignment: vi.fn() }))
vi.mock('../../modules/survey/content-binding.service', () => ({ decodeSurveyAttemptContentBinding: () => ({ valid: true }) }))
vi.mock('../../modules/survey/situational-native.definition', () => ({ frozenSurveyNativeSituationalRuntime: () => ({ snapshot: state.snapshot, header: { attemptEpoch: 1 } }), surveyNativeSituationalRequiresStageNotice: () => false }))
vi.mock('../../modules/survey/measurement.notice', () => ({ hasSurveyStagedSituationalNotice: () => true, hasSurveyLinearSituationalNotice: () => true }))
vi.mock('../../modules/assessment-runtime/situational-runtime-snapshot', () => ({ decryptFrozenSituationalRuntimeSnapshot: () => state.snapshot, encryptFrozenSituationalRuntimeSnapshot: () => 'opaque' }))
vi.mock('../../modules/assessment-runtime/security', () => ({ decryptUnifiedRuntimePayload: () => ({ assigned: true }), encryptUnifiedRuntimePayload: () => 'opaque' }))
vi.mock('../../modules/survey/task-answer-locks', () => ({ readSurveyTaskLockedAnswers: vi.fn(async () => ({ answer: 'A' })) }))
vi.mock('../../modules/survey/task-prefix', () => ({ freezeSurveyTaskPrefix: state.prefix }))
vi.mock('../../modules/situational/situational-runtime.service', () => ({
  SITUATIONAL_ATTEMPT_SELECT: {}, assertRowMatchesSnapshot: vi.fn(), retainFrozenSituationalAssets: vi.fn(),
  situationalAttemptForResponse: state.view,
}))
vi.mock('../../modules/situational/situational-final-submit.service', () => ({ prepareSituationalFinalSubmission: state.prepare, deriveSituationalFinalFacts: state.derive, commitPreparedSituationalFinal: state.commit }))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { readSurveySituational, submitSurveySituationalFinal, authorizeSurveySituationalImage } from '../../modules/survey/situational-native.service'
const proof = { publicId: 'public', attemptId: 'parent', accessCredential: 'a'.repeat(43) }
const submissionId = '12345678-1234-4234-8234-123456789abc'
const input = { submissionId } as Parameters<typeof submitSurveySituationalFinal>[3]

describe('Survey native response projection is not an authority prerequisite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.prefixHash = canonicalHash({ answer: 'A' })
    state.row = { id: 'child', surveyAttemptId: 'parent', surveyPublicationId: 'publication', surveySlotKey: 'slot', attemptEpoch: 1,
      userId: null, compositeAttemptId: null, compositeItemId: null, compositeSlotKey: null,
      runtimeSnapshotEncrypted: 'opaque', status: 'IN_PROGRESS', submissionId, submissionPayloadHash: 'payload' }
    state.host = { snapshot: { flow: {}, units: [{ kind: 'SJT', instrumentKey: 'slot' }] }, attempt: { status: 'STARTED', flowAssignmentCipher: 'opaque' } }
    state.access.mockImplementation(async () => state.host)
    state.prefix.mockResolvedValue({ answer: 'A' })
    state.reads.mockImplementation(async () => ({ surveyLockedAnswersCipher: 'opaque', surveyLockedAnswersHash: state.prefixHash }))
    state.transaction.mockImplementation(async run => run({ situationalAttempt: { findFirst: async () => state.row, findUnique: state.reads } }))
    state.view.mockImplementation((row, _snapshot, options) => ({ attemptId: row.id, instrument: { definition: 'public DTO' }, ...options }))
    state.prepare.mockReturnValue({ submissionId, payloadHash: 'payload' })
    state.derive.mockReturnValue({ unchangedScientificFacts: true })
    state.commit.mockResolvedValue({ kind: 'committed', row: { ...state.row, status: 'COMPLETED' } })
  })
  it('does not build a discarded preparation DTO, but returns the complete committed response', async () => {
    const response = await submitSurveySituationalFinal(proof, 'slot', 'child', input)
    expect(state.view).toHaveBeenCalledTimes(1)
    expect(state.access).toHaveBeenCalledTimes(2)
    expect(state.prefix).toHaveBeenCalledTimes(2)
    expect(response).toMatchObject({ instrument: { definition: 'public DTO' }, lockedPriorAnswers: { answer: 'A' }, receipt: { attemptId: 'child' } })
  })
  it('preserves completed replay response without computing or writing a second fact', async () => {
    state.row.status = 'COMPLETED'
    const response = await submitSurveySituationalFinal(proof, 'slot', 'child', input)
    expect(response).toMatchObject({ replayed: true, lockedPriorAnswers: { answer: 'A' }, receipt: { attemptId: 'child' } })
    expect(state.view).toHaveBeenCalledTimes(1)
    expect(state.derive).not.toHaveBeenCalled()
    expect(state.commit).not.toHaveBeenCalled()
  })
  it('keeps full authorized read projection and the frozen prefix', async () => {
    expect(await readSurveySituational(proof, 'slot', 'child')).toMatchObject({ instrument: { definition: 'public DTO' }, lockedPriorAnswers: { answer: 'A' } })
    expect(state.view).toHaveBeenCalledTimes(1)
    expect(state.prefix).toHaveBeenCalledTimes(1)
  })
  it('never projects a questionnaire while rejecting an unauthorized image reference', async () => {
    await expect(authorizeSurveySituationalImage(proof, 'slot', 'child', 'unknown')).rejects.toThrow('图片不属于当前冻结情境化题面')
    expect(state.prefix).toHaveBeenCalledTimes(1)
    expect(state.view).not.toHaveBeenCalled()
  })
  it('does not reuse first-transaction authority after it is revoked before commit', async () => {
    state.access.mockResolvedValueOnce(state.host).mockRejectedValueOnce(new Error('current authority revoked'))
    await expect(submitSurveySituationalFinal(proof, 'slot', 'child', input)).rejects.toThrow('current authority revoked')
    expect(state.access).toHaveBeenCalledTimes(2)
    expect(state.commit).not.toHaveBeenCalled()
    expect(state.view).not.toHaveBeenCalled()
  })
  it('refuses a changed replay payload without rebuilding or overwriting facts', async () => {
    state.row.status = 'COMPLETED'
    state.prepare.mockReturnValue({ submissionId, payloadHash: 'different' })
    await expect(submitSurveySituationalFinal(proof, 'slot', 'child', input)).rejects.toThrow()
    expect(state.commit).not.toHaveBeenCalled()
    expect(state.view).not.toHaveBeenCalled()
  })
  it('retains the missing locked-prefix rejection rather than treating it as no-flow', async () => {
    state.reads.mockResolvedValue(null)
    await expect(readSurveySituational(proof, 'slot', 'child')).rejects.toThrow('条件流程情境化任务缺少冻结前置答案')
    expect(state.view).not.toHaveBeenCalled()
  })
  it('preserves the absence of a flow prefix in an ordinary read DTO', async () => {
    delete (state.host.snapshot as Record<string, unknown>).flow
    const response = await readSurveySituational(proof, 'slot', 'child')
    expect(response).not.toHaveProperty('lockedPriorAnswers')
    expect(state.prefix).not.toHaveBeenCalled()
    expect(state.view).toHaveBeenCalledTimes(1)
  })
  it.each(['read', 'final', 'image'] as const)('still rejects a changed frozen flow prefix before %s', async operation => {
    state.prefixHash = 'different'
    const action = operation === 'read' ? readSurveySituational(proof, 'slot', 'child')
      : operation === 'final' ? submitSurveySituationalFinal(proof, 'slot', 'child', input)
        : authorizeSurveySituationalImage(proof, 'slot', 'child', 'unknown')
    await expect(action).rejects.toThrow('情境化前置答案与冻结路径不一致')
    expect(state.view).not.toHaveBeenCalled()
    expect(state.derive).not.toHaveBeenCalled()
    expect(state.commit).not.toHaveBeenCalled()
  })
})
