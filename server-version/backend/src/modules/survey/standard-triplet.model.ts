import {frozenScaleInstructionSchema,type FrozenScaleInstruction} from '../assessment-runtime/frozen-scale-instruction'
import {canonicalHash} from '../assessment-runtime/canonical'
import {standardAxisHashes,standardCombinationHash,compileStandardCombinationReport,selectedStandardReport} from '../measurement-content/standard-combination'
import {databaseContentSource,importedMeasurementPayload,importedNativeDefinition} from '../scale/component-import/native-source'
import {validateReportTemplateBindings} from '../measurement-content/report-template'
import {standardReportParameterBlockers} from '../measurement-content/standard-report-parameters'
import {getScaleInstrumentSource,listScaleInstrumentSources} from '../scale/onboarding/instrument-registry'
import {snapshotScaleInstrumentSource,scaleSourceAxisPayloads} from '../scale/onboarding/source-snapshot'
import {listScaleReportVariants} from '../scale/onboarding/report-variants'
import {validateScaleDefinition,hashScaleDefinition,type ScaleDefinitionV2} from '../scale/scale-definition'
import {getScaleCustomScorerKeys} from '../scale/scale-scoring'
import {validateReferenceSetDefinition,type AssessmentReferenceSetDefinition} from '../assessment-reference/reference'
import {canonicalScalePresentation} from './catalog-scale.presentation'
import type {ReportTemplate} from '../measurement-content/report-template'
import {toolReference,type ToolReference} from './tool-reference'
import type {CatalogSourceSnapshot} from './catalog.sources'
export type Axis='CONTENT'|'PARAMETERS'|'REPORT'
export type Part={axis:Axis;version:string;hash:string;payload:unknown;sourceVersion:string;reference:ToolReference}
export type Triplet={schemaVersion:1;toolKey:string;title:string;instrumentVersion:string;parts:Record<Axis,Part>;definition:ScaleDefinitionV2;references:AssessmentReferenceSetDefinition[];template:ReportTemplate|null;combinationHash:string;blockers:string[];reference:ToolReference}
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v))
export function sourceParts(toolKey:string,version:string):Part[]{
 const source=getScaleInstrumentSource(toolKey,version)
 if(!source?.executable)return []
 const {report,parameters:{referencePolicy},provenance,license,content}=scaleSourceAxisPayloads(source)
 const reference=toolReference('SCALE',toolKey,{...snapshotScaleInstrumentSource({...source,executable:{...source.executable,scorerPlugins:source.executable.scorerPlugins??[]}}),originalProvenance:provenance,originalLicense:license})
 const make=(axis:Axis,label:string,payload:unknown):Part=>({axis,version:label,hash:canonicalHash(payload),payload:json(payload),sourceVersion:version,reference})
 return [make('CONTENT',version+':'+content.scoring.scoringVersion,content),make('PARAMETERS',source.executable.references.map(r=>r.referenceVersion).sort().join('+')||'none-v1',{referencePolicy,references:source.executable.references}),make('REPORT',report.reportVersion,report)]
}
export function registeredParts(key:string){
 const registered=listScaleInstrumentSources().filter(s=>s.identity.instrumentKey===key).flatMap(s=>sourceParts(key,s.identity.instrumentVersion))
 for(const source of listScaleInstrumentSources().filter(s=>s.identity.instrumentKey===key&&s.executable))for(const variant of listScaleReportVariants(source))registered.push({axis:'REPORT',version:variant.report.reportVersion,hash:canonicalHash(variant.report),payload:json(variant.report),sourceVersion:source.identity.instrumentVersion,
  reference:toolReference('SCALE',key,{identity:source.identity,reportVariant:{key:variant.key,title:variant.title,baseContentHash:variant.baseContentHash,baseParametersHash:variant.baseParametersHash,materialHash:variant.materialHash,origin:variant.origin},report:variant.report,originalProvenance:source.executable!.definition.source,originalLicense:source.executable!.definition.license})})
 const source=registered.find(p=>p.axis==='CONTENT')
 if(source)for(const axis of ['PARAMETERS','REPORT'] as const)registered.push({axis,version:'none-v1',hash:canonicalHash(null),payload:null,sourceVersion:source.sourceVersion,reference:toolReference('SCALE',key,{explicitlyUnconfigured:true,axis})})
 return registered
}
export function composeTriplet(key:string,parts:Record<Axis,Part>):Triplet{
 const source=getScaleInstrumentSource(key,parts.CONTENT.sourceVersion)
 const imported=databaseContentSource(parts.CONTENT),metadata=parts.CONTENT.reference.metadata
 if(imported&&(imported.toolKey!==key||imported.instrumentVersion!==parts.CONTENT.sourceVersion||imported.contentHash!==parts.CONTENT.hash||canonicalHash(metadata)!==parts.CONTENT.reference.metadataHash))throw new Error('数据库工具来源身份不匹配')
 if(!source&&!imported)throw new Error('工具来源版本不存在')
 const parameters=(parts.PARAMETERS.payload??{referencePolicy:{type:'none'},references:[]}) as {referencePolicy:ScaleDefinitionV2['referencePolicy'];references:AssessmentReferenceSetDefinition[]}
 const content=importedMeasurementPayload(parts.CONTENT) as ScaleDefinitionV2
 if(imported)importedNativeDefinition(parts.CONTENT)
 // Compatibility envelope for the installed native scorer. It is never published
 // as a report or delivered as feedback when the approved report axis is empty.
 const noReport:ScaleDefinitionV2['report']={reportVersion:'none-v1',primaryScoreKeys:content.scoring.scores.map(s=>s.key),scoreOrder:content.scoring.scores.map(s=>s.key),interpretations:content.scoring.scores.map(s=>({scoreKey:s.key,headline:s.label,source:{type:'score_only'},summary:'本版本不配置报告或反馈。',bands:[],guidance:[]})),limitations:[],disclaimer:'本版本不配置报告或反馈。'}
 const selectedReport=selectedStandardReport(parts.REPORT.payload)
 const definition={...json(content),source:json(imported?metadata.originalProvenance:source!.executable!.definition.source),license:json(imported?metadata.originalLicense:source!.executable!.definition.license),report:json(selectedReport.definition??noReport),referencePolicy:json(parameters.referencePolicy)} as ScaleDefinitionV2
 const blockers:string[]=[]
 for(const axis of ['CONTENT','PARAMETERS','REPORT'] as const)if(parts[axis].axis!==axis||canonicalHash(parts[axis].payload)!==parts[axis].hash)blockers.push(axis+' 版本内容摘要不匹配')
 const validation=validateScaleDefinition(definition,{instrumentClass:'STANDARD',forPublish:false,scorerKeys:getScaleCustomScorerKeys()})
 blockers.push(...validation.issues.filter(i=>i.severity==='error').map(i=>i.path+'：'+i.message))
 if(!imported){
  if(definition.display.randomizeItems||definition.items.some(i=>i.randomizeOptions||i.type!=='single'))blockers.push('当前 Survey 播放器尚不支持该题目呈现配置')
  if(definition.items.length>500)blockers.push('单份量表超过当前 Survey 支持的 500 题')
 }
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
 }
 blockers.push(...standardReportParameterBlockers(definition,parameters.references,parts.REPORT.payload!==null,selectedReport.template))
 const variant=parts.REPORT.reference.metadata.reportVariant as {title?:unknown}|undefined
 const baseTitle=imported?String(metadata.title):source!.catalog.identity.canonicalName
 const title=typeof variant?.title==='string'?baseTitle+' · '+variant.title:baseTitle
 const compiled=compileStandardCombinationReport(title,definition,parts.REPORT.payload!==null)
 const template=selectedReport.template??compiled.template,reportBlockers=compiled.blockers
 if(template)try{validateReportTemplateBindings(template,definition.scoring.scores.map(s=>s.key),selectedReport.assetRefs.map(a=>a.assetId))}catch(e){blockers.push(e instanceof Error?e.message:'报告引用不存在的指标或素材')}
 blockers.push(...reportBlockers)
 const reference=toolReference('SCALE',key,{content:parts.CONTENT.reference,parameters:parts.PARAMETERS.reference,report:parts.REPORT.reference})
 return {schemaVersion:1,toolKey:key,title,instrumentVersion:parts.CONTENT.sourceVersion,parts:json(parts),definition,references:json(parameters.references),template,combinationHash:standardCombinationHash(key,standardAxisHashes(parts)),blockers:[...new Set(blockers)],reference}
}
/** The approved CONTENT source already contains its versioned instruction.
 * Resolve from that immutable record; registry/default changes are not inputs. */
