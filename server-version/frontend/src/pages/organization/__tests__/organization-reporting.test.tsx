import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrganizationReportingPage, { ProjectionPanel } from '../OrganizationReportingPage'
const api = vi.hoisted(() => ({ listSpecs: vi.fn(), listSources: vi.fn(), listProtectedSources: vi.fn(), listSeries: vi.fn(), cohortOptions: vi.fn(), analyzeAutomatic: vi.fn(), analyzeGroup: vi.fn(), readArtifact: vi.fn() }))
const org = vi.hoisted(() => ({ active: { organization: { id: 'o1' }, access: { canGovern: false } }, activeLoading: false, selectOrganization: vi.fn() }))
vi.mock('../../../api/reporting', () => ({ reportingApi: api }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => org }))
beforeEach(() => { vi.clearAllMocks(); api.cohortOptions.mockResolvedValue({ classes: [], dimensions: [], labels: [] }); for (const method of [api.listSpecs, api.listSources, api.listProtectedSources, api.listSeries]) method.mockResolvedValue({ list: [] }) })
it('lazy loads advanced discovery only after the advanced section opens', async () => {
  render(<MemoryRouter initialEntries={['/organizations/o1/reporting']}><Routes><Route path="/organizations/:organizationId/reporting" element={<OrganizationReportingPage />} /></Routes></MemoryRouter>)
  await waitFor(() => expect(api.cohortOptions).toHaveBeenCalledWith('o1'))
  expect(api.listSeries).not.toHaveBeenCalled()
  expect(api.listProtectedSources).not.toHaveBeenCalled()

  await userEvent.click(screen.getByText('高级设置：历史报告系列与时间点'))
  await waitFor(() => expect(api.listSeries).toHaveBeenCalledTimes(1))
  expect(api.listProtectedSources).not.toHaveBeenCalled()

  await userEvent.click(screen.getByText('高级设置：受保护反馈与历史报告读取'))
  await waitFor(() => expect(api.listProtectedSources).toHaveBeenCalledTimes(1))
})

it('removes an existing artifact when exact read permission is revoked', async () => {
  api.readArtifact.mockResolvedValueOnce({ artifactId: 'private-artifact', generatedAt: '2026-09-19T00:00:00Z', projection: { kind: 'GROUP', state: 'present', eligibleN: 12, resultContributorN: 12, metrics: {} } })
  render(<MemoryRouter initialEntries={['/organizations/o1/reporting']}><Routes><Route path="/organizations/:organizationId/reporting" element={<OrganizationReportingPage />} /></Routes></MemoryRouter>)
  await userEvent.click(await screen.findByText('高级设置：受保护反馈与历史报告读取'))
  expect(screen.getByPlaceholderText('artifact UUID')).toBeVisible()
  await userEvent.type(screen.getByPlaceholderText('artifact UUID'), 'private-artifact')
  await userEvent.click(screen.getByRole('button', { name: '读取历史报告' }))
  await userEvent.click(await screen.findByText('报告记录编号'))
  expect(screen.getByText('Artifact private-artifact')).toBeVisible()
  api.readArtifact.mockRejectedValueOnce(new Error('read revoked'))
  await userEvent.click(screen.getByRole('button', { name: '读取历史报告' }))
  await waitFor(() => expect(screen.queryByText('Artifact private-artifact')).not.toBeInTheDocument())
  expect(await screen.findByText('read revoked')).toBeInTheDocument()
})

