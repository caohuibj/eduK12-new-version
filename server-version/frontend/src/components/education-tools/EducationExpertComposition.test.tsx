import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
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
 it('selects an authorized exact public Form by expert target, disables an undeclared source, and previews the same frozen scenario',async()=>{
  const base='/organizations/org/private-tools',hash='f'.repeat(64),root={id:'root',kind:'COMPOSITION',title:'公共专家问卷',revision:1,contentHash:'a'.repeat(64),definition:{schemaVersion:2,adapterVersion:'2.0.0',administration:{population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind:'TEAM'},instruction:'',blocks:[] as unknown[]}}
  const source={catalogKey:'expert-form',sourceId:'public-form',kind:'FORM',sourceProvider:'FORM',contentHash:hash,title:'明确团队观察表单',versions:{content:'expert-v2',parameters:null,report:null},language:'zh-CN',allowedActions:['REFERENCE_FIXED_VERSION'],canEditOriginal:false,canDistribute:false}
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===base+'?kind=COMPOSITION')return {list:[root],nextCursor:null}
   if(path===base+'/root/versions')return {list:[],nextCursor:null}
   if(path===base+'/root')return method==='GET'?root:{...root,...body,revision:2,references:[{...source,id:source.sourceId,sourceProvider:'PUBLIC_FORM'}]}
   if(path.startsWith(base+'/public-sources?'))return {list:[{...source,catalogKey:'old-self',sourceId:'old',title:'未声明专家方式',allowedActions:[],unavailableReason:'此版本未声明本次专家目标'},source],nextCursor:null}
   if(path===base+'/public-sources/form/public-form?contentHash='+hash+'&responseMode=EXPERT_REPORT&targetKind=TEAM')return {id:source.sourceId,kind:'FORM',title:source.title,contentHash:hash,definition:{schemaVersion:2,pages:[{pageKey:'p',title:'团队',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'原版团队观察题',required:false,options:[],rows:[]}]}]}}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<EducationCompositionStudio api={api as PrivateToolApi} entry="TEACHER" organizationId="org" actorId="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 公共专家问卷'}));fireEvent.click(await screen.findByRole('button',{name:'获授权公共表单'}))
  const old=(await screen.findByText('未声明专家方式')).closest('article')!,allowed=screen.getByText(source.title).closest('article')!
  expect(within(old).getByRole('button',{name:'加入公共表单'})).toBeDisabled()
  expect(api.mock.calls.some(([path])=>path.includes('responseMode=EXPERT_REPORT')&&path.includes('targetKind=TEAM'))).toBe(true)
  fireEvent.click(within(allowed).getByRole('button',{name:'加入公共表单'}));fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}))
  await screen.findByText('问卷草稿已保存。')
  const body=api.mock.calls.find(([,method])=>method==='PUT')![2]
  expect(body.definition.blocks[0].source).toEqual({provider:'PUBLIC_FORM',kind:'FORM',versionId:'public-form',contentHash:hash})
  fireEvent.click(screen.getByRole('button',{name:'预览问卷'}));await screen.findByText('原版团队观察题')
  expect(api.mock.calls.some(([path])=>path.endsWith('&responseMode=EXPERT_REPORT&targetKind=TEAM'))).toBe(true)
  expect(api.mock.calls.every(([path])=>!path.includes('/grants')&&!path.includes('/prepare'))).toBe(true)
 })
 it('saves a declared non-person Form source and blocks Scale without relabeling SELF or adding expert demographics',async()=>{
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
  expect(screen.getByRole('button',{name:'获授权公共表单'})).toBeEnabled()
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
