import { z } from 'zod'
import { SCIENTIFIC_MATURITY_LEVELS } from '../../assessment-governance/scientific-maturity'
import { evaluateScientificQualification } from '../../assessment-governance/scientific-qualification'
import { computeProtocolSignature } from '../v2/canonical'
import type { TaskDefinition } from '../v2/types'
import type { CognitiveBlockerV1 } from './decision'
const identity = z
  .object({
    testType: z.string().min(1),
    engineVersion: z.string().min(1),
    scoringVersion: z.string().min(1),
  })
  .strict()
const scope = z
  .object({
    profiles: z.array(z.enum(['experience', 'standard', 'research'])).min(1),
    protocolSignature: z.string().regex(/^[0-9a-f]{64}$/),
    stimulusVersion: z.string().min(1),
    populationScope: z.string().min(1),
  })
  .strict()
export const cognitiveGovernanceSchema = identity
  .extend({
    schemaVersion: z.literal(1),
    declaredMaturity: z.enum(SCIENTIFIC_MATURITY_LEVELS),
    claimScope: scope.nullable(),
    protocolApplicability: z.string(),
    knownLimitations: z.array(z.string()),
    evidence: z.array(
      z
        .object({
          kind: z.enum([
            'RESEARCH_FOUNDATION',
            'PROVENANCE',
            'EMPIRICAL_REFERENCE',
            'FORMAL_OUTPUT',
          ]),
          reference: z.string().min(1),
          identity,
          scope,
        })
        .strict(),
    ),
  })
  .strict()
export type CognitiveGovernanceV1 = z.infer<typeof cognitiveGovernanceSchema>
export const evaluateScopedCognitiveQualification = (
  definition: TaskDefinition,
  governance: CognitiveGovernanceV1,
  stimulusVersion: string | undefined,
) => {
  const g = cognitiveGovernanceSchema.parse(governance),
    s = g.claimScope
  const sameIdentity = (i: z.infer<typeof identity>) =>
    i.testType === definition.testType &&
    i.engineVersion === definition.engineVersion &&
    i.scoringVersion === definition.scoringVersion
  const applicable = Boolean(
    s &&
      sameIdentity(g) &&
      g.protocolApplicability.trim() &&
      s.protocolSignature === computeProtocolSignature(definition.protocol) &&
      s.profiles.every((p) => definition.profiles[p]) &&
      new Set(s.profiles).size === s.profiles.length &&
      stimulusVersion !== undefined &&
      s.stimulusVersion === stimulusVersion,
  )
  const evidence = applicable
    ? g.evidence.filter(
        (e) =>
          sameIdentity(e.identity) &&
          e.scope.protocolSignature === s!.protocolSignature &&
          e.scope.stimulusVersion === s!.stimulusVersion &&
          e.scope.populationScope === s!.populationScope &&
          s!.profiles.every((p) => e.scope.profiles.includes(p)),
      )
    : []
  const has = (kind: CognitiveGovernanceV1['evidence'][number]['kind']) =>
    evidence.some((e) => e.kind === kind)
  const qualification = evaluateScientificQualification({
    hasResearchFoundation: has('RESEARCH_FOUNDATION'),
    hasTraceableProvenance: has('PROVENANCE'),
    hasEmpiricalReference: has('EMPIRICAL_REFERENCE'),
    hasFormalResearchOutput: has('FORMAL_OUTPUT'),
  })
  const next =
    qualification.maxEligibleMaturity === 'PILOT'
      ? 'RESEARCH_READY'
      : qualification.maxEligibleMaturity === 'RESEARCH_READY'
        ? 'RESEARCH_GRADE'
        : null
  const codes =
    next === 'RESEARCH_READY'
      ? qualification.researchReady.blockers
      : next === 'RESEARCH_GRADE'
        ? qualification.researchGrade.blockers
        : []
  const blockersToNextTier: CognitiveBlockerV1[] = next
    ? [
        ...(!applicable ? ['EVIDENCE_SCOPE_OR_APPLICABILITY_MISSING'] : []),
        ...codes,
      ].map((code) => ({
        schemaVersion: 1,
        code: `COG_${code}`,
        severity: 'ERROR',
        domain: 'SCIENTIFIC',
        gate: next,
        fieldPath: !applicable ? 'claimScope' : 'evidence',
        message: code.replace(/_/g, ' ').toLowerCase(),
        remediation: {
          type: 'ADD_EVIDENCE',
          hint: 'Supply human-reviewed evidence for the exact identity, profile, protocol, stimulus and population scope.',
        },
      }))
    : []
  return { ...qualification, blockersToNextTier }
}
