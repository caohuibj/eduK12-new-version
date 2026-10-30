import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {PrismaClient,Prisma} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {admitCognitiveAttempt,readCognitiveQuota} from '../../modules/cognitive/attempt-quota'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'

const url=integrationDatabaseUrl('TRAINING_QUOTA_DATABASE_URL')
const suite=url?describe:describe.skip
// Quota-row contract only: no cognitive trial engine, FINAL scoring or E2E claim.
suite('Training frozen Cognitive wave quota, real PostgreSQL',()=>{
 it.each(['QUESTIONNAIRE','ASSESSMENT_BUNDLE'])('%s permits T2 without renewing the quota within a wave',async productKind=>{
  requireIsolatedReleaseDatabase(url!)
  const db=new PrismaClient({datasources:{db:{url:url!}}}),rollback=new Error('ROLLBACK_SYNTHETIC_QUOTA')
  try{
   await db.$transaction(async tx=>{
    const user=await tx.user.create({data:{username:'quota-'+randomUUID(),passwordHash:'synthetic',role:'TEACHER'}})
    const course=await tx.course.create({data:{title:'synthetic quota',courseCode:randomUUID(),creatorId:user.id,courseType:'TRAINING_COURSE'}})
    const config=await tx.cognitiveTestConfig.create({data:{name:'synthetic',testType:'SYNTHETIC_QUOTA',configVersion:'1',engineVersion:'1',scoringVersion:'1'}})
    const root=await tx.cognitiveAssignment.create({data:{title:'root',configId:config.id,createdBy:user.id,maxAttempts:1,profile:'experience'}})
    // Both waves deliberately reuse the SAME course wrapper.
    const wrapper=await tx.cognitiveAssignment.create({data:{title:'wrapper',configId:config.id,createdBy:user.id,courseId:course.id,maxAttempts:1,profile:'experience',quotaSourceAssignmentId:root.id}})
    const baselineId=randomUUID(),metricId=randomUUID(),hash='a'.repeat(64)
    const plan={schemaVersion:1,id:randomUUID(),baselineWaveId:baselineId,metrics:[{id:metricId,sourceKey:'cognitive-leaf',scoreKey:'accuracy',label:'accuracy',unit:'ratio',kind:'COGNITIVE',measurementHash:canonicalHash({measurementHash:hash,profile:'experience'})}]}
    async function wave(ordinal:number,tracked=true){
     const waveId=ordinal===1?baselineId:randomUUID(),itemId=randomUUID()
     const snapshot={schemaVersion:1,compositeId:waveId,units:[{itemId,family:'COGNITIVE',source:{kind:'COGNITIVE_CONFIG',id:config.id,assignmentId:wrapper.id,ownerId:user.id},measurement:{releaseId:randomUUID(),contentHash:hash,measurementHash:hash}}]}
     const row=await tx.compositeAssessment.create({data:{id:waveId,code:randomUUID(),name:'synthetic wave',createdBy:user.id,productKind,questionnaireType:productKind==='QUESTIONNAIRE'?'COURSE':null,courseId:productKind==='ASSESSMENT_BUNDLE'?course.id:null,status:'PUBLISHED',publishedAt:new Date(),personalTrackingBaselineId:tracked?baselineId:null,personalTrackingOrdinal:tracked?ordinal:null,personalTracking:tracked?{schemaVersion:1,bindings:[{metricId,itemId,scoreKey:'accuracy',visible:true}],...(ordinal===1?{plan}:{})}:Prisma.DbNull,trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot)}})
     await tx.compositeAssessmentItem.create({data:{id:itemId,compositeAssessmentId:row.id,type:'COGNITIVE',cognitiveAssignmentId:wrapper.id}})
     return {row,itemId,snapshot}
    }
    async function parent(w:Awaited<ReturnType<typeof wave>>,epoch=1){
     const id=randomUUID(),binding={...w.snapshot,attemptId:id,epoch,publicationHash:canonicalHash(w.snapshot)}
     const row=await tx.compositeAssessmentAttempt.create({data:{id,userId:user.id,compositeAssessmentId:w.row.id,participantKey:randomUUID(),deliveryCourseId:productKind==='QUESTIONNAIRE'?course.id:null,deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',attemptEpoch:epoch,trainingContentBinding:binding,trainingContentBindingHash:canonicalHash(binding)}})
     return {row,scope:{compositeAttemptId:id,compositeItemId:w.itemId}}
    }
    async function completed(p:Awaited<ReturnType<typeof parent>>,w:Awaited<ReturnType<typeof wave>>){
     await tx.cognitiveSession.create({data:{userId:user.id,participantKey:randomUUID(),assignmentId:wrapper.id,compositeAttemptId:p.row.id,compositeItemId:w.itemId,configId:config.id,testType:'SYNTHETIC_QUOTA',configVersion:'1',configSnapshotEncrypted:'synthetic-quota-only',engineVersion:'1',scoringVersion:'1',randomSeed:'synthetic',status:'COMPLETED'}})
    }
    const t1=await wave(1),p1=await parent(t1)
    await admitCognitiveAttempt(tx,user.id,wrapper.id,p1.scope);await completed(p1,t1)
    const t2=await wave(2),p2=await parent(t2)
    expect(await readCognitiveQuota(tx,user.id,wrapper.id,{compositeAssessmentId:t2.row.id,compositeItemId:t2.itemId})).toMatchObject({remainingAttempts:1})
    await admitCognitiveAttempt(tx,user.id,wrapper.id,p2.scope)
    // No scope / an ordinary copied task cannot borrow the plan's new allowance.
    await expect(admitCognitiveAttempt(tx,user.id,wrapper.id)).rejects.toMatchObject({statusCode:409})
    const ordinary=await wave(3,false),ordinaryParent=await parent(ordinary)
    await expect(admitCognitiveAttempt(tx,user.id,wrapper.id,ordinaryParent.scope)).rejects.toMatchObject({statusCode:409})
    // A forged subject must never become scope authority.
    await tx.compositeAssessmentAttempt.update({where:{id:p2.row.id},data:{respondentUserId:(await tx.user.create({data:{username:'other-'+randomUUID(),passwordHash:'synthetic',role:'STUDENT'}})).id}})
    await expect(admitCognitiveAttempt(tx,user.id,wrapper.id,p2.scope)).rejects.toMatchObject({statusCode:409})
    await tx.compositeAssessmentAttempt.update({where:{id:p2.row.id},data:{respondentUserId:null}})
    await completed(p2,t2)
    const redo=await parent(t2,2)
    await expect(admitCognitiveAttempt(tx,user.id,wrapper.id,redo.scope)).rejects.toMatchObject({statusCode:409})
    expect(await readCognitiveQuota(tx,user.id,wrapper.id,{compositeAssessmentId:t2.row.id,compositeItemId:t2.itemId})).toMatchObject({remainingAttempts:0,usedAttempts:1,maxAttempts:1})
    throw rollback
   },{timeout:20000}).catch(error=>{if(error!==rollback)throw error})
  }finally{await db.$disconnect()}
 },30000)
})
