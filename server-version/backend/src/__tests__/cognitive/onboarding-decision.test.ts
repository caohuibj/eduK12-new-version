import { describe, expect, it } from 'vitest'
import {
  cognitiveBlockerV1Schema, cognitiveOnboardingDecisionV1Schema,
  composeCognitiveOnboardingDecision, formatCognitiveOnboardingDecision,
  normalizeCognitiveBlockers, serializeCognitiveOnboardingDecision,
  type CognitiveBlockerV1, type CognitiveOnboardingFactsV1,
} from '../../modules/cognitive/onboarding/decision'
const blocker = (overrides: Partial<CognitiveBlockerV1> = {}): CognitiveBlockerV1 => ({
  schemaVersion: 1, code: 'COG_METRIC_PRIMARY_OUTPUT_MISSING', severity: 'ERROR',
  domain: 'METRIC', gate: 'TECHNICAL_BUILD', file: 'tasks/example/fixtures.ts',
  fieldPath: 'metrics.accuracy', message: 'Primary scorer output is missing.',
  remediation: { type: 'EDIT_FIELD', hint: 'Produce the declared metric in the normal fixture.' },
  ...overrides,
})
const facts = (): CognitiveOnboardingFactsV1 => ({
  identity: { testType: 'example', engineVersion: '1.0.0', scoringVersion: '1.0.0' },
  technicalBlockers: [], pilotPublishBlockers: [],
  scientific: { declaredMaturity: 'PILOT', maxEligibleMaturity: 'PILOT', blockersToNextTier: [] },
})
describe('Cognitive onboarding decision v1 contract', () => {
  it('keeps technical, Pilot publication and scientific eligibility independent', () => {
    const input = facts()
    input.scientific.blockersToNextTier = [blocker({domain:'SCIENTIFIC',gate:'RESEARCH_READY',code:'COG_RESEARCH_FOUNDATION_MISSING'})]
    const decision = composeCognitiveOnboardingDecision(input)
    expect(decision.technical.ready).toBe(true)
    expect(decision.pilotPublish.ready).toBe(true)
    expect(decision.scientific.maxEligibleMaturity).toBe('PILOT')
    expect(decision.scientific.declarationValid).toBe(true)
  })
  it('technical errors prevent Pilot readiness without mislabeling their gate', () => {
    const input = facts(); input.technicalBlockers = [blocker()]
    const result = composeCognitiveOnboardingDecision(input)
    expect(result.technical.ready).toBe(false)
    expect(result.pilotPublish.ready).toBe(false)
    expect(result.technical.blockers[0].gate).toBe('TECHNICAL_BUILD')
    expect(result.pilotPublish.blockers).toEqual([])
  })
  it('Pilot errors do not become technical errors', () => {
    const input = facts(); input.pilotPublishBlockers = [blocker({gate:'PILOT_PUBLISH',domain:'PROFILE',code:'COG_PROFILE_STANDARD_MISSING'})]
    const result = composeCognitiveOnboardingDecision(input)
    expect(result.technical.ready).toBe(true)
    expect(result.pilotPublish.ready).toBe(false)
  })
  it('warnings and informational notes do not block a ready gate', () => {
    const input = facts(); input.technicalBlockers = [blocker({severity:'WARNING'}),blocker({severity:'INFO'})]
    expect(composeCognitiveOnboardingDecision(input).pilotPublish.ready).toBe(true)
  })
  it('reports an excessive declaration separately from readiness and next-tier work', () => {
    const input = facts(); input.scientific.declaredMaturity = 'RESEARCH_GRADE'
    const result = composeCognitiveOnboardingDecision(input)
    expect(result.pilotPublish.ready).toBe(true)
    expect(result.scientific.declarationValid).toBe(false)
    expect(result.scientific.declarationBlockers[0]).toMatchObject({code:'COG_SCIENTIFIC_DECLARATION_EXCEEDS_ELIGIBILITY',gate:'RESEARCH_GRADE',expected:'PILOT',actual:'RESEARCH_GRADE'})
    expect(result.scientific.blockersToNextTier).toEqual([])
  })
  it('produces byte-identical JSON regardless of blocker and object-key insertion order', () => {
    const a=blocker({expected:{z:2,a:1}}), b=blocker({code:'COG_PROFILE_STANDARD_MISSING',domain:'PROFILE',fieldPath:'profiles.standard'})
    const first=facts(),second=facts()
    first.technicalBlockers=[a,b,a];second.technicalBlockers=[b,blocker({expected:{a:1,z:2}})]
    expect(serializeCognitiveOnboardingDecision(composeCognitiveOnboardingDecision(first))).toBe(serializeCognitiveOnboardingDecision(composeCognitiveOnboardingDecision(second)))
    expect(first.technicalBlockers).toHaveLength(3)
  })
  it('does not collapse different expected/actual diagnoses sharing a code', () => {
    expect(normalizeCognitiveBlockers([blocker({actual:1}),blocker({actual:2})])).toHaveLength(2)
  })
  it('rejects contradictory externally supplied ready flags', () => {
    const result=composeCognitiveOnboardingDecision(facts())
    result.technical.blockers=[blocker()]
    expect(cognitiveOnboardingDecisionV1Schema.safeParse(result).success).toBe(false)
  })
  it('rejects a blocker put in the wrong gate group', () => {
    const input=facts();input.technicalBlockers=[blocker({gate:'RESEARCH_READY'})]
    expect(()=>composeCognitiveOnboardingDecision(input)).toThrow('invalid for technical')
  })
  it('rejects unsupported schemas, unknown fields and non-JSON payloads', () => {
    for(const value of [{...blocker(),schemaVersion:2},{...blocker(),aiApproved:true},{...blocker(),actual:Infinity},{...blocker(),expected:()=>true}]){
      expect(cognitiveBlockerV1Schema.safeParse(value).success).toBe(false)
    }
  })
  it('renders codes and locations from the same validated decision as JSON', () => {
    const input=facts();input.technicalBlockers=[blocker()]
    const result=composeCognitiveOnboardingDecision(input),text=formatCognitiveOnboardingDecision(result)
    expect(text).toContain('technical: BLOCKED')
    expect(text).toContain('pilotPublish: BLOCKED')
    expect(text).toContain('COG_METRIC_PRIMARY_OUTPUT_MISSING (tasks/example/fixtures.ts:metrics.accuracy)')
    expect(JSON.parse(serializeCognitiveOnboardingDecision(result)).technical.blockers[0].code).toBe('COG_METRIC_PRIMARY_OUTPUT_MISSING')
  })
})
