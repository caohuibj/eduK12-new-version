import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import {EducationCompositionRunPicker} from './EducationCompositionRunPicker'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateToolApi} from './privateToolClient'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=(n:string)=>n.repeat(64)
const org=id(1),base=`/organizations/${org}/private-tools`,scaleId=id(3),formId=id(4),scaleVersion=id(5),formVersion=id(6),rootId=id(7),rootVersion=id(8)
const scaleSummary={id:scaleId,kind:'SCALE',title:'最新量表草稿',revision:90,contentHash:hash('a')},formSummary={id:formId,kind:'FORM',title:'表单草稿',revision:80,contentHash:hash('b')}
const scaleRef={id:scaleVersion,toolId:scaleId,kind:'SCALE',title:'固定量表三',sourceRevision:3,contentHash:hash('c')}
const formRef={id:formVersion,toolId:formId,kind:'FORM',title:'固定表单二',sourceRevision:2,contentHash:hash('d')}
const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',blocks:[] as any[]}

describe('Teacher ordinary questionnaire authoring and fixed task attachment',()=>{
 it('chooses explicit immutable versions, saves/reopens real order and lazily previews only the current source',async()=>{
  let root={id:rootId,kind:'COMPOSITION',title:'教师普通问卷',revision:1,contentHash:hash('e'),definition:structuredClone(definition)}
  let fixed=false,created=false
  const scale=emptyDefinition();scale.items=[{itemCode:'q',sortOrder:0,content:'固定量表题目',type:'single',required:true,responseSetKey:'default',randomizeOptions:false}]
  const form={schemaVersion:2,pages:[{pageKey:'p',title:'固定表单页',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'固定表单题目',required:true,options:[],rows:[]}]}]}
  const api=vi.fn(async(path:string,method='GET',data?:any)=>{
   if(path===base+'?kind=COMPOSITION')return {list:created?[{...root,definition:undefined}]:[],nextCursor:null}
   if(path===base&&method==='GET')return {list:[scaleSummary,formSummary],nextCursor:null}
   if(path===base&&method==='POST'){created=true;expect(data).toEqual({kind:'COMPOSITION',title:'教师普通问卷'});return structuredClone(root)}
   if(path===base+'/'+scaleId+'/versions')return {list:[scaleRef],nextCursor:null}
   if(path===base+'/'+formId+'/versions')return {list:[formRef],nextCursor:null}
   if(path===base+'/'+scaleId+'/versions/'+scaleVersion)return {...scaleRef,definition:scale}
   if(path===base+'/'+formId+'/versions/'+formVersion)return {...formRef,definition:form}
   if(path===base+'/'+rootId&&method==='PUT'){expect(data.expectedRevision).toBe(1);root={...root,title:data.title,definition:data.definition,revision:2,contentHash:hash('f')};return structuredClone(root)}
   if(path===base+'/'+rootId&&method==='GET')return {...structuredClone(root),references:[scaleRef,formRef]}
   if(path===base+'/'+rootId+'/versions')return {list:fixed?[{id:rootVersion,title:root.title,sourceRevision:2,contentHash:root.contentHash}]:[],nextCursor:null}
   if(path===base+'/'+rootId+'/freeze'){expect(data).toEqual({expectedRevision:2,expectedContentHash:hash('f')});fixed=true;return {id:rootVersion,title:root.title,sourceRevision:2,contentHash:root.contentHash}}
   throw new Error('Unexpected API '+method+' '+path)
  })
  render(<EducationCompositionStudio api={api as PrivateToolApi} organizationId={org} actorId={id(2)}/>)
  fireEvent.change(screen.getByLabelText('问卷名称'),{target:{value:'教师普通问卷'}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'新建普通问卷'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'新建普通问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 最新量表草稿'}))
  fireEvent.click(await screen.findByRole('button',{name:'加入问卷 · 修订 3'}))
  fireEvent.click(screen.getByRole('button',{name:'选择固定版本 · 表单草稿'}))
  fireEvent.click(await screen.findByRole('button',{name:'加入问卷 · 修订 2'}))
  fireEvent.click(screen.getByRole('button',{name:'上移工具 2'}))
  expect(within(screen.getByRole('complementary',{name:'作答顺序'})).getAllByRole('listitem')[0]).toHaveTextContent('固定表单二')
  expect(api.mock.calls.some(([path])=>/\/versions\/[0-9a-f-]+$/.test(path))).toBe(false)
  expect(screen.getByRole('button',{name:'预览问卷'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('问卷说明'),{target:{value:'固定问卷说明'}})
  fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}))
  await screen.findByText('问卷草稿已保存。')
  expect(root.definition.blocks.map(block=>block.source)).toEqual([
   {provider:'PRIVATE_VERSION',kind:'FORM',versionId:formVersion,contentHash:hash('d')},
   {provider:'PRIVATE_VERSION',kind:'SCALE',versionId:scaleVersion,contentHash:hash('c')},
  ])
  expect(new Set(root.definition.blocks.map(block=>block.blockId)).size).toBe(2)
  fireEvent.click(screen.getByRole('button',{name:'固定问卷版本'}));await screen.findByText(/问卷版本已固定/)
  fireEvent.click(screen.getByRole('button',{name:'返回普通问卷列表'}))
  fireEvent.click(await screen.findByRole('button',{name:'编辑 教师普通问卷'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'预览问卷'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'预览问卷'}))
  const preview=await screen.findByRole('region',{name:'问卷内容预览'})
  await within(preview).findByText('固定表单题目（必答）')
  fireEvent.change(within(preview).getByRole('textbox'),{target:{value:'仅在本页试填'}})
  expect(api.mock.calls.filter(([path])=>/\/versions\/[0-9a-f-]+$/.test(path)).map(([path])=>path)).toEqual([base+'/'+formId+'/versions/'+formVersion])
  fireEvent.click(within(preview).getByRole('button',{name:'下一工具'}));await within(preview).findByText('1. 固定量表题目')
  expect(api.mock.calls.some(([path])=>path.endsWith('/preview')||path.endsWith('/validate'))).toBe(false)
  expect(api.mock.calls.some(([path,,body])=>path.includes('/tracks')||(JSON.stringify(body)??'').includes('仅在本页试填'))).toBe(false)
 })
 it('attaches one fixed ordinary version with draft CAS and SELF selectors, blocking duplicate writes',async()=>{
  const endpoint=`/organizations/${org}/evaluation-events/${id(9)}/run/tracks`
  let finish!:(value:unknown)=>void
  const pending=new Promise(resolve=>{finish=resolve})
  const api=vi.fn(async(path:string,method='GET',data?:unknown)=>{
   if(path===base+'?kind=COMPOSITION')return {list:[{id:rootId,kind:'COMPOSITION',title:'已固定普通问卷',revision:20,contentHash:hash('a')}],nextCursor:null}
   if(path===base+'/'+rootId+'/versions')return {list:[{id:rootVersion,title:'固定问卷五',sourceRevision:5,contentHash:hash('f')}],nextCursor:null}
   if(path===endpoint&&method==='POST')return pending
   throw new Error('Unexpected API '+path+' '+JSON.stringify(data))
  })
  const onBusy=vi.fn(),onRefresh=vi.fn().mockResolvedValue(undefined)
  render(<EducationCompositionRunPicker api={api as PrivateToolApi} organizationId={org} actorKey={id(2)} endpoint={endpoint} expectedVersion={7} disabled={false} onBusy={onBusy} onRefresh={onRefresh}/>)
  const details=screen.getByText('选用本人普通问卷').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'))
  fireEvent.click(await screen.findByRole('button',{name:'选择固定版本 · 已固定普通问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'选择本版本 · 修订 5'}))
  fireEvent.click(screen.getByRole('button',{name:'加入评价任务'}));fireEvent.click(screen.getByRole('button',{name:'加入评价任务'}))
  await waitFor(()=>expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1))
  expect(api).toHaveBeenCalledWith(endpoint,'POST',{expectedVersion:7,privateComposition:{versionId:rootVersion,contentHash:hash('f')},
   subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}})
  finish({id:'track'})
  await screen.findByText('固定普通问卷已加入任务草稿，请预览并发布任务。')
  await waitFor(()=>expect(onBusy).toHaveBeenLastCalledWith(false));expect(onRefresh).toHaveBeenCalledOnce()
 })
 it('ignores a late questionnaire creation result after switching the Teacher account',async()=>{
  let finish!:(value:unknown)=>void
  const pending=new Promise(resolve=>{finish=resolve})
  const api=vi.fn(async(path:string,method='GET')=>{
   if(path===base+'?kind=COMPOSITION')return {list:[],nextCursor:null}
   if(path===base&&method==='POST')return pending
   throw new Error('Unexpected API '+path)
  })
  const {rerender}=render(<EducationCompositionStudio api={api as PrivateToolApi} organizationId={org} actorId={id(2)}/>)
  await waitFor(()=>expect(screen.getByLabelText('问卷名称')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('问卷名称'),{target:{value:'旧账号创建结果'}})
  fireEvent.click(screen.getByRole('button',{name:'新建普通问卷'}))
  await waitFor(()=>expect(api.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1))
  rerender(<EducationCompositionStudio api={api as PrivateToolApi} organizationId={org} actorId={id(20)}/>)
  await act(async()=>{finish({id:rootId,kind:'COMPOSITION',title:'旧账号创建结果',revision:1,contentHash:hash('e'),definition});await pending})
  await waitFor(()=>expect(screen.getByLabelText('问卷名称')).toHaveValue(''))
  expect(screen.queryByRole('button',{name:'保存问卷草稿'})).not.toBeInTheDocument()
  expect(screen.queryByDisplayValue('旧账号创建结果')).not.toBeInTheDocument()
 })
})
