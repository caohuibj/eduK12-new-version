import {beforeEach, describe, expect, it, vi} from 'vitest'
const db=vi.hoisted(()=>({$queryRaw:vi.fn(),assessmentUnitSnapshot:{findMany:vi.fn()},assessment:{findMany:vi.fn()}}))
vi.mock('../../config/database',()=>({prisma:db}))
import {createPublicTemplateStore,publicTemplates,type PublicTemplateRow} from '../../modules/assessment-runtime/public-templates'
import {prepareCompactScaleFacts,decodeScaleFacts} from '../../modules/assessment-runtime/compact-scale-facts'
import {encryptCompactField,decryptCompactField} from '../../modules/assessment-runtime/compact-field-codec'
import {buildScaleResult} from '../../modules/scale/scale-result'
import {listScalePackages} from '../../modules/scale/scale-package.registry'
import {encryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createHash} from 'node:crypto'
import {preloadCompactCompositeReportReads,decryptCompactCompositeReport} from '../../modules/composite/compact-composite-report'
import {preloadCompositeReportFacts} from '../../modules/composite/composite-report-read-batch'
import {createSharedScaleRuntimeStore,type SharedScaleArtifactRecord} from '../../modules/assessment-runtime/shared-scale-runtime'
import {createFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {withTrainingTimingReport} from '../../modules/composite/training-timing-report'
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','c'.repeat(64));db.assessmentUnitSnapshot.findMany.mockResolvedValue([])})
async function fixture(){
 const storage=new Map<string,PublicTemplateRow>(),repo={read:vi.fn(async(hashes:string[])=>hashes.flatMap(hash=>storage.has(hash)?[storage.get(hash)!]:[])),append:async(rows:PublicTemplateRow[])=>{for(const row of rows)storage.set(row.templateHash,row)}}
 const write=createPublicTemplateStore(repo),pkg=listScalePackages().find(pkg=>pkg.goldenCases.some(c=>c.expected.quality))!,gold=pkg.goldenCases.find(c=>c.expected.quality)!
 const result=buildScaleResult({scaleId:'scale',instrumentKey:pkg.key,name:pkg.key,instrumentVersion:pkg.instrumentVersion,definition:pkg.definition,answers:gold.answers,referenceSets:pkg.references})
 const sources:any[]=[],cognitive:any[]=[],inputs:any[]=[],attempts:any[]=[]
 for(let index=0;index<3;index++){
  const parent=`parent-${index}`,id=`assessment-${index}`,submissionId=`submission-${index}`,payloadHash='a'.repeat(64)
  const factsEncrypted=await prepareCompactScaleFacts({result,itemOrder:pkg.definition.items.map(item=>item.itemCode),binding:{assessmentId:id,attemptEpoch:1,submissionId,payloadHash}},write)
  const row={id,compositeAttemptId:parent,compositeItemId:'scale-item',attemptEpoch:1,submissionId,submissionPayloadHash:payloadHash,sourceResultHash:decodeScaleFacts(factsEncrypted)!.sourceResultHash,factsEncrypted,completedAt:'2026-10-18T00:00:00Z',totalTime:0}
  sources.push(row)
  const snapshot={schemaVersion:1,completedAt:'2026-10-18T00:00:00Z',testType:'gng',configVersion:'1',engineVersion:'1',scoringVersion:'1',protocolSignature:'b'.repeat(64),profile:'research',metrics:{rt:1.125},quality:{state:'interpretable',flags:{},reasons:[]},references:[],report:{},assessmentContext:null}
  const session={id:`session-${index}`,compositeAttemptId:parent,compositeItemId:'cog-item',attemptEpoch:1,resultSnapshotEncrypted:encryptCognitivePayload(snapshot),finishedAt:snapshot.completedAt};cognitive.push(session)
  const [layout]=await write.saveMany([{kind:'COMPOSITE_REPORT_LAYOUT',value:{version:1,root:{assessmentId:'composite',name:'Report'},units:[{itemId:'scale-item',type:'SCALE'},{itemId:'cog-item',type:'COGNITIVE'}]}}])
  const binding={attemptId:parent,attemptEpoch:1,slotSetHash:'b'.repeat(64),contextHash:null,aggregateInputHash:'d'.repeat(64)}
  inputs.push({binding,encrypted:encryptCompactField({kind:'COMPOSITE_REPORT_FACTS',version:2,binding,layout,personal:{id:parent,backgroundValues:[]},units:[{assessmentId:id,sourceResultHash:row.sourceResultHash},{type:'COGNITIVE',sessionId:session.id,sourceCipherHash:createHash('sha256').update(session.resultSnapshotEncrypted).digest('hex')}]})})
  attempts.push({id:parent,attemptEpoch:1,runtimeGeneration:'UNIFIED_V1',trainingVariantAllocationEncrypted:null,trainingVariantAllocationHash:null,compositeAssessment:{id:'composite',trainingVariantDraft:null,trainingVariantFrozen:null,trainingVariantDigest:null,items:[{id:'scale-item',type:'SCALE'}],formSections:[]},scaleAssessments:[{...row,result:{k:'SFF1',e:1}}]})
 }
 db.$queryRaw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join('').includes('FROM cognitive_sessions')?cognitive:sources)
 return {sources,cognitive,inputs,attempts,repo,result,write,read:createPublicTemplateStore(repo,{entries:1,bytes:1024})}
}
describe('bounded report source batches',()=>{
 it('reads scale/cognitive sources and cold layouts/templates once for three compact reports despite tiny shared cache',async()=>{
  const f=await fixture();f.repo.read.mockClear()
  const deps=await preloadCompactCompositeReportReads(f.inputs,f.read)
  const reports=await Promise.all(f.inputs.map(input=>decryptCompactCompositeReport(input.encrypted,input.binding,deps)))
  expect(reports.map(report=>report.unitReports[0].scores)).toEqual([f.result.scores,f.result.scores,f.result.scores])
  expect(reports.map(report=>report.unitReports[1].metrics.rt)).toEqual([1.125,1.125,1.125])
  expect(db.$queryRaw).toHaveBeenCalledTimes(2);expect(f.repo.read).toHaveBeenCalledTimes(2)
  await expect(deps.readRows!({...f.inputs[0].binding,attemptId:'other'},[f.sources[0].id])).rejects.toThrow('binding')
 })
 it.each(['parent','epoch','item','digest'])('rejects %s drift in compact batch without cross-parent fallback',async mode=>{
  const f=await fixture()
  if(mode==='parent')f.sources[0].compositeAttemptId='other'
  if(mode==='epoch')f.cognitive[0].attemptEpoch=2
  if(mode==='item')f.sources[0].compositeItemId='unselected'
  if(mode==='digest')f.sources[0].sourceResultHash='0'.repeat(64)
  await expect((async()=>{const deps=await preloadCompactCompositeReportReads(f.inputs,f.read);return decryptCompactCompositeReport(f.inputs[0].encrypted,f.inputs[0].binding,deps)})()).rejects.toThrow()
 })
 it('loads fallback scale facts once and binds preloaded values to each exact parent',async()=>{
  const f=await fixture();f.repo.read.mockClear()
  const spy=vi.spyOn(publicTemplates,'loadMany').mockImplementation(requests=>f.read.loadMany(requests))
  try{
   const read=await preloadCompositeReportFacts(f.attempts)
   expect(f.attempts.map(attempt=>read(attempt).scaleResults.get(attempt.scaleAssessments[0]).scores)).toEqual([f.result.scores,f.result.scores,f.result.scores])
   expect(db.$queryRaw).toHaveBeenCalledTimes(1);expect(f.repo.read).toHaveBeenCalledTimes(1)
   expect(()=>read({...f.attempts[0]})).toThrow('identity')
   f.attempts[0].scaleAssessments[0].submissionPayloadHash='changed';expect(()=>read(f.attempts[0])).toThrow('identity')
  }finally{spy.mockRestore()}
 })
 it('preloads shared runtime artifacts in one source query and retains their original per-attempt bindings',async()=>{
  const f=await fixture(),artifacts=new Map<string,SharedScaleArtifactRecord>()
  const runtimeStore=createSharedScaleRuntimeStore({find:async hash=>artifacts.get(hash)??null,insert:async row=>{artifacts.set(row.artifactHash,row);return true}})
  const source=getScaleInstrumentSource('adexi_v1','2.0.0')!,expected=[]
  for(let index=0;index<f.attempts.length;index++){
   const runtime=createFrozenScaleRuntimeSnapshot({instrumentKey:'adexi_v1',instrumentVersion:'2.0.0',definition:source.executable!.definition,frozenAt:new Date(`2026-10-18T00:00:0${index}Z`)})
   expected.push(runtime);f.attempts[index].scaleAssessments[0].runtimeSnapshotEncrypted=await runtimeStore.save(runtime)
  }
  db.$queryRaw.mockImplementation(async(parts:TemplateStringsArray)=>parts.join('').includes('assessment_runtime_artifacts')?[...artifacts.values()]:f.sources)
  const spy=vi.spyOn(publicTemplates,'loadMany').mockImplementation(requests=>f.read.loadMany(requests))
  try{
   const read=await preloadCompositeReportFacts(f.attempts)
   expect(f.attempts.map(attempt=>read(attempt).scaleRuntimes.get(attempt.scaleAssessments[0]))).toEqual(expected)
   expect(db.$queryRaw.mock.calls.filter(([parts])=>parts.join('').includes('assessment_runtime_artifacts'))).toHaveLength(1)
   f.attempts[0].scaleAssessments[0].runtimeSnapshotEncrypted='changed';expect(()=>read(f.attempts[0])).toThrow('identity')
  }finally{spy.mockRestore()}
 })
 it('keeps legacy compact materialization free of a null variant field',async()=>{
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true');vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','true');vi.stubEnv('ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED','true')
  const f=await fixture(),attempt=f.attempts[0],binding=f.inputs[0].binding
  Object.assign(attempt,{status:'COMPLETED',aggregateInputHash:binding.aggregateInputHash,frozenActiveSlotSetHash:binding.slotSetHash,contextSnapshotHash:null,cognitiveSessions:[],formAnswers:[],completedAt:'2026-10-18T00:00:00Z',totalTime:0})
  Object.assign(attempt.compositeAssessment,{productKind:'QUESTIONNAIRE',name:'Legacy',reportPackageKey:null,analysisProtocolKey:null})
  Object.assign(attempt.compositeAssessment.items[0],{scaleId:'scale',scale:{code:f.result.instrument.code,name:'Scale'}})
  attempt.scaleAssessments[0].scale={code:f.result.instrument.code,instrumentVersion:f.result.instrument.instrumentVersion,instrumentClass:'CUSTOM_DESCRIPTIVE'}
  const load=vi.spyOn(publicTemplates,'loadMany').mockImplementation(requests=>f.read.loadMany(requests)),save=vi.spyOn(publicTemplates,'saveMany').mockImplementation(values=>f.write.saveMany(values))
  try{
   const {materializeCompositeQuestionnaireReport}=await import('../../modules/composite/composite.service')
   const data=await materializeCompositeQuestionnaireReport(attempt.id,{attemptEpoch:1,slotSetHash:binding.slotSetHash,contextHash:null},{committed:{parent:attempt},units:new Map()} as any,attempt)
   const manifest=decryptCompactField<any>(data.reportEncrypted)
   expect(manifest.kind).toBe('COMPOSITE_REPORT_FACTS');expect(manifest.personal).not.toHaveProperty('trainingVariant')
  }finally{load.mockRestore();save.mockRestore();vi.unstubAllEnvs()}
 })
 it('reuses selected timing children only with matching parent and epoch',async()=>{
  const parent={id:'parent',trainingTimingSnapshot:null,compositeAssessment:{productKind:'QUESTIONNAIRE',timingExportEnabled:true}}
  await withTrainingTimingReport({unitReports:[]},parent,'teacher',{attemptEpoch:1,children:[]})
  expect(db.assessment.findMany).not.toHaveBeenCalled()
  await expect(withTrainingTimingReport({},parent,'teacher',{attemptEpoch:1,children:[{compositeAttemptId:'other',compositeItemId:'scale',attemptEpoch:1}]})).rejects.toThrow('binding')
 })
})
