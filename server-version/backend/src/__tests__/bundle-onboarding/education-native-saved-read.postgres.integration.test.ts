import {it,expect,vi} from 'vitest'
import fs from 'node:fs'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {readEducationRespondentAssessmentReport} from '../../modules/reporting/education-assessment-report.service'
import {readEducationAssessmentDeliveryIdentity} from '../../modules/education-tools/assessment-resource.repository'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {getExecutableScalePackage} from '../../modules/scale/onboarding/executable-registry'
import * as scoreModule from '../../modules/scale/scale-scoring'
import * as factsModule from '../../modules/assessment-bundle/report-facts'
import {resetRuntimeObservabilityForTests,runtimeMetricLines} from '../../services/runtimeObservability'
const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),directory=process.env.EVC_EVIDENCE_DIRECTORY
const test=url&&directory?it:it.skip
test('reopens native School feedback, denies another actor and replays FINAL without a scorer or profile invocation',async()=>{
 requireIsolatedReleaseDatabase(url!);const prior=JSON.parse(fs.readFileSync(directory+'/education-native-result.json','utf8')),checkpoint=JSON.parse(fs.readFileSync(directory+'/education-native-checkpoint.json','utf8'))
 const oldCampus=process.env.CAMPUS_ELIGIBILITY_HMAC_KEY;process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='2'.repeat(64)
 const scoreSpy=vi.spyOn(scoreModule,'scoreScale').mockImplementation(()=>{throw new Error('SAVED_READ_MUST_NOT_RESCORE')})
 const profileSpy=vi.spyOn(factsModule,'projectBundleReportFacts').mockImplementation(()=>{throw new Error('SAVED_READ_MUST_NOT_REPROFILE')})
 try{
 const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:prior.attemptId}}),userId=parent.userId!
 resetRuntimeObservabilityForTests();const clock=performance.now(),cpu=process.cpuUsage()
 const read=()=>readEducationRespondentAssessmentReport({actorUserId:userId,executionId:prior.executionId,product:'SCHOOL'})
 const reopened=await read(),readMs=performance.now()-clock,readCpu=process.cpuUsage(cpu),readSql=runtimeMetricLines().find(line=>line.startsWith('ptool_prisma_sql_events_total '))
 expect(reopened).toMatchObject({state:'READY',nativeBundle:{factsHash:prior.nativeBundle.factsHash,profileView:{profileId:'P4',actions:[]}}})
 expect(await readEducationRespondentAssessmentReport({actorUserId:checkpoint.managerId,executionId:prior.executionId,product:'SCHOOL'})).toBeNull()
 const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:parent.id,scale:{code:'value_cost_mathematics_zh_cn'}}}),snapshot=await db.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:parent.id,sourceAttemptId:child.id}})
 const definition=getExecutableScalePackage('value_cost_mathematics_zh_cn','1.0.0')!.definition
 expect(await submitScaleAssessmentFinal({assessmentId:child.id,userId,submissionId:snapshot.sourceSubmissionId!,attemptEpoch:parent.attemptEpoch,definitionHash:hashScaleDefinition(definition),contextSnapshotHash:parent.contextSnapshotHash,answers:definition.items.map(q=>({itemCode:q.itemCode,responseValue:'5'}))})).toMatchObject({replayed:true})
 await finalizeCompositeAttemptIfReady(parent.id)
 expect((await read())?.state).toBe('READY');expect(scoreSpy).not.toHaveBeenCalled();expect(profileSpy).not.toHaveBeenCalled()
 expect(await db.bundleAnalysis.count({where:{attemptId:parent.id}})).toBe(1);expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:parent.id}})).toBe(3)
 const [legacy]=await db.$queryRaw<Array<{entry:any;entry_hash:string}>>`SELECT entry,entry_hash FROM education_assessment_deliveries WHERE status='PUBLISHED' AND NOT(entry->'educationOrigin'?'nativeBundle') LIMIT 1`
 if(legacy){const origin=legacy.entry.educationOrigin;const saved=await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:'education-assessment:'+origin.product+':'+origin.organizationId+':'+origin.resourceId,version:origin.adapterVersion,purpose:'HISTORY'}));expect(saved.origin).not.toHaveProperty('nativeBundle')}
 fs.writeFileSync(directory+'/education-native-read-result.json',JSON.stringify({status:'PASS',samples:1,readMs,readCpu,readSql,responseBytes:Buffer.byteLength(JSON.stringify(reopened)),analysisCount:1,unitSnapshots:3,replayed:true,otherActorDenied:true,legacyIdentityRead:Boolean(legacy)},null,2))
 }finally{scoreSpy.mockRestore();profileSpy.mockRestore();if(oldCampus===undefined)delete process.env.CAMPUS_ELIGIBILITY_HMAC_KEY;else process.env.CAMPUS_ELIGIBILITY_HMAC_KEY=oldCampus;await db.$disconnect()}
},60000)
