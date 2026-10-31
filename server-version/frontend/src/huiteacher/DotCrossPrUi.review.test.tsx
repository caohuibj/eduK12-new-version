import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {TeacherFormGroupVersions} from './TeacherFormGroupVersions'
import {TeacherNumericGroupReports} from './TeacherNumericGroupReports'
afterEach(cleanup)
const formReport={versionId:'saved',eventId:'event',formId:'form',definitionDigest:'a'.repeat(64),releasedAt:'2026-10-31T00:00:00Z',populationLabel:'合成教师群体',independentRespondents:null,minimumRespondents:10,distributions:[]}
const page={versioned:true,truncated:false,versions:[{versionId:'saved',releasedAt:formReport.releasedAt,populationLabel:formReport.populationLabel}],groups:{options:[],limitations:[]},nextCursor:null}
function readOnlyActions(){
 const buttons=screen.queryAllByRole('button').filter(button=>/重试|重新|读取|刷新/.test(button.textContent??''))
 const alternatives=screen.queryAllByRole('combobox').flatMap(element=>{const select=element as HTMLSelectElement;return [...select.options].filter(option=>option.value&&option.value!==select.value)})
 return [...buttons,...alternatives]
}
it('Form first directory transient failure has an in-place GET recovery action (no POST/remount)',async()=>{
 let failed=false
 const calls=vi.fn(async(path:string,method?:string)=>{expect(method).toBeUndefined();if(!failed){failed=true;throw Error('transient directory failure')}return path.endsWith('/saved')?formReport:page})
 const api=async<T,>(path:string,method?:string)=>await calls(path,method) as T
 const deliver=vi.fn();render(<TeacherFormGroupVersions api={api} endpoint="/report" onReport={deliver}/>);await screen.findByText('transient directory failure')
 // Prove the same GET can now return the lawful saved directory; this is a fixture probe, not a UI request.
 expect(await calls('/report/versions')).toEqual(page);calls.mockClear()
 expect(screen.queryByRole('status')).toBeNull()
 expect(readOnlyActions(), 'Directory recovered but component offers no action to issue its next GET').not.toHaveLength(0)
 fireEvent.click(screen.getByRole('button',{name:'重试读取版本目录'}));await waitFor(()=>expect(deliver).toHaveBeenLastCalledWith(formReport))
 expect(calls.mock.calls.map(([path])=>path)).toEqual(['/report/versions','/report/versions/saved']);expect(screen.queryByRole('alert')).toBeNull()
})
it('Form single saved version transient read failure has an in-place read-only recovery action',async()=>{
 let failed=false
 const calls=vi.fn(async(path:string,method?:string)=>{expect(method).toBeUndefined();if(path==='/report/versions')return page;if(!failed){failed=true;throw Error('transient saved read failure')}return formReport})
 const api=async<T,>(path:string,method?:string)=>await calls(path,method) as T
 const deliver=vi.fn();render(<TeacherFormGroupVersions api={api} endpoint="/report" onReport={deliver}/>);await screen.findByText('transient saved read failure')
 expect(await calls('/report/versions/saved')).toEqual(formReport);calls.mockClear()
 // Native select already displays its sole option; no alternate selection can produce a change.
 expect((screen.getByLabelText('已生成版本') as HTMLSelectElement).value).toBe('saved')
 expect(readOnlyActions(), 'Saved GET recovered; only generate POST remains, with no selectable alternate version').not.toHaveLength(0)
 fireEvent.click(screen.getByRole('button',{name:'重试读取该版本报告'}));await waitFor(()=>expect(deliver).toHaveBeenLastCalledWith(formReport))
 expect(calls.mock.calls.map(([path])=>path)).toEqual(['/report/versions/saved']);expect(screen.queryByRole('alert')).toBeNull()
})
it('Two actual private-composition leaf DTOs with equal version have distinguishable option text',async()=>{
 const leaf=(key:string)=>({slotKey:'scale:'+key,unitType:'SCALE',instrumentKey:key,instrumentVersion:'1.0.0',compiledRuntimeHash:'a'.repeat(64)})
 const config={sources:[{trackId:'track',title:'同一私有组合',minimumN:10,canGenerate:true,tools:[{leaf:leaf('scale-A'),metrics:[{key:'score'}]},{leaf:leaf('scale-B'),metrics:[{key:'score'}]}],groups:{options:[],limitations:[]}}],specs:[{specId:'spec',title:'群报方案'}],versions:[],nextCursor:null,canGenerate:true}
 const artifact={artifactId:'numeric-saved',generatedAt:formReport.releasedAt,projection:{title:'合成数值群报',sourceLabel:'固定叶',cutoff:formReport.releasedAt,populationLabel:'合成人群',completedN:null,countUnit:'PERSON',assignedN:null,tool:{key:'scale-B',title:'B',kind:'SCALE'},metrics:[],limitations:[]}}
 const calls=vi.fn(async(path:string,method?:string,data?:unknown)=>{if(method==='POST'){expect(data).toEqual({trackId:'track',leaf:leaf('scale-B'),specId:'spec',selection:{kind:'ALL'}});return artifact}expect(method).toBeUndefined();return path.endsWith('?configure=true')?config:{...config,sources:[],specs:[]}})
 const api=async<T,>(path:string,method?:string,data?:unknown)=>await calls(path,method,data) as T
 render(<TeacherNumericGroupReports api={api} endpoint="/numeric"/>);fireEvent.click(screen.getByRole('button',{name:'查看数值群体报告'}));await screen.findByLabelText('已批准群体用途的工具')
 await waitFor(()=>expect(screen.queryByRole('status')).toBeNull())
 const options=[...(screen.getByLabelText('已批准群体用途的工具') as HTMLSelectElement).options].filter(option=>option.value)
 expect(options).toHaveLength(2);expect(new Set(options.map(option=>option.value)).size).toBe(2)
 expect(new Set(options.map(option=>option.textContent)).size,JSON.stringify(options.map(option=>({value:option.value,text:option.textContent})))).toBe(2)
 fireEvent.change(screen.getByLabelText('已批准群体用途的工具'),{target:{value:options[1].value}});fireEvent.change(screen.getByLabelText('已发布单次群体方案'),{target:{value:'spec'}})
 fireEvent.click(screen.getByRole('button',{name:'生成数值群报更新版'}));await screen.findByRole('heading',{name:'合成数值群报'})
 expect(calls.mock.calls.filter(([,method])=>method==='POST')).toHaveLength(1)
})
