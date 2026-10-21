import { trainingFlowProvenance } from './training-flow-scope'
import { createReportReadTemplateStore } from './composite-report-read-batch'
import type { TrainingAttemptScope } from './training-variant-scope'
import { trainingVariantProvenance } from './training-variant-export'
import { createHash } from 'node:crypto'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { parseCognitiveResultSnapshot, referencesForCognitiveResult } from '../cognitive/v2/result-snapshot'
import { sharedControlWritesEnabled } from '../assessment-runtime/shared-control-records'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { compactAssessmentStorageEnabled, encryptCompactField, decryptCompactField, isCompactEncryptedField } from '../assessment-runtime/compact-field-codec'
import { publicTemplates, type PublicTemplateStore } from '../assessment-runtime/public-templates'
import { decodeScaleFacts, assertScaleFactsBinding, restoreCompactScaleFacts, prefetchCompactScaleTemplates } from '../assessment-runtime/compact-scale-facts'
import { getScaleReportSourceRow } from '../assessment-runtime/compact-assessment-storage'
import { isScaleFactsReference, readLoadedScaleFactRecord, loadScaleFactRecords } from '../assessment-runtime/scale-fact-records'
import type { ReportJobIdentity } from '../assessment-runtime/report-outbox.service'
type Binding=ReportJobIdentity&{attemptId:string;aggregateInputHash:string}
type Manifest={kind:'COMPOSITE_REPORT_FACTS';version:1|2;binding:Binding;layout:string;personal:Record<string,unknown>;units:Array<{assessmentId?:string;sourceResultHash?:string;type?:'SCALE'|'COGNITIVE';sessionId?:string;sourceCipherHash?:string}>}
const headerKeys=['itemId','type','kind','scaleId','scaleCode','label','scaleName']
const pick=(v:any,keys:string[])=>Object.fromEntries(keys.filter(k=>Object.prototype.hasOwnProperty.call(v,k)).map(k=>[k,v[k]]))
const rootStatic=['assessmentId','name','productKind','reportMode']
const cipherHash=(value:string)=>createHash('sha256').update(value).digest('hex')
export const canStoreCompactCompositeReport=(report:any,children:any[],cognitive:any[]=[]):boolean=>compactAssessmentStorageEnabled()
  &&Array.isArray(report.unitReports)&&report.unitReports.length>0&&report.unitReports.every((u:any)=>!u.decryptError&&(
    u.type==='SCALE'&&children.some(c=>c.compositeItemId===u.itemId&&(isScaleFactsReference(c.result)||(typeof c.result==='string'&&isCompactEncryptedField(c.result))))
    ||sharedControlWritesEnabled()&&u.type==='COGNITIVE'&&cognitive.some(c=>c.compositeItemId===u.itemId&&typeof c.resultSnapshotEncrypted==='string'&&c.resultSnapshotEncrypted&&c.finishedAt)))


/** A cached report is authorized against the current verified allocation,
 * before loading any source facts. Its original field order remains untouched. */
export function assertTrainingVariantReportScope(report:any, scope?:TrainingAttemptScope):void {
  if(scope?.flow){
    if(canonicalHash(report.trainingFlow??null)!==canonicalHash(trainingFlowProvenance(scope.flow)))throw new Error('Flow report provenance mismatch')
    const ids=[...(report.unitReports??[]),...(report.backgroundValues??[])].map((r:any)=>r.itemId)
    if(new Set(ids).size!==ids.length||ids.some((id:string)=>!scope.itemIds.has(id)))throw new Error('Flow report includes unreachable item')
    return
  }
  if(report.trainingFlow!=null)throw new Error('Flow report path was not verified')
  if (!scope?.variant) {
    if (report.trainingVariant != null) throw new Error('Variant report allocation was not verified')
    return
  }
  if (canonicalHash(report.trainingVariant ?? null) !== canonicalHash(trainingVariantProvenance(scope))) throw new Error('Variant report provenance mismatch')
  const ids = [...(report.unitReports ?? []).map((row:any) => row.itemId), ...(report.backgroundValues ?? []).map((row:any) => row.itemId)]
  if (new Set(ids).size !== ids.length || ids.length !== scope.itemIds.size || ids.some(id => !scope.itemIds.has(id))) throw new Error('Variant report contains a missing or unselected item')
}

