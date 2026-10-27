import { DeclaredReportContent } from '../../modules/composite/TrainingContentReports'
import type { EducationFeedbackData } from './EducationTaskFeedback'

type Rendered = Parameters<typeof DeclaredReportContent>[0]['report']
type Unit = {itemId:string;family:string;status:string;rendered:Rendered|null;message?:string}
/** Only server-projected declarative nodes. Never turn a Training report or an
 * unrecognized response into an education report, or infer absent thresholds. */
export function EducationAssessmentReport({data}:{data:EducationFeedbackData}){
  const recognized=data.schemaVersion===1&&data.kind==='EDUCATION_ASSESSMENT_PERSONAL_REPORT'
  const ready=recognized&&data.state==='READY'&&data.mode==='INDIVIDUAL_SUMMARY'
  const reports=ready&&Array.isArray((data as {reports?:unknown}).reports)?(data as unknown as {reports:Unit[]}).reports:[]
  return <div className="education-personal-report">
    {recognized&&typeof data.message==='string'&&<p>{data.message}</p>}
    {ready&&reports.length===0&&<p>本次测评已完成，当前没有获准展示的逐工具报告内容。</p>}
    {ready&&reports.map((unit,index)=>unit&&typeof unit==='object'&&<article key={typeof unit.itemId==='string'?unit.itemId:index}>
      {unit.status==='READY'&&unit.rendered?.generatorVersion==='DECLARATIVE_REPORT_V1'?<>
        {typeof unit.rendered.title==='string'&&<h4>{unit.rendered.title}</h4>}
        <DeclaredReportContent report={unit.rendered} showMetricKeys={false}/>
        {typeof unit.message==='string'&&<p>{unit.message}</p>}
      </>:<p>{unit.status==='REVOKED'?'该工具的测量或报告版本已撤回，当前不展示报告。':unit.status==='NOT_SELECTED'?'该工具未选择获准的报告版本。':'该工具当前没有可用的获准反馈或适用参考，未作分数或等级推断。'}</p>}
    </article>)}
  </div>
}
