import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateTool,PrivateToolApi} from './privateToolClient'
afterEach(cleanup)
describe('compact private-tool workspace preserves authoring gates',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('%s keeps its own theme and completes save, technical check, preview and private freeze without granting publication',async entry=>{
  const base='/organizations/school/private-tools'
  const definition=emptyDefinition()
  definition.items=[{itemCode:'q',content:'工作区试填题目',type:'single',required:false,sortOrder:0,responseSetKey:definition.responseSets[0].key,randomizeOptions:false}]
  let draft:PrivateTool={id:'draft',kind:'SCALE',title:'工作区量表',revision:1,contentHash:'hash-1',definition}
  const api=vi.fn(async(path:string,method?:string,data?:unknown)=>{
   if(path===base)return {list:[draft],nextCursor:null}
   if(path===base+'/draft'&&method==='PUT'){
    const update=data as {title:string;definition:PrivateTool['definition']}
    draft={...draft,...update,revision:2,contentHash:'hash-2'};return {revision:2,contentHash:'hash-2'}
   }
   if(path===base+'/draft')return draft
   if(path.endsWith('/versions'))return {list:[],nextCursor:null}
   if(path.endsWith('/validate'))return {valid:true,issues:[],revision:draft.revision,contentHash:draft.contentHash}
   if(path.endsWith('/freeze'))return {id:'fixed',title:draft.title,sourceRevision:draft.revision,contentHash:draft.contentHash}
   throw Error('Unexpected '+path)
  })
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} entry={entry} organizationId="school" actorId="author"/>)
  const root=screen.getByRole('region',{name:'我的私有工具'})
  expect(root).toHaveClass(`education-private-tools--${entry.toLowerCase()}`,entry==='SCHOOL'?'hs-panel':'ht-panel')
  expect(root).not.toHaveClass(entry==='SCHOOL'?'ht-panel':'hs-panel')
  const edit=await screen.findByRole('button',{name:'编辑 工作区量表'});await waitFor(()=>expect(edit).toBeEnabled());fireEvent.click(edit)
  const save=await screen.findByRole('button',{name:'保存草稿'});await waitFor(()=>expect(save).toBeEnabled())
  const steps=screen.getByLabelText('私有工具编制步骤')
  expect(within(steps).getAllByRole('listitem')).toHaveLength(4)
  expect(screen.getByRole('button',{name:'试填预览'})).toBeDisabled();expect(screen.getByRole('button',{name:'固定私有版本'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'已修订工作区量表'}})
  expect(screen.getByRole('button',{name:'检查定义'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'固定私有版本'})).toBeDisabled()
  fireEvent.click(save)
  await screen.findByText(entry==='SCHOOL'?'草稿已保存 · 修订 2':'草稿已保存。固定版本需另外运行检查。')
  expect(api).toHaveBeenCalledWith(base+'/draft','PUT',expect.objectContaining({expectedRevision:1,title:'已修订工作区量表'}))
  expect(screen.getByRole('button',{name:'固定私有版本'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'检查定义'}))
  const preview=screen.getByRole('button',{name:'试填预览'});await waitFor(()=>expect(preview).toBeEnabled())
  expect(screen.getByRole('button',{name:'固定私有版本'})).toBeEnabled()
  fireEvent.click(preview);expect(screen.getByRole('group',{name:'1. 工作区试填题目'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'固定私有版本'}))
  await screen.findByText('私有版本已固定。此操作不会发布活动、开放学生作答或进入公共工具库。')
  expect(api).toHaveBeenCalledWith(base+'/draft/freeze','POST',{expectedRevision:2,expectedContentHash:'hash-2'})
  const summary=screen.getByText('源修订 2 · 固定私有版本')
  expect(summary.parentElement).toHaveTextContent('已修订工作区量表')
  expect(screen.getByText(/不会自动授予其他人使用权/)).toBeInTheDocument()
  expect(api.mock.calls.filter(([,method])=>method==='POST').map(([path])=>path)).toEqual([base+'/draft/validate',base+'/draft/freeze'])
 })
})