/** A manifest retains source/version binding; it never stores a second score set. */
export const encryptCompactCompositeReport=async(report:any,binding:Binding,children:any[],templates:PublicTemplateStore=publicTemplates,cognitive:any[]=[],scope?:TrainingAttemptScope):Promise<string>=>{
  assertTrainingVariantReportScope(report,scope)
  if(!canStoreCompactCompositeReport(report,children,cognitive))throw new Error('Compact report requires committed scale facts')
  const units:Manifest['units']=[],layoutUnits=[]
  for(const unit of report.unitReports){
    if(unit.type==='COGNITIVE'){
      const session=cognitive.find(c=>c.compositeItemId===unit.itemId)
      if(!session||session.attemptNo!==binding.attemptEpoch||!session.id||!session.resultSnapshotEncrypted)throw new Error('Cognitive report source binding mismatch')
      units.push({type:'COGNITIVE',sessionId:session.id,sourceCipherHash:cipherHash(session.resultSnapshotEncrypted)})
      layoutUnits.push({...pick(unit,['itemId','type','kind','label']),...(unit.__frozenMetricDefinitions?{frozenMetricDefinitions:unit.__frozenMetricDefinitions}:{})})
      continue
    }
    const child=children.find(c=>c.compositeItemId===unit.itemId)
    let source=getScaleReportSourceRow(unit.result)??readLoadedScaleFactRecord(child)
    if(!source&&isScaleFactsReference(child.result))source=(await loadScaleFactRecords([{id:child.id,attemptEpoch:child.result.e}]))[0]??null
    if(source){
      if(source.id!==child.id||source.attemptEpoch!==binding.attemptEpoch||source.submissionId!==child.submissionId||source.submissionPayloadHash!==child.submissionPayloadHash)throw new Error('Report fact binding mismatch')
      units.push({assessmentId:child.id,sourceResultHash:source.sourceResultHash})
    }else{
      const facts=decodeScaleFacts(child.result);if(!facts)throw new Error('Report fact source unavailable')
      assertScaleFactsBinding(facts,child);units.push({assessmentId:child.id,sourceResultHash:facts.sourceResultHash})
    }
    layoutUnits.push({...pick(unit,headerKeys),...(unit.__scaleProjectionPolicy?{scaleProjectionPolicy:unit.__scaleProjectionPolicy}:{})})
  }
  const [layout]=await templates.saveMany([{kind:'COMPOSITE_REPORT_LAYOUT',value:{version:1,root:pick(report,rootStatic),units:layoutUnits}}])
  const personal=Object.fromEntries(Object.entries(report).filter(([key])=>!rootStatic.includes(key)&&key!=='unitReports'))
  return encryptCompactField({kind:'COMPOSITE_REPORT_FACTS',version:units.some(u=>u.type==='COGNITIVE')?2:1,binding,layout,personal,units} satisfies Manifest)
}
export type CompactReportReadDependencies = {trainingVariantScope?:TrainingAttemptScope;templates?:PublicTemplateStore;readRows?:(binding:Binding,ids:string[])=>Promise<any[]>;readCognitiveRows?:(binding:Binding,ids:string[])=>Promise<any[]>}
const readManifest = (encrypted:string,binding:Binding):Manifest|null => {
  if(!isCompactEncryptedField(encrypted))return null
  const manifest=decryptCompactField<Manifest>(encrypted)
  if(manifest?.kind!=='COMPOSITE_REPORT_FACTS')return null
  if(![1,2].includes(manifest.version)||canonicalHash(manifest.binding)!==canonicalHash(binding)||manifest.personal?.id!==binding.attemptId
    ||!Array.isArray(manifest.units)||manifest.units.length<1||manifest.units.length>1000||new Set(manifest.units.map(u=>u.type==='COGNITIVE'?'c:'+u.sessionId:'s:'+u.assessmentId)).size!==manifest.units.length)throw new Error('Compact report binding invalid')
  return manifest
}

