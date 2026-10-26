import {useEffect,useRef,useState} from 'react'
import {Search,RefreshCw} from 'lucide-react'
import type {SchoolApi} from './SchoolRecovery'
import {parsePersonnelImport,personnelTemplates,type PersonnelImportInput,type PersonnelKind} from './school-personnel-import'
import './school-personnel-import.css'

type Person={id:string;kind:string;number:string;name:string;persona:string;grade:string|null;className:string|null;activated:boolean;existingAccount:boolean}
type Preview={token:string;add:number;skip:number;errors:number;rows:{line:number;number:string;name:string;state:string;message:string}[]}
type Props={api:SchoolApi;organizationId:string;disabled?:boolean}
export function SchoolPersonnelImport(props:Props){return <PersonnelSession key={props.organizationId} {...props}/>}
function PersonnelSession({api,organizationId,disabled}:Props){
 const [open,setOpen]=useState(false),[kind,setKind]=useState<PersonnelKind>('STUDENT'),[text,setText]=useState('')
 const [preview,setPreview]=useState<Preview|null>(null),[input,setInput]=useState<PersonnelImportInput|null>(null)
 const [people,setPeople]=useState<Person[]>([]),[next,setNext]=useState<string|null>(null),[loaded,setLoaded]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[verified,setVerified]=useState(false)
 const [searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState(''),[sort,setSort]=useState('default')
 const [linkPerson,setLinkPerson]=useState<Person|null>(null),[linkUsername,setLinkUsername]=useState(''),[linkVerified,setLinkVerified]=useState(false)
 const [credential,setCredential]=useState<{person:Person;code:string;expiresAt:string}|null>(null)
 const alive=useRef(true),lock=useRef(false),readId=useRef(0),previewId=useRef(0),batchId=useRef(''),applied=useRef(false)
 const base=`/organizations/${organizationId}/personnel`
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const run=async(fn:()=>Promise<void>)=>{
  if(lock.current||disabled)return
  lock.current=true;setBusy(true);setError('');setNotice('')
  try{await fn()}catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'操作未完成，请核对后重试。')}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 const load=async(after?:string)=>{
  const result=await api<{list:Person[];next:string|null}>(base+(after?`?after=${encodeURIComponent(after)}`:''))
  if(alive.current){setPeople(old=>after?[...old,...result.list]:result.list);setNext(result.next);setLoaded(true)}
 }
 const replace=(value:string)=>{readId.current++;previewId.current++;setText(value);setPreview(null);setInput(null);setVerified(false);batchId.current='';applied.current=false;setError('');setNotice('')}
 const read=async(file:File|undefined)=>{
  if(!file)return
  const id=++readId.current;previewId.current++;setPreview(null);setInput(null);setText('');setError('')
  if(file.size>64000){setError('文件超过 64 KB，请拆分后导入。');return}
  await run(async()=>{const value=await file.text();if(alive.current&&readId.current===id)replace(value)})
 }
 const parse=()=>run(async()=>{
  const candidate=parsePersonnelImport(text,kind),id=++previewId.current
  setPreview(null);setInput(null)
  const result=await api<Preview>(base+'/preview','POST',candidate)
  if(alive.current&&id===previewId.current){setPreview(result);setInput(candidate);batchId.current=crypto.randomUUID();applied.current=false}
 })
 const confirm=()=>run(async()=>{
  if(!preview||!input||preview.errors||!preview.add||applied.current)return
  const result=await api<{added:number;skipped:number}>(base+'/import','POST',{input,previewToken:preview.token,batchId:batchId.current,verifiedOffline:verified})
  if(!alive.current)return
  // Preserve the batch ID on an uncertain response; explicit retry is idempotent.
  applied.current=true;setPreview(null);setInput(null);setText('');setVerified(false)
  setNotice(`已新增 ${result.added} 条，跳过 ${result.skipped} 条。账号由本人激活；学生仍需班级审批。`)
  try{await load()}catch{if(alive.current)setError('导入已完成，名单刷新失败。请点击刷新查看，勿重复新建批次。')}
 })
 const issue=(person:Person)=>run(async()=>{
  setCredential(null)
  const result=await api<{code:string;expiresAt:string}>(base+`/${person.id}/credential`,'POST',{})
  if(alive.current)setCredential({person,...result})
 })
 const filtered=people.filter(p=>!query.trim()||[p.number,p.name,p.grade,p.className].some(v=>v?.toLowerCase().includes(query.trim().toLowerCase())))
 if(sort==='number')filtered.sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}))
 if(sort==='pending')filtered.sort((a,b)=>Number(a.activated)-Number(b.activated))
 const needsVerification=!!input?.rows.some(r=>r.username)
 return <section className="hs-panel hs-admin-panel hs-personnel" aria-label="学生与教师名单导入">
  <div className="hs-personnel-toolbar"><h2>人员名单</h2><div className="hs-actions">
   <button type="button" disabled={busy||disabled} aria-expanded={open} onClick={()=>{setOpen(v=>!v);setCredential(null)}}>批量导入</button>
   <label><span className="hs-sr-only">名单排序（当前已加载人员）</span><select aria-label="名单排序（当前已加载人员）" value={sort} onChange={e=>setSort(e.target.value)}><option value="default">默认顺序</option><option value="number">按编号排序</option><option value="pending">待激活优先</option></select></label>
   <button type="button" aria-label="检索名单" aria-expanded={searchOpen} onClick={()=>setSearchOpen(v=>!v)}><Search size={18}/></button>
   <button type="button" aria-label="刷新人员名单" disabled={busy||disabled} onClick={()=>void run(()=>load())}><RefreshCw size={18}/></button>
  </div></div>
  {searchOpen&&<label className="hs-field"><span>检索当前已加载名单</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="编号、姓名或班级"/></label>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {open&&<div className="hs-personnel-import-body">
   <div className="hs-personnel-fields"><label className="hs-field"><span>导入类型</span><select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value as PersonnelKind);replace('')}}><option value="STUDENT">学生名单</option><option value="STAFF">教师名单</option><option value="ASSIGNMENT">教师任教关系</option></select></label>
    <label className="hs-field"><span>UTF-8 CSV／TSV 文件</span><input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" disabled={busy} onChange={e=>{void read(e.target.files?.[0]);e.target.value=''}}/></label></div>
   <details><summary>字段、权限与激活说明</summary><p>只新增，不覆盖、不删除。学生姓名选填；教师姓名必填。编号按文本处理，请保留前导零。年级、班级必须在当前学校唯一匹配。已有校园账号需先人工核实，再由账号本人登录确认。</p><p>学生名单仅支持未开放且无人注册的班级，已审批班级暂不支持补录。新增会更新待注册名册修订，并使该班旧的未使用激活码失效。导入后需单独发放与本人绑定的激活码、开启注册窗口，学生完成注册后仍须心理教师整班审批。</p><p>教师身份默认普通教师。心理教师身份不会自动取得专业权限。任教关系可为同一工号填写多个班级，待本人激活后生效；已有任教关系保留。不会授予学校管理、心理报告或个案关系权限。</p></details>
   <details><summary>查看并复制当前类型模板</summary><pre>{personnelTemplates[kind]}</pre><button type="button" disabled={busy} onClick={()=>void navigator.clipboard.writeText(personnelTemplates[kind]).then(()=>setNotice('模板已复制，请修改示例后再导入。')).catch(()=>setError('复制失败，请直接选中模板文本复制。'))}>复制模板</button></details>
   <label className="hs-field"><span>粘贴名单（含表头，每批最多 100 行）</span><textarea rows={5} value={text} disabled={busy} onChange={e=>replace(e.target.value)} placeholder={personnelTemplates[kind]}/></label>
   <button type="button" disabled={busy||disabled||!text.trim()} onClick={()=>void parse()}>解析并预览</button>
   {preview&&<div className="hs-personnel-preview"><p>待新增 {preview.add} · 已有跳过 {preview.skip} · 错误 {preview.errors}</p>
    <ol>{preview.rows.map((r,index)=><li key={index} data-state={r.state}><span>第 {r.line} 行</span><strong>{r.number}{r.name?' · '+r.name:''}</strong><span>{r.message}</span></li>)}</ol>
    {needsVerification&&<label className="hs-personnel-confirm"><input type="checkbox" checked={verified} disabled={busy} onChange={e=>setVerified(e.target.checked)}/>我已线下核实已有校园用户名确实属于对应本人；不修改其密码和权限。</label>}
    <button type="button" className="hs-primary" disabled={busy||disabled||preview.errors>0||!preview.add||(needsVerification&&!verified)} onClick={()=>void confirm()}>确认新增 {preview.add} 条</button>
   </div>}
  </div>}
  {linkPerson&&<form className="hs-personnel-import-body" onSubmit={e=>{e.preventDefault();void run(async()=>{
   await api(base+`/${linkPerson.id}/bind-existing`,'POST',{username:linkUsername.trim(),verifiedOffline:linkVerified})
   if(alive.current){setLinkPerson(null);setLinkUsername('');setLinkVerified(false);setCredential(null);setNotice('已记录核实结果，请重新发放激活码，交由本人登录原账号确认。');await load()}
  })}}><strong>为 {linkPerson.number} 核实已有账号</strong><label className="hs-field"><span>已有校园用户名</span><input value={linkUsername} disabled={busy} onChange={e=>setLinkUsername(e.target.value)} required autoComplete="off"/></label><label className="hs-personnel-confirm"><input type="checkbox" checked={linkVerified} disabled={busy} onChange={e=>setLinkVerified(e.target.checked)}/>我已线下核实该账号属于此人；不替本人激活，不修改其密码和权限。</label><div className="hs-actions"><button className="hs-primary" disabled={busy||!linkUsername.trim()||!linkVerified}>确认核实结果</button><button type="button" disabled={busy} onClick={()=>setLinkPerson(null)}>取消</button></div></form>}
  {credential&&<section className="hs-secret" aria-label="本次激活凭据"><div className="hs-personnel-toolbar"><strong>{credential.person.number} · 一次性激活码</strong><button type="button" onClick={()=>setCredential(null)}>关闭凭据</button></div><code>{credential.code}</code><p>有效至 {new Date(credential.expiresAt).toLocaleString()}，只在本次显示，请单独安全交付。重新发放后旧码失效。{credential.person.existingAccount?'本人登录原校园账号，在“我的账号 → 激活名单身份”中确认。':'本人通过登录页“使用注册码注册”设置用户名和密码。'}{credential.person.kind==='STUDENT'?'学生还需学校开放注册窗口及整班审批。':''}</p></section>}
  {!loaded?<p className="hs-personnel-empty">点击刷新查看已导入的待激活及已激活人员。</p>:<>
   <p className="hs-personnel-count">已加载 {people.length} 人{next?'（还有更多）':''}{query?` · 匹配 ${filtered.length} 人`:''}</p>
   <ul className="hs-personnel-list">{filtered.map(p=><li key={p.id}><div><strong>{p.name||p.number}</strong><span>{p.name?p.number+' · ':''}{p.kind==='STUDENT'?[p.grade,p.className].filter(Boolean).join(' / '):p.persona==='COUNSELOR'?'心理教师（权限单独授权）':'普通教师'}</span></div><span>{p.activated?'已激活':p.existingAccount?'待本人确认':'待激活'}</span>{!p.activated&&<div className="hs-actions">{!p.existingAccount&&<button type="button" disabled={busy||disabled} onClick={()=>{setLinkPerson(p);setLinkUsername('');setLinkVerified(false);setCredential(null)}}>核实已有账号</button>}<button type="button" disabled={busy||disabled} onClick={()=>void issue(p)}>发放激活码</button></div>}</li>)}</ul>
   {!filtered.length&&<p>没有匹配的人员。</p>}{next&&<button type="button" disabled={busy} onClick={()=>void run(()=>load(next))}>加载更多人员</button>}
  </>}
 </section>
}
export function SchoolPersonnelClaim({api,student,onComplete}:{api:SchoolApi;student:boolean;onComplete:()=>void}){
 const [code,setCode]=useState(''),[number,setNumber]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false)
 const lock=useRef(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const claim=async()=>{
  if(lock.current)return
  lock.current=true;setBusy(true);setError('')
  try{
   const entry=await api<{kind:string;organizationId?:string;classUnitId?:string}>('/registration/resolve','POST',{code:code.trim()})
   if(student){if(entry.kind!=='STUDENT')throw Error('该激活码不属于学生名单。');await api('/claim-existing-student','POST',{organizationId:entry.organizationId,classUnitId:entry.classUnitId,studentNumber:number.trim(),activationCode:code.trim()})}
   else{if(entry.kind!=='STAFF')throw Error('该激活码不属于教师名单。');await api('/personnel/claim-staff','POST',{inviteCode:code.trim()})}
   if(alive.current){setDone(true);setCode('');setNumber('');onComplete()}
  }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'激活未完成，请联系学校核实。')}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <section className="hs-panel hs-personnel-claim"><details><summary>激活名单身份（已有校园账号）</summary><p>仅确认学校已核实属于你的名单记录，保留当前用户名和密码。学生仍需班级审批。</p>{error&&<p role="alert">{error}</p>}{done?<p role="status">已由本人确认，继续使用原校园账号。</p>:<form onSubmit={e=>{e.preventDefault();void claim()}}><label className="hs-field"><span>学校发放的个人激活码</span><input value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" required disabled={busy}/></label>{student&&<label className="hs-field"><span>学号</span><input value={number} onChange={e=>setNumber(e.target.value)} autoComplete="off" required disabled={busy}/></label>}<button className="hs-primary" disabled={busy||!code.trim()||(student&&!number.trim())}>使用当前账号确认</button></form>}</details></section>
}
