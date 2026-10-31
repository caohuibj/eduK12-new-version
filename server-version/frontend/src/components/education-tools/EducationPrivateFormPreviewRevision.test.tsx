import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import type {PrivateTool,PrivateToolApi} from './privateToolClient'
const base='/organizations/school/private-tools'
afterEach(cleanup)
async function validateAndOpen(){
 const check=await screen.findByRole('button',{name:'检查定义'});await waitFor(()=>expect(check).toBeEnabled());fireEvent.click(check)
 const preview=screen.getByRole('button',{name:'试填预览'});await waitFor(()=>expect(preview).toBeEnabled());fireEvent.click(preview)
}
describe('real private FORM studio preview revision boundary',()=>{
 it.each(['delete','change-type'] as const)('clears old author answers after %s and sends only newly answered keys after save and revalidation',async action=>{
  let draft:PrivateTool={id:'draft',kind:'FORM',title:'私有表单修订',revision:1,contentHash:'hash-1',definition:{schemaVersion:2,pages:[{pageKey:'page',title:'第一页',questions:['changed','kept'].map(itemKey=>({itemKey,type:'SHORT_TEXT' as const,prompt:itemKey==='changed'?'即将修改':'保留题目',required:false,allowRefusal:false,options:[],rows:[]}))}]}}
  const api=vi.fn(async(path:string,method?:string,data?:unknown)=>{
   if(path===base)return {list:[draft],nextCursor:null}
   if(path===base+'/draft'&&method==='PUT'){
    draft={...draft,definition:(data as {definition:PrivateTool['definition']}).definition,revision:2,contentHash:'hash-2'}
    return {revision:2,contentHash:'hash-2'}
   }
   if(path===base+'/draft')return draft
   if(path.endsWith('/versions'))return {list:[],nextCursor:null}
   if(path.endsWith('/validate'))return {valid:true,issues:[],revision:draft.revision,contentHash:draft.contentHash}
   if(path.endsWith('/preview'))return {contentHash:draft.contentHash,result:{marker:'已完成本次作者试填'}}
   throw Error('Unexpected '+path)
  })
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} entry="SCHOOL" organizationId="school" actorId="author"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 私有表单修订'}));await validateAndOpen()
  fireEvent.change(within(screen.getByRole('group',{name:'即将修改'})).getByRole('textbox'),{target:{value:'旧版本答案'}})
  fireEvent.change(within(screen.getByRole('group',{name:'保留题目'})).getByRole('textbox'),{target:{value:'旧保留题答案'}})
  fireEvent.click(screen.getByRole('button',{name:'检查试填结果'}))
  await waitFor(()=>expect(api).toHaveBeenCalledWith(base+'/draft/preview','POST',{answers:{changed:'旧版本答案',kept:'旧保留题答案'}}))
  const back=screen.getByRole('button',{name:'返回编辑'});await waitFor(()=>expect(back).toBeEnabled());fireEvent.click(back)
  const question=(await screen.findByDisplayValue('即将修改')).closest('article')!
  if(action==='delete')fireEvent.click(within(question).getByRole('button',{name:'删除题目'}))
  else fireEvent.change(within(question).getByLabelText('选择题型'),{target:{value:'NUMBER'}})
  expect(screen.getByText(/旧版本试填答案已清除/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'试填预览'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'固定私有版本'})).toBeDisabled()
  expect(screen.queryByText(/已完成本次作者试填/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'保存草稿'}));await screen.findByText('草稿已保存 · 修订 2')
  await validateAndOpen()
  expect(within(screen.getByRole('group',{name:'保留题目'})).getByRole('textbox')).toHaveValue('')
  if(action==='change-type'){
   const number=within(screen.getByRole('group',{name:'即将修改'})).getByRole('spinbutton')
   expect(number).toHaveValue(null);fireEvent.change(number,{target:{value:'7'}})
  }else expect(screen.queryByRole('group',{name:'即将修改'})).not.toBeInTheDocument()
  fireEvent.change(within(screen.getByRole('group',{name:'保留题目'})).getByRole('textbox'),{target:{value:'新版本答案'}})
  fireEvent.click(screen.getByRole('button',{name:'检查试填结果'}))
  await waitFor(()=>expect(api.mock.calls.filter(([path])=>path.endsWith('/preview'))).toHaveLength(2))
  const payload=api.mock.calls.filter(([path])=>path.endsWith('/preview'))[1][2]
  expect(payload).toEqual({answers:action==='delete'?{kept:'新版本答案'}:{changed:7,kept:'新版本答案'}})
  expect(JSON.stringify(payload)).not.toContain('旧')
  expect(api.mock.calls.every(([path])=>path.startsWith(base))).toBe(true)
 })
})
