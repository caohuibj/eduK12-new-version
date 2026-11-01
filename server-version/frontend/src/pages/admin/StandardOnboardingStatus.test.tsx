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
 it('shows catalog gaps in the main area without inventing executable content',async()=>{
  const gap='待补经许可的精确中文12题、完整作答选项及缺失计分规则；当前仅有目录来源，不能启动施测。'
  const pending=entry({instrumentKey:'ctas12_zh_cn',instrumentVersion:'1.0.0',stage:'仅目录候选',blockers:[gap,'SCORING_MISSING_RULE_NOT_VERIFIED','EXISTING_PUBLIC_REDISTRIBUTION_HOLD','VERSIONED_SCORER_NOT_REGISTERED'],nextActions:[]})
  pending.states={...pending.states,imported:false}
  api.mockResolvedValue({list:[pending]})
  render(<StandardOnboardingStatus/>)
  const row=await screen.findByRole('article')
  expect(within(row).getByText(gap,{selector:'p'})).toBeVisible()
  expect(within(row).getByText(gap,{selector:'code'})).not.toBeVisible()
  expect(within(row).getByText(/计分或缺失作答规则尚未核实/)).toBeVisible()
  expect(within(row).getByText(/原许可记录保留公开再分发 HOLD/)).toBeVisible()
  expect(within(row).getByText(/所需版本的专用计分器尚未安装登记/)).toBeVisible()
  expect(within(row).getByText('仅目录资料，尚无可执行内容')).toBeVisible()
  expect(api.mock.calls.every(call=>call.length===1)).toBe(true)
 })
 it('routes pending intake to existing import or drafts using only exact display identity',async()=>{
  const open=vi.fn();render(<StandardOnboardingStatus onOpenWorkspace={open}/>)
  const row=await screen.findByRole('article')
  fireEvent.click(within(row).getByRole('button',{name:'补齐内容并导入'}))
  fireEvent.click(within(row).getByRole('button',{name:'查找已有草稿'}))
  const target={instrumentKey:'pending',instrumentVersion:'1.0',name:'待审译本'}
  expect(open.mock.calls).toEqual([[target,'import'],[target,'drafts']])
  expect(api).toHaveBeenCalledExactlyOnceWith('/onboarding-status?limit=25')
  expect(within(row).queryByRole('button',{name:/发布|安装/})).not.toBeInTheDocument()
 })
 it('keeps lifecycle and product decisions separate, renders located actions and preserves unknown blockers',async()=>{
  render(<StandardOnboardingStatus/>)
  const row=await screen.findByRole('article',{name:'待审译本 · 1.0'})
  expect(api).toHaveBeenCalledExactlyOnceWith('/onboarding-status?limit=25')
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
  api.mockResolvedValueOnce({list:[published],pageSize:25,hasMore:false,nextCursor:null})
  fireEvent.click(screen.getByRole('button',{name:'检索'}))
  await screen.findByText('第 1 页 · 本页 1 个精确版本。')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(api).toHaveBeenLastCalledWith('/onboarding-status?limit=25&query=2.0')
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
  expect(api.mock.calls.every(call=>call.length===1&&call[0]==='/onboarding-status?limit=25')).toBe(true)
 })
 it('navigates bounded server pages, retains the applied search, and clears pagination after failure',async()=>{
  api.mockResolvedValueOnce({list:[entry()],pageSize:25,hasMore:true,nextCursor:'page2'})
  render(<StandardOnboardingStatus/>);await screen.findByRole('article')
  api.mockResolvedValueOnce({list:[entry({instrumentVersion:'2.0'})],pageSize:25,hasMore:false,nextCursor:null})
  fireEvent.click(screen.getByRole('button',{name:'下一页'}));await screen.findByRole('article',{name:'待审译本 · 2.0'})
  expect(api).toHaveBeenLastCalledWith('/onboarding-status?limit=25&cursor=page2')
  expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
  api.mockResolvedValueOnce({list:[entry()],pageSize:25,hasMore:true,nextCursor:'page2'})
  fireEvent.click(screen.getByRole('button',{name:'上一页'}));await screen.findByRole('article',{name:'待审译本 · 1.0'})
  expect(api).toHaveBeenLastCalledWith('/onboarding-status?limit=25')
  api.mockRejectedValueOnce(new Error('Lost access'))
  fireEvent.click(screen.getByRole('button',{name:'刷新接入状态'}));await screen.findByRole('alert')
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'下一页'})).not.toBeInTheDocument()
 })
 it('lets a new search supersede a pending search without stale rows or cursors',async()=>{
  render(<StandardOnboardingStatus/>);await screen.findByRole('article')
  let resolve!:(value:unknown)=>void
  api.mockImplementationOnce(()=>new Promise(res=>{resolve=res}))
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'old'}})
  fireEvent.submit(screen.getByRole('button',{name:'检索'}).closest('form')!)
  api.mockResolvedValueOnce({list:[],pageSize:25,hasMore:false,nextCursor:null})
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'new'}})
  fireEvent.submit(screen.getByRole('button',{name:'检索'}).closest('form')!)
  await screen.findByText('没有符合检索条件的精确版本。')
  await act(async()=>resolve({list:[entry()],pageSize:25,hasMore:true,nextCursor:'stale'}))
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled()
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
