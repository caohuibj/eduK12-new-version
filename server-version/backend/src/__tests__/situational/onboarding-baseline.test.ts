import { describe, expect, it } from 'vitest'
import baseline from './fixtures/onboarding-baseline.json'
import { getSituationPackage } from '../../modules/situational/situation-package.registry'
import { compileSituationRuntime } from '../../modules/assessment-runtime/compiler'
import { runnerSituationRuntimeDefinition } from '../../modules/situational/situation-runtime-definition'
import { scoreSituational } from '../../modules/situational/situation-scoring'

describe('SJT migration baseline captured from main a3098d8', () => {
  for (const prior of baseline) it(`preserves ${prior.key} execution and publication`, () => {
    const pkg = getSituationPackage(prior.key, prior.instrumentVersion)!
    expect(pkg.releaseStatus).toBe(prior.releaseStatus)
    expect(pkg.definition).toEqual(prior.definition)
    expect(pkg.goldenCases).toEqual(prior.goldenCases)
    expect(compileSituationRuntime({ instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion, definition: pkg.definition })).toEqual(prior.runtime)
    expect(runnerSituationRuntimeDefinition(pkg.definition)).toEqual(prior.runner)
    expect(pkg.goldenCases.map(g => scoreSituational(pkg.definition as any, g.responses))).toEqual(prior.results)
  })
})
