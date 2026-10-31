import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {TeacherGroupLongitudinal} from './TeacherGroupLongitudinal'
const artifact=(artifactId:string)=>({artifactId,generatedAt:'2026-10-31T00:00:00Z',projection:{planId:'plan',sourceKey:'A',title:'合成历史',metrics:[],limitations:[]}})
const cursor={generatedAt:'2026-10-30T00:00:00.123456Z',artifactId:'latest'}
const index={status:'CONFIGURED',planId:'plan',tools:[{key:'A',label:'量表A',kind:'SCALE'}],waves:[{id:'r1',ordinal:1,title:'T1'},{id:'r2',ordinal:2,title:'T2'}],artifacts:[{artifactId:'latest',generatedAt:'2026-10-31T00:00:00Z'}],nextCursor:cursor}
it('keeps the shared saved reader/history while configuration changes and posts only the selected spec/group once',async()=>{
 const calls=vi.fn(async(path:string,method='GET',body?:unknown)=>{
  if(method==='POST'){expect(body).toEqual({planId:'plan',sourceKey:'A',throughWaveId:'r2',specId:'spec',selection:{kind:'CLASSES',ids:['class']}});return artifact('fresh')}
  if(path==='/reports?configure=true')return{...index,specs:[{specId:'spec',title:'既有方案'}],groups:{options:[{kind:'CLASSES',id:'class',name:'一班',dimensionId:null,dimensionName:null}],limitations:[]}}
  if(path.includes('beforeGeneratedAt=')){expect(new URL('https://synthetic.invalid'+path).searchParams.get('beforeGeneratedAt')).toBe(cursor.generatedAt);return{artifacts:[{artifactId:'latest',generatedAt:'2026-10-31T00:00:00Z'},{artifactId:'older',generatedAt:'2026-10-29T00:00:00Z'}],nextCursor:null}}
  if(path==='/reports')return index
  return artifact(path.endsWith('older')?'older':'latest')
 })
 const api=async<T,>(path:string,method?:string,body?:unknown):Promise<T>=>await calls(path,method,body) as T
 render(<TeacherGroupLongitudinal api={api} endpoint="/reports"/>);expect(calls).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'查看群体纵向报告'}));expect(calls).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'打开纵向群体报告'}));await screen.findByRole('article',{name:'群体纵向报告'})
 expect(calls.mock.calls.map(([p])=>p)).toEqual(['/reports','/reports/latest'])
 fireEvent.click(screen.getByRole('button',{name:'加载更早的纵向版本'}));await waitFor(()=>expect(screen.getByLabelText('纵向群体历史版本').querySelectorAll('option')).toHaveLength(3))
 fireEvent.change(screen.getByLabelText('纵向群体历史版本'),{target:{value:'older'}});await waitFor(()=>expect(screen.getByLabelText('纵向群体历史版本')).toHaveValue('older'))
 fireEvent.click(screen.getByRole('button',{name:'配置纵向群报方案与人群'}));await screen.findByLabelText('纵向群报方案')
 fireEvent.change(screen.getByLabelText('纵向群报方案'),{target:{value:'spec'}});expect(screen.getByLabelText('纵向群体历史版本')).toHaveValue('older')
 fireEvent.change(screen.getByLabelText('纵向报告人群'),{target:{value:'CLASSES'}});fireEvent.click(screen.getByLabelText('一班'))
 fireEvent.click(screen.getByRole('button',{name:'生成更新版纵向报告'}));await waitFor(()=>expect(screen.getByLabelText('纵向群体历史版本')).toHaveValue('fresh'))
 expect(calls.mock.calls.filter(([p])=>p==='/reports')).toHaveLength(2) // one index GET and the explicit POST
 expect(calls.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 expect(calls.mock.calls.filter(([p])=>p==='/reports?configure=true')).toHaveLength(1)
})
it('discards the old configuration response after switching the actual event endpoint',async()=>{
 let finish!:(v:unknown)=>void
 const api=vi.fn((path:string)=>path==='/old?configure=true'?new Promise(resolve=>{finish=resolve}):Promise.resolve({status:'NOT_CONFIGURED',tools:[],waves:[],artifacts:[]}))
 const {rerender}=render(<TeacherGroupLongitudinal api={api as any} endpoint="/old"/>);fireEvent.click(screen.getByRole('button',{name:'查看群体纵向报告'}));fireEvent.click(screen.getByRole('button',{name:'配置纵向群报方案与人群'}))
 rerender(<TeacherGroupLongitudinal api={api as any} endpoint="/new"/>);fireEvent.click(screen.getByRole('button',{name:'查看群体纵向报告'}))
 await act(async()=>finish({status:'CONFIGURED',specs:[{specId:'old',title:'旧方案'}],groups:{options:[],limitations:[]}}));expect(screen.queryByText('旧方案')).not.toBeInTheDocument()
})
