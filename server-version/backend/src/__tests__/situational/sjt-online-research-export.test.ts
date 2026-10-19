import { describe, expect, it } from 'vitest'
import fixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { compileSjtOnlineDocument, normalizeSjtOnlineResponses } from '../../modules/situational/authoring/online'
import { freezeSituationalRuntimeAtAttemptStart } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { createSituationalOnlineRawSubmissionPayload, createSituationalRawSubmissionPayload, type SituationalRawSubmissionPayloadV2 } from '../../modules/situational/situational-raw-submission'
import { prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'
import { buildSituationalResearchArtifact } from '../../modules/situational/situation-research-export'

function setup() {
  const document = structuredClone(fixture)
  document.goldenCases = []
  for (const scene of document.display.scenes) for (const question of scene.questions) { question.required = false; question.allowRefusal = true }
  const compiled = compileSjtOnlineDocument(document)
  const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: compiled.package.key, instrumentVersion: compiled.package.instrumentVersion, definition: compiled.package.definition, online: compiled.package.online })
  const response = { sceneKey: 'sjt_q_first', channelKey: 'first', status: 'ANSWERED' as const, responseValue: ['b', 'a'], responseTimeMs: 321 }
  const normalized = normalizeSjtOnlineResponses(document.display, compiled.package.definition, [response, { sceneKey: 'sjt_q_second', channelKey: 'second', status: 'REFUSED' }])
  const raw = createSituationalOnlineRawSubmissionPayload({ attemptEpoch: 1, responses: normalized.responses, rawResponses: normalized.rawResponses })
  const digest = (value: SituationalRawSubmissionPayloadV2) => prepareCanonicalSubmission({ responses: value.responses, responseProtocol: value.responseProtocol, rawResponses: value.rawResponses }).hash
  const input = { attemptId: 'synthetic-attempt', attemptEpoch: 1, snapshot, raw, submissionPayloadHash: digest(raw), pseudonymKey: 'a'.repeat(64), grant: { grantId: 'synthetic-grant', researcherUserId: 'researcher', attemptIds: ['synthetic-attempt'], definitionHash: snapshot.definitionHash, expiresAt: '2100-01-01T00:00:00Z', approvalReference: 'synthetic-only', projection: 'PSEUDONYMOUS_RAW_V1' as const } }
  return { input, digest }
}

describe('online research raw integrity', () => {
  it('retains original selections and RT and distinguishes refusal from blank missingness', () => {
    const { input } = setup()
    const artifact = buildSituationalResearchArtifact(input)
    expect(artifact.participantSelections).toEqual(input.raw.rawResponses)
    expect(artifact.rawResponses[0].responseTimeMs).toBe(321)
    expect(artifact.opportunities.find(o => o.channelKey === 'second')?.missingness).toBe('DECLINED')
    expect(artifact.opportunities.find(o => o.channelKey === 'third')?.missingness).toBe('PARTICIPANT_SKIPPED')
  })
  it('rejects raw-v2/legacy snapshot and raw-v1/online snapshot mismatch', () => {
    const { input } = setup()
    const { online: _online, ...legacySnapshot } = input.snapshot
    expect(() => buildSituationalResearchArtifact({ ...input, snapshot: legacySnapshot })).toThrow('protocol')
    const legacyRaw = createSituationalRawSubmissionPayload({ attemptEpoch: 1, responses: input.raw.responses })
    expect(() => buildSituationalResearchArtifact({ ...input, raw: legacyRaw })).toThrow('protocol')
  })
  it('rejects altered original or derived evidence even with a matching replacement submission digest', () => {
    const { input, digest } = setup()
    for (const change of [
      (raw: SituationalRawSubmissionPayloadV2) => { raw.responses[0].responseTimeMs = 999 },
      (raw: SituationalRawSubmissionPayloadV2) => { raw.rawResponses[0].responseValue = ['a'] },
    ]) {
      const raw = structuredClone(input.raw)
      change(raw)
      expect(() => buildSituationalResearchArtifact({ ...input, raw, submissionPayloadHash: digest(raw) })).toThrow('derived response mismatch')
    }
  })
})
