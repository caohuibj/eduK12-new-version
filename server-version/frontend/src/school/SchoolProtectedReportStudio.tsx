import { useEffect, useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'

type Source = {
  runId:string;trackId:string;runName:string;subjectReference:string
  relationshipKind:string
  perspective:'SELF_REPORT'|'OBSERVER_REPORT'|'RELATIONAL_EXPERIENCE'
  resource:{family:string;key:string;version:string}
}
type Spec={specId:string;title:string;version:number}
type Catalog={sources:Source[];specs:Spec[];truncated:boolean}
type Result={artifactId:string;subjectReference:string;status:'AVAILABLE'|'WITHHELD'}
const problem=(err:unknown)=>err instanceof Error?err.message:'当前任务不可访问'

/** All subject identity resolution and scoring are server-side. This view only
 * handles opaque school-specific codes and scientific plan identifiers.
 */
export function SchoolProtectedReportStudio({api,organizationId}:{
  api:SchoolApi;organizationId:string
}){
  const [catalog,setCatalog]=useState<Catalog|null>(null)
  const [choice,setChoice]=useState('')
  const [spec,setSpec]=useState('')
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState<Result|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let live=true
    setCatalog(null);setChoice('');setSpec('');setResult(null);setError('')
    void api<Catalog>('/reports/protected/catalog?organizationId='+encodeURIComponent(organizationId))
      .then(data=>{if(live)setCatalog(data)})
      .catch(err=>{if(live)setError(problem(err))})
    return ()=>{live=false}
  },[api,organizationId])
  const source=choice?catalog?.sources[Number(choice)-1]:undefined
  const selectedSpec=catalog?.specs.find(item=>item.specId===spec)
  const generate=async()=>{
    if(!source||!selectedSpec||busy)return
    if(!window.confirm('确认已经审核该学生的正式个案服务范围、工具及科学方案？这一步仅在心理教师专业工作台生成，不对家长或任课教师披露。'))return
    setBusy(true);setError('');setResult(null)
    try{
      setResult(await api<Result>('/reports/protected','POST',{
        organizationId,runId:source.runId,trackId:source.trackId,
        subjectReference:source.subjectReference,relationshipKind:source.relationshipKind,
        perspective:source.perspective,specId:selectedSpec.specId,
      }))
    }catch(e){setError(problem(e))}
    finally{setBusy(false)}
  }
  return <section className="hs-panel">
    <h2>心理教师 · 受保护报告生成</h2>
    <p>只处理本人当前正式服务个案中、已获批准并完成的校园测评。
      使用校园观察编号，不显示学生登录名、学号、评价者身份或任何原始作答。</p>
    <p>需要不少于五名独立有效评价者，并满足已发布科学方案的每项指标门槛。
      不满足条件时报告会被抑制；不同观察视角不得直接求平均或形成诊断结论。</p>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    {catalog===null?<p>正在核查当前专业关系与已发布内容…</p>:<>
      <label className="hs-field"><span>合法个案与观察来源</span>
        <select value={choice} disabled={busy} onChange={e=>{setChoice(e.target.value);setResult(null)}}>
          <option value="">选择已结束的校园正式观察</option>
          {catalog.sources.map((s,i)=><option key={s.runId+':'+s.trackId+':'+s.subjectReference+':'+i}
            value={i+1}>{s.subjectReference} · {s.runName} · {s.resource.family} {s.resource.key} ({s.resource.version}) · {s.perspective}</option>)}
        </select>
      </label>
      <label className="hs-field"><span>经独立审核的保护性反馈方案</span>
        <select value={spec} disabled={busy} onChange={e=>{setSpec(e.target.value);setResult(null)}}>
          <option value="">请选择已发布方案</option>
          {catalog.specs.map(s=><option key={s.specId} value={s.specId}>{s.title} · v{s.version}</option>)}
        </select>
      </label>
      {catalog.sources.length===0&&<p>当前没有本人获准负责的已完成学生观察来源。</p>}
      {catalog.specs.length===0&&<p>尚无符合校园保护性反馈门槛的正式发布方案；不得临时替换为低样本方案。</p>}
      {catalog.truncated&&<p>目录有分页上限。未列出的个案请通过正式服务关系调整，不使用临时身份查询。</p>}
      <button disabled={busy||!source||!selectedSpec} onClick={()=>void generate()}>
        经近期动态验证码核验后生成
      </button>
    </>}
    {result&&<section className="hs-task-detail" role="region" aria-label="受保护报告生成结果">
      <h3>个案观察编号：{result.subjectReference}</h3>
      {result.status==='AVAILABLE'
        ?<p>已生成满足当前权限与保护规则的报告。需要查看具体内容，请在上方“已获授权的专业报告”工作区刷新并再次核验权限。</p>
        :<p>当前结果已被抑制，不满足披露门槛，不能以人数、原始答案或评价者明细补充展示。</p>}
      <p>完成生成不意味着学生、家长、任课教师或者其他工作人员获得了报告查看权限。</p>
      <button onClick={()=>setResult(null)}>关闭状态</button>
    </section>}
  </section>
}
