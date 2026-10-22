import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {SurveyToolLibrary} from './SurveyToolLibrary'
import type {LibraryTool} from './tool-library-api'
const mocks=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('./tool-library-api',async importOriginal=>({...await importOriginal<typeof import('./tool-library-api')>(),toolLibraryApi:mocks.api}))
const formDefinition={schemaVersion:2,pages:[{pageKey:'p',title:'背景',questions:[{itemKey:'q',prompt:'填写日期',type:'DATE',required:false,options:[],rows:[]}]}]}
const scaleDefinition={schemaVersion:1,responseOptions:[{optionKey:'a',label:'同意',score:1}],aggregation:'mean',dimensions:[{dimensionKey:'d',label:'维度'}],items:[{itemKey:'i',prompt:'题目',dimensionKeys:['d'],reverse:true}]}
let records:LibraryTool[],failWrite=false,failAfterWrite=false
beforeEach(()=>{
 window.history.replaceState(null,'','/workspace/tools');failWrite=false;failAfterWrite=false
 records=[{id:'form',title:'学习背景表单',kind:'FORM',revision:2,status:'DRAFT',updatedAt:'',definition:structuredClone(formDefinition)},{id:'scale',title:'学习投入量表',kind:'SCALE',revision:4,status:'DRAFT',updatedAt:'',definition:structuredClone(scaleDefinition)},{id:'group',title:'组合问卷',kind:'COMPOSITION',revision:0,status:'DRAFT',updatedAt:'',definition:{schemaVersion:1,items:[]}}]
 mocks.api.mockReset();mocks.api.mockImplementation(async(path:string,method='GET',body?:any)=>{
  if(path.startsWith('/tool-library?'))return {list:records.map(({definition:_,...row})=>row),total:records.length}
  if(path.startsWith('/tool-library/catalog'))return {list:[{id:'grant',title:'已授权表单',kind:'FORM',sourceRef:{sourceVersion:'1',kind:'FORM',sourceId:'source'}}]}
  const record=records.find(row=>path==='/tool-library/'+row.id);if(!record)throw new Error('Unexpected '+path)
  if(method==='GET')return structuredClone(record)
  if(method==='PATCH'){
   if(failWrite)throw new Error('网络响应未确认')
   if(body.revision!==record.revision)throw new Error('修订冲突')
   Object.assign(record,body,{revision:record.revision+1})
   if(failAfterWrite)throw new Error('网络响应未确认')
   return structuredClone(record)
  }
  throw new Error('Unexpected method '+method)
 })
})
afterEach(()=>{vi.restoreAllMocks()})
const card=(title:string)=>screen.getByRole('heading',{name:title}).closest('article')!
const writes=()=>mocks.api.mock.calls.filter(([,method])=>method==='PATCH')
describe('Survey tool card inline renaming',()=>{
 it.each([['学习背景表单','form',formDefinition],['学习投入量表','scale',scaleDefinition]])('renames %s inline with the complete saved definition and closes after ACK',async(title,id,definition)=>{
  const risk=vi.fn();render(<SurveyToolLibrary onLeaveRiskChange={risk}/>);await screen.findByRole('heading',{name:title})
  fireEvent.click(within(card(title)).getByRole('button',{name:'修改名称：'+title}))
  expect(window.location.search).toBe('');expect(screen.queryByRole('region',{name:'独立工具编辑'})).not.toBeInTheDocument()
  const input=screen.getByRole('textbox',{name:'工具名称'});expect(input).toHaveFocus();fireEvent.change(input,{target:{value:'  新名称  '}})
  expect(risk).toHaveBeenLastCalledWith({dirty:true,busy:false});fireEvent.click(screen.getByRole('button',{name:'保存名称'}))
  expect(await screen.findByRole('heading',{name:'新名称'})).toBeVisible();await waitFor(()=>expect(screen.queryByRole('form',{name:'修改工具名称'})).not.toBeInTheDocument())
  expect(writes()).toHaveLength(1);expect(writes()[0]).toEqual(['/tool-library/'+id,'PATCH',{revision:id==='form'?2:4,title:'新名称',definition}])
  expect(screen.getByRole('status')).toHaveTextContent('名称已保存');expect(risk).toHaveBeenLastCalledWith({dirty:false,busy:false})
 })
 it('cancels without writes, rejects blank input, and does not offer renaming in granted cards or study pickers',async()=>{
  const view=render(<SurveyToolLibrary/>);await screen.findByRole('heading',{name:'学习背景表单'})
  expect(within(card('组合问卷')).queryByRole('button',{name:/修改名称/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'修改名称：学习背景表单'}));fireEvent.change(screen.getByRole('textbox',{name:'工具名称'}),{target:{value:'  '}})
  expect(screen.getByRole('button',{name:'保存名称'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(writes()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'已获授权'}));await screen.findByRole('heading',{name:'已授权表单'});expect(screen.queryByRole('button',{name:/修改名称/})).not.toBeInTheDocument()
  view.unmount();render(<SurveyToolLibrary projectId="p"/>);await screen.findByRole('heading',{name:'学习背景表单'});expect(screen.queryByRole('button',{name:/修改名称/})).not.toBeInTheDocument()
 })
 it('retains a failed rename and rechecks the current revision before retrying',async()=>{
  failWrite=true;render(<SurveyToolLibrary/>);await screen.findByRole('heading',{name:'学习背景表单'});fireEvent.click(screen.getByRole('button',{name:'修改名称：学习背景表单'}))
  fireEvent.change(screen.getByRole('textbox',{name:'工具名称'}),{target:{value:'尚未保存'}});fireEvent.click(screen.getByRole('button',{name:'保存名称'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('网络响应未确认');expect(screen.getByRole('textbox',{name:'工具名称'})).toHaveValue('尚未保存')
  expect(screen.getByRole('button',{name:'编制工具'})).toBeDisabled();expect(screen.getByRole('button',{name:'已获授权'})).toBeDisabled()
  failWrite=false;fireEvent.click(screen.getByRole('button',{name:'保存名称'}));expect(await screen.findByRole('heading',{name:'尚未保存'})).toBeVisible()
  expect(writes()).toHaveLength(2);expect(writes()[0][2].revision).toBe(writes()[1][2].revision)
 })
 it('requires another explicit save after a concurrent change and preserves the newer question content',async()=>{
  render(<SurveyToolLibrary/>);await screen.findByRole('heading',{name:'学习背景表单'});fireEvent.click(screen.getByRole('button',{name:'修改名称：学习背景表单'}))
  fireEvent.change(screen.getByRole('textbox',{name:'工具名称'}),{target:{value:'我的新名称'}})
  records[0].revision=3;records[0].definition.pages[0].questions[0].prompt='其他窗口已更新题目'
  fireEvent.click(screen.getByRole('button',{name:'保存名称'}));expect(await screen.findByRole('alert')).toHaveTextContent('请确认名称后再次保存');expect(writes()).toHaveLength(0)
  expect(screen.getByRole('textbox',{name:'工具名称'})).toHaveValue('我的新名称');fireEvent.click(screen.getByRole('button',{name:'保存名称'}));expect(await screen.findByRole('heading',{name:'我的新名称'})).toBeVisible()
  expect(writes()[0][2]).toMatchObject({revision:3,definition:{pages:[{questions:[{prompt:'其他窗口已更新题目'}]}]}})
 })
 it('recognizes an already-applied rename after a lost response without issuing another write',async()=>{
  failAfterWrite=true;render(<SurveyToolLibrary/>);await screen.findByRole('heading',{name:'学习背景表单'});fireEvent.click(screen.getByRole('button',{name:'修改名称：学习背景表单'}))
  fireEvent.change(screen.getByRole('textbox',{name:'工具名称'}),{target:{value:'已经保存'}});fireEvent.click(screen.getByRole('button',{name:'保存名称'}));await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button',{name:'保存名称'}));expect(await screen.findByRole('heading',{name:'已经保存'})).toBeVisible();expect(writes()).toHaveLength(1)
  await act(async()=>{window.dispatchEvent(new Event('beforeunload'))})
 })
})
