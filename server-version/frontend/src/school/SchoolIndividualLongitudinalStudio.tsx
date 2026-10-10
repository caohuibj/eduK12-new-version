import { useEffect,useRef,useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'

type Subject={reference:string}
type Spec={specId:string;title:string;version:number}
type Catalog={subjects:Subject[];specs:Spec[];truncated:boolean}
type Source={
  runId:string;trackId:string;runName:string;publishedAt:string;
  resource:{family:string;key:string;version:string}
}
type Sources={sources:Source[];truncated:boolean}
type Result={artifactId:string;subjectReference:string;status:'AVAILABLE';note:string}
const message=(error:unknown)=>
  error instanceof Error&&error.message?error.message:'报告服务不可访问；请核实个案关系与科学方案'

/** Each selection invalidates the prior student's data. The API accepts only
 * a campus-scoped pseudonym; no username, student number or raw score.
 */
export function SchoolIndividualLongitudinalStudio({api,organizationId}:{
  api:SchoolApi;organizationId:string
}){
  const [catalog,setCatalog]=useState<Catalog|null>(null)
  const [subject,setSubject]=useState('')
  const [sources,setSources]=useState<Sources|null>(null)
  const [selected,setSelected]=useState<string[]>([])
  const [spec,setSpec]=useState('')
  const [result,setResult]=useState<Result|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const epoch=useRef(0)
  useEffect(()=>{
    const t=++epoch.current
    setCatalog(null);setSubject('');setSources(null);setSelected([]);setSpec('')
    setResult(null);setError('')
    void api<Catalog>('/reports/longitudinal/catalog?organizationId='+encodeURIComponent(organizationId))
      .then(x=>{if(t===epoch.current)setCatalog(x)})
      .catch(e=>{if(t===epoch.current)setError(message(e))})
    return ()=>{epoch.current+=1}
  },[api,organizationId])
  const chooseSubject=async(next:string)=>{
    const t=++epoch.current
    setSubject(next);setSelected([]);setSources(null);setResult(null);setError('')
    if(!next)return
    setBusy(true)
    try{
      const data=await api<Sources>('/reports/longitudinal/sources?organizationId='
        +encodeURIComponent(organizationId)+'&subjectReference='+encodeURIComponent(next))
      if(t===epoch.current)setSources(data)
    }catch(e){if(t===epoch.current)setError(message(e))}
    finally{if(t===epoch.current)setBusy(false)}
  }
  const sourceKey=(s:Pick<Source,'runId'|'trackId'>)=>s.runId+':'+s.trackId
  const picked=(sources?.sources??[]).filter(s=>selected.includes(sourceKey(s)))
  const distinctKeys=new Set(picked.map(s=>s.resource.family+':'+s.resource.key))
  const ready=!!subject&&picked.length>=2&&picked.length<=8
    &&new Set(picked.map(s=>s.runId)).size===picked.length&&distinctKeys.size===1&&!!spec
  const generate=async()=>{
    if(!ready||busy)return
    if(!window.confirm('核实本次选择属于同一学生、同一心理测量工具的正式波次，且平台科学方案对各指标/版本已有独立可比性证据？生成内容仅向当前心理教师专业工作台开放。'))return
    const t=++epoch.current
    setBusy(true);setError('');setResult(null)
    try{
      const data=await api<Result>('/reports/longitudinal','POST',{
        organizationId,subjectReference:subject,specId:spec,
        sources:picked.map(s=>({runId:s.runId,trackId:s.trackId})),
      })
      if(t===epoch.current)setResult(data)
    }catch(e){if(t===epoch.current)setError(message(e))}
    finally{if(t===epoch.current)setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>心理教师 · 个人纵向测评分析</h2>
    <p>仅针对本人当前授权的学生个案，选择同一工具的两次及以上正式测量。
      每个指标与相邻版本均需要独立的科学可比性证据；平台不依据同名维度推断变化，也不自动给家长或任课教师授权。</p>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    {!catalog?<p>正在核验心理服务关系和可用科学方案…</p>:<>
      <label className="hs-field"><span>当前心理服务学生的匿名观察编号</span>
        <select value={subject} disabled={busy} onChange={e=>void chooseSubject(e.target.value)}>
          <option value="">选择本人当前服务个案</option>
          {catalog.subjects.map(s=><option key={s.reference} value={s.reference}>{s.reference}</option>)}
        </select>
      </label>
      <label className="hs-field"><span>经独立审核的个人纵向方案</span>
        <select value={spec} disabled={busy} onChange={e=>{setSpec(e.target.value);setResult(null)}}>
          <option value="">选择已发布且含可比性规则的方案</option>
          {catalog.specs.map(s=><option key={s.specId} value={s.specId}>{s.title} · v{s.version}</option>)}
        </select>
      </label>
      {catalog.subjects.length===0&&<p>当前没有合法的心理教师—学生个案关系。</p>}
      {catalog.specs.length===0&&<p>目前没有可以合法生成个人纵向解释的科学方案。不得使用尚未审核的量表形成“进步”或“退步”判断。</p>}
      {catalog.truncated&&<p>现有目录达到单页上限。请通过正式专业个案分配流程核查，不要使用学生学号寻找报告。</p>}
      {sources&&!sources.sources.length&&<p>该学生暂时没有已结束且符合独立生成条件的校园自评 Run。</p>}
      {sources&&<fieldset className="hs-task-list">
        <legend>选择 2–8 次合法的自评测量（同一工具，至少两个不同的 Run）</legend>
        {sources.sources.map(s=><label key={sourceKey(s)} className="hs-task-card">
          <input type="checkbox" disabled={busy}
            checked={selected.includes(sourceKey(s))}
            onChange={e=>{
              setResult(null)
              setSelected(prev=>e.target.checked?[...prev,sourceKey(s)]
                :prev.filter(x=>x!==sourceKey(s)))
            }}/>
          <span>{s.runName} · {s.resource.family} {s.resource.key} ({s.resource.version}) · {new Date(s.publishedAt).toLocaleDateString('zh-CN')}</span>
        </label>)}
        {sources.truncated&&<p>仅展示近期部分波次；请先缩小科学研究范围。</p>}
      </fieldset>}
      {picked.length>1&&distinctKeys.size!==1&&<p role="alert">所选波次不是同一个工具，不能进行纵向比较。</p>}
      <button disabled={busy||!ready} onClick={()=>void generate()}>
        经近期动态验证码核验后生成专业纵向分析
      </button>
    </>}
    {result&&<div role="region" aria-label="个人纵向生成结果" className="hs-task-detail">
      <p>个案：{result.subjectReference}</p>
      <p>{result.note}</p>
      <p>当前页面不会显示个人原始分数、未经审核的趋势判断或因果解释。</p>
      <button onClick={()=>setResult(null)}>关闭生成状态</button>
    </div>}
  </section>
}
