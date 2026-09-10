import { describe, expect, it } from 'vitest'
import {
  freezeSituationalRuntimeAtAttemptStart,
  parseFrozenSituationalRuntimeSnapshot,
} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import {
  normalizeSituationalResponses,
} from '../../modules/situational/situational-final-submit.service'
import {
  runnerBranchingSituationDefinition,
  validateBranchingSituationDefinition,
  type SituationDefinitionV2,
} from '../../modules/situational/situation-branching'
import {
  scoreSituational,
  type SituationalResponse,
} from '../../modules/situational/situation-scoring'
import {
  deriveAuthoritativeSituationalTrajectory,
  projectReachableSituationDefinitionForScoring,
  requiredReachableSituationalResponseKeys,
} from '../../modules/situational/situation-trajectory'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const diagnosticDefinition = (): SituationDefinitionV2 => {
  const source = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
  const round2 = clone(source.scenes[1]!)
  round2.sceneKey = 'AS-03'
  round2.sortOrder = 2
  round2.title = '第二轮：新的公开表达情境'

  source.scenes[1]!.channels.push({
    channelKey: 'confidence',
    purpose: 'CONFIDENCE',
    responseType: 'CONTINUOUS',
    scoredConstruct: 'bfi2.assertiveness',
    prompt: '如果愿意补充，你对刚才判断有多大把握？',
    range: { min: 0, max: 100 },
    scoringDirection: 'POSITIVE',
  })
  source.scenes.push(round2)

  const as01ChoiceScores = source.scoring.choiceScores.filter((entry) => entry.sceneKey === 'AS-01')
  source.scoring.choiceScores = source.scoring.choiceScores
    .filter((entry) => entry.sceneKey !== 'AS-01')
    .concat(as01ChoiceScores.map((entry) => ({ ...entry, sceneKey: 'AS-03' })))

  const decisionChannel = source.scenes[0]!.channels[0]!
  if (decisionChannel.responseType !== 'SINGLE_CHOICE') throw new Error('fixture requires SINGLE_CHOICE')

  return {
    ...source,
    schemaVersion: 2,
    sampling: { strategy: 'BRANCH_REACHABLE' },
    flow: {
      strategy: 'BRANCHING_DAG_V1',
      entryNodeKey: 'node-decision',
      nodes: [
        {
          nodeType: 'SCENE',
          nodeKey: 'node-decision',
          sceneKey: 'AS-01',
          motherSceneKey: 'mother-assertiveness',
          roundKey: 'round-1',
          stepKey: 'decision',
          interactionRole: 'DECISION',
          channelPolicies: [{ channelKey: 'behavior', measurementRole: 'ROUTING_ONLY', required: true }],
          transition: {
            type: 'DECISION',
            channelKey: 'behavior',
            branches: decisionChannel.options.map((option) => ({
              optionKey: option.optionKey,
              nextNodeKey: 'node-diagnostic',
            })),
          },
        },
        {
          nodeType: 'SCENE',
          nodeKey: 'node-diagnostic',
          sceneKey: 'AS-02',
          motherSceneKey: 'mother-assertiveness',
          roundKey: 'round-1',
          stepKey: 'diagnostic',
          interactionRole: 'DIAGNOSTIC',
          channelPolicies: [
            { channelKey: 'behavior', measurementRole: 'SCORED', required: true },
            { channelKey: 'confidence', measurementRole: 'ROUTING_ONLY', required: false },
          ],
          transition: { type: 'NEXT', nextNodeKey: 'node-round-2' },
        },
        {
          nodeType: 'SCENE',
          nodeKey: 'node-round-2',
          sceneKey: 'AS-03',
          motherSceneKey: 'mother-assertiveness',
          roundKey: 'round-2',
          stepKey: 'diagnostic',
          interactionRole: 'DIAGNOSTIC',
          channelPolicies: [{ channelKey: 'behavior', measurementRole: 'SCORED', required: true }],
          transition: { type: 'NEXT', nextNodeKey: 'terminal-complete' },
        },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-complete' },
      ],
    },
  }
}

const response = (
  sceneKey: string,
  channelKey: string,
  responseValue: string | number,
): SituationalResponse => ({ sceneKey, channelKey, responseValue })

