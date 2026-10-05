import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IndividualLongitudinalBuilder } from '../IndividualLongitudinalBuilder'
const api=vi.hoisted(()=>({individualSubjects:vi.fn(),individualSources:vi.fn(),listSpecs:vi.fn(),analyzeIndividual:vi.fn()}))
const delivery=vi.hoisted(()=>({createArtifactExport:vi.fn(),downloadExport:vi.fn()}))
vi.mock('../../../api/reporting',()=>({reportingApi:api}))
vi.mock('../../../api/delivery',()=>({deliveryApi:delivery}))
beforeEach(()=>{
  vi.resetAllMocks()
  api.individualSubjects.mockResolvedValue({list:[{userId:'a',name:'学生甲'},{userId:'b',name:'学生乙'}],nextPage:null})
  api.listSpecs.mockResolvedValue({list:[{specId:'spec',specKey:'个人方案',version:1}]})
  api.individualSources.mockResolvedValue({list:[1,2].map(i=>({runId:`r${i}`,trackId:`t${i}`,runName:`测量${i}`,publishedAt:`2026-0${i}-01`,resource:{family:'SCALE',key:'grit',version:'1'}})),nextPage:null})
  api.analyzeIndividual.mockResolvedValue({artifactId:'private',projection:{kind:'INDIVIDUAL_LONGITUDINAL',state:'present',waves:[{waveId:'w',waveKey:'T1',ordinal:1,metrics:{score:{state:'present',value:7}},evidence:{level:'PILOT',limitations:[]}}],comparisons:[]}})
})
it('generates one student report and clears it after export authority is revoked',async()=>{
  render(<MemoryRouter><IndividualLongitudinalBuilder organizationId="org" /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button',{name:'选择学生生成个人报告'}))
  await userEvent.selectOptions(await screen.findByLabelText('选择学生'),'a')
  await userEvent.selectOptions(await screen.findByLabelText('个人测量项目'),'SCALE/grit')
  for (const checkbox of screen.getAllByRole('checkbox')) await userEvent.click(checkbox)
  await userEvent.selectOptions(screen.getByLabelText('个人报告方案'),'spec')
  await userEvent.click(screen.getByRole('button',{name:'生成个人纵向报告'}))
  expect(await screen.findByLabelText('个人报告结果')).toBeInTheDocument()
  expect(api.analyzeIndividual).toHaveBeenCalledWith('org',{subjectUserId:'a',specId:'spec',sources:[{runId:'r1',trackId:'t1'},{runId:'r2',trackId:'t2'}]})
  delivery.createArtifactExport.mockRejectedValue(new Error('权限已撤销'))
  await userEvent.click(screen.getByRole('button',{name:'导出个人报告'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('权限已撤销')
  expect(screen.queryByLabelText('个人报告结果')).not.toBeInTheDocument()
  expect(delivery.downloadExport).not.toHaveBeenCalled()
})
it('clears earlier observations and selections when the subject changes',async()=>{
  render(<MemoryRouter><IndividualLongitudinalBuilder organizationId="org" /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button',{name:'选择学生生成个人报告'}))
  await userEvent.selectOptions(await screen.findByLabelText('选择学生'),'a')
  await userEvent.selectOptions(await screen.findByLabelText('个人测量项目'),'SCALE/grit')
  await userEvent.click(screen.getAllByRole('checkbox')[0])
  api.individualSources.mockResolvedValueOnce({list:[],nextPage:null})
  await userEvent.selectOptions(screen.getByLabelText('选择学生'),'b')
  await waitFor(()=>expect(screen.queryAllByRole('checkbox')).toHaveLength(0))
  expect(screen.getByRole('button',{name:'生成个人纵向报告'})).toBeDisabled()
})
