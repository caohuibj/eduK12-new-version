import {useEffect,useRef,useState} from 'react'
import {educationConfigurationRequest as request,type EducationManagerProduct,type EducationManagedUse} from '../../api/educationStandardConfigurations'
import {isEducationCognitivePending,sameEducationCognitiveOperation,type EducationCognitivePending,type EducationCognitiveProfile} from '../../api/educationCognitiveConfigurations'
type Props={actorId:string;organizationId:string;product:EducationManagerProduct}
type Choice={configId:string;profile:EducationCognitiveProfile;artifactHash:string;title:string;assignable:boolean;authorities:Array<{id:string;version:number;validFrom:string;expiresAt:string}>}
type Recipient={userId:string;username:string}
type Preview={artifactHash:string;profile:EducationCognitiveProfile;reportStyle:{title:string;headline:Array<{key:string;label:string}>;detail:Array<{key:string;label:string}>;caveats:string[];disclaimer:string}}
const label={experience:'体验配置',research:'科研配置',standard:'正式配置'}
const message=(e:unknown)=>e instanceof Error?e.message:'操作暂未完成'
export default function EducationCognitiveConfigurations(props:Props){return <Session key={JSON.stringify(props)} {...props}/>}
function Session({actorId,organizationId,product}:Props){
 const base=`/api/platform/education/organizations/${encodeURIComponent(organizationId)}/products/${product}/cognitive-profile-configurations`,key='education-exact-cognitive:'+JSON.stringify([actorId,product,organizationId])
 const [initial]=useState(()=>{try{const raw=sessionStorage.getItem(key),value=raw?JSON.parse(raw):null;if(value&&!isEducationCognitivePending(value))throw Error('原认知请求记录不完整，请核对审计后处理。');return {value:value as EducationCognitivePending|null,error:''}}catch(e){return {value:null,error:message(e)}}})
 const [pending,setPending]=useState(initial.value),[blocked,setBlocked]=useState(Boolean(initial.error)),[error,setError]=useState(initial.error),[notice,setNotice]=useState(''),[absent,setAbsent]=useState(false)
 const [rows,setRows]=useState<Choice[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[choiceHash,setChoiceHash]=useState(''),[people,setPeople]=useState<Recipient[]>([]),[recipient,setRecipient]=useState(''),[authorityId,setAuthorityId]=useState('')
 const [name,setName]=useState(''),[from,setFrom]=useState(''),[until,setUntil]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[grants,setGrants]=useState<Array<EducationManagedUse&{configId:string}>>([]),[replacement,setReplacement]=useState<(EducationManagedUse&{configId:string})|null>(null),[reason,setReason]=useState('')
 const live=useRef(true),flight=useRef(false),choice=rows.find(r=>r.artifactHash===choiceHash),configId=choice?.configId,locked=busy||Boolean(pending)||blocked
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 useEffect(()=>{let current=true;setLoading(true);void request<{list:Choice[];hasMore:boolean}>(base+'?page='+page).then(v=>{if(current){setRows(old=>page===1?v.list:[...old,...v.list]);setMore(v.hasMore)}}).catch(e=>{if(current)setError(message(e))}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[base,page])
 useEffect(()=>{let current=true;setPeople([]);setRecipient('');setPreview(null);setAuthorityId(choice?.authorities.length===1?choice.authorities[0].id:'');if(!choice)return
  void request<{list:Recipient[]}>(base+'/'+choice.configId+'/'+choice.profile+'/recipients?artifactHash='+choice.artifactHash).then(v=>{if(current){setPeople(v.list);if(replacement&&v.list.some(p=>p.userId===replacement.userId))setRecipient(replacement.userId)}}).catch(e=>{if(current)setError(message(e))});return()=>{current=false}
 },[base,choice,replacement])
 useEffect(()=>{let current=true;setGrants([]);if(configId)void request<{list:EducationManagedUse[]}>(base+'/'+configId+'/use-grants?page=1').then(v=>{if(current)setGrants(v.list.map(g=>({...g,configId})))}).catch(e=>{if(current)setError(message(e))});return()=>{current=false}},[base,configId])
 useEffect(()=>{if(!pending)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)},[pending])
 function retain(value:EducationCognitivePending){sessionStorage.setItem(key,JSON.stringify(value));setPending(value);setAbsent(false)}
 function clear(){try{sessionStorage.removeItem(key);setPending(null);setAbsent(false);setReplacement(null);setReason('')}catch{setBlocked(true);setError('结果已确认，但浏览器未清除原请求；请先处理浏览器存储。')}}
 async function recover(value=pending){if(!value)return;const found=await request<unknown>(base+'/'+value.configId+'/operations/'+value.body.requestId);if(!live.current)return
  if(found===undefined||found===false)throw Error('原请求回读不完整，不能确认不存在。')
  if(found===null){setAbsent(true);setNotice('未发现原请求，只能按原编号和原完整意图重试。');return}
  if(!sameEducationCognitiveOperation(value,found))throw Error('原请求的 profile、来源、接收者或完整意图不一致，请核对审计。')
  clear();setNotice('原认知配置请求已确认。')
  try{const page=await request<{list:EducationManagedUse[]}>(base+'/'+value.configId+'/use-grants?page=1');if(live.current)setGrants(page.list.map(g=>({...g,configId:value.configId})))}catch{if(live.current)setError('原请求已确认，授权列表刷新失败，请只读刷新后继续。')}
 }
 async function run(work:()=>Promise<void>){if(flight.current)return;flight.current=true;setBusy(true);setError('');try{await work()}catch(e){if(live.current)setError(message(e))}finally{flight.current=false;if(live.current)setBusy(false)}}
 async function send(value:EducationCognitivePending){if(!password||blocked)return
  retain(value);const secret=password;setPassword('')
  try{await request(base+'/'+value.configId+(value.kind==='ISSUE'?'/'+value.profile+'/use-grants':'/use-grants/'+value.grantId+'/revoke'),'POST',{...value.body,currentPassword:secret});if(live.current)await recover(value)}
  catch(e){if(live.current){retain({...value,unknown:true});throw Error(message(e)+'；请先核对原请求，不要改号重发。')}}
 }
 function issue(){if(locked||!choice?.assignable)return;const authority=choice.authorities.find(a=>a.id===authorityId);if(!authority||!people.some(p=>p.userId===recipient)||!name.trim()||!from||!until)return
  const value:EducationCognitivePending={kind:'ISSUE',configId:choice.configId,profile:choice.profile,unknown:false,body:{requestId:crypto.randomUUID(),userId:recipient,artifactHash:choice.artifactHash,authorityGrantId:authority.id,expectedAuthorityVersion:authority.version,validFrom:new Date(from).toISOString(),expiresAt:new Date(until).toISOString(),configurationName:name.trim(),...(replacement?{replaces:{grantId:replacement.id,expectedVersion:replacement.version,reason:reason.trim()}}:{})}}
  if(!isEducationCognitivePending(value)){setError('请核对接收者、配置名称、有效期和替换原因。');return}void run(()=>send(value))
 }
 return <section aria-label="教育固定认知配置"><h3>固定认知配置授权</h3><p>管理员确定体验或科研配置及报告，使用者直接建任务。批准范围、学校资格和精确分发委托分别校验。</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<p role="status">正在读取认知配置…</p>}
  {pending&&<section aria-label="认知原请求核对"><p>请求编号：{pending.body.requestId}。保留原接收者和完整配置。</p><button disabled={busy} onClick={()=>void run(()=>recover())}>核对原认知请求</button>{absent&&<button disabled={busy||!password} onClick={()=>void run(()=>send(pending))}>按原认知请求重试</button>}</section>}
  <label>认知测验与报告<select aria-label="认知测验与报告" value={choiceHash} disabled={locked||loading} onChange={e=>setChoiceHash(e.target.value)}><option value="">选择已批准配置</option>{rows.filter(r=>!replacement||r.configId===replacement.configId).map(r=><option key={r.artifactHash} value={r.artifactHash} disabled={!r.assignable}>{r.title} · {label[r.profile]}{r.assignable?'':' · 暂不可用'}</option>)}</select></label>
  {more&&<button disabled={locked||loading} onClick={()=>setPage(p=>p+1)}>读取更多认知配置</button>}{!loading&&!rows.length&&<p>尚无本入口、本校已批准且有精确分发委托的认知配置。</p>}
  {choice&&<><details><summary>查看认知来源详情</summary><p>配置编号：{choice.configId}</p><p>内容摘要：{choice.artifactHash}</p></details><button disabled={busy} onClick={()=>void run(async()=>{const v=await request<Preview>(base+'/'+choice.configId+'/'+choice.profile+'/preview?artifactHash='+choice.artifactHash);if(v.artifactHash!==choice.artifactHash||v.profile!==choice.profile)throw Error('预览与原配置不一致');if(live.current)setPreview(v)})}>预览认知报告</button></>}
  {preview&&<section aria-label="教育认知报告预览"><h4>{preview.reportStyle.title}</h4><p>{label[preview.profile]}</p><p>{[...preview.reportStyle.headline,...preview.reportStyle.detail].map(m=>m.label).join('、')}</p>{preview.reportStyle.caveats.map(c=><p key={c}>{c}</p>)}<p>{preview.reportStyle.disclaimer}</p><p>仅展示固定报告结构，实际结果由作答产生。</p></section>}
  <fieldset disabled={locked||!choice?.assignable}><label>认知授权接收者<select aria-label="认知授权接收者" value={recipient} disabled={Boolean(replacement)} onChange={e=>setRecipient(e.target.value)}><option value="">选择本校{product==='HUISCHOOL'?'心理教师':'Teacher 产品管理员'}</option>{people.map(p=><option key={p.userId} value={p.userId}>{p.username}</option>)}</select></label>
   <label>认知分发依据<select aria-label="认知分发依据" value={authorityId} onChange={e=>setAuthorityId(e.target.value)}><option value="">选择明确委托</option>{choice?.authorities.map(a=><option key={a.id} value={a.id}>精确分发委托 · {a.expiresAt}</option>)}</select></label>
   <label>认知配置名称<input value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label><label>认知授权开始<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>认知授权结束<input type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)}/></label>
   {replacement&&<><p>替换 {replacement.configurationName}，只影响后续绑定，旧草稿保持原版。</p><label>认知配置替换原因<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label><button type="button" onClick={()=>{setReplacement(null);setReason('')}}>取消认知配置替换</button></>}
   <button disabled={!password||!recipient||!authorityId||!name.trim()||!from||!until||Boolean(replacement&&!reason.trim())} onClick={issue}>授权固定认知配置</button>
  </fieldset><label>认知授权当前管理员密码<input type="password" autoComplete="off" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {grants.map(g=><article key={g.id}><strong>{g.configurationName??'固定认知配置'}</strong><p>{g.username} · {g.revokedAt?'已撤销':'已授权'}</p>{!g.revokedAt&&g.canManage&&<><button disabled={locked} onClick={()=>{setReplacement(g);setName(g.configurationName??'');setReason('');setChoiceHash('')}}>替换认知配置：{g.configurationName}</button><button disabled={locked||!password} onClick={()=>{const reason=window.prompt('撤销此固定认知配置的原因');if(!reason?.trim())return;void run(()=>send({kind:'REVOKE',configId:g.configId,grantId:g.id,unknown:false,body:{requestId:crypto.randomUUID(),expectedVersion:g.version,reason:reason.trim()}}))}}>撤销认知配置：{g.configurationName}</button></>}</article>)}
 </section>
}
