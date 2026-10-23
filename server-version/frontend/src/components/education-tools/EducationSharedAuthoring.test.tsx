import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import type {PrivateToolApi} from './privateToolClient'
import {useState} from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateFormEditor} from './EducationPrivateFormEditor'
import {useFormPendingBuffers} from '../../modules/assessment-core/form/useFormBulkDraft'
import {emptyDefinition,normalizeDefinition,updateReportContract} from '../../pages/scaleDefinitionEditorModel'
import {ScaleDefinitionEditor} from '../../pages/ScaleDefinitionEditor'
import type {FormDraft} from '../../survey/builder.types'
// Native Form V2 DTO: page/item identities, optionKey references and matrix rows.
const draft:FormDraft={schemaVersion:2,pages:[{pageKey:'p',title:'区段',questions:[
 {itemKey:'q',type:'SINGLE',prompt:'第一题',required:true,allowRefusal:false,options:[{optionKey:'a',label:'甲'},{optionKey:'b',label:'乙'},{optionKey:'c',label:'戊'}],rows:[]},
 {itemKey:'dependent',type:'SHORT_TEXT',prompt:'条件题',required:false,allowRefusal:false,options:[],rows:[],displayIf:{itemKey:'q',operator:'EQUALS',optionKey:'c'}},
]}]}
function Harness(){const [value,setValue]=useState(draft);const {hasPending,onPendingChange}=useFormPendingBuffers();return <><button disabled={hasPending}>保存草稿</button><button disabled={hasPending}>固定私有版本</button><EducationPrivateFormEditor value={value} onChange={setValue} bulkPending={hasPending} onPendingChange={onPendingChange}/></>}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
describe('education shared authoring integration',()=>{
 it('keeps unapplied text and blocks question/type/structure changes and persistence until applied',()=>{
  render(<Harness/>);fireEvent.change(screen.getByLabelText('选项批量内容'),{target:{value:'丙\n丁'}})
  expect(screen.getByRole('button',{name:'编辑题目：条件题'})).toBeDisabled()
  expect(screen.getByLabelText('选择题型')).toBeDisabled()
  expect(screen.getByRole('button',{name:'删除区段'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'固定私有版本'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'应用选项'}))
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled()
  expect(screen.getByLabelText('选项批量内容')).toHaveValue('')
  fireEvent.click(screen.getByRole('button',{name:'编辑题目：条件题'}))
  fireEvent.click(screen.getByRole('button',{name:'编辑题目：第一题'}))
  expect(screen.getByDisplayValue('丙')).toBeInTheDocument()
 })
 it('retains a referenced option and pending text when replacement would remove its stable key',()=>{
  render(<Harness/>);fireEvent.change(screen.getByLabelText('选项批量写入方式'),{target:{value:'replace'}})
  fireEvent.change(screen.getByLabelText('选项批量内容'),{target:{value:'甲\n乙'}})
  expect(screen.getByRole('button',{name:'应用选项'})).toBeDisabled()
  expect(screen.getByLabelText('选项批量内容')).toHaveValue('甲\n乙')
  fireEvent.click(screen.getByRole('button',{name:'清空输入'}))
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled()
  expect(screen.getByDisplayValue('乙')).toBeInTheDocument()
 })
 it('keeps scale item and feedback materials through normalize and report updates',()=>{
  // Shape matches backend assessment-media/material.ts: UUID, sha256, MIME and rights metadata.
  const material={asset:{assetId:'11111111-1111-4111-8111-111111111111',contentHash:'a'.repeat(64),mimeType:'application/pdf' as const},name:'说明',rightsStatus:'self_authored' as const,rightsNote:'本人创作'}
  const source=emptyDefinition();source.items=[{itemCode:'q',content:'内容',type:'single',required:true,sortOrder:1,responseSetKey:'default',randomizeOptions:false,materials:[material]}]
  source.scoring.scores=[{key:'total',type:'total',label:'总分',direction:'descriptive',canonical:true,displayPrecision:1,source:{type:'items',items:[{itemCode:'q',weight:1}],aggregation:'sum'}}]
  source.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'r',min:0,max:5,includeMax:true,text:'反馈',materials:[material]}]}]}
  const result=updateReportContract(normalizeDefinition(JSON.parse(JSON.stringify(source))))
  expect(result.items[0].materials).toEqual([material]);expect(result.report.rawScoreFeedback?.rules[0].ranges[0].materials).toEqual([material])
 })
 it('reports scale paste risk and keeps shared authoring limits',()=>{
  const pending=vi.fn();render(<ScaleDefinitionEditor definition={emptyDefinition()} setDefinition={vi.fn()} activeTab="responses" readOnly={false} controlsDisabled={false} saveDefinition={vi.fn()} onPendingChange={pending}/>)
  fireEvent.change(screen.getByLabelText('选项批量内容'),{target:{value:'是\n否'}})
  expect(pending).toHaveBeenLastCalledWith('scale-paste',true)
  expect(screen.getByRole('button',{name:'保存响应集'})).toBeDisabled()
  expect(screen.getByRole('option',{name:'50 项'})).toBeInTheDocument()
 })
})

