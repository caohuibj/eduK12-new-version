import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import {MemoryRouter} from 'react-router-dom'
import AdminToolLicenses from './AdminToolLicenses'
const client=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}))
vi.mock('../api/client',()=>({default:client}))
const base='/admin/permissions/tool-licenses'
const scale={key:'standard:fixture',name:'AUDIT 合成量表',family:'SCALE'}
const form={key:'form:fixture',name:'AUDIT 合成表单',family:'FORM'}
const subject={id:'school-1',label:'AUDIT 合成学校',description:'独立合成对象'}
const row={id:'license-old',product:'SCHOOL',subjectId:subject.id,subjectType:'ORGANIZATION',subjectLabel:subject.label,
 startsAt:'2027-01-01T00:00:00Z',expiresAt:'2028-01-31T10:30:35Z',revision:4,status:'ACTIVE',reason:'原始合成许可',tools:[{...scale,limit:10,used:3}]}
const renderLicenses=()=>render(<MemoryRouter><AdminToolLicenses actorId="system"/></MemoryRouter>)
let records:typeof row[]=[]
function reply<T>(data:T){return {code:0,data}}
function issueReceipt(body:any){return {...body,id:body.requestId,subjectLabel:subject.label,subjectType:'ORGANIZATION',status:'SCHEDULED',revision:1,tools:body.tools.map((tool:any)=>({...tool,...(tool.key===scale.key?scale:form),used:0}))}}
function read(path:string){
 const url=new URL(path,'http://local.test')
 if(url.pathname.endsWith('/current-tools'))return reply({list:[scale,form,{key:'FORM:all',family:'FORM',name:'其他页表单'}]})
 if(url.pathname.endsWith('/subjects'))return reply({list:[subject],hasMore:false})
 if(url.pathname.endsWith('/tools'))return reply({list:[scale,form],hasMore:false})
 if(url.pathname===base)return reply({list:records,hasMore:false,enforcedProducts:[]})
 if(url.pathname===base+'/'+row.id)return reply(row)
 if(url.pathname===base+'/'+row.id+'/termination-impact')return reply({...records[0],meteredPublications:2,outstandingReservations:1})
 throw new Error('Unexpected read '+path)
}
it('queries status and type on the server and adds tools outside the current catalog page',async()=>{
 renderLicenses()
 await screen.findByRole('checkbox',{name:scale.name+' 量表'})
 fireEvent.change(screen.getByLabelText('许可状态'),{target:{value:'EXPIRING'}})
 fireEvent.change(screen.getByLabelText('许可工具类型'),{target:{value:'FORM'}})
 await waitFor(()=>expect(client.get).toHaveBeenCalledWith(base+'?product=SCHOOL&page=1&status=EXPIRING&family=FORM'))
 fireEvent.click(screen.getByRole('button',{name:'加入本入口全部可授权工具'}))
 expect(await screen.findByLabelText('额度 · 其他页表单')).toBeVisible()
 expect(client.get).toHaveBeenCalledWith(base+'/current-tools?product=SCHOOL')
 expect(client.post).not.toHaveBeenCalled()
})
async function choose(){
 fireEvent.click(await screen.findByRole('button',{name:'选择 '+subject.label}))
 fireEvent.click(screen.getByRole('checkbox',{name:scale.name+' 量表'}))
 fireEvent.change(screen.getByLabelText('生效时间（本地时间）'),{target:{value:'2027-01-31T10:30'}})
 fireEvent.click(screen.getByRole('button',{name:'半年'}))
 fireEvent.change(screen.getByLabelText('本次授权原因'),{target:{value:'本轮合成许可'}})
}
function expandRecord(){
 const list=screen.getByRole('region',{name:'工具许可列表'})
 const summary=within(list).getByText(subject.label,{selector:'strong'}).closest('summary')!
 fireEvent.click(summary)
 return within(list)
}
beforeEach(()=>{
 vi.resetAllMocks();sessionStorage.clear();records=[]
 vi.spyOn(window,'confirm').mockReturnValue(false)
 client.get.mockImplementation(async(path:string)=>read(path))
 client.post.mockImplementation(async(_path:string,body:unknown)=>reply(issueReceipt(body)))
})
it.each(['SCHOOL','TEACHER','TRAINING','SURVEY'])('scopes %s objects, tools and records independently and shows the pilot runtime boundary',async product=>{
 renderLicenses()
 await screen.findByRole('button',{name:'选择 '+subject.label})
 if(product!=='SCHOOL')fireEvent.change(screen.getByLabelText('产品入口'),{target:{value:product}})
 await waitFor(()=>expect(client.get.mock.calls.filter(([path])=>new URL(path,'http://local.test').searchParams.get('product')===product)).toHaveLength(3))
 expect(screen.getByText(/当前入口尚未启用工具许可发布校验试点/)).toBeVisible()
 expect(screen.getByText(product==='SCHOOL'||product==='TEACHER'?/按作答人数上限预留额度/:/额度按成功发布计次/)).toHaveTextContent('受测作答不另查商业许可')
 expect(client.post).not.toHaveBeenCalled();expect(client.put).not.toHaveBeenCalled()
})
it('keeps multi-page tool choices, validates optional quotas and requires confirmation before exact signing',async()=>{
 client.get.mockImplementation(async(path:string)=>{
  const url=new URL(path,'http://local.test')
  if(url.pathname.endsWith('/tools'))return reply({list:url.searchParams.get('page')==='2'?[form]:[scale],hasMore:url.searchParams.get('page')!=='2'})
  return read(path)
 })
 renderLicenses();await choose()
 expect(screen.getByLabelText('到期时间（本地时间）')).toHaveValue('2027-07-31T10:30')
 fireEvent.click(screen.getByRole('button',{name:'下一页工具'}))
 fireEvent.click(await screen.findByRole('checkbox',{name:form.name+' 表单'}))
 fireEvent.change(screen.getByLabelText('额度 · '+scale.name),{target:{value:'-1'}})
 fireEvent.click(screen.getByRole('button',{name:'确认签发工具许可'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('额度须为 1 至 2147483647 的整数')
 expect(client.post).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('额度 · '+scale.name),{target:{value:'12'}})
 fireEvent.click(screen.getByRole('button',{name:'确认签发工具许可'}))
 await waitFor(()=>expect(window.confirm).toHaveBeenCalled());expect(client.post).not.toHaveBeenCalled()
 vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'确认签发工具许可'}))
 await waitFor(()=>expect(client.post).toHaveBeenCalledTimes(1))
 expect(client.post).toHaveBeenCalledWith(base,expect.objectContaining({product:'SCHOOL',subjectId:subject.id,reason:'本轮合成许可',
  startsAt:new Date('2027-01-31T10:30').toISOString(),expiresAt:new Date('2027-07-31T10:30').toISOString(),tools:[{key:scale.key,limit:12},{key:form.key,limit:null}]}))
 expect(await screen.findByRole('region',{name:'工具许可回执'})).toHaveTextContent(subject.label)
})
it('uses calendar half-years and years, clamps leap-day expiry and leaves expiry editable',async()=>{
 renderLicenses()
 fireEvent.change(screen.getByLabelText('生效时间（本地时间）'),{target:{value:'2028-02-29T15:45'}})
 fireEvent.click(screen.getByRole('button',{name:'一年'}))
 expect(screen.getByLabelText('到期时间（本地时间）')).toHaveValue('2029-02-28T15:45')
 fireEvent.change(screen.getByLabelText('生效时间（本地时间）'),{target:{value:'2027-08-31T15:45'}})
 fireEvent.click(screen.getByRole('button',{name:'半年'}))
 expect(screen.getByLabelText('到期时间（本地时间）')).toHaveValue('2028-02-29T15:45')
 fireEvent.change(screen.getByLabelText('到期时间（本地时间）'),{target:{value:'2028-03-03T12:00'}})
 expect(screen.getByLabelText('到期时间（本地时间）')).toHaveValue('2028-03-03T12:00')
 expect(client.post).not.toHaveBeenCalled()
})
it('creates a separate non-overlapping renewal with the old tool limits and no carried usage',async()=>{
 records=[row];renderLicenses()
 await within(screen.getByRole('region',{name:'工具许可列表'})).findByText(subject.label,{selector:'strong'})
 const list=expandRecord();fireEvent.click(list.getByRole('button',{name:'续期'}))
 const from=screen.getByLabelText('生效时间（本地时间）') as HTMLInputElement
 expect(Date.parse(from.value)).toBeGreaterThanOrEqual(Date.parse(row.expiresAt))
 expect(screen.getByLabelText('额度 · '+scale.name)).toHaveValue(10)
 fireEvent.change(screen.getByLabelText('本次授权原因'),{target:{value:'续签新一期'}})
 vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'确认签发工具许可'}))
 await waitFor(()=>expect(client.post).toHaveBeenCalledTimes(1))
 expect(client.post).toHaveBeenCalledWith(base,expect.objectContaining({subjectId:row.subjectId,tools:[{key:scale.key,limit:10}],reason:'续签新一期'}))
 expect(client.put).not.toHaveBeenCalled()
 expect(client.post.mock.calls[0][1].requestId).not.toBe(row.id)
})
it('retains an unknown issue as the same request, locks edits and reconciles by its exact ID after remount',async()=>{
 client.post.mockRejectedValueOnce(new Error('连接已中断'))
 const view=renderLicenses();await choose();vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'确认签发工具许可'}))
 expect(await screen.findByRole('region',{name:'待核对工具授权'})).toBeVisible()
 const intent=client.post.mock.calls[0][1]
 expect(screen.getByLabelText('产品入口')).toBeDisabled();expect(screen.getByLabelText('本次授权原因')).toBeDisabled()
 view.unmount()
 client.get.mockImplementation(async(path:string)=>path===base+'/'+intent.requestId?reply(issueReceipt(intent)):read(path))
 renderLicenses()
 fireEvent.click(screen.getByRole('button',{name:'读取授权结果'}))
 expect(await screen.findByRole('region',{name:'工具许可回执'})).toHaveTextContent(subject.label)
 expect(client.get).toHaveBeenCalledWith(base+'/'+intent.requestId)
 expect(client.post).toHaveBeenCalledTimes(1)
 expect(sessionStorage.getItem('admin-tool-license-issue:system:SCHOOL')).toBeNull()
})
it('retries only the identical unknown issue rather than generating another request ID',async()=>{
 client.post.mockRejectedValueOnce(new Error('连接已中断'))
 renderLicenses();await choose();vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'确认签发工具许可'}))
 await screen.findByRole('region',{name:'待核对工具授权'})
 const intent=client.post.mock.calls[0][1]
 await waitFor(()=>expect(screen.getByRole('button',{name:'重试同一签发'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'重试同一签发'}))
 await waitFor(()=>expect(client.post).toHaveBeenCalledTimes(2))
 expect(client.post.mock.calls[1]).toEqual([base,intent])
 await screen.findByRole('region',{name:'工具许可回执'})
})
it('preserves the revision and used-count floor when adjusting and terminating a license',async()=>{
 records=[row]
 client.put.mockImplementation(async(_path:string,body:any)=>{
  records=[{...row,revision:5,reason:body.reason,tools:body.tools.map((tool:any)=>({...scale,...tool,used:3}))}]
  return reply(records[0])
 })
 client.post.mockImplementation(async(path:string,body:any)=>{
  if(path===base+'/'+row.id+'/terminate'){records=[{...records[0],revision:6,status:'TERMINATED',reason:body.reason}];return reply(records[0])}
  throw Error('Unexpected post '+path)
 })
 renderLicenses();await within(screen.getByRole('region',{name:'工具许可列表'})).findByText(subject.label,{selector:'strong'})
 const list=expandRecord();fireEvent.click(list.getByRole('button',{name:'调整工具与额度'}))
 expect(screen.getByLabelText('生效时间（本地时间）')).toBeDisabled()
 fireEvent.change(screen.getByLabelText('额度 · '+scale.name),{target:{value:'2'}})
 fireEvent.change(screen.getByLabelText('本次授权原因'),{target:{value:'调整合成额度'}})
 fireEvent.click(screen.getByRole('button',{name:'保存工具范围与额度'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('不能低于已用 3 次');expect(client.put).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('额度 · '+scale.name),{target:{value:'8'}})
 vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'保存工具范围与额度'}))
 await waitFor(()=>expect(client.put).toHaveBeenCalledWith(base+'/'+row.id,{expectedRevision:4,reason:'调整合成额度',tools:[{key:scale.key,limit:8}]}))
 await screen.findByText('工具范围和额度已调整，已用次数保留。')
 await waitFor(()=>expect(within(screen.getByRole('region',{name:'工具许可列表'})).getByText(/总量 8 次/)).toBeInTheDocument())
 const region=screen.getByRole('region',{name:'工具许可列表'});within(region).getByText(subject.label,{selector:'strong'}).closest('details')!.open=true
 fireEvent.change(screen.getByLabelText('本次授权原因'),{target:{value:'终止合成许可'}})
 fireEvent.click(within(region).getByRole('button',{name:'提前终止'}))
 await waitFor(()=>expect(client.post).toHaveBeenCalledWith(base+'/'+row.id+'/terminate',{expectedRevision:5,reason:'终止合成许可'}))
 expect(await screen.findByText('工具许可已终止，历史记录保留。')).toBeVisible()
})
it('does not reuse stale subjects or errors after changing the product',async()=>{
 let finish!:(value:unknown)=>void
 const delayed=new Promise(resolve=>{finish=resolve})
 client.get.mockImplementation((path:string)=>{
  const url=new URL(path,'http://local.test')
  if(url.pathname.endsWith('/subjects')&&url.searchParams.get('product')==='SCHOOL')return delayed
  if(url.pathname.endsWith('/subjects'))return Promise.resolve(reply({list:[{id:'other-school',label:'Teacher 独立学校'}],hasMore:false}))
  return Promise.resolve(read(path))
 })
 renderLicenses()
 fireEvent.change(screen.getByLabelText('产品入口'),{target:{value:'TEACHER'}})
 expect(await screen.findByRole('button',{name:'选择 Teacher 独立学校'})).toBeVisible()
 await act(async()=>{finish(reply({list:[subject],hasMore:false}));await delayed})
 expect(screen.queryByRole('button',{name:'选择 '+subject.label})).not.toBeInTheDocument()
 expect(client.post).not.toHaveBeenCalled()
})

