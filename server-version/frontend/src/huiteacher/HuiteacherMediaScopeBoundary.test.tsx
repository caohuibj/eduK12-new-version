import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
const captured=vi.hoisted(()=>({transport:undefined as undefined|{loadImage:(path:string)=>Promise<Blob>;loadVideoCapability:(path:string)=>Promise<unknown>}}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:({mediaTransport}:{mediaTransport:typeof captured.transport})=>{captured.transport=mediaTransport;return <div>Transport scope probe</div>}}))
afterEach(()=>{cleanup();captured.transport=undefined})
it('rejects other attempts, other units, traversal and noncanonical segments before either transport API call',async()=>{
 const api=vi.fn(async(path:string)=>{
  if(path==='/my-scale-tasks')return {list:[{executionId:'exec',eventId:'event',eventTitle:'活动',runId:'run',organizationId:'school',status:'STARTED',runtimeBindingRef:'current',resourceKey:'library-scale:one',title:'当前任务',runStatus:'PUBLISHED'}]}
  if(path==='/composite-attempts/current')return {id:'current',status:'IN_PROGRESS',currentItem:{id:'unit',type:'SCALE',definitionHash:'hash'}}
  throw Error('Unexpected transport '+path)
 })
 render(<HuiteacherMyScaleTasks api={api as EducationReportApi}/>)
 fireEvent.click(await screen.findByRole('button',{name:'进入本人自评'}));await screen.findByText('Transport scope probe')
 await waitFor(()=>expect(captured.transport).toBeDefined())
 const count=api.mock.calls.length
 const prefix='/api/composite-assessments/attempts/current/items/unit/scale/'
 for(const path of [prefix.replace('/current/','/other/')+'assets/image/content',prefix.replace('/unit/','/other/')+'assets/image/content',prefix+'assets/%2E%2E/content',prefix+'assets/a%2Fb/content',prefix+'assets/%69mage/content',prefix+'assets/image/content?scope=other']){
  await expect(captured.transport!.loadImage(path)).rejects.toThrow(/视觉内容/)
 }
 for(const path of [prefix.replace('/current/','/other/')+'items/q/video-capability',prefix+'items/../video-capability',prefix+'items/a%2Fb/video-capability']){
  await expect(captured.transport!.loadVideoCapability(path)).rejects.toThrow(/视觉内容/)
 }
 expect(api).toHaveBeenCalledTimes(count)
})
