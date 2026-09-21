import { z } from 'zod'
import { SCIENTIFIC_MATURITY_LEVELS } from '../../assessment-governance/scientific-maturity'

export const COGNITIVE_BLOCKER_DOMAINS = [
  'IDENTITY', 'REGISTRATION', 'PROFILE', 'PROTOCOL', 'ASSET', 'EXECUTION',
  'SCORING', 'METRIC', 'QUALITY', 'REPORT', 'PRESENTATION', 'GOVERNANCE',
  'SCIENTIFIC', 'COMPATIBILITY',
] as const
export const COGNITIVE_BLOCKER_GATES = [
  'TECHNICAL_BUILD', 'PILOT_PUBLISH', 'RESEARCH_READY', 'RESEARCH_GRADE',
] as const

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
const jsonValue: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValue), z.record(jsonValue),
]))

export const cognitiveBlockerV1Schema = z.object({
  schemaVersion: z.literal(1),
  code: z.string().regex(/^COG_[A-Z0-9_]+$/),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']),
  domain: z.enum(COGNITIVE_BLOCKER_DOMAINS),
  gate: z.enum(COGNITIVE_BLOCKER_GATES),
  file: z.string().min(1).optional(),
  fieldPath: z.string().min(1).optional(),
  message: z.string().min(1),
  expected: jsonValue.optional(),
  actual: jsonValue.optional(),
  remediation: z.object({
    type: z.enum(['EDIT_FIELD', 'ADD_FILE', 'ADD_EVIDENCE', 'HUMAN_REVIEW', 'PLATFORM_CAPABILITY']),
    hint: z.string().min(1).optional(),
  }).strict().optional(),
}).strict()
export type CognitiveBlockerV1 = z.infer<typeof cognitiveBlockerV1Schema>

const identitySchema = z.object({
  testType: z.string().min(1), engineVersion: z.string().min(1), scoringVersion: z.string().min(1),
}).strict()
const gateDecisionSchema = z.object({
  ready: z.boolean(), blockers: z.array(cognitiveBlockerV1Schema),
}).strict()

/** Transport contract only: a producer must finish its checks before composing a decision. */
export const cognitiveOnboardingDecisionV1Schema = z.object({
  schemaVersion: z.literal(1),
  identity: identitySchema,
  technical: gateDecisionSchema,
  pilotPublish: gateDecisionSchema,
  scientific: z.object({
    declaredMaturity: z.enum(SCIENTIFIC_MATURITY_LEVELS),
    maxEligibleMaturity: z.enum(SCIENTIFIC_MATURITY_LEVELS),
    declarationValid: z.boolean(),
    declarationBlockers: z.array(cognitiveBlockerV1Schema),
    blockersToNextTier: z.array(cognitiveBlockerV1Schema),
  }).strict(),
}).strict().superRefine((decision, context) => {
  const hasErrors = (blockers: CognitiveBlockerV1[]) => blockers.some(b => b.severity === 'ERROR')
  if (decision.technical.ready === hasErrors(decision.technical.blockers)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['technical', 'ready'], message: 'technical readiness must reflect its error blockers' })
  }
  if (decision.pilotPublish.ready !== (decision.technical.ready && !hasErrors(decision.pilotPublish.blockers))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['pilotPublish', 'ready'], message: 'Pilot readiness requires technical readiness and no publication error blockers' })
  }
  const valid = SCIENTIFIC_MATURITY_LEVELS.indexOf(decision.scientific.declaredMaturity)
    <= SCIENTIFIC_MATURITY_LEVELS.indexOf(decision.scientific.maxEligibleMaturity)
  if (decision.scientific.declarationValid !== valid || valid === hasErrors(decision.scientific.declarationBlockers)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['scientific', 'declarationValid'], message: 'declaration validity must match eligibility and its blockers' })
  }
  const groups = [
    ['technical', decision.technical.blockers, ['TECHNICAL_BUILD']],
    ['pilotPublish', decision.pilotPublish.blockers, ['PILOT_PUBLISH']],
    ['scientific', [...decision.scientific.declarationBlockers, ...decision.scientific.blockersToNextTier], ['RESEARCH_READY', 'RESEARCH_GRADE']],
  ] as const
  for (const [group, blockers, allowed] of groups) {
    for (const blocker of blockers) {
      if (!(allowed as readonly string[]).includes(blocker.gate)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [group], message: `blocker gate ${blocker.gate} is invalid for ${group}` })
      }
    }
  }
})
export type CognitiveOnboardingDecisionV1 = z.infer<typeof cognitiveOnboardingDecisionV1Schema>

/** Code-unit ordering avoids locale/machine differences; object keys are canonical too. */
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, item]) => [key, canonicalValue(item)]))
  }
  return value
}
const canonicalJson = (value: unknown): string => JSON.stringify(canonicalValue(value))

