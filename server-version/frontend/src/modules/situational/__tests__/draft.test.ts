import { describe, expect, it } from 'vitest'
import {
  answeredResponseCount,
  ensureSituationalDraft,
  expectedResponseKeys,
  firstMissingSceneIndex,
  pruneSituationalDraftResponses,
  pruneUnreachableSituationalResponses,
  readSituationalDraft,
  responseKey,
  situationalDraftKey,
  situationalReadyToSubmit,
  situationalResponsesFromDraft,
} from '../draft'
import { FinalDraftIdentityConflictError, finalDraftStore } from '../../../services/persistence/finalDraftStore'
import type { SituationalAttempt, SituationalRunnerDefinition, SituationalRunnerDefinitionV2 } from '../types'

const definition: SituationalRunnerDefinition = {
  schemaVersion: 1,
  respondentType: 'participant_self_report',
  sampling: { strategy: 'ALL' },
  scenes: [
    {
      sceneKey: 'S1', title: '第一题', sortOrder: 0, stimulus: { type: 'TEXT_V1', text: '文本' },
      channels: [
        { channelKey: 'choice', responseType: 'SINGLE_CHOICE', prompt: '选择', options: [{ optionKey: 'A', label: 'A' }, { optionKey: 'B', label: 'B' }] },
        { channelKey: 'continuous', responseType: 'CONTINUOUS', prompt: '程度', range: { min: 0, max: 100 } },
      ],
    },
    { sceneKey: 'S2', title: '第二题', sortOrder: 1, stimulus: { type: 'TEXT_V1', text: '文本二' }, channels: [{ channelKey: 'choice', responseType: 'SINGLE_CHOICE', prompt: '选择', options: [{ optionKey: 'A', label: 'A' }, { optionKey: 'B', label: 'B' }] }] },
  ],
}

const branchingDefinition: SituationalRunnerDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  sampling: { strategy: 'BRANCH_REACHABLE' },
  scenes: definition.scenes,
  flow: {
    strategy: 'BRANCHING_DAG_V1',
    entryNodeKey: 'n1',
    nodes: [
      {
        nodeType: 'SCENE', nodeKey: 'n1', sceneKey: 'S1', motherSceneKey: 'M1', roundKey: 'R1', stepKey: 'P1',
        transition: { type: 'DECISION', channelKey: 'choice', branches: [{ optionKey: 'A', nextNodeKey: 'n2' }, { optionKey: 'B', nextNodeKey: 'early' }] },
      },
      {
        nodeType: 'SCENE', nodeKey: 'n2', sceneKey: 'S2', motherSceneKey: 'M1', roundKey: 'R2', stepKey: 'P1',
        transition: { type: 'NEXT', nextNodeKey: 'complete' },
      },
      { nodeType: 'TERMINAL', nodeKey: 'early' },
      { nodeType: 'TERMINAL', nodeKey: 'complete' },
    ],
  },
}

const attempt = (id: string, definitionHash = 'a'.repeat(64)): SituationalAttempt => ({
  id,
  instrumentKey: 'pilot',
  instrumentVersion: '1.0.0',
  attemptNo: 1,
  status: 'IN_PROGRESS',
  deliveryMode: 'FINAL_ONLY',
  runtimeGeneration: 'UNIFIED_V1',
  attemptEpoch: 1,
  progress: 0,
  definitionHash,
  compiledRuntimeHash: 'b'.repeat(64),
  scorerKey: 'situational.default',
  scoringVersion: 'pilot-v1',
  submissionId: null,
  submissionPayloadHash: null,
  submittedAt: null,
  startedAt: new Date(0).toISOString(),
  completedAt: null,
  totalTime: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
})

