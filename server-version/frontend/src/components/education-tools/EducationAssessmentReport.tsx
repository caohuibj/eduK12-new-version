import BundleProfileSummary,{type BundleProfileView} from '../../pages/bundle/BundleProfileSummary'
import {BundleDerivedReport,type DerivedBundleView} from '../../modules/reporting/BundleDerivedReport'
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
  const native=ready?(data as unknown as {nativeBundle?:{schemaVersion:number;kind:string;status:string;title:string;profileView:BundleProfileView|null;
    derivedView?:DerivedBundleView|null;jointSummary?:{state:string|null;blocks:Array<{id:string;title:string;texts:string[]}>}|null}}).nativeBundle:undefined
  return <div className="education-personal-report">
    {recognized&&typeof data.message==='string'&&<p>{data.message}</p>}
    {native?.schemaVersion===1&&native.kind==='NATIVE_BUNDLE_FEEDBACK'&&<section aria-label="整体理论报告"><h3>{native.title}</h3>{native.derivedView?<BundleDerivedReport view={native.derivedView}/>:native.profileView?<BundleProfileSummary view={native.profileView}/>:native.jointSummary?<>
      {native.jointSummary.state&&<p>{native.jointSummary.state}</p>}{native.jointSummary.blocks.map(block=><section key={block.id}><h4>{block.title}</h4><ul>{block.texts.map((text,index)=><li key={index}>{text}</li>)}</ul></section>)}
    </>:<p>{native.status==='PENDING'?'单项作答已保存，综合报告正在生成。':'当前没有可展示的获准综合解释。'}</p>}</section>}
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
