import { describe, expect, it } from 'vitest'
import { compileCognitiveRuntime, parseCompiledInstrumentRuntime } from '../../modules/assessment-runtime/compiler'
import { getCognitiveV2TaskDefinition, listCognitiveV2TaskDefinitions } from '../../modules/cognitive/v2/registry'

const oldMainEligibility = (definition: ReturnType<typeof getCognitiveV2TaskDefinition>) => {
  if (!definition) throw new Error('Cognitive definition is missing')
  return {
    ...definition,
    metrics: Object.fromEntries(Object.entries(definition.metrics).map(([key, metric]) => [
      key,
      {
        ...metric,
        // main@2ed9e4e used the broad primary/report fallback before the
        // exact RegistryEntry governance allowlist was introduced.
        referenceEligible: metric.role === 'primary'
          || definition.report.headlineMetrics.includes(key)
          || definition.report.userMetrics.includes(key),
      },
    ])),
  }
}

describe('Cognitive compiled identity governance audit', () => {
  it('measures old-main versus current hashes for all nine PUBLISHED identities', () => {
    const published = listCognitiveV2TaskDefinitions().filter((definition) => definition.publication.status === 'PUBLISHED')
    const rows = published.map((definition) => {
      const oldRuntime = compileCognitiveRuntime({ definition: oldMainEligibility(definition) })
      const newRuntime = compileCognitiveRuntime({ definition })
      return {
        task: `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`,
        oldRuntime,
        newRuntime,
      }
    })

    expect(rows).toHaveLength(9)
    expect(rows.map((row) => row.task)).toEqual(expect.arrayContaining([
      'reaction/1.0.0/1.1.0',
      'memory/1.0.0/1.1.0',
      'stroop/1.0.0/1.1.0',
      'gonogo/1.0.0/1.0.0',
      'cpt/1.0.0/1.0.0',
      'nback/1.0.0/1.0.0',
      'corsi/1.0.0/1.0.0',
      'sst/1.0.0/1.0.0',
      'taskswitch/1.0.0/1.0.0',
    ]))

    const changed = new Set(rows
      .filter((row) => row.oldRuntime.sourceDefinitionHash !== row.newRuntime.sourceDefinitionHash)
      .map((row) => row.task))
    expect(changed).toEqual(new Set([
      'reaction/1.0.0/1.1.0',
      'memory/1.0.0/1.1.0',
      'stroop/1.0.0/1.1.0',
      'nback/1.0.0/1.0.0',
      'corsi/1.0.0/1.0.0',
      'sst/1.0.0/1.0.0',
    ]))
    expect(rows.filter((row) => row.oldRuntime.sourceDefinitionHash !== row.newRuntime.sourceDefinitionHash)).toHaveLength(6)
    expect(rows.filter((row) => row.oldRuntime.sourceDefinitionHash === row.newRuntime.sourceDefinitionHash)).toHaveLength(3)
    expect(rows.every((row) => (
      (row.oldRuntime.sourceDefinitionHash !== row.newRuntime.sourceDefinitionHash)
      === (row.oldRuntime.compiledRuntimeHash !== row.newRuntime.compiledRuntimeHash)
    ))).toBe(true)
    expect(rows.every((row) => Object.values(row.newRuntime.metricDefinitions)
      .every((metric) => !Object.prototype.hasOwnProperty.call(metric, 'referenceEligible')))).toBe(true)
    expect(rows.every((row) => parseCompiledInstrumentRuntime(row.oldRuntime).compiledRuntimeHash === row.oldRuntime.compiledRuntimeHash)).toBe(true)
  })
})
