import {expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {prisma as db} from '../../config/database'
import {getAttemptState,finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {submitSituationalAttemptFinal} from '../../modules/situational/situational-final-submit.service'
import {compositeItemSlotKey} from '../../modules/assessment-runtime/slot-set'
import {readEducationRespondentAssessmentReport} from '../../modules/reporting/education-assessment-report.service'

export type P6StartedConnection={product:'SCHOOL'|'TEACHER';participantUserId:string;managerId:string;parentId:string;executionId:string}
/** Complete an already admitted synthetic example; earlier publication and
 * START are not replayed when a fixture error stopped a later assertion. */
export async function finishP6StartedConnection(input:P6StartedConnection){
 const {parentId,participantUserId,product,executionId}=input
 const existing=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:parentId},select:{status:true}})
 if(existing.status!=='COMPLETED'){
 await getAttemptState(parentId,{userId:participantUserId})
 const child=await db.situationalAttempt.findFirstOrThrow({where:{compositeAttemptId:parentId}})
 await submitSituationalAttemptFinal({attemptId:child.id,userId:participantUserId,submissionId:randomUUID(),attemptEpoch:1,definitionHash:child.definitionHash,instrumentVersion:child.instrumentVersion,compiledRuntimeHash:child.compiledRuntimeHash,scoringVersion:child.scoringVersion,responses:[{sceneKey:'AS-01',channelKey:'behavior',responseValue:'A'},{sceneKey:'AS-02',channelKey:'behavior',responseValue:'B'}],embedded:{compositeAttemptId:parentId,compositeItemId:child.compositeItemId!,compositeSlotKey:compositeItemSlotKey(child.compositeItemId!,'SITUATIONAL'),userId:participantUserId}})
 await finalizeCompositeAttemptIfReady(parentId)
 }
 expect((await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:parentId}})).status).toBe('COMPLETED')
 const feedback=await readEducationRespondentAssessmentReport({actorUserId:participantUserId,executionId,product})
 if(!feedback)throw Error('The actual participant must receive the allowed report')
 expect(feedback).toMatchObject({state:'READY',nativeBundle:{status:'READY',jointSummary:{blocks:expect.arrayContaining([expect.objectContaining({texts:expect.arrayContaining(['本次情境任务提供了可读取的描述性结果。'])})])}}})
 expect((feedback as unknown as {reports:Array<{status:string}>}).reports.every(report=>report.status==='READY')).toBe(true)
 expect(await readEducationRespondentAssessmentReport({actorUserId:input.managerId,executionId,product})).toBeNull()
 return {executionId,parentId,product,state:feedback.state}
}
