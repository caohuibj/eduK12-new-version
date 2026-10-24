import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import { deriveReachableTrajectory } from './traversal'
import type { SituationalDraftAnswer, SituationalRunnerDefinition } from './types'

/** Canonical SHA-256 ancestor decision identity; never a scientific score. */
export function situationalHistoryIdentities(definition: SituationalRunnerDefinition, responses: Record<string, SituationalDraftAnswer>): Record<string, string> {
  if (definition.schemaVersion === 1) return {}
  const trajectory = deriveReachableTrajectory(definition, responses)
  const ancestors: Array<[string, string | number | string[] | null, number]> = []
  const identities: Record<string, string> = {}
  for (const nodeKey of trajectory.nodeKeys) {
    const node = definition.flow.nodes.find(n => n.nodeKey === nodeKey)
    if (node?.nodeType !== 'SCENE') continue
    identities[node.sceneKey] = bytesToHex(sha256(utf8ToBytes(JSON.stringify(ancestors))))
    // Any upstream CHOICE can change psychological meaning, even if it routes to the same target.
    const choices = node.responseStages?.filter(s => s.kind === 'CHOICE').flatMap(s => s.channelKeys)
      ?? (node.transition.type === 'DECISION' ? [node.transition.channelKey] : definition.scenes.find(s => s.sceneKey === node.sceneKey)?.channels.filter(c => c.required !== false).map(c => c.channelKey) ?? [])
    ancestors.push([node.nodeKey, null, 0])
    for (const key of choices) ancestors.push([`${node.nodeKey}:${key}`, responses[`${node.sceneKey}:${key}`]?.responseValue ?? null, responses[`${node.sceneKey}:${key}`]?.responseRevision ?? 0])
  }
  return identities
}

export interface SituationalHistoryInvalidation {
  responses: Record<string, SituationalDraftAnswer>
  staleKeys: string[]
}

/** Operation-local projection. Do not retain it across answer or definition changes. */
export function createSituationalHistorySnapshot(definition: SituationalRunnerDefinition, before: Record<string, SituationalDraftAnswer>) {
  const identities = situationalHistoryIdentities(definition, before)
  return {
    identities,
    invalidate(after: Record<string, SituationalDraftAnswer>): SituationalHistoryInvalidation {
      if (definition.schemaVersion === 1) return { responses: after, staleKeys: [] }
      const newHistory = before === after ? identities : situationalHistoryIdentities(definition, after)
      const staleKeys = Object.entries(after).flatMap(([key, answer]) => {
        const sceneKey = key.slice(0, key.indexOf(':')), expected = newHistory[sceneKey]
        return expected === undefined || (identities[sceneKey] !== undefined && identities[sceneKey] !== expected) || (answer.historyIdentity !== undefined && answer.historyIdentity !== expected) ? [key] : []
      })
      const responses = { ...after }
      staleKeys.forEach(key => { delete responses[key] })
      return { responses, staleKeys }
    },
  }
}

/** Retain current-node answers, invalidate the entire suffix on any upstream decision edit. */
export function invalidateChangedSituationalHistory(definition: SituationalRunnerDefinition, before: Record<string, SituationalDraftAnswer>, after: Record<string, SituationalDraftAnswer>): SituationalHistoryInvalidation {
  return createSituationalHistorySnapshot(definition, before).invalidate(after)
}