it('uses the same label selection for group and automatic longitudinal reports', async () => {
  api.cohortOptions.mockResolvedValue({ classes: [], dimensions: [{ id: 'sex', key: 'sex', name: '性别' }], labels: [{ id: 'male', dimensionId: 'sex', name: '男生' }] })
  api.listSpecs.mockResolvedValue({ list: [
    { specId: 'group', analysisKind: 'GROUP', specKey: '群体方案', version: 1 },
    { specId: 'repeated', analysisKind: 'REPEATED_COHORT', specKey: '纵向方案', version: 1 },
  ] })
  api.listSources.mockResolvedValue({ list: [1, 2].map(n => ({ runId: `run${n}`, trackId: `track${n}`, runName: `测量${n}`, publishedAt: `2026-0${n}-01T00:00:00Z`, resource: { family: 'SCALE', key: 'grit', version: '1' } })) })
  const result = { artifactId: 'new', generatedAt: '2026-09-19T00:00:00Z', projection: { kind: 'GROUP', state: 'suppressed', metrics: {} } }
  api.analyzeGroup.mockResolvedValue(result)
  api.analyzeAutomatic.mockResolvedValue(result)
  render(<MemoryRouter initialEntries={['/organizations/o1/reporting']}><Routes><Route path="/organizations/:organizationId/reporting" element={<OrganizationReportingPage />} /></Routes></MemoryRouter>)
  await userEvent.click(await screen.findByLabelText('男生'))
  await userEvent.click(screen.getByRole('button', { name: '生成单次群体报告' }))
  const selector = { schemaVersion: 2, combine: 'ALL', clauses: [{ kind: 'LABELS', labelIds: ['male'], match: 'ANY' }] }
  expect(api.analyzeGroup).toHaveBeenCalledWith('o1', expect.objectContaining({ cohortSelector: selector }))
  await screen.findByText('报告结果')
  await userEvent.click(screen.getByLabelText('男生'))
  expect(screen.queryByText('报告结果')).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('男生'))
  await userEvent.selectOptions(screen.getByLabelText('选择测量项目'), 'SCALE/grit')
  const checkboxes = screen.getAllByRole('checkbox').filter(el => el.parentElement?.textContent?.includes('测量'))
  for (const checkbox of checkboxes) await userEvent.click(checkbox)
  await userEvent.selectOptions(screen.getByLabelText('人群定义'), 'BASELINE_FIXED')
  await userEvent.click(screen.getByRole('button', { name: '生成群体纵向报告' }))
  expect(api.analyzeAutomatic).toHaveBeenCalledWith('o1', expect.objectContaining({ cohortSelector: selector, cohortStrategy: 'BASELINE_FIXED', sources: [{ runId: 'run1', trackId: 'track1' }, { runId: 'run2', trackId: 'track2' }] }))
})

it('locks conditions during generation and drops a late result after authority changes', async () => {
  api.listSpecs.mockResolvedValue({list:[{specId:'group',analysisKind:'GROUP',specKey:'群体',version:1}]})
  api.listSources.mockResolvedValue({list:[{runId:'r',trackId:'t',runName:'测量',resource:{family:'SCALE',key:'grit',version:'1'}}]})
  let finish!: (value: unknown) => void
  api.analyzeGroup.mockReturnValue(new Promise(resolve => { finish=resolve }))
  const tree=()=> <MemoryRouter initialEntries={['/organizations/o1/reporting']}><Routes><Route path="/organizations/:organizationId/reporting" element={<OrganizationReportingPage />} /></Routes></MemoryRouter>
  const view=render(tree())
  await userEvent.click(await screen.findByRole('button',{name:'生成单次群体报告'}))
  expect(screen.getByRole('button',{name:'重置为全部受测者'})).toBeDisabled()
  org.active={organization:{id:'o1'},access:{canGovern:true}}
  view.rerender(tree())
  finish({artifactId:'old-context',projection:{kind:'GROUP',state:'present',metrics:{}}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'生成单次群体报告'})).not.toBeDisabled())
  expect(screen.queryByText('报告结果')).not.toBeInTheDocument()
  org.active={organization:{id:'o1'},access:{canGovern:false}}
})

it('renders repeated comparisons with measurement dates instead of internal IDs', () => {
 const decision={schemaVersion:1 as const,metricId:'score',level:'NOT_COMPARABLE',allowedOperations:['SIDE_BY_SIDE'],evidenceRef:null,evidenceHash:null,limitations:[]}
 render(<ProjectionPanel artifact={{artifactId:'report',generatedAt:'2026-09-26',projection:{schemaVersion:1,kind:'REPEATED_COHORT',state:'present',limitations:[],waves:[1,2].map(i=>({waveId:`private-wave-${i}`,waveKey:`2026-0${i}-01T00:00:00Z / T${i}`,ordinal:i,state:'present',metrics:{},evidence:{level:'PILOT',limitations:[]}})),comparisons:[{fromWaveId:'private-wave-1',toWaveId:'private-wave-2',metrics:{score:decision}}]}}} />)
 expect(screen.getByText('时间点可比性')).toBeInTheDocument()
 expect(screen.getByText(/不可直接比较 · 并列展示/)).toBeInTheDocument()
 expect(screen.queryByText(/private-wave/)).not.toBeInTheDocument()
 expect(screen.getByText(/第 1 次测量.*→.*第 2 次测量/)).toBeInTheDocument()
})

