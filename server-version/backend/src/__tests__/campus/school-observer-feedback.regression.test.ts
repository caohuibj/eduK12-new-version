/** Regression adapted from DOT original c5a999f407417a5a4a39495bf8c378423c3b8552. Original failure evidence is retained unchanged in Library libfile_3ed985b9d990819186ccf929300ed836 v1.
 * Real Express route/controller, native completed replay, result serializer and
 * relational disclosure projector. DB rows, session authentication, live
 * population/consent and previously stored admission/runtime reads are fixtures.
 * This is NOT PostgreSQL, migration, fresh START or write-transaction evidence.
 * Assertions prove the enforced receipt response and respondent routing after correction.
 * The old alias-only assertion is preserved in the original evidence, not counted as privacy proof here.
 */
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import express from 'express'
import type {Server} from 'node:http'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'

const f=vi.hoisted(()=>({query:vi.fn(),findChild:vi.fn(),admission:null as any,runtime:null as any,child:null as any,parent:null as any,
 feedback:vi.fn(),consent:vi.fn(),official:vi.fn(),requests:[] as string[]}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:f.query,assessment:{findFirst:f.findChild}}}))
vi.mock('../../middleware/auth',()=>({authenticateSchool:(req:any,_res:any,next:any)=>{
 req.user={userId:'observer',username:'synthetic',role:req.headers['x-review-role']??'PARENT',accountDomain:'SCHOOL'};next()
}}))
vi.mock('../../modules/assessment-relational/runtime-consent',()=>({relationalRuntimeConsentAuthority:{assertCompositeFinal:f.consent}}))
vi.mock('../../modules/reporting/education-ordinary-feedback.service',()=>({readSchoolOrdinaryFeedback:f.feedback}))
vi.mock('../../modules/reporting/report-image-delivery',()=>({serveProjectedReportImage:vi.fn()}))
vi.mock('../../modules/assessment-run/productRead',()=>({listAssignedRunTasks:f.official}))
vi.mock('../../modules/campus/studentReference',()=>({campusStudentReference:()=> 'synthetic-student-reference'}))
vi.mock('../../modules/composite/composite.service',()=>({}))
vi.mock('../../modules/composite/composite-export.service',()=>({buildCompositeAnalysisExport:vi.fn()}))
vi.mock('../../modules/cognitive-analysis',()=>({listReportPackageCatalog:vi.fn()}))
vi.mock('../../modules/composite/final-submit.service',()=>({assignCompositeFormItemToSection:vi.fn(),createCompositeFormSection:vi.fn(),listCompositeFormItems:vi.fn(),listCompositeFormSections:vi.fn(),reorderCompositeFormSectionItems:vi.fn(),reorderCompositeFormSections:vi.fn(),updateCompositeFormSection:vi.fn(),submitCompositeFormSectionFinal:vi.fn()}))
vi.mock('../../modules/cognitive/cognitive-image.controller',()=>({cognitiveImageController:{content:vi.fn()}}))
vi.mock('../../modules/cognitive/cognitive-video.controller',()=>({cognitiveVideoController:{issue:vi.fn()}}))
vi.mock('../../modules/cognitive/session.service',()=>({getSession:vi.fn()}))
vi.mock('../../modules/cognitive/final-submit.service',()=>({submitCognitiveSessionFinalWithContext:vi.fn()}))
vi.mock('../../modules/composite/composite-image.controller',()=>({compositeImageController:{authenticatedFormImage:vi.fn(),authenticatedScaleImage:vi.fn()}}))
vi.mock('../../modules/composite/composite-video.controller',()=>({compositeVideoController:{authenticatedFormVideo:vi.fn(),authenticatedScaleVideo:vi.fn()}}))
vi.mock('../../modules/situational/situational-video.controller',()=>({situationalVideoController:{embeddedAuthenticated:vi.fn()}}))
vi.mock('../../modules/situational/situational-runtime.service',()=>({loadEmbeddedSituationalAttemptRuntime:vi.fn(),situationalAttemptForResponse:vi.fn()}))
vi.mock('../../modules/situational/situational-asset.service',()=>({serveFrozenSituationalAsset:vi.fn()}))
vi.mock('../../modules/situational/situational-final-submit.service',()=>({submitSituationalAttemptFinal:vi.fn()}))
vi.mock('../../modules/anonymous-study/admission-principal',()=>({assertCurrentStudyPrincipal:async()=>false,stableStudyAdmissionHash:()=> 'synthetic-study-hash'}))
vi.mock('../../modules/composite/training-variant-child-scope',()=>({
 assertTrainingChildSelected:async()=>{},loadTrainingChildAdmissionParent:async()=>f.parent,
 TRAINING_VARIANT_PARENT_MARKER_SELECT:{compositeAssessment:{select:{}}},
 requiresTrainingFlowFinalLock:()=>false,lockTrainingFlowFinalAdmission:async()=>()=>{},
}))
vi.mock('../../services/questionnaireProgressService',()=>({
 withFinalOnlyCompletionTransaction:()=>{throw Error('Unexpected write transaction in completed replay review')},
 refreshCompositeFinalOnlyProgress:vi.fn(),
}))
vi.mock('../../modules/scale/scale-admission.service',async original=>({
 ...await original<any>(),
 activateScaleAdmission:async()=>f.admission,
 loadScaleAdmissionRuntime:async()=>f.runtime,
}))

