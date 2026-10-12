import {useEffect,useState} from 'react'
import {HuiteacherImprovementPanel,type ImprovementApi} from './HuiteacherImprovementPanel'
type Target={organizationId:string;organizationName:string;targetId:string;targetName:string}
export function HuiteacherMyGrowth({api}:{api:ImprovementApi}){
  const [targets,setTargets]=useState<Target[]>([])
  const [selected,setSelected]=useState('')
  const [error,setError]=useState('')
  useEffect(()=>{
    let live=true
    void api<{list:Target[]}>('/my-improvement-targets')
      .then(data=>{if(live)setTargets(data.list)})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'个人改进对象尚不可用')})
    return()=>{live=false}
  },[api])
  const current=targets.find(t=>t.organizationId+':'+t.targetId===selected)
  return <section className="ht-panel" aria-label="个人教师专业成长">
    <h2>我的专业成长行动</h2>
    <p>目标和完成证据仅由本人读取。学校组织调查与心理报告不会被自动带入。</p>
    {error&&<p role="status" className="ht-notice">{error}</p>}
    {targets.length===0?<p className="ht-empty">尚无已绑定本人教育身份的正式教师发展对象；可由本校 Teacher 管理者核验后建立。</p>:
      <label className="ht-field"><span>我的发展对象</span>
        <select value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="">选择学校</option>
          {targets.map(t=><option key={t.organizationId+':'+t.targetId}
            value={t.organizationId+':'+t.targetId}>
            {t.organizationName} · {t.targetName}</option>)}
        </select>
      </label>}
    {current&&<HuiteacherImprovementPanel api={api}
      key={selected} organizationId={current.organizationId}
      targetId={current.targetId} targetName={current.targetName}
      audience="PRIVATE_PERSONAL"/>}
  </section>
}
