import {renderDeclaredReport,type ReportMetricFact,type ReportReferenceFact} from '../measurement-content/report-renderer'
import {resolveAssessmentReference,type AssessmentReferenceEntry} from '../assessment-reference/reference'
import {prepareRelease} from '../measurement-content/release'
import type {FrozenUnitResult,SurveyComputedFinal} from './final.compute'
import type {GovernedArtifact,PackageReport} from './governed-tool.model'
import {snapshotUnit,governedMeasurementInput} from './governed-tool.model'
import type {FormDraft} from './builder.definition'
export function resultMetrics(result:FrozenUnitResult):ReportMetricFact[]{
 if(result.notExecuted||result.kind==='FORM')return []
 const p=result.privateScoring as {scores?:Array<{key:string;value:number|null;status?:string}>;metrics?:Array<{key:string;value:unknown;unit?:string;status?:string}>|Record<string,unknown>}
 const quality=result.measurement?.quality,invalid=quality?.flags?.interpretable===false||['INVALID','NOT_INTERPRETABLE','NOT_CALCULABLE'].includes(String(quality?.status??'').toUpperCase())
 const rows=result.measurement?.metrics??p?.scores??(Array.isArray(p?.metrics)?p.metrics:Object.entries(p?.metrics??{}).map(([key,value])=>({key,value})))
 return rows.map(m=>({metricKey:m.key,value:typeof m.value==='number'&&Number.isFinite(m.value)?m.value:null,unit:'unit'in m&&typeof m.unit==='string'?m.unit:'score',status:invalid?'INVALID' as const:typeof m.value==='number'&&Number.isFinite(m.value)?'INTERPRETABLE' as const:'UNAVAILABLE' as const}))
}
export function renderGovernedUnitReport(a:GovernedArtifact,result:FrozenUnitResult){
 if(!a.report)return null
 const references:ReportReferenceFact[]=[]
 if(a.parameters&&a.unit){
  const m=prepareRelease(governedMeasurementInput(snapshotUnit(a.unit),{kind:'PLATFORM'},a.toolKey,a.version))
  if(m.layer!=='MEASUREMENT')throw new Error('参数必须绑定测量内容')
  for(const metric of resultMetrics(result))for(const item of a.parameters.content.entries.filter(e=>e.metricKey===metric.metricKey)){
   const e=item.definition as unknown as AssessmentReferenceEntry,kind=m.family==='SCALE'?'scale':m.family==='SJT'?'sjt':'cognitive'
   const values=resolveAssessmentReference({instrumentType:kind,instrumentKey:a.toolKey,instrumentVersion:m.content.instrumentVersion,scoringVersion:m.content.scoringVersion,measurementHash:m.content.measurementHash,
    selections:[{scoreKey:item.metricKey,referenceVersion:a.parameters.version,referenceKind:item.referenceKind}],references:[{schemaVersion:1,instrumentType:kind,instrumentKey:a.toolKey,referenceVersion:a.parameters.version,status:'ACTIVE',entries:[e]}],score:{key:metric.metricKey,value:metric.value,status:metric.value===null?'not_calculable':'calculated'}})
   for(const v of values)references.push({metricKey:metric.metricKey,referenceKind:item.referenceKind,status:v.status==='available'?'AVAILABLE':'UNAVAILABLE',bandKey:v.criterionBand?.key??null})
  }
 }
 return renderDeclaredReport(a.report.template,resultMetrics(result),references)
}
function fieldDisplay(form:FormDraft,itemKey:string,answers:Record<string,unknown>):string{
 const question=form.pages.flatMap(p=>p.questions).find(q=>q.itemKey===itemKey)
 if(!question)throw new Error('组合报告字段未固定')
 const value=answers[itemKey]
 if(value===undefined||value===null)return '未填写或未展示'
 const option=(v:unknown)=>question.options.find(o=>o.optionKey===v)?.label??String(v)
 if(typeof value==='object'&&!Array.isArray(value)&&'_surveyRefusal'in value)return '明确拒答'
 if(Array.isArray(value))return value.map(option).join('、')
 if(typeof value==='object')return Object.entries(value).map(([key,v])=>(question.rows.find(r=>r.rowKey===key)?.label??key)+'：'+(Array.isArray(v)?v.map(option).join('、'):option(v))).join('；')
 return option(value)
}
/** Rendering consumes already computed/stored facts; it never runs any scorer. */
export function renderPackageReport(spec:PackageReport,components:Array<{slotKey:string;unit:{ref:{kind:string};displayDefinition:unknown}}>,calculated:SurveyComputedFinal,keys:Record<string,string>){
 const metrics:ReportMetricFact[]=[],blocks:Array<{type:'TEXT';text:string}|{type:'METRIC';metricKey:string;label:string;display:'RAW'}>=[]
 if(spec.introduction)blocks.push({type:'TEXT',text:spec.introduction})
 spec.blocks.forEach((b,index)=>{
  if(b.type==='TEXT'){blocks.push(b);return}
  const component=components.find(c=>c.slotKey===b.slotKey),result=calculated.units.find(u=>u.instrumentKey===keys[b.slotKey])
  if(!component||!result||result.notExecuted)throw new Error('组合报告缺少固定组件结果：'+b.slotKey)
  if(b.type==='FORM_FIELD'){
   if(component.unit.ref.kind!=='FORM')throw new Error('组合报告字段类型错误')
   blocks.push({type:'TEXT',text:b.label+'：'+fieldDisplay(component.unit.displayDefinition as FormDraft,b.itemKey,result.rawAnswers)})
  }else{
   const fact=resultMetrics(result).find(m=>m.metricKey===b.metricKey)
   if(!fact)throw new Error('组合报告指标不存在：'+b.slotKey+'/'+b.metricKey)
   const key='combined_'+index;metrics.push({...fact,metricKey:key});blocks.push({type:'METRIC',metricKey:key,label:b.label,display:'RAW'})
  }
 })
 return renderDeclaredReport({title:spec.title,blocks,limitations:[],...(spec.disclaimer?{disclaimer:spec.disclaimer}:{})},metrics,[])
}
