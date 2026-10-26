import {useEffect,useRef,useState} from 'react'
import {Search,RefreshCw,CheckCircle2,AlertCircle,Copy,ChevronRight,FileText,ShieldCheck,X} from 'lucide-react'
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
 const [issueTarget,setIssueTarget]=useState<Person|null>(null),[onlyErrors,setOnlyErrors]=useState(true)
 const [mfaRequired,setMfaRequired]=useState(false),[mfaCode,setMfaCode]=useState(''),[operation,setOperation]=useState(''),[fileName,setFileName]=useState('')
 const textInput=useRef<HTMLTextAreaElement>(null)
 const [credential,setCredential]=useState<{person:Person;code:string;expiresAt:string}|null>(null)
 const alive=useRef(true),lock=useRef(false),readId=useRef(0),previewId=useRef(0),batchId=useRef(''),applied=useRef(false)
 const base=`/organizations/${organizationId}/personnel`
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const run=async(fn:()=>Promise<void>,action='')=>{
  if(lock.current||disabled)return
  lock.current=true;setBusy(true);setOperation(action);setError('');setNotice('')
  try{await fn()}catch(cause){if(alive.current){
   const message=cause instanceof Error?cause.message:'操作未完成，请核对后重试。'
   setError(message)
   if(/敏感操作.*验证|重新验证.*动态|动态验证码.*重新验证/.test(message))setMfaRequired(true)
  }}
  finally{lock.current=false;if(alive.current){setBusy(false);setOperation('')}}
 }
 const load=async(after?:string)=>{
  const result=await api<{list:Person[];next:string|null}>(base+(after?`?after=${encodeURIComponent(after)}`:''))
  if(alive.current){setPeople(old=>after?[...old,...result.list]:result.list);setNext(result.next);setLoaded(true)}
 }
 const replace=(value:string)=>{readId.current++;previewId.current++;setText(value);setPreview(null);setInput(null);setVerified(false);batchId.current='';applied.current=false;setError('');setNotice('');setFileName('')}
 const read=async(file:File|undefined)=>{
  if(!file)return
  const id=++readId.current;previewId.current++;setPreview(null);setInput(null);setError('')
  if(file.size>64000){setError('文件超过 64 KB，请拆分后导入。当前文本已保留。');return}
  await run(async()=>{try{const value=await file.text();if(alive.current&&readId.current===id){replace(value);setFileName(file.name||'所选文件')}}catch{throw Error('文件读取失败，当前文本已保留。请重选文件或直接粘贴。')}},'file')
 }
 const parse=()=>run(async()=>{
  const candidate=parsePersonnelImport(text,kind),id=++previewId.current
  setPreview(null);setInput(null)
  const result=await api<Preview>(base+'/preview','POST',candidate)
  if(alive.current&&id===previewId.current){setPreview(result);setOnlyErrors(true);setInput(candidate);batchId.current=crypto.randomUUID();applied.current=false}
 },'preview')
 const confirm=()=>run(async()=>{
  if(!preview||!input||preview.errors||!preview.add||applied.current)return
  const result=await api<{added:number;skipped:number}>(base+'/import','POST',{input,previewToken:preview.token,batchId:batchId.current,verifiedOffline:verified})
  if(!alive.current)return
  // Preserve the batch ID on an uncertain response; explicit retry is idempotent.
  applied.current=true;setPreview(null);setInput(null);setText('');setVerified(false)
  setFileName('');setNotice(`已新增 ${result.added} 条，跳过 ${result.skipped} 条。${kind==='STUDENT'?'请发放个人激活码并开启注册窗口，注册后仍需整班审批。':kind==='STAFF'?'请按人员分别发放激活码，由本人激活账号。':'任教关系已记录；未激活教师的关系在本人激活后生效。'}`)
  try{await load()}catch{if(alive.current)setError('导入已完成，名单刷新失败。请点击刷新查看，勿重复新建批次。')}
 },'import')
 const issue=(person:Person)=>run(async()=>{
  setCredential(null)
  const result=await api<{code:string;expiresAt:string}>(base+`/${person.id}/credential`,'POST',{})
  if(alive.current){setCredential({person,...result});setIssueTarget(null)}
 },'credential')
 const filtered=people.filter(p=>!query.trim()||[p.number,p.name,p.grade,p.className].some(v=>v?.toLowerCase().includes(query.trim().toLowerCase())))
 if(sort==='number')filtered.sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}))
 if(sort==='pending')filtered.sort((a,b)=>Number(a.activated)-Number(b.activated))
 const needsVerification=!!input?.rows.some(r=>r.username)
 const previewRows=preview?.rows.filter(row=>!preview.errors||!onlyErrors||row.state==='error')??[]
 const copy=async(value:string,message:string)=>{try{await navigator.clipboard.writeText(value);if(alive.current)setNotice(message)}catch{if(alive.current)setError('复制失败，请选中文本后手动复制。')}}
 const verifyMfa=()=>run(async()=>{
  await api('/auth/mfa/step-up','POST',{code:mfaCode})
  if(alive.current){setMfaRequired(false);setMfaCode('');setNotice('身份验证成功，名单和预览已保留。请重新点击刚才的操作。')}
 },'mfa')
 return <section className="hs-panel hs-admin-panel hs-personnel" aria-label="学生与教师名单导入" aria-busy={busy}>
  <div className="hs-personnel-toolbar"><h2>人员名单</h2><div className="hs-actions">
   <button type="button" disabled={busy||disabled} className={open?'hs-personnel-open':''} aria-expanded={open} aria-controls={open?'hs-personnel-import':undefined} onClick={()=>{setOpen(v=>!v);setCredential(null);setIssueTarget(null);setLinkPerson(null)}}>{open?'收起导入':'批量导入'}</button>
   <label><span className="hs-sr-only">名单排序（当前已加载人员）</span><select aria-label="名单排序（当前已加载人员）" value={sort} onChange={e=>setSort(e.target.value)}><option value="default">默认顺序</option><option value="number">按编号排序</option><option value="pending">待激活优先</option></select></label>
   <button type="button" aria-label="检索名单" aria-expanded={searchOpen} aria-pressed={searchOpen||!!query.trim()} onClick={()=>setSearchOpen(v=>!v)}><Search size={18}/></button>
   <button type="button" aria-label="刷新人员名单" disabled={busy||disabled} onClick={()=>void run(()=>load(),'load')}><RefreshCw size={18} className={operation==='load'?'hs-personnel-spinning':undefined}/></button>
  </div></div>
  {searchOpen&&<label className="hs-field hs-personnel-search"><span>检索当前已加载名单</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="编号、姓名或班级"/></label>}
  {error&&<div className="hs-personnel-message" data-tone="error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
  {notice&&<div className="hs-personnel-message" data-tone="success" role="status"><CheckCircle2 size={18}/><span>{notice}</span></div>}
  {mfaRequired&&<form className="hs-personnel-mfa" aria-label="当前页面身份验证" onSubmit={event=>{event.preventDefault();void verifyMfa()}}>
   <div><strong><ShieldCheck size={17}/>验证后继续</strong><p>保留当前名单，输入验证器动态码即可继续。</p></div>
   <label className="hs-field"><span>6 位动态验证码</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} disabled={busy} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,''))}/></label>
   <button type="submit" className="hs-primary" disabled={busy||!/^[0-9]{6}$/.test(mfaCode)}>{operation==='mfa'?'正在验证…':'验证身份'}</button>
  </form>}
  {open&&<div id="hs-personnel-import" className={'hs-personnel-import-body'+(preview?' hs-personnel-has-preview':'')}>
   <div className="hs-personnel-input-pane">
    <div className="hs-personnel-stage"><span data-active={!preview}>1 准备名单</span><ChevronRight size={15}/><span data-active={!!preview}>2 核对并确认</span></div>
    <div className="hs-personnel-fields"><label className="hs-field"><span>导入类型</span><select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value as PersonnelKind);replace('')}}><option value="STUDENT">学生名单</option><option value="STAFF">教师名单</option><option value="ASSIGNMENT">教师任教关系</option></select></label>
     <label className="hs-field"><span>UTF-8 CSV／TSV 文件</span><input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" disabled={busy} onChange={e=>{void read(e.target.files?.[0]);e.target.value=''}}/></label></div>
    <details className="hs-personnel-help"><summary><FileText size={16}/>查看模板与导入说明</summary>
     <p>{kind==='STUDENT'?'必填：学号、年级、班级；姓名和已有校园用户名选填。':kind==='STAFF'?'必填：工号、姓名；默认普通教师，身份和已有校园用户名选填。':'必填：工号、年级、班级；同一教师可填写多个班级。请先导入教师名单。'}编号按文本处理，请保留前导零。</p>
     <pre>{personnelTemplates[kind]}</pre><button type="button" disabled={busy} onClick={()=>void copy(personnelTemplates[kind],'模板已复制，请修改示例后再导入。')}><Copy size={16}/>复制模板</button>
     <p>仅新增，不覆盖、不删除。年级、班级须在当前学校唯一匹配；已有校园账号需人工核实，再由本人登录确认。教师的管理和专业权限仍须单独授权。</p>
     {kind==='STUDENT'&&<p>学生名单只支持未开放且无人注册的班级，已审批班级暂不支持补录。新增会更新待注册名册修订，使旧的未使用激活码失效。请重新发放个人码、开启窗口，学生注册后仍须心理教师整班审批。</p>}
     {kind==='ASSIGNMENT'&&<p>已激活教师追加任教关系；未激活教师的关系待本人激活后生效。已有关系保留，不新增心理个案或报告权限。</p>}
    </details>
    <label className="hs-field"><span>粘贴名单（含表头，每批最多 100 行）</span><textarea ref={textInput} rows={5} value={text} disabled={busy} onChange={e=>replace(e.target.value)} placeholder={personnelTemplates[kind]}/></label>
    <div className="hs-personnel-input-footer"><span>{operation==='file'?'正在读取文件…':fileName?'已读取：'+fileName:'上传文件或粘贴文本；修改后需重新预览。'}</span><button type="button" className={preview?'':'hs-primary'} disabled={busy||disabled||!text.trim()} onClick={()=>void parse()}>{operation==='preview'?'正在校验名单…':'解析并预览'}</button></div>
   </div>
   {preview&&<section className="hs-personnel-preview" aria-label="名单导入预览">
    <div className="hs-personnel-preview-heading"><h3>核对导入结果</h3>{preview.errors>0&&<button type="button" aria-pressed={onlyErrors} onClick={()=>setOnlyErrors(v=>!v)}>只看错误</button>}</div>
    <div className="hs-personnel-counts"><span><strong>{preview.add}</strong>待新增</span><span><strong>{preview.skip}</strong>已有跳过</span><span data-error={preview.errors>0}><strong>{preview.errors}</strong>需修正</span></div>
    {preview.errors>0?<p className="hs-personnel-preview-hint">有 {preview.errors} 条错误，本批次尚未导入。请修改后重新预览。</p>:!preview.add?<p className="hs-personnel-preview-hint">这些记录已存在，无需再次导入；已有内容保持不变。</p>:<p className="hs-personnel-preview-hint">确认后仅新增 {preview.add} 条，已有记录保持不变。</p>}
    <ol>{previewRows.map((r,index)=><li key={index} data-state={r.state}><span>第 {r.line} 行</span><strong>{r.number}{r.name?' · '+r.name:''}</strong><span>{r.message}</span></li>)}</ol>
    {needsVerification&&preview.add>0&&<label className="hs-personnel-confirm"><input type="checkbox" checked={verified} disabled={busy} onChange={e=>setVerified(e.target.checked)}/>我已线下核实已有校园用户名确实属于对应本人；不修改其密码和权限。</label>}
    <div className="hs-personnel-preview-footer">{preview.errors>0&&<button type="button" disabled={busy} onClick={()=>textInput.current?.focus()}>返回修改名单</button>}{preview.add>0&&<button type="button" className="hs-primary" disabled={busy||disabled||preview.errors>0||(needsVerification&&!verified)} onClick={()=>void confirm()}>{operation==='import'?'正在保存名单…':`确认新增 ${preview.add} 条`}</button>}</div>
   </section>}
  </div>}
  {!loaded?<div className="hs-personnel-empty"><span>读取当前学校已导入的人员，查看激活状态。</span><button type="button" disabled={busy||disabled} onClick={()=>void run(()=>load(),'load')}>{operation==='load'?'正在读取…':'读取人员名单'}</button></div>:<>
   <div className="hs-personnel-list-meta"><p className="hs-personnel-count">已加载 {people.length} 人{next?'（还有更多）':''}{query.trim()?` · 匹配 ${filtered.length} 人`:''}</p>{query.trim()&&<span className="hs-personnel-query">检索：{query.trim()}<button type="button" aria-label="清空名单检索" onClick={()=>setQuery('')}><X size={15}/></button></span>}</div>
   <ul className="hs-personnel-list">{filtered.map(p=><li key={p.id}>
    <div className="hs-personnel-row"><div className="hs-personnel-identity"><strong>{p.name||p.number}</strong><span>{p.name?p.number+' · ':''}{p.kind==='STUDENT'?[p.grade,p.className].filter(Boolean).join(' / '):p.persona==='COUNSELOR'?'心理教师（权限单独授权）':'普通教师'}</span></div><span className="hs-personnel-badge" data-active={p.activated}>{p.activated?'已激活':p.existingAccount?'待本人确认':'待激活'}</span>{!p.activated&&<div className="hs-actions">{!p.existingAccount&&<button type="button" className="hs-personnel-secondary" disabled={busy||disabled} aria-expanded={linkPerson?.id===p.id} onClick={()=>{setLinkPerson(linkPerson?.id===p.id?null:p);setLinkUsername('');setLinkVerified(false);setCredential(null);setIssueTarget(null)}}>核实已有账号</button>}<button type="button" disabled={busy||disabled} aria-expanded={issueTarget?.id===p.id||credential?.person.id===p.id} onClick={()=>{setIssueTarget(issueTarget?.id===p.id?null:p);setLinkPerson(null)}}>发放激活码</button></div>}</div>
    {linkPerson?.id===p.id&&<form className="hs-personnel-row-panel" aria-label={`为 ${p.number} 核实已有账号`} onSubmit={e=>{e.preventDefault();void run(async()=>{
     await api(base+`/${p.id}/bind-existing`,'POST',{username:linkUsername.trim(),verifiedOffline:linkVerified})
     if(alive.current){setLinkPerson(null);setLinkUsername('');setLinkVerified(false);setCredential(null);setNotice('已记录核实结果，请重新发放激活码，交由本人登录原账号确认。');await load()}
    },'bind')}}><strong>核实已有校园账号</strong><label className="hs-field"><span>已有校园用户名</span><input value={linkUsername} disabled={busy} onChange={e=>setLinkUsername(e.target.value)} required autoComplete="off"/></label><label className="hs-personnel-confirm"><input type="checkbox" checked={linkVerified} disabled={busy} onChange={e=>setLinkVerified(e.target.checked)}/>我已线下核实该账号属于此人；不替本人激活，不修改其密码和权限。</label><div className="hs-actions"><button className="hs-primary" disabled={busy||!linkUsername.trim()||!linkVerified}>{operation==='bind'?'正在记录…':'确认核实结果'}</button><button type="button" disabled={busy} onClick={()=>setLinkPerson(null)}>取消</button></div></form>}
    {issueTarget?.id===p.id&&<section className="hs-personnel-row-panel" aria-label={`为 ${p.number} 确认发放激活码`}><strong>为 {p.name||p.number} 发放个人激活码</strong><p>新码只在本次显示，生成后请单独交付本人。<strong>原有未使用的个人码将失效。</strong></p><div className="hs-actions"><button type="button" className="hs-primary" disabled={busy||disabled} onClick={()=>void issue(p)}>{operation==='credential'?'正在生成…':'确认发放'}</button><button type="button" disabled={busy} onClick={()=>setIssueTarget(null)}>取消</button></div></section>}
    {credential?.person.id===p.id&&issueTarget?.id!==p.id&&<section className="hs-personnel-row-panel hs-personnel-credential" aria-label="本次激活凭据"><div className="hs-personnel-toolbar"><strong>个人激活码 · 仅显示本次</strong><button type="button" className="hs-personnel-icon" aria-label="关闭凭据" onClick={()=>setCredential(null)}><X size={18}/></button></div><div className="hs-personnel-code"><code>{credential.code}</code><button type="button" onClick={()=>void copy(credential.code,'激活码已复制，请单独安全交付本人。')}><Copy size={16}/>复制激活码</button></div><p>有效至 {new Date(credential.expiresAt).toLocaleString()}。{p.existingAccount?'本人登录原校园账号，在“我的账号 → 激活名单身份”中确认。':'本人从登录页“使用注册码注册”设置用户名和密码。'}{p.kind==='STUDENT'?'学生还需学校开放注册窗口及整班审批。':''}</p></section>}
   </li>)}</ul>
   {!filtered.length&&<div className="hs-personnel-empty"><span>{query.trim()?'没有匹配的人员，请修改检索词。':'当前学校还没有导入人员。'}</span>{query&&<button type="button" onClick={()=>setQuery('')}>清空检索</button>}</div>}{next&&<button type="button" disabled={busy} onClick={()=>void run(()=>load(next),'load')}>加载更多人员</button>}
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