describe('education editor reload boundary',()=>{
 it.each(['FORM','SCALE'] as const)('clears discarded %s buffers on successful same-id reload',async kind=>{
  const tool={id:'same-tool',kind,title:'重读工具',revision:1,contentHash:'hash',definition:kind==='FORM'?draft:emptyDefinition()}
  const api=vi.fn(async(path:string)=>path.endsWith('/versions')?{list:[]}:path.endsWith('/same-tool')?structuredClone(tool):{list:[tool],nextCursor:null}) as unknown as PrivateToolApi
  render(<EducationPrivateToolStudio api={api} organizationId="a" entry="SCHOOL"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 重读工具'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled())
  const input=screen.getByLabelText('选项批量内容')
  fireEvent.change(input,{target:{value:'待应用内容'}})
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  fireEvent.click(screen.getByRole('button',{name:'重新读取草稿'}))
  expect(input).toHaveValue('待应用内容')
  confirm.mockReturnValue(true)
  fireEvent.click(screen.getByRole('button',{name:'重新读取草稿'}))
  await waitFor(()=>expect(screen.getByLabelText('选项批量内容')).toHaveValue(''))
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled()
  fireEvent.change(screen.getByLabelText('选项批量内容'),{target:{value:'新的待应用内容'}})
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
 })
})

describe('education CSV pending boundary',()=>{
 it('keeps CSV pending separate from ordinary bulk buffers and prevents navigation loss',async()=>{
  const tool={id:'csv-tool',kind:'SCALE' as const,title:'CSV工具',revision:1,contentHash:'hash',definition:emptyDefinition()}
  const api=vi.fn(async(path:string)=>path.endsWith('/versions')?{list:[]}:path.endsWith('/csv-tool')?structuredClone(tool):{list:[tool],nextCursor:null}) as unknown as PrivateToolApi
  render(<EducationPrivateToolStudio api={api} organizationId="a" entry="SCHOOL"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 CSV工具'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'题目'}))
  const csv=screen.getByLabelText('CSV 内容')
  const text='item_code,prompt,reverse,score_keys,response_set_key\nq2,新题,false,total,default'
  fireEvent.change(csv,{target:{value:text}})
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'响应选项'})).toBeDisabled()
  // Its own pending buffer must not disable its text or its own preview operation.
  expect(csv).toBeEnabled()
  expect(screen.getByText('预检导入').closest('button')).toBeEnabled()
  vi.spyOn(window,'confirm').mockReturnValue(false)
  fireEvent.click(screen.getByRole('button',{name:'返回我的工具'}))
  expect(csv).toHaveValue(text)
  fireEvent.click(screen.getByText('清除 CSV 内容').closest('button')!)
  expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled()
  expect(screen.getByRole('button',{name:'响应选项'})).toBeEnabled()
 })
})
