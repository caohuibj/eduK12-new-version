import {readFileSync} from 'node:fs'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import HuiteacherApp from './HuiteacherApp'
import {finalDraftStore} from '../services/persistence/finalDraftStore'
vi.mock('./HuiteacherPersonalSelf',()=>({HuiteacherPersonalSelf:()=>null}))
vi.mock('./HuiteacherMyFormTasks',()=>({HuiteacherMyFormTasks:()=>null}))
vi.mock('./HuiteacherMyScaleTasks',()=>({HuiteacherMyScaleTasks:()=>null}))
vi.mock('./HuiteacherClassRelationships',()=>({HuiteacherClassRelationships:()=>null}))
const reply=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,data})})
const draftKey='composite-form-section:private-form-attempt:section'
function state(completed=false){
 const answers=[{id:'field',formItemId:'field',type:'text_input',label:'任教学科',placeholder:null,options:null,required:true,contextKey:null,value:null}]
 const section={id:'section',title:'教师信息',description:null,position:0,contextSection:false,definitionHash:'fixed-definition-hash',status:completed?'COMPLETED':'IN_PROGRESS',submittedAt:null,items:answers,answers}
 return {id:'private-form-attempt',assessmentId:'assessment',name:'教师私有表单',instruction:null,status:completed?'COMPLETED':'IN_PROGRESS',progress:completed?100:0,completedItems:completed?1:0,totalItems:1,currentIndex:completed?1:0,startedAt:'2026-10-22T00:00:00Z',lastSavedAt:'2026-10-22T00:00:00Z',completedAt:completed?'2026-10-22T01:00:00Z':null,anonymousCode:null,deliveryMode:'FINAL_ONLY',attemptEpoch:3,contextSnapshotHash:null,
  items:[{id:'field',type:'FORM',position:0,label:'任教学科',completed,index:0}],units:[{id:'section',type:'FORM_SECTION',formSectionId:'section',position:0,required:true,label:'教师信息',completed,index:0}],formSections:[section],
  currentItem:completed?null:{id:section.id,type:'FORM_SECTION',position:0,required:true,formSectionId:section.id,title:section.title,description:section.description,contextSection:section.contextSection,definitionHash:section.definitionHash,status:section.status,answers:section.items}}
}