it('rejects zero and out-of-range quotas before any signing request',async()=>{
 renderLicenses();await choose();vi.mocked(window.confirm).mockReturnValue(true)
 for(const value of ['0','2147483648']){
  fireEvent.change(screen.getByLabelText('额度 · '+scale.name),{target:{value}})
  fireEvent.click(screen.getByRole('button',{name:'确认签发工具许可'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('额度须为 1 至 2147483647 的整数')
  expect(client.post).not.toHaveBeenCalled()
 }
})
it('reads back an unknown scope adjustment without automatically resending it',async()=>{
 records=[row];client.put.mockRejectedValueOnce(new Error('调整回执丢失'))
 renderLicenses()
 await within(screen.getByRole('region',{name:'工具许可列表'})).findByText(subject.label,{selector:'strong'})
 fireEvent.click(expandRecord().getByRole('button',{name:'调整工具与额度'}))
 fireEvent.change(screen.getByLabelText('额度 · '+scale.name),{target:{value:'8'}})
 fireEvent.change(screen.getByLabelText('本次授权原因'),{target:{value:'合成调整核对'}})
 vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'保存工具范围与额度'}))
 const pending=await screen.findByRole('region',{name:'待核对工具授权'})
 expect(pending).toHaveTextContent('不自动重复调整或终止')
 await waitFor(()=>expect(within(pending).getByRole('button',{name:'读取授权结果'})).toBeEnabled())
 fireEvent.click(within(pending).getByRole('button',{name:'读取授权结果'}))
 expect(await screen.findByText('已读取当前授权状态；不认定此前请求由谁完成。请按回读结果重新选择操作。')).toBeVisible()
 expect(client.get).toHaveBeenCalledWith(base+'/'+row.id)
 expect(client.put).toHaveBeenCalledTimes(1)
 expect(client.post).not.toHaveBeenCalled()
})

