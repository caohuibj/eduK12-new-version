import {describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {admitEducationNativeCognitive} from '../../modules/education-tools/native-source.cognitive'
import {issueVerifiedEducationStart,bindVerifiedEducationAttempt,type VerifiedEducationAttempt} from '../../modules/assessment-run/education-start-context'

const id=(n:number)=>`97300000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='b'.repeat(64)
function fixture(){
 const records:Array<{parentId:string;itemId:string;epoch:number}>=[]
 const db={$queryRaw:vi.fn(async()=>[{locked:true}]),cognitiveSession:{count:vi.fn(async({where}:any)=>records.filter(record=>
  (!where.compositeAttemptId||record.parentId===where.compositeAttemptId)&&(!where.compositeItemId||record.itemId===where.compositeItemId)&&record.epoch===where.attemptNo).length)}}
 const tx=db as unknown as Prisma.TransactionClient
 const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,mode:'COMPOSITION' as const,entry:'TEACHER' as const,organizationId:id(1),ownerUserId:id(2),toolId:id(3),versionId:id(4),contentHash:hash,variantKey:'TEACHER:SELF' as const}
 const policy={origin,manifestHash:hash,unitReports:[]}
 const input=(parentId=id(10),assignmentRef=id(11))=>{
  const parent={id:parentId,compositeAssessmentId:id(5),userId:id(6),subjectUserId:id(6),respondentUserId:id(6),assignmentRef,attemptEpoch:1,
   trainingContentBinding:{educationComposition:{origin,manifestHash:hash},units:[{itemId:id(20),family:'COGNITIVE',source:{kind:'COGNITIVE_CONFIG',id:id(21),assignmentId:id(22),educationNative:{provider:'COGNITIVE_CONFIG',sourceId:id(21),sourceMeasurementReleaseId:id(23),contentHash:hash,profile:'research',profileDefinitionVersion:'fixed',resolvedConfigHash:hash,reportHash:hash}}}]}}
  const start=issueVerifiedEducationStart({tx,product:'TEACHER',compositeId:id(5),subjectUserId:id(6),respondentUserId:id(6),assignmentRef,composition:policy})
  return {proof:bindVerifiedEducationAttempt(start,tx,parent),parent,actorUserId:id(6),itemId:id(20),assignmentId:id(22),configId:id(21)}
 }
 return {db,tx,input,records}
}
describe('native education Cognitive quota belongs to the real Run parent slot',()=>{
 it('allows a second legitimate Run of one frozen source while refusing a duplicate child in the entered parent',async()=>{
  const f=fixture(),first=f.input()
  await admitEducationNativeCognitive(f.tx,first);f.records.push({parentId:first.parent.id,itemId:first.itemId,epoch:1})
  const second=f.input(id(30),id(31))
  await admitEducationNativeCognitive(f.tx,second)
  expect(f.db.cognitiveSession.count).toHaveBeenLastCalledWith({where:{userId:id(6),compositeAttemptId:id(30),compositeItemId:id(20),attemptNo:1}})
  await expect(admitEducationNativeCognitive(f.tx,first)).rejects.toMatchObject({code:'EDUCATION_COGNITIVE_SLOT_ALREADY_ENTERED'})
 })
 it.each(['copied-proof','different-tx','different-parent','different-actor','different-Run-assignment','different-config','different-native-assignment','missing-binding'] as const)('does not accept %s as quota authority',async change=>{
  const f=fixture(),input=f.input();let tx=f.tx
  if(change==='copied-proof')input.proof={kind:'VERIFIED_EDUCATION_ATTEMPT'} as VerifiedEducationAttempt
  if(change==='different-tx')tx={} as Prisma.TransactionClient
  if(change==='different-parent')input.parent.id=id(99)
  if(change==='different-actor')input.actorUserId=id(99)
  if(change==='different-Run-assignment')input.parent.assignmentRef=id(99)
  if(change==='different-config')input.configId=id(99)
  if(change==='different-native-assignment')input.assignmentId=id(99)
  if(change==='missing-binding')input.parent.trainingContentBinding=undefined as any
  await expect(admitEducationNativeCognitive(tx,input)).rejects.toThrow()
  expect(f.db.cognitiveSession.count).not.toHaveBeenCalled();expect(f.db.$queryRaw).not.toHaveBeenCalled()
 })
})

it('requires a nonce from an actually tracked registered Run, preserves single-use scope and refuses replay or copied authority',async()=>{
 const f=fixture(),make=(tracked:boolean,parentId=id(40),assignmentRef=id(41))=>{
  const input=f.input(parentId,assignmentRef);delete (input.parent.trainingContentBinding as any).educationComposition;delete (input.parent.trainingContentBinding.units[0].source as any).educationNative
  const start=issueVerifiedEducationStart({tx:f.tx,product:'TEACHER',compositeId:input.parent.compositeAssessmentId,respondentUserId:input.actorUserId,assignmentRef,longitudinal:tracked})
  input.proof=bindVerifiedEducationAttempt(start,f.tx,input.parent);return input
 }
 const first=make(true);await admitEducationNativeCognitive(f.tx,first);f.records.push({parentId:first.parent.id,itemId:first.itemId,epoch:1})
 await admitEducationNativeCognitive(f.tx,make(true,id(42),id(43)))
 await expect(admitEducationNativeCognitive(f.tx,first)).rejects.toMatchObject({code:'EDUCATION_COGNITIVE_SLOT_ALREADY_ENTERED'})
 await expect(admitEducationNativeCognitive(f.tx,make(false,id(44),id(45)))).rejects.toThrow()
 const copied=make(true,id(46),id(47));copied.proof={...copied.proof};await expect(admitEducationNativeCognitive(f.tx,copied)).rejects.toThrow()
 const rebound=make(true,id(48),id(49));rebound.parent.assignmentRef=id(99);await expect(admitEducationNativeCognitive(f.tx,rebound)).rejects.toThrow()
})
