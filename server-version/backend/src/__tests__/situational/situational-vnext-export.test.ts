import { describe, it, expect } from 'vitest'
import { scientificFixture } from './vnext-fixture'
import { captureFixture } from './vnext-capture-fixture'
import { authorizeSituationalResearchExport, buildSituationalResearchArtifact } from '../../modules/situational/situation-research-export'
import { freezeSituationalRuntimeAtAttemptStart } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { createSituationalRawSubmissionPayload } from '../../modules/situational/situational-raw-submission'
import { situationalResponseHistoryIdentities, validateSituationalResearchCapture } from '../../modules/situational/situation-research-capture'
import { prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'

const grant = (hash: string) => ({ grantId: 'synthetic-grant', researcherUserId: 'synthetic-researcher', attemptIds: ['synthetic-attempt'], definitionHash: hash, expiresAt: '2100-01-01T00:00:00.000Z', approvalReference: 'synthetic-only-approved-test', projection: 'PSEUDONYMOUS_RAW_V1' as const })

describe('Situational research export authority and frozen artifact', () => {
  it('defaults to denial, including owner/admin/teacher roles without a grant', () => {
    for (const userId of ['owner', 'admin', 'teacher']) expect(() => authorizeSituationalResearchExport({ userId, attemptId: 'synthetic-attempt', definitionHash: 'a'.repeat(64), embedded: false }, '[]')).toThrow()
  })
  it.each(['wrong-user', 'wrong-attempt', 'wrong-definition', 'expired', 'embedded', 'malformed'])('rejects %s', kind => {
    const configured = grant('a'.repeat(64)), input = { userId: configured.researcherUserId, attemptId: 'synthetic-attempt', definitionHash: configured.definitionHash, embedded: false }
    if (kind === 'wrong-user') input.userId = 'other'
    if (kind === 'wrong-attempt') input.attemptId = 'other'
    if (kind === 'wrong-definition') input.definitionHash = 'b'.repeat(64)
    if (kind === 'expired') configured.expiresAt = '2000-01-01T00:00:00.000Z'
    if (kind === 'embedded') input.embedded = true
    expect(() => authorizeSituationalResearchExport(input, kind === 'malformed' ? '{}' : JSON.stringify([configured]))).toThrow()
  })
  it('exports frozen raw/path/assignment/semantic provenance without PII or encrypted storage', () => {
    const definition = scientificFixture()
    definition.researchAssignment = { assignmentVersion: '1', groups: [{ groupKey: 'g', nodeKey: 'entry', variants: [{ variantKey: 'missing', weight: 1, omittedChannelKeys: ['probe3'], probeTiming: 'DEFINED' }] }] }
    const f = captureFixture(definition, 'synthetic-attempt'), snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: 'synthetic', instrumentVersion: '1.0.0', definition })
    const raw = createSituationalRawSubmissionPayload({ attemptEpoch: 1, responses: f.responses, researchCapture: f.capture })
    const input = { attemptId: 'synthetic-attempt', attemptEpoch: 1, submissionPayloadHash: prepareCanonicalSubmission({ responses: f.responses, researchCapture: f.capture }).hash, snapshot, raw, grant: grant(f.definitionHash), pseudonymKey: 'a'.repeat(64) }
    const artifact = buildSituationalResearchArtifact(input)
    expect(artifact.rawResponses).toHaveLength(4)
    expect(artifact.opportunities.find(o => o.sceneKey === 'right')?.missingness).toBe('STRUCTURAL_NOT_REACHED')
    expect(artifact.opportunities.find(o => o.channelKey === 'probe3')?.missingness).toBe('PLANNED_NOT_ADMINISTERED')
    expect(artifact.opportunities.find(o => o.channelKey === 'probe2')?.missingness).toBe('PARTICIPANT_SKIPPED')
    expect(artifact.optionSemantics.length).toBeGreaterThan(0)
    expect(JSON.stringify(artifact)).not.toMatch(/researcherUserId|participantKey|payloadEncrypted|runtimeSnapshotEncrypted|synthetic-attempt/)
    expect(() => buildSituationalResearchArtifact({ ...input, submissionPayloadHash: 'f'.repeat(64) })).toThrow(/digest mismatch/)
  })
})


