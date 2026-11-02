import { readFileSync } from 'node:fs'
import path from 'node:path'
import { executableFixtureSchema } from '../../modules/cognitive/onboarding/fixtures'
import { describe, expect, it } from 'vitest'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import {
  assertTaskContractValid,
  createSessionConfigSnapshot,
  createTrialEnvelope,
  listCognitiveV2TaskDefinitions,
  parseTrialEnvelope,
  type TaskDefinition,
} from '../../modules/cognitive/v2'

// Reuse the task-owned exact-version fixture. A testType-only payload silently
// applies legacy shapes to newer engines (for example sharegame and ICAR).
const fixtureFor = (definition: TaskDefinition) => {
  const file = path.resolve(__dirname, '../../modules/cognitive/tasks', definition.testType,
    'fixtures', `${definition.engineVersion}-${definition.scoringVersion}.json`)
  const fixture = executableFixtureSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  expect(fixture.identity).toEqual({ testType: definition.testType,
    engineVersion: definition.engineVersion, scoringVersion: definition.scoringVersion })
  const successful = fixture.cases.find(candidate => candidate.expectedError === undefined && candidate.input.trials.length > 0)
  expect(successful, file).toBeDefined()
  return successful!.input.trials[0]
}

const seedFor = (definition: TaskDefinition): typeof COGNITIVE_SEEDS[number] | undefined => (
  COGNITIVE_SEEDS.find((seed) => seed.testType === definition.testType
    && seed.engineVersion === definition.engineVersion
    && seed.scoringVersion === definition.scoringVersion)
)

describe('Cognitive v2 exact-identity contract smoke fixtures', () => {
  const definitions = listCognitiveV2TaskDefinitions()

  it('covers every registered exact identity with a seeded config and valid envelope payload', () => {
    const key = (entry: { testType: string; engineVersion: string; scoringVersion: string }) => `${entry.testType}/${entry.engineVersion}/${entry.scoringVersion}`
    expect(definitions.map(key).sort()).toEqual([...new Set(COGNITIVE_SEEDS.map(key))].sort())
    for (const definition of definitions) {
      const seed = seedFor(definition)
      expect(seed, `${definition.testType}/${definition.scoringVersion} is missing a seed fixture`).toBeTruthy()
      if (!seed) continue
      const snapshot = createSessionConfigSnapshot({
        definition,
        configVersion: seed.configVersion,
        config: seed.config,
      })
      expect(snapshot.protocolSignature).toMatch(/^[0-9a-f]{64}$/)
      const fixture = fixtureFor(definition)
      const payload = definition.trialSchema.parse(fixture.payload)
      const envelope = createTrialEnvelope({
        trialIndex: 0,
        phase: (payload as { phase?: 'test' | 'learning' | 'delayed' }).phase ?? definition.protocol.phases.find(phase => phase.persists)!.key,
        payload,
        startedAtPerfMs: 0,
        endedAtPerfMs: 25,
      })
      expect(parseTrialEnvelope(envelope).payload).toEqual(payload)
      expect(() => assertTaskContractValid(definition)).not.toThrow()
    }
  })
})
