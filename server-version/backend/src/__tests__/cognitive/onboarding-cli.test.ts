import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  cognitiveOnboardingDecisionV1Schema,
  formatCognitiveOnboardingDecision,
} from '../../modules/cognitive/onboarding/decision'
function run(args: string[]) {
  return spawnSync(
    process.execPath,
    [
      '--import', 'tsx',
      'src/scripts/cognitive-onboarding-check.ts',
      ...args,
    ],
    { encoding: 'utf8', timeout: 30000 },
  )
}
describe('offline onboarding CLI transport', () => {
  it('returns deterministic fail-closed JSON for an undiscovered task', () => {
    const a = run(['NO_SUCH_TASK', '--json']),
      b = run(['NO_SUCH_TASK', '--json'])
    expect(a.status).toBe(1)
    expect(b.status).toBe(1)
    expect(a.error).toBeUndefined()
    expect(a.stderr).toContain('COG_SELECTION_INVALID_TASKS')
    expect(a.stdout).toBe(b.stdout)
    const decision = cognitiveOnboardingDecisionV1Schema.parse(
      JSON.parse(a.stdout),
    )
    expect(decision.technical.blockers.map((b) => b.code)).toContain(
      'COG_TASK_NOT_FOUND',
    )
    expect(decision.pilotPublish.ready).toBe(false)
    expect(decision.identity).toEqual({ testType: 'NO_SUCH_TASK', engineVersion: 'UNKNOWN', scoringVersion: 'UNKNOWN' })
    expect(run(['NO_SUCH_TASK']).stdout).toBe(
      formatCognitiveOnboardingDecision(decision),
    )
  }, 100000)
  it('requires an immutable base for content-only claims', () => {
    const result = run([
      'NO_SUCH_TASK',
      '--content-only',
      '--base',
      'main',
      '--json',
    ])
    expect(result.status).toBe(1)
    expect(result.error).toBeUndefined()
    expect(result.stderr).toContain('COG_COMPATIBILITY_BASE_REQUIRED')
    expect(
      JSON.parse(result.stdout).technical.blockers.map((b: any) => b.code),
    ).toContain('COG_COMPATIBILITY_BASE_REQUIRED')
  }, 35000)
  it('rejects an invalid base before acceptance even for a discovered legacy task', () => {
    const result = run(['reaction', '--content-only', '--base', 'main', '--json'])
    expect(result.status).toBe(1)
    expect(result.error).toBeUndefined()
    const decision = cognitiveOnboardingDecisionV1Schema.parse(JSON.parse(result.stdout))
    expect(decision.identity.testType).toBe('reaction')
    expect(decision.technical.blockers.map(blocker => blocker.code)).toEqual(['COG_COMPATIBILITY_BASE_REQUIRED'])
    expect(decision.technical.ready).toBe(false)
    expect(decision.pilotPublish.ready).toBe(false)
  }, 35000)
  it.each([
    ['--tasks', 'NO_SUCH_TASK'],
    ['--tasks-json', '{"tasks":["reaction","NO_SUCH_TASK"]}'],
  ])('preserves the atomic batch failure envelope for %s', (flag, value) => {
    const result = run([flag, value, '--json'])
    expect(result.status).toBe(1)
    expect(result.error).toBeUndefined()
    expect(result.stderr).toContain('COG_SELECTION_INVALID_TASKS')
    expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 1, kind: 'cognitive-onboarding-batch',
      selectedTasks: [], selectedIdentities: [], identityResults: [], decisions: [],
      checks: [{ name: 'batch-completion', status: 'FAIL' }], selectionIsScopeEvidence: false, exitCode: 1 })
  }, 35000)
})