it('renders matched comparisons without exposing wave IDs', () => {
 const decision={schemaVersion:1 as const,metricId:'score',level:'EXACT',allowedOperations:['SIDE_BY_SIDE','DESCRIPTIVE_TREND','NUMERIC_DELTA'],evidenceRef:null,evidenceHash:null,limitations:[]}
 render(<ProjectionPanel artifact={{artifactId:'report',generatedAt:'2026-09-26',projection:{schemaVersion:1,kind:'MATCHED_LONGITUDINAL',state:'present',mode:'FULL_CASE',waveIds:['secret-1','secret-2'],matchedEligibleN:10,evidence:{level:'PILOT',limitations:[]},metrics:{score:{state:'present',validCaseN:10,waveMeans:[{waveId:'secret-1',waveKey:'2026-01-01T00:00:00Z / T1',mean:3},{waveId:'secret-2',waveKey:'2026-02-01T00:00:00Z / T2',mean:4}],comparisons:[{fromWaveId:'secret-1',toWaveId:'secret-2',comparability:decision,delta:1}]}}}}} />)
 expect(screen.queryByText(/secret-/)).not.toBeInTheDocument()
 expect(screen.getByText(/完全可比 · 变化量 1/)).toBeInTheDocument()
})


it('renders matched longitudinal chart from server projection without exposing internal IDs', () => {
 const decision={schemaVersion:1 as const,metricId:'score',level:'EXACT',allowedOperations:['SIDE_BY_SIDE','DESCRIPTIVE_TREND','NUMERIC_DELTA'],evidenceRef:null,evidenceHash:null,limitations:[]}
 render(<ProjectionPanel artifact={{artifactId:'chart',generatedAt:'2026-09-26',projection:{schemaVersion:1,kind:'MATCHED_LONGITUDINAL',state:'present',mode:'FULL_CASE',waveIds:['hidden-a','hidden-b'],matchedEligibleN:12,evidence:{level:'PILOT',limitations:[]},metrics:{score:{state:'present',validCaseN:12,waveMeans:[{waveId:'hidden-a',waveKey:'2026-01-01T00:00:00Z / T1',mean:3},{waveId:'hidden-b',waveKey:'2026-02-01T00:00:00Z / T2',mean:4}],comparisons:[{fromWaveId:'hidden-a',toWaveId:'hidden-b',comparability:decision,delta:1}]}}}}} />)
 expect(screen.getByText('纵向趋势')).toBeInTheDocument()
 expect(screen.getByText('允许描述趋势')).toBeInTheDocument()
 expect(screen.getByLabelText('服务端变化量')).toHaveTextContent('Δ 1')
 expect(screen.queryByText(/hidden-/)).not.toBeInTheDocument()
})

it('keeps not-comparable matched points disconnected and hides an unpermitted delta', () => {
 const decision={schemaVersion:1 as const,metricId:'score',level:'NOT_COMPARABLE',allowedOperations:['SIDE_BY_SIDE'],evidenceRef:null,evidenceHash:null,limitations:[]}
 render(<ProjectionPanel artifact={{artifactId:'chart',generatedAt:'2026-09-26',projection:{schemaVersion:1,kind:'MATCHED_LONGITUDINAL',state:'present',mode:'PAIRWISE',waveIds:['a','b'],evidence:{level:'PILOT',limitations:[]},metrics:{score:{state:'present',waveMeans:[{waveId:'a',waveKey:'2026-01-01T00:00:00Z / T1',mean:3},{waveId:'b',waveKey:'2026-02-01T00:00:00Z / T2',mean:9}],comparisons:[{fromWaveId:'a',toWaveId:'b',comparability:decision,delta:99}]}}}}} />)
 expect(screen.getByText('存在不可直接比较区段')).toBeInTheDocument()
 expect(screen.queryByText(/Δ 99/)).not.toBeInTheDocument()
 expect(screen.queryByText(/变化量 99/)).not.toBeInTheDocument()
})

