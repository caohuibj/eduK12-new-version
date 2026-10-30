import {createCodeBundleDefinitionProvider} from '../../modules/bundle-product/code-catalog'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {encryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import {randomUUID} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {educationTrackingChoices,educationTrackingSchema,freezeEducationTracking,inheritEducationTrackingBindings} from '../../modules/reporting/education-personal-tracking'
import {privateCompositionDefinitionSchema} from '../../modules/education-tools/private-tool.composition-contracts'
import {trainingTrackingMeasurementIdentity} from '../../modules/composite/personal-tracking'
const reads=vi.hoisted(()=>({releases:new Map<string,any>()}))
vi.mock('../../modules/measurement-content/repository',async original=>({...await original<object>(),getContentRelease:vi.fn(async(_db:any,id:string)=>reads.releases.get(id))}))
function source(){
 const id=randomUUID(),owner=randomUUID(),origin={schemaVersion:1,adapterVersion:'1.0.0',mode:'COMPOSITION',entry:'TEACHER',organizationId:randomUUID(),ownerUserId:owner,toolId:randomUUID(),versionId:randomUUID(),contentHash:'d'.repeat(64),variantKey:'TEACHER:SELF'}
 const families=['SCALE','COGNITIVE','SJT'] as const,units=families.map((family,index)=>{
  const releaseId=randomUUID(),metricKey=family==='COGNITIVE'?'mean_rt_ms':'total',measurementHash=String(index+1).repeat(64)
  reads.releases.set(releaseId,{layer:'MEASUREMENT',status:'PUBLISHED',contentHash:'a'.repeat(64),content:{measurementHash,metrics:[{metricKey,unit:family==='COGNITIVE'?'ms':'points'}]}})
  return {itemId:randomUUID(),family,source:{kind:family==='SCALE'?'SCALE':family==='COGNITIVE'?'COGNITIVE_CONFIG':'SJT_AUTHOR_RELEASE',id:randomUUID(),ownerId:owner,...(family==='COGNITIVE'?{assignmentId:randomUUID()}:family==='SJT'?{instrumentKey:'synthetic-sjt',instrumentVersion:'1.0.0'}:{})},measurement:{releaseId,contentHash:'a'.repeat(64),measurementHash}}
 })
 const manifest=units.map(unit=>({blockId:randomUUID(),instruction:'',kind:unit.family,versionId:randomUUID(),contentHash:'b'.repeat(64),sourceProvider:unit.family==='SCALE'?'PRIVATE_VERSION':unit.family==='COGNITIVE'?'COGNITIVE_CONFIG':'SJT_RELEASE',toolId:randomUUID(),itemIds:[unit.itemId],sectionIds:[]}))
 const snapshot={schemaVersion:1,compositeId:id,units,educationBinding:{schemaVersion:1,origin,sealed:true,manifest}}
 const row={id,trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot),bundleInstance:null,items:units.map(unit=>({id:unit.itemId,type:unit.family==='SJT'?'SITUATIONAL':unit.family,scale:unit.family==='SCALE'?{name:'Scale A',definition:{scoring:{scores:[{key:'total',label:'Total'}]}}}:null,cognitiveAssignment:unit.family==='COGNITIVE'?{title:'Reaction',profile:'research'}:null,situationalInstrumentKey:unit.family==='SJT'?'Scenario':null}))}
 const none={mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]},individual={mode:'INDIVIDUAL_SUMMARY',metricKeys:['total','mean_rt_ms'],longitudinalMetricKeys:['total','mean_rt_ms']}
 const policy:any={family:'BUNDLE',subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],runtimeLaunchTarget:{kind:'COMPOSITE',ref:id},resultDisclosure:{schemaVersion:1,policyKey:'synthetic',minimumRespondents:null,audiences:{RESPONDENT:individual,SUBJECT:none,PARENT:none,TEACHER:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}},educationComposition:{origin,manifestHash:canonicalHash(snapshot),unitReports:manifest.map(block=>({blockId:block.blockId,versionId:block.versionId,contentHash:block.contentHash,respondent:individual}))}}
 const db:any={compositeAssessment:{findUnique:vi.fn(async()=>row)}}
 return {row,policy,db,units,manifest,track:{id:randomUUID(),resourcePolicy:policy}}
}
describe('Education exact leaf tracking and independent disclosure',()=>{
 it('keeps identical total keys in separate leaves and freezes the actual cognitive profile',async()=>{
  const f=source(),choices=await educationTrackingChoices(f.db,[f.track])
  expect(choices.map(c=>c.kind)).toEqual(['SCALE','COGNITIVE','SJT']);expect(choices.filter(c=>c.scoreKey==='total').map(c=>c.itemId)).toHaveLength(2)
  expect(choices[1].measurementHash).toBe(trainingTrackingMeasurementIdentity(f.units[1] as any,{cognitiveAssignment:{profile:'research'}}))
  f.row.items[1].cognitiveAssignment!.profile='experience';expect((await educationTrackingChoices(f.db,[f.track]))[1].measurementHash).not.toBe(choices[1].measurementHash)
  for(const rule of f.policy.educationComposition.unitReports)rule.respondent={...rule.respondent,longitudinalMetricKeys:[]}
  expect((await educationTrackingChoices(f.db,[f.track])).every(c=>c.visible===false)).toBe(true)
  f.policy.relationshipKinds=['PARENT_CHILD'];expect(await educationTrackingChoices(f.db,[f.track])).toEqual([])
 })
 it('rebinds unchanged frozen blocks into new slots, rejects ambiguity and actual protocol changes',async()=>{
  const f=source(),choices=await educationTrackingChoices(f.db,[f.track]),plan:any={schemaVersion:1,id:randomUUID(),baselineWaveId:randomUUID(),metrics:choices.map(c=>({id:randomUUID(),sourceKey:c.itemId,scoreKey:c.scoreKey,label:c.label,unit:c.unit,kind:c.kind,measurementHash:c.measurementHash}))}
  const bindings=choices.map((c,i)=>({metricId:plan.metrics[i].id,trackId:c.trackId,itemId:c.itemId,scoreKey:c.scoreKey,blockId:c.blockId,visible:true})),tracking=educationTrackingSchema.parse({schemaVersion:1,entry:'TEACHER',bindings})
  const nextTrack=randomUUID(),next=choices.map(c=>({...c,trackId:nextTrack,itemId:randomUUID()}))
  expect(inheritEducationTrackingBindings(tracking,plan,next).map(b=>b.metricId)).toEqual(bindings.map(b=>b.metricId))
  expect(inheritEducationTrackingBindings(tracking,plan,next).every(b=>b.trackId===nextTrack)).toBe(true)
  expect(()=>inheritEducationTrackingBindings(tracking,plan,[...next,{...next[0],itemId:randomUUID()}])).toThrow()
  expect(()=>inheritEducationTrackingBindings(tracking,plan,next.map(c=>c.kind==='COGNITIVE'?{...c,measurementHash:'f'.repeat(64)}:c))).toThrow()
 })
 it('applies explicit empty visibility and refuses a grant above each source ceiling during real freezer projection',async()=>{
  const f=source(),choices=await educationTrackingChoices(f.db,[f.track]),plan:any={schemaVersion:1,id:randomUUID(),baselineWaveId:randomUUID(),metrics:choices.map(c=>({id:randomUUID(),sourceKey:c.itemId,scoreKey:c.scoreKey,label:c.label,unit:c.unit,kind:c.kind,measurementHash:c.measurementHash}))}
  const tracking={schemaVersion:1,entry:'TEACHER',bindings:choices.map((c,i)=>({metricId:plan.metrics[i].id,trackId:c.trackId,itemId:c.itemId,scoreKey:c.scoreKey,blockId:c.blockId,visible:true}))}
  let written:any
  f.db.$queryRaw=vi.fn(async(strings:TemplateStringsArray)=>strings.join('').includes("SELECT 'TEACHER'")?[{entry:'TEACHER'}]:strings.join('').includes('personal_tracking_baseline_id AS')?[{baselineId:plan.baselineWaveId,ordinal:2,tracking}]:[{tracking:{...tracking,plan}}])
  f.db.$executeRaw=vi.fn(async(_strings:TemplateStringsArray,json:string)=>{written=JSON.parse(json);return 1})
  const input={organizationId:randomUUID(),runId:randomUUID(),tracks:[f.track],selection:{mode:'LONGITUDINAL',visibleMetrics:[]}}
  await freezeEducationTracking(f.db,input);expect(written.bindings.every((b:any)=>b.visible===false)).toBe(true)
  f.policy.educationComposition.unitReports[0].respondent={...f.policy.educationComposition.unitReports[0].respondent,longitudinalMetricKeys:[]}
  await expect(freezeEducationTracking(f.db,{...input,selection:{mode:'LONGITUDINAL',visibleMetrics:[{trackId:choices[0].trackId,itemId:choices[0].itemId,scoreKey:choices[0].scoreKey}]}})).rejects.toThrow('不能扩大')
 })
 it('leaves historical composition declarations absent and forbids observer or Form longitudinal grants',()=>{
  const source={provider:'PRIVATE_VERSION',kind:'FORM',versionId:randomUUID(),contentHash:'a'.repeat(64)},definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:'SELF'},instruction:'',blocks:[{blockId:randomUUID(),instruction:'',source}]}
  expect(privateCompositionDefinitionSchema.parse(definition).blocks[0]).not.toHaveProperty('longitudinal')
  expect(()=>privateCompositionDefinitionSchema.parse({...definition,blocks:[{...definition.blocks[0],longitudinal:true}]})).toThrow()
  expect(()=>privateCompositionDefinitionSchema.parse({...definition,administration:{population:'STUDENT',responseMode:'PARENT_REPORT'},blocks:[{...definition.blocks[0],source:{...source,kind:'SCALE'},longitudinal:true}]})).toThrow()
 })
})

