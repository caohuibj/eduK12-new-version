import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import type {PrivateToolApi} from './privateToolClient'
vi.mock('./EducationPrivateVersionChooser',()=>({EducationPrivateVersionChooser:()=>null}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('education native SELF source authoring',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('saves four independent native units with an explicit research profile in %s',async entry=>{
  const base='/organizations/org/private-tools',hash='f'.repeat(64),root={id:'root',kind:'COMPOSITION',title:'四类工具问卷',revision:1,contentHash:'a'.repeat(64),definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:entry==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'',blocks:[
   {blockId:'a',instruction:'',source:{provider:'PRIVATE_VERSION',kind:'SCALE',versionId:'scale',contentHash:hash}},
   {blockId:'b',instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:'form',contentHash:hash}},
  ]}}
  const native=(kind:'COGNITIVE'|'SJT')=>({catalogKey:kind,sourceId:kind,kind,sourceProvider:kind==='COGNITIVE'?'COGNITIVE_CONFIG':'SJT_RELEASE',title:kind==='COGNITIVE'?'固定认知任务':'固定情境任务',contentHash:hash,language:'zh-CN',versions:{content:'exact-7',parameters:null,report:null,...(kind==='COGNITIVE'?{profiles:['experience','research']}: {})},allowedActions:['REFERENCE_FIXED_VERSION'],canEditOriginal:false,canDistribute:false})
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===base+'?kind=COMPOSITION')return {list:[root],nextCursor:null}
   if(path===base+'/root/versions')return {list:[],nextCursor:null}
   if(path===base+'/root')return method==='GET'?root:{...root,...body,revision:2}
   if(path.startsWith(base+'/public-sources?'))return {list:[native(path.includes('kind=COGNITIVE')?'COGNITIVE':'SJT')],nextCursor:null}
   if(path===base+'/root/freeze')return {id:'fixed-root',sourceRevision:2,title:root.title,contentHash:hash,kind:'COMPOSITION'}
   throw Error('Unexpected '+method+' '+path)
  })
  render(<EducationCompositionStudio api={api as PrivateToolApi} entry={entry} organizationId="org" actorId="author"/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'编辑 四类工具问卷'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'编辑 四类工具问卷'}))
  fireEvent.click(await screen.findByRole('button',{name:'获授权认知任务'}))
  const cog=(await screen.findByText('固定认知任务')).closest('article')!
  expect(within(cog).getByRole('button',{name:'加入认知任务'})).toBeDisabled()
  expect(within(cog).queryByRole('option',{name:'正式版'})).not.toBeInTheDocument()
  fireEvent.change(within(cog).getByRole('combobox',{name:'固定认知任务任务版本'}),{target:{value:'research'}})
  fireEvent.click(within(cog).getByRole('button',{name:'加入认知任务'}))
  fireEvent.click(screen.getByRole('button',{name:'获授权情境任务'}))
  fireEvent.click(await screen.findByRole('button',{name:'加入情境任务'}))
  fireEvent.click(screen.getByRole('button',{name:'保存问卷草稿'}));await screen.findByText('问卷草稿已保存。')
  const definition=api.mock.calls.find(([,method])=>method==='PUT')![2].definition
  expect(definition.blocks.map((block:any)=>block.source.kind)).toEqual(['SCALE','FORM','COGNITIVE','SJT'])
  expect(definition.blocks[2].source).toEqual({provider:'COGNITIVE_CONFIG',kind:'COGNITIVE',versionId:'COGNITIVE',contentHash:hash,profile:'research'})
  expect(definition.blocks[3].source).toEqual({provider:'SJT_RELEASE',kind:'SJT',versionId:'SJT',contentHash:hash})
  expect(definition).not.toHaveProperty('scoring')
  fireEvent.click(screen.getByRole('button',{name:'固定问卷版本'}));await screen.findByText(/问卷版本已固定/)
  expect(api.mock.calls.some(([path])=>/grants|assignments|courses|prepare|publish/.test(path))).toBe(false)
 })
 it.each([['SCHOOL','PARENT_REPORT'],['SCHOOL','TEACHER_REPORT'],['TEACHER','STUDENT_REPORT'],['TEACHER','EXPERT_REPORT']] as const)('does not offer native proxy answers in %s %s',async(entry,mode)=>{
  const base='/organizations/org/private-tools',root={id:'root',kind:'COMPOSITION',title:'他评问卷',revision:1,contentHash:'a'.repeat(64),definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:entry==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'',blocks:[]}}
  const api=vi.fn(async(path:string)=>path===base+'?kind=COMPOSITION'?{list:[root],nextCursor:null}:path===base+'/root'?root:{list:[],nextCursor:null})
  render(<EducationCompositionStudio api={api as PrivateToolApi} entry={entry} organizationId="org" actorId="author"/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'编辑 他评问卷'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'编辑 他评问卷'}));fireEvent.change(await screen.findByRole('combobox',{name:'问卷作答方式'}),{target:{value:mode}})
  expect(screen.getByRole('button',{name:'获授权认知任务'})).toBeDisabled();expect(screen.getByRole('button',{name:'获授权情境任务'})).toBeDisabled()
  expect(api.mock.calls.some(([path])=>path.includes('kind=COGNITIVE')||path.includes('kind=SJT'))).toBe(false)
 })
})
