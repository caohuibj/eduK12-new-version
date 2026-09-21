import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import { computeProtocolSignature } from '../../modules/cognitive/v2/canonical'
import { hashResolvedConfig, mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { evaluateCognitiveProductReadiness } from '../../modules/cognitive/library/product-readiness'
import { buildQualityAssessment } from '../../modules/cognitive/v2/quality'

export const captureCompatibility = () => listCognitiveRegistryEntries().map(entry => {
  const definition = buildCognitiveV2TaskDefinition(entry)
  const runtime = compileCognitiveRuntime({ definition })
  const seed = COGNITIVE_SEEDS.find(s => s.testType === entry.testType && s.engineVersion === entry.engineVersion && s.scoringVersion === entry.scoringVersion)!
  if (!seed) throw new Error(`Missing baseline seed: ${entry.testType}`)
  return {
    identity: `${entry.testType}/${entry.engineVersion}/${entry.scoringVersion}`,
    runtime,
    protocolSignature: computeProtocolSignature(definition.protocol),
    profiles: Object.entries(entry.profiles).map(([profile, metadata]) => {
      const config = mergeProfileConfig(entry, seed.config, profile as 'standard')
      let emptyScore: unknown
      try { emptyScore = entry.score({ config, trials: [], randomSeed: 'compatibility-fixed-seed' }) }
      catch (error) { emptyScore = { error: (error as Error).message } }
      return { profile, metadata, config, configHash: hashResolvedConfig(config), emptyScore, maxTrials: entry.finalSubmission.maxTrials(config) }
    }),
    quality: Object.keys(definition.quality).map(key => ({ key, result: buildQualityAssessment({ flags: { [key]: true }, definitions: definition.quality }) })),
    readiness: evaluateCognitiveProductReadiness(definition, seed.config),
  }
}).sort((a,b) => a.identity.localeCompare(b.identity))
