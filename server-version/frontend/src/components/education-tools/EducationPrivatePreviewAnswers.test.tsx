import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {EducationPrivateToolStudio} from './EducationPrivateToolStudio'
import {emptyDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {PrivateTool,PrivateToolApi} from './privateToolClient'

afterEach(cleanup)
it('omits unanswered scale items while preserving answered zero and empty string values in the preview contract',async()=>{
 const definition=emptyDefinition()
 definition.responseSets[0].options=[{value:0,label:'零分',score:0},{value:'',label:'空字符串选项',score:1}]
 definition.items=['optional','zero','empty'].map((itemCode,index)=>({itemCode,content:itemCode,type:'single',required:itemCode!=='optional',sortOrder:index,responseSetKey:definition.responseSets[0].key,randomizeOptions:false}))
 const draft:PrivateTool={id:'draft',kind:'SCALE',title:'作答契约',revision:1,contentHash:'hash',definition}
 const base='/organizations/school/private-tools'
 const api=vi.fn(async(path:string,method?:string,_data?:unknown)=>{
  if(path===base)return {list:[draft],nextCursor:null}
  if(path===`${base}/draft`)return draft
  if(path.endsWith('/versions'))return {list:[],nextCursor:null}
  if(path.endsWith('/validate'))return {valid:true,issues:[],revision:1,contentHash:'hash'}
  if(path.endsWith('/preview')&&method==='POST')return {contentHash:'hash',result:{}}
  throw Error(`Unexpected request: ${method} ${path}`)
 })
 render(<EducationPrivateToolStudio api={api as PrivateToolApi} entry="SCHOOL" organizationId="school" actorId="author"/>)
 fireEvent.click(await screen.findByRole('button',{name:'编辑 作答契约'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'检查定义'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'检查定义'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'试填预览'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'试填预览'}))
 fireEvent.click(within(screen.getByRole('group',{name:'2. zero'})).getByRole('radio',{name:'零分'}))
 fireEvent.click(within(screen.getByRole('group',{name:'3. empty'})).getByRole('radio',{name:'空字符串选项'}))
 fireEvent.click(screen.getByRole('button',{name:'检查试填结果'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith(`${base}/draft/preview`,'POST',{answers:[{itemCode:'zero',responseValue:0},{itemCode:'empty',responseValue:''}]}))
 const payload=api.mock.calls.find(([path])=>path.endsWith('/preview'))?.[2]
 expect(JSON.parse(JSON.stringify(payload))).toEqual({answers:[{itemCode:'zero',responseValue:0},{itemCode:'empty',responseValue:''}]})
})
