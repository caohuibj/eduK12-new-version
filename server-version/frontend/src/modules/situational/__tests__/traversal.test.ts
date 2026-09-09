import { describe, expect, it } from 'vitest'
import { deriveReachableTrajectory, reachableSituationalScenes } from '../traversal'
import type { SituationalDraftAnswer, SituationalRunnerDefinition, SituationalRunnerDefinitionV2 } from '../types'

const scene = (sceneKey: string, withContinuous = false) => ({
  sceneKey,
  title: sceneKey,
  sortOrder: Number(sceneKey.replace(/\D/g, '')) || 0,
  stimulus: { type: 'TEXT_V1' as const, text: `Stimulus ${sceneKey}` },
  channels: [
    {
      channelKey: 'choice',
      responseType: 'SINGLE_CHOICE' as const,
      prompt: 'Choose',
      options: [{ optionKey: 'A', label: 'A' }, { optionKey: 'B', label: 'B' }],
    },
    ...(withContinuous ? [{
      channelKey: 'confidence',
      responseType: 'CONTINUOUS' as const,
      prompt: 'Confidence',
      range: { min: 0, max: 100 },
    }] : []),
  ],
})

const branchingDefinition: SituationalRunnerDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  sampling: { strategy: 'BRANCH_REACHABLE' },
  scenes: [scene('S1', true), scene('S2'), scene('S3'), scene('S4')],
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
        transition: { type: 'NEXT', nextNodeKey: 'n3' },
      },
      {
        nodeType: 'SCENE', nodeKey: 'n3', sceneKey: 'S3', motherSceneKey: 'M1', roundKey: 'R3', stepKey: 'P1',
        transition: { type: 'DECISION', channelKey: 'choice', branches: [{ optionKey: 'A', nextNodeKey: 'complete' }, { optionKey: 'B', nextNodeKey: 'n4' }] },
      },
      {
        nodeType: 'SCENE', nodeKey: 'n4', sceneKey: 'S4', motherSceneKey: 'M1', roundKey: 'R4', stepKey: 'P1',
        transition: { type: 'NEXT', nextNodeKey: 'complete' },
      },
      { nodeType: 'TERMINAL', nodeKey: 'early' },
      { nodeType: 'TERMINAL', nodeKey: 'complete' },
    ],
  },
}

const answer = (responseValue: string | number): SituationalDraftAnswer => ({ responseValue })

describe('Situational local branching traversal', () => {
  it('preserves V1 linear presentation regardless of local completion state', () => {
    const definition: SituationalRunnerDefinition = {
      schemaVersion: 1,
      respondentType: 'participant_self_report',
      sampling: { strategy: 'ALL' },
      scenes: [scene('S1'), scene('S2'), scene('S3')],
    }
    expect(deriveReachableTrajectory(definition, {}).sceneKeys).toEqual(['S1', 'S2', 'S3'])
    expect(reachableSituationalScenes(definition, {}).map((item) => item.sceneKey)).toEqual(['S1', 'S2', 'S3'])
  })

  it('requires the entire branching scene to be complete before advancing', () => {
    const onlyDecision = { 'S1:choice': answer('A') }
    expect(deriveReachableTrajectory(branchingDefinition, onlyDecision)).toMatchObject({
      sceneKeys: ['S1'],
      terminalNodeKey: null,
    })

    const completeScene = { ...onlyDecision, 'S1:confidence': answer(75) }
    expect(deriveReachableTrajectory(branchingDefinition, completeScene)).toMatchObject({
      sceneKeys: ['S1', 'S2'],
      terminalNodeKey: null,
    })
  })

  it('supports early terminal and nested deterministic decisions', () => {
    const early = {
      'S1:choice': answer('B'),
      'S1:confidence': answer(50),
    }
    expect(deriveReachableTrajectory(branchingDefinition, early)).toEqual({
      nodeKeys: ['n1', 'early'],
      sceneKeys: ['S1'],
      terminalNodeKey: 'early',
    })

    const nested = {
      'S1:choice': answer('A'),
      'S1:confidence': answer(50),
      'S2:choice': answer('A'),
      'S3:choice': answer('B'),
      'S4:choice': answer('A'),
    }
    expect(deriveReachableTrajectory(branchingDefinition, nested)).toEqual({
      nodeKeys: ['n1', 'n2', 'n3', 'n4', 'complete'],
      sceneKeys: ['S1', 'S2', 'S3', 'S4'],
      terminalNodeKey: 'complete',
    })
  })

  it('ignores stale answers from an off-path branch when deriving the new trajectory', () => {
    const switchedToEarly = {
      'S1:choice': answer('B'),
      'S1:confidence': answer(20),
      'S2:choice': answer('A'),
      'S3:choice': answer('A'),
    }
    expect(deriveReachableTrajectory(branchingDefinition, switchedToEarly).sceneKeys).toEqual(['S1'])
    expect(reachableSituationalScenes(branchingDefinition, switchedToEarly).map((item) => item.sceneKey)).toEqual(['S1'])
  })
})