describe('Situational V2 diagnostic and multi-round semantics', () => {
  it('validates explicit decision/diagnostic roles without changing the V1 scientific schema', () => {
    const definition = diagnosticDefinition()
    const validation = validateBranchingSituationDefinition(definition)
    expect(validation.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(validation.definition?.schemaVersion).toBe(2)

    const runner = runnerBranchingSituationDefinition(definition)
    const serialized = JSON.stringify(runner)
    expect(serialized).toContain('DIAGNOSTIC')
    expect(serialized).toContain('"required":false')
    expect(serialized).not.toContain('ROUTING_ONLY')
    expect(serialized).not.toContain('measurementRole')
  })

  it('allows an optional diagnostic to be omitted while requiring the scored diagnostic path', () => {
    const definition = diagnosticDefinition()
    const submitted = [
      response('AS-01', 'behavior', 'A'),
      response('AS-02', 'behavior', 'A'),
      response('AS-03', 'behavior', 'D'),
    ]
    const normalized = normalizeSituationalResponses(definition, submitted)
    expect(normalized.map((entry) => `${entry.sceneKey}:${entry.channelKey}`)).toEqual([
      'AS-01:behavior',
      'AS-02:behavior',
      'AS-03:behavior',
    ])

    const trajectory = deriveAuthoritativeSituationalTrajectory(definition, normalized)
    expect(trajectory).toEqual({
      nodeKeys: ['node-decision', 'node-diagnostic', 'node-round-2', 'terminal-complete'],
      sceneKeys: ['AS-01', 'AS-02', 'AS-03'],
      terminalNodeKey: 'terminal-complete',
      reachedTerminal: true,
    })
    expect(requiredReachableSituationalResponseKeys(definition, trajectory)).toEqual([
      'AS-01:behavior',
      'AS-02:behavior',
      'AS-03:behavior',
    ])
  })

  it('keeps routing-only and optional diagnostic answers in raw normalization but out of scoring', () => {
    const definition = diagnosticDefinition()
    const normalized = normalizeSituationalResponses(definition, [
      response('AS-01', 'behavior', 'D'),
      response('AS-02', 'behavior', 'A'),
      response('AS-02', 'confidence', 87),
      response('AS-03', 'behavior', 'D'),
    ])
    expect(normalized.map((entry) => `${entry.sceneKey}:${entry.channelKey}`)).toEqual([
      'AS-01:behavior',
      'AS-02:behavior',
      'AS-02:confidence',
      'AS-03:behavior',
    ])

    const trajectory = deriveAuthoritativeSituationalTrajectory(definition, normalized)
    const scoringDefinition = projectReachableSituationDefinitionForScoring(definition, trajectory)
    expect(scoringDefinition.scenes.map((scene) => scene.sceneKey)).toEqual(['AS-02', 'AS-03'])
    expect(scoringDefinition.scenes.flatMap((scene) => scene.channels.map((channel) => `${scene.sceneKey}:${channel.channelKey}`)))
      .toEqual(['AS-02:behavior', 'AS-03:behavior'])
    expect(scoringDefinition.scoring.choiceScores.some((entry) => entry.sceneKey === 'AS-01')).toBe(false)

    const result = scoreSituational(scoringDefinition, normalized, { responsesValidated: true })
    expect(result.quality.status).toBe('interpretable')
    expect(result.metrics[0]?.value).toBe(0)
    expect(result.metrics[0]?.expectedResponses).toEqual(['AS-02:behavior', 'AS-03:behavior'])
  })

  it('freezes optionality and interaction metadata in the existing UNIFIED_V1 snapshot envelope', () => {
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: 'situational-v2-d-fixture',
      instrumentVersion: '2.0.0',
      definition: diagnosticDefinition(),
      frozenAt: new Date('2026-09-10T00:00:00.000Z'),
    })
    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.runtimeGeneration).toBe('UNIFIED_V1')
    expect(JSON.stringify(snapshot.runnerDefinition)).toContain('"required":false')
    expect(parseFrozenSituationalRuntimeSnapshot(snapshot)).toEqual(snapshot)
  })

  it('rejects accidental diagnostic routing, optional routing channels, and dead routing-only scores', () => {
    const diagnosticRoutes = diagnosticDefinition()
    const node = diagnosticRoutes.flow.nodes.find((candidate) => candidate.nodeKey === 'node-diagnostic')
    if (!node || node.nodeType !== 'SCENE') throw new Error('fixture node missing')
    node.transition = {
      type: 'DECISION',
      channelKey: 'behavior',
      branches: [
        { optionKey: 'A', nextNodeKey: 'node-round-2' },
        { optionKey: 'B', nextNodeKey: 'node-round-2' },
        { optionKey: 'C', nextNodeKey: 'node-round-2' },
        { optionKey: 'D', nextNodeKey: 'node-round-2' },
      ],
    }
    expect(validateBranchingSituationDefinition(diagnosticRoutes).issues.some((entry) => /DIAGNOSTIC 节点不能驱动分支/.test(entry.message))).toBe(true)

    const optionalDecision = diagnosticDefinition()
    const decision = optionalDecision.flow.nodes.find((candidate) => candidate.nodeKey === 'node-decision')
    if (!decision || decision.nodeType !== 'SCENE' || !decision.channelPolicies) throw new Error('fixture decision missing')
    decision.channelPolicies[0]!.required = false
    expect(validateBranchingSituationDefinition(optionalDecision).issues.some((entry) => /Decision transition 的通道必须 required/.test(entry.message))).toBe(true)

    const deadScore = diagnosticDefinition()
    deadScore.scoring.choiceScores.push({
      sceneKey: 'AS-01',
      channelKey: 'behavior',
      optionKey: 'A',
      contribution: 99,
    })
    expect(validateBranchingSituationDefinition(deadScore).issues.some((entry) => /ROUTING_ONLY 通道不能保留 choice scoring contribution/.test(entry.message))).toBe(true)
  })
})
