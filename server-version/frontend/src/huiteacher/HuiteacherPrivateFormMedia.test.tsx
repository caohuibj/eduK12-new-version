import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import {HuiteacherMyPrivateFormTasks} from './HuiteacherMyPrivateFormTasks'
import type {PrivateToolApi} from '../components/education-tools/privateToolClient'
const captured=vi.hoisted(()=>({transport:null as null|{loadImage:(path:string)=>Promise<Blob>;loadVideoCapability:(path:string)=>Promise<unknown>}}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:({mediaTransport}:any)=>{captured.transport=mediaTransport;return <p>Frozen form ready</p>}}))
afterEach(()=>{cleanup();captured.transport=null;vi.restoreAllMocks()})
const task={executionId:'execution',runId:'run',organizationId:'school',eventId:'event',eventTitle:'Activity',formTitle:'Private',status:'STARTED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'attempt'}
const state={id:'attempt',status:'IN_PROGRESS',attemptEpoch:1,items:[{id:'field',type:'FORM'}],units:[{id:'section',type:'FORM_SECTION',formSectionId:'section'}],currentItem:{id:'section',type:'FORM_SECTION',formSectionId:'section',definitionHash:'frozen'}}
it('binds materials to current teacher attempt and section and rejects stale actor/attempt paths before requesting',async()=>{
 const blob=new Blob(['%PDF-1.4'],{type:'application/pdf'})
 const api=vi.fn(async(path:string)=>path==='/my-private-form-tasks'?{list:[task]}:path.endsWith('/content')?blob:state)
 const view=render(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="actor"/>)
 fireEvent.click(await screen.findByRole('button',{name:'打开本人表单'}));await screen.findByText('Frozen form ready')
 const old=captured.transport!,prefix='/api/composite-assessments/attempts/attempt/form-sections/section/'
 expect(await old.loadImage(prefix+'assets/pdf/content')).toBe(blob)
 expect(api).toHaveBeenCalledWith('/private-form-composite-attempts/attempt/form-sections/section/assets/pdf/content','GET',undefined,{responseType:'blob'})
 for(const path of [prefix.replace('/attempt/','/other/')+'assets/pdf/content',prefix+'assets/%2Fescape/content',prefix+'assets/pdf/content?token=x'])await expect(old.loadImage(path)).rejects.toThrow()
 await expect(old.loadVideoCapability(prefix+'items/field/options/0/video-capability')).rejects.toThrow('不支持')
 view.rerender(<HuiteacherMyPrivateFormTasks api={api as PrivateToolApi} actorKey="other"/>)
 await expect(old.loadImage(prefix+'assets/pdf/content')).rejects.toThrow('切换')
 expect(api.mock.calls.every(([path])=>!path.includes('/training-workspace/'))).toBe(true)
})
