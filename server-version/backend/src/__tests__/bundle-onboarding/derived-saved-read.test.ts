import {it,expect,vi,beforeAll,afterAll} from 'vitest'
const runtime=vi.hoisted(()=>vi.fn())
vi.mock('../../modules/assessment-runtime/runtime-snapshot',async original=>({...await original<any>(),loadFrozenScaleRuntimeSnapshot:runtime}))
import {derivedAdapterFixture} from './derived-adapter.fixture'
import {readReport} from '../../modules/bundle-product/analysis'
import {readEducationNativeBundleFeedback} from '../../modules/bundle-product/education-adapter'
import {compileBundleRuntimeFromFrozenRead} from '../../modules/assessment-bundle/compile'
import {buildBundleContextFactsFromValues} from '../../modules/assessment-bundle/context'
import {projectBundleReportFacts} from '../../modules/assessment-bundle/report-facts'
import {createProductBundleAnalysisEngineRegistry} from '../../modules/assessment-bundle/bootstrap'
import {encryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as derivations from '../../modules/assessment-bundle/onboarding/derivations'
beforeAll(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64)))
afterAll(()=>vi.unstubAllEnvs())
function fixture(){
 const {frozen,pack,result,native}=derivedAdapterFixture()
 const bindings={schemaVersion:1,slots:pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE').map(s=>({slotKey:s.slotKey,unitType:s.unitType,itemId:'item-'+s.slotKey,scaleDisclosure:native.policies[s.slotKey]})),context:[]}
 const instance={definitionHash:frozen.contentHash,definitionEncrypted:encryptCognitivePayload(frozen),bindingsHash:canonicalHash(bindings),bindingsEncrypted:encryptCognitivePayload(bindings)}
 const scaleSources=bindings.slots.map(s=>{const slot=pack.manifest.definition.slots.find(x=>x.slotKey===s.slotKey)!,scored=result.units.find(u=>u.instrumentKey===s.slotKey)!.privateScoring as any
  return {slotKey:s.slotKey,instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,sourceResultHash:'1'.repeat(64),envelopeResultHash:null,qualityState:'interpretable',profileIdentity:{runtimeDefinitionHash:'2'.repeat(64),scoringVersion:'1.0.0',sourceResultId:'synthetic',qualityFlags:[]},scores:scored.scores.map((v:any)=>({scoreKey:v.key,value:v.value,status:v.status,criterionBandKey:null}))}})
 const contextFacts=buildBundleContextFactsFromValues({definition:frozen.contextDefinition!,values:{grade_level:9,course_code:'00123',adult_confirmed:true},frozenAt:frozen.frozenAt})
 const compiledRuntime=compileBundleRuntimeFromFrozenRead({family:'ASSESSMENT_BUNDLE',snapshotVersion:3,snapshot:frozen.bundleSnapshot})
 const facts=projectBundleReportFacts({registry:createProductBundleAnalysisEngineRegistry(),engineInput:{snapshot:frozen.bundleSnapshot,compiledRuntime,aggregateInputHash:null,evidence:[],contextFacts,scaleSources:scaleSources as any,declarativePackage:pack}})
 runtime.mockImplementation(async(key:string)=>({schemaVersion:2,definition:{report:{audienceContract:{audience:'student',respondent:'STUDENT_SELF'}}},compiledPolicy:{disclosure:native.policies[key].disclosure,runtimePolicyHash:'3'.repeat(64)}}))
 const db={compositeAssessmentAttempt:{findUnique:vi.fn().mockResolvedValue({attemptEpoch:1,compositeAssessment:{bundleInstance:instance}})},bundleAnalysis:{findUnique:vi.fn().mockResolvedValue({id:'saved',status:'READY',purpose:'INITIAL',targetDefinitionEncrypted:instance.definitionEncrypted,targetDefinitionHash:frozen.contentHash,payloadEncrypted:encryptCognitivePayload(facts),factsHash:canonicalHash(facts)})},assessment:{findMany:vi.fn().mockResolvedValue(bindings.slots.map(s=>({compositeItemId:s.itemId,runtimeSnapshotEncrypted:s.slotKey})))}}
 return {instance,db,native,facts,identity:{definitionHash:instance.definitionHash,bindingsHash:instance.bindingsHash,sourceBindingsHash:instance.bindingsHash}}
}
it('reads validated saved schema3 facts through the shared projector without recomputing or exposing context',async()=>{
 const {db}=fixture(),compute=vi.spyOn(derivations,'computeDerivedValues').mockImplementation(()=>{throw Error('must not recalculate saved results')})
 try{
  const report=await readReport('attempt','student',undefined,db as any)
  expect(report.view?.derivedView?.rows.map(r=>r.value)).toEqual([2.2,5,5])
  expect(report.view?.derivedView?.conclusions[0].text).toBe('获准的独立说明')
  expect(JSON.stringify(report.view?.derivedView)).not.toContain('00123')
  expect(compute).not.toHaveBeenCalled()
 }finally{compute.mockRestore()}
})
it('intersects Education current item/metric availability before projecting, preserving independent rows',async()=>{
 const {db,instance,identity}=fixture()
 const input={attemptId:'attempt',instance,identity,availableItemIds:new Set(['item-ase']),metricKeys:new Set(['academic_self_efficacy']),metricKeysByItem:new Map([['item-ase',new Set(['academic_self_efficacy'])]]),db:db as any}
 const result=await readEducationNativeBundleFeedback(input)
 expect(result).toMatchObject({status:'READY',derivedView:{rows:[{rowKey:'ase',state:'present',value:2.2},{rowKey:'value',state:'redacted',value:null},{rowKey:'cost',state:'redacted',value:null}]}})
 db.bundleAnalysis.findUnique.mockClear()
 expect(await readEducationNativeBundleFeedback({...input,availableItemIds:new Set()})).toMatchObject({status:'WITHHELD'})
 expect(db.bundleAnalysis.findUnique).not.toHaveBeenCalled()
})
it('masks legacy summary quality when a frozen admission policy forbids its details',async()=>{
 const {db,native}=fixture()
 native.policies.ase=structuredClone(native.policies.ase)
 native.policies.ase.disclosure.audiences.subject!.resultQualityDetails=false
 const report=await readReport('attempt','student',undefined,db as any)
 expect(report.view?.quality).toEqual({overall:'unavailable',notes:[]})
 expect(report.view?.evidence.find(e=>e.evidenceKey==='ase.efficacy')?.quality).toBe('unavailable')
 expect(report.view?.derivedView?.rows.find(r=>r.rowKey==='ase')?.value).toBe(2.2)
 expect(report.view?.derivedView?.rows.find(r=>r.rowKey==='ase')).not.toHaveProperty('quality')
})
