import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ScaleLibraryEntry } from '../../api/scaleLibrary'

const { mockList, mockDetail, authState } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockDetail: vi.fn(),
  authState: { user: { id: 'student-1', role: 'STUDENT' as 'STUDENT' | 'ADMIN' } },
}))

vi.mock('../../api/scaleLibrary', () => ({
  getScaleLibrary: mockList,
  getScaleLibraryEntry: mockDetail,
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

import ScaleLibrary from '../ScaleLibrary'

const entry = (overrides: Partial<ScaleLibraryEntry> = {}): ScaleLibraryEntry => ({
  identity: {
    instrumentKey: 'who5',
    instrumentVersion: '1.0.0',
    canonicalName: 'WHO-5 Well-Being Index',
    abbreviation: 'WHO-5',
  },
  source: { citation: 'WHO source', url: 'https://example.org/who5' },
  construct: {
    primaryDomain: 'WELL_BEING',
    secondaryDomains: [],
    constructDefinition: '过去两周身心健康相关感受。',
    constructLevel: 'SPECIFIC_CONSTRUCT',
    constructOverlapTags: [],
  },
  applicability: {
    minAge: 9,
    maxAge: 18,
    gradeRange: { minGrade: 3, maxGrade: 12 },
    populationNotes: '青少年自评。',
    respondentTypes: ['SELF'],
    developmentalEvidence: 'PARTIAL',
  },
  administration: {
    itemCount: 5,
    estimatedMinutes: 3,
    administrationModes: ['DIGITAL_SELF_ADMINISTERED'],
    timeFrame: '过去两周',
    requiredTraining: false,
    itemOrderLocked: true,
    responseFormatLocked: true,
    layoutConstraints: [],
  },
  intendedUse: {
    intendedUses: [{ use: 'INDIVIDUAL_REFLECTION', evidenceStatus: 'SUPPORTED' }],
    forbiddenUses: ['DIAGNOSIS'],
  },
  localization: {
    sourceLocale: 'zh-CN',
    targetLocale: 'zh-CN',
    localizationVersion: '1.0.0',
    adaptationMethod: 'ORIGINAL_SOURCE',
    reviewStatus: 'APPROVED',
    expertReviewStatus: 'COMPLETED',
    cognitiveDebriefStatus: 'NOT_ESTABLISHED',
  },
  rights: { status: 'NOT_GRANTED', commercialNature: 'NON_COMMERCIAL', locales: ['zh-CN'], territories: ['CN'] },
  evidence: { recordCount: 0, status: 'NO_EVIDENCE_RECORDED', coverageText: 'Wave 0 当前未在 Scientific Evidence Matrix 中录入可用于本地验证的科研证据；不作验证、常模或诊断声称。' },
  references: {
    policy: 'none',
    packageReferenceCount: 0,
    applicabilityCount: 0,
    referenceVersions: [],
    displayText: '当前仅提供描述性分数。',
  },
  report: {
    maxEligibleLevel: 'L2_DESCRIPTIVE',
    levels: {
      L1_SCORE_ONLY: { eligible: true },
      L2_DESCRIPTIVE: { eligible: true },
      L3_REFERENCED_INTERPRETIVE: { eligible: false },
    },
    scoreCount: 2,
    dimensionLabels: ['WHO-5 原始分', 'WHO-5 百分制分'],
    limitations: ['严格描述性；不作诊断。'],
    disclaimer: '本量表不是诊断工具。',
  },
  availability: {
    status: 'RESTRICTED',
    locale: 'zh-CN',
    territory: 'CN',
    respondent: 'SELF',
    reasons: ['当前量表包尚未发布。'],
  },
  ...overrides,
})

describe('ScaleLibrary page', () => {
  it('keeps progressive filters open and ignores late results after a newer filter request', async () => {
    let resolveOld!: (value: unknown) => void
    mockList.mockResolvedValueOnce({ code: 0, data: { entries: [entry()] } })
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValue({ code: 0, data: { entries: [] } })
    const user = userEvent.setup()
    render(<MemoryRouter><ScaleLibrary /></MemoryRouter>)
    await screen.findByText('WHO-5 Well-Being Index')
    const more = screen.getByText('更多筛选').closest('details')!
    expect(more).not.toHaveAttribute('open')
    await user.click(screen.getByText('更多筛选'))
    await user.type(screen.getByLabelText('年龄下界'), '10')
    await user.type(screen.getByLabelText('关键词'), 'older')
    await user.click(screen.getByRole('button', { name: '应用筛选' }))
    expect(more).toHaveAttribute('open')
    expect(screen.getByRole('button', { name: '移除年龄下界：10' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('关键词'))
    await user.type(screen.getByLabelText('关键词'), 'newer')
    await user.click(screen.getByRole('button', { name: '应用筛选' }))
    await screen.findByText('当前显示 0 个量表')
    await act(async () => resolveOld({ code: 0, data: { entries: [entry()] } }))
    expect(screen.queryByText('WHO-5 Well-Being Index')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '移除关键词：newer' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith({ minAge: 10, keyword: undefined }))
    await user.click(screen.getByRole('button', { name: '清除全部' }))
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith({}))
    expect(screen.queryByLabelText('已应用筛选')).not.toBeInTheDocument()
  })
  it('keeps an explicit root through loading, failure, retry and empty results', async () => {
    let reject!: (reason: Error) => void
    mockList.mockImplementationOnce(() => new Promise((_, no) => { reject = no }))
      .mockResolvedValueOnce({ code: 0, data: { entries: [] } })
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><ScaleLibrary /></MemoryRouter>)
    expect(screen.getByText('量表库加载中...').closest('.hui-scale-library')).not.toBeNull()
    reject(new Error('Offline'))
    expect((await screen.findByRole('alert')).closest('.hui-scale-library')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect((await screen.findByText('没有符合条件的量表')).closest('.hui-scale-library')).not.toBeNull()
    expect(container.querySelectorAll('.hui-scale-library')).toHaveLength(1)
  })
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'student-1', role: 'STUDENT' }
  })

  it('renders metadata cards and the no-results state without item content', async () => {
    mockList.mockResolvedValue({ code: 0, message: 'ok', data: { schemaVersion: 1, generatedAt: '2026-09-07T00:00:00.000Z', entries: [entry()] } })
    render(<MemoryRouter initialEntries={['/scale-library']}><ScaleLibrary /></MemoryRouter>)

    expect(await screen.findByText('WHO-5 Well-Being Index')).toBeInTheDocument()
    expect(screen.getByText('受限', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('过去两周身心健康相关感受。')).toBeInTheDocument()
    expect(screen.getByLabelText('年级下界')).toBeInTheDocument()
    expect(screen.getByLabelText('年级上界')).toBeInTheDocument()
    expect(screen.queryByText(/我感觉快乐/)).not.toBeInTheDocument()

    mockList.mockResolvedValue({ code: 0, message: 'ok', data: { schemaVersion: 1, generatedAt: '2026-09-07T00:00:00.000Z', entries: [] } })
    screen.getByRole('button', { name: '应用筛选' }).click()
    await waitFor(() => expect(screen.getByText('没有符合条件的量表')).toBeInTheDocument())
  })

  it('renders detail governance only when the API supplies the controlled projection', async () => {
    const controlled = entry({
      availability: {
        status: 'AVAILABLE',
        locale: 'zh-CN',
        territory: 'CN',
        respondent: 'SELF',
        reasons: [],
        launch: { scaleId: 'scale-who5', route: '/student/scales/scale-who5' },
      },
      governance: {
        catalogManifestVersion: 1,
        catalogStatus: 'ACCEPTED',
        scientificMaturity: 'PILOT',
        bindingStatus: 'BOUND',
        packageReleaseStatus: 'PUBLISHED',
        definitionHash: 'hash',
        evidence: [],
        referenceApplicability: [],
        gate: {
          publishable: true,
          errors: [],
          warnings: [],
          reportEligibility: {
            maxEligibleLevel: 'L2_DESCRIPTIVE',
            pilotWordingRequired: false,
            requiredReferenceWording: [],
            forbiddenClaims: ['全国常模'],
          },
        },
      },
    })
    mockDetail.mockResolvedValue({ code: 0, message: 'ok', data: { entry: controlled } })
    render(
      <MemoryRouter initialEntries={['/scale-library/who5/1.0.0']}>
        <Routes><Route path="/scale-library/:instrumentKey/:instrumentVersion" element={<ScaleLibrary />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('WHO-5 Well-Being Index')).toBeInTheDocument()
    // Ordinary users do not see governance, even if a malformed client-side
    // fixture happens to contain the optional controlled projection.
    expect(screen.queryByText('治理详情（管理员）')).not.toBeInTheDocument()

    authState.user = { id: 'admin-1', role: 'ADMIN' }
    // The API projection is controlled server-side; a fresh render represents
    // an administrator opening the same detail page.
    render(
      <MemoryRouter initialEntries={['/scale-library/who5/1.0.0']}>
        <Routes><Route path="/scale-library/:instrumentKey/:instrumentVersion" element={<ScaleLibrary />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('治理详情（管理员）')).toBeInTheDocument()
    expect(screen.getAllByText('WHO-5 Well-Being Index')).toHaveLength(2)
  })

  it('loads an English detail directly and keeps its English locale on remount', async () => {
    const english = entry({
      identity: {
        instrumentKey: 'sdq_teacher_zh_cn',
        instrumentVersion: '1.0.0',
        canonicalName: 'Strengths and Difficulties Questionnaire — Teacher T4–10',
        abbreviation: 'SDQ Teacher T4–10',
      },
      source: { citation: 'Goodman R. SDQ Teacher form T 4-10.' },
      localization: {
        sourceLocale: 'en',
        targetLocale: 'en',
        localizationVersion: '1.0.0',
        adaptationMethod: 'ORIGINAL_SOURCE',
        reviewStatus: 'APPROVED',
        expertReviewStatus: 'COMPLETED',
        cognitiveDebriefStatus: 'NOT_ESTABLISHED',
      },
      availability: {
        status: 'NOT_AVAILABLE',
        locale: 'en',
        territory: 'CN',
        respondent: 'TEACHER',
        reasons: ['量表包尚未发布，当前仅可浏览目录信息。'],
      },
    })
    mockDetail.mockResolvedValue({ code: 0, message: 'ok', data: { entry: english } })

    const renderDetail = () => render(
      <MemoryRouter initialEntries={['/scale-library/sdq_teacher_zh_cn/1.0.0']}>
        <Routes><Route path="/scale-library/:instrumentKey/:instrumentVersion" element={<ScaleLibrary />} /></Routes>
      </MemoryRouter>,
    )

    const first = renderDetail()
    expect(await screen.findByText('Strengths and Difficulties Questionnaire — Teacher T4–10')).toBeInTheDocument()
    expect(screen.getByText('当前内容：en；来源语言：en；版本 1.0.0。')).toBeInTheDocument()
    expect(screen.queryByText(/不提供 zh-CN 版本/)).not.toBeInTheDocument()
    expect(mockDetail).toHaveBeenLastCalledWith('sdq_teacher_zh_cn', '1.0.0', {
      locale: undefined,
      territory: undefined,
      respondent: undefined,
    })

    first.unmount()
    renderDetail()
    expect(await screen.findByText('当前内容：en；来源语言：en；版本 1.0.0。')).toBeInTheDocument()
    expect(screen.queryByText(/不提供 zh-CN 版本/)).not.toBeInTheDocument()
    expect(mockDetail).toHaveBeenCalledTimes(2)
  })
})
