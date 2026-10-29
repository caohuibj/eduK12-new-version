import {describe,expect,it} from 'vitest'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {prepareTrainingContentAttemptBinding,trainingContentSnapshotSchema} from '../../modules/composite/training-content-binding'
import {educationCompositionBindingSchema} from '../../modules/education-tools/private-tool.composition-contracts'
import {trainingMeasurementSourceScopeMatchesForConsumer} from '../../modules/composite/training-content-binding'

const id=(n:number)=>`97200000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64)
function fixture(){
 const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,mode:'COMPOSITION' as const,entry:'TEACHER' as const,organizationId:id(1),ownerUserId:id(2),toolId:id(3),versionId:id(4),contentHash:hash,variantKey:'TEACHER:SELF' as const}
 const native={provider:'COGNITIVE_CONFIG' as const,sourceId:id(11),contentHash:hash,sourceMeasurementReleaseId:id(14),profile:'research' as const,profileDefinitionVersion:'exact-profile-2',resolvedConfigHash:hash,reportHash:hash}
 const units=[{itemId:id(10),family:'COGNITIVE',source:{kind:'COGNITIVE_CONFIG',id:id(11),ownerId:id(2),assignmentId:id(12),educationNative:native},measurement:{releaseId:id(13),contentHash:hash,measurementHash:hash}},
  {itemId:id(20),family:'SJT',source:{kind:'STATIC_SJT_REGISTRY',id:id(21),instrumentKey:'synthetic-sjt',instrumentVersion:'exact-1',educationNative:{provider:'SJT_RELEASE',sourceId:id(21),contentHash:hash}},measurement:{releaseId:id(23),contentHash:hash,measurementHash:hash}}]
 const manifest=[{blockId:id(31),instruction:'Cognitive transition',kind:'COGNITIVE',sourceProvider:'COGNITIVE_CONFIG',versionId:id(11),contentHash:hash,toolId:id(11),itemIds:[id(10)],sectionIds:[]},
  {blockId:id(32),instruction:'SJT transition',kind:'SJT',sourceProvider:'SJT_RELEASE',versionId:id(21),contentHash:hash,toolId:id(21),itemIds:[id(20)],sectionIds:[]}]
 const snapshot=trainingContentSnapshotSchema.parse({schemaVersion:1,compositeId:id(5),units,educationBinding:{schemaVersion:1,sealed:true,origin,manifest}})
 const items=[{id:id(10),type:'COGNITIVE',cognitiveAssignmentId:id(12),cognitiveAssignment:{id:id(12),configId:id(11),profile:'research',profileDefinitionVersion:'exact-profile-2',resolvedConfigHash:hash,resolvedReportSnapshotEncrypted:'present-frozen-report'}},
  {id:id(20),type:'SITUATIONAL',situationalInstrumentKey:'synthetic-sjt',situationalInstrumentVersion:'exact-1'}]
 const input={compositeId:id(5),attemptId:id(6),epoch:1,snapshot,snapshotHash:canonicalHash(snapshot),composite:{id:id(5),createdBy:id(2),items},resolvedSituational:new Map(),educationComposition:{origin,manifestHash:canonicalHash(snapshot),unitReports:[]}}
 return {input,origin}
}
describe('education native mapping into the existing shared attempt binding',()=>{
 it('retains two real native families, source identities and ordered native slots',async()=>{
  const {input}=fixture(),result=await prepareTrainingContentAttemptBinding({} as Prisma.TransactionClient,input)
  expect(result!.binding.units.map(unit=>unit.family)).toEqual(['COGNITIVE','SJT'])
  expect(result!.binding.units[0].source.educationNative).toMatchObject({profile:'research',profileDefinitionVersion:'exact-profile-2',resolvedConfigHash:hash,reportHash:hash})
  expect([...result!.educationUnitOrder!.keys()]).toEqual(['cognitive:'+id(10),'situational:'+id(20)])
  expect(result!.educationUnitPresentation!.get('cognitive:'+id(10))).toMatchObject({instruction:'Cognitive transition'})
 })
 it.each(['different-assignment','different-profile','missing-report','different-config','different-sjt-version'])('refuses %s without falling back to a Scale or default profile',async change=>{
  const {input}=fixture(),cognitive=input.composite.items[0]
  if(change==='different-assignment')cognitive.cognitiveAssignmentId=id(99)
  if(change==='different-profile')cognitive.cognitiveAssignment!.profile='standard'
  if(change==='missing-report')cognitive.cognitiveAssignment!.resolvedReportSnapshotEncrypted=''
  if(change==='different-config')cognitive.cognitiveAssignment!.configId=id(99)
  if(change==='different-sjt-version')input.composite.items[1].situationalInstrumentVersion='wrong'
  await expect(prepareTrainingContentAttemptBinding({} as Prisma.TransactionClient,input)).rejects.toMatchObject({code:'CONTENT_TRAINING_SOURCE_MISMATCH'})
 })
 it('rejects native observer mappings and source aliases at the sealed contract',()=>{
  const {input}=fixture(),binding=input.snapshot.educationBinding!
  expect(educationCompositionBindingSchema.safeParse({...binding,origin:{...binding.origin,variantKey:'TEACHER:STUDENT_REPORT'}}).success).toBe(false)
  const forged=structuredClone(input.snapshot);forged.units[0].source.id=id(99)
  expect(trainingContentSnapshotSchema.safeParse(forged).success).toBe(false)
 })
 it('does not grant education native PRIVATE scope without an actual composition anchor',async()=>{
  const {input}=fixture(),unit=input.snapshot.units[0]
  const release={layer:'MEASUREMENT',family:'COGNITIVE',scope:{kind:'PRIVATE',product:'TEACHER',ownerId:id(2),resourceId:id(12)}}
  expect(await trainingMeasurementSourceScopeMatchesForConsumer({} as Prisma.TransactionClient,release as any,unit.source)).toBe(false)
 })
})
