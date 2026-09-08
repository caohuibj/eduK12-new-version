import { describe, expect, it } from 'vitest'
import {
  answeredResponseCount,
  ensureSituationalDraft,
  firstMissingSceneIndex,
  readSituationalDraft,
  responseKey,
  situationalDraftKey,
  situationalResponsesFromDraft,
} from '../draft'
import { finalDraftStore } from '../../../services/persistence/finalDraftStore'
import type { SituationalAttempt, SituationalRunnerDefinition } from '../types'

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
  it('keeps the raw draft bound to attempt and frozen runtime identity', async () => {
    const first = attempt(`draft-${Date.now()}`)
    await ensureSituationalDraft(first)
    await finalDraftStore.putAnswer({ draftKey: situationalDraftKey(first.id), itemKey: 'S1:choice', value: { responseValue: 'A' }, updatedAt: Date.now() })
    await ensureSituationalDraft(attempt(first.id, 'c'.repeat(64)))
    expect(await finalDraftStore.listAnswers(situationalDraftKey(first.id))).toEqual([])
    await finalDraftStore.delete(situationalDraftKey(first.id))
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
    expect(situationalResponsesFromDraft(definition, responses)).toEqual([
      { sceneKey: 'S1', channelKey: 'choice', responseValue: 'B' },
      { sceneKey: 'S1', channelKey: 'continuous', responseValue: 0 },
      { sceneKey: 'S2', channelKey: 'choice', responseValue: 'A' },
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
