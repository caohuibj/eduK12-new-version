import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {webcrypto,randomUUID} from 'node:crypto'
import {EducationRosterJobImport} from './EducationRosterJobImport'
import {EducationRosterWorkbench} from './EducationRosterWorkbench'
import {parseJobInput,jobParts,rosterDigest,type RosterJob} from './job-client'
import type {EducationRosterApi} from './types'
const proof='a'.repeat(64),plan='b'.repeat(64),base='/organizations/org/roster-imports'
const text=(n=101)=>'工号,姓名\n'+Array.from({length:n},(_,i)=>'T'+String(i).padStart(5,'0')+',示例'+i).join('\n')
function server(){
 let job:RosterJob|null=null,failCommit:Error|undefined,writeBeforeFailure=false,gate:Promise<void>|undefined
 const clone=()=>JSON.parse(JSON.stringify(job)) as RosterJob
 const api=vi.fn(async(path:string,method?:string,body?:any):Promise<any>=>{
  if(path==='/auth/mfa/step-up')return {ok:true}
  if(path===base&&method!=='POST')return {list:job?[clone()]:[],next:null}
  if(path===base){job={id:'job',kind:body.input.kind,status:'PREVIEWING',rows:body.input.rows.length,partCount:Math.ceil(body.input.rows.length/100),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),expired:false,confirmed:false,planToken:plan,needsVerification:false,added:0,skipped:0,savedRows:0,parts:jobParts(body.input).map((p,i)=>({index:i,rows:p.rows.length,state:'PLANNED',add:0,skip:0,errors:0,issues:[],receipt:null}))};return {...clone(),proof}}
  if(path.endsWith('/match'))return {...clone(),proof}
  if(path.endsWith('/confirm')||path.endsWith('/resume')){job!.confirmed=true;job!.status='RUNNING';return {...clone(),runToken:'r'.repeat(32)}}
  if(path.endsWith('/pause')){job!.status='PAUSED';return clone()}
  if(path.endsWith('/recheck')){job!.confirmed=false;job!.status='PREVIEWING';job!.parts.forEach(p=>{if(p.state!=='COMMITTED')p.state='PLANNED'});return clone()}
  const part=path.match(/\/parts\/(\d+)\/(preview|commit)$/)
  if(part){const p=job!.parts[Number(part[1])];if(part[2]==='preview'){p.state='PREVIEWED';p.add=p.rows;if(job!.parts.every(p=>p.state==='PREVIEWED'))job!.status='READY';return clone()}
   if(gate)await gate
   if(failCommit&&!writeBeforeFailure)throw failCommit
   if(p.state!=='COMMITTED'){p.state='COMMITTED';p.receipt={batchId:'part-'+p.index,added:p.rows,skipped:0};job!.savedRows+=p.rows;job!.added+=p.rows;job!.status=job!.savedRows===job!.rows?'COMPLETED':'RUNNING'}
   if(failCommit)throw failCommit
   return clone()
  }
  return clone()
 })
 return {api,setFailure:(e?:Error,afterWrite=false)=>{failCommit=e;writeBeforeFailure=afterWrite},setGate:(p?:Promise<void>)=>{gate=p},job:()=>job!}
}
const renderImport=(s:ReturnType<typeof server>,extra={})=>render(<EducationRosterJobImport api={s.api as EducationRosterApi} organizationId="org" kind="STAFF" units={[]} {...extra}/>)
const button=(name:string)=>screen.getByRole('button',{name})
async function preview(n=101){fireEvent.change(screen.getByRole('textbox',{name:'粘贴名单（含表头）'}),{target:{value:text(n)}});fireEvent.click(button('整份校验预览'));await waitFor(()=>expect(button('确认保存全部批次')).toBeEnabled())}
const commits=(s:ReturnType<typeof server>)=>s.api.mock.calls.filter(c=>c[0].endsWith('/commit'))
describe('controlled whole-file import interaction',()=>{
 beforeEach(()=>{vi.stubGlobal('crypto',{subtle:webcrypto.subtle,randomUUID})})
 afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
 it('previews all 201 rows before any explicit write and saves ordered chunks of 100',async()=>{
  const s=server(),changed=vi.fn();renderImport(s,{onChanged:changed});await preview(201)
  expect(commits(s)).toHaveLength(0);expect(s.api.mock.calls.filter(c=>c[0].endsWith('/preview'))).toHaveLength(3)
  fireEvent.click(button('确认保存全部批次'));await screen.findByText(/已完成：新增 201 条/)
  expect(commits(s).map(c=>c[2].input.rows.length)).toEqual([100,100,1]);expect(changed).toHaveBeenCalledOnce()
 })
 it('stops after a lost response, explicitly reads receipt then skips the saved chunk',async()=>{
  const s=server();renderImport(s);await preview();s.setFailure(Error('网络响应中断'),true)
  fireEvent.click(button('确认保存全部批次'));await screen.findByText('网络响应中断');expect(commits(s)).toHaveLength(1);expect(button('继续保存剩余批次')).toBeDisabled()
  s.setFailure();fireEvent.click(button('核对服务器进度'));await screen.findByText(/服务器进度已核对/);expect(commits(s)).toHaveLength(1)
  fireEvent.click(button('继续保存剩余批次'));await screen.findByText(/已完成：新增 101 条/);expect(commits(s).map(c=>c[0])).toEqual([base+'/job/parts/0/commit',base+'/job/parts/1/commit'])
 })
 it('retains input on MFA expiry and verification never automatically replays a write',async()=>{
  const s=server();renderImport(s);await preview();s.setFailure(Error('敏感操作需要重新验证动态验证码'))
  fireEvent.click(button('确认保存全部批次'));const form=await screen.findByRole('form',{name:'导入身份验证'});expect(commits(s)).toHaveLength(1)
  fireEvent.change(within(form).getByLabelText('6位动态验证码'),{target:{value:'123456'}});fireEvent.click(within(form).getByRole('button',{name:'验证身份'}))
  await screen.findByText(/验证成功，文件和进度已保留/);expect(commits(s)).toHaveLength(1);expect(screen.getByRole('textbox',{name:'粘贴名单（含表头）'})).toHaveValue(text());expect(button('继续保存剩余批次')).toBeDisabled()
 })
 it('uses Retry-After and never auto-retries when the wait elapses',async()=>{
  const s=server();renderImport(s);await preview();s.setFailure(Object.assign(Error('请求过于频繁'),{status:429,retryAfterSeconds:1}))
  fireEvent.click(button('确认保存全部批次'));await screen.findByText(/触发原有频率保护/);expect(commits(s)).toHaveLength(1)
  await act(async()=>{await new Promise(r=>setTimeout(r,1100))});expect(commits(s)).toHaveLength(1);expect(button('继续保存剩余批次')).toBeDisabled()
 })
 it('pauses after the in-flight part and requires explicit resume',async()=>{
  const s=server();renderImport(s);await preview();let finish!:()=>void;s.setGate(new Promise<void>(yes=>{finish=yes}))
  fireEvent.click(button('确认保存全部批次'));await waitFor(()=>expect(commits(s)).toHaveLength(1));fireEvent.click(button('暂停'))
  s.setGate();await act(async()=>finish());await screen.findByText(/已暂停。当前批次已核对/);expect(commits(s)).toHaveLength(1)
  fireEvent.click(button('继续保存剩余批次'));await screen.findByText(/已完成：新增 101 条/);expect(commits(s)).toHaveLength(2)
 })
 it('never advances a late response into a different school',async()=>{
  const s=server(),view=renderImport(s);await preview();let finish!:()=>void;s.setGate(new Promise<void>(yes=>{finish=yes}))
  fireEvent.click(button('确认保存全部批次'));await waitFor(()=>expect(commits(s)).toHaveLength(1))
  view.rerender(<EducationRosterJobImport api={s.api as EducationRosterApi} organizationId="other" kind="STAFF" units={[]}/>);await act(async()=>finish())
  expect(commits(s)).toHaveLength(1);expect(screen.queryByRole('region',{name:'导入任务进度'})).toBeNull();expect(screen.getByRole('textbox',{name:'粘贴名单（含表头）'})).toHaveValue('')
 })
 it('releases a retired adapter without advancing its pending operation',async()=>{
  const s=server(),view=renderImport(s);await preview();let finish!:()=>void;s.setGate(new Promise<void>(yes=>{finish=yes}))
  fireEvent.click(button('确认保存全部批次'));await waitFor(()=>expect(commits(s)).toHaveLength(1));const next=vi.fn(async(...args:Parameters<typeof s.api>)=>s.api(...args)) as EducationRosterApi
  view.rerender(<EducationRosterJobImport api={next} organizationId="org" kind="STAFF" units={[]}/>);await act(async()=>finish());expect(commits(s)).toHaveLength(1);expect(button('核对服务器进度')).toBeEnabled()
 })
 it('shows history without a write and reselecting requires the original source',async()=>{
  const s=server();renderImport(s);await preview(2);fireEvent.click(screen.getByText('导入历史'));await screen.findByRole('button',{name:'选择续办'});expect(commits(s)).toHaveLength(0)
  fireEvent.click(button('选择续办'));expect(screen.getByRole('textbox',{name:'粘贴名单（含表头）'})).toHaveValue('');expect(button('确认保存全部批次')).toBeDisabled();expect(button('核对原文件并继续')).toBeDisabled()
 })
 it('keeps corrected text when explicitly starting a new preview',async()=>{
  const s=server();renderImport(s);await preview(1);fireEvent.change(screen.getByRole('textbox',{name:'粘贴名单（含表头）'}),{target:{value:text(3)}})
  expect(button('确认保存全部批次')).toBeDisabled();fireEvent.click(button('新建另一份导入'));expect(screen.getByRole('textbox',{name:'粘贴名单（含表头）'})).toHaveValue(text(3));expect(button('整份校验预览')).toBeEnabled();expect(commits(s)).toHaveLength(0)
 })
 it('does not replace an unfinished legacy draft when capability is refreshed',()=>{
  const props={api:vi.fn() as EducationRosterApi,organizationId:'org',units:[]};const view=render(<EducationRosterWorkbench {...props}/>);
  fireEvent.change(screen.getByRole('textbox',{name:/粘贴名单/}),{target:{value:'unfinished'}});view.rerender(<EducationRosterWorkbench {...props} batchImport/>);
  expect(screen.getByRole('textbox',{name:/粘贴名单/})).toHaveValue('unfinished');expect(button('解析并预览')).toBeInTheDocument()
 })
 it('normalizes a full 5000-row file while preserving textual leading zeroes and bounded chunks',async()=>{
  const input=parseJobInput('学号,年级,班级\n'+Array.from({length:5000},(_,i)=>`${String(i).padStart(5,'0')},一年级,一班`).join('\n'),'STUDENT','');expect(input.rows).toHaveLength(5000);expect('number'in input.rows[0]&&input.rows[0].number).toBe('00000');expect(jobParts(input)).toHaveLength(50)
  expect(()=>parseJobInput(text(5001),'STAFF','')).toThrow('5000');expect(await rosterDigest('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
 })
})
