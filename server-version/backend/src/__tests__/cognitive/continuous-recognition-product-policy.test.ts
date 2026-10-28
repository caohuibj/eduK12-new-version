import {describe,it,expect} from 'vitest'
import {freezeCandidate} from '../../modules/cognitive/content-candidates/continuous-recognition/protocol'
import {createRecognitionSnapshot,recognitionDefinition} from '../../modules/cognitive/content-candidates/continuous-recognition/package'
import {recognitionTrialEnvelope,scoreNativeRecognition,projectNativeRecognitionReport,type AssetManifestBinding} from '../../modules/cognitive/content-candidates/continuous-recognition/native'
import {computeConfigSnapshotHash,computeProtocolSignature} from '../../modules/cognitive/v2/canonical'
const binding:AssetManifestBinding={status:'authorized',manifestHash:'f'.repeat(64),evidenceRef:'TRUSTED-SERVICE-UNIT-FIXTURE-ONLY; NO REAL ASSET CLEARANCE'}
function fixture(profile:'research'|'experience'='experience',rights:AssetManifestBinding=binding,hits=16,fa=5,jitter=0){
 const q={profile,seed:'product-policy',formalAssetIds:Array.from({length:184},(_,i)=>'logic-'+i),practiceAssetIds:Array.from({length:6},(_,i)=>'practice-'+i)},f=freezeCandidate(q)
 const session=createRecognitionSnapshot(profile,q.formalAssetIds,q.practiceAssetIds,undefined,rights)
 const hitIds=new Set(f.manifest.targetPairs.slice(0,hits).map(p=>p.repeatIndex)),faIds=new Set(f.manifest.targetPairs.slice(0,fa).map(p=>p.firstIndex));let now=100
 const trials=f.manifest.formal.map(p=>{const start=now,offset=start+750+(p.index===4?jitter:0),end=offset+800;now=end
 return recognitionTrialEnvelope({record:{index:p.index,assetId:p.assetId,kind:p.kind,imageOnsetMs:start,imageOffsetMs:offset,windowEndMs:end,status:'complete',interruptions:[]},events:hitIds.has(p.index)||faIds.has(p.index)?[{id:'event-'+p.index,atMs:start+100,action:'seen',input:'touch',key:null,isRepeat:false}]:[],startedAtPerfMs:start,endedAtPerfMs:end,recordOrigin:'live',telemetryOverflow:false})})
 return{config:session.config,session,randomSeed:q.seed,trials}
}
describe('recognition product report policy 0.2',()=>{
 it.each(['research','experience'] as const)('allows complete authorized %s records without norms or physical timing certificate',(profile)=>{
  const a=fixture(profile,binding,profile==='research'?48:16,profile==='research'?15:5,16.6),s=scoreNativeRecognition(a),p=projectNativeRecognitionReport(s)
  expect(p).toMatchObject({state:'interpretable',reportVersion:'0.2.0',scoringVersion:'0.2.0',qualityRule:'product-session-descriptive-0.2.0',hitRate:.8,falseAlarmRate:.25,correctedRecognitionRate:.55,denominator:profile==='research'?60:20,interpretationScope:'this-session-descriptive-only'})
  expect(s.quality.flags).not.toHaveProperty('researchReviewRequired');expect(p.configHash).toBe(a.session.configHash)
 })
 it('keeps negative CRR and normal silent new pictures/missed repeats valid',()=>{
  const p=projectNativeRecognitionReport(scoreNativeRecognition(fixture('experience',binding,6,10)))
  expect(p.state).toBe('interpretable');expect(p.correctedRecognitionRate).toBeCloseTo(-.2)
  const zero=projectNativeRecognitionReport(scoreNativeRecognition(fixture('experience',binding,0,0)))
  expect(zero).toMatchObject({state:'interpretable',hitRate:0,falseAlarmRate:0,correctedRecognitionRate:0,denominator:20})
 })
 it.each(['pending','synthetic-review-only'] as const)('does not treat %s material as authorized',(status)=>{
  const p=projectNativeRecognitionReport(scoreNativeRecognition(fixture('experience',{...binding,status})))
  expect(p.state).toBe('limited');expect([p.hitRate,p.falseAlarmRate,p.correctedRecognitionRate,p.denominator]).toEqual([null,null,null,null])
 })
 it('default config remains unlicensed and cannot silently opt into report authority',()=>{
  const a=fixture();const c=createRecognitionSnapshot('experience',a.config.formalAssetIds,a.config.practiceAssetIds)
  expect(c.config.assetManifestBinding.status).toBe('pending')
  const p=projectNativeRecognitionReport(scoreNativeRecognition({...a,config:c.config,session:c}));expect(p.hitRate).toBeNull()
 })
 it('incomplete/empty records keep limited/invalid and null denominator',()=>{
  const a=fixture();a.trials=a.trials.slice(0,90);expect(projectNativeRecognitionReport(scoreNativeRecognition(a))).toMatchObject({state:'limited',hitRate:null,denominator:null})
  a.trials=[];expect(projectNativeRecognitionReport(scoreNativeRecognition(a))).toMatchObject({state:'invalid',hitRate:null,denominator:null})
 })
 it('technical loss removes the same target pair from HR/FAR and hides whole-task rates',()=>{
  const a=fixture();const first=a.trials.find(e=>e.payload.record.kind==='target-first')!;first.flags.timeout=true
  const s=scoreNativeRecognition(a),p=projectNativeRecognitionReport(s)
  expect(s.metrics.completeTargetPairs).toBe(19);expect(s.metrics.hitRate).toBe(15/19);expect(s.metrics.falseAlarmRate).toBe(4/19)
  expect(p).toMatchObject({state:'limited',hitRate:null,falseAlarmRate:null,correctedRecognitionRate:null})
 })
 it.each(['client-review','hash','config','old-tuple','duplicate-event'])('rejects %s instead of bypassing authority',(problem)=>{
  const a:any=fixture()
  if(problem==='client-review')a.researchReview={decision:'allow-descriptive-research'}
  if(problem==='hash')a.session.configHash='0'.repeat(64)
  if(problem==='config')a.config={...a.config,assetManifestBinding:{...binding,status:'pending'}}
  if(problem==='old-tuple'){
   a.session.scoringVersion='0.1.0';a.session.configVersion='0.1.0';a.session.protocol.key='continuous-recognition/0.1.0/0.1.0';a.session.protocolSignature=computeProtocolSignature(a.session.protocol)
   delete a.session.config.qualityRule;delete a.session.config.assetManifestBinding;a.session.configHash=computeConfigSnapshotHash(a.session.config);a.config=a.session.config
  }
  if(problem==='duplicate-event'){
   const es=a.trials.filter((e:any)=>e.payload.events.length);es[1].payload.events[0].id=es[0].payload.events[0].id
  }
  expect(()=>scoreNativeRecognition(a)).toThrow()
 })
 it.each(['rates','quality-rule','asset','scorer','flags'])('projection rejects inconsistent %s',(problem)=>{
  const s:any=scoreNativeRecognition(fixture())
  if(problem==='rates')s.metrics.hitRate=.99
  if(problem==='quality-rule')s.metrics.reportPolicy.qualityRule='old'
  if(problem==='asset')s.metrics.reportPolicy.assetManifestBinding.status='synthetic-review-only'
  if(problem==='scorer')s.audit.scorerVersion='0.1.0'
  if(problem==='flags')s.quality.flags={}
  expect(projectNativeRecognitionReport(s).hitRate).toBeNull()
 })
 it('declares descriptive metrics/quality/report separately without fake total score or reference',()=>{
  expect(recognitionDefinition.scoringVersion).toBe('0.2.0');expect(recognitionDefinition.report.version).toBe('0.2.0');expect(recognitionDefinition.report.userMetrics).toContain('correctedRecognitionRate')
  expect(Object.keys(scoreNativeRecognition(fixture()).metrics).every(key=>key in recognitionDefinition.metrics)).toBe(true);expect(recognitionDefinition.references).toEqual([]);expect(recognitionDefinition.metrics.correctedRecognitionRate.direction).toBe('signed')
 })
})