it('lets the operator finish an unknown issue against a later changed record only after explicit confirmation',async()=>{
 client.post.mockRejectedValueOnce(new Error('连接已中断'))
 renderLicenses();await choose();vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'确认签发工具许可'}))
 const pending=await screen.findByRole('region',{name:'待核对工具授权'})
 const intent=client.post.mock.calls[0][1]
 client.get.mockImplementation(async(path:string)=>path===base+'/'+intent.requestId?reply({...issueReceipt(intent),reason:'另一位管理员调整的原因',revision:2,tools:[{...scale,limit:8,used:0}]}):read(path))
 await waitFor(()=>expect(within(pending).getByRole('button',{name:'读取授权结果'})).toBeEnabled())
 vi.mocked(window.confirm).mockReturnValue(false)
 fireEvent.click(within(pending).getByRole('button',{name:'读取授权结果'}))
 await screen.findByText('已展示当前回读记录，原签发请求继续保留待核对。')
 expect(screen.getByRole('region',{name:'待核对工具授权'})).toBeVisible()
 vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(within(pending).getByRole('button',{name:'读取授权结果'}))
 expect(await screen.findByText('已按当前回读状态结束待核对，未重复签发。')).toBeVisible()
 expect(screen.queryByRole('region',{name:'待核对工具授权'})).not.toBeInTheDocument()
 expect(client.post).toHaveBeenCalledTimes(1)
 expect(sessionStorage.getItem('admin-tool-license-issue:system:SCHOOL')).toBeNull()
})

