import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
const http=vi.hoisted(()=>({send:vi.fn()}))
vi.mock('../../../api/client',()=>({sessionFetch:http.send}))
import { TrainingReportStudio } from '../TrainingReportStudio'
const grant='11111111-1111-4111-8111-111111111111'
const payload={measurementReleaseId:'m1',metricKeys:['effort'],audience:'researcher',language:'zh-CN',template:{title:'反馈',blocks:[{type:'TEXT',text:'内容'}],limitations:[]},assets:[]}
const draft={id:'d1',report_key:'report',version:'1',revision:0,state:'DRAFT',published_release_id:null,payload}
const NativeRequest=Request
beforeAll(()=>vi.stubGlobal('Request',class extends NativeRequest{constructor(input:RequestInfo|URL,init?:RequestInit){super(input,{...init,signal:undefined})}}))
afterEach(()=>{cleanup();http.send.mockReset();sessionStorage.clear()})
function fixture(disconnect=false){
 const writes:any[]=[]
 http.send.mockImplementation(async(path:string,init:any)=>{
  const url=new URL(path,'http://localhost'),method=init.method
  expect(url.searchParams.get('grantId')).toBe(grant)
  expect(url.pathname).toContain('/questionnaire-products/composite/content-reports/courses/course')
  let data:any
  if(url.pathname.endsWith('/measurements'))data=[{id:'m1',key:'effort',family:'SCALE',version:'1',status:'PUBLISHED',metrics:[{metricKey:'effort',unit:'points'}]}]
  else if(method==='POST'){const request=JSON.parse(init.body);writes.push(request);if(disconnect){disconnect=false;throw new Error('Unknown response')}data={...draft,id:request.requestId}}
  else if(url.pathname.endsWith('/d1'))data=draft
  else data=[{id:'d1',reportKey:'report',version:'1',state:'DRAFT'}]
  return {ok:true,json:async()=>({code:0,data})}
 })
 return writes
}
function mount(actor='actor'){
 const router=createMemoryRouter([{path:'/edit',element:<><Link to="/other">离开</Link><TrainingReportStudio actorId={actor} compositeId="composite" courses={[{id:'course',title:'已保存课程'},{id:'course2',title:'另一课程'}]}/></>},{path:'/other',element:<p>Other page</p>}],{initialEntries:['/edit']})
 render(<RouterProvider router={router}/>);return router
}
async function open(course?:string){if(course)fireEvent.change(screen.getByLabelText('已保存的投放课程'),{target:{value:course}});fireEvent.change(screen.getByLabelText('报告内容授权 ID'),{target:{value:grant}});fireEvent.click(screen.getByRole('button',{name:'打开课程报告'}));await screen.findByRole('button',{name:'report · 1 · 草稿'})}
describe('Training private report real editor',()=>{
 it('keeps the editor mounted while a request is busy',async()=>{
  let resolve!: (value:unknown)=>void
  http.send.mockImplementation(()=>new Promise(value=>{resolve=value}))
  const router=mount();fireEvent.change(screen.getByLabelText('报告内容授权 ID'),{target:{value:grant}});fireEvent.click(screen.getByRole('button',{name:'打开课程报告'}))
  await waitFor(()=>expect(http.send).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('link',{name:'离开'}));await screen.findByRole('button',{name:'继续编辑'})
  expect(router.state.location.pathname).toBe('/edit');expect(screen.queryByRole('button',{name:'放弃修改并离开'})).not.toBeInTheDocument()
  await act(async()=>resolve({ok:false,json:async()=>({code:-1,message:'权限拒绝'})}))
 })
 it('uses Training transport and exact saved course scope; native publish and participant audiences are absent; dirty navigation stays mounted',async()=>{
  fixture();const router=mount();await open()
  expect(screen.queryByRole('button',{name:'发布或更新原生测量'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'report · 1 · 草稿'}));await screen.findByLabelText('报告标题')
  expect(screen.queryByRole('option',{name:'学生'})).not.toBeInTheDocument();expect(screen.queryByRole('option',{name:'家长'})).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('报告标题'),{target:{value:'未保存'}})
  expect(screen.getByLabelText('已保存的投放课程')).toBeDisabled()
  fireEvent.click(screen.getByRole('link',{name:'离开'}));await screen.findByRole('button',{name:'继续编辑'})
  expect(router.state.location.pathname).toBe('/edit');fireEvent.click(screen.getByRole('button',{name:'继续编辑'}))
  expect(screen.getByLabelText('报告标题')).toHaveValue('未保存')
 })
 it('retains unknown create UUID across remount; pending blocks navigation and does not leak to another actor',async()=>{
  const writes=fixture(true),router=mount();await open()
  fireEvent.change(screen.getByLabelText('报告系列标识'),{target:{value:'new-report'}})
  fireEvent.click(screen.getByRole('button',{name:'创建报告草稿'}));await screen.findByRole('button',{name:'重试本次创建'})
  await act(async()=>{await router.navigate('/other')})
  expect(router.state.location.pathname).toBe('/edit');expect(screen.queryByRole('button',{name:'放弃修改并离开'})).not.toBeInTheDocument()
  const original=writes[0];cleanup();mount('another-actor');await open();expect(screen.queryByRole('button',{name:'重试本次创建'})).not.toBeInTheDocument()
  cleanup();mount();await open('course2');expect(screen.queryByRole('button',{name:'重试本次创建'})).not.toBeInTheDocument()
  cleanup();mount();await open();fireEvent.click(screen.getByRole('button',{name:'重试本次创建'}))
  await waitFor(()=>expect(writes).toHaveLength(2));expect(writes[1]).toEqual(original)
  await screen.findByText('报告草稿已创建，尚未发布。')
 })
})
