import type {SurveyNativeBundle} from '../bundle-product/survey-native'
import {governedMediaBlocker} from './governed-tool.media'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {reportTemplateSchema,validateReportTemplateBindings,type ReportTemplate} from '../measurement-content/report-template'
import {prepareRelease,type ReleaseInput} from '../measurement-content/release'
import {scaleMeasurementRelease} from '../measurement-content/scale'
import {sjtMeasurementRelease} from '../measurement-content/sjt'
import {cognitiveMeasurementRelease} from '../measurement-content/cognitive'
import {parseFrozenSurveyCognitive} from './cognitive.definition'
import {assertSurveyDraft,type FormDraft,type SurveyKind} from './builder.definition'
import {toolReference,type ToolReference} from './tool-reference'
import type {CatalogSourceSnapshot} from './catalog.sources'
import type {ResearchFrozenUnit} from './publication.service'
import type {StoredRelease} from '../measurement-content/repository'
import {packageReportWorstCaseBytes,assertPackageReportBytes} from './governed-package.budget'
export const governedFamily=z.enum(['SCALE','COGNITIVE','SJT','FORM','COMBINATION','BUNDLE'])
export type GovernedFamily=z.infer<typeof governedFamily>
export type UnitFamily=SurveyKind
export const packageReportSchema=z.object({version:z.string().trim().min(1).max(120),title:z.string().trim().min(1).max(200),introduction:z.string().trim().max(20000).default(''),
 blocks:z.array(z.discriminatedUnion('type',[
  z.object({type:z.literal('METRIC'),slotKey:z.string().min(1).max(80),metricKey:z.string().min(1).max(240),label:z.string().trim().min(1).max(300)}).strict(),
  z.object({type:z.literal('FORM_FIELD'),slotKey:z.string().min(1).max(80),itemKey:z.string().min(1).max(240),label:z.string().trim().min(1).max(300)}).strict(),
  z.object({type:z.literal('TEXT'),text:z.string().trim().min(1).max(20000)}).strict(),
 ])).max(200),disclaimer:z.string().trim().max(20000).default(''),
}).strict()
export type PackageReport=z.infer<typeof packageReportSchema>
export type GovernedParameter=Extract<StoredRelease,{layer:'REFERENCE'}>&{sourceMeasurementHash:string}
export type GovernedArtifact={nativeBundle?:SurveyNativeBundle;schemaVersion:1;family:GovernedFamily;toolKey:string;version:string;title:string;
 unit:CatalogSourceSnapshot|null;parameters:GovernedParameter|null;report:{version:string;template:ReportTemplate;audience?:'student'|'researcher'}|null;
 components:Array<{slotKey:string;title:string;source:{type:'STANDARD'|'GOVERNED';id:string;hash:string};unit:CatalogSourceSnapshot}>;
 packageReport:PackageReport|null;reference:ToolReference}
export type GovernedRow={id:string;family:GovernedFamily;tool_key:string;tool_version:string;title:string;snapshot:GovernedArtifact;snapshot_hash:string;reference:ToolReference;
 submitted_by:string;submitted_at:Date;state:'SUBMITTED'|'RETURNED'|'APPROVED'|'TRIAL_RUNNING'|'TRIAL_FAILED'|'ONLINE'|'WITHDRAWN';version:number;approved_by:string|null;approved_at:Date|null;approval_reason:string|null;reason:string;latest_trial:string|null;lease_until:Date|null;blockers:string[];measurement_release:{releaseId:string;contentHash:string}|null}
