import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  ensure: vi.fn(),
  setInstrumentMetadata: vi.fn(),
  listAnswers: vi.fn(),
  putAnswer: vi.fn(),
  sealForSubmission: vi.fn(),
  setStatus: vi.fn(),
  getDraft: vi.fn(),
  deleteDraft: vi.fn(),
  videoGateProps: null as null | Record<string, unknown>,
  hideVideoChildren: false,
}))

vi.mock('../../../api/client', () => ({
  default: {
    post: mocks.post,
    get: mocks.get,
    patch: vi.fn(),
  },
  sessionFetch: vi.fn(),
}))

vi.mock('../../../services/persistence/finalDraftStore', () => ({
  FinalDraftStorageError: class FinalDraftStorageError extends Error {
    code = 'FINAL_DRAFT_STORAGE_ERROR'
  },
  createFinalDraftMeta: (input: Record<string, unknown>) => ({
    ...input,
    status: 'DRAFT',
    createdAt: 1,
    updatedAt: 1,
  }),
  finalDraftStore: {
    ensure: mocks.ensure,
    setInstrumentMetadata: mocks.setInstrumentMetadata,
    listAnswers: mocks.listAnswers,
    putAnswer: mocks.putAnswer,
    sealForSubmission: mocks.sealForSubmission,
    setStatus: mocks.setStatus,
    get: mocks.getDraft,
    delete: mocks.deleteDraft,
  },
}))

vi.mock('../../../services/persistence/flushLifecycle', () => ({
  useCheckpointLifecycle: vi.fn(),
}))

vi.mock('../../../hooks/useRunnerSaveState', () => ({
  useRunnerSaveState: () => ({
    saving: false,
    savingRef: { current: false },
    runSave: async (operation: () => Promise<unknown>) => operation(),
  }),
}))

vi.mock('../../../modules/assessment-media/AssessmentImageGate', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../../../modules/assessment-media/ScaleFormVideoGate', () => ({
  default: (props: Record<string, unknown> & { children?: ReactNode }) => {
    mocks.videoGateProps = props
    return mocks.hideVideoChildren ? null : props.children
  },
}))

import ScaleAssessment from '../ScaleAssessment'

const videoPresentation = {
  schemaVersion: 1,
  video: {
    assetId: 'video-1',
    contentHash: 'a'.repeat(64),
    mimeType: 'video/mp4',
  },
}

const scaleFixture = (withVideo = false) => ({
  id: 'scale-1',
  name: '参考量表',
  instruction: '请根据真实感受作答。',
  estimatedTime: 5,
  definitionHash: 'definition-hash',
  definition: {
    schemaVersion: 2 as const,
    respondentType: 'SELF',
    display: { randomizeItems: false },
    items: [
      {
        itemCode: 'item-1',
        content: '第一题',
        type: 'SINGLE_CHOICE',
        required: true,
        sortOrder: 1,
        responseSetKey: 'likert',
        randomizeOptions: false,
        ...(withVideo ? { video: videoPresentation } : {}),
        options: [
          { value: 1, label: '从不' },
          { value: 2, label: '有时' },
        ],
      },
      {
        itemCode: 'item-2',
        content: '第二题',
        type: 'SINGLE_CHOICE',
        required: true,
        sortOrder: 2,
        responseSetKey: 'likert',
        randomizeOptions: false,
        options: [
          { value: 1, label: '不同意' },
          { value: 2, label: '同意' },
        ],
      },
    ],
  },
})

const assessmentFixture = {
  id: 'attempt-1',
  status: 'IN_PROGRESS',
  progress: 0,
  answers: [],
  deliveryMode: 'FINAL_ONLY' as const,
  attemptEpoch: 1,
  definitionHash: 'definition-hash',
  contextSnapshotHash: null,
}

const draftMeta = (sealed = false) => ({
  draftKey: 'scale:attempt-1',
  instrument: 'scale',
  attemptId: 'attempt-1',
  attemptEpoch: 1,
  definitionHash: 'definition-hash',
  contextSnapshotHash: null,
  deliveryMode: 'final_only',
  submissionId: 'submission-1',
  status: sealed ? 'RETRY_PENDING' : 'DRAFT',
  createdAt: 1,
  updatedAt: 1,
  ...(sealed ? {
    sealedSubmission: {
      schemaVersion: 1,
      sealedAt: 2,
      payload: { submissionId: 'submission-1', answers: [] },
    },
  } : {}),
})

