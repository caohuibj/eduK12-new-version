import { cognitiveSeeds } from '../generated/seeds'
import { cognitiveGovernance } from '../generated/scientific'
import { evaluateScopedCognitiveQualification } from '../onboarding/governance'
import type { TaskDefinition } from '../v2/types'
import { evaluateScientificQualification } from '../../assessment-governance/scientific-qualification'
export const evaluateCognitiveScientificQualification = (
  definition: TaskDefinition,
) => {
  const governance = cognitiveGovernance.find(
    (g) =>
      g.testType === definition.testType &&
      g.engineVersion === definition.engineVersion &&
      g.scoringVersion === definition.scoringVersion,
  )
  const seeds = cognitiveSeeds.filter(
    (s) =>
      s.testType === definition.testType &&
      s.engineVersion === definition.engineVersion &&
      s.scoringVersion === definition.scoringVersion,
  )
  const versions = new Set(
    seeds.flatMap((seed) =>
      (governance?.claimScope?.profiles ?? ['standard']).map((profile) => {
        const config = {
          ...(seed.config as Record<string, unknown>),
          ...definition.profiles[profile as keyof typeof definition.profiles]
            ?.configPatch,
        }
        return typeof config.stimulusSetVersion === 'string'
          ? config.stimulusSetVersion
          : 'none'
      }),
    ),
  )
  const stimulusVersion = versions.size === 1 ? [...versions][0] : undefined
  return governance
    ? evaluateScopedCognitiveQualification(
        definition,
        governance,
        stimulusVersion,
      )
    : evaluateScientificQualification({
        hasResearchFoundation: false,
        hasTraceableProvenance: false,
        hasEmpiricalReference: false,
        hasFormalResearchOutput: false,
      })
}
