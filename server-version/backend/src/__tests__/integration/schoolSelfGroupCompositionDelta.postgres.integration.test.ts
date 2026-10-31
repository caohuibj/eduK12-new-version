import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {getAttemptState} from '../../modules/composite/composite.service'
import {submitCompositeScaleFinal} from '../../modules/scale/scale-final-submit.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {readSchoolOrdinaryFeedback} from '../../modules/reporting/education-ordinary-feedback.service'
import {listAuthoritativeRunLeafSources} from '../../modules/reporting/resultSource'
import {listCampusGroupReportTools} from '../../modules/campus/group-reports'
import {readRespondentRunSummary} from '../../modules/reporting/respondentSummary'

const url=integrationDatabaseUrl('SCHOOL_GROUP_COMPOSITION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
suite('School GROUP ordinary composition / published-source delta only',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('completes the existing one-person Scale/Form/Scale parent and keeps same-key block rights separate',async()=>{
  const file=process.env.SCHOOL_GROUP_COMPOSITION_CHECKPOINT
  if(!file)throw new Error('Explicit existing real publication checkpoint required; no source republishing in this delta')
  const source:{organizationId:string;runId:string;trackId:string;participantUserId:string}=JSON.parse(readFileSync(file,'utf8'))
  const [execution]=await db.$queryRaw<Array<{id:string;status:string}>>`SELECT e.id,e.status FROM assessment_run_executions e
   JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id
   WHERE e.organization_id=${source.organizationId} AND e.run_id=${source.runId} AND e.track_id=${source.trackId} AND r.user_id=${source.participantUserId}`
  if(!execution)throw new Error('Existing real published execution is missing')
  const started=await startAssessmentRunExecution({executionId:execution.id,actorUserId:source.participantUserId})
  if(started.state!=='STARTED')throw new Error('Expected original COMPOSITE admission')
  const parentId=started.runtimeBindingRef
  const types:string[]=[]
  for(let step=0;step<3;step++){
   const state=await getAttemptState(parentId,{userId:source.participantUserId},undefined,'current-unit')
   if(state.status==='COMPLETED')break
   const item=state.currentItem;types.push(item.type)
   const common={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.contextSnapshotHash}
   if(item.type==='SCALE')await submitCompositeScaleFinal(parentId,item.id,{...common,answers:item.scale.definition.items.map((q:{itemCode:string})=>({itemCode:q.itemCode,responseValue:'a'}))},{userId:source.participantUserId},{receiptOnly:true})
   else if(item.type==='FORM_SECTION')await submitCompositeFormSectionFinal({attemptId:parentId,sectionId:item.formSectionId,userId:source.participantUserId,...common,
    answers:item.answers.map((q:{formItemId:string})=>({formItemId:q.formItemId,value:'Synthetic required unscored Form response'}))})
   else throw new Error('Unexpected source block outside this narrow Scale/Form delta')
  }
  if(execution.status!=='COMPLETED')expect(types).toEqual(['SCALE','FORM_SECTION','SCALE'])
  expect((await getAttemptState(parentId,{userId:source.participantUserId},undefined,'current-unit')).status).toBe('COMPLETED')
  expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:parentId,terminalState:'COMPLETED'}})).toBe(3)
  const feedback=await readSchoolOrdinaryFeedback({actorUserId:source.participantUserId,executionId:execution.id})
  expect(feedback).toMatchObject({state:'READY',mode:'COMPOSITION',units:[{kind:'SCALE',state:'READY'},{kind:'FORM',state:'COMPLETION_ONLY'},{kind:'SCALE',state:'WITHHELD'}]})
  expect(JSON.stringify(feedback)).not.toContain('PRIVATE NONE BLOCK FEEDBACK')
  expect(feedback.units[2]).not.toHaveProperty('nativeScaleUnits')
  const leaves=await listAuthoritativeRunLeafSources({...source,groupAudience:'PROFESSIONAL'})
  expect(leaves).toHaveLength(1);expect(leaves[0].metrics).toEqual([{key:'total',unit:'points'}])
  const [track]=await db.$queryRaw<Array<{policy:any}>>`SELECT frozen_resource_policy AS policy FROM assessment_run_tracks WHERE id=${source.trackId}`
  const hiddenBlock=track.policy.educationComposition.unitReports.find((unit:any)=>unit.respondent.mode==='NONE')
  const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:track.policy.runtimeLaunchTarget.ref}})
  const hiddenItem=(runtime.trainingContentSnapshot as any).educationBinding.manifest.find((block:any)=>block.blockId===hiddenBlock.blockId).itemIds[0]
  expect(await listAuthoritativeRunLeafSources({...source,slotKey:'scale:'+hiddenItem,groupAudience:'PROFESSIONAL'})).toEqual([])
  await expect(readRespondentRunSummary(source.participantUserId,execution.id)).rejects.toMatchObject({statusCode:404})
  const [owner]=await db.$queryRaw<Array<{userId:string}>>`SELECT m.user_id AS "userId" FROM campus_activity_runs link JOIN campus_activities a ON a.course_id=link.course_id
   JOIN organization_memberships m ON m.id=a.owner_membership_id WHERE link.run_id=${source.runId}`
  const user=await db.user.findUniqueOrThrow({where:{id:owner.userId}})
  const actor={userId:user.id,username:user.username,role:user.role,accountDomain:'SCHOOL' as const,platformRole:user.platformRole,tokenVersion:user.tokenVersion,mustChangePassword:false}
  await expect(listCampusGroupReportTools({...source,actor})).rejects.toMatchObject({code:'CAMPUS_GROUP_SOURCE_WITHHELD'})
  console.info(JSON.stringify({kind:'school-composition-group-delta',runId:source.runId,parentId,reusedRealPublication:true,completedParents:1,completedSlots:3,slots:types,
   ownAllowedScaleReady:true,unscoredFormCompletionOnly:true,sameNamedHiddenScaleWithheld:true,groupAllowedLeaves:leaves.length,groupUnderNRejected:true,groupArtifactGenerated:false,trackingT2OrTrendProved:false,sourceOrRegistryMock:false}))
 },90000)
})
