import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const scaleRuntime=vi.hoisted(()=>vi.fn())
vi.mock('../../modules/assessment-runtime/runtime-snapshot',async original=>({...await original<any>(),loadFrozenScaleRuntimeSnapshot:scaleRuntime}))
import {readReport} from '../../modules/bundle-product/analysis'
import {scaffoldPackage} from '../../modules/assessment-bundle/onboarding/template'
import {parseDeclarativePackage,type DerivedPackage} from '../../modules/assessment-bundle/onboarding/contract'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {compileBundleRuntimeFromFrozenRead} from '../../modules/assessment-bundle/compile'
import {projectBundleReportFacts} from '../../modules/assessment-bundle/report-facts'
import {createProductBundleAnalysisEngineRegistry} from '../../modules/assessment-bundle/bootstrap'
import {createCanonicalUnitResultEnvelope} from '../../modules/assessment-runtime/unit-result'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptCognitivePayload, decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {cognitiveSeeds} from '../../modules/cognitive/generated/seeds'
import {freezeAssignmentProfile,readFrozenReport} from '../../modules/cognitive/profile-freeze'
import {projectThreeLayerReport} from '../../modules/cognitive/v2/report'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import * as derivations from '../../modules/assessment-bundle/onboarding/derivations'

beforeEach(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64)))
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})
const h='a'.repeat(64),time='2026-11-01T00:00:00.000Z'
function fixture(hideBackwardDenominator=false){
 const raw:any=scaffoldPackage('b15_cognitive_disclosure_fixture')
 raw.schemaVersion=3;raw.manifest.packageSchemaVersion=3;raw.manifest.definition.engine.version='1.2.0'
 const specs=[['spatial','corsi',['trialCount','totalCorrectTrials','maxSpan']],['backward','digitbackward',['completedLevelCount','totalCorrectTrials','maxSpan']],['everyday','adexi_v1',['working_memory']]] as const
 raw.manifest.definition.slots=specs.map(([slotKey,instrumentKey,selectors],position)=>({slotKey,unitType:slotKey==='everyday'?'SCALE':'COGNITIVE',position,required:true,instrumentKey,instrumentVersion:slotKey==='everyday'?'2.0.0':'1.0.0',respondentType:'SELF',valueSelectors:[...selectors]}))
 raw.manifest.cognitiveDependencies=specs.slice(0,2).map(([slotKey])=>({slotKey,configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',profile:'standard'}))
 const mappings=[['spatial.n','spatial','trialCount','count'],['spatial.correct','spatial','totalCorrectTrials','count'],['spatial.span','spatial','maxSpan','count'],['backward.levels','backward','completedLevelCount','count'],['backward.correct','backward','totalCorrectTrials','count'],['backward.span','backward','maxSpan','level'],['everyday.wm','everyday','working_memory','points']]
 raw.evidence=mappings.map(([evidenceKey,slotKey,selector,unit])=>({evidenceKey,slotKey,selector,unit,valueType:'number',construct:evidenceKey,role:'PRIMARY',direction:'neutral',qualityPolicy:'interpretable_only'}))
 const coreKeys=['spatial.n','spatial.correct','backward.levels','backward.correct','everyday.wm']
 raw.rules={version:'1.0.0',derivations:[{key:'spatial.ratio',op:'RATIO',numerator:'spatial.correct',denominator:'spatial.n'},{key:'backward.n',op:'SCALE',input:'backward.levels',factor:2},{key:'backward.ratio',op:'RATIO',numerator:'backward.correct',denominator:'backward.levels',denominatorMultiplier:2}],items:[{ruleId:'joint',when:{op:'all',conditions:coreKeys.map(evidenceKey=>({op:'present',evidenceKey}))},kind:'cross_source_condition',text:'仅描述本次有效任务与日常体验，不作能力排名。',evidenceKeys:coreKeys,supportRefs:['design']}]}
 raw.scientific={maturity:'EXPERIMENTAL',scope:'Synthetic reader contract only',references:[{id:'design',citation:'Original synthetic Bundle text',allowedClaims:['cross_source_condition']}]}
 raw.report={...raw.report,narrativeContent:'BUNDLE_OWNED_SELF',rows:[
  {rowKey:'spatial',valueRef:{kind:'derived',key:'spatial.ratio'},denominatorRef:{kind:'evidence',key:'spatial.n'},label:'空间序列正确率',unit:'ratio',order:0},
  {rowKey:'backward_n',valueRef:{kind:'derived',key:'backward.n'},label:'倒背实际序列数',unit:'count',order:1},
  {rowKey:'backward',valueRef:{kind:'derived',key:'backward.ratio'},denominatorRef:{kind:'derived',key:'backward.n'},label:'倒背正确率',unit:'ratio',order:2},
  {rowKey:'everyday',valueRef:{kind:'evidence',key:'everyday.wm'},label:'工作记忆九项合计',unit:'sum',order:3}],
  blocks:[{blockId:'all',kind:'evidence',title:'本次记录',audience:['student'],ruleIds:['joint'],rowKeys:['spatial','backward_n','backward','everyday']}]}
 for(const f of Object.values(raw.fixtures) as any[]){f.values={};f.expectedRuleIds=[];f.expectedKind='COMPUTED'}
 const pack=parseDeclarativePackage(raw) as DerivedPackage,frozen=freezeBundleProductionDefinition(packageEntry(pack),{frozenAt:time,sourceReference:'synthetic-policy-reader'})
 const children:any[]=[],envelopes:any[]=[],rows:any[]=[],units:any[]=[],cognitiveSources:any[]=[]
 for(const [slotKey,task]of specs.slice(0,2)){
  const entry=requireCognitiveRegistryEntry(task,'1.0.0','1.0.0'),seed=cognitiveSeeds.find(s=>s.testType===task&&s.configVersion==='1.0.0')!
  const freeze=freezeAssignmentProfile({entry,baseConfig:seed.config,profile:'standard'}),fr=readFrozenReport(freeze.resolvedReportSnapshotEncrypted)!
  if(hideBackwardDenominator&&slotKey==='backward'){
   fr.participantPresentation!.reportReading!.hiddenByProfile={standard:['completedLevelCount']}
   freeze.resolvedReportSnapshotEncrypted=encryptCognitivePayload(fr)
  }
  const metrics=slotKey==='spatial'?{trialCount:12,totalCorrectTrials:8,maxSpan:8}:{completedLevelCount:6,totalCorrectTrials:6,maxSpan:7}
  const quality={state:'interpretable' as const,flags:{},reasons:[]},signature=canonicalHash({task,protocol:'synthetic'})
  const report=projectThreeLayerReport({testType:task,configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',protocolSignature:signature,profile:'standard',definition:fr.v2ReportDefinition!,metricDefinitions:fr.v2MetricDefinitions!,qualityDefinitions:fr.v2QualityDefinitions!,participantPresentation:fr.participantPresentation,metrics,score:{metrics,quality,audit:{trialCount:12,scorerVersion:'1.0.0'}},config:freeze.resolvedConfig as Record<string,unknown>})
  const result=JSON.parse(JSON.stringify({schemaVersion:1,completedAt:time,testType:task,configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',protocolSignature:signature,profile:'standard',metrics,quality,references:[],report,assessmentContext:null}))
  const core:any={schemaVersion:1,unitType:'COGNITIVE',instrumentKey:task,instrumentVersion:'1.0.0',sourceDefinitionHash:h,compilerVersion:'synthetic-1',compiledRuntimeHash:canonicalHash({task}),scorerKey:task+'.v1',scorerVersion:'1.0.0',quality:{status:'interpretable',flags:[]},metrics:Object.entries(metrics).map(([key,value])=>({key,value})),facts:[],references:[],contextHash:null,scientificProvenance:{instrumentKey:task,instrumentVersion:'1.0.0',protocolSignature:signature,profileKey:'standard',resolvedConfigHash:freeze.resolvedConfigHash}}
  const source={sourceType:'COGNITIVE_SESSION' as const,sourceAttemptId:'child-'+task,sourceSubmissionId:'submit-'+task}
  const envelope=createCanonicalUnitResultEnvelope({core,completedAt:time,persistenceProvenance:source,bundleBridge:{sourceResultHash:canonicalHash(result),metrics,hasReferenceNorms:false}})
  const child:any={id:source.sourceAttemptId,compositeAttemptId:'attempt',compositeItemId:'item-'+slotKey,assignmentId:'assignment-'+task,configId:'config-'+task,status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',submissionId:source.sourceSubmissionId,compiledRuntimeHash:core.compiledRuntimeHash,testType:task,configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',resultSnapshotEncrypted:encryptCognitivePayload(result),assignment:{id:'assignment-'+task,configId:'config-'+task,createdBy:'owner',profile:'standard',resolvedConfigHash:freeze.resolvedConfigHash,resolvedReportSnapshotEncrypted:freeze.resolvedReportSnapshotEncrypted}}
  children.push(child);envelopes.push(envelope)
  rows.push({compositeAttemptId:'attempt',attemptEpoch:1,slotKey:'cognitive:item-'+slotKey,unitType:'COGNITIVE',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',canonicalResultEncrypted:encryptUnifiedRuntimePayload(envelope),...source})
  units.push({itemId:'item-'+slotKey,family:'COGNITIVE',source:{kind:'COGNITIVE_CONFIG',id:child.configId,assignmentId:child.assignmentId,ownerId:'owner'},measurement:{releaseId:'11111111-1111-4111-8111-111111111111',contentHash:h,measurementHash:h}})
  cognitiveSources.push({slotKey,instrumentKey:task,instrumentVersion:'1.0.0',sourceResultHash:envelope.bundleBridge!.sourceResultHash,envelopeResultHash:envelope.resultHash,metrics,qualityState:'interpretable',hasReferenceNorms:false})
 }
 const policies={schemaVersion:1,policyVersion:'synthetic',unknownAudience:'DENY',audiences:{subject:DISCLOSURE_PRESETS.FULL_REPORT()}}
 const bindings={schemaVersion:1,slots:specs.map(([slotKey])=>({slotKey,itemId:'item-'+slotKey,unitType:slotKey==='everyday'?'SCALE':'COGNITIVE'})),context:[]}
 const instance={definitionHash:frozen.contentHash,definitionEncrypted:encryptCognitivePayload(frozen),bindingsHash:canonicalHash(bindings),bindingsEncrypted:encryptCognitivePayload(bindings)}
 const binding={schemaVersion:1,compositeId:'composite',attemptId:'attempt',epoch:1,publicationHash:h,units},bindingHash=canonicalHash(binding)
 const receipt={schemaVersion:1,attemptId:'attempt',epoch:1,aggregateInputHash:h,contentBindingHash:bindingHash,generatedAt:time,sources:units.map((u,i)=>({itemId:u.itemId,resultHash:envelopes[i].resultHash})),interpretation:{schemaVersion:1,contentBindingHash:bindingHash,units:units.map(u=>({instrumentKey:u.itemId,status:'NOT_SELECTED',references:[],report:{status:'NOT_SELECTED'}}))}}
 const parent={id:'attempt',status:'COMPLETED',attemptEpoch:1,compositeAssessmentId:'composite',aggregateInputHash:h,trainingContentBinding:binding,trainingContentBindingHash:bindingHash,trainingContentInterpretationEncrypted:encryptUnifiedRuntimePayload(receipt),trainingContentInterpretationHash:canonicalHash(receipt),compositeAssessment:{bundleInstance:instance}}
 const compiledRuntime=compileBundleRuntimeFromFrozenRead({family:'ASSESSMENT_BUNDLE',snapshotVersion:3,snapshot:frozen.bundleSnapshot})
 const facts=projectBundleReportFacts({registry:createProductBundleAnalysisEngineRegistry(),engineInput:{snapshot:frozen.bundleSnapshot,compiledRuntime,aggregateInputHash:null,evidence:[],contextFacts:null,cognitiveSources,scaleSources:[{slotKey:'everyday',instrumentKey:'adexi_v1',instrumentVersion:'2.0.0',sourceResultHash:h,envelopeResultHash:null,qualityState:'interpretable',scores:[{scoreKey:'working_memory',value:36,status:'calculated',criterionBandKey:null}]}],declarativePackage:pack}})
 scaleRuntime.mockResolvedValue({schemaVersion:2,definition:{report:{}},compiledPolicy:{disclosure:policies,runtimePolicyHash:h}})
 const db:any={compositeAssessmentAttempt:{findUnique:vi.fn(async()=>parent)},bundleAnalysis:{findUnique:vi.fn(async()=>({id:'saved',status:'READY',purpose:'INITIAL',targetDefinitionEncrypted:instance.definitionEncrypted,targetDefinitionHash:frozen.contentHash,payloadEncrypted:encryptCognitivePayload(facts),factsHash:canonicalHash(facts)}))},assessment:{findMany:vi.fn(async()=>[{compositeItemId:'item-everyday',runtimeSnapshotEncrypted:'scale'}])},assessmentUnitSnapshot:{findMany:vi.fn(async()=>rows)},cognitiveSession:{findUnique:vi.fn(async({where}:any)=>children.find(c=>c.id===where.id))}}
 return {db,parent,rows,children,envelopes}
}
async function read(f:ReturnType<typeof fixture>){return (await readReport('attempt','student',undefined,f.db)).view!}
function row(view:Awaited<ReturnType<typeof read>>,key:string){return view.derivedView!.rows.find(r=>r.rowKey===key)!}

describe('schema3 native frozen Cognitive disclosure',()=>{
 it('reads real Corsi/digitbackward frozen report metrics through the native reader without recalculating',async()=>{
  const f=fixture(),compute=vi.spyOn(derivations,'computeDerivedValues').mockImplementation(()=>{throw Error('saved read must not recalculate')})
  const view=await read(f)
  expect(row(view,'spatial')).toMatchObject({state:'present',value:8/12,denominator:12})
  expect(row(view,'backward')).toMatchObject({state:'present',value:.5,denominator:12})
  expect(row(view,'backward_n').value).toBe(12);expect(row(view,'everyday').value).toBe(36)
  expect(view.derivedView!.conclusions.map(c=>c.ruleId)).toContain('joint');expect(compute).not.toHaveBeenCalled()
  expect(JSON.stringify(view)).not.toContain('COGNITIVE_SESSION')
  for(const call of f.db.cognitiveSession.findUnique.mock.calls){expect(call[0].select).not.toHaveProperty('trials');expect(call[0].select).not.toHaveProperty('metricsEncrypted')}
 })
 it('withholds a ratio when its frozen denominator is absent from the task report, preserving the other task',async()=>{
  const f=fixture(true)
  const view=await read(f)
  expect(row(view,'backward')).toMatchObject({state:'redacted',value:null,denominator:null});expect(row(view,'spatial').value).toBe(8/12)
  expect(view.derivedView!.conclusions.map(c=>c.ruleId)).not.toContain('joint');expect(row(view,'everyday').value).toBe(36)
 })
 it('rejects a changed result snapshot whose source hash no longer matches accepted facts',async()=>{
  const f=fixture(),child=f.children[1],result=decryptCognitivePayload<any>(child.resultSnapshotEncrypted)
  result.metrics.totalCorrectTrials=12;child.resultSnapshotEncrypted=encryptCognitivePayload(result)
  const view=await read(f)
  expect(row(view,'backward').value).toBeNull();expect(row(view,'spatial').value).toBe(8/12)
 })
 it('rejects a foreign accepted child/item binding without hiding independent Scale evidence',async()=>{
  const f=fixture();f.children[0].compositeAttemptId='foreign-attempt'
  const view=await read(f)
  expect(row(view,'spatial').value).toBeNull();expect(row(view,'backward').value).toBe(.5);expect(row(view,'everyday').value).toBe(36)
 })
 it('does not infer Cognitive permission from raw metrics when no admission binding is available',async()=>{
  const f=fixture();f.parent.trainingContentBindingHash='f'.repeat(64)
  const view=await read(f)
  expect(row(view,'spatial').state).toBe('redacted');expect(row(view,'backward').state).toBe('redacted');expect(row(view,'everyday').value).toBe(36)
 })
})