it('does not surface malformed values attached to a suppressed matched metric', () => {
 const projection:any={schemaVersion:1,kind:'MATCHED_LONGITUDINAL',state:'present',mode:'FULL_CASE',waveIds:['a','b'],evidence:{level:'PILOT',limitations:[]},metrics:{score:{state:'suppressed',waveMeans:[{waveId:'a',waveKey:'A',mean:99},{waveId:'b',waveKey:'B',mean:100}]}}}
 render(<ProjectionPanel artifact={{artifactId:'suppressed',generatedAt:'2026-09-26',projection}} />)
 expect(screen.getByText(/图表不包含被抑制的统计值/)).toBeInTheDocument()
 expect(screen.queryByText(/^99$/)).not.toBeInTheDocument()
 expect(screen.queryByText(/^100$/)).not.toBeInTheDocument()
})


it('uses reader-facing labels instead of reporting engine enums', () => {
 const decision={schemaVersion:1 as const,metricId:'score',level:'EXACT',allowedOperations:['SIDE_BY_SIDE','DESCRIPTIVE_TREND','NUMERIC_DELTA'],evidenceRef:null,evidenceHash:null,limitations:['DESCRIPTIVE_ONLY']}
 render(<ProjectionPanel artifact={{artifactId:'reader-labels',generatedAt:'2026-09-26',projection:{schemaVersion:1,kind:'MATCHED_LONGITUDINAL',state:'present',mode:'FULL_CASE',waveIds:['w1','w2'],matchedEligibleN:8,evidence:{level:'PILOT',limitations:['DESCRIPTIVE_ONLY']},metrics:{score:{state:'present',countKind:'PAIRED_VALID',validCaseN:8,waveMeans:[{waveId:'w1',waveKey:'2026-01-01T00:00:00Z / T1',mean:3},{waveId:'w2',waveKey:'2026-02-01T00:00:00Z / T2',mean:4}],comparisons:[{fromWaveId:'w1',toWaveId:'w2',comparability:decision,delta:1}]}}}}} />)
 expect(screen.getByText('全部时间点均有测量')).toBeInTheDocument()
 expect(screen.getByText(/有效配对 · 有效人数 8/)).toBeInTheDocument()
 expect(screen.getByText(/证据与解释边界 · 试行证据/)).toBeInTheDocument()
 expect(screen.queryByText(/FULL_CASE|PAIRWISE|Server projection|PILOT/)).not.toBeInTheDocument()
})

it('renders suppressed metrics without leaking malformed values or engine state labels', () => {
 const projection:any={schemaVersion:1,kind:'GROUP',state:'present',eligibleN:6,resultContributorN:5,metrics:{sensitive:{state:'suppressed',aggregations:{mean:99,median:98}}},evidence:{level:'PILOT',limitations:[]}}
 render(<ProjectionPanel artifact={{artifactId:'suppressed-reader',generatedAt:'2026-09-26',projection}} />)
 expect(screen.getByText('隐私保护')).toBeInTheDocument()
 expect(screen.getByText(/当前人数或隐私阈值未满足/)).toBeInTheDocument()
 expect(screen.queryByText(/^99$/)).not.toBeInTheDocument()
 expect(screen.queryByText(/^98$/)).not.toBeInTheDocument()
 expect(screen.queryByText(/SUPPRESSED/)).not.toBeInTheDocument()
})

it('renders protected feedback as reader-facing protected content', () => {
 const projection:any={schemaVersion:1,kind:'PROTECTED_FEEDBACK',state:'present',limitations:['DESCRIPTIVE_ONLY'],metrics:{support:{state:'present',aggregations:{mean:4.2}}}}
 render(<ProjectionPanel artifact={{artifactId:'protected-reader',generatedAt:'2026-09-26',projection,evidence:{level:'PILOT',limitations:['DESCRIPTIVE_ONLY']}} as any} />)
 expect(screen.getByText('受保护反馈')).toBeInTheDocument()
 expect(screen.getByText(/不展示被反馈者身份或参与人数/)).toBeInTheDocument()
 expect(screen.getByText('均值')).toBeInTheDocument()
 expect(screen.queryByText(/Protected feedback/)).not.toBeInTheDocument()
})