it('distinguishes historical first responses and history-invalidated optional opportunities from current missingness', () => {
  const definition = scientificFixture()
  for (const node of definition.flow.nodes) if (node.nodeType === 'SCENE') delete node.responseStages
  const common = definition.scenes.find(s => s.sceneKey === 'common')!
  common.channels.push({ channelKey: 'optional', purpose: 'SELF_EFFICACY', responseType: 'CONTINUOUS', prompt: 'Synthetic optional', range: { min: 0, max: 100 }, scoringDirection: 'POSITIVE' })
  const commonNode = definition.flow.nodes.find(n => n.nodeKey === 'common')!
  if (commonNode.nodeType !== 'SCENE') throw new Error('fixture')
  commonNode.channelPolicies!.push({ channelKey: 'optional', required: false, measurementRole: 'RAW_ONLY', interactionRole: 'DIAGNOSTIC' })
  const f = captureFixture(definition, 'synthetic-attempt')
  const oldCommon = f.responses.find(r => r.sceneKey === 'common')!
  f.capture.events.push({ type: 'RESPONSE_FIRST_COMMITTED', nodeKey: 'common', channelKey: 'optional', responseValue: 20, responseRevision: 1, historyIdentity: oldCommon.historyIdentity!, relativeTimeMs: 100 })
  const oldEntry = f.responses.find(r => r.sceneKey === 'entry')!
  const finalEntry = { ...oldEntry, responseValue: 'B', responseRevision: 2 }
  f.capture.events.push({ type: 'NODE_EXPOSED', nodeKey: 'entry', historyIdentity: oldEntry.historyIdentity!, relativeTimeMs: 101 })
  for (const old of [...f.responses.filter(r => r.sceneKey !== 'entry'), { ...oldCommon, channelKey: 'optional', responseValue: 20 }]) f.capture.events.push({ type: 'RESPONSE_INVALIDATED', nodeKey: old.sceneKey, channelKey: old.channelKey, historyIdentity: old.historyIdentity!, relativeTimeMs: 102 })
  f.capture.events.push({ type: 'RESPONSE_CHANGED', nodeKey: 'entry', channelKey: 'choice', responseValue: 'B', responseRevision: 2, historyIdentity: oldEntry.historyIdentity!, relativeTimeMs: 103 })
  f.responses = [finalEntry, ...f.responses.filter(r => r.sceneKey === 'entry' && r.channelKey !== 'choice')]
  for (const sceneKey of ['right', 'common']) {
    const historyIdentity = situationalResponseHistoryIdentities(f.definition, f.responses).get(sceneKey)!
    f.capture.events.push({ type: 'NODE_EXPOSED', nodeKey: sceneKey, historyIdentity, relativeTimeMs: 104 })
    f.capture.events.push({ type: 'RESPONSE_FIRST_COMMITTED', nodeKey: sceneKey, channelKey: 'choice', responseValue: 'A', responseRevision: 1, historyIdentity, relativeTimeMs: 104 })
    f.responses.push({ sceneKey, channelKey: 'choice', responseValue: 'A', responseRevision: 1, historyIdentity })
  }
  expect(validateSituationalResearchCapture(f)).toEqual(f.capture)
  const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: 'synthetic', instrumentVersion: '1.0.0', definition })
  const raw = createSituationalRawSubmissionPayload({ attemptEpoch: 1, responses: f.responses, researchCapture: f.capture })
  const artifact = buildSituationalResearchArtifact({ attemptId: 'synthetic-attempt', attemptEpoch: 1, submissionPayloadHash: prepareCanonicalSubmission({ responses: f.responses, researchCapture: f.capture }).hash, snapshot, raw, grant: grant(f.definitionHash), pseudonymKey: 'a'.repeat(64) })
  expect(artifact.opportunities.find(o => o.sceneKey === 'common' && o.channelKey === 'optional')).toMatchObject({ firstEverResponse: 20, firstResponse: null, firstResponseStatus: 'NOT_ANSWERED', missingness: 'INVALIDATED_BY_HISTORY_CHANGE', invalidatedHistoricalResponses: 1 })
})
