import { describe, expect, it } from 'vitest'
import { compileSituationRuntime } from '../../modules/assessment-runtime/compiler'
import {
  freezeSituationalRuntimeAtAttemptStart,
  parseFrozenSituationalRuntimeSnapshot,
} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { normalizeSituationalResponses } from '../../modules/situational/situational-final-submit.service'
import { scoreSituational, type SituationalResponse } from '../../modules/situational/situation-scoring'
import {
  deriveAuthoritativeSituationalTrajectory,
  projectReachableSituationDefinitionForScoring,
} from '../../modules/situational/situation-trajectory'
import { hashSituationRuntimeDefinition } from '../../modules/situational/situation-runtime-definition'
import type { SituationDefinitionV2 } from '../../modules/situational/situation-branching'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const branchingDefinition = (): SituationDefinitionV2 => {
  const source = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
  const decisionChannel = source.scenes[0]!.channels[0]!
  if (decisionChannel.responseType !== 'SINGLE_CHOICE') throw new Error('fixture requires SINGLE_CHOICE')
  return {
    ...source,
    schemaVersion: 2,
    sampling: { strategy: 'BRANCH_REACHABLE' },
    flow: {
      strategy: 'BRANCHING_DAG_V1',
      entryNodeKey: 'node-as-01',
      nodes: [
        {
          nodeType: 'SCENE',
          nodeKey: 'node-as-01',
          sceneKey: 'AS-01',
          motherSceneKey: 'mother-assertiveness',
          roundKey: 'round-1',
          stepKey: 'decision',
          transition: {
            type: 'DECISION',
            channelKey: decisionChannel.channelKey,
            branches: decisionChannel.options.map((option, index) => ({
              optionKey: option.optionKey,
              nextNodeKey: index % 2 === 0 ? 'node-as-02' : 'terminal-early',
            })),
          },
        },
        {
          nodeType: 'SCENE',
          nodeKey: 'node-as-02',
          sceneKey: 'AS-02',
          motherSceneKey: 'mother-assertiveness',
          roundKey: 'round-2',
          stepKey: 'follow-up',
          transition: { type: 'NEXT', nextNodeKey: 'terminal-complete' },
        },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-early' },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-complete' },
      ],
    },
  }
}

const response = (sceneKey: string, responseValue: string): SituationalResponse => ({
  sceneKey,
  channelKey: 'behavior',
  responseValue,
})

describe('Situational V2 authoritative trajectory FINAL', () => {
  it('freezes the full graph into the existing unified snapshot and compiler identity', () => {
    const definition = branchingDefinition()
    const runtime = compileSituationRuntime({
      instrumentKey: 'branching-fixture',
      instrumentVersion: '2.0.0',
      definition,
    })
    expect(runtime.sourceDefinitionHash).toBe(hashSituationRuntimeDefinition(definition))

    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: 'branching-fixture',
      instrumentVersion: '2.0.0',
      definition,
      frozenAt: new Date('2026-09-09T00:00:00.000Z'),
    })
    expect(snapshot.runtimeGeneration).toBe('UNIFIED_V1')
    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.definition.schemaVersion).toBe(2)
    expect(snapshot.runnerDefinition.schemaVersion).toBe(2)
    expect(snapshot.definitionHash).toBe(hashSituationRuntimeDefinition(definition))
    expect(parseFrozenSituationalRuntimeSnapshot(snapshot)).toEqual(snapshot)
  })

  it('rebuilds a complete two-scene path and reuses the existing scorer on reachable scenes', () => {
    const definition = branchingDefinition()
    const submitted = [response('AS-02', 'A'), response('AS-01', 'A')]
    const normalized = normalizeSituationalResponses(definition, submitted)
    expect(normalized.map((entry) => entry.sceneKey)).toEqual(['AS-01', 'AS-02'])

    const trajectory = deriveAuthoritativeSituationalTrajectory(definition, normalized)
    expect(trajectory).toEqual({
      nodeKeys: ['node-as-01', 'node-as-02', 'terminal-complete'],
      sceneKeys: ['AS-01', 'AS-02'],
      terminalNodeKey: 'terminal-complete',
      reachedTerminal: true,
    })
    const result = scoreSituational(
      projectReachableSituationDefinitionForScoring(definition, trajectory),
      normalized,
      { responsesValidated: true },
    )
    expect(result.quality.status).toBe('interpretable')
    expect(result.metrics[0]?.value).toBe(1.5)
  })

  it('accepts an early terminal using only reachable responses', () => {
    const definition = branchingDefinition()
    const normalized = normalizeSituationalResponses(definition, [response('AS-01', 'B')])
    expect(normalized.map((entry) => entry.sceneKey)).toEqual(['AS-01'])

    const trajectory = deriveAuthoritativeSituationalTrajectory(definition, normalized)
    expect(trajectory.sceneKeys).toEqual(['AS-01'])
    expect(trajectory.terminalNodeKey).toBe('terminal-early')
    const result = scoreSituational(
      projectReachableSituationDefinitionForScoring(definition, trajectory),
      normalized,
      { responsesValidated: true },
    )
    expect(result.quality.status).toBe('interpretable')
    expect(result.metrics[0]?.value).toBe(0.5)
  })

  it('rejects off-path downstream answers even when the chosen path reached a terminal', () => {
    const definition = branchingDefinition()
    expect(() => normalizeSituationalResponses(definition, [
      response('AS-01', 'B'),
      response('AS-02', 'A'),
    ])).toThrow(/当前分支不可达回答/)
  })

  it('rejects a FINAL that has not reached a terminal', () => {
    const definition = branchingDefinition()
    expect(() => normalizeSituationalResponses(definition, [response('AS-01', 'A')]))
      .toThrow(/尚未到达结束节点/)
  })

  it('preserves V1 all-scene normalization semantics', () => {
    const normalized = normalizeSituationalResponses(
      SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION,
      [response('AS-02', 'D'), response('AS-01', 'A')],
    )
    expect(normalized.map((entry) => entry.sceneKey)).toEqual(['AS-01', 'AS-02'])
  })
})
