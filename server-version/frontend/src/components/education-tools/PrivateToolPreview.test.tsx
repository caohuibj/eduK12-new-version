import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {PrivateToolPreview} from './PrivateToolPreview'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateTool} from './privateToolClient'

const summary={id:'private-1',title:'预览',revision:1,contentHash:'hash'}
afterEach(cleanup)
describe('native private tool previews',()=>{
 it('preserves the distinction between numeric and string scale option identities',()=>{
  const definition=emptyDefinition()
  definition.items=[{itemCode:'q',content:'题目',type:'SINGLE',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}]
  definition.responseSets=[{key:'default',options:[{value:1,label:'数字一',score:1},{value:'1',label:'字符串一',score:2}]}]
  const onAnswer=vi.fn()
  const tool:PrivateTool={...summary,kind:'SCALE',definition}
  const {rerender}=render(<PrivateToolPreview tool={tool} answers={{q:1}} onAnswer={onAnswer}/>)
  expect(screen.getByRole('radio',{name:'数字一'})).toBeChecked()
  expect(screen.getByRole('radio',{name:'字符串一'})).not.toBeChecked()
  fireEvent.click(screen.getByRole('radio',{name:'字符串一'}))
  expect(onAnswer).toHaveBeenCalledWith('q','1')
  rerender(<PrivateToolPreview tool={tool} answers={{q:'1'}} onAnswer={onAnswer}/>)
  expect(screen.getByRole('radio',{name:'数字一'})).not.toBeChecked()
  expect(screen.getByRole('radio',{name:'字符串一'})).toBeChecked()
 })
 it('hides conditional form descendants even if stale answers exist',()=>{
  const tool:PrivateTool={...summary,kind:'FORM',definition:{schemaVersion:2,pages:[{pageKey:'page',title:'表单',questions:[
   {itemKey:'q1',type:'SINGLE',prompt:'是否展开',required:true,allowRefusal:false,options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],rows:[]},
   {itemKey:'q2',type:'SINGLE',prompt:'条件题目',required:true,allowRefusal:false,options:[{optionKey:'yes',label:'继续'}],rows:[],displayIf:{itemKey:'q1',operator:'EQUALS',optionKey:'yes'}},
   {itemKey:'q3',type:'SHORT_TEXT',prompt:'后续题目',required:false,allowRefusal:false,options:[],rows:[],displayIf:{itemKey:'q2',operator:'EQUALS',optionKey:'yes'}},
  ]}]}}
  const {rerender}=render(<PrivateToolPreview tool={tool} answers={{q1:'no',q2:'yes',q3:'stale'}} onAnswer={vi.fn()}/>)
  expect(screen.queryByText(/条件题目/)).not.toBeInTheDocument()
  expect(screen.queryByText(/后续题目/)).not.toBeInTheDocument()
  rerender(<PrivateToolPreview tool={tool} answers={{q1:'yes',q2:'yes'}} onAnswer={vi.fn()}/>)
  expect(screen.getByText(/条件题目/)).toBeInTheDocument()
  expect(screen.getByText(/后续题目/)).toBeInTheDocument()
 })
})
