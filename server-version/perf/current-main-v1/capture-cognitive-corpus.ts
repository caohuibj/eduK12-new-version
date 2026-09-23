/** Stable semantic baseline from the current registry and task-owned golden cases. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COGNITIVE_SEEDS } from '../../backend/prisma/seeds/cognitive'
import { captureCompatibility } from '../../backend/src/__tests__/cognitive/compatibility-capture'
import { listCognitiveRegistryEntries } from '../../backend/src/modules/cognitive/cognitive.registry'
import { hashResolvedConfig, mergeProfileConfig } from '../../backend/src/modules/cognitive/profile-freeze'

const root = resolve(import.meta.dirname, '../../backend')
const goldenPath = resolve(import.meta.dirname, 'cognitive-corpus.golden.json')
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function captureCognitiveCorpus() {
  const compatibility = captureCompatibility()
  const entries = listCognitiveRegistryEntries()
  assert.equal(compatibility.length, entries.length, 'registry capture must cover every entry')
  const corpus = compatibility.map((captured) => {
    const [testType, engineVersion, scoringVersion] = captured.identity.split('/')
    const entry = entries.find((item) => item.testType === testType && item.engineVersion === engineVersion && item.scoringVersion === scoringVersion)
    assert.ok(entry, `missing registry entry ${captured.identity}`)
    const seed = COGNITIVE_SEEDS.find((item) => item.testType === testType && item.engineVersion === engineVersion && item.scoringVersion === scoringVersion)
    assert.ok(seed, `missing seed ${captured.identity}`)
    const fixturePath = resolve(root, 'src/modules/cognitive/tasks', testType!, 'fixtures', `${engineVersion}-${scoringVersion}.json`)
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      identity: { testType: string; engineVersion: string; scoringVersion: string }
      cases: Array<{ name: string; input: { config: unknown; randomSeed: string; trials: unknown[] }; expected?: unknown; expectedError?: string }>
    }
    assert.equal(`${fixture.identity.testType}/${fixture.identity.engineVersion}/${fixture.identity.scoringVersion}`, captured.identity)
    const cases = fixture.cases.map((item) => {
      if (item.expectedError) {
        assert.throws(() => entry.score(item.input as never), (error: unknown) => (
          error instanceof Error && error.message === item.expectedError
        ), `${captured.identity}/${item.name} error drift`)
      } else {
        assert.ok(item.expected, `${captured.identity}/${item.name} has no expectation`)
        const scored = entry.score(item.input as never)
        assert.deepEqual(scored, item.expected, `${captured.identity}/${item.name} scorer drift`)
      }
      return {
        name: item.name, inputHash: sha(item.input),
        expectedScoreHash: item.expected ? sha(item.expected) : null,
        expectedError: item.expectedError || null,
        trialCount: item.input.trials.length,
      }
    })
    const profiles = (['experience', 'standard', 'research'] as const).map((profile) => {
      if (!entry.profiles[profile]) return { profile, support: 'UNSUPPORTED' as const }
      const config = mergeProfileConfig(entry, seed.config, profile)
      return {
        profile, support: 'SUPPORTED' as const,
        configHash: hashResolvedConfig(config),
        maxTrials: entry.finalSubmission.maxTrials(config),
        reportDefinitionHash: sha(entry.reportDefinition),
        profileDefinitionVersion: entry.profileDefinitionVersion,
      }
    })
    assert.equal(captured.runtime.compiledRuntimeHash.length, 64)
    return {
      identity: captured.identity,
      definitionHash: captured.runtime.sourceDefinitionHash,
      compiledRuntimeHash: captured.runtime.compiledRuntimeHash,
      protocolSignature: captured.protocolSignature,
      reportDefinitionHash: sha(captured.runtime.reportDefinition),
      profiles,
      cases,
    }
  }).sort((a, b) => a.identity.localeCompare(b.identity))
  const nback = COGNITIVE_SEEDS.find((entry) => entry.testType === 'nback' && entry.engineVersion === '1.0.0' && entry.scoringVersion === '1.0.0')
  const cpt = COGNITIVE_SEEDS.find((entry) => entry.testType === 'cpt' && entry.engineVersion === '1.0.0' && entry.scoringVersion === '1.0.0')
  assert.ok(nback && cpt)
  assert.equal((nback.config.trialCountByN as number[]).reduce((sum, count) => sum + count, 0), 100)
  assert.equal(cpt.config.totalTrials, 180)
  const bart = corpus.find((entry) => entry.identity === 'bart/1.0.0/1.1.0')
  assert.ok(bart?.cases.some((item) => item.trialCount > 1), 'BART variable trace case missing')
  return {
    schemaVersion: 1,
    historicalClasses: { nback100: hashResolvedConfig(nback.config), cpt180: hashResolvedConfig(cpt.config) },
    entries: corpus,
  }
}

const actual = captureCognitiveCorpus()
if (process.argv.includes('--update')) {
  writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`)
  console.log(JSON.stringify({ goldenPath, entries: actual.entries.length, cases: actual.entries.reduce((sum, entry) => sum + entry.cases.length, 0) }))
} else {
  const expected = JSON.parse(readFileSync(goldenPath, 'utf8'))
  assert.deepEqual(actual, expected, 'current-main cognitive semantic corpus drift')
  console.log(JSON.stringify({ entries: actual.entries.length, cases: actual.entries.reduce((sum, entry) => sum + entry.cases.length, 0), status: 'matched' }))
}