it('keeps the original fixed Bundle Scale ceiling when the education runtime is ORGANIZATION_RESOURCE',async()=>{
 vi.stubEnv('DATA_ENCRYPTION_KEY','55'.repeat(32))
 try{
  const f=source(),entry=createCodeBundleDefinitionProvider().exact('integrated_gonogo_adexi_adult_zh_cn_v1','1.0.0')!
  const frozen=freezeBundleProductionDefinition(entry,{frozenAt:new Date().toISOString(),sourceReference:'isolated exact leaf sample'})
  const none=DISCLOSURE_PRESETS.NONE(),scores=DISCLOSURE_PRESETS.SCORES()
  const ceiling={disposition:'FROZEN_V2',disclosure:{schemaVersion:1,policyVersion:'synthetic-v1',unknownAudience:'DENY',audiences:{respondent:none,subject:none,teacher:scores,researcher:scores}}}
  const bindings={schemaVersion:1,context:[],slots:[{slotKey:'adexi',itemId:f.units[0].itemId,unitType:'SCALE',scaleDisclosure:ceiling}]}
  f.row.bundleInstance={definitionEncrypted:encryptCognitivePayload(frozen),definitionHash:frozen.contentHash,bindingsEncrypted:encryptCognitivePayload(bindings),bindingsHash:canonicalHash(bindings)} as any
  expect((await educationTrackingChoices(f.db,[f.track])).filter(c=>c.kind==='SCALE').every(c=>c.visible===false)).toBe(true)
  ceiling.disclosure.audiences.subject=scores
  f.row.bundleInstance!.bindingsEncrypted=encryptCognitivePayload(bindings);f.row.bundleInstance!.bindingsHash=canonicalHash(bindings)
  expect((await educationTrackingChoices(f.db,[f.track])).filter(c=>c.kind==='SCALE').every(c=>c.visible===true)).toBe(true)
 }finally{vi.unstubAllEnvs()}
})
