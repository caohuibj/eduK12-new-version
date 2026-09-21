import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { cognitiveExecutionEntries } from '../../modules/cognitive/generated/execution'
import { validateExecutableFixtures } from '../../modules/cognitive/onboarding/fixtures'
const load = (e: (typeof cognitiveExecutionEntries)[number]) => {
  const file = `src/modules/cognitive/tasks/${e.testType}/fixtures/${e.engineVersion}-${e.scoringVersion}.json`
  return { file, fixture: JSON.parse(fs.readFileSync(file, 'utf8')) }
}
describe('task-owned executable onboarding evidence', () => {
  it.each(cognitiveExecutionEntries)(
    '$testType/$scoringVersion preserves golden, empty, insufficient and report behavior',
    (e) => {
      const { file, fixture } = load(e)
      const diagnostics = validateExecutableFixtures(e, fixture, file)
      expect(diagnostics.filter((b) => b.severity === 'ERROR')).toEqual([])
      expect(
        diagnostics.filter((b) => b.severity === 'WARNING').map((b) => b.code),
      ).toEqual(
        e.testType === 'bart'
          ? ['COG_LEGACY_FRACTIONAL_COUNT', 'COG_LEGACY_FRACTIONAL_COUNT']
          : [],
      )
    },
  )
  it.each([
    [
      'COG_FIXTURE_IDENTITY_MISMATCH',
      (f: any) => (f.identity.scoringVersion = 'unknown'),
    ],
    ['COG_FIXTURE_INVALID', (f: any) => (f.schemaVersion = 2)],
    ['COG_FIXTURE_CASE_MISSING', (f: any) => (f.cases[1].name = 'unrelated')],
    [
      'COG_BOUNDARY_FIXTURE_INVALID',
      (f: any) => (f.cases[1].input.trials = f.cases[0].input.trials),
    ],
    [
      'COG_SCORING_GOLDEN_MISMATCH',
      (f: any) => (f.cases[0].expected.score = -99),
    ],
    [
      'COG_FIXTURE_TRIAL_INVALID',
      (f: any) => (f.cases[0].input.trials[0].payload = { oops: true }),
    ],
    ['COG_FIXTURE_CONFIG_INVALID', (f: any) => (f.cases[0].input.config = {})],
  ])('fails closed with %s', (code, mutate) => {
    const e = cognitiveExecutionEntries[0],
      { file, fixture } = load(e)
    mutate(fixture)
    expect(
      validateExecutableFixtures(e, fixture, file).map((b) => b.code),
    ).toContain(code)
  })
})
