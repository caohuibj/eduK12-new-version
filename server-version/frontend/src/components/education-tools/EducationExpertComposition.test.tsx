import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import {EducationCompositionRunPicker} from './EducationCompositionRunPicker'
import type {PrivateToolApi} from './privateToolClient'
vi.mock('./EducationPrivateVersionChooser',()=>({EducationPrivateVersionChooser:({onSelect}:{onSelect:(value:unknown)=>void})=><>
 <button onClick={()=>onSelect({id:'scale-version',toolId:'scale',kind:'SCALE',title:'固定量表',contentHash:'c'.repeat(64)})}>选量表</button>
 <button onClick={()=>onSelect({id:'form-version',toolId:'form',kind:'FORM',title:'固定表单',contentHash:'d'.repeat(64)})}>选表单</button>
 <button onClick={()=>onSelect({id:'expert-version',toolId:'composition',kind:'COMPOSITION',title:'固定专家问卷',contentHash:'e'.repeat(64),administration:{population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind:'PERSON'}})}>选专家问卷</button>
 </>}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('Explicit V2 expert authoring',()=>{
 it('saves a declared non-person Form source and blocks Scale/public sources instead of relabeling SELF or adding expert demographics',async()=>{
  const base='/organizations/org/private-tools',original={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',blocks:[]}
  const root={id:'root',kind:'COMPOSITION',title:'普通问卷',revision:1,contentHash:'a'.repeat(64),definition:original}
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===base+'?kind=COMPOSITION')return {list:[root],nextCursor:null}
   if(path===base+'/root')return method==='GET'?root:{...root,...body,revision:2}
   if(path===base+'/root/versions')return {list:[],nextCursor:null}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<EducationCompositionStudio api={api as PrivateToolApi} entry="TEACHER" organizationId="org" actorId="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 普通问卷'}))
  fireEvent.change(await screen.findByRole('combobox',{name:'问卷作答方式'}),{target:{value:'EXPERT_REPORT'}})
  fireEvent.change(screen.getByRole('combobox',{name:'专家观察目标类型'}),{target:{value:'TEAM'}})
  expect(screen.getByRole('button',{name:'获授权公共表单'})).toBeDisabled()
  expect(screen.getAllByRole('checkbox')).toHaveLength(5)
  for(const input of screen.getAllByRole('checkbox'))expect(input).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'选量表'}));expect(screen.getByRole('alert')).toHaveTextContent('非人员观察目标只支持表单')
  fireEvent.click(screen.getByRole('button',{name:'选表单'}));fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}))
  await waitFor(()=>expect(api.mock.calls.some(([,method])=>method==='PUT')).toBe(true))
  const body=api.mock.calls.find(([,method])=>method==='PUT')![2]
  expect(body.definition).toMatchObject({schemaVersion:2,adapterVersion:'2.0.0',administration:{population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind:'TEAM'},blocks:[{source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:'form-version',contentHash:'d'.repeat(64)}}]})
  expect(body.definition).not.toHaveProperty('contextFields');expect(original.administration.responseMode).toBe('SELF')
 })
 it('directs expert fixed versions to event invitation binding before any relational Run write',async()=>{
  const api=vi.fn(),refresh=vi.fn()
  render(<EducationCompositionRunPicker api={api} entry="TEACHER" organizationId="org" actorKey="actor" endpoint="/run/tracks" expectedVersion={1} disabled={false} onBusy={()=>{}} onRefresh={refresh}/>)
  const details=screen.getByText('选用本人普通问卷').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'))
  fireEvent.click(await screen.findByRole('button',{name:'选专家问卷'}))
  await screen.findByText(/专家观察问卷.*受邀任务/)
  expect(api).not.toHaveBeenCalled();expect(refresh).not.toHaveBeenCalled()
 })
})
