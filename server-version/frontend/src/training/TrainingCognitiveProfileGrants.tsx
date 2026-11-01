import {useEffect,useRef,useState} from 'react'
import {useAuth} from '../contexts/AuthContext'
import {eligibleGrantTeachers,materialGrantApi} from '../api/materialGrants'
import {cognitiveProfileGrantsApi as api,validCognitiveProfilePending,sameCognitiveProfileOperation,type CognitiveProfileChoice,type CognitiveProfileUse,type CognitiveProfilePending} from '../api/cognitiveProfileGrants'
import type {User} from '../types'
import CatalogDiscoveryFilters from '../components/scale-governance/CatalogDiscoveryFilters'
import CatalogClassificationTags from '../components/scale-governance/CatalogClassificationTags'
import {EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,catalogQuery} from '../api/catalogDiscovery'
const label=(p:string)=>p==='experience'?'体验报告':p==='research'?'科研报告':'正式报告'
const message=(e:unknown)=>e instanceof Error?e.message:'请求未完成，请回读原结果。'
const localDate=(d:Date)=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)
export default function TrainingCognitiveProfileGrants(){const {user}=useAuth();return user?<Workspace key={user.id} actorId={user.id}/>:null}
export function Workspace({actorId}:{actorId:string}){
 const [choices,setChoices]=useState<CognitiveProfileChoice[]>([]),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false),[teachers,setTeachers]=useState<User[]>([])
 const [filters,setFilters]=useState({...EMPTY_CATALOG_FILTERS}),[applied,setApplied]=useState({...EMPTY_CATALOG_FILTERS}),[facets,setFacets]=useState(EMPTY_CATALOG_FACETS)
 const [choiceKey,setChoiceKey]=useState(''),[userId,setUserId]=useState(''),[uses,setUses]=useState<CognitiveProfileUse[]>([]),[usesReady,setUsesReady]=useState(false)
 const [preview,setPreview]=useState<Awaited<ReturnType<typeof api.preview>>['data']|null>(null)
 const [name,setName]=useState(''),[from,setFrom]=useState(localDate(new Date())),[until,setUntil]=useState(''),[reason,setReason]=useState('')
 const [pending,setPending]=useState<CognitiveProfilePending|null>(null),[absent,setAbsent]=useState(false),[storageReady,setStorageReady]=useState(false),[storageError,setStorageError]=useState('')
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0)
 const alive=useRef(true),inFlight=useRef(false),storageKey='training-cognitive-profile-request:'+actorId
 const choice=choices.find(c=>c.artifactHash===choiceKey),current=uses.filter(g=>!g.revokedAt&&Date.parse(g.expiresAt)>Date.now())
 const old=current.length===1?current[0]:null
 useEffect(()=>{alive.current=true
  try{const raw=sessionStorage.getItem(storageKey),p=raw?JSON.parse(raw):null;if(p&&!validCognitiveProfilePending(p))throw Error('原认知授权请求不完整，请核对审计后处理。');setPending(p);setStorageReady(true)}catch(e){setStorageError(message(e))}
  return()=>{alive.current=false}
 },[storageKey])
 useEffect(()=>{let active=true;setLoading(true);setError('');setChoices([])
  void Promise.all([api.catalog(page,applied),materialGrantApi.listTeachers()]).then(([catalog,users])=>{
   if(!active)return
   if(catalog.code!==0||!catalog.data||!Array.isArray(catalog.data.list)||users.code!==0||!users.data||users.data.total!==users.data.list.length)throw Error('配置或接收者名单不完整，请重新读取。')
   setChoices(catalog.data.list);setHasMore(catalog.data.hasMore);setTeachers(eligibleGrantTeachers(users.data.list));setFacets(catalog.data.tagFacets??EMPTY_CATALOG_FACETS)
  }).catch(e=>{if(active)setError(message(e))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[page,reload,applied])
 useEffect(()=>{let active=true;setUsesReady(false);setUses([]);setPreview(null);setError('')
  if(!choice)return
  void api.preview(choice).then(r=>{if(!active)return;if(r.code!==0||!r.data||r.data.artifactHash!==choice.artifactHash||r.data.reportStyle.profile!==choice.profile)throw Error(r.message||'所选报告来源不可用');setPreview(r.data)}).catch(e=>{if(active)setError(message(e))})
  if(userId)void api.uses(choice.configId,userId).then(r=>{
   if(!active)return
   if(r.code!==0||!r.data||r.data.hasMore||!Array.isArray(r.data.list)||r.data.list.some(g=>g.userId!==userId))throw Error(r.message||'原授权名单不完整，不能覆盖。')
   setUses(r.data.list);setUsesReady(true)
  }).catch(e=>{if(active)setError(message(e))})
  return()=>{active=false}
 },[choice,userId,reload])
 useEffect(()=>{if(!pending)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)},[pending])
 function clear(){sessionStorage.removeItem(storageKey);setPending(null);setAbsent(false)}
 async function recover(p=pending){
  if(!p||inFlight.current)return
  setBusy(true);inFlight.current=true;setError('');setAbsent(false)
  try{const result=await api.operation(p);if(!alive.current)return
   if(result.code!==0)throw Error(result.message||'原请求读取失败')
   if(result.data===null){setAbsent(true);setNotice('尚未找到原请求。可稍后回读，或明确重试同一请求。');return}
   if(!sameCognitiveProfileOperation(p,result.data!))throw Error('原请求的配置、接收者或修订不一致，停止新增写入。')
   clear();setNotice(result.data!.grant.revokedAt?'原请求已确认；该使用权目前已撤销。':'原请求已确认，固定配置已保存。');setReload(x=>x+1)
  }catch(e){if(alive.current)setError(message(e))}finally{inFlight.current=false;if(alive.current)setBusy(false)}
 }
 async function send(p:CognitiveProfilePending,retry=false){
  if(inFlight.current||!storageReady||pending&&!retry)return
  if(!validCognitiveProfilePending(p)){setError('请检查接收者、有效期、业务名称和替换原因。');return}
  try{sessionStorage.setItem(storageKey,JSON.stringify(p))}catch{setError('浏览器不能保留原请求，此次尚未发送。');return}
  setPending(p);setBusy(true);inFlight.current=true;setError('');setAbsent(false)
  try{const response=await api.send(p);if(!alive.current)return;if(response.code!==0)throw Error(response.message||'结果尚未确认')
   setNotice('写入已应答，正在核对原请求。')
  }catch(e){if(alive.current){const status=(e as {status?:number}).status;if(typeof status==='number'&&status>=400&&status<500&&![408,425,429].includes(status))clear();setError(message(e));return}}
  finally{inFlight.current=false;if(alive.current)setBusy(false)}
  if(alive.current)await recover(p)
 }
 function issue(){if(!choice||!usesReady||current.length>1)return
  let start:string,end:string;try{start=new Date(from).toISOString();end=new Date(until).toISOString()}catch{setError('请明确填写开始和结束时间。');return}
  void send({kind:'ISSUE',configId:choice.configId,profile:choice.profile,body:{requestId:crypto.randomUUID(),userId,artifactHash:choice.artifactHash,configurationName:name.trim(),validFrom:start,expiresAt:end,
   ...(old?{replaces:{grantId:old.id,expectedVersion:old.version,reason:reason.trim()}}:{})}})
 }
 return <section className="training-accounts training-resources-panel" aria-label="固定认知配置授权">
  <h2>固定认知配置</h2><p>选择已批准的测验配置和报告，使用者建任务时直接使用。调整仅影响后续绑定，历史作答和报告保留。</p>
  <CatalogDiscoveryFilters label="固定认知配置检索" filters={filters} facets={facets} onChange={setFilters} disabled={loading||busy||Boolean(pending)} onApply={value=>{setChoiceKey('');setPreview(null);setUses([]);setUsesReady(false);setName('');setReason('');setPage(1);setApplied({...value,keyword:value.keyword.trim()})}}/>
  {storageError&&<p role="alert">{storageError}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {pending&&<aside aria-label="原认知配置请求"><p>有一项结果待核对，请先读取原请求。</p><details><summary>请求详情</summary><code>{pending.body.requestId}</code></details>
   <button disabled={busy} onClick={()=>void recover()}>回读原请求</button>{absent&&<button disabled={busy} onClick={()=>void send(pending,true)}>重试同一请求</button>}</aside>}
  {loading?<p role="status">正在读取配置…</p>:<>
   <label>测验与报告<select value={choiceKey} disabled={busy||Boolean(pending)} onChange={e=>{setChoiceKey(e.target.value);setName('');setReason('')}}><option value="">选择已批准配置</option>{choices.map(c=><option key={c.artifactHash} value={c.artifactHash}>{c.title} · {label(c.profile)}{c.available?'':'（暂不可用）'}</option>)}</select></label>
   {!choices.length&&<p>{catalogQuery(1,applied)!=='page=1'?'没有匹配的固定认知配置，可调整条件或清除筛选。':'尚无可选的精确认知配置；请由系统管理员核对素材装载和入口批准。'}</p>}
   <div><button disabled={busy||Boolean(pending)||page===1} onClick={()=>{setPage(p=>p-1);setChoiceKey('')}}>上一页</button><span>第 {page} 页</span><button disabled={busy||Boolean(pending)||!hasMore} onClick={()=>{setPage(p=>p+1);setChoiceKey('')}}>下一页</button></div>
   {choice&&<>
    <p>认知测验 · {label(choice.profile)}</p><CatalogClassificationTags tags={choice.classificationTags}/>
    {preview&&<section aria-label="报告预览"><h3>{preview.reportStyle.title}</h3><p>{label(preview.reportStyle.profile)}</p><p>主要内容：{preview.reportStyle.headline.map(m=>m.label).join('、')}</p><p>详细内容：{preview.reportStyle.detail.map(m=>m.label).join('、')}</p>{preview.reportStyle.caveats.map(c=><p key={c}>{c}</p>)}<p>{preview.reportStyle.disclaimer}</p><p>此处预览报告结构，实际结果由作答产生。</p></section>}
    <label>接收培训师<select value={userId} disabled={busy||Boolean(pending)} onChange={e=>setUserId(e.target.value)}><option value="">选择合格培训师</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.nickname||t.username}</option>)}</select></label>
    {usesReady&&old&&<p>当前指定：{old.configurationName} · {label(old.profile)}。保存将建立新修订并撤销原使用权。</p>}
    {current.length>1&&<p role="alert">存在多个生效或未来配置，请先处理原授权；不能猜测默认配置。</p>}
    <label>配置名称<input value={name} maxLength={120} disabled={busy||Boolean(pending)} onChange={e=>setName(e.target.value)}/></label>
    <label>开始时间<input type="datetime-local" value={from} disabled={busy||Boolean(pending)} onChange={e=>setFrom(e.target.value)}/></label>
    <label>结束时间<input type="datetime-local" value={until} required disabled={busy||Boolean(pending)} onChange={e=>setUntil(e.target.value)}/></label>
    {old&&<label>替换原因<input value={reason} maxLength={500} disabled={busy||Boolean(pending)} onChange={e=>setReason(e.target.value)}/></label>}
    {!choice.available&&<p role="alert">{choice.unavailableReason||'此精确配置当前不可新增分配。'}</p>}
    <button className="training-accounts-primary" disabled={busy||Boolean(pending)||!storageReady||!choice.available||!preview||!usesReady||!name.trim()||!until||current.length>1||Boolean(old&&(!old.canManage||!reason.trim()))} onClick={issue}>{old?'确认替换固定配置':'授权此固定配置'}</button>
    {old?.canManage&&<button className="training-accounts-secondary" disabled={busy||Boolean(pending)} onClick={()=>void send({kind:'REVOKE',configId:choice.configId,grantId:old.id,body:{requestId:crypto.randomUUID(),expectedVersion:old.version,reason:'Training 管理员显式撤销固定认知配置使用权'}})}>撤销原使用权</button>}
    {old&&!old.canManage&&<p>原使用权由另一发行者维护，不能接管或撤销。</p>}
    <details><summary>来源与修订详情</summary><p>{choice.configId} · {choice.artifactHash}</p>{uses.map(g=><p key={g.id}>{g.configurationName} · {label(g.profile)} · 修订 {g.version} · {g.revokedAt?'已撤销':'有效期内按资格使用'}</p>)}</details>
   </>}
  </>}
  <button className="training-accounts-secondary" disabled={busy} onClick={()=>setReload(x=>x+1)}>重新读取配置与授权</button>
 </section>
}
