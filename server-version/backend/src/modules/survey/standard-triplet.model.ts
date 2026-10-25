import {canonicalHash} from '../assessment-runtime/canonical'
import {getScaleInstrumentSource,listScaleInstrumentSources} from '../scale/onboarding/instrument-registry'
import {snapshotScaleInstrumentSource} from '../scale/onboarding/source-snapshot'
import {validateScaleDefinition,hashScaleDefinition,type ScaleDefinitionV2} from '../scale/scale-definition'
import {getScaleCustomScorerKeys} from '../scale/scale-scoring'
import {validateReferenceSetDefinition,type AssessmentReferenceSetDefinition} from '../assessment-reference/reference'
import {canonicalScalePresentation} from './catalog-scale.presentation'
import {reportTemplateSchema,type ReportTemplate} from '../measurement-content/report-template'
import {toolReference,type ToolReference} from './tool-reference'
import type {CatalogSourceSnapshot} from './catalog.sources'
export type Axis='CONTENT'|'PARAMETERS'|'REPORT'
export type Part={axis:Axis;version:string;hash:string;payload:unknown;sourceVersion:string;reference:ToolReference}
export type Triplet={schemaVersion:1;toolKey:string;title:string;instrumentVersion:string;parts:Record<Axis,Part>;definition:ScaleDefinitionV2;references:AssessmentReferenceSetDefinition[];template:ReportTemplate|null;combinationHash:string;blockers:string[];reference:ToolReference}
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v))
export function sourceParts(toolKey:string,version:string):Part[]{
 const source=getScaleInstrumentSource(toolKey,version)
 if(!source?.executable)return []
 const {report,referencePolicy,source:provenance,license,...content}=source.executable.definition
 const reference=toolReference('SCALE',toolKey,{...snapshotScaleInstrumentSource({...source,executable:{...source.executable,scorerPlugins:source.executable.scorerPlugins??[]}}),originalProvenance:provenance,originalLicense:license})
 const make=(axis:Axis,label:string,payload:unknown):Part=>({axis,version:label,hash:canonicalHash(payload),payload:json(payload),sourceVersion:version,reference})
 return [make('CONTENT',version+':'+content.scoring.scoringVersion,content),make('PARAMETERS',source.executable.references.map(r=>r.referenceVersion).sort().join('+')||'none-v1',{referencePolicy,references:source.executable.references}),make('REPORT',report.reportVersion,report)]
}
export function registeredParts(key:string){
 const registered=listScaleInstrumentSources().filter(s=>s.identity.instrumentKey===key).flatMap(s=>sourceParts(key,s.identity.instrumentVersion))
 const source=registered.find(p=>p.axis==='CONTENT')
 if(source)for(const axis of ['PARAMETERS','REPORT'] as const)registered.push({axis,version:'none-v1',hash:canonicalHash(null),payload:null,sourceVersion:source.sourceVersion,reference:toolReference('SCALE',key,{explicitlyUnconfigured:true,axis})})
 return registered
}
export function composeTriplet(key:string,parts:Record<Axis,Part>):Triplet{
 const source=getScaleInstrumentSource(key,parts.CONTENT.sourceVersion)
 if(!source)throw new Error('工具来源版本不存在')
 const parameters=(parts.PARAMETERS.payload??{referencePolicy:{type:'none'},references:[]}) as {referencePolicy:ScaleDefinitionV2['referencePolicy'];references:AssessmentReferenceSetDefinition[]}
 const content=parts.CONTENT.payload as ScaleDefinitionV2
 // Compatibility envelope for the installed native scorer. It is never published
 // as a report or delivered as feedback when the approved report axis is empty.
 const noReport:ScaleDefinitionV2['report']={reportVersion:'none-v1',primaryScoreKeys:content.scoring.scores.map(s=>s.key),scoreOrder:content.scoring.scores.map(s=>s.key),interpretations:content.scoring.scores.map(s=>({scoreKey:s.key,headline:s.label,source:{type:'score_only'},summary:'本版本不配置报告或反馈。',bands:[],guidance:[]})),limitations:[],disclaimer:'本版本不配置报告或反馈。'}
 const definition={...json(parts.CONTENT.payload as object),source:json(source.executable!.definition.source),license:json(source.executable!.definition.license),report:json(parts.REPORT.payload??noReport),referencePolicy:json(parameters.referencePolicy)} as ScaleDefinitionV2
 const blockers:string[]=[]
 for(const axis of ['CONTENT','PARAMETERS','REPORT'] as const)if(parts[axis].axis!==axis||canonicalHash(parts[axis].payload)!==parts[axis].hash)blockers.push(axis+' 版本内容摘要不匹配')
 const validation=validateScaleDefinition(definition,{instrumentClass:'STANDARD',forPublish:false,scorerKeys:getScaleCustomScorerKeys()})
 blockers.push(...validation.issues.filter(i=>i.severity==='error').map(i=>i.path+'：'+i.message))
 if(definition.display.randomizeItems||definition.items.some(i=>i.randomizeOptions||i.type!=='single'))blockers.push('当前 Survey 播放器尚不支持该题目呈现配置')
 if(definition.items.length>500)blockers.push('单份量表超过当前 Survey 支持的 500 题')
 const scores=new Set(definition.scoring.scores.map(s=>s.key))
 for(const set of parameters.references){
  blockers.push(...validateReferenceSetDefinition(set).issues.filter(i=>i.severity==='error').map(i=>'参数 '+i.path+'：'+i.message))
  if(set.instrumentKey!==key||set.instrumentType!=='scale')blockers.push('参数所属工具不匹配')
  for(const entry of set.entries){
   if(!scores.has(entry.scoreKey)||entry.instrumentVersion!==parts.CONTENT.sourceVersion||entry.scoringVersion!==definition.scoring.scoringVersion)blockers.push('参数引用的内容、评分版本或指标不匹配')
   if(entry.governance&&entry.governance.measurementHash!==hashScaleDefinition(definition))blockers.push('参数绑定的测量内容版本不匹配')
  }
 }
 if(parameters.referencePolicy.type==='declared')for(const choice of parameters.referencePolicy.selections){
  const entry=parameters.references.find(r=>r.referenceVersion===choice.referenceVersion)?.entries.find(e=>e.scoreKey===choice.scoreKey&&e.referenceKind===choice.referenceKind)
  if(!entry)blockers.push('参数选择缺少对应的精确参考版本：'+choice.referenceVersion)
  const report=definition.report.interpretations.find(r=>r.scoreKey===choice.scoreKey)
  if(entry?.statistics.thresholds?.some(t=>!report?.bands.some(b=>b.key===t.key)))blockers.push('报告区间与参数阈值编码不匹配：'+choice.scoreKey)
 }
 const blocks:ReportTemplate['blocks']=[]
 if(parts.REPORT.payload!==null)for(const key of definition.report.scoreOrder){
  const score=definition.scoring.scores.find(s=>s.key===key),text=definition.report.interpretations.find(r=>r.scoreKey===key)
  if(!score||!text){blockers.push('报告缺少指标或解释：'+key);continue}
  blocks.push({type:'METRIC',metricKey:key,label:score.label,display:'RAW'},{type:'TEXT',text:text.headline+'\n'+text.summary})
  for(const guidance of text.guidance)blocks.push({type:'TEXT',text:guidance.text})
  const selected=parameters.referencePolicy.type==='declared'?parameters.referencePolicy.selections.filter(s=>s.scoreKey===key):[]
  for(const band of text.bands)for(const selection of selected)blocks.push({type:'REFERENCE_BAND',metricKey:key,referenceKind:selection.referenceKind,bandKey:band.key,text:band.label+'\n'+band.summary,guidance:band.guidance.map(g=>g.text)})
 }
 const template=parts.REPORT.payload===null?null:reportTemplateSchema.parse({title:source.catalog.identity.canonicalName,blocks,limitations:definition.report.limitations,disclaimer:definition.report.disclaimer})
 const reference=toolReference('SCALE',key,{content:parts.CONTENT.reference,parameters:parts.PARAMETERS.reference,report:parts.REPORT.reference})
 return {schemaVersion:1,toolKey:key,title:source.catalog.identity.canonicalName,instrumentVersion:parts.CONTENT.sourceVersion,parts:json(parts),definition,references:json(parameters.references),template,combinationHash:canonicalHash({toolKey:key,CONTENT:parts.CONTENT.hash,PARAMETERS:parts.PARAMETERS.hash,REPORT:parts.REPORT.hash}),blockers:[...new Set(blockers)],reference}
}
export function tripletSnapshot(triplet:Triplet,releaseId:string,measurement?:{releaseId:string;contentHash:string}):CatalogSourceSnapshot{
 const {display,mapping}=canonicalScalePresentation(triplet.definition,'ONE_BY_ONE')
 return {ref:{kind:'SCALE',sourceId:'survey-standard:'+releaseId,sourceVersion:triplet.combinationHash},title:triplet.title,displayDefinition:display,compiledDefinition:json(triplet.definition),definitionDigest:canonicalHash(triplet.definition),scoringDigest:canonicalHash(triplet.definition.scoring),adapterVersion:'survey-catalog-scale-v2',answerMapping:mapping,
 provenance:{instrumentClass:'STANDARD',standardInstrumentVersion:triplet.instrumentVersion,surveyStandardReleaseId:releaseId,code:triplet.toolKey,triplet:{CONTENT:triplet.parts.CONTENT.hash,PARAMETERS:triplet.parts.PARAMETERS.hash,REPORT:triplet.parts.REPORT.hash},toolReference:triplet.reference,reportConfigured:triplet.parts.REPORT.payload!==null,parametersConfigured:triplet.parts.PARAMETERS.payload!==null,...(measurement?{sourceMeasurementRelease:measurement}:{})}}
}
