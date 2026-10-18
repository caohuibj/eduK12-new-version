import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ runtime: null as any, rawCreate: vi.fn(), update: vi.fn(), transaction: vi.fn(), envelope: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../services/unitSubmitAdmission', () => ({ withUnitSubmitAdmission: (run: () => unknown) => run() }))
vi.mock('../../services/questionnaireProgressService', () => ({ withFinalOnlyCompletionTransaction: (run: (tx: any) => unknown) => state.transaction(run) }))
vi.mock('../../modules/situational/situational-runtime.service', () => ({
  loadSituationalAttemptRuntime: async () => state.runtime,
  loadEmbeddedSituationalAttemptRuntime: async () => state.runtime,
  assertSituationalAttemptOwner: vi.fn(), assertRowMatchesSnapshot: vi.fn(), assertEmbeddedSituationalAttemptBinding: vi.fn(),
  SITUATIONAL_ATTEMPT_COMMIT_SELECT: {},
  situationalAttemptForResponse: (row: any, snapshot: any, options: any) => ({ attemptId: row.id, status: row.status, ...options }),
}))
import fixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { compileSjtOnlineDocument } from '../../modules/situational/authoring/online'
import { freezeSituationalRuntimeAtAttemptStart } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { submitSituationalAttemptFinal } from '../../modules/situational/situational-final-submit.service'
import { parseSituationalRawSubmissionPayload } from '../../modules/situational/situational-raw-submission'
import { SJT_ONLINE_UNSATISFIED_FLAG } from '../../modules/situational/situational-task-satisfaction'

function setup(required = false) {
  const doc = structuredClone(fixture)
  doc.goldenCases = []
  for (const scene of doc.display.scenes) for (const q of scene.questions) { q.required = required; q.allowRefusal = true }
  const compiled = compileSjtOnlineDocument(doc)
  const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: compiled.package.key, instrumentVersion: compiled.package.instrumentVersion, definition: compiled.package.definition, online: compiled.package.online })
  const row = { id: 'attempt', userId: 'owner', compositeAttemptId: null, status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: 1, definitionHash: snapshot.definitionHash, instrumentVersion: snapshot.instrumentVersion, compiledRuntimeHash: snapshot.compiledRuntimeHash, scoringVersion: snapshot.scoringVersion, startedAt: new Date(), submissionId: null, submissionPayloadHash: null }
  state.runtime = { row, snapshot }
  return { doc, body: { attemptId: 'attempt', userId: 'owner', submissionId: 'sjt-online-final-0001', attemptEpoch: 1, definitionHash: snapshot.definitionHash, responseProtocol: 'sjt-online-response-v1' as const, responses: [] as any[] } }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  state.update.mockImplementation(async ({ data }: any) => { Object.assign(state.runtime.row, data); return { count: 1 } })
  state.rawCreate.mockResolvedValue({})
  state.transaction.mockImplementation((run: (tx: any) => unknown) => run({
    $queryRaw: async () => [{ id: 'attempt' }],
    situationalAttempt: { findUnique: async () => state.runtime.row, updateMany: state.update },
    situationalRawSubmission: { create: state.rawCreate },
  }))
})

describe('online FINAL persistence through the shared service', () => {
  it('accepts all-optional empty FINAL with null scores and one raw-v2 row; identical replay never writes again', async () => {
    const { body } = setup()
    const first: any = await submitSituationalAttemptFinal(body)
    expect(first.replayed).toBe(false)
    expect(first.committedResult.result.metrics.every((m: any) => m.value === null && m.status === 'not_calculable')).toBe(true)
    expect(first.committedResult.canonicalResult.core.quality.flags).toContain(SJT_ONLINE_UNSATISFIED_FLAG)
    expect(state.rawCreate).toHaveBeenCalledTimes(1)
    const saved = state.rawCreate.mock.calls[0][0].data
    expect(saved).toMatchObject({ payloadSchemaVersion: 2, encodingVersion: 'situational-raw-submit-v2', responseCount: 0 })
    expect(parseSituationalRawSubmissionPayload(decryptUnifiedRuntimePayload(saved.payloadEncrypted))).toMatchObject({ schemaVersion: 2, rawResponses: [], responses: [] })
    const replay = await submitSituationalAttemptFinal(body)
    expect(replay.replayed).toBe(true)
    expect(state.rawCreate).toHaveBeenCalledTimes(1)
    expect(state.update).toHaveBeenCalledTimes(1)
  })
  it('rejects required blanks but accepts required refusal as missing evidence without satisfaction', async () => {
    const { body, doc } = setup(true)
    await expect(submitSituationalAttemptFinal(body)).rejects.toThrow()
    expect(state.rawCreate).not.toHaveBeenCalled()
    body.responses = doc.display.scenes.flatMap(s => s.questions.map(q => ({ sceneKey: 'sjt_q_' + q.questionKey, channelKey: q.questionKey, status: 'REFUSED' })))
    const accepted: any = await submitSituationalAttemptFinal(body)
    expect(accepted.committedResult.result.metrics.every((m: any) => m.value === null)).toBe(true)
    expect(accepted.committedResult.canonicalResult.core.quality.flags).toContain(SJT_ONLINE_UNSATISFIED_FLAG)
  })
  it('keeps a partial substantive optional submission eligible even while the incomplete metric is null', async () => {
    const { body, doc } = setup()
    const q = doc.display.scenes[0].questions[0]
    const option = q.options.find(o => !('nonanswerReason' in o))!
    body.responses = [{ sceneKey: 'sjt_q_' + q.questionKey, channelKey: q.questionKey, status: 'ANSWERED', responseValue: q.responseType === 'MULTIPLE' ? [option.optionKey] : option.optionKey, responseTimeMs: 321 }]
    const accepted: any = await submitSituationalAttemptFinal(body)
    expect(accepted.committedResult.result.metrics.some((m: any) => m.value === null)).toBe(true)
    expect(accepted.committedResult.canonicalResult.core.quality.flags).not.toContain(SJT_ONLINE_UNSATISFIED_FLAG)
    expect(state.rawCreate.mock.calls[0][0].data.responseCount).toBe(1)
    const raw = parseSituationalRawSubmissionPayload(decryptUnifiedRuntimePayload(state.rawCreate.mock.calls[0][0].data.payloadEncrypted))
    expect(raw.schemaVersion).toBe(2)
    if (raw.schemaVersion === 2) expect(raw.rawResponses).toEqual(body.responses)
  })
  it('does not let a client upgrade a legacy frozen attempt or omit the frozen online protocol', async () => {
    const { body } = setup()
    const { responseProtocol: _protocol, ...legacyBody } = body
    await expect(submitSituationalAttemptFinal(legacyBody)).rejects.toThrow('提交协议')
    delete state.runtime.snapshot.online
    await expect(submitSituationalAttemptFinal(body)).rejects.toThrow('提交协议')
    expect(state.rawCreate).not.toHaveBeenCalled()
  })
})
