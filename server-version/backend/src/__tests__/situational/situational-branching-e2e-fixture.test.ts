import { describe, expect, it } from 'vitest'
import { runnerSituationRuntimeDefinition } from '../../modules/situational/situation-runtime-definition'
import {
  deriveAuthoritativeSituationalTrajectory,
  projectReachableSituationDefinitionForScoring,
} from '../../modules/situational/situation-trajectory'
import { scoreSituational } from '../../modules/situational/situation-scoring'
import { validateSituationPackage } from '../../modules/situational/situation-package.registry'
import {
  SJT_BRANCHING_E2E_DEFINITION,
  SJT_BRANCHING_E2E_GOLDEN_CASES,
  SJT_BRANCHING_E2E_PACKAGE,
} from '../../modules/situational/packages/sjt-branching-e2e-fixture'

describe('SIT-V2-E branching browser fixture', () => {
  it('passes the existing V2 package publication gate', () => {
    const validation = validateSituationPackage(SJT_BRANCHING_E2E_PACKAGE)
    expect(validation.valid).toBe(true)
    expect(validation.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('projects only runner-safe branch and presentation metadata', () => {
    const runner = runnerSituationRuntimeDefinition(SJT_BRANCHING_E2E_DEFINITION)
    expect(runner.schemaVersion).toBe(2)
    expect(runner.sampling).toEqual({ strategy: 'BRANCH_REACHABLE' })
    expect(runner.flow.nodes).toHaveLength(7)

    const serialized = JSON.stringify(runner)
    expect(serialized).toContain('IMAGE')
    expect(serialized).toContain('COMIC')
    expect(serialized).toContain('DIAGNOSTIC')
    expect(serialized).toContain('"required":false')
    expect(serialized).not.toContain('ROUTING_ONLY')
    expect(serialized).not.toContain('measurementRole')
    expect(serialized).not.toContain('choiceScores')
  })

  it('derives the long multi-round path and scores only its scored channels', () => {
    const fixture = SJT_BRANCHING_E2E_GOLDEN_CASES[0]!
    const trajectory = deriveAuthoritativeSituationalTrajectory(
      SJT_BRANCHING_E2E_DEFINITION,
      fixture.responses,
    )
    expect(trajectory.reachedTerminal).toBe(true)
    expect(trajectory.sceneKeys).toEqual(['BR-01', 'BR-02', 'BR-03', 'BR-04'])
    expect(trajectory.terminalNodeKey).toBe('terminal-complete')

    const scoringDefinition = projectReachableSituationDefinitionForScoring(
      SJT_BRANCHING_E2E_DEFINITION,
      trajectory,
    )
    expect(scoringDefinition.scenes.map((scene) => scene.sceneKey)).toEqual(['BR-02', 'BR-04'])
    expect(scoringDefinition.scenes.flatMap((scene) => (
      scene.channels.map((channel) => `${scene.sceneKey}:${channel.channelKey}`)
    ))).toEqual(['BR-02:behavior', 'BR-04:behavior'])

    const scoredPairs = new Set(['BR-02:behavior', 'BR-04:behavior'])
    const result = scoreSituational(
      scoringDefinition,
      fixture.responses.filter((response) => scoredPairs.has(`${response.sceneKey}:${response.channelKey}`)),
      { responsesValidated: true },
    )
    expect(result.quality.status).toBe('interpretable')
    expect(result.metrics[0]?.value).toBe(1.5)
  })
})