afterEach(async()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();await finalDraftStore.delete(draftKey);sessionStorage.clear()})
it('uses the real Teacher host and Final form section with CSRF, forwarding the durable sealed FINAL payload only to private-form endpoints',async()=>{
 await finalDraftStore.delete(draftKey)
 vi.stubGlobal('scrollTo',vi.fn());document.cookie='huiteacher_csrf=; Max-Age=0; path=/'
 const prefix='/api/huiteacher';let saved=false
 const finalReads:((data:unknown)=>void)[]=[]
 const fetch=vi.fn(async(url:string,options?:RequestInit)=>{
  if(url===prefix+'/auth/me')return reply({id:'teacher',username:'教师',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:'school',organizationName:'学校',productAdmin:false}]})
  if(url===prefix+'/auth/csrf')return reply({csrfToken:'private-form-csrf'})
  if(url===prefix+'/my-private-form-tasks')return reply({list:[{executionId:'execution',runId:'run',organizationId:'school',eventId:'event',eventTitle:'教师活动',formTitle:'本人表单',status:saved?'COMPLETED':'ASSIGNED',runStatus:'PUBLISHED',eventStatus:'OPEN',runtimeBindingKind:null,runtimeBindingRef:null}]})
  if(url===prefix+'/run-executions/execution/start-private-form')return reply({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'private-form-attempt'})
  if(url===prefix+'/private-form-composite-attempts/private-form-attempt'){
   if(!saved)return reply(state(false))
   return await new Promise<ReturnType<typeof reply>>(resolve=>finalReads.push(data=>resolve(reply(data))))
  }
  if(url===prefix+'/private-form-composite-attempts/private-form-attempt/form-sections/section/submit'){
   const persisted=await finalDraftStore.get(draftKey)
   expect(JSON.parse(String(options?.body))).toEqual(persisted?.sealedSubmission?.payload)
   saved=true;return reply({accepted:true})
  }
  if(options?.method==='POST')throw Error('Unexpected write '+url)
  return reply({list:[],canAuthor:false})
 })
 vi.stubGlobal('fetch',fetch);render(<HuiteacherApp/>)
 fireEvent.click(await screen.findByRole('button',{name:'打开本人表单'}))
 const input=await screen.findByRole('textbox',{name:/任教学科/})
 await waitFor(()=>expect(input).toBeEnabled())
 fireEvent.change(input,{target:{value:'数学'}})
 expect(await screen.findByText('已保存到本机。',{exact:true})).toHaveClass('assessment-local-save-status')
 const submit=screen.getByRole('button',{name:'提交整个区段'})
 await waitFor(()=>expect(submit).toBeEnabled());fireEvent.click(submit)
 await waitFor(()=>expect(saved).toBe(true))
 await waitFor(()=>expect(finalReads).toHaveLength(1))
 // Loading already exposes a return button: it is not a terminal signal.
 expect(screen.getByRole('button',{name:'返回任务列表'})).toBeInTheDocument()
 expect(screen.queryByText('本次表单已正式提交。',{exact:true})).not.toBeInTheDocument()
 finalReads[0]({...state(false),currentItem:null})
 await screen.findByText('正在确认完成状态，请刷新。')
 expect(screen.queryByText('本次表单已正式提交。',{exact:true})).not.toBeInTheDocument()
 const retry=screen.getByRole('button',{name:'重新读取当前表单'})
 await waitFor(()=>expect(retry).toBeEnabled());fireEvent.click(retry)
 await waitFor(()=>expect(finalReads).toHaveLength(2));finalReads[1](state(true))
 await screen.findByText('本次表单已正式提交。')
 const browser=readFileSync('../e2e/school-teacher-browser.cjs','utf8')
 expect(browser).toContain("const completedForm = p.locator('.ht-task').filter({ has: p.getByText('本次表单已正式提交。', { exact: true }) })")
 expect(browser).toContain("await completedForm.getByText('本次表单已正式提交。', { exact: true }).waitFor()")
 expect(browser).toContain("await completedForm.getByRole('button', { name: '返回任务列表', exact: true }).click()")
 expect(browser.indexOf("await completedForm.getByText('本次表单已正式提交。', { exact: true }).waitFor()")).toBeLessThan(browser.indexOf("await completedForm.getByRole('button', { name: '返回任务列表', exact: true }).click()"))
 const writes=fetch.mock.calls.filter(([,options])=>options?.method==='POST')
 expect(writes.map(([url])=>url)).toEqual([prefix+'/run-executions/execution/start-private-form',prefix+'/private-form-composite-attempts/private-form-attempt/form-sections/section/submit'])
 for(const [,options] of writes){expect(options?.credentials).toBe('same-origin');expect(new Headers(options?.headers).get('x-csrf-token')).toBe('private-form-csrf')}
 expect(JSON.parse(String(writes[1][1]?.body))).toEqual(expect.objectContaining({submissionId:expect.any(String),attemptEpoch:3,definitionHash:'fixed-definition-hash',contextSnapshotHash:null,answers:[{formItemId:'field',value:'数学'}]}))
 await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>url===prefix+'/my-private-form-tasks').length).toBeGreaterThan(1))
 expect(fetch.mock.calls.every(([url])=>url.startsWith(prefix+'/'))).toBe(true)
 await waitFor(async()=>expect(await finalDraftStore.get(draftKey)).toBeNull())
})

// This checks the real entry CSS contract, not computed browser contrast.
it('scopes local draft status and error colors to education dark appearance without changing cognitive surfaces',()=>{
 for(const [entry,prefix,muted] of [['school','hs','hs-muted'],['huiteacher','ht','ht-quiet']]){
  const css=readFileSync(`src/${entry}/${entry}-theme.css`,'utf8')
  const selector=`.${prefix}-app[data-theme=dark] .assessment-local-save-status`
  const guard=':not([data-cognitive-task-root],[data-cognitive-task-root] *)'
  expect(css).toContain(`${selector}[role=status]${guard}{color:var(--${muted})}`)
  expect(css).toContain(`${selector}[role=alert]${guard}{color:#ffbbaa}`)
 }
 const component=readFileSync('src/components/FinalCompositeAssessment.tsx','utf8')
 expect(component).toContain(`role={localSaveStatus.state === 'error' ? 'alert' : 'status'} className="assessment-local-save-status mb-4 text-sm"`)
})