describe('Situational local draft boundary', () => {
  it('keeps the raw draft bound to attempt and preserves frozen runtime identity conflicts', async () => {
    const first = attempt(`draft-${Date.now()}`)
    const draftKey = situationalDraftKey(first.id)
    await ensureSituationalDraft(first)
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'S1:choice', value: { responseValue: 'A' }, updatedAt: Date.now() })

    await expect(ensureSituationalDraft(attempt(first.id, 'c'.repeat(64))))
      .rejects.toBeInstanceOf(FinalDraftIdentityConflictError)

    expect((await finalDraftStore.get(draftKey))?.definitionHash).toBe(first.definitionHash)
    expect(await finalDraftStore.listAnswers(draftKey)).toEqual([
      expect.objectContaining({ itemKey: 'S1:choice', value: { responseValue: 'A' } }),
    ])
    await finalDraftStore.delete(draftKey)
  })

  it('restores raw values and creates one ordered final payload without scoring fields', async () => {
    const next = attempt(`payload-${Date.now()}`)
    await ensureSituationalDraft(next)
    const draftKey = situationalDraftKey(next.id)
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'S1:choice', value: { responseValue: 'B' }, updatedAt: Date.now() })
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'S1:continuous', value: { responseValue: 0 }, updatedAt: Date.now() })
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'S2:choice', value: { responseValue: 'A' }, updatedAt: Date.now() })
    const responses = await readSituationalDraft(next)
    expect(answeredResponseCount(definition, responses)).toBe(3)
    expect(firstMissingSceneIndex(definition, responses)).toBe(-1)
    expect(situationalReadyToSubmit(definition, responses)).toBe(true)
    expect(situationalResponsesFromDraft(definition, responses)).toEqual([
      { sceneKey: 'S1', channelKey: 'choice', responseValue: 'B' },
      { sceneKey: 'S1', channelKey: 'continuous', responseValue: 0 },
      { sceneKey: 'S2', channelKey: 'choice', responseValue: 'A' },
    ])
    await finalDraftStore.delete(draftKey)
  })

  it('counts only the currently reachable branch and blocks submit until the branch terminates', () => {
    const partial = {
      'S1:choice': { responseValue: 'A' },
    }
    expect(expectedResponseKeys(branchingDefinition, partial)).toEqual(['S1:choice', 'S1:continuous'])
    expect(answeredResponseCount(branchingDefinition, partial)).toBe(1)
    expect(firstMissingSceneIndex(branchingDefinition, partial)).toBe(0)
    expect(situationalReadyToSubmit(branchingDefinition, partial)).toBe(false)

    const early = {
      'S1:choice': { responseValue: 'B' },
      'S1:continuous': { responseValue: 10 },
    }
    expect(expectedResponseKeys(branchingDefinition, early)).toEqual(['S1:choice', 'S1:continuous'])
    expect(situationalReadyToSubmit(branchingDefinition, early)).toBe(true)
  })

  it('prunes stale downstream answers after an upstream decision changes and excludes them from FINAL payload', async () => {
    const next = attempt(`branch-prune-${Date.now()}`)
    await ensureSituationalDraft(next)
    const draftKey = situationalDraftKey(next.id)
    const switched = {
      'S1:choice': { responseValue: 'B' },
      'S1:continuous': { responseValue: 25 },
      'S2:choice': { responseValue: 'A' },
    }
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'S1:choice', value: switched['S1:choice'], updatedAt: Date.now() })
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'S1:continuous', value: switched['S1:continuous'], updatedAt: Date.now() })
    await finalDraftStore.putAnswer({ draftKey, itemKey: 'S2:choice', value: switched['S2:choice'], updatedAt: Date.now() })

    expect(pruneUnreachableSituationalResponses(branchingDefinition, switched).staleKeys).toEqual(['S2:choice'])
    const pruned = await pruneSituationalDraftResponses(next, branchingDefinition, switched)

    expect(pruned).toEqual({
      'S1:choice': { responseValue: 'B' },
      'S1:continuous': { responseValue: 25 },
    })
    expect((await finalDraftStore.listAnswers(draftKey)).map((item) => item.itemKey)).toEqual(['S1:choice', 'S1:continuous'])
    expect(situationalResponsesFromDraft(branchingDefinition, switched)).toEqual([
      { sceneKey: 'S1', channelKey: 'choice', responseValue: 'B' },
      { sceneKey: 'S1', channelKey: 'continuous', responseValue: 25 },
    ])
    await finalDraftStore.delete(draftKey)
  })

  it.each([10, 30, 60])('keeps the single-final-request shape at %i scenes', (sceneCount) => {
    const scaledDefinition: SituationalRunnerDefinition = {
      ...definition,
      scenes: Array.from({ length: sceneCount }, (_, index) => ({
        sceneKey: `S${index + 1}`,
        title: `情境 ${index + 1}`,
        sortOrder: index,
        stimulus: { type: 'TEXT_V1' as const, text: `文本 ${index + 1}` },
        channels: [{
          channelKey: 'choice',
          responseType: 'SINGLE_CHOICE' as const,
          prompt: '选择',
          options: [{ optionKey: 'A', label: 'A' }, { optionKey: 'B', label: 'B' }],
        }],
      })),
    }
    const responses = Object.fromEntries(
      scaledDefinition.scenes.map((scene) => [responseKey(scene.sceneKey, 'choice'), { responseValue: 'A' }]),
    )
    const payload = situationalResponsesFromDraft(scaledDefinition, responses)

    expect(payload).toHaveLength(sceneCount)
    expect(payload.every((response) => response.responseValue === 'A')).toBe(true)
    expect(JSON.stringify(payload)).not.toMatch(/score|percentile|norm|contribution/i)
  })
})
