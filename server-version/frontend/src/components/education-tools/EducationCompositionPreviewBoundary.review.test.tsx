import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {EducationCompositionStudio} from './EducationCompositionStudio'
import type {PrivateToolApi} from './privateToolClient'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1),rootId=id(2),standardId=id(3),formId=id(4),base=`/organizations/${org}/private-tools`
const standardHash='a'.repeat(64),formHash='b'.repeat(64)
const standardPath=`${base}/public-sources/standard/${standardId}?contentHash=${standardHash}`
const formPath=`${base}/public-sources/form/${formId}?contentHash=${formHash}`
const root={id:rootId,kind:'COMPOSITION',title:'固定预览竞态问卷',revision:1,contentHash:'c'.repeat(64),definition:{schemaVersion:1,adapterVersion:'1.0.0',
 administration:{population:'STUDENT',responseMode:'SELF'},instruction:'',blocks:[
  {blockId:id(5),instruction:'',source:{provider:'STANDARD_SCALE',kind:'SCALE',versionId:standardId,contentHash:standardHash}},
  {blockId:id(6),instruction:'',source:{provider:'PUBLIC_FORM',kind:'FORM',versionId:formId,contentHash:formHash}},
 ]},references:[
  {id:standardId,kind:'SCALE',sourceProvider:'STANDARD_SCALE',title:'第一固定量表',contentHash:standardHash,version:'1.0.0'},
  {id:formId,kind:'FORM',sourceProvider:'PUBLIC_FORM',title:'第二固定表单',contentHash:formHash,version:'1.0.0'},
 ]}
const oldLeaf={id:standardId,kind:'SCALE',title:'第一固定量表',contentHash:standardHash,instruction:'过期的量表说明',definition:{
 responseSets:[{key:'set',options:[{value:'yes',label:'同意'}]}],items:[{itemCode:'old',content:'过期的量表题目',type:'single',required:true,sortOrder:0,responseSetKey:'set'}],
}}
const currentLeaf={id:formId,kind:'FORM',title:'第二固定表单',contentHash:formHash,definition:{schemaVersion:2,pages:[{
 pageKey:'p',title:'当前表单页面',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'当前表单题目',required:false,options:[],rows:[]}],
}]}}
function pending<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve}}

async function openPreview(api:PrivateToolApi){
 fireEvent.click(await screen.findByRole('button',{name:'编辑 '+root.title}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'预览问卷'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'预览问卷'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith(standardPath))
}

describe('Review: lazy immutable leaf preview response boundaries',()=>{
 it('keeps the selected public Form when the previous Standard response arrives late',async()=>{
  const late=pending<typeof oldLeaf>()
  const api=vi.fn(async(path:string)=>{
   if(path===base+'?kind=COMPOSITION')return {list:[root],nextCursor:null}
   if(path===base)return {list:[],nextCursor:null}
   if(path===base+'/'+rootId)return structuredClone(root)
   if(path===base+'/'+rootId+'/versions')return {list:[],nextCursor:null}
   if(path===standardPath)return late.promise
   if(path===formPath)return structuredClone(currentLeaf)
   throw Error('Unexpected preview request '+path)
  })
  render(<EducationCompositionStudio entry="SCHOOL" organizationId={org} actorId={id(7)} api={api as PrivateToolApi}/>)
  await openPreview(api as PrivateToolApi)
  const preview=screen.getByRole('region',{name:'问卷内容预览'})
  fireEvent.click(within(preview).getByRole('button',{name:'下一工具'}))
  await within(preview).findByText('当前表单题目')
  await act(async()=>{late.resolve(structuredClone(oldLeaf));await late.promise})
  expect(within(preview).getByText('当前表单题目')).toBeInTheDocument()
  expect(screen.queryByText('1. 过期的量表题目')).not.toBeInTheDocument()
  expect(screen.queryByText('过期的量表说明')).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([path])=>path===standardPath)).toHaveLength(1)
  expect(api.mock.calls.filter(([path])=>path===formPath)).toHaveLength(1)
  expect(api.mock.calls.some(([path])=>path.endsWith('/preview')||path.endsWith('/validate'))).toBe(false)
 })

 it('discards a pending leaf body when the same transport switches entry and author',async()=>{
  const late=pending<typeof oldLeaf>();let switched=false
  const api=vi.fn(async(path:string)=>{
   if(path===base+'?kind=COMPOSITION')return {list:switched?[]:[root],nextCursor:null}
   if(path===base)return {list:[],nextCursor:null}
   if(path===base+'/'+rootId)return structuredClone(root)
   if(path===base+'/'+rootId+'/versions')return {list:[],nextCursor:null}
   if(path===standardPath)return late.promise
   throw Error('Unexpected preview request '+path)
  })
  const {rerender}=render(<EducationCompositionStudio entry="SCHOOL" organizationId={org} actorId={id(7)} api={api as PrivateToolApi}/>)
  await openPreview(api as PrivateToolApi)
  switched=true
  rerender(<EducationCompositionStudio entry="TEACHER" organizationId={org} actorId={id(8)} api={api as PrivateToolApi}/>)
  await act(async()=>{late.resolve(structuredClone(oldLeaf));await late.promise})
  await waitFor(()=>expect(screen.getByLabelText('问卷名称')).toHaveValue(''))
  expect(screen.queryByRole('region',{name:'问卷内容预览'})).not.toBeInTheDocument()
  expect(screen.queryByText('1. 过期的量表题目')).not.toBeInTheDocument()
  expect(screen.queryByText('过期的量表说明')).not.toBeInTheDocument()
  expect(api.mock.calls.filter(([path])=>path===standardPath)).toHaveLength(1)
 })
})