export const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
export const packageFamily=(family:GovernedFamily)=>family==='COMBINATION'||family==='BUNDLE'
export function snapshotUnit(snapshot:CatalogSourceSnapshot,id='trial-unit',key='tool'):ResearchFrozenUnit{
 return {draftId:id,instrumentKey:key,kind:snapshot.ref.kind,title:snapshot.title,draftRevision:1,sourceDigest:snapshot.definitionDigest,scoringDigest:snapshot.scoringDigest,
 compiledDefinition:clone(snapshot.compiledDefinition),displayDefinition:clone(snapshot.displayDefinition),...(snapshot.answerMapping?{sourceAnswerMapping:clone(snapshot.answerMapping)}:{}),...(snapshot.instruction?{instruction:snapshot.instruction}:{}),
 ...(snapshot.nativeSituational?{executionProtocol:snapshot.nativeSituational.protocol,nativeSituational:clone(snapshot.nativeSituational)}:{}),
 sourceProvenance:{...clone(snapshot.provenance),source:clone(snapshot.ref)}}
}
export function governedMeasurementInput(unit:ResearchFrozenUnit,scope:ReleaseInput['scope'],localId:string,version:string):ReleaseInput{
 if(unit.kind==='FORM')throw new Error('表单没有测量、参数或报告发布层')
 const source=unit.sourceProvenance?.source as {sourceVersion?:string}|undefined
 const instrumentVersion=String(unit.sourceProvenance?.governedInstrumentVersion??unit.sourceProvenance?.standardInstrumentVersion??source?.sourceVersion??unit.draftRevision)
 if(unit.kind==='COGNITIVE'){const f=parseFrozenSurveyCognitive(unit.compiledDefinition),s=f.sessionSnapshot;return cognitiveMeasurementRelease({localId,version,scope,testType:s.testType,configVersion:s.configVersion,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,config:s.config,protocolContext:{timingPolicy:f.timingPolicy,devicePolicy:f.devicePolicy,restartLimit:f.restartLimit}})}
 if(unit.kind==='SJT')return sjtMeasurementRelease({localId,version,instrumentVersion,definition:unit.compiledDefinition,displayProtocol:unit.displayDefinition,scope,provenance:{governedSource:source??null}})
 return scaleMeasurementRelease({localId,version,instrumentVersion,definition:unit.compiledDefinition,instrumentClass:unit.sourceProvenance?.instrumentClass==='STANDARD'?'STANDARD':'CUSTOM_DESCRIPTIVE',presentationMode:(unit.displayDefinition as {presentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE'}).presentationMode??'ALL_AT_ONCE',scope,provenance:{governedSource:source??null}})
}
export function artifactMetrics(artifact:GovernedArtifact){
 if(!artifact.unit||artifact.unit.ref.kind==='FORM')return []
 const input=prepareRelease(governedMeasurementInput(snapshotUnit(artifact.unit),{kind:'PLATFORM'},artifact.toolKey,artifact.version))
 return input.layer==='MEASUREMENT'?input.content.metrics:[]
}
export function artifactBlockers(a:GovernedArtifact):string[]{
 const blockers:string[]=[]
 try{
  if(packageFamily(a.family)){
   if(a.unit||a.parameters||a.report)blockers.push('组合不能伪装成单个工具的三层版本')
   if(a.components.filter(c=>c.unit.ref.kind==='COGNITIVE').length>4)blockers.push('当前单次 Survey 最多运行 4 个受控认知任务')
   if(!a.components.length||a.components.length>30)blockers.push('组合需要 1–30 个固定组件')
   if(new Set(a.components.map(c=>c.slotKey)).size!==a.components.length)blockers.push('组合组件编码重复')
   if(a.family==='COMBINATION'&&a.packageReport)blockers.push('单纯组合没有组合报告；有组合报告时请选择组合包')
   if(a.family==='BUNDLE'&&!a.packageReport&&!a.nativeBundle)blockers.push('组合包缺少组合报告设计')
   if(a.packageReport&&!a.packageReport.introduction.trim()&&!a.packageReport.blocks.length)blockers.push('组合报告需要说明或至少一个报告区块')
   if(a.packageReport){for(const b of a.packageReport.blocks){if(b.type==='TEXT')continue
    const component=a.components.find(c=>c.slotKey===b.slotKey)
    if(!component){blockers.push('组合报告引用了不存在的组件：'+b.slotKey);continue}
    if(b.type==='METRIC'){
     if(component.unit.ref.kind==='FORM'){blockers.push('表单字段不能冒充评分指标：'+b.slotKey);continue}
     const measurement=prepareRelease(governedMeasurementInput(snapshotUnit(component.unit),{kind:'PLATFORM'},b.slotKey,'1'))
     if(measurement.layer!=='MEASUREMENT'||!measurement.content.metrics.some(m=>m.metricKey===b.metricKey))blockers.push('组合报告指标不存在：'+b.slotKey+'/'+b.metricKey)
    }else{
     if(component.unit.ref.kind!=='FORM'||!(component.unit.displayDefinition as FormDraft).pages.some(p=>p.questions.some(q=>q.itemKey===b.itemKey)))blockers.push('组合报告表单字段不存在：'+b.slotKey+'/'+b.itemKey)
    }
   }
    assertPackageReportBytes(packageReportWorstCaseBytes(a.packageReport,a.components,a.title))
   }
  }else{
   if(a.unit){const media=governedMediaBlocker(a.unit);if(media)blockers.push(media)}
   if(!a.unit||a.unit.ref.kind!==a.family)blockers.push('工具类型与内容版本不一致')
   if(a.components.length||a.packageReport)blockers.push('单个工具不承载组合绑定')
   if(a.family==='FORM'){
    if(a.parameters||a.report)blockers.push('表单没有参数和报告')
    if(a.unit)assertSurveyDraft('FORM',a.unit.displayDefinition,true)
   }else if(a.unit){
    const prepared=prepareRelease(governedMeasurementInput(snapshotUnit(a.unit),{kind:'PLATFORM'},a.toolKey,a.version))
    if(prepared.layer!=='MEASUREMENT')throw new Error('测量层类型错误')
    const metrics=prepared.content.metrics.map(m=>m.metricKey)
    if(a.parameters){
     if(a.parameters.family!==a.family||a.parameters.status!=='PUBLISHED')blockers.push('参数类型或发布状态不匹配')
     for(const e of a.parameters.content.entries)if(!metrics.includes(e.metricKey))blockers.push('参数引用未知指标：'+e.metricKey)
     for(const item of a.parameters.content.entries){const e=item.definition as unknown as import('../assessment-reference/reference').AssessmentReferenceEntry;if(e.instrumentVersion!==prepared.content.instrumentVersion||e.scoringVersion!==prepared.content.scoringVersion)blockers.push('参数引用的内容或计分版本不匹配');if(e.governance&&e.governance.measurementHash!==a.parameters.sourceMeasurementHash)blockers.push('参数的测量指纹绑定不一致')}
     const original=a.parameters.sourceMeasurementHash
     if(original!==prepared.content.measurementHash)blockers.push('参数绑定的测量内容版本不匹配')
    }
    if(a.report){validateReportTemplateBindings(reportTemplateSchema.parse(a.report.template),metrics,[]);for(const b of a.report.template.blocks)if(b.type==='REFERENCE_BAND'&&!a.parameters?.content.entries.some(e=>e.metricKey===b.metricKey&&e.referenceKind===b.referenceKind&&(e.definition as unknown as import('../assessment-reference/reference').AssessmentReferenceEntry).statistics.thresholds?.some(t=>t.key===b.bandKey)))blockers.push('报告区间未对应已配置的参数阈值：'+b.metricKey)}
   }
  }
 }catch(e){blockers.push(e instanceof Error?e.message:'内容版本或运行格式不完整')}
 return [...new Set(blockers)]
}
export function artifactReference(family:GovernedFamily,key:string,metadata:Record<string,unknown>){return toolReference(family,key,metadata)}
export function governedPolicyIdentity(row:Pick<GovernedRow,'id'|'snapshot_hash'>){return {resourceKey:'governed-release:'+row.id,fingerprint:row.snapshot_hash}}
export function governedSnapshot(row:GovernedRow):CatalogSourceSnapshot{
 if(!row.snapshot.unit||packageFamily(row.family))throw new Error('组合只能整包导入，禁止按单个工具使用')
 const s=clone(row.snapshot.unit)
 return {...s,ref:{kind:s.ref.kind,sourceId:'survey-tool:'+row.id,sourceVersion:row.snapshot_hash},provenance:{...s.provenance,surveyToolReleaseId:row.id,governedInstrumentVersion:s.ref.sourceVersion,
 reportConfigured:row.snapshot.report!==null,...(row.snapshot.report?{reportAudience:row.snapshot.report.audience??'researcher'}:{}),parametersConfigured:row.snapshot.parameters!==null,toolReference:row.reference,...(row.measurement_release?{sourceMeasurementRelease:row.measurement_release}:{})}}
}
export const isGovernedSource=(id:string)=>id.startsWith('survey-tool:')
