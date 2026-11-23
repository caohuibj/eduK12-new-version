import {useCallback,useEffect,useRef,useState} from 'react'
import type {SchoolApi} from './SchoolRecovery'

type Directory={targets:Array<{userId:string;label:string}>;requests:Array<{
 id:string;targetLabel:string;requestedByLabel:string;reasonCode:string;expiresAt:string;canApprove:boolean
}>;truncated:boolean}
export function SchoolMfaReset(props:{api:SchoolApi;organizationId:string}){
 return <ResetSession key={props.organizationId} {...props}/>
}
function ResetSession({api,organizationId}:{api:SchoolApi;organizationId:string}){
 const [data,setData]=useState<Directory|null>(null),[target,setTarget]=useState('')
 const [reason,setReason]=useState('DEVICE_LOST'),[verified,setVerified]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const alive=useRef(true),epoch=useRef(0),lock=useRef(false)
 const base='/organizations/'+organizationId+'/mfa-resets'
 const load=useCallback(async(current:()=>boolean)=>{const result=await api<Directory>(base);if(current())setData(result)},[api,base])
 const run=useCallback(async(work:(current:()=>boolean)=>Promise<void>)=>{
  if(lock.current)return
  const token=epoch.current,current=()=>alive.current&&token===epoch.current
  lock.current=true;setBusy(true);setError('');setNotice('')
  try{await work(current)}catch(e){if(current())setError(e instanceof Error?e.message:'恢复请求未完成，请刷新核对。')}
  finally{if(current()){lock.current=false;setBusy(false)}}
 },[])
 useEffect(()=>{
  alive.current=true;lock.current=false;void run(load)
  return()=>{alive.current=false;epoch.current++;lock.current=false}
 },[run,load])
 return <section className="hs-panel" aria-label="双管理员验证器恢复">
  <h2>双管理员验证器恢复</h2>
  <p>验证器丢失且无法使用恢复码时，由一名管理员核实并申请，再由另一名管理员独立批准。两人均需完成本页近期动态验证码验证。</p>
  <p>批准会撤销目标账号所有旧会话和恢复码；本人重新登录后必须重新绑定验证器。多学校账号请联系平台处理。</p>
  <button type="button" disabled={busy} onClick={()=>void run(load)}>刷新验证器恢复请求</button>
  {error&&<p role="alert">{error} 请先完成上方二次验证，再刷新本区域。</p>}
  {notice&&<p role="status">{notice}</p>}
  {busy&&<p role="status">正在核对验证器恢复…</p>}
  {data&&<>
   <form onSubmit={event=>{event.preventDefault();void run(async current=>{
    if(!verified||!target)return
    const label=data.targets.find(row=>row.userId===target)?.label
    if(!window.confirm('为 '+label+' 申请验证器重置？仍需另一名管理员独立批准。'))return
    await api(base,'POST',{targetUserId:target,reasonCode:reason})
    if(!current())return
    setTarget('');setVerified(false);await load(current)
    if(current())setNotice('已登记申请，请另一名管理员登录本人账号核实并批准。')
   })}}>
    <label className="hs-field"><span>需要恢复验证器的校园账号</span><select value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}>
     <option value="">选择经独立核实的账号</option>{data.targets.map(row=><option key={row.userId} value={row.userId}>{row.label}</option>)}
    </select></label>
    <label className="hs-field"><span>验证器恢复事由</span><select value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}><option value="DEVICE_LOST">验证器设备丢失</option><option value="SECURITY_INCIDENT">账号安全事件</option></select></label>
    <label><input type="checkbox" checked={verified} disabled={busy} onChange={e=>setVerified(e.target.checked)}/>已通过独立渠道核实账号本人及恢复事由</label>
    <button disabled={busy||!target||!verified}>申请验证器重置</button>
   </form>
   <h3>等待独立审批的申请</h3>
   {!data.requests.length&&<p>当前没有待审批的恢复申请。</p>}
   {data.requests.map(row=><article className="hs-task-card" key={row.id}>
    <h4>{row.targetLabel}</h4><p>申请人：{row.requestedByLabel} · {row.reasonCode==='DEVICE_LOST'?'设备丢失':'账号安全事件'} · 有效至 {new Date(row.expiresAt).toLocaleString()}</p>
    {row.canApprove?<button disabled={busy} onClick={()=>void run(async current=>{
     if(!window.confirm('独立核实后批准 '+row.targetLabel+' 的验证器重置？其旧会话和恢复码将立即失效。'))return
     await api(base+'/'+row.id+'/approve','POST',{})
     await load(current);if(current())setNotice('验证器重置已批准，目标账号须重新登录并绑定验证器。')
    })}>独立核实并批准重置</button>:<p>这是你发起的申请，必须由另一名管理员审批。</p>}
   </article>)}
   {data.truncated&&<p>当前只显示前100项；更多事项请联系平台协助核对。</p>}
  </>}
 </section>
}