export function frozenTripletInstruction(triplet:Triplet):FrozenScaleInstruction|null{
 const reference=triplet.parts.CONTENT.reference
 if(canonicalHash(reference.metadata)!==reference.metadataHash)throw new Error('STANDARD_CONTENT_REFERENCE_HASH_MISMATCH')
 const instruction=reference.metadata.instruction
 if(instruction===undefined)return null
 if(!instruction||typeof instruction!=='object')throw new Error('STANDARD_INSTRUCTION_SOURCE_INVALID')
 const value=instruction as Record<string,unknown>
 return frozenScaleInstructionSchema.parse({text:value.text,language:value.language,version:value.version,origin:'INSTRUMENT_SOURCE'})
}
export function tripletSnapshot(triplet:Triplet,releaseId:string,measurement?:{releaseId:string;contentHash:string}):CatalogSourceSnapshot{
 const {display,mapping}=canonicalScalePresentation(triplet.definition,'ONE_BY_ONE'),instruction=frozenTripletInstruction(triplet)
 return {ref:{kind:'SCALE',sourceId:'survey-standard:'+releaseId,sourceVersion:triplet.combinationHash},title:triplet.title,...(instruction?{instruction:instruction.text}:{}),displayDefinition:display,compiledDefinition:json(triplet.definition),definitionDigest:canonicalHash(triplet.definition),scoringDigest:canonicalHash(triplet.definition.scoring),adapterVersion:'survey-catalog-scale-v2',answerMapping:mapping,
 provenance:{instrumentClass:'STANDARD',standardInstrumentVersion:triplet.instrumentVersion,surveyStandardReleaseId:releaseId,code:triplet.toolKey,triplet:standardAxisHashes(triplet.parts),toolReference:triplet.reference,reportConfigured:triplet.parts.REPORT.payload!==null,parametersConfigured:triplet.parts.PARAMETERS.payload!==null,...(measurement?{sourceMeasurementRelease:measurement}:{})}}
}
