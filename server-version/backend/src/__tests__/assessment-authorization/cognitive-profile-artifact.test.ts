import {beforeAll,describe,expect,it} from 'vitest'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {computeProtocolSignature} from '../../modules/cognitive/v2/canonical'
import {createPublicTemplateStore,type PublicTemplateRow} from '../../modules/assessment-runtime/public-templates'
import {sealSelectedConfigurationBinding} from '../../modules/assessment-authorization/selected-configuration'
import {buildCognitiveProfileArtifact,readCognitiveProfileArtifact,cognitiveProfileArtifactHash,
 saveCognitiveProfileArtifact,loadCognitiveProfileArtifact,type CognitiveProfileIdentity} from '../../modules/assessment-authorization/cognitive-profile-artifact'

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const entry=()=>requireCognitiveRegistryEntry('reaction','1.0.0','1.0.0')
const base={totalTrials:20,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,
 report:{reportVersion:'1.0.0',referenceMode:'none'}}
const input=()=>({config:{id:id(1),configVersion:'1.0.0',testType:'reaction',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:base},
 measurement:{releaseId:id(2),contentHash:'a'.repeat(64)},entry:entry()})
const artifact=(profile:'experience'|'research'='experience')=>buildCognitiveProfileArtifact({...input(),profile})
function storage(){
 const rows=new Map<string,PublicTemplateRow>();let appends=0
 const repo={read:async(hashes:string[])=>hashes.flatMap(hash=>rows.has(hash)?[structuredClone(rows.get(hash)!)]:[]),
  append:async(values:PublicTemplateRow[])=>{appends++;for(const row of values)if(!rows.has(row.templateHash))rows.set(row.templateHash,structuredClone(row))}}
 return {rows,repo,store:createPublicTemplateStore(repo),appends:()=>appends}
}
beforeAll(()=>{process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)})
describe('exact cognitive profile content before recipient authorization',()=>{
 it('keeps one reaction config identity while freezing distinct existing experience/research profiles without an attempt seed',()=>{
  const short=artifact(),research=artifact('research')
  expect(short.identity).toMatchObject({testType:'reaction',configId:id(1),configVersion:'1.0.0',profile:'experience'})
  expect(research.identity).toMatchObject({testType:'reaction',configId:id(1),configVersion:'1.0.0',profile:'research'})
  expect(short.resolvedConfig.totalTrials).toBe(8);expect(research.resolvedConfig.totalTrials).toBe(60)
  expect(cognitiveProfileArtifactHash(short)).not.toBe(cognitiveProfileArtifactHash(research))
  expect(short.identity.resolvedConfigHash).not.toBe(research.identity.resolvedConfigHash)
  expect(Object.keys(short).sort()).toEqual(['execution','identity','protocol','resolvedConfig','resolvedReport','schemaVersion'])
  expect(short.execution?.compiledRuntime.instrumentType).toBe('COGNITIVE');expect(short.execution?.compiledRuntime.scorerVersion).toBe('1.0.0')
  for(const field of ['randomSeed','seed','issuerId','recipientId','authorization','attemptId']){
   expect(short).not.toHaveProperty(field);expect(short.resolvedConfig).not.toHaveProperty(field)
  }
  expect(short.protocol.randomizationAlgorithmVersion).toBe('reaction-foreperiod-v1.0.0')
 })
 it('rejects config/report/protocol mutation and unknown envelope fields rather than accepting supplied identity hashes',()=>{
  const original=artifact()
  const config=structuredClone(original);config.resolvedConfig.totalTrials=999
  expect(()=>readCognitiveProfileArtifact(config)).toThrow('CONFIG_HASH_MISMATCH')
  const report=structuredClone(original);report.resolvedReport.reportDefinition.title='Changed later'
  expect(()=>readCognitiveProfileArtifact(report)).toThrow('REPORT_HASH_MISMATCH')
  const protocol=structuredClone(original);protocol.protocol.randomizationAlgorithmVersion='changed'
  expect(()=>readCognitiveProfileArtifact(protocol)).toThrow('PROTOCOL_HASH_MISMATCH')
  expect(()=>readCognitiveProfileArtifact({...original,randomSeed:'shared-across-people'})).toThrow()
  expect(()=>readCognitiveProfileArtifact({...original,schemaVersion:99})).toThrow()
 })
 it('reads an original saved artifact after the same-named registry profile changes without resolving it again',()=>{
  const original=artifact(),definition=entry(),changed={...definition,profileDefinitionVersion:'2.0.0',
   profiles:{...definition.profiles,experience:{...definition.profiles.experience!,configPatch:{...definition.profiles.experience!.configPatch,totalTrials:9}}}}
  const later=buildCognitiveProfileArtifact({...input(),profile:'experience',entry:changed})
  expect(later.resolvedConfig.totalTrials).toBe(9);expect(later.identity.profileDefinitionVersion).toBe('2.0.0')
  expect(readCognitiveProfileArtifact(JSON.parse(JSON.stringify(original)),original.identity)).toEqual(original)
  expect(original.resolvedConfig.totalTrials).toBe(8);expect(original.identity.profileDefinitionVersion).toBe('1.0.0')
  expect(()=>{original.resolvedConfig.totalTrials=9}).toThrow()
 })
 it('shares one encrypted content record between independently scoped recipients without sharing their authorization binding',async()=>{
  const f=storage(),value=artifact(),first=await saveCognitiveProfileArtifact(value,f.store),second=await saveCognitiveProfileArtifact(artifact(),f.store)
  expect(first).toEqual(second);expect(f.appends()).toBe(1);expect(f.rows.size).toBe(1)
  const bindings=['TRAINING','SURVEY','SCHOOL','TEACHER'].map((product,index)=>sealSelectedConfigurationBinding({
   product:product as 'TRAINING'|'SURVEY'|'SCHOOL'|'TEACHER',configuration:value.identity,
   authorization:{kind:'COGNITIVE_PROFILE_USE',id:id(10+index),revision:1,issuerId:id(20+index),recipientId:id(30+index),
    organizationId:index>=2?id(40+index):null,authority:[{kind:'ENTRY_ADMIN',id:id(50+index),revision:1},
     ...(index>=2?[{kind:'CONTENT_DELEGATION' as const,id:id(60+index),revision:2}]:[])]}}))
  expect(new Set(bindings.map(row=>row.bindingHash)).size).toBe(4)
  expect(new Set(bindings.map(row=>row.binding.configurationHash)).size).toBe(1)
  expect(await loadCognitiveProfileArtifact(first.artifactHash,value.identity,createPublicTemplateStore(f.repo))).toEqual(value)
  // This is a pure binding contract; no entry issuer/recipient permission is asserted here.
 })
 it('validates each expected identity after cache hits and refuses a different storage kind or missing source',async()=>{
  const f=storage(),value=artifact(),saved=await saveCognitiveProfileArtifact(value,f.store)
  expect(await loadCognitiveProfileArtifact(saved.artifactHash,value.identity,f.store)).toEqual(value)
  const wrong:CognitiveProfileIdentity={...value.identity,measurement:{...value.identity.measurement,releaseId:id(999)}}
  await expect(loadCognitiveProfileArtifact(saved.artifactHash,wrong,f.store)).rejects.toThrow('EXPECTED_IDENTITY_MISMATCH')
  await expect(f.store.loadMany([{hash:saved.artifactHash,kind:'SCALE_RESULT_BASE'}])).rejects.toThrow('PUBLIC_TEMPLATE_UNAVAILABLE')
  await expect(loadCognitiveProfileArtifact('f'.repeat(64),value.identity,f.store)).rejects.toThrow('PUBLIC_TEMPLATE_UNAVAILABLE')
  expect(f.rows.size).toBe(1)
 })
 it('rejects mechanically missing report metrics and inconsistent protocol/presentation even if inner hashes are recomputed',()=>{
  const metrics=structuredClone(artifact());metrics.resolvedReport.reportDefinition.primaryMetrics=['missing-metric']
  metrics.identity.reportHash=canonicalHash(metrics.resolvedReport)
  expect(()=>readCognitiveProfileArtifact(metrics)).toThrow('REPORT_METRIC_MISSING')
  const protocol=structuredClone(artifact());protocol.protocol.randomizationAlgorithmVersion='different'
  protocol.identity.protocolSignature=computeProtocolSignature(protocol.protocol)
  expect(()=>readCognitiveProfileArtifact(protocol)).toThrow('PRESENTATION_PROTOCOL_MISMATCH')
  const presentation=structuredClone(artifact());presentation.identity.presentationVersion='9.0.0'
  expect(()=>readCognitiveProfileArtifact(presentation)).toThrow('REPORT_IDENTITY_MISMATCH')
 })
 it('does not substitute a registry implementation, a requested profile or an expected historical version',()=>{
  expect(()=>buildCognitiveProfileArtifact({...input(),profile:'experience',config:{...input().config,testType:'memory'}})).toThrow('REGISTRY_IDENTITY_MISMATCH')
  expect(()=>buildCognitiveProfileArtifact({...input(),profile:'unregistered' as 'experience'})).toThrow()
  const value=artifact(),wrong={...value.identity,configVersion:'latest'}
  expect(()=>readCognitiveProfileArtifact(value,wrong)).toThrow('EXPECTED_IDENTITY_MISMATCH')
 })
 it('retains v1 content-only records without upgrading them from current definitions, and rejects forged v2 execution',()=>{
  const original=artifact(),{execution,...body}=structuredClone(original),legacy={...body,schemaVersion:1}
  const restored=readCognitiveProfileArtifact(legacy,original.identity)
  expect(restored.schemaVersion).toBe(1);expect(restored.execution).toBeUndefined()
  expect(cognitiveProfileArtifactHash(restored)).not.toBe(cognitiveProfileArtifactHash(original))
  const changed=structuredClone(original);changed.execution!.compiledRuntime.scorerVersion='9.0.0'
  expect(()=>readCognitiveProfileArtifact(changed)).toThrow()
  const missing=structuredClone(original);delete missing.execution
  expect(()=>readCognitiveProfileArtifact(missing)).toThrow()
 })
})
