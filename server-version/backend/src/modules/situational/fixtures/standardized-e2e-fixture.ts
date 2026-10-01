import type { SituationDefinitionV2 } from '../situation-branching'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../packages/sjt-assertiveness-golden-zh-cn-v1'

/** Synthetic response surfaces only, never a new teacher episode or production package. */
export function scientificFixture(): SituationDefinitionV2 {
  const source = structuredClone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)
  const scenes: SituationDefinitionV2['scenes'] = ['entry', 'left', 'right', 'common'].map((sceneKey, sortOrder) => ({
    sceneKey, sortOrder, title: `Synthetic ${sceneKey}`, stimulus: { type: 'TEXT_V1' as const, text: `Synthetic stimulus ${sceneKey}` },
    primaryConstruct: 'candidate.one', secondaryConstructs: ['candidate.two'], situationFeatures: {},
    channels: [{ channelKey: 'choice', responseType: 'SINGLE_CHOICE' as const, purpose: 'BEHAVIOR_TENDENCY' as const, prompt: `Synthetic choice ${sceneKey}`, options: ['A', 'B'].map(optionKey => ({ optionKey, label: `${sceneKey} ${optionKey}`, evidence: { semanticVersion: '1', observable: { requestsVerification: optionKey === 'A' }, opportunities: [{ constructKey: 'candidate.one', role: 'PRIMARY_CANDIDATE' as const, rationale: 'Synthetic candidate; not empirical evidence' }, { constructKey: 'candidate.two', role: 'SECONDARY_CANDIDATE' as const, rationale: 'Synthetic rival hypothesis' }] } })) }],
  }))
  const definition: SituationDefinitionV2 = {
    ...source, schemaVersion: 2, sampling: { strategy: 'BRANCH_REACHABLE' }, scenes,
    scoring: { scoringVersion: 'synthetic-expert-1', choiceScores: [], publishedMetrics: ['one', 'two'].map((key, i) => ({ key, label: key, construct: `candidate.${key}`, channelKey: 'choice', direction: 'descriptive', role: i ? 'secondary' : 'primary', displayPrecision: 2 })), model: { contractVersion: 'situational-model-v1', modelKey: 'EXPERT_KEY', modelVersion: '1', expertKey: scenes.flatMap(s => ['A', 'B'].flatMap(optionKey => ['one', 'two'].map(metricKey => ({ sceneKey: s.sceneKey, channelKey: 'choice', optionKey, metricKey, contribution: optionKey === 'A' ? metricKey === 'one' ? 1 : 2 : 0 })))) } },
    report: { reportVersion: 'synthetic-1', primaryMetricKeys: ['one'], metricOrder: ['one', 'two'], interpretations: ['one', 'two'].map(metricKey => ({ metricKey, headline: 'Synthetic', summary: 'Provisional test only', bands: [], guidance: [] })), limitations: ['Synthetic fixture only'], disclaimer: 'No psychological claim' },
    flow: { strategy: 'BRANCHING_DAG_V1', entryNodeKey: 'entry', nodes: scenes.map(scene => ({ nodeType: 'SCENE' as const, nodeKey: scene.sceneKey, sceneKey: scene.sceneKey, motherSceneKey: 'synthetic-mother', roundKey: '1', stepKey: scene.sceneKey, channelPolicies: [{ channelKey: 'choice', interactionRole: 'DECISION' as const, measurementRole: 'SCORED' as const, required: true }], transition: scene.sceneKey === 'entry' ? { type: 'DECISION' as const, channelKey: 'choice', branches: [{ optionKey: 'A', nextNodeKey: 'left' }, { optionKey: 'B', nextNodeKey: 'right' }] } : { type: 'NEXT' as const, nextNodeKey: scene.sceneKey === 'common' ? 'terminal' : 'common' } })).concat([{ nodeType: 'TERMINAL', nodeKey: 'terminal' }] as never) },
  }
  const entry = definition.scenes[0]!, node = definition.flow.nodes[0]!
  entry.measurementBundle = { contractVersion: 'measurement-bundle-v1', maxRequiredResponses: 2, maxOptionalDiagnosticResponses: 2, maxTotalResponses: 4, estimatedSeconds: 60 }
  for (let i = 1; i <= 3; i++) entry.channels.push({ channelKey: `probe${i}`, purpose: 'SELF_EFFICACY', responseType: 'CONTINUOUS', prompt: `Synthetic probe ${i}`, range: { min: 0, max: 100 }, scoringDirection: 'POSITIVE' })
  if (node.nodeType !== 'SCENE') throw new Error('fixture')
  node.channelPolicies!.push(...[1, 2, 3].map(i => ({ channelKey: `probe${i}`, interactionRole: 'DIAGNOSTIC' as const, measurementRole: 'RAW_ONLY' as const, required: i === 1 })))
  node.responseStages = [{ stageKey: 'choice', kind: 'CHOICE', channelKeys: ['choice'] }, ...[1, 2, 3].map(i => ({ stageKey: `probe${i}`, kind: 'POST_CHOICE_PROBE' as const, channelKeys: [`probe${i}`] }))]
  return definition
}

