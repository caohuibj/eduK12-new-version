import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {createPrivateTool,updatePrivateTool,freezePrivateTool} from '../../modules/education-tools/private-tool.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {addPrivateCompositionRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import {addTeacherPrivateCompositionRunTrack,teacherTrackingOptions,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {schoolTrackingOptions} from '../../modules/campus/personal-tracking'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
suite('Education tracking report option matches the original publication policy',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it.each(['SCHOOL','TEACHER'] as const)('%s reports the pure-Form composition restriction before publication while retaining receipt-only publication',async product=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product,trackCount:0,publish:false})
  const context:PrivateToolContext={entry:product,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
  const freeze=async(kind:'FORM'|'COMPOSITION',definition:unknown)=>{
   const draft=await createPrivateTool(context,{kind,title:'仅采集表单 '+kind})
   const saved=await updatePrivateTool(context,draft.id,{expectedRevision:draft.revision,title:draft.title,definition})
   return freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  }
  const form=await freeze('FORM',{schemaVersion:2,pages:[{pageKey:'p',title:'表单页',questions:[{itemKey:'comment',type:'SHORT_TEXT',prompt:'活动记录',required:false,options:[],rows:[]}]}]})
  const composition=await freeze('COMPOSITION',{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'仅用于采集的普通问卷',
   blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:form.id,contentHash:form.contentHash}}]})
  const body={expectedVersion:f.expectedVersion,privateComposition:{versionId:composition.id,contentHash:composition.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.participantMembershipId!]}}
  const teacher={organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId}
  if(product==='SCHOOL')await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,parent:{kind:'SCHOOL_ACTIVITY',id:f.workflow.id}},body)
  else await addTeacherPrivateCompositionRunTrack(teacher,body)
  const options=product==='SCHOOL'?await schoolTrackingOptions({actor:f.manager,organizationId:f.organizationId,courseId:f.workflow.id,runId:f.runId}):await teacherTrackingOptions(teacher)
  expect(options.choices).toEqual([])
  expect(options.participantReport).toEqual({eligible:false,reason:'当前测评所选工具均未配置受测者报告，仅用于数据采集，请使用仅回执模式发布'})
  await f.open()
  const publish=(provideParticipantReport:boolean)=>product==='SCHOOL'?f.publish(undefined,provideParticipantReport):publishTeacherRun({...teacher,expectedVersion:body.expectedVersion+1,provideParticipantReport})
  await expect(publish(true)).rejects.toMatchObject({code:'RUN_PARTICIPANT_REPORT_NOT_CONFIGURED',statusCode:400,message:options.participantReport!.reason})
  expect(await f.executions()).toHaveLength(0)
  await publish(false)
  expect(await f.executions()).toHaveLength(1)
  const [track]=await db.$queryRaw<Array<{receiptOnly:boolean}>>`SELECT receipt_only AS "receiptOnly" FROM assessment_run_tracks WHERE run_id=${f.runId}`
  expect(track.receiptOnly).toBe(true)
 },60000)
})
