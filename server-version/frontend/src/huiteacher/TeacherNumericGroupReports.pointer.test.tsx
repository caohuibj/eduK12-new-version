import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {TeacherNumericGroupReports} from './TeacherNumericGroupReports'
it('opens saved pointers first, seeks older versions and loads calculation configuration only on explicit request',async()=>{
 const leaf={slotKey:'scale:item',unitType:'SCALE',instrumentKey:'support-scale',instrumentVersion:'1.0.0',compiledRuntimeHash:'a'.repeat(64)}
 const report=(id:string)=>({artifactId:id,generatedAt:'2026-10-31T00:00:00Z',projection:{title:'教师群体报告',sourceLabel:'合成教师支持',cutoff:'2026-10-31T00:00:00Z',populationLabel:'全部合格参与教师',completedN:10,assignedN:20,countUnit:'PERSON',tool:{key:'support-scale',title:'支持',kind:'SCALE'},metrics:[{key:'support',label:'支持',type:'NUMBER',unit:null,state:'present',validN:10,missingN:10,mean:3,sdSample:0,range:null,observedRange:null,qualityCounts:{},measurement:leaf,frequencies:[]}],limitations:['部分有效样本，不将未完成作为零分。']}})
 const old=report('old'),older=report('older'),fresh=report('fresh'),pointer=(r:typeof old)=>({artifactId:r.artifactId,generatedAt:r.generatedAt})
 const empty={sources:[],specs:[],canGenerate:true},cursor={generatedAt:'2026-10-30T00:00:00.123456Z',artifactId:'10000000-0000-4000-8000-000000000002'};let generated=false
 const requests=vi.fn(async(path:string,method?:string)=>{
  if(method==='POST'){generated=true;return fresh}
  if(path==='/reports?configure=true')return {...empty,sources:[{trackId:'track',title:'支持',minimumN:10,canGenerate:true,tools:[{leaf,metrics:[{key:'support'}]}],groups:{options:[],limitations:[]}}],specs:[{specId:'spec',title:'支持描述'}],versions:[pointer(old)],nextCursor:cursor}
  if(path.includes('beforeAt=')){expect(new URL('https://synthetic.invalid'+path).searchParams.get('beforeAt')).toBe(cursor.generatedAt);return {...empty,versions:[pointer(old),pointer(older)],nextCursor:null}}
  if(path==='/reports')return {...empty,versions:(generated?[fresh,old]:[old]).map(pointer),nextCursor:cursor}
  return path.endsWith('/older')?older:old
 })
 const api=async<T,>(path:string,method?:string):Promise<T>=>await requests(path,method) as T
 render(<TeacherNumericGroupReports api={api} endpoint="/reports"/> )
 fireEvent.click(screen.getByRole('button',{name:'查看数值群体报告'}));await screen.findByRole('article',{name:'群体报告阅读'})
 expect(requests.mock.calls.map(([path])=>path)).toEqual(['/reports','/reports/old'])
 expect(screen.queryByLabelText('已批准群体用途的工具')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'更早数值报告版本'}));await waitFor(()=>expect(screen.getByLabelText('已生成数值报告').querySelectorAll('option')).toHaveLength(3))
 expect(screen.getByLabelText('已生成数值报告')).toHaveValue('old')
 fireEvent.change(screen.getByLabelText('已生成数值报告'),{target:{value:'older'}});await waitFor(()=>expect(screen.getByLabelText('已生成数值报告')).toHaveValue('older'))
 fireEvent.click(screen.getByRole('button',{name:'配置数值群报更新版'}));await screen.findByLabelText('已批准群体用途的工具')
 expect(screen.getByLabelText('已生成数值报告')).toHaveValue('older')
 fireEvent.change(screen.getByLabelText('已批准群体用途的工具'),{target:{value:'track:scale:item:'+leaf.compiledRuntimeHash}})
 fireEvent.change(screen.getByLabelText('已发布单次群体方案'),{target:{value:'spec'}})
 fireEvent.click(screen.getByRole('button',{name:'生成数值群报更新版'}));await waitFor(()=>expect(screen.getByLabelText('已生成数值报告')).toHaveValue('fresh'))
 expect(requests.mock.calls.filter(([path])=>path.includes('configure=true'))).toHaveLength(1)
 expect(requests.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
 expect(screen.getByLabelText('已批准群体用途的工具')).toHaveValue('track:scale:item:'+leaf.compiledRuntimeHash)
})
