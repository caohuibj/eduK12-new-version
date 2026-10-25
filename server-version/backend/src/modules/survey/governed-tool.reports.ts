import {renderDeclaredReport,type ReportMetricFact,type ReportReferenceFact} from '../measurement-content/report-renderer'
import {resolveAssessmentReference,type AssessmentReferenceEntry} from '../assessment-reference/reference'
import {prepareRelease} from '../measurement-content/release'
import type {FrozenUnitResult,SurveyComputedFinal} from './final.compute'
import type {GovernedArtifact,PackageReport} from './governed-tool.model'
import {snapshotUnit,governedMeasurementInput} from './governed-tool.model'
import type {FormDraft,FormQuestion} from './builder.definition'
import type {MissingItem} from './final.compute'
import {assertPackageReportBytes,jsonBytes} from './governed-package.budget'
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
const missingText={REFUSED:'明确拒答',NOT_SHOWN:'未展示',SHOWN_MISSING:'未填写',UNABLE_TO_JUDGE:'无法判断'} as const
function fieldDisplay(question:FormQuestion,answers:Record<string,unknown>,missing:ReadonlyMap<string,MissingItem['reason']>):string{
 const itemKey=question.itemKey,value=answers[itemKey],reason=missing.get(itemKey)
 if(reason)return missingText[reason]
 const options=new Map(question.options.map(o=>[o.optionKey,o.label]))
 const option=(v:unknown)=>options.get(String(v))??String(v)
 if(question.type==='MATRIX'||question.type==='MATRIX_MULTIPLE'){
  const rows=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
  return question.rows.map(row=>{const v=rows[row.rowKey],reason=missing.get(itemKey+':'+row.rowKey)
   return row.label+'：'+(reason?missingText[reason]:v===undefined||v===null?'未填写或未展示':Array.isArray(v)?v.map(option).join('、'):option(v))}).join('；')
 }
 if(value===undefined||value===null)return '未填写或未展示'
 if(Array.isArray(value))return value.map(option).join('、')
 if(typeof value==='object')return Object.entries(value).map(([key,v])=>(question.rows.find(r=>r.rowKey===key)?.label??key)+'：'+(Array.isArray(v)?v.map(option).join('、'):option(v))).join('；')
 return option(value)
}
/** Rendering consumes already computed/stored facts; it never runs any scorer. */
export function renderPackageReport(spec:PackageReport,components:Array<{slotKey:string;unit:{ref:{kind:string};displayDefinition:unknown}}>,calculated:SurveyComputedFinal,keys:Record<string,string>){
 const metrics:ReportMetricFact[]=[],blocks:Array<{type:'TEXT';text:string}|{type:'METRIC';metricKey:string;label:string;display:'RAW'}>=[]
 const byComponent=new Map(components.map(c=>[c.slotKey,c])),byResult=new Map(calculated.units.map(u=>[u.instrumentKey,u]))
 const fields=new Map<string,Map<string,FormQuestion>>(),missing=new Map<string,Map<string,MissingItem['reason']>>(),metricFacts=new Map<string,Map<string,ReportMetricFact>>()
 let bytes=jsonBytes({title:spec.title,disclaimer:spec.disclaimer})+1024
 const append=(block:typeof blocks[number])=>{bytes+=jsonBytes(block)+1;assertPackageReportBytes(bytes);blocks.push(block)}
 if(spec.introduction)append({type:'TEXT',text:spec.introduction})
 spec.blocks.forEach((b,index)=>{
  if(b.type==='TEXT'){append(b);return}
  const component=byComponent.get(b.slotKey),result=byResult.get(keys[b.slotKey])
  if(!component||!result||result.notExecuted)throw new Error('组合报告缺少固定组件结果：'+b.slotKey)
  if(b.type==='FORM_FIELD'){
   if(component.unit.ref.kind!=='FORM')throw new Error('组合报告字段类型错误')
   if(!fields.has(b.slotKey))fields.set(b.slotKey,new Map((component.unit.displayDefinition as FormDraft).pages.flatMap(p=>p.questions).map(q=>[q.itemKey,q])))
   if(!missing.has(b.slotKey))missing.set(b.slotKey,new Map(result.missing.map(m=>[m.itemKey,m.reason])))
   const question=fields.get(b.slotKey)!.get(b.itemKey);if(!question)throw new Error('组合报告字段未固定')
   append({type:'TEXT',text:b.label+'：'+fieldDisplay(question,result.rawAnswers,missing.get(b.slotKey)!)})
  }else{
   if(!metricFacts.has(b.slotKey))metricFacts.set(b.slotKey,new Map(resultMetrics(result).map(m=>[m.metricKey,m])))
   const fact=metricFacts.get(b.slotKey)!.get(b.metricKey)
   if(!fact)throw new Error('组合报告指标不存在：'+b.slotKey+'/'+b.metricKey)
   const key='combined_'+index;metrics.push({...fact,metricKey:key});append({type:'METRIC',metricKey:key,label:b.label,display:'RAW'})
  }
 })
 return renderDeclaredReport({title:spec.title,blocks,limitations:[],...(spec.disclaimer?{disclaimer:spec.disclaimer}:{})},metrics,[])
}
