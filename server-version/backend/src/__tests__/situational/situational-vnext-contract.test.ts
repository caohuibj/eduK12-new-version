import { describe, it, expect } from 'vitest'
import { scientificFixture } from './vnext-fixture'
import { validateSituationRuntimeDefinition, asLinearSituationDefinition, hashSituationRuntimeDefinition } from '../../modules/situational/situation-runtime-definition'
import { freezeSituationalRuntimeAtAttemptStart, parseFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { deriveSituationalAssignment, assignedSituationalDefinition, assignedSituationalRunnerDefinition } from '../../modules/situational/situation-assignment'
import { scoreSituationalModel, assertSituationalScorerAvailable } from '../../modules/situational/situation-model-resolver'
import { deriveAuthoritativeSituationalTrajectory, projectReachableSituationDefinitionForScoring } from '../../modules/situational/situation-trajectory'
import { scoreSituational } from '../../modules/situational/situation-scoring'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-responsibility-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'

const errors = (d: unknown) => validateSituationRuntimeDefinition(d).issues.filter(i => i.severity === 'error')

describe('Situational VNext scientific contract', () => {
  it('supports one choice and three independent probes, freezes and strips scientific evidence from runner', () => {
    const d = scientificFixture()
    expect(errors(d)).toEqual([])
    const snapshot = freezeSituationalRuntimeAtAttemptStart({ instrumentKey: 'synthetic-vnext', instrumentVersion: '1.0.0', definition: d })
    expect(parseFrozenSituationalRuntimeSnapshot(snapshot)).toEqual(snapshot)
    expect(snapshot.runnerDefinition.scenes[0]?.channels).toHaveLength(4)
    expect(JSON.stringify(snapshot.runnerDefinition)).not.toMatch(/candidate|observable|expertKey|scoredConstruct|measurementRole/)
  })
  it.each(['limit', 'duplicate-stage', 'wrong-role', 'optional-routing', 'unknown-option', 'missing-key', 'forbidden', 'duplicate-key'])('rejects invalid %s combinations', kind => {
    const d = scientificFixture(), n = d.flow.nodes[0]!
    if (n.nodeType !== 'SCENE') throw new Error('fixture')
    if (kind === 'limit') d.scenes[0]!.measurementBundle!.maxTotalResponses = 3
    if (kind === 'duplicate-stage') n.responseStages![1]!.channelKeys = ['choice']
    if (kind === 'wrong-role') n.channelPolicies![1]!.interactionRole = 'DECISION'
    if (kind === 'optional-routing') n.channelPolicies![0]!.required = false
    if (kind === 'unknown-option') d.scoring.model!.expertKey![0]!.optionKey = 'unknown'
    if (kind === 'missing-key') d.scoring.model!.expertKey!.splice(0, 1)
    if (kind === 'duplicate-key') d.scoring.model!.expertKey!.push(d.scoring.model!.expertKey![0]!)
    if (kind === 'forbidden') { const c = d.scenes[0]!.channels[0]!; if (c.responseType === 'SINGLE_CHOICE') c.options[0]!.evidence!.opportunities[0]!.role = 'FORBIDDEN_INFERENCE' }
    expect(errors(d).length).toBeGreaterThan(0)
  })
  it('keeps one raw observation while producing explicit multi-construct provisional metrics', () => {
    const d = scientificFixture(), responses = ['entry', 'left', 'common'].map(sceneKey => ({ sceneKey, channelKey: 'choice', responseValue: 'A' }))
    responses.push({ sceneKey: 'entry', channelKey: 'probe1', responseValue: 80 as never })
    const trajectory = deriveAuthoritativeSituationalTrajectory(d, responses)
    const result = scoreSituationalModel(projectReachableSituationDefinitionForScoring(d, trajectory), responses, { responsesValidated: true })
    expect(responses).toHaveLength(4)
    expect(result.metrics.map(m => m.value)).toEqual([1, 2])
    expect(result.metrics[0]?.answeredResponses).toEqual(['entry:choice', 'left:choice', 'common:choice'])
    expect(result.metrics[0]?.precision?.standardError).toBeNull()
    expect(result.model?.modelVersion).toBe('1')
  })
  it('does not silently substitute scalar scoring for unsupported or uncalibrated models', () => {
    const d = scientificFixture()
    d.scoring.model!.modelKey = 'NOMINAL_MULTIDIMENSIONAL'
    expect(errors(d).some(e => e.path.includes('parameterSet'))).toBe(true)
    expect(() => assertSituationalScorerAvailable(asLinearSituationDefinition(d))).toThrow(/no scalar fallback/)
    d.scoring.model!.modelKey = 'EXPERT_KEY'; d.scoring.model!.modelVersion = '999'
    expect(() => assertSituationalScorerAvailable(asLinearSituationDefinition(d))).toThrow(/no scalar fallback/)
    expect(() => freezeSituationalRuntimeAtAttemptStart({ instrumentKey: 'synthetic', instrumentVersion: '1.0.0', definition: d })).toThrow(/no scalar fallback/)
  })
  it.each([SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE, SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE, SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE])('preserves legacy golden scoring for $key', pkg => {
    for (const golden of pkg.goldenCases) expect(scoreSituationalModel(pkg.definition, golden.responses)).toEqual(scoreSituational(pkg.definition, golden.responses))
  })
  it('freezes planned missingness, timing and compatible consequence assignment reproducibly', () => {
    const d = scientificFixture(), n = d.flow.nodes[0]!
    if (n.nodeType !== 'SCENE') throw new Error('fixture')
    n.stimulusVariants = [{ variantKey: 'v', compatibilityGroup: 'g', stimulus: { type: 'TEXT_V1', text: 'Synthetic alternative' } }]
    d.researchAssignment = { assignmentVersion: '1', groups: [{ groupKey: 'group', nodeKey: 'entry', variants: [{ variantKey: 'pre', weight: 1, probeTiming: 'PRE_CHOICE', omittedChannelKeys: ['probe3'], stimulusVariantKey: 'v' }] }] }
    expect(errors(d)).toEqual([])
    const hash = hashSituationRuntimeDefinition(d), manifest = deriveSituationalAssignment(d, 'attempt', hash)
    expect(manifest).toEqual(deriveSituationalAssignment(d, 'attempt', hash))
    expect(manifest.assignmentIdentity).not.toBe(deriveSituationalAssignment(d, 'other', hash).assignmentIdentity)
    const assigned = assignedSituationalDefinition(d, manifest)
    expect(assigned.scenes[0]!.channels.map(c => c.channelKey)).not.toContain('probe3')
    const runner = assignedSituationalRunnerDefinition(d, manifest)
    if (runner.schemaVersion !== 2 || runner.flow.nodes[0]!.nodeType !== 'SCENE') throw new Error('fixture')
    expect(runner.flow.nodes[0]!.responseStages![0]!.kind).toBe('PRE_CHOICE_PROBE')
    expect(runner.scenes[0]!.stimulus.text).toBe('Synthetic alternative')
    d.researchAssignment.groups[0]!.variants[0]!.omittedChannelKeys = ['choice']
    expect(errors(d).length).toBeGreaterThan(0)
  })
})


it('carries exact offline calibration without enabling an unavailable scorer, and rejects ambiguous refs', () => {
  const d = scientificFixture()
  d.scoring.model = { contractVersion: 'situational-model-v1', modelKey: 'NOMINAL_MULTIDIMENSIONAL', modelVersion: '1', parameterSet: { id: 'synthetic-latent', version: '1', hash: 'a'.repeat(64), calibration: { artifactRef: 'offline:synthetic', artifactHash: 'b'.repeat(64), population: 'synthetic', method: 'offline-only', calibratedAt: '2026-01-01T00:00:00Z' }, references: [{ sceneKey: 'entry', channelKey: 'choice', optionKey: 'A', constructKey: 'candidate.one', parameterRef: 'offline:item:one' }] } }
  expect(errors(d)).toEqual([])
  expect(() => freezeSituationalRuntimeAtAttemptStart({ instrumentKey: 'synthetic', instrumentVersion: '1.0.0', definition: d })).toThrow(/no scalar fallback/)
  d.scoring.model.parameterSet!.references.push(d.scoring.model.parameterSet!.references[0]!)
  expect(errors(d).some(e => /Duplicate option/.test(e.message))).toBe(true)
  d.scoring.model.parameterSet!.references.splice(1, 1)
  d.scoring.model.parameterSet!.references[0]!.constructKey = 'unknown'
  expect(errors(d).some(e => /lacks declared/.test(e.message))).toBe(true)
})
