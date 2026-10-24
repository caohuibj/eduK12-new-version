import { afterEach, describe, it, expect, vi } from 'vitest'
import { createSituationalHistorySnapshot, invalidateChangedSituationalHistory, situationalHistoryIdentities } from '../history'
import { pruneInvalidatedSituationalDraftResponses, pruneUnreachableSituationalResponses } from '../draft'
import * as traversal from '../traversal'
import { finalDraftStore } from '../../../services/persistence/finalDraftStore'
import type { SituationalAttempt, SituationalDraftAnswer, SituationalRunnerDefinitionV2 } from '../types'

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


describe('operation-local situational history reuse', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses three history traversals plus reachable-key pruning even without stale answers', async () => {
    const d = convergedDefinition()
    const derive = vi.spyOn(traversal, 'deriveReachableTrajectory')
    const reachable = vi.spyOn(traversal, 'reachableSituationalScenes')
    const snapshot = createSituationalHistorySnapshot(d, {})
    const answer = { responseValue: 'A', responseRevision: 1, historyIdentity: snapshot.identities.entry }
    const invalidated = snapshot.invalidate({ 'entry:choice': answer })
    expect(invalidated.staleKeys).toEqual([])
    const next = await pruneInvalidatedSituationalDraftResponses({ id: 'local-operation' } as SituationalAttempt, d, invalidated)
    expect(next).toEqual({ 'entry:choice': answer })
    // The internal traversal in reachableSituationalScenes is a lexical call, not this export spy.
    expect(derive).toHaveBeenCalledTimes(3)
    expect(reachable).toHaveBeenCalledTimes(1)
  })

  it('recomputes after invalidation removes a required answer and shortens the path', async () => {
    const d = convergedDefinition()
    const deleted = vi.spyOn(finalDraftStore, 'deleteAnswers').mockResolvedValue()
    const derive = vi.spyOn(traversal, 'deriveReachableTrajectory')
    const reachable = vi.spyOn(traversal, 'reachableSituationalScenes')
    const snapshot = createSituationalHistorySnapshot(d, {})
    const invalidated = snapshot.invalidate({
      'entry:choice': { responseValue: 'A' },
      'left:choice': { responseValue: 'A', historyIdentity: 'stale-binding' },
      'common:choice': { responseValue: 'B' },
    })
    expect(invalidated.staleKeys).toEqual(['left:choice'])
    expect(invalidated.responses['common:choice']).toBeDefined()
    const next = await pruneInvalidatedSituationalDraftResponses({ id: 'shortened-operation' } as SituationalAttempt, d, invalidated)
    expect(next).toEqual({ 'entry:choice': { responseValue: 'A' } })
    expect(deleted).toHaveBeenCalledWith('situational:shortened-operation', ['left:choice', 'common:choice'])
    // The internal traversal in reachableSituationalScenes is a lexical call, not this export spy.
    expect(derive).toHaveBeenCalledTimes(3)
    expect(reachable).toHaveBeenCalledTimes(1)
  })

  it('keeps reachable optional diagnostics but still deletes unknown response channels', async () => {
    const d = convergedDefinition()
    d.scenes[0]!.channels.push({ channelKey: 'probe', responseType: 'FREE_TEXT', prompt: 'optional', required: false })
    const deleted = vi.spyOn(finalDraftStore, 'deleteAnswers').mockResolvedValue()
    const snapshot = createSituationalHistorySnapshot(d, {})
    const invalidated = snapshot.invalidate({
      'entry:choice': { responseValue: 'A' },
      'entry:probe': { responseValue: '观察 🐱' },
      'entry:unknown': { responseValue: 'not a channel' },
    })
    const next = await pruneInvalidatedSituationalDraftResponses({ id: 'optional-operation' } as SituationalAttempt, d, invalidated)
    expect(next['entry:probe']?.responseValue).toBe('观察 🐱')
    expect(next['entry:unknown']).toBeUndefined()
    expect(deleted).toHaveBeenCalledWith('situational:optional-operation', ['entry:unknown'])
  })

  it('does not substitute a later response reference into an already-created operation', async () => {
    const d = convergedDefinition()
    let current: Record<string, SituationalDraftAnswer> = { 'entry:choice': { responseValue: 'A', responseRevision: 1 } }
    const snapshot = createSituationalHistorySnapshot(d, current)
    const original = snapshot.identities.left
    await Promise.resolve()
    current = { 'entry:choice': { responseValue: 'B', responseRevision: 2 } }
    expect(snapshot.identities.left).toBe(original)
    const nextSnapshot = createSituationalHistorySnapshot(d, current)
    expect(nextSnapshot.identities.left).toBeUndefined()
    expect(nextSnapshot.identities.right).toBeDefined()
  })
})