export const normalizeCognitiveBlockers = (input: readonly CognitiveBlockerV1[]): CognitiveBlockerV1[] => {
  const unique = new Map<string, CognitiveBlockerV1>()
  for (const value of input) {
    const blocker = cognitiveBlockerV1Schema.parse(value)
    unique.set(canonicalJson(blocker), blocker)
  }
  return [...unique.values()].sort((left, right) => {
    const leftKey = [left.gate, left.domain, left.file ?? '', left.fieldPath ?? '', left.code, left.severity]
    const rightKey = [right.gate, right.domain, right.file ?? '', right.fieldPath ?? '', right.code, right.severity]
    for (let index = 0; index < leftKey.length; index++) {
      const order = compare(leftKey[index], rightKey[index])
      if (order) return order
    }
    return compare(canonicalJson(left), canonicalJson(right))
  })
}

export interface CognitiveOnboardingFactsV1 {
  identity: CognitiveOnboardingDecisionV1['identity']
  /** No defaults: callers must supply results from both completed check groups. */
  technicalBlockers: CognitiveBlockerV1[]
  pilotPublishBlockers: CognitiveBlockerV1[]
  scientific: Pick<CognitiveOnboardingDecisionV1['scientific'], 'declaredMaturity' | 'maxEligibleMaturity' | 'blockersToNextTier'>
}

/** Pure composition, not scientific review, task validation or permission to publish. */
export const composeCognitiveOnboardingDecision = (facts: CognitiveOnboardingFactsV1): CognitiveOnboardingDecisionV1 => {
  const technicalBlockers = normalizeCognitiveBlockers(facts.technicalBlockers)
  const pilotPublishBlockers = normalizeCognitiveBlockers(facts.pilotPublishBlockers)
  const technicalReady = !technicalBlockers.some(b => b.severity === 'ERROR')
  const declarationValid = SCIENTIFIC_MATURITY_LEVELS.indexOf(facts.scientific.declaredMaturity)
    <= SCIENTIFIC_MATURITY_LEVELS.indexOf(facts.scientific.maxEligibleMaturity)
  return cognitiveOnboardingDecisionV1Schema.parse({
    schemaVersion: 1,
    identity: facts.identity,
    technical: { ready: technicalReady, blockers: technicalBlockers },
    pilotPublish: { ready: technicalReady && !pilotPublishBlockers.some(b => b.severity === 'ERROR'), blockers: pilotPublishBlockers },
    scientific: {
      ...facts.scientific,
      declarationValid,
      declarationBlockers: declarationValid ? [] : [{
        schemaVersion: 1,
        code: 'COG_SCIENTIFIC_DECLARATION_EXCEEDS_ELIGIBILITY',
        severity: 'ERROR', domain: 'GOVERNANCE',
        gate: facts.scientific.declaredMaturity === 'RESEARCH_GRADE' ? 'RESEARCH_GRADE' : 'RESEARCH_READY',
        fieldPath: 'declaredMaturity',
        message: 'Declared scientific maturity exceeds the eligibility supported by the supplied evidence.',
        expected: facts.scientific.maxEligibleMaturity, actual: facts.scientific.declaredMaturity,
        remediation: { type: 'HUMAN_REVIEW', hint: 'Review evidence scope and lower the declaration or supply applicable evidence; the system does not approve the scientific claim.' },
      }],
      blockersToNextTier: normalizeCognitiveBlockers(facts.scientific.blockersToNextTier),
    },
  })
}

export const serializeCognitiveOnboardingDecision = (decision: CognitiveOnboardingDecisionV1): string => {
  const parsed = cognitiveOnboardingDecisionV1Schema.parse(decision)
  parsed.technical.blockers = normalizeCognitiveBlockers(parsed.technical.blockers)
  parsed.pilotPublish.blockers = normalizeCognitiveBlockers(parsed.pilotPublish.blockers)
  parsed.scientific.declarationBlockers = normalizeCognitiveBlockers(parsed.scientific.declarationBlockers)
  parsed.scientific.blockersToNextTier = normalizeCognitiveBlockers(parsed.scientific.blockersToNextTier)
  return canonicalJson(parsed) + '\n'
}

/** Text and JSON render the same decision; technical and scientific gates stay separate. */
export const formatCognitiveOnboardingDecision = (decision: CognitiveOnboardingDecisionV1): string => {
  const parsed = JSON.parse(serializeCognitiveOnboardingDecision(decision)) as CognitiveOnboardingDecisionV1
  const lines = [
    `${parsed.identity.testType}/${parsed.identity.engineVersion}/${parsed.identity.scoringVersion}`,
    `technical: ${parsed.technical.ready ? 'PASS' : 'BLOCKED'}`,
    `pilotPublish: ${parsed.pilotPublish.ready ? 'PASS' : 'BLOCKED'}`,
    `scientific: declared=${parsed.scientific.declaredMaturity}, eligible=${parsed.scientific.maxEligibleMaturity}, declaration=${parsed.scientific.declarationValid ? 'VALID' : 'INVALID'}`,
  ]
  for (const blocker of [...parsed.technical.blockers, ...parsed.pilotPublish.blockers, ...parsed.scientific.declarationBlockers, ...parsed.scientific.blockersToNextTier]) {
    const location = [blocker.file, blocker.fieldPath].filter(Boolean).join(':')
    lines.push(`[${blocker.gate}/${blocker.severity}] ${blocker.code}${location ? ` (${location})` : ''}: ${blocker.message}`)
  }
  return lines.join('\n') + '\n'
}