/** Verify all page manifests and selections before one fact/source read. The
 * returned callbacks cannot be reused with a different parent or source list. */
export async function preloadCompactCompositeReportReads(inputs:Array<{encrypted:string;binding:Binding;scope?:TrainingAttemptScope}>, sourceTemplates:PublicTemplateStore=publicTemplates):Promise<CompactReportReadDependencies> {
  const templates=createReportReadTemplateStore(sourceTemplates)
  const entries=inputs.flatMap(input=>{const manifest=readManifest(input.encrypted,input.binding);return manifest?[{...input,manifest}]:[]})
  const layouts=await templates.loadMany(entries.map(entry=>({hash:entry.manifest.layout,kind:'COMPOSITE_REPORT_LAYOUT' as const})))
  const scaleRequests:Array<{parent:string;epoch:number;id:string}>=[],cognitiveRequests:Array<{parent:string;epoch:number;id:string}>=[]
  const bindings=new Map<string,{scaleIds:string[];cognitiveIds:string[]}>()
  entries.forEach((entry,i)=>{
    const layout=layouts[i],manifest=entry.manifest
    if(layout?.version!==1||!Array.isArray(layout.units)||layout.units.length!==manifest.units.length)throw new Error('Compact report layout invalid')
    assertTrainingVariantReportScope({...layout.root,...manifest.personal,unitReports:layout.units},entry.scope)
    const scaleIds:string[]=[],cognitiveIds:string[]=[]
    for(const unit of manifest.units){
      if(unit.type==='COGNITIVE'&&unit.sessionId){cognitiveIds.push(unit.sessionId);cognitiveRequests.push({parent:entry.binding.attemptId,epoch:entry.binding.attemptEpoch,id:unit.sessionId})}
      else if((!unit.type||unit.type==='SCALE')&&unit.assessmentId){scaleIds.push(unit.assessmentId);scaleRequests.push({parent:entry.binding.attemptId,epoch:entry.binding.attemptEpoch,id:unit.assessmentId})}
      else throw new Error('Report source type invalid')
    }
    const key=canonicalHash(entry.binding)
    if(bindings.has(key))throw new Error('Duplicate report batch binding')
    bindings.set(key,{scaleIds,cognitiveIds})
  })
  const [scaleRows,cognitiveRows]=await Promise.all([
    scaleRequests.length?prisma.$queryRaw<any[]>`SELECT f.assessment_id AS id,a.composite_attempt_id AS "compositeAttemptId",a.composite_item_id AS "compositeItemId",f.attempt_epoch AS "attemptEpoch",
      f.submission_id AS "submissionId",f.payload_hash AS "submissionPayloadHash",f.source_result_hash AS "sourceResultHash",f.facts_encrypted AS "factsEncrypted",f.completed_at AS "completedAt",f.total_time AS "totalTime"
      FROM assessment_result_facts f JOIN assessments a ON a.id=f.assessment_id
      WHERE (a.composite_attempt_id,f.attempt_epoch,f.assessment_id) IN (${Prisma.join(scaleRequests.map(r=>Prisma.sql`(${r.parent},${r.epoch},${r.id})`))})`:[],
    cognitiveRequests.length?prisma.$queryRaw<any[]>`SELECT id,composite_attempt_id AS "compositeAttemptId",composite_item_id AS "compositeItemId",attempt_no AS "attemptEpoch",result_snapshot_encrypted AS "resultSnapshotEncrypted",finished_at AS "finishedAt"
      FROM cognitive_sessions WHERE (composite_attempt_id,attempt_no,id) IN (${Prisma.join(cognitiveRequests.map(r=>Prisma.sql`(${r.parent},${r.epoch},${r.id})`))})`:[],
  ])
  const indexRows=(rows:any[],requests:Array<{parent:string;epoch:number;id:string}>)=>{
    const expected=new Set(requests.map(r=>JSON.stringify([r.parent,r.epoch,r.id]))),indexed=new Map<string,any>()
    for(const row of rows){const key=JSON.stringify([row.compositeAttemptId,row.attemptEpoch,row.id]);if(!expected.has(key)||indexed.has(key))throw new Error('Report batch source ownership/version mismatch');indexed.set(key,row)}
    if(indexed.size!==expected.size)throw new Error('Report batch source unavailable')
    return indexed
  }
  const scales=indexRows(scaleRows,scaleRequests),cognitive=indexRows(cognitiveRows,cognitiveRequests)
  const facts=scaleRows.map(row=>{const fact=decodeScaleFacts(row.factsEncrypted);if(!fact||fact.sourceResultHash!==row.sourceResultHash)throw new Error('Compact report source version mismatch');assertScaleFactsBinding(fact,row);return fact})
  await prefetchCompactScaleTemplates(facts,templates,{canonical:false})
  const read=(binding:Binding,ids:string[],type:'scaleIds'|'cognitiveIds',rows:Map<string,any>)=>{
    const expected=bindings.get(canonicalHash(binding))
    if(!expected||canonicalHash(ids)!==canonicalHash(expected[type]))throw new Error('Report batch read binding mismatch')
    return ids.map(id=>rows.get(JSON.stringify([binding.attemptId,binding.attemptEpoch,id])))
  }
  return {templates,readRows:async(binding,ids)=>read(binding,ids,'scaleIds',scales),readCognitiveRows:async(binding,ids)=>read(binding,ids,'cognitiveIds',cognitive)}
}

