import type { SituationDefinitionV1 } from './situation-definition'
import { createSituationalResponseValidator, scoreSituational, type SituationalResponse, type SituationalResultV1, type SituationalScoringOptions } from './situation-scoring'

export const SUPPORTED_SITUATIONAL_MODEL_VERSIONS = { PROVISIONAL_SCALAR: '1', EXPERT_KEY: '1' } as const

export function assertSituationalScorerAvailable(definition: Pick<SituationDefinitionV1, 'scoring'>): void {
  const model = definition.scoring.model
  if (!model) return
  if (!(model.modelKey in SUPPORTED_SITUATIONAL_MODEL_VERSIONS) || SUPPORTED_SITUATIONAL_MODEL_VERSIONS[model.modelKey as keyof typeof SUPPORTED_SITUATIONAL_MODEL_VERSIONS] !== model.modelVersion) throw new Error(`Unsupported Situational scorer: ${model.modelKey}@${model.modelVersion}; no scalar fallback`)
}

/** Pure bounded online calculation; calibration/training stays offline. */
export function scoreSituationalModel(definition: SituationDefinitionV1, responses: SituationalResponse[], options: SituationalScoringOptions & { independentSceneKeyBySceneKey?: Record<string, string> } = {}): SituationalResultV1 {
  assertSituationalScorerAvailable(definition)
  const model = definition.scoring.model
  if (!model) return scoreSituational(definition, responses, options)
  if (model.modelKey === 'PROVISIONAL_SCALAR') {
    const legacy = scoreSituational(definition, responses, options)
    return { ...legacy, metrics: legacy.metrics.map(m => ({ ...m, estimate: m.value, precision: { status: 'NOT_ESTIMATED', standardError: null, interval: null }, coverage: { numberOfOpportunities: m.expectedResponses.length, numberOfAnsweredOpportunities: m.answeredResponses.length, numberOfIndependentScenes: new Set(m.answeredResponses.map(k => options.independentSceneKeyBySceneKey?.[k.split(':')[0]!] ?? k.split(':')[0])).size }, maturity: 'PROVISIONAL' })), model: { modelKey: model.modelKey, modelVersion: model.modelVersion, scoringVersion: definition.scoring.scoringVersion } }
  }
  if (!options.responsesValidated) {
    const validate = createSituationalResponseValidator(definition), seen = new Set<string>()
    for (const response of responses) { validate(response); const pair = `${response.sceneKey}:${response.channelKey}`; if (seen.has(pair)) throw new Error(`Duplicate raw observation: ${pair}`); seen.add(pair) }
  }
  const byPair = new Map(responses.map(r => [`${r.sceneKey}:${r.channelKey}`, r]))
  const allowedPairs = new Set(definition.scenes.flatMap(s => s.channels.map(c => `${s.sceneKey}:${c.channelKey}`)))
  const entries = (model.expertKey ?? []).filter(e => allowedPairs.has(`${e.sceneKey}:${e.channelKey}`))
  const index = new Map<string, Map<string, Map<string, number>>>()
  for (const entry of entries) {
    let metric = index.get(entry.metricKey)
    if (!metric) { metric = new Map(); index.set(entry.metricKey, metric) }
    const pair = `${entry.sceneKey}:${entry.channelKey}`
    let options = metric.get(pair)
    if (!options) { options = new Map(); metric.set(pair, options) }
    options.set(entry.optionKey, entry.contribution)
  }
  const metrics = definition.scoring.publishedMetrics.map(metric => {
    const keys = index.get(metric.key) ?? new Map<string, Map<string, number>>()
    const expectedResponses = [...keys.keys()]
    const answeredResponses = expectedResponses.filter(k => byPair.has(k))
    const complete = expectedResponses.length > 0 && answeredResponses.length === expectedResponses.length
    const values = answeredResponses.map(pair => {
      const value = byPair.get(pair)?.responseValue
      const contribution = typeof value === 'string' ? keys.get(pair)?.get(value) : undefined
      if (contribution === undefined) throw new Error(`Missing frozen expert contribution: ${pair}:${metric.key}`)
      return contribution
    })
    const pairRanges = [...keys.values()].map(options => [...options.values()])
    const range = expectedResponses.length ? {
      min: pairRanges.reduce((sum, values) => sum + Math.min(...values), 0) / expectedResponses.length,
      max: pairRanges.reduce((sum, values) => sum + Math.max(...values), 0) / expectedResponses.length,
    } : null
    return { ...metric, value: complete ? values.reduce((a, b) => a + b, 0) / values.length : null, range, expectedResponses, answeredResponses, status: complete ? 'calculated' as const : 'not_calculable' as const,
      estimate: complete ? values.reduce((a, b) => a + b, 0) / values.length : null,
      precision: { status: 'NOT_ESTIMATED' as const, standardError: null, interval: null },
      coverage: { numberOfOpportunities: expectedResponses.length, numberOfAnsweredOpportunities: answeredResponses.length, numberOfIndependentScenes: new Set(answeredResponses.map(k => options.independentSceneKeyBySceneKey?.[k.split(':')[0]!] ?? k.split(':')[0])).size },
      maturity: 'PROVISIONAL' as const,
    }
  })
  const invalid = metrics.some(m => m.role === 'primary' && m.status === 'not_calculable')
  return { metrics, quality: { status: invalid ? 'invalid' : 'interpretable', flags: invalid ? ['metric_not_calculable'] : [] }, model: { modelKey: model.modelKey, modelVersion: model.modelVersion, scoringVersion: definition.scoring.scoringVersion } }
}
