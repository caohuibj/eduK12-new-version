import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WholeCompositeV2Runner } from '../WholeCompositeV2Runner'
import WholeCompositeQuestionnaire from '../WholeCompositeQuestionnaire'
import type { CompositeAttemptState } from '../../modules/composite/types'
import type {
  WholeV2CheckpointSnapshot,
  WholeV2Client,
  WholeV2Meta,
  WholeV2Template,
} from '../../modules/composite/whole-v2.types'

const PUB_HASH = 'a'.repeat(64)
const SLOT_SET_HASH = 'b'.repeat(64)
const FORM_DEF_HASH = 'c'.repeat(64)
const SCALE_DEF_HASH = 'd'.repeat(64)
const SJT_DEF_HASH = 'e'.repeat(64)
const COG_DEF_HASH = 'f'.repeat(64)

function makeFourFamilyTemplate(): WholeV2Template {
  return {
    schemaVersion: 2,
    publicationHash: PUB_HASH,
    slotSetHash: SLOT_SET_HASH,
    compositeId: 'comp-1',
    title: '四合一统一整卷测试',
    instruction: '请按顺序作答全部四类工具',
    units: [
      {
        slotKey: 'form:sec-1',
        unitType: 'FORM_SECTION',
        sectionId: 'sec-1',
        title: '背景信息',
        description: '用于常模匹配',
        required: true,
        position: 0,
        contextSection: true,
        definitionHash: FORM_DEF_HASH,
        items: [{
          id: 'fi-grade',
          formType: 'single_choice',
          formLabel: '您的年级',
          formPlaceholder: null,
          required: true,
          formOptions: [{ value: '7', label: '七年级' }, { value: '8', label: '八年级' }],
          contextKey: 'gradeLevel',
        }],
      },
      {
        slotKey: 'scale:item-scale',
        unitType: 'SCALE',
        itemId: 'item-scale',
        scaleId: 'scale-1',
        title: '情绪量表',
        required: true,
        position: 1,
        definitionHash: SCALE_DEF_HASH,
        definition: {
          schemaVersion: 2,
          respondentType: 'participant_self_report',
          display: { randomizeItems: false },
          items: [{
            itemCode: 'q1',
            content: '我最近情绪平稳',
            type: 'single',
            required: true,
            sortOrder: 0,
            responseSetKey: 'r1',
            randomizeOptions: false,
            options: [{ value: 1, label: '不符合' }, { value: 4, label: '非常符合' }],
          }],
        },
      },
      {
        slotKey: 'situational:item-sjt',
        unitType: 'SITUATIONAL',
        itemId: 'item-sjt',
        instrumentKey: 'sjt-demo',
        instrumentVersion: '1.0.0',
        title: '同伴沟通情境',
        required: true,
        position: 2,
        definitionHash: SJT_DEF_HASH,
        compiledRuntimeHash: '1'.repeat(64),
        scorerKey: 'sjt.v1',
        scoringVersion: '1.0.0',
        definition: {
          schemaVersion: 1,
          respondentType: 'participant_self_report',
          sampling: { strategy: 'ALL' },
          scenes: [{
            sceneKey: 'scene-1',
            title: '场景一',
            sortOrder: 0,
            stimulus: { type: 'TEXT_V1', text: '小组讨论时意见不一致' },
            channels: [{
              channelKey: 'action',
              responseType: 'SINGLE_CHOICE',
              prompt: '你会怎么做？',
              options: [{ optionKey: 'A', label: '倾听并协商' }],
            }],
          }],
        },
      },
      {
        slotKey: 'cognitive:item-cog',
        unitType: 'COGNITIVE',
        itemId: 'item-cog',
        testType: 'gonogo',
        title: 'Go/No-Go 认知测验',
        required: true,
        position: 3,
        definitionHash: COG_DEF_HASH,
        configVersion: '1.0.0',
        engineVersion: '1.0.0',
        scoringVersion: '1.0.0',
        protocolSignature: '2'.repeat(64),
        protocol: {
          schemaVersion: 1,
          key: 'gonogo/1.0.0/1.0.0',
          version: '1.0.0',
          clock: 'performance',
          randomizationAlgorithmVersion: '1.0.0',
          trialEnvelopeVersion: 1,
          phases: [{ key: 'test', persists: true, required: true }],
          measurementCriticalConfigPaths: ['*'],
        },
        profile: 'standard',
        config: { totalTrials: 8 },
      },
    ],
  }
}

