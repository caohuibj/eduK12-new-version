import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {TeacherFormGroupVersions} from './TeacherFormGroupVersions'

it('reads a Form version beyond the first hundred using its exact cursor without regenerating or changing the selected report',async()=>{
 const report=(id:string)=>({versionId:id,eventId:'event',formId:'form',definitionDigest:'a'.repeat(64),releasedAt:'2026-10-30T00:00:00Z',populationLabel:'合成教师群体',independentRespondents:null,minimumRespondents:10,distributions:[]})
 const latest=report('latest'),old=report('older-than-100'),cursor={releasedAt:'2026-10-29T00:00:00.123456Z',versionId:'10000000-0000-4000-8000-000000000100'}
 const pointer=(id:string)=>({versionId:id,releasedAt:latest.releasedAt,populationLabel:latest.populationLabel})
 const page={versioned:true,groups:{options:[],limitations:[]},versions:Array.from({length:100},(_,i)=>pointer(i===0?'latest':'v'+i)),nextCursor:cursor,truncated:true}
 let failOlder=true
 const requests=vi.fn(async(path:string,method?:string)=>{
  expect(method).toBeUndefined()
  if(path==='/report/versions')return page
  if(path==='/report/versions/latest')return latest
  if(path==='/report/versions/older-than-100')return old
  if(path.startsWith('/report/versions?')){
   const query=new URLSearchParams(path.split('?')[1]);expect(query.get('beforeAt')).toBe(cursor.releasedAt);expect(query.get('beforeId')).toBe(cursor.versionId)
   if(failOlder){failOlder=false;throw Error('合成目录暂不可读')}
   return {...page,versions:[pointer('older-than-100')],nextCursor:null,truncated:false}
  }
  throw Error('Unexpected request '+path)
 })
 const api=async<T,>(path:string,method?:string):Promise<T>=>await requests(path,method) as T
 const deliver=vi.fn()
 render(<TeacherFormGroupVersions api={api} endpoint="/report" onReport={deliver}/> )
 await waitFor(()=>expect(deliver).toHaveBeenLastCalledWith(latest))
 fireEvent.click(screen.getByRole('button',{name:'更早 Form 报告版本'}))
 await screen.findByText('合成目录暂不可读')
 expect(screen.getByLabelText('已生成版本')).toHaveValue('latest');expect(deliver).toHaveBeenLastCalledWith(latest)
 fireEvent.click(screen.getByRole('button',{name:'更早 Form 报告版本'}))
 await waitFor(()=>expect(screen.getByLabelText('已生成版本').querySelectorAll('option')).toHaveLength(101))
 expect(screen.getByLabelText('已生成版本')).toHaveValue('latest');expect(deliver).toHaveBeenLastCalledWith(latest)
 fireEvent.change(screen.getByLabelText('已生成版本'),{target:{value:'older-than-100'}})
 await waitFor(()=>expect(deliver).toHaveBeenLastCalledWith(old))
 expect(screen.queryByRole('button',{name:'更早 Form 报告版本'})).not.toBeInTheDocument()
 expect(requests.mock.calls.every(([,method])=>method===undefined)).toBe(true)
})
