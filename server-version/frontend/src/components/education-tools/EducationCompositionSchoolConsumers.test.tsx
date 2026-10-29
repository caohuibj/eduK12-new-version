import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {SchoolActivityManager} from '../../school/SchoolActivityManager'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import type {PrivateToolApi} from './privateToolClient'
const activity={courseId:'activity',organizationId:'org',title:'心理教师本人活动',purpose:'STUDENT_WELLBEING',status:'DRAFT',version:1,participantCount:0,runCount:1,
 runs:[{runId:'run',name:'本人批次',status:'DRAFT'}],capabilities:{canSubmit:true,canOpen:false,canPause:false,canResume:false,canClose:false,canPublishRun:false,ownPsychologyPublisher:true}}
describe('School composition product consumers / synthetic HTTP contracts',()=>{
 it('exposes the shared School editor through its parent authoring studio',async()=>{
  const api=vi.fn(async(path:string)=>{if(path==='/organizations/org/private-tools'||path==='/organizations/org/private-tools?kind=COMPOSITION')return {list:[],nextCursor:null};throw Error('Unexpected '+path)})
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="org" actorId="author" entry="SCHOOL"/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'普通问卷'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'普通问卷'}))
  expect(await screen.findByText(/将本人固定量表和表单、获授权公共量表与表单编成一份学生自评问卷/)).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith('/organizations/org/private-tools?kind=COMPOSITION')
 })
 it('attaches one fixed questionnaire from the actual activity consumer and displays the source revision',async()=>{
  const base='/organizations/org/activities/activity',root='00000000-0000-4000-8000-000000000001',fixed='00000000-0000-4000-8000-000000000002',hash='a'.repeat(64)
  let added=false
  const api=vi.fn(async(path:string,method='GET',body?:unknown)=>{
   if(path.endsWith('pageSize=50'))return {list:[activity]}
   if(path===base)return activity
   if(path.endsWith('/eligible-classes'))return {list:[]}
   if(path===base+'/runs/run')return {run:{id:'run',name:'本人批次',status:'DRAFT',version:added?10:9},tracks:added?[{id:'track',resourceFamily:'BUNDLE',resourceKey:`education-composition:SCHOOL:${fixed}:STUDENT:SELF:1.0.0`,resourceVersion:'1.0.0',title:'固定学生问卷',sourceRevision:4}]:[]}
   if(path==='/organizations/org/private-tools?kind=COMPOSITION')return {list:[{id:root,kind:'COMPOSITION',title:'草稿学生问卷',revision:12}],nextCursor:null}
   if(path===`/organizations/org/private-tools/${root}/versions`)return {list:[{id:fixed,title:'固定学生问卷',sourceRevision:4,contentHash:hash}],nextCursor:null}
   if(path===base+'/runs/run/tracks'&&method==='POST'){added=true;return {id:'track'}}
   throw Error('Unexpected '+method+' '+path+' '+JSON.stringify(body))
  })
  const view=render(<SchoolActivityManager api={api as PrivateToolApi} organizationId="org" isAdmin classes={[]} actorKey="author"/>)
  fireEvent.change(await screen.findByLabelText('选择已有活动'),{target:{value:'activity'}})
  fireEvent.click(await screen.findByRole('button',{name:'本人批次 · 准备中'}))
  await screen.findByRole('button',{name:'查看已发布、受授权的测评资源'})
  expect(screen.queryByText('选用本人普通问卷')).not.toBeInTheDocument()
  expect(api.mock.calls.some(([path])=>path.includes('/private-tools'))).toBe(false)
  view.rerender(<SchoolActivityManager api={api as PrivateToolApi} organizationId="org" isAdmin={false} classes={[]} actorKey="author" canAuthorPrivateTools/>)
  const details=(await screen.findByText('选用本人普通问卷')).closest('details')!;details.open=true;fireEvent(details,new Event('toggle'))
  fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 草稿学生问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'选择本版本 · 修订 4'}));fireEvent.click(screen.getByRole('button',{name:'加入测评批次'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/runs/run/tracks','POST',{expectedVersion:9,privateComposition:{versionId:fixed,contentHash:hash},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}}))
  await screen.findByText('固定学生问卷')
  expect(screen.getByText(/固定版本：修订 4/)).toBeInTheDocument()
 })
 it('does not render a late Teacher draft after the entry changes on the same transport',async()=>{
  let resolve!:(value:unknown)=>void
  const pending=new Promise(yes=>{resolve=yes});let reads=0
  const api=vi.fn(async(path:string)=>{
   if(path==='/organizations/org/private-tools?kind=COMPOSITION')return {list:++reads===1?[{id:'old',kind:'COMPOSITION',title:'原Teacher问卷',revision:1}]:[],nextCursor:null}
   if(path==='/organizations/org/private-tools/old')return pending
   throw Error('Unexpected '+path)
  })
  const view=render(<EducationCompositionStudio entry="TEACHER" api={api as PrivateToolApi} organizationId="org" actorId="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 原Teacher问卷'}))
  view.rerender(<EducationCompositionStudio entry="SCHOOL" api={api as PrivateToolApi} organizationId="org" actorId="author"/>)
  await act(async()=>{resolve({id:'old',kind:'COMPOSITION',title:'迟到的Teacher正文',revision:1,definition:{schemaVersion:1,administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',blocks:[]}});await pending})
  expect(screen.getByLabelText('问卷名称')).toHaveValue('')
  expect(screen.queryByDisplayValue('迟到的Teacher正文')).not.toBeInTheDocument()
 })
})