import campusCompositeRouter from '../../modules/campus/composite.routes'
import {listCampusTeacherRunTasks} from '../../modules/campus/teacher-tasks'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {createFrozenScaleRuntimeSnapshot,encryptFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {createFrozenUnitAdmission} from '../../modules/assessment-runtime/admission-snapshot'
import {buildScaleResult} from '../../modules/scale/scale-result'
import {prepareUnifiedScaleFinalSubmission} from '../../modules/scale/unified-final-submit.service'

const executionId='00000000-0000-4000-8000-000000000009'
const scalePath='/api/campus/composite-attempts/parent-attempt/items/scale-item/scale/submit'
const feedbackPath='/api/campus/run-executions/'+executionId+'/feedback'
const noFeedback={mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]}
const completion={schemaVersion:1,kind:'EDUCATION_FEEDBACK',mode:'COMPOSITION',state:'COMPLETION_ONLY',title:'Synthetic observer questionnaire',units:[{blockId:'block',kind:'SCALE',title:'Synthetic scale',state:'WITHHELD'}]}
const task={executionId,runId:'run',organizationId:'school',runName:'Synthetic observer questionnaire',resourceKey:'education-composition:SCHOOL:fixed:STUDENT:TEACHER_REPORT:1.0.0',subjectRole:'STUDENT',respondentRole:'TEACHER',relationship:'CLASS_TEACHER_STUDENT',status:'COMPLETED',deadline:null,consentRequired:true,consentPurpose:'Synthetic',consentVisibility:'PRIVATE_RESPONDENT'}
let server:Server,base:string,body:any
function save(name:string,value:unknown){
 if(process.env.DOT_REVIEW_EVIDENCE_DIR)writeFileSync(join(process.env.DOT_REVIEW_EVIDENCE_DIR,name),JSON.stringify(value,null,2)+'\n')
}
async function request(path:string,role:string,body?:unknown){
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-review-role':role},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const json:any=await response.json();return {status:response.status,body:json}
}
async function prepare(role:'PARENT'|'TEACHER'='PARENT'){
 const definition=compileResearchScale('Synthetic observer scale',{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',
  responseOptions:[{optionKey:'yes',label:'Yes',score:1},{optionKey:'no',label:'No',score:0}],dimensions:[{dimensionKey:'total',label:'Synthetic sensitive score',direction:'descriptive'}],
  items:[{itemKey:'one',prompt:'Synthetic observation',required:true,reverse:false,dimensionKeys:['total']}]})
 const runtime=createFrozenScaleRuntimeSnapshot({instrumentKey:'education-private-scale:synthetic-fixed',instrumentVersion:'1.0.0',definition})
 const encrypted=encryptFrozenScaleRuntimeSnapshot(runtime)
 const scale={id:'scale',code:runtime.instrumentKey,name:'Synthetic observer scale',instrumentVersion:'1.0.0',instrumentClass:'CUSTOM_DESCRIPTIVE',status:'PUBLISHED'}
 f.runtime=runtime
 f.admission=createFrozenUnitAdmission({attemptEpoch:1,scale,principal:{userId:'observer'},parent:{kind:'composite',parentId:'parent-attempt',slotKey:'composite:scale-item:SCALE',sourceDefinitionHash:runtime.sourceDefinitionHash,compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash},requiresContext:false})
 f.parent={id:'parent-attempt',status:'COMPLETED',attemptEpoch:1,compositeAssessmentId:'composition',assignmentRef:'assignment',respondentType:role,asyncReportEpoch:null,
  compositeAssessment:{id:'composition',productKind:'ORGANIZATION_RESOURCE',creationKey:'education-composition:SCHOOL:fixed:STUDENT:'+role+'_REPORT:1.0.0',trainingFeedbackPolicy:null,trainingFeedbackPolicyHash:null},
  trainingFeedbackSnapshot:null,trainingFeedbackSnapshotHash:null,
  frozenResourcePolicy:{educationComposition:{unitReports:[{blockId:'block',respondent:noFeedback}]},resultDisclosure:{audiences:{RESPONDENT:noFeedback}}}}
 const answers=[{itemCode:definition.items[0].itemCode,responseValue:'yes'}]
 const result=buildScaleResult({scaleId:scale.id,instrumentKey:scale.code,name:scale.name,instrumentVersion:scale.instrumentVersion,definition,answers})
 f.child={id:'scale-attempt',scaleId:scale.id,userId:'observer',subjectUserId:'rated-student',respondentUserId:'observer',respondentType:role,
  scale,status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,startedAt:new Date('2026-10-29T00:00:00Z'),completedAt:new Date('2026-10-29T00:05:00Z'),
  compositeAttemptId:'parent-attempt',compositeItemId:'scale-item',questionnaireAssessmentId:null,compositeAttempt:f.parent,
  runtimeSnapshotEncrypted:encrypted,compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash,answers:[],result,progress:100,totalTime:100,
  submissionId:'synthetic-observer-final-0001',submissionPayloadHash:null}
 body={submissionId:f.child.submissionId,attemptEpoch:1,definitionHash:runtime.legacyDefinitionHash,contextSnapshotHash:null,answers}
 const prepared=await prepareUnifiedScaleFinalSubmission({...body,assessmentId:f.child.id,userId:'observer',compositeAttemptId:'parent-attempt'},f.child)
 f.child.submissionPayloadHash=prepared.payloadHash
 return body
}

