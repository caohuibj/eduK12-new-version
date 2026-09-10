import { describe, expect, it } from 'vitest'
import {
  expectedResponseKeys,
  firstMissingSceneIndex,
  pruneUnreachableSituationalResponses,
  situationalReadyToSubmit,
  situationalResponsesFromDraft,
} from '../draft'
import { deriveReachableTrajectory } from '../traversal'
import type {
  SituationalDraftAnswer,
  SituationalRunnerDefinitionV1,
  SituationalRunnerDefinitionV2,
  SituationalRunnerScene,
} from '../types'

const answer = (responseValue: string | number): SituationalDraftAnswer => ({ responseValue })

const scene = (
  sceneKey: string,
  channels: SituationalRunnerScene['channels'],
  sortOrder: number,
): SituationalRunnerScene => ({
  sceneKey,
  title: sceneKey,
  sortOrder,
  stimulus: { type: 'TEXT_V1', text: `Stimulus ${sceneKey}` },
  channels,
})

const choice = (channelKey = 'choice', required?: false) => ({
  channelKey,
  responseType: 'SINGLE_CHOICE' as const,
  prompt: channelKey,
  ...(required === false ? { required: false as const } : {}),
  options: [{ optionKey: 'A', label: 'A' }, { optionKey: 'B', label: 'B' }],
})

const diagnosticDefinition = (): SituationalRunnerDefinitionV2 => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  sampling: { strategy: 'BRANCH_REACHABLE' },
  scenes: [
    scene('S1', [choice('decision')], 0),
    scene('S2', [choice('diagnostic'), choice('reflection', false)], 1),
    scene('S3', [choice('outcome')], 2),
  ],
  flow: {
    strategy: 'BRANCHING_DAG_V1',
    entryNodeKey: 'n1',
    nodes: [
      {
        nodeType: 'SCENE',
        nodeKey: 'n1',
        sceneKey: 'S1',
        motherSceneKey: 'M1',
        roundKey: 'R1',
        stepKey: 'decision',
        interactionRole: 'DECISION',
        transition: {
          type: 'DECISION',
          channelKey: 'decision',
          branches: [
            { optionKey: 'A', nextNodeKey: 'n2' },
            { optionKey: 'B', nextNodeKey: 'early' },
          ],
        },
      },
      {
        nodeType: 'SCENE',
        nodeKey: 'n2',
        sceneKey: 'S2',
        motherSceneKey: 'M1',
        roundKey: 'R1',
        stepKey: 'diagnostic',
        interactionRole: 'DIAGNOSTIC',
        transition: { type: 'NEXT', nextNodeKey: 'n3' },
      },
      {
        nodeType: 'SCENE',
        nodeKey: 'n3',
        sceneKey: 'S3',
        motherSceneKey: 'M1',
        roundKey: 'R2',
        stepKey: 'diagnostic',
        interactionRole: 'DIAGNOSTIC',
        transition: { type: 'NEXT', nextNodeKey: 'complete' },
      },
      { nodeType: 'TERMINAL', nodeKey: 'early' },
      { nodeType: 'TERMINAL', nodeKey: 'complete' },
    ],
  },
})

describe('Situational V2 diagnostic multi-round local draft', () => {
  it('does not let an optional diagnostic block traversal, progress, or FINAL readiness', () => {
    const definition = diagnosticDefinition()
    const responses = {
      'S1:decision': answer('A'),
      'S2:diagnostic': answer('A'),
      'S3:outcome': answer('B'),
    }

    expect(deriveReachableTrajectory(definition, responses)).toEqual({
      nodeKeys: ['n1', 'n2', 'n3', 'complete'],
      sceneKeys: ['S1', 'S2', 'S3'],
      terminalNodeKey: 'complete',
    })
    expect(expectedResponseKeys(definition, responses)).toEqual([
      'S1:decision',
      'S2:diagnostic',
      'S3:outcome',
    ])
    expect(firstMissingSceneIndex(definition, responses)).toBe(-1)
    expect(situationalReadyToSubmit(definition, responses)).toBe(true)
  })

  it('keeps an answered optional diagnostic in FINAL raw responses', () => {
    const definition = diagnosticDefinition()
    const responses = {
      'S1:decision': answer('A'),
      'S2:diagnostic': answer('A'),
      'S2:reflection': answer('B'),
      'S3:outcome': answer('B'),
    }

    expect(situationalResponsesFromDraft(definition, responses).map((entry) => `${entry.sceneKey}:${entry.channelKey}`)).toEqual([
      'S1:decision',
      'S2:diagnostic',
      'S2:reflection',
      'S3:outcome',
    ])
  })

  it('prunes required and optional downstream answers when an upstream branch changes across rounds', () => {
    const definition = diagnosticDefinition()
    const switched = {
      'S1:decision': answer('B'),
      'S2:diagnostic': answer('A'),
      'S2:reflection': answer('B'),
      'S3:outcome': answer('A'),
    }
    const pruned = pruneUnreachableSituationalResponses(definition, switched)
    expect(pruned.staleKeys.sort()).toEqual(['S2:diagnostic', 'S2:reflection', 'S3:outcome'])
    expect(pruned.responses).toEqual({ 'S1:decision': answer('B') })
    expect(situationalReadyToSubmit(definition, pruned.responses)).toBe(true)
  })

  it('preserves V1 required-all semantics', () => {
    const definition: SituationalRunnerDefinitionV1 = {
      schemaVersion: 1,
      respondentType: 'participant_self_report',
      sampling: { strategy: 'ALL' },
      scenes: [scene('S1', [choice('choice'), choice('reflection')], 0)],
    }
    expect(expectedResponseKeys(definition, { 'S1:choice': answer('A') })).toEqual(['S1:choice', 'S1:reflection'])
    expect(firstMissingSceneIndex(definition, { 'S1:choice': answer('A') })).toBe(0)
  })
})