function makeMockV2Client(initialCheckpoint?: Partial<WholeV2CheckpointSnapshot>): {
  client: WholeV2Client
  savedCheckpoints: any[]
  submittedPayloads: any[]
} {
  let checkpoint: WholeV2CheckpointSnapshot = {
    attemptId: 'att-v2-1',
    attemptEpoch: 1,
    publicationHash: PUB_HASH,
    revision: 0,
    saveCount: 0,
    lockedSlotKeys: [],
    expiresAt: null,
    updatedAt: null,
    envelope: null,
    ...initialCheckpoint,
  }
  const savedCheckpoints: any[] = []
  const submittedPayloads: any[] = []
  const template = makeFourFamilyTemplate()
  const meta: WholeV2Meta = {
    executionMode: 'WHOLE_V2',
    attemptId: 'att-v2-1',
    attemptEpoch: 1,
    publicationHash: PUB_HASH,
    slotSetHash: SLOT_SET_HASH,
    templateHash: PUB_HASH,
    receiptOnly: false,
    unitSeeds: { 'cognitive:item-cog': 'server-seed-xyz' },
    checkpoint,
  }

  const client: WholeV2Client = {
    loadMeta: vi.fn(async () => ({ code: 0, message: '成功', data: { ...meta, checkpoint } })),
    loadTemplate: vi.fn(async () => ({ code: 0, message: '成功', data: template })),
    readCheckpoint: vi.fn(async () => ({ code: 0, message: '成功', data: checkpoint })),
    saveCheckpoint: vi.fn(async input => {
      savedCheckpoints.push(input)
      const nextLocked = { ...(checkpoint.envelope?.lockedUnits ?? {}) }
      if (input.lockUnit) {
        nextLocked[input.lockUnit.slotKey] = {
          ...input.lockUnit.unit,
          lockedAt: '2026-11-24T01:00:00.000Z',
        } as any
      }
      checkpoint = {
        ...checkpoint,
        revision: checkpoint.revision + 1,
        saveCount: checkpoint.saveCount + 1,
        lockedSlotKeys: Object.keys(nextLocked),
        envelope: {
          schemaVersion: 1,
          drafts: input.drafts,
          lockedUnits: nextLocked,
        },
      }
      return { code: 0, message: '成功', data: checkpoint }
    }),
    clearCheckpoint: vi.fn(async () => ({ code: 0, message: '成功', data: { cleared: true } })),
    submitWhole: vi.fn(async input => {
      submittedPayloads.push(input)
      return {
        code: 0,
        message: '成功',
        data: {
          status: 'COMPLETED' as const,
          attemptId: 'att-v2-1',
          attemptEpoch: 1,
          submissionId: input.submissionId,
          payloadHash: '3'.repeat(64),
          aggregateHash: '4'.repeat(64),
          factsHash: '5'.repeat(64),
          rawHash: '6'.repeat(64),
          completedAt: '2026-11-24T01:05:00.000Z',
          receiptOnly: false,
          feedbackAvailable: true,
          replayed: false,
        },
      }
    }),
    loadSlotImage: vi.fn(async () => new Blob(['img'], { type: 'image/png' })),
    issueSlotVideo: vi.fn(async () => ({
      code: 0,
      message: '成功',
      data: { videoUrl: '/api/assets/v', captions: [], expiresAt: 9999999999 },
    })),
  }
  return { client, savedCheckpoints, submittedPayloads }
}