export const STANDARDIZED_SITUATIONAL_E2E_PACKAGE = { key: 'synthetic-situational-vnext', instrumentVersion: '1.0.0', releaseStatus: 'PUBLISHED' as const, definition: scientificFixture(), goldenCases: ['A', 'B'].map(optionKey => ({ name: `synthetic-${optionKey}`, responses: [{ sceneKey: 'entry', channelKey: 'choice', responseValue: optionKey }, { sceneKey: 'entry', channelKey: 'probe1', responseValue: 80 }, { sceneKey: optionKey === 'A' ? 'left' : 'right', channelKey: 'choice', responseValue: 'A' }, { sceneKey: 'common', channelKey: 'choice', responseValue: 'A' }], expected: { quality: 'interpretable' as const, metricKeys: ['one', 'two'], metrics: { one: optionKey === 'A' ? 1 : 2 / 3, two: optionKey === 'A' ? 2 : 4 / 3 } } })) }

/** Unstaged synthetic graph exercises editable branch-and-converge history. */
export function historyFixture(): SituationDefinitionV2 {
  const d = scientificFixture()
  d.scenes[0]!.channels = d.scenes[0]!.channels.slice(0, 1)
  delete d.scenes[0]!.measurementBundle
  const entry = d.flow.nodes[0]!
  if (entry.nodeType !== 'SCENE') throw new Error('fixture')
  entry.channelPolicies = entry.channelPolicies!.slice(0, 1)
  delete entry.responseStages
  // An exact, non-adaptive assignment enables the research journal in this fixture.
  d.researchAssignment = { assignmentVersion: 'situational-assignment-v1', groups: [{ groupKey: 'control', nodeKey: 'entry', variants: [{ variantKey: 'control', weight: 1, omittedChannelKeys: [], probeTiming: 'DEFINED' }] }] }
  return d
}
export const HISTORY_SITUATIONAL_E2E_PACKAGE = { ...STANDARDIZED_SITUATIONAL_E2E_PACKAGE, key: 'synthetic-situational-history', definition: historyFixture(), goldenCases: STANDARDIZED_SITUATIONAL_E2E_PACKAGE.goldenCases.map(c => ({ ...c, responses: c.responses.filter(r => r.channelKey === 'choice') })) }


/** Bounded synthetic corpus; no authored situations or production discovery. */
export function sizedScientificFixture(count: 10 | 30 | 60): SituationDefinitionV2 {
  const d = scientificFixture(), template = d.scenes[0]!, node = d.flow.nodes[0]!
  if (node.nodeType !== 'SCENE') throw new Error('fixture')
  template.measurementBundle = { ...template.measurementBundle!, maxRequiredResponses: 4, maxOptionalDiagnosticResponses: 2, maxTotalResponses: 6 }
  for (const i of [4, 5]) {
    template.channels.push({ ...structuredClone(template.channels[1]!), channelKey: `probe${i}`, prompt: `Synthetic probe ${i}` })
    node.channelPolicies!.push({ channelKey: `probe${i}`, interactionRole: 'DIAGNOSTIC', measurementRole: 'RAW_ONLY', required: true })
    node.responseStages!.push({ stageKey: `probe${i}`, kind: 'POST_CHOICE_PROBE', channelKeys: [`probe${i}`] })
  }
  d.scenes = Array.from({ length: count }, (_, i) => ({ ...structuredClone(template), sceneKey: `S${i}`, title: `Synthetic S${i}`, sortOrder: i }))
  d.flow.entryNodeKey = 'N0'
  d.flow.nodes = d.scenes.map((s, i) => ({ ...structuredClone(node), nodeKey: `N${i}`, sceneKey: s.sceneKey, motherSceneKey: `M${i}`, stepKey: `${i}`, transition: { type: 'NEXT' as const, nextNodeKey: i === count - 1 ? 'terminal' : `N${i + 1}` } }))
  d.flow.nodes.push({ nodeType: 'TERMINAL', nodeKey: 'terminal' })
  const key = d.scoring.model!.expertKey!.filter(e => e.sceneKey === 'entry')
  d.scoring.model!.expertKey = d.scenes.flatMap(s => key.map(e => ({ ...e, sceneKey: s.sceneKey })))
  return d
}
export const PERFORMANCE_SITUATIONAL_E2E_PACKAGES = ([10, 30, 60] as const).map(count => {
  const definition = sizedScientificFixture(count)
  for (const node of definition.flow.nodes) if (node.nodeType === 'SCENE') delete node.responseStages
  definition.researchAssignment = { assignmentVersion: 'synthetic-performance-1', groups: [{ groupKey: 'control', nodeKey: 'N0', variants: [{ variantKey: 'control', weight: 1, omittedChannelKeys: [], probeTiming: 'DEFINED' }] }] }
  return { ...STANDARDIZED_SITUATIONAL_E2E_PACKAGE, key: `synthetic-situational-size-${count}`, definition, goldenCases: [{ name: 'bounded-corpus', responses: definition.scenes.flatMap(scene => [{ sceneKey: scene.sceneKey, channelKey: 'choice', responseValue: 'A' }, ...['probe1', 'probe4', 'probe5'].map(channelKey => ({ sceneKey: scene.sceneKey, channelKey, responseValue: 80 }))]), expected: { quality: 'interpretable' as const, metricKeys: ['one', 'two'], metrics: { one: 1, two: 2 } } }] }
})