const secondSubject={id:'school-2',label:'AUDIT 合成乙校'}
const otherPageTool={key:'FORM:cross-page',family:'FORM',name:'跨页匹配的表单'}
const batchDigest='a'.repeat(64)
function mockBatch(conflicts:Array<{subjectId:string;label:string;reason:string}>=[]){
 const tagApi='/admin/tool-catalog-tags'
 client.get.mockImplementation(async(path:string)=>{
  const url=new URL(path,'http://local.test')
  if(url.pathname===base+'/subjects')return reply({list:[subject,secondSubject],hasMore:false})
  if(url.pathname===tagApi+'/labels')return reply({availableTags:['学期重点']})
  if(url.pathname===tagApi)return reply({list:[scale],hasMore:true})
  if(url.pathname===tagApi+'/matches')return reply({list:[scale,otherPageTool]})
  return read(path)
 })
 client.post.mockImplementation(async(path:string,body:any)=>{
  const tools=body.tools.map((tool:{key:string;limit:number|null})=>({
   ...(tool.key===scale.key?scale:otherPageTool),limit:tool.limit,
  }))
  if(path===base+'/batches/preview')return reply({...body,subjects:[subject,secondSubject],tools,previewDigest:batchDigest,conflicts})
  if(path===base+'/batches')return reply({requestId:body.requestId,licenses:[subject,secondSubject].map((item,index)=>({
   id:'receipt-'+index,product:body.product,startsAt:body.startsAt,expiresAt:body.expiresAt,
   subjectId:item.id,subjectLabel:item.label,tools,
  }))})
  throw new Error('Unexpected write '+path)
 })
}
async function previewBatch(){
 renderLicenses()
 fireEvent.click(screen.getByRole('checkbox',{name:'批量签发给多个学校'}))
 fireEvent.click(await screen.findByRole('button',{name:'选择 '+subject.label}))
 fireEvent.click(screen.getByRole('button',{name:'选择 '+secondSubject.label}))
 const tags=screen.getByText('按标签筛选工具').closest('details')!
 tags.open=true;fireEvent(tags,new Event('toggle'))
 await screen.findByRole('option',{name:'学期重点'})
 fireEvent.change(screen.getByRole('combobox',{name:'工具标签'}),{target:{value:'学期重点'}})
 fireEvent.click(screen.getByRole('button',{name:'加入该标签下全部可授权工具'}))
 await screen.findByLabelText('额度 · '+otherPageTool.name)
 fireEvent.change(screen.getByLabelText('额度 · '+scale.name),{target:{value:'12'}})
 fireEvent.change(screen.getByLabelText('生效时间（本地时间）'),{target:{value:'2027-01-31T10:30'}})
 fireEvent.click(screen.getByRole('button',{name:'半年'}))
 fireEvent.change(screen.getByLabelText('本次授权原因'),{target:{value:'批量合成验收'}})
 fireEvent.click(screen.getByRole('button',{name:'预览批量签发'}))
 return await screen.findByRole('region',{name:'批量签发预览'})
}
it('previews all named subjects and all tagged tools before issuing one atomic batch',async()=>{
 mockBatch()
 const preview=await previewBatch()
 expect(within(preview).getByText(subject.label)).toBeVisible()
 expect(within(preview).getByText(secondSubject.label)).toBeVisible()
 expect(within(preview).getByText(scale.name+' · 12 次')).toBeVisible()
 expect(within(preview).getByText(otherPageTool.name+' · 不限次数')).toBeVisible()
 expect(client.post).toHaveBeenCalledTimes(1)
 expect(client.get).toHaveBeenCalledWith('/admin/tool-catalog-tags/matches?product=SCHOOL&tag='+encodeURIComponent('学期重点'))
 fireEvent.click(within(preview).getByRole('button',{name:'确认批量签发 2 份许可'}))
 expect(await screen.findByRole('region',{name:'批量签发回执'})).toHaveTextContent('已签发 2 份许可')
 expect(client.post).toHaveBeenLastCalledWith(base+'/batches',expect.objectContaining({
  previewDigest:batchDigest,subjectIds:[subject.id,secondSubject.id],tools:[{key:scale.key,limit:12},{key:otherPageTool.key,limit:null}],
 }))
})
it('does not sign any recipient when the actual batch preview contains a conflict',async()=>{
 mockBatch([{subjectId:secondSubject.id,label:secondSubject.label,reason:'与现有许可重叠'}])
 const preview=await previewBatch()
 expect(within(preview).getByText('与现有许可重叠')).toBeVisible()
 expect(within(preview).getByRole('button',{name:'确认批量签发 2 份许可'})).toBeDisabled()
 expect(client.post).toHaveBeenCalledTimes(1)
 fireEvent.click(within(preview).getByRole('button',{name:'返回修改'}))
 expect(screen.getByRole('region',{name:'批量已选对象'})).toHaveTextContent(secondSubject.label)
})

