import { describe, expect, it } from 'vitest'
import {
  hashSituationDefinitionV2,
  runnerBranchingSituationDefinition,
  validateBranchingSituationDefinition,
  type SituationDefinitionV2,
} from '../../modules/situational/situation-branching'
import { validateSituationDefinition } from '../../modules/situational/situation-definition'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const baseBranchingDefinition = (): SituationDefinitionV2 => {
  const source = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
  const decisionChannel = source.scenes[0]!.channels[0]!
  if (decisionChannel.responseType !== 'SINGLE_CHOICE') throw new Error('fixture requires SINGLE_CHOICE decision channel')

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
          transition: {
            type: 'NEXT',
            nextNodeKey: 'terminal-complete',
          },
        },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-early' },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-complete' },
      ],
    },
  }
}

const errors = (definition: unknown): string => JSON.stringify(
  validateBranchingSituationDefinition(definition).issues.filter((issue) => issue.severity === 'error'),
)

describe('Situational V2 branching graph contract', () => {
  it('accepts a deterministic DAG while keeping V1 runtime validation opt-in', () => {
    const definition = baseBranchingDefinition()
    const result = validateBranchingSituationDefinition(definition)
    expect(result.definition).toBeDefined()
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])

    // PR A freezes the V2 domain contract but must not silently make existing
    // V1 production runtime paths accept schemaVersion 2 before PR B/C land.
    expect(validateSituationDefinition(definition).definition).toBeUndefined()
    expect(validateSituationDefinition(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION).definition).toBeDefined()
  })

  it('uses branch-reachable presentation semantics instead of V1 sampling ALL', () => {
    const definition = baseBranchingDefinition()
    expect(definition.sampling).toEqual({ strategy: 'BRANCH_REACHABLE' })
    const runner = runnerBranchingSituationDefinition(definition)
    expect(runner.sampling).toEqual({ strategy: 'BRANCH_REACHABLE' })

    const invalid = clone(definition) as unknown as Record<string, unknown>
    invalid.sampling = { strategy: 'ALL' }
    expect(errors(invalid)).toContain('sampling.strategy')
  })

  it('binds the hash to graph structure and exposes only runner-safe flow data', () => {
    const definition = baseBranchingDefinition()
    const same = clone(definition)
    const changed = clone(definition)
    const decision = changed.flow.nodes[0]
    if (decision?.nodeType !== 'SCENE' || decision.transition.type !== 'DECISION') throw new Error('fixture decision node missing')
    decision.transition.branches[0]!.nextNodeKey = 'terminal-early'

    expect(hashSituationDefinitionV2(same)).toBe(hashSituationDefinitionV2(definition))
    expect(hashSituationDefinitionV2(changed)).not.toBe(hashSituationDefinitionV2(definition))

    const runner = runnerBranchingSituationDefinition(definition)
    const serialized = JSON.stringify(runner)
    expect(runner.schemaVersion).toBe(2)
    expect(runner.flow.entryNodeKey).toBe('node-as-01')
    expect(serialized).toContain('BRANCHING_DAG_V1')
    expect(serialized).not.toContain('choiceScores')
    expect(serialized).not.toContain('contribution')
    expect(serialized).not.toContain('scoredConstruct')
    expect(serialized).not.toContain('situationFeatures')
    expect(serialized).not.toContain('secondaryConstructs')
    expect(serialized).not.toContain('purpose')
    expect(serialized).not.toContain('scoringDirection')
  })

  it('rejects duplicate node keys and an entry that points to a terminal', () => {
    const duplicate = baseBranchingDefinition()
    duplicate.flow.nodes[1]!.nodeKey = 'node-as-01'
    expect(errors(duplicate)).toContain('分支节点 nodeKey 不能重复')

    const terminalEntry = baseBranchingDefinition()
    terminalEntry.flow.entryNodeKey = 'terminal-early'
    expect(errors(terminalEntry)).toContain('入口节点必须是 SCENE')
  })

  it('rejects missing transition targets and orphan nodes', () => {
    const missing = baseBranchingDefinition()
    const second = missing.flow.nodes[1]
    if (second?.nodeType !== 'SCENE' || second.transition.type !== 'NEXT') throw new Error('fixture next node missing')
    second.transition.nextNodeKey = 'missing-terminal'
    expect(errors(missing)).toContain('transition target 不存在：missing-terminal')

    const orphan = baseBranchingDefinition()
    orphan.flow.nodes.push({ nodeType: 'TERMINAL', nodeKey: 'terminal-orphan' })
    expect(errors(orphan)).toContain('分支节点不可从 entry 到达：terminal-orphan')
  })

  it('requires each declared scene to map to exactly one graph node', () => {
    const duplicateScene = baseBranchingDefinition()
    const second = duplicateScene.flow.nodes[1]
    if (second?.nodeType !== 'SCENE') throw new Error('fixture scene node missing')
    second.sceneKey = 'AS-01'
    expect(errors(duplicateScene)).toContain('同一场景只能绑定一个分支节点：AS-01')
    expect(errors(duplicateScene)).toContain('V2 flow 必须且只能引用每个声明场景一次：AS-02')

    const unknownScene = baseBranchingDefinition()
    const first = unknownScene.flow.nodes[0]
    if (first?.nodeType !== 'SCENE') throw new Error('fixture scene node missing')
    first.sceneKey = 'AS-99'
    expect(errors(unknownScene)).toContain('分支节点引用了不存在的场景：AS-99')
  })

  it('requires unique mother-scene round step identity', () => {
    const definition = baseBranchingDefinition()
    const first = definition.flow.nodes[0]
    const second = definition.flow.nodes[1]
    if (first?.nodeType !== 'SCENE' || second?.nodeType !== 'SCENE') throw new Error('fixture scene nodes missing')
    second.roundKey = first.roundKey
    second.stepKey = first.stepKey
    expect(errors(definition)).toContain('同一 motherScene × round 内 stepKey 必须唯一')
  })

  it('requires a decision to bind a real SINGLE_CHOICE channel', () => {
    const unknownChannel = baseBranchingDefinition()
    const first = unknownChannel.flow.nodes[0]
    if (first?.nodeType !== 'SCENE' || first.transition.type !== 'DECISION') throw new Error('fixture decision node missing')
    first.transition.channelKey = 'unknown-channel'
    expect(errors(unknownChannel)).toContain('Decision 引用了不存在的场景通道')

    const continuous = baseBranchingDefinition()
    continuous.scenes[0]!.channels.push({
      channelKey: 'confidence',
      purpose: 'CONFIDENCE',
      responseType: 'CONTINUOUS',
      scoredConstruct: 'bfi2.assertiveness',
      prompt: '你有多大把握？',
      range: { min: 0, max: 100 },
      scoringDirection: 'POSITIVE',
    })
    continuous.scoring.publishedMetrics.push({
      key: 'bfi2.assertiveness.confidence',
      label: '把握度',
      construct: 'bfi2.assertiveness',
      channelKey: 'confidence',
      direction: 'higher_is_more',
      role: 'secondary',
      displayPrecision: 1,
    })
    continuous.report.metricOrder.push('bfi2.assertiveness.confidence')
    continuous.report.interpretations.push({
      metricKey: 'bfi2.assertiveness.confidence',
      headline: '把握度',
      summary: '描述性把握度',
      bands: [],
      guidance: [],
    })
    const continuousFirst = continuous.flow.nodes[0]
    if (continuousFirst?.nodeType !== 'SCENE' || continuousFirst.transition.type !== 'DECISION') throw new Error('fixture decision node missing')
    continuousFirst.transition.channelKey = 'confidence'
    expect(errors(continuous)).toContain('Decision branching 只能绑定 SINGLE_CHOICE 通道')
  })

  it('requires exactly one deterministic branch for every decision option', () => {
    const missingOption = baseBranchingDefinition()
    const first = missingOption.flow.nodes[0]
    if (first?.nodeType !== 'SCENE' || first.transition.type !== 'DECISION') throw new Error('fixture decision node missing')
    const removed = first.transition.branches.pop()!
    expect(errors(missingOption)).toContain(`Decision 必须为每个可选 option 声明 deterministic transition：${removed.optionKey}`)

    const duplicate = baseBranchingDefinition()
    const duplicateFirst = duplicate.flow.nodes[0]
    if (duplicateFirst?.nodeType !== 'SCENE' || duplicateFirst.transition.type !== 'DECISION') throw new Error('fixture decision node missing')
    duplicateFirst.transition.branches[1]!.optionKey = duplicateFirst.transition.branches[0]!.optionKey
    expect(errors(duplicate)).toContain('Decision option 只能声明一条 transition')

    const unknown = baseBranchingDefinition()
    const unknownFirst = unknown.flow.nodes[0]
    if (unknownFirst?.nodeType !== 'SCENE' || unknownFirst.transition.type !== 'DECISION') throw new Error('fixture decision node missing')
    unknownFirst.transition.branches[0]!.optionKey = 'NOT-AN-OPTION'
    expect(errors(unknown)).toContain('Decision transition 引用了不存在的 optionKey')
  })

  it('rejects cycles even when every referenced node exists', () => {
    const definition = baseBranchingDefinition()
    const second = definition.flow.nodes[1]
    if (second?.nodeType !== 'SCENE' || second.transition.type !== 'NEXT') throw new Error('fixture next node missing')
    second.transition.nextNodeKey = 'node-as-01'
    expect(errors(definition)).toContain('BRANCHING_DAG_V1 不能包含 cycle')
  })

  it('requires at least one terminal and rejects reachable paths without terminal proof', () => {
    const noTerminal = baseBranchingDefinition()
    noTerminal.flow.nodes = noTerminal.flow.nodes.filter((node) => node.nodeType !== 'TERMINAL')
    const first = noTerminal.flow.nodes[0]
    const second = noTerminal.flow.nodes[1]
    if (first?.nodeType !== 'SCENE' || first.transition.type !== 'DECISION') throw new Error('fixture decision node missing')
    if (second?.nodeType !== 'SCENE' || second.transition.type !== 'NEXT') throw new Error('fixture next node missing')
    first.transition.branches.forEach((branch) => { branch.nextNodeKey = 'node-as-02' })
    second.transition.nextNodeKey = 'missing-terminal'
    expect(errors(noTerminal)).toContain('BRANCHING_DAG_V1 至少需要一个 TERMINAL 节点')
    expect(errors(noTerminal)).toContain('从该节点存在无法到达 TERMINAL 的路径')
  })
})