describe('School observer enforced receipt and feedback routing regression (mock DB, real HTTP)',()=>{
 beforeAll(async()=>{
  process.env.DATA_ENCRYPTION_KEY='d'.repeat(64)
  const app=express();app.use(express.json());app.use('/api/campus',campusCompositeRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))})
 beforeEach(()=>{
  vi.clearAllMocks();f.requests=[]
  f.feedback.mockResolvedValue(completion);f.consent.mockResolvedValue(undefined);f.findChild.mockImplementation(async()=>f.child)
  f.official.mockResolvedValue({list:[task],truncated:false})
  f.query.mockImplementation(async(query:any)=>{
   const sql=typeof query==='string'?query:query.sql??query.join?.('')??'';f.requests.push(sql)
   if(sql.includes('AS parent')&&sql.includes('composite_assessment_attempts'))return [{parent:f.parent,job:null}]
   if(sql.includes('SELECT perspective, analysis_mode'))return [{perspective:'OBSERVER_REPORT',analysisMode:'INDIVIDUAL_ONLY'}]
   if(sql.includes('course.title AS "activityTitle"'))return [{executionId,runId:'run',organizationId:'school',activityId:'activity',activityTitle:'Synthetic activity',studentUserId:'rated-student'}]
   if(sql.includes('SELECT e."id" FROM "assessment_run_executions"'))return [{id:executionId}]
   throw Error('Unexpected database fixture query: '+sql.slice(0,220))
  })
 })
 it.each(['PARENT','TEACHER'] as const)('%s completed replay must not expose results forbidden by the ordinary observer ceiling',async role=>{
  await prepare(role)
  const receipt=await request(feedbackPath,role)
  expect(receipt).toMatchObject({status:200,body:{data:{state:'COMPLETION_ONLY'}}})
  const actual=await request(scalePath,role,body);save('school-observer-'+role.toLowerCase()+'-default-final-response.json',{source:process.env.A_REVIEW_CANDIDATE_SHA??'source-hashed-working-tree',mockBoundaries:['database','session','current population','consent','stored admission/runtime read'],ordinaryFeedback:receipt,final:actual})
  expect(actual.status).toBe(200)
  expect(actual.body.data.replayed).toBe(true)
  expect(actual.body.data).not.toHaveProperty('assessment')
  expect(JSON.stringify(actual.body.data)).not.toMatch(/Synthetic sensitive score|itemScores|interpretations/)
  expect(actual.body.data.assessment?.report?.scores,'The report-first DTO must also respect the ordinary observer NONE ceiling').toBeUndefined()
 })
 it('receipt query is a working positive control without changing the submitted scientific payload',async()=>{
  await prepare()
  const actual=await request(scalePath+'?response=receipt','PARENT',body);save('school-observer-receipt-control.json',actual)
  expect(actual).toMatchObject({status:200,body:{data:{completed:true,replayed:true}}})
  expect(actual.body.data).not.toHaveProperty('assessment')
  expect(JSON.stringify(actual.body.data)).not.toMatch(/Synthetic sensitive score|itemScores|interpretations/)
 })
 it('ADMIN with an actual assigned TEACHER task must be allowed through the feedback respondent guard',async()=>{
  await prepare('TEACHER')
  const assigned=await listCampusTeacherRunTasks({userId:'observer',role:'ADMIN',accountDomain:'SCHOOL'} as any,'school')
  expect(assigned.list[0]).toMatchObject({executionId,status:'COMPLETED',feedbackMode:'COMPOSITION'})
  const actual=await request(feedbackPath,'ADMIN');save('school-observer-admin-feedback-response.json',{assigned,actual,feedbackServiceCalls:f.feedback.mock.calls})
  expect(actual.status,'The production task reader admits this ADMIN/TEACHER respondent; feedback must reach actual task/report authorization').toBe(200)
 })
 it('TEACHER feedback positive control reaches the same authorized feedback service',async()=>{
  await prepare('TEACHER')
  const actual=await request(feedbackPath,'TEACHER')
  expect(actual).toMatchObject({status:200,body:{data:{state:'COMPLETION_ONLY'}}})
  expect(f.feedback).toHaveBeenCalledWith({executionId,actorUserId:'observer'})
 })
})
