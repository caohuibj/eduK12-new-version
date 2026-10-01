import { describe, it, expect } from 'vitest'
import { invalidateChangedSituationalHistory, situationalHistoryIdentities } from '../history'
import { pruneUnreachableSituationalResponses } from '../draft'
import type { SituationalDraftAnswer, SituationalRunnerDefinitionV2 } from '../types'

export const convergedDefinition = (): SituationalRunnerDefinitionV2 => ({
  schemaVersion: 2, respondentType: 'synthetic', sampling: { strategy: 'BRANCH_REACHABLE' },
  scenes: ['entry', 'left', 'right', 'common'].map((sceneKey, sortOrder) => ({ sceneKey, sortOrder, title: sceneKey, stimulus: { type: 'TEXT_V1', text: sceneKey }, channels: [{ channelKey: 'choice', responseType: 'SINGLE_CHOICE', prompt: sceneKey, options: [{ optionKey: 'A', label: 'A' }, { optionKey: 'B', label: 'B' }] }] })),
  flow: { strategy: 'BRANCHING_DAG_V1', entryNodeKey: 'entry', nodes: [
    { nodeType: 'SCENE', nodeKey: 'entry', sceneKey: 'entry', motherSceneKey: 'mother', roundKey: '1', stepKey: 'entry', transition: { type: 'DECISION', channelKey: 'choice', branches: [{ optionKey: 'A', nextNodeKey: 'left' }, { optionKey: 'B', nextNodeKey: 'right' }] } },
    ...['left', 'right', 'common'].map(sceneKey => ({ nodeType: 'SCENE' as const, nodeKey: sceneKey, sceneKey, motherSceneKey: 'mother', roundKey: '1', stepKey: sceneKey, transition: { type: 'NEXT' as const, nextNodeKey: sceneKey === 'common' ? 'terminal' : 'common' } })),
    { nodeType: 'TERMINAL', nodeKey: 'terminal' },
  ] },
})

describe('Situational branch and converge history', () => {
  it('reproduces reachability-only retention and invalidates common-node answers after A → B', () => {
    const d = convergedDefinition()
    const before = { 'entry:choice': { responseValue: 'A', responseRevision: 1 }, 'left:choice': { responseValue: 'A' }, 'right:choice': { responseValue: 'A' }, 'common:choice': { responseValue: 'B' } }
    const after = { ...before, 'entry:choice': { responseValue: 'B', responseRevision: 2 } }
    // Current-main behavior would prune left only: common remains reachable through right.
    expect(pruneUnreachableSituationalResponses(d, after).responses['common:choice']).toBeDefined()
    const fixed = invalidateChangedSituationalHistory(d, before, after)
    expect(fixed.staleKeys).toContain('common:choice')
    expect(fixed.responses['common:choice']).toBeUndefined()
  })
  it('invalidates even when both choices route to the same target', () => {
    const d = convergedDefinition(), entry = d.flow.nodes[0]!
    if (entry.nodeType !== 'SCENE' || entry.transition.type !== 'DECISION') throw new Error('fixture')
    entry.transition.branches[1]!.nextNodeKey = 'left'
    const before = { 'entry:choice': { responseValue: 'A' }, 'left:choice': { responseValue: 'A' }, 'common:choice': { responseValue: 'B' } }
    expect(invalidateChangedSituationalHistory(d, before, { ...before, 'entry:choice': { responseValue: 'B' } }).responses).toEqual({ 'entry:choice': { responseValue: 'B' } })
  })
  it('detects interrupted-write stale bindings on resume, and A → B → A has a fresh history', () => {
    const d = convergedDefinition(), initial: Record<string, SituationalDraftAnswer> = { 'entry:choice': { responseValue: 'A', responseRevision: 1 }, 'left:choice': { responseValue: 'A', responseRevision: 1 } }
    const old = situationalHistoryIdentities(d, initial).common!
    const returned = { ...initial, 'entry:choice': { responseValue: 'A', responseRevision: 3 }, 'common:choice': { responseValue: 'B', historyIdentity: old } }
    expect(situationalHistoryIdentities(d, returned).common).not.toBe(old)
    expect(pruneUnreachableSituationalResponses(d, returned).responses['common:choice']).toBeUndefined()
  })
})