describe('WholeCompositeV2Runner (4-in-1 Form + Scale + SJT + Cognitive)', () => {
  it('completes Form + Scale + SJT + Cognitive with monotonic checkpoint locks and 1 synchronous submit', async () => {
    const { client, savedCheckpoints, submittedPayloads } = makeMockV2Client()
    const onCompleted = vi.fn()
    const onExit = vi.fn()
    let observedCogSeed = ''

    render(
      <WholeCompositeV2Runner
        attemptId="att-v2-1"
        client={client}
        onExit={onExit}
        onCompleted={onCompleted}
        renderSituational={({ attemptId, client: sjtClient, onCompleted: done }) => (
          <button
            type="button"
            onClick={async () => {
              await sjtClient.loadAsset(attemptId, 'asset-sjt-1')
              await sjtClient.loadVideoSources(attemptId, 'scene-1')
              await sjtClient.submit(attemptId, {
                submissionId: 'sjt-sub-1',
                attemptEpoch: 1,
                definitionHash: SJT_DEF_HASH,
                instrumentVersion: '1.0.0',
                compiledRuntimeHash: '1'.repeat(64),
                scoringVersion: '1.0.0',
                responses: [{ sceneKey: 'scene-1', channelKey: 'action', responseValue: 'A', responseTimeMs: 4200 }],
              })
              done()
            }}
          >
            完成情境测评
          </button>
        )}
        renderCognitive={({ sessionId, api: cogApi, onCompleted: done }) => (
          <button
            type="button"
            onClick={async () => {
              const session = await cogApi.getSession(sessionId)
              observedCogSeed = session.data.randomSeed
              await cogApi.loadAsset!(sessionId, 'asset-cog-1')
              await cogApi.issueVideoCapabilities!(sessionId, 'intro')
              await cogApi.submitFinal!(sessionId, {
                submissionId: 'cog-sub-1',
                attemptEpoch: 1,
                definitionHash: COG_DEF_HASH,
                trials: [{ trialIndex: 0, payload: { trialType: 'go', responded: true, rtMs: 320, interrupted: false } }],
              })
              done()
            }}
          >
            完成认知测验
          </button>
        )}
      />,
    )

    // Step 1: Context Form
    await screen.findByText('您的年级')
    fireEvent.click(screen.getByText('八年级'))
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))

    // Step 2: Scale
    await screen.findByText('我最近情绪平稳')
    fireEvent.click(screen.getByText('非常符合'))
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))

    // Step 3: SJT (locks via PUT /v2/checkpoint & routes slot media)
    const sjtBtn = await screen.findByRole('button', { name: '完成情境测评' })
    fireEvent.click(sjtBtn)
    await waitFor(() => expect(savedCheckpoints).toHaveLength(1))
    expect(savedCheckpoints[0].lockUnit.slotKey).toBe('situational:item-sjt')
    expect(client.loadSlotImage).toHaveBeenCalledWith('situational:item-sjt', 'asset-sjt-1')
    expect(client.issueSlotVideo).toHaveBeenCalledWith('situational:item-sjt', 'scene-1')

    // Step 4: Cognitive (receives server randomSeed, locks via PUT /v2/checkpoint)
    const cogBtn = await screen.findByRole('button', { name: '完成认知测验' })
    fireEvent.click(cogBtn)
    await waitFor(() => expect(savedCheckpoints).toHaveLength(2))
    expect(observedCogSeed).toBe('server-seed-xyz')
    expect(savedCheckpoints[1].lockUnit.slotKey).toBe('cognitive:item-cog')
    expect(savedCheckpoints[1].lockUnit.unit.randomSeed).toBe('server-seed-xyz')
    expect(client.loadSlotImage).toHaveBeenCalledWith('cognitive:item-cog', 'asset-cog-1')
    expect(client.issueSlotVideo).toHaveBeenCalledWith('cognitive:item-cog', 'intro')

    // Now Cognitive step shows locked state & final Submit button
    await screen.findByTestId('locked-unit:cognitive:item-cog')
    fireEvent.click(screen.getByRole('button', { name: '提交整份问卷' }))

    await waitFor(() => expect(submittedPayloads).toHaveLength(1))
    expect(submittedPayloads[0]).toMatchObject({
      attemptEpoch: 1,
      publicationHash: PUB_HASH,
      slotSetHash: SLOT_SET_HASH,
      units: {
        'form:sec-1': { unitType: 'FORM_SECTION', answers: [{ formItemId: 'fi-grade', value: '8' }] },
        'scale:item-scale': { unitType: 'SCALE', answers: [{ itemCode: 'q1', responseValue: 4 }] },
        'situational:item-sjt': { unitType: 'SITUATIONAL', responses: { 'scene-1:action': 'A' } },
        'cognitive:item-cog': { unitType: 'COGNITIVE', randomSeed: 'server-seed-xyz' },
      },
    })
    expect(onCompleted).toHaveBeenCalledTimes(1)
  })

  it('restores checkpoint drafts and prevents retrying already-locked Cognitive unit after page reload', async () => {
    const { client } = makeMockV2Client({
      revision: 3,
      lockedSlotKeys: ['situational:item-sjt', 'cognitive:item-cog'],
      envelope: {
        schemaVersion: 1,
        drafts: {
          'form:sec-1': { 'fi-grade': '7' },
          'scale:item-scale': { q1: 1 },
        },
        lockedUnits: {
          'situational:item-sjt': {
            unitType: 'SITUATIONAL',
            itemId: 'item-sjt',
            responses: { 'scene-1:action': 'A' },
            lockedAt: '2026-11-24T00:10:00.000Z',
          },
          'cognitive:item-cog': {
            unitType: 'COGNITIVE',
            itemId: 'item-cog',
            randomSeed: 'server-seed-xyz',
            trials: [{ trialIndex: 0 }],
            lockedAt: '2026-11-24T00:15:00.000Z',
          },
        },
      },
    })
    const cognitiveMountSpy = vi.fn()

    render(
      <WholeCompositeV2Runner
        attemptId="att-v2-1"
        client={client}
        onExit={vi.fn()}
        onCompleted={vi.fn()}
        renderCognitive={() => {
          cognitiveMountSpy()
          return <p>SHOULD NOT MOUNT</p>
        }}
      />,
    )

    // Advance from step 1 -> step 4 (all answers already restored)
    await screen.findByText('您的年级')
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))
    await screen.findByText('我最近情绪平稳')
    fireEvent.click(screen.getByRole('button', { name: '下一题' }))
    await screen.findByTestId('locked-unit:situational:item-sjt')
    fireEvent.click(screen.getByRole('button', { name: '继续下一步' }))
    await screen.findByTestId('locked-unit:cognitive:item-cog')

    // Cognitive runner must NEVER be mounted again once locked
    expect(cognitiveMountSpy).not.toHaveBeenCalled()
  })

  it('dispatches WholeCompositeQuestionnaire to WholeCompositeV2Runner when executionMode is WHOLE_V2', async () => {
    const { client } = makeMockV2Client()
    const v2State = {
      id: 'att-v2-1',
      attemptEpoch: 1,
      name: 'V2 路由测试',
      instruction: null,
      executionMode: 'WHOLE_V2',
      deliveryMode: 'FINAL_ONLY',
      status: 'IN_PROGRESS',
      items: [],
      currentItem: null,
    } as unknown as CompositeAttemptState

    render(
      <WholeCompositeQuestionnaire
        state={v2State}
        api={{} as any}
        v2Client={client}
        fallback={<p>LEGACY STEPPED FALLBACK</p>}
        onExit={vi.fn()}
        onCompleted={vi.fn()}
      />,
    )

    await screen.findByText('四合一统一整卷测试')
    expect(screen.queryByText('LEGACY STEPPED FALLBACK')).toBeNull()
    expect(client.loadMeta).toHaveBeenCalledTimes(1)
  })
})