it('retains the same confirmed request after a network interruption and an expired admin verification',async()=>{
 mockBatch()
 const defaultPost=client.post.getMockImplementation()!
 const preview=await previewBatch()
 client.post.mockRejectedValueOnce(new Error('签发连接中断'))
 fireEvent.click(within(preview).getByRole('button',{name:'确认批量签发 2 份许可'}))
 const pending=await screen.findByRole('region',{name:'待核对批量签发'})
 const submitted=client.post.mock.calls[client.post.mock.calls.length-1]?.[1]
 await screen.findByText(/原批次已保留/)
 client.post.mockRejectedValueOnce(Object.assign(new Error('操作验证已过期'),{status:403}))
 fireEvent.click(within(pending).getByRole('button',{name:'重试同一批次并核对结果'}))
 await screen.findByText(/操作验证已过期 原批次已保留/)
 fireEvent.click(within(pending).getByRole('button',{name:'重试同一批次并核对结果'}))
 await screen.findByRole('region',{name:'批量签发回执'})
 expect(client.post.getMockImplementation()).toBe(defaultPost)
 expect(client.post.mock.calls.slice(1).map(([, body])=>body)).toEqual([submitted,submitted,submitted])
 expect(sessionStorage.getItem('admin-tool-license-batch:system:SCHOOL')).toBeNull()
})
