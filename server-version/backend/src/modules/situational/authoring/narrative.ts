import type { SituationRuntimeDefinition } from '../situation-runtime-definition'
import type { SituationalResponse } from '../situation-scoring'
import { deriveAuthoritativeSituationalTrajectory } from '../situation-trajectory'

/** A bounded participant-safe projection. Never includes keys, raw journals, free text or scores. */
export function buildSjtNarrative(
  definition: SituationRuntimeDefinition,
  responses: SituationalResponse[],
) {
  const rules = definition.report.narrative
  if (!rules) return undefined
  const trajectory = deriveAuthoritativeSituationalTrajectory(definition, responses)
  const byPair = new Map(responses.map((r) => [`${r.sceneKey}:${r.channelKey}`, r.responseValue]))
  const paragraphs: string[] = [],
    guidance = new Map<string, string>()
  for (const sceneKey of trajectory.sceneKeys)
    for (const kind of ['ACTION', 'PROBE', 'GUIDANCE'] as const)
      for (const f of rules.fragments.filter((f) => f.sceneKey === sceneKey && f.kind === kind))
        if (byPair.get(`${sceneKey}:${f.channelKey}`) === f.optionKey) {
          if (kind === 'GUIDANCE') {
            const mother =
              definition.schemaVersion === 2
                ? definition.flow.nodes.find(
                    (n) => n.nodeType === 'SCENE' && n.sceneKey === sceneKey,
                  )
                : undefined
            guidance.set(mother?.nodeType === 'SCENE' ? mother.motherSceneKey : sceneKey, f.text)
          } else paragraphs.push(f.text)
        }
  for (const c of rules.comparisons) {
    const values = [c.firstChannelKey, c.secondChannelKey].map((channelKey) => {
      const scene = definition.scenes.find(
        (s) =>
          trajectory.sceneKeys.includes(s.sceneKey) &&
          s.channels.some((ch) => ch.channelKey === channelKey) &&
          (definition.schemaVersion === 1 ||
            definition.flow.nodes.some(
              (n) =>
                n.nodeType === 'SCENE' &&
                n.sceneKey === s.sceneKey &&
                n.motherSceneKey === c.motherSceneKey,
            )),
      )
      return scene ? byPair.get(`${scene.sceneKey}:${channelKey}`) : undefined
    })
    const a = c.categories.indexOf(String(values[0])),
      b = c.categories.indexOf(String(values[1]))
    if (a >= 0 && b >= 0)
      paragraphs.push(
        `${c.label}：${a + 1}→${b + 1}，${b === a ? '类别相同' : `${b > a ? '上移' : '下移'} ${Math.abs(b - a)} 档`}。这不是能力变化，也不证明事件造成改善。`,
      )
  }
  // The final matched action's reminder, rather than a total-score prescription.
  paragraphs.push(...guidance.values())
  paragraphs.push(definition.report.disclaimer)
  return { version: 'sjt-narrative-v1' as const, paragraphs }
}
