import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ runtime: null as any, rawCreate: vi.fn(), update: vi.fn(), transaction: vi.fn(), envelope: vi.fn(), education:vi.fn(),events: [] as string[] }))
vi.mock('../../modules/assessment-run/educationPrivateFormExecution',()=>({assertPrivateFormFinalCurrent:(...args:any[])=>state.education(...args)}))
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../modules/composite/training-variant-child-scope', () => ({ requiresTrainingFlowFinalLock: () => false, lockTrainingFlowFinalAdmission: async () => { state.events.push('host-lock'); return () => { state.events.push('host-admission') } } }))
vi.mock('../../services/unitSubmitAdmission', () => ({ withUnitSubmitAdmission: (run: () => unknown) => run() }))
vi.mock('../../services/questionnaireProgressService', () => ({ withFinalOnlyCompletionTransaction: (run: (tx: any) => unknown) => state.transaction(run) }))
vi.mock('../../modules/situational/situational-runtime.service', () => ({
  loadSituationalAttemptRuntime: async () => state.runtime,
  loadEmbeddedSituationalAttemptRuntime: async () => state.runtime,
  assertSituationalAttemptOwner: vi.fn(), assertRowMatchesSnapshot: vi.fn(), assertEmbeddedSituationalAttemptBinding: vi.fn(),
  SITUATIONAL_ATTEMPT_COMMIT_SELECT: {},
  situationalAttemptForResponse: (row: any, snapshot: any, options: any) => ({ attemptId: row.id, status: row.status, ...options }),
}))
import { assertSituationalAttemptOwner } from '../../modules/situational/situational-runtime.service'
import fixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { compileSjtOnlineDocument } from '../../modules/situational/authoring/online'
import { freezeSituationalRuntimeAtAttemptStart } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { submitSituationalAttemptFinal, prepareSituationalFinalSubmission } from '../../modules/situational/situational-final-submit.service'
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
  state.events.length = 0
  state.education.mockReset()
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  state.update.mockImplementation(async ({ data }: any) => { Object.assign(state.runtime.row, data); return { count: 1 } })
  state.rawCreate.mockResolvedValue({})
  state.transaction.mockImplementation((run: (tx: any) => unknown) => run({
    $queryRaw: async () => { state.events.push('child-lock'); return [{ id: 'attempt' }] },
    situationalAttempt: { findUnique: async () => state.runtime.row, updateMany: state.update },
    situationalRawSubmission: { create: state.rawCreate },
  }))
})

describe('online FINAL persistence through the shared service', () => {
  it.each([false,true])('rechecks the education Run inside FINAL before child writes, including replay=%s',async replay=>{
    const {body}=setup(),row=state.runtime.row
    row.compositeAttemptId='education-parent';row.compositeAttempt={id:'education-parent',compositeAssessment:{creationKey:'education-composition:TEACHER:fixed:TEACHER:SELF:1.0.0'}}
    if(replay){const prepared=prepareSituationalFinalSubmission(body,state.runtime);Object.assign(row,{status:'COMPLETED',submissionId:body.submissionId,submissionPayloadHash:prepared.payloadHash})}
    const denied=Object.assign(new Error('current education participation withdrawn'),{statusCode:403})
    state.education.mockRejectedValue(denied)
    await expect(submitSituationalAttemptFinal(body)).rejects.toBe(denied)
    expect(state.education).toHaveBeenCalledExactlyOnceWith(expect.any(Object),{attemptId:'education-parent',actorUserId:'owner'})
    expect(state.update).not.toHaveBeenCalled();expect(state.rawCreate).not.toHaveBeenCalled()
    expect(state.events).not.toContain('child-lock')
  })
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


describe('shared FINAL transaction boundary', () => {
  it('keeps the mandatory host lock before child lock and admission before writes', async () => {
    const { body } = setup()
    state.rawCreate.mockImplementation(async () => { state.events.push('raw-write'); return {} })
    await submitSituationalAttemptFinal(body)
    expect(state.events).toEqual(['host-lock', 'child-lock', 'host-admission', 'raw-write'])
  })
  it('rejects a Survey child even if a legacy runtime loader returned it', async () => {
    const { body } = setup()
    state.runtime.row.surveyAttemptId = 'survey-parent'
    await expect(submitSituationalAttemptFinal(body)).rejects.toThrow('宿主不匹配')
    expect(state.update).not.toHaveBeenCalled(); expect(state.rawCreate).not.toHaveBeenCalled()
  })
  it('rechecks epoch after entering the transaction and never writes stale preparation', async () => {
    const { body } = setup()
    state.transaction.mockImplementation(async run => {
      state.runtime.row.attemptEpoch = 2
      return run({$queryRaw: async () => [{id: 'attempt'}], situationalAttempt: {findUnique: async () => state.runtime.row, updateMany: state.update}, situationalRawSubmission: {create: state.rawCreate}})
    })
    await expect(submitSituationalAttemptFinal(body)).rejects.toThrow()
    expect(state.update).not.toHaveBeenCalled(); expect(state.rawCreate).not.toHaveBeenCalled()
  })
  it('returns the locked winning replay without overwriting its facts', async () => {
    const { body } = setup()
    const prepared = prepareSituationalFinalSubmission(body, state.runtime)
    state.transaction.mockImplementation(async run => {
      Object.assign(state.runtime.row, {status: 'COMPLETED', submissionId: body.submissionId, submissionPayloadHash: prepared.payloadHash})
      return run({$queryRaw: async () => [{id: 'attempt'}], situationalAttempt: {findUnique: async () => state.runtime.row, updateMany: state.update}, situationalRawSubmission: {create: state.rawCreate}})
    })
    expect(await submitSituationalAttemptFinal(body)).toMatchObject({replayed: true})
    expect(state.update).not.toHaveBeenCalled(); expect(state.rawCreate).not.toHaveBeenCalled()
  })
  it('awaits an asynchronous mandatory authority failure before writing any fact', async () => {
    const { body } = setup()
    vi.mocked(assertSituationalAttemptOwner).mockImplementation(async () => { throw new Error('authority denied') })
    try {
      await expect(submitSituationalAttemptFinal(body)).rejects.toThrow('authority denied')
      expect(state.update).not.toHaveBeenCalled(); expect(state.rawCreate).not.toHaveBeenCalled()
    } finally { vi.mocked(assertSituationalAttemptOwner).mockImplementation(() => {}) }
  })
  it('rejects preparation from another attempt despite matching scientific hashes', () => {
    const { body } = setup()
    expect(() => prepareSituationalFinalSubmission({...body, attemptId: 'other'}, state.runtime)).toThrow('提交身份不一致')
  })
})
