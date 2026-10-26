import {act,fireEvent,render,screen,within} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {StandardOnboardingEntry} from '../../api/surveyStandard'
import StandardOnboardingStatus from './StandardOnboardingStatus'

const api=vi.hoisted(()=>vi.fn())
vi.mock('../../api/surveyStandard',()=>({standardRequest:api}))
const entry=(over:Partial<StandardOnboardingEntry>={}):StandardOnboardingEntry=>({
 scaleId:null,instrumentKey:'pending',instrumentVersion:'1.0',name:'待审译本',measurementReleaseId:null,runtimePolicyHash:null,
 states:{imported:true,localizationReview:'RETURNED',expertReview:'PENDING',scientificMaturity:'PILOT',scientificQualified:true,deployed:false,published:false,visible:false,trainingEntry:'PENDING',surveyEntry:'RETURNED',trainingEntryPaused:false,surveyEntryPaused:false},
 stage:'已导入待部署',allowActivation:false,blockers:['LOCALIZATION_REVIEW_RETURNED','NEW_BLOCKER'],
 nextActions:[{code:'LOCALIZATION_REVIEW_RETURNED',stage:'译文治理审核',owner:'内容线',next:'按退回原因修订译文并递增版本，再次送审'}],...over,
})
beforeEach(()=>{vi.resetAllMocks();api.mockResolvedValue({list:[entry()]})})

describe('read-only per-version standard onboarding status',()=>{
 it('keeps lifecycle and product decisions separate, renders located actions and preserves unknown blockers',async()=>{
  render(<StandardOnboardingStatus/>)
  const row=await screen.findByRole('article',{name:'待审译本 · 1.0'})
  expect(api).toHaveBeenCalledExactlyOnceWith('/onboarding-status')
  for(const text of ['已导入可执行内容','已导入待部署','已退回','待审核','尚无有效部署','未发布','隐藏或未安装','待决定','已退回，禁止新增使用','按退回原因修订译文并递增版本，再次送审'])expect(within(row).getByText(text)).toBeInTheDocument()
  expect(within(row).getByText(/责任角色：内容线/)).toBeInTheDocument()
  expect(within(row).getByText('NEW_BLOCKER')).toBeInTheDocument()
  expect(within(row).queryByText('已上线')).not.toBeInTheDocument()
  expect(within(row).queryByRole('button')).not.toBeInTheDocument()
 })
 it('shows each exact version independently and treats a paused approval as stopped',async()=>{
  const published=entry({instrumentVersion:'2.0',stage:'已发布',blockers:[],nextActions:[]})
  published.states={...published.states,deployed:true,published:true,visible:true,trainingEntry:'APPROVED',trainingEntryPaused:true,surveyEntry:'APPROVED'}
  api.mockResolvedValue({list:[entry(),published]})
  render(<StandardOnboardingStatus/>)
  const row=await screen.findByRole('article',{name:'待审译本 · 2.0'})
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(within(row).getByText('已暂停新增使用')).toBeVisible()
  expect(within(row).getByText('准入已批准')).toBeVisible()
  fireEvent.change(screen.getByRole('searchbox',{name:'检索接入版本'}),{target:{value:' 2.0 '}})
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(api).toHaveBeenCalledTimes(1)
 })
 it('clears stale approvals after a failed refresh and supports an explicit retry',async()=>{
  render(<StandardOnboardingStatus/>);await screen.findByRole('article')
  api.mockRejectedValueOnce(new Error('无权读取接入状态'))
  fireEvent.click(screen.getByRole('button',{name:'刷新接入状态'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('无权读取接入状态')
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  api.mockResolvedValueOnce({list:[]})
  fireEvent.click(screen.getByRole('button',{name:'刷新接入状态'}))
  expect(await screen.findByText('尚无标准量表接入记录。')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(api.mock.calls.every(call=>call.length===1&&call[0]==='/onboarding-status')).toBe(true)
 })
 it('does not replace a remounted page with an earlier request response',async()=>{
  let resolve!:(value:{list:StandardOnboardingEntry[]})=>void
  api.mockImplementationOnce(()=>new Promise(res=>{resolve=res}))
  const old=render(<StandardOnboardingStatus/>);old.unmount()
  api.mockResolvedValueOnce({list:[]})
  render(<StandardOnboardingStatus/>);await screen.findByText('尚无标准量表接入记录。')
  await act(async()=>resolve({list:[entry()]}))
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
 })
})
