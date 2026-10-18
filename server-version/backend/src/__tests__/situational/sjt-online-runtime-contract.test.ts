import onlineFixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { compileSjtOnlineDocument, publicSjtOnlineMetadata } from '../../modules/situational/authoring/online'
import { freezeSituationalRuntimeAtAttemptStart, parseFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { describe, expect, it } from 'vitest'
import { situationalFinalSubmitSchema, situationalLegacyFinalSubmitSchema, situationalOnlineFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { createSituationalRawSubmissionPayload, createSituationalOnlineRawSubmissionPayload, parseSituationalRawSubmissionPayload } from '../../modules/situational/situational-raw-submission'
import { onlineSituationalTaskSatisfied, mergeSituationalTaskSatisfaction, SJT_ONLINE_PROTOCOL_FLAG, SJT_ONLINE_UNSATISFIED_FLAG } from '../../modules/situational/situational-task-satisfaction'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const identity = { submissionId: 'online-submission-0001', attemptEpoch: 1, definitionHash: 'a'.repeat(64) }
const online = { ...identity, responseProtocol: 'sjt-online-response-v1' as const }
const answered = { sceneKey: 'q', channelKey: 'c', status: 'ANSWERED' as const, responseValue: ['B', 'A'], responseTimeMs: 123, answeredAt: '2026-10-18T00:00:00Z' }

describe('online FINAL and raw boundary', () => {
  it('keeps legacy min-one and never accepts the online protocol in a legacy attempt', () => {
    expect(situationalFinalSubmitSchema.safeParse({ ...identity, responses: [] }).success).toBe(false)
    expect(situationalOnlineFinalSubmitSchema.safeParse({ ...online, responses: [] }).success).toBe(true)
    expect(situationalLegacyFinalSubmitSchema.safeParse({ ...online, responses: [{ sceneKey: 'q', channelKey: 'c', responseValue: 'A' }] }).success).toBe(false)
    expect(situationalOnlineFinalSubmitSchema.safeParse({ ...identity, responses: [answered] }).success).toBe(false)
  })
  it('requires explicit states and rejects scores, scalar numbers and contradictory values', () => {
    expect(situationalFinalSubmitSchema.safeParse({ ...online, responses: [answered] }).success).toBe(true)
    for (const response of [{ ...answered, score: 1 }, { ...answered, responseValue: 1 }, { ...answered, status: 'REFUSED' }, { ...answered, status: 'BLANK' }, { sceneKey: 'q', channelKey: 'c', status: 'ANSWERED' }]) {
      expect(situationalFinalSubmitSchema.safeParse({ ...online, responses: [response] }).success).toBe(false)
    }
  })
  it('keeps original selection order and timing in raw-v2, including explicit blanks', () => {
    const raw = createSituationalOnlineRawSubmissionPayload({ attemptEpoch: 1, responses: [], rawResponses: [answered, { sceneKey: 'q2', channelKey: 'c2', status: 'BLANK' }] })
    expect(parseSituationalRawSubmissionPayload(raw)).toEqual(raw)
    expect(raw.rawResponses[0]).toEqual(answered)
    expect(raw.schemaVersion).toBe(2)
    expect(createSituationalOnlineRawSubmissionPayload({ attemptEpoch: 1, responses: [], rawResponses: [] }).rawResponses).toEqual([])
    expect(() => createSituationalRawSubmissionPayload({ attemptEpoch: 1, responses: [] })).toThrow()
    const legacy = createSituationalRawSubmissionPayload({ attemptEpoch: 1, responses: [{ sceneKey: 'q', channelKey: 'c', responseValue: 'A' }] })
    expect(legacy).toEqual({ schemaVersion: 1, attemptEpoch: 1, responses: [{ sceneKey: 'q', channelKey: 'c', responseValue: 'A' }] })
  })
})

describe('online task qualification', () => {
  const definition = structuredClone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition)
  for (const scene of definition.scenes) for (const channel of scene.channels) {
    if (channel.responseType === 'SINGLE_CHOICE') channel.options.push({ optionKey: 'REFUSE', label: '不愿回答', nonanswerReason: 'DECLINED' } as typeof channel.options[number])
  }
  const substantive = { sceneKey: definition.scenes[0].sceneKey, channelKey: definition.scenes[0].channels[0].channelKey, responseValue: 'A' }
  const refused = { sceneKey: definition.scenes[1].sceneKey, channelKey: definition.scenes[1].channels[0].channelKey, responseValue: 'REFUSE' }
  it('does not turn empty or refusal-only submission into satisfaction', () => {
    expect(onlineSituationalTaskSatisfied(definition, [], [])).toBe(false)
    expect(onlineSituationalTaskSatisfied(definition, [refused], [])).toBe(false)
    expect(onlineSituationalTaskSatisfied(definition, [substantive, refused], [])).toBe(true)
    const required = structuredClone(definition)
    expect(onlineSituationalTaskSatisfied(required, [substantive, refused], [refused.channelKey])).toBe(false)
  })
  it('combines online and form qualification while preserving legacy null', () => {
    const core = (flags: string[]) => ({ unitType: 'SITUATIONAL' as const, quality: { status: 'invalid' as const, flags } })
    expect(mergeSituationalTaskSatisfaction(null, [core([])])).toBe(null)
    expect(mergeSituationalTaskSatisfaction(null, [core([SJT_ONLINE_UNSATISFIED_FLAG])])).toBe(null)
    expect(mergeSituationalTaskSatisfaction(null, [core([SJT_ONLINE_PROTOCOL_FLAG])])).toBe('SATISFIED')
    expect(mergeSituationalTaskSatisfaction('SATISFIED', [core([SJT_ONLINE_PROTOCOL_FLAG, SJT_ONLINE_UNSATISFIED_FLAG])])).toBe('NOT_SATISFIED')
    expect(mergeSituationalTaskSatisfaction('NOT_SATISFIED', [core([SJT_ONLINE_PROTOCOL_FLAG])])).toBe('NOT_SATISFIED')
  })
})


describe('online frozen identity', () => {
  it('round-trips protected metadata and rejects altered protocol, display or source digest', () => {
    const compiled = compileSjtOnlineDocument(onlineFixture)
    const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: compiled.package.key, instrumentVersion: compiled.package.instrumentVersion, definition: compiled.package.definition, online: compiled.package.online, frozenAt: new Date('2026-10-18T00:00:00Z') })
    expect(parseFrozenSituationalRuntimeSnapshot(snapshot)).toEqual(snapshot)
    const publicJson = JSON.stringify(publicSjtOnlineMetadata(snapshot.online!))
    expect(publicJson).not.toContain('contributions')
    expect(publicJson).not.toContain('expertKey')
    for (const change of [
      (s: any) => { s.online.responseProtocol = 'legacy' },
      (s: any) => { s.online.compilerVersion = 'forged' },
      (s: any) => { s.online.definitionHash = '0'.repeat(64) },
      (s: any) => { s.online.display.scenes[0].title = 'changed' },
    ]) {
      const tampered = structuredClone(snapshot)
      change(tampered)
      expect(() => parseFrozenSituationalRuntimeSnapshot(tampered)).toThrow()
    }
  })
  it('keeps the pre-online unsigned legacy structure exactly unchanged', () => {
    const pkg = SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE
    const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion, definition: pkg.definition, frozenAt: new Date('2026-10-18T00:00:00Z') })
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'online')).toBe(false)
    const { snapshotHash, ...oldUnsigned } = snapshot
    expect(canonicalHash(oldUnsigned)).toBe(snapshotHash)
    expect(parseFrozenSituationalRuntimeSnapshot(snapshot)).toEqual(snapshot)
  })
})
