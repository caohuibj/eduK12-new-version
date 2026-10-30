import {useRef,useState} from 'react'
import {ReportDetails,ReportDisclaimer,ReportMetric,ReportMetricGrid,ReportSection} from '../modules/reporting/ReportPrimitives'
import '../modules/reporting/task-group-report.css'

/** The existing Teacher authorized projection; no raw FINAL or scoring adapter. */
export interface TeacherFormGroupProjection{
  eventId:string;formId:string;definitionDigest:string;releasedAt?:string
  independentRespondents:number|null;minimumRespondents:number;note?:string
  distributions:Array<{itemKey:string;prompt:string;type?:string;status:'READY'|'WITHHELD';reason?:string
    selectionMode?:'NON_EXCLUSIVE';precision?:'ROUNDED_10_PERCENT'
    cells?:Array<{key:string;label:string;count?:number;percentage?:number}>}>
}
const withheld:Record<string,string>={
  PRIVATE_FREE_TEXT:'开放性文字未获群体披露许可。',
  AGGREGATION_NOT_RELEASED:'该题型尚无已发布的群体统计规则。',
  SMALL_CELL:'选项分布包含未达到披露人数要求的单元，整题统计暂不显示。',
  POLICY_ITEM_DISTRIBUTION:'任务发布时的隐私策略限制展示题目分布。',
  SOURCE_INTEGRITY:'该题的数据来源暂不满足报告条件。',
}
const percentage=(count:number|undefined,n:number|null,published:number|undefined)=>
  published!==undefined?`${published}%`:count!==undefined&&n!==null&&n>0
    ?`${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}).format(count/n*100)}%`:'—'

/** Replace the old inline list with the shared report primitives and print CSS.
 * Keep counts absent when the original released projection hides them. */
export function TeacherFormGroupReport({report,activityTitle,formTitle}:{
  report:TeacherFormGroupProjection;activityTitle:string;formTitle:string
}){
  const root=useRef<HTMLElement>(null)
  const [selected,setSelected]=useState(''),[error,setError]=useState('')
  const chosen=report.distributions.find(item=>item.itemKey===selected)??report.distributions[0]
  const released=report.releasedAt?new Date(report.releasedAt).toLocaleString('zh-CN'):null
  async function fullscreen(){
    try{await root.current?.requestFullscreen();setError('')}
    catch{setError('浏览器未能进入全屏，可继续阅读或打印。')}
  }
  return <article className="task-group-report" ref={root} aria-label="教师群体报告阅读">
    <header className="task-group-report__header"><div><p className="report-eyebrow">教师群体报告 · Form</p>
      <h2>{formTitle}</h2><p>活动：{activityTitle} · 全部合格参与教师</p>
      {released?<p>正式发布 {released}</p>:<p>历史规则汇总 · 原报告未记录发布时间</p>}
    </div><div className="task-group-report__actions">
      <button type="button" onClick={()=>void fullscreen()}>全屏展示</button>
      <button type="button" onClick={()=>window.print()}>打印 / 保存 PDF</button>
    </div></header>
    {error&&<p role="status" className="task-group-report__actions">{error}</p>}
    <ReportMetricGrid><ReportMetric label="纳入参与者" value={report.independentRespondents??'受限展示'}/>
      <ReportMetric label="披露人数下限" value={report.minimumRespondents}/>
      <ReportMetric label="报告题目" value={report.distributions.length}/></ReportMetricGrid>
    {chosen&&<label className="task-group-report__actions">阅读题目<select value={chosen.itemKey} onChange={e=>setSelected(e.target.value)}>
      {report.distributions.map(item=><option key={item.itemKey} value={item.itemKey}>{item.prompt}</option>)}
    </select></label>}
    {report.distributions.map(item=><section key={item.itemKey} aria-label={item.prompt}
      className={item.itemKey===chosen?.itemKey?'task-group-report__metric':'task-group-report__metric task-group-report__metric--print'}>
      <ReportSection title={item.prompt} headingLevel={3}>
        {item.status==='WITHHELD'?<ReportDisclaimer>{withheld[item.reason??'']??'该题因来源或披露条件暂不显示。'}</ReportDisclaimer>:<>
          <p>{item.selectionMode==='NON_EXCLUSIVE'
            ?'多选比例以该题纳入参与者为分母（含拒答与缺失），合计可能超过 100%。'
            :'比例以该题纳入参与者为分母（含拒答与缺失）。'}
            {item.precision==='ROUNDED_10_PERCENT'&&' 比例按发布策略取整至 10%，不据此推算人数。'}</p>
          <table><caption>已获准展示的选项分布 · 分母 {report.independentRespondents??'受限展示'}</caption>
            <thead><tr><th>选项</th><th>频数</th><th>比例</th></tr></thead>
            <tbody>{item.cells?.map(cell=><tr key={cell.key}><th scope="row">{cell.label}</th><td>{cell.count??'受限展示'}</td>
              <td>{percentage(cell.count,report.independentRespondents,cell.percentage)}</td></tr>)}</tbody>
          </table>
        </>}
      </ReportSection>
    </section>)}
    <ReportSection title="样本与说明"><ReportDisclaimer>{report.note??'仅展示既有报告获准披露的选项统计；不包含个人原始作答或开放文本。'}</ReportDisclaimer>
      <ReportDisclaimer>Form 不产生心理得分，本报告不构成诊断、教师个人绩效或因果结论。</ReportDisclaimer>
      <p>活动与表单标题为当前名称；报告身份以活动、表单固定版本及发布时间为准。</p>
    </ReportSection>
    <ReportDetails title="报告版本"><p>活动 {report.eventId} · 表单 {report.formId}</p><p>固定定义 {report.definitionDigest}</p>
      <p>{released?'再次打开读取既有正式发布版本。':'历史规则报告沿用原有读取方式。'}</p></ReportDetails>
    <footer>Form {report.formId} · {report.definitionDigest} · {released??'历史规则汇总'}</footer>
  </article>
}
