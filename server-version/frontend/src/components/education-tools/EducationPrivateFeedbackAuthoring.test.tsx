import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateToolApi} from './privateToolClient'
describe('Teacher private native feedback choice',()=>{
 it('opts into a future fixed version explicitly without inventing a review or changing score definitions',async()=>{
  const base='/organizations/a/private-tools',definition=emptyDefinition()
  const tool={id:'tool',kind:'SCALE',title:'私有量表',revision:4,contentHash:'a'.repeat(64),definition}
  const api=vi.fn(async(path:string,method='GET',body?:any)=>{
   if(path===base)return {list:[tool],nextCursor:null}
   if(path===base+'/tool/versions')return {list:[],nextCursor:null}
   if(path===base+'/tool'&&method==='GET')return tool
   if(path===base+'/tool'&&method==='PUT')return {...tool,...body,revision:5}
   throw new Error('Unexpected API '+method+' '+path)
  })
  render(<EducationPrivateToolStudio api={api as PrivateToolApi} organizationId="a" actorId="author" entry="TEACHER"/>)
  fireEvent.click(await screen.findByRole('button',{name:'编辑 私有量表'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'报告文案'})).toBeEnabled())
  fireEvent.click(screen.getByRole('button',{name:'报告文案'}))
  const choice=screen.getByRole('checkbox',{name:/^允许教师自评者查看本量表的本人反馈/})
  expect(choice).not.toBeChecked();fireEvent.click(choice)
  fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
  await waitFor(()=>expect(api.mock.calls.filter(([,method])=>method==='PUT')).toHaveLength(1))
  const body=api.mock.calls.find(([,method])=>method==='PUT')![2]
  expect(body).toMatchObject({expectedRevision:4,definition:{report:{audienceContract:{schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN'}}}})
  expect(body.definition.report.audienceContract).not.toHaveProperty('qcReview')
  expect(body.definition.scoring).toEqual(definition.scoring)
  expect(body.definition.items).toEqual(definition.items)
 })
})