export const decryptCompactCompositeReport=async(encrypted:string,binding:Binding,dependencies:CompactReportReadDependencies={}):Promise<any|null>=>{
  const manifest=readManifest(encrypted,binding)
  if(!manifest)return null
  const templates=dependencies.templates??publicTemplates
  const [layout]=await templates.loadMany([{hash:manifest.layout,kind:'COMPOSITE_REPORT_LAYOUT'}])
  if(layout?.version!==1||!Array.isArray(layout.units)||layout.units.length!==manifest.units.length)throw new Error('Compact report layout invalid')
  assertTrainingVariantReportScope({...layout.root,...manifest.personal,unitReports:layout.units},dependencies.trainingVariantScope)
  const scaleUnits=manifest.units.filter(u=>!u.type||u.type==='SCALE'),cognitiveUnits=manifest.units.filter(u=>u.type==='COGNITIVE')
  if(scaleUnits.length+cognitiveUnits.length!==manifest.units.length||manifest.units.some(u=>u.type==='COGNITIVE'?!u.sessionId:!u.assessmentId))throw new Error('Report source type invalid')
  const ids=scaleUnits.map(u=>u.assessmentId!)
  const rows=dependencies.readRows?await dependencies.readRows(binding,ids):ids.length?await prisma.$queryRaw<Array<any>>`SELECT f.assessment_id AS id,a.composite_item_id AS "compositeItemId",f.attempt_epoch AS "attemptEpoch",
    f.submission_id AS "submissionId",f.payload_hash AS "submissionPayloadHash",f.source_result_hash AS "sourceResultHash",f.facts_encrypted AS "factsEncrypted",f.completed_at AS "completedAt",f.total_time AS "totalTime"
    FROM assessment_result_facts f JOIN assessments a ON a.id=f.assessment_id
    WHERE f.assessment_id IN (${Prisma.join(ids)}) AND a.composite_attempt_id=${binding.attemptId}
      AND f.attempt_epoch=${binding.attemptEpoch}`:[]
  if(rows.length!==scaleUnits.length)throw new Error('Compact report source unavailable')
  const byId=new Map(rows.map(row=>[row.id,row])),facts=scaleUnits.map((unit)=>{
    const index=manifest.units.indexOf(unit)
    const row=byId.get(unit.assessmentId!);if(!row||row.compositeItemId!==layout.units[index].itemId)throw new Error('Compact report slot mismatch')
    const fact=decodeScaleFacts(row.factsEncrypted??row.result);if(!fact||fact.sourceResultHash!==unit.sourceResultHash||row.attemptEpoch!==binding.attemptEpoch||(row.sourceResultHash&&fact.sourceResultHash!==row.sourceResultHash))throw new Error('Compact report source version mismatch')
    assertScaleFactsBinding(fact,row);return fact
  })
  await prefetchCompactScaleTemplates(facts,templates,{canonical:false})
  const cognitiveRows=cognitiveUnits.length?(dependencies.readCognitiveRows?await dependencies.readCognitiveRows(binding,cognitiveUnits.map(u=>u.sessionId!)):await prisma.$queryRaw<any[]>`SELECT id,composite_item_id AS "compositeItemId",attempt_no AS "attemptEpoch",result_snapshot_encrypted AS "resultSnapshotEncrypted",finished_at AS "finishedAt"
    FROM cognitive_sessions WHERE id IN (${Prisma.join(cognitiveUnits.map(u=>u.sessionId!))}) AND composite_attempt_id=${binding.attemptId} AND attempt_no=${binding.attemptEpoch}`):[]
  if(cognitiveRows.length!==cognitiveUnits.length)throw new Error('Cognitive report source unavailable')
  const cognitiveById=new Map(cognitiveRows.map(row=>[row.id,row])),unitReports=[]
  let scaleIndex=0
  for(let i=0;i<manifest.units.length;i++){
    const source=manifest.units[i],meta=layout.units[i]
    if(source.type==='COGNITIVE'){
      const row=cognitiveById.get(source.sessionId),{frozenMetricDefinitions,...header}=meta
      if(!row||row.attemptEpoch!==binding.attemptEpoch||row.compositeItemId!==meta.itemId||typeof row.resultSnapshotEncrypted!=='string'||cipherHash(row.resultSnapshotEncrypted)!==source.sourceCipherHash)throw new Error('Cognitive report source version mismatch')
      const snapshot=parseCognitiveResultSnapshot(decryptCognitivePayload(row.resultSnapshotEncrypted)),references=referencesForCognitiveResult(snapshot)
      const unit={...header,sessionId:row.id,testType:snapshot.testType,score:null,metrics:snapshot.metrics,qualityFlags:snapshot.quality.flags,quality:snapshot.quality,
        finishedAt:row.finishedAt,reference:references[0],references,assessmentContext:snapshot.assessmentContext,singleTaskReport:snapshot.report}
      if(frozenMetricDefinitions)Object.defineProperty(unit,'__frozenMetricDefinitions',{value:frozenMetricDefinitions,enumerable:false})
      unitReports.push(unit);continue
    }
    const row=byId.get(source.assessmentId!)!,{scaleProjectionPolicy,...header}=meta
    const {result}=await restoreCompactScaleFacts(facts[scaleIndex++],{canonical:false,reportOnly:sharedControlWritesEnabled()},templates)
    const unit={...header,assessmentId:source.assessmentId,completedAt:row.completedAt,totalTime:row.totalTime,method:result.method,caveats:result.caveats,disclaimer:result.disclaimer,
      result,quality:result.quality,scores:result.scores,references:result.references,interpretations:result.interpretations}
    if(scaleProjectionPolicy)Object.defineProperty(unit,'__scaleProjectionPolicy',{value:scaleProjectionPolicy,enumerable:false})
    unitReports.push(unit)
  }
  return {...layout.root,...manifest.personal,unitReports}
}
