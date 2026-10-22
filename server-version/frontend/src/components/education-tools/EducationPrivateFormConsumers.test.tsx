import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SchoolActivityManager} from '../../school/SchoolActivityManager'
import {HuiteacherEvaluationStudio} from '../../huiteacher/HuiteacherEvaluationStudio'
import type {PrivateToolApi} from './privateToolClient'
const candidate={toolId:'tool',versionId:'fixed',title:'我的固定表单',sourceRevision:2,contentHash:'fixed-hash',compatibility:{compatible:true},createdAt:'2026-10-22'}
const activity={courseId:'activity',organizationId:'org',title:'私有工具活动',purpose:'SCHOOL_CLIMATE',status:'DRAFT',version:1,participantCount:0,runCount:1,runs:[{runId:'run',name:'私有批次',status:'DRAFT'}],capabilities:{canSubmit:true,canOpen:false,canPause:false,canResume:false,canClose:false,canPublishRun:false,ownPsychologyPublisher:true}}
const event={id:'event',targetId:'target',title:'教师活动',kind:'ASSESSMENT',status:'DRAFT',version:1}
afterEach(cleanup)
describe('private-form real consumer attachment contract',()=>{
 it.each(['PARENT_REPORT','TEACHER_REPORT'] as const)('School posts exact private %s binding only with capability and explicit administration',async mode=>{
  const base='/organizations/org/activities/activity'
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path.endsWith('pageSize=50'))return {list:[activity]}
   if(path===base)return activity
   if(path.endsWith('/eligible-classes'))return {list:[]}
   if(path===base+'/runs/run')return {run:{id:'run',name:'私有批次',status:'DRAFT',version:9}}
   if(path==='/organizations/org/private-tools/runtime-candidates?kind=FORM')return {list:[candidate],nextCursor:null}
   if(path===base+'/runs/run/tracks'&&method==='POST')return {}
   throw Error('Unexpected '+path)
  })
  const view=render(<SchoolActivityManager api={api as PrivateToolApi} organizationId="org" isAdmin={false} classes={[]} actorKey="author"/>)
  await screen.findByRole('option',{name:'私有工具活动（准备中）'})
  fireEvent.change(screen.getByLabelText('选择已有活动'),{target:{value:'activity'}})
  fireEvent.click(await screen.findByRole('button',{name:'私有批次 · 准备中'}));await screen.findByRole('button',{name:'查看已发布、受授权的测评资源'})
  expect(screen.queryByRole('button',{name:'读取我的固定表单'})).not.toBeInTheDocument()
  expect(api.mock.calls.some(([path])=>path.includes('/private-tools/'))).toBe(false)
  view.rerender(<SchoolActivityManager api={api as PrivateToolApi} organizationId="org" isAdmin={false} classes={[]} actorKey="author" canAuthorPrivateTools/>)
  fireEvent.click(await screen.findByRole('button',{name:'读取我的固定表单'}));await screen.findByRole('option',{name:/我的固定表单/})
  fireEvent.change(screen.getByLabelText('我的表单 · 固定版本'),{target:{value:'fixed'}})
  const add=screen.getByRole('button',{name:'加入我的固定表单'});expect(add).toBeDisabled()
  fireEvent.change(screen.getByLabelText('本次作答方式'),{target:{value:mode}})
  if(mode==='TEACHER_REPORT'){
   expect(add).toBeDisabled()
   const target=screen.getByLabelText('私有表单教师作答目标')
   expect(within(target).queryByRole('option',{name:'全部班级教师'})).not.toBeInTheDocument()
   fireEvent.change(target,{target:{value:'HOMEROOM_TEACHER'}})
  }
  fireEvent.click(add)
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/runs/run/tracks','POST',{
   expectedVersion:9,privateForm:{versionId:'fixed',contentHash:'fixed-hash',administration:{population:'STUDENT',responseMode:mode}},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:mode==='PARENT_REPORT'?'RELATED_PARENT':'ALL_CURRENT'},...(mode==='TEACHER_REPORT'?{targetPolicy:{mode:'HOMEROOM_TEACHER'}}:{})
  }))
 })
 it('Teacher exposes only SELF and posts its event track path without public-resource policy fields',async()=>{
  const base='/organizations/org/evaluation-events/event'
  let runReads=0
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path.endsWith('/evaluation-targets')||path.endsWith('/forms'))return {list:[]}
   if(path.endsWith('/evaluation-events'))return {list:[event]}
   if(path===base+'/run'){runReads++;if(runReads===2||runReads===3)throw Error('任务配置读取失败');return {eventId:'event',runId:'run',status:'DRAFT',version:5,trackCount:runReads>3?1:0}}
   if(path==='/organizations/org/private-tools/runtime-candidates?kind=FORM')return {list:[candidate],nextCursor:null}
   if(path===base+'/run/tracks'&&method==='POST')return {}
   throw Error('Unexpected '+path)
  })
  const view=render(<HuiteacherEvaluationStudio api={api as PrivateToolApi} organizationId="org" actorKey="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'查看任务配置'}));await screen.findByRole('button',{name:'查询本校授权的教师自评 Scale'})
  expect(screen.queryByRole('button',{name:'读取我的固定表单'})).not.toBeInTheDocument()
  expect(api.mock.calls.some(([path])=>path.includes('/private-tools/'))).toBe(false)
  view.rerender(<HuiteacherEvaluationStudio api={api as PrivateToolApi} organizationId="org" actorKey="author" canAuthorPrivateTools/>)
  fireEvent.click(await screen.findByRole('button',{name:'读取我的固定表单'}));await screen.findByRole('option',{name:/我的固定表单/})
  fireEvent.change(screen.getByLabelText('我的表单 · 固定版本'),{target:{value:'fixed'}})
  const mode=screen.getByLabelText('本次作答方式')
  expect(within(mode).getAllByRole('option').map(option=>(option as HTMLOptionElement).value)).toEqual(['','SELF'])
  expect(screen.getByRole('button',{name:'加入我的固定表单'})).toBeDisabled()
  fireEvent.change(mode,{target:{value:'SELF'}});fireEvent.click(screen.getByRole('button',{name:'加入我的固定表单'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/run/tracks','POST',{
   expectedVersion:5,privateForm:{versionId:'fixed',contentHash:'fixed-hash',administration:{population:'TEACHER',responseMode:'SELF'}},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}
  }))
  await screen.findByText(/已添加，但任务配置刷新失败/)
  expect(screen.getByLabelText('我的表单 · 固定版本')).toHaveValue('')
  expect(screen.getByLabelText('我的表单 · 固定版本')).toBeDisabled()
  expect(screen.getByRole('button',{name:'加入我的固定表单'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'重新读取任务配置（不会重复添加）'}))
  await screen.findByText('任务配置读取失败')
  expect(screen.getByLabelText('我的表单 · 固定版本')).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'重新读取任务配置（不会重复添加）'}))
  await screen.findByText('已重新读取配置，请先核对是否已加入；确需添加时重新选择。')
  expect(screen.getByLabelText('我的表单 · 固定版本')).toBeEnabled()
  expect(screen.getByLabelText('我的表单 · 固定版本')).toHaveValue('')
  expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 })
})
