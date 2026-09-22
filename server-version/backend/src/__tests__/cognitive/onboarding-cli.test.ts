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
      'node_modules/tsx/dist/cli.mjs',
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
    expect(a.stdout).toBe(b.stdout)
    const decision = cognitiveOnboardingDecisionV1Schema.parse(
      JSON.parse(a.stdout),
    )
    expect(decision.technical.blockers.map((b) => b.code)).toContain(
      'COG_TASK_NOT_FOUND',
    )
    expect(decision.pilotPublish.ready).toBe(false)
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
    expect(
      JSON.parse(result.stdout).technical.blockers.map((b: any) => b.code),
    ).toContain('COG_COMPATIBILITY_BASE_REQUIRED')
  }, 35000)
})