type SealSnapshot = {
  meta: ReturnType<typeof draftMeta>
  answers: Array<{ itemKey: string; value: unknown }>
  trials: never[]
}

const storedAnswers = () => ([
  { itemKey: 'item-1', value: { responseValue: 1, responseTimeMs: 100 } },
  { itemKey: 'item-2', value: { responseValue: 2, responseTimeMs: 120 } },
])

const renderRunner = (withVideo = false) => {
  mocks.post.mockImplementation(async (url: string) => {
    if (url === '/scales/scale-1/assessments') {
      return { code: 0, message: 'ok', data: { assessment: assessmentFixture, scale: scaleFixture(withVideo) } }
    }
    throw new Error(`unexpected POST ${url}`)
  })
  return render(
    <MemoryRouter initialEntries={['/student/scales/scale-1']}>
      <Routes>
        <Route path="/student/scales/:scaleId" element={<ScaleAssessment />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScaleAssessment reference journey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.videoGateProps = null
    mocks.hideVideoChildren = false
    mocks.ensure.mockResolvedValue(draftMeta(false))
    mocks.setInstrumentMetadata.mockImplementation(async (_draftKey: string, metadata: Record<string, unknown>) => ({
      ...draftMeta(false),
      instrumentMetadata: metadata,
    }))
    mocks.listAnswers.mockResolvedValue([])
    mocks.putAnswer.mockResolvedValue(undefined)
    mocks.getDraft.mockResolvedValue(draftMeta(false))
    mocks.deleteDraft.mockResolvedValue(undefined)
  })

  it('uses native radio semantics and keeps the student on the current item after a durable answer save', async () => {
    const user = userEvent.setup()
    renderRunner(false)

    const option = await screen.findByRole('radio', { name: '有时' })
    expect(screen.getByText('第 1 题 / 共 2 题')).toBeInTheDocument()

    await user.click(option)
    await waitFor(() => expect(mocks.putAnswer).toHaveBeenCalledWith(expect.objectContaining({
      draftKey: 'scale:attempt-1',
      itemKey: 'item-1',
      value: expect.objectContaining({ responseValue: 2 }),
    })))
    expect(option).toBeChecked()
    expect(screen.getByText('第 1 题 / 共 2 题')).toBeInTheDocument()
    expect(screen.getByText('本题答案已保存到本机，可继续或返回修改。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下一题' }))
    expect(screen.getByRole('heading', { name: '第二题' })).toBeInTheDocument()
  })

  it('passes the frozen draft/item identity into required video viewing for an editable FINAL_ONLY attempt', async () => {
    renderRunner(true)

    await screen.findByRole('heading', { name: '第一题' })
    await waitFor(() => expect(mocks.videoGateProps).not.toBeNull())
    expect(mocks.videoGateProps?.requiredViewing).toEqual({
      draftKey: 'scale:attempt-1',
      slotKey: 'scale-item:item-1:video',
    })
  })

  it('fails before the first seal when an answered video item has no durable completion marker', async () => {
    const user = userEvent.setup()
    mocks.listAnswers.mockResolvedValue(storedAnswers())
    mocks.sealForSubmission.mockImplementation(async (_draftKey: string, builder: (snapshot: SealSnapshot) => unknown) => (
      builder({ meta: draftMeta(false), answers: storedAnswers(), trials: [] })
    ))
    renderRunner(true)

    await screen.findByRole('heading', { name: '第一题' })
    await user.click(screen.getByRole('button', { name: '下一题' }))
    expect(screen.getByRole('heading', { name: '第二题' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '完成测评' }))

    await waitFor(() => expect(mocks.sealForSubmission).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('heading', { name: '第一题' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('该题包含必看视频')
  })

  it('keeps exact sealed FINAL retry reachable even when media content is unavailable', async () => {
    const user = userEvent.setup()
    mocks.ensure.mockResolvedValue(draftMeta(true))
    mocks.getDraft.mockResolvedValue(draftMeta(true))
    mocks.hideVideoChildren = true
    renderRunner(true)

    expect(await screen.findByText('提交内容已封存')).toBeInTheDocument()
    await waitFor(() => expect(mocks.videoGateProps?.requiredViewing).toBeUndefined())
    await user.click(screen.getByRole('button', { name: '下一题' }))
    expect(await screen.findByRole('button', { name: '重新核对提交' })).toBeInTheDocument()
  })
})
