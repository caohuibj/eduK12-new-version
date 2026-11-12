import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {independentReviewer} from './independent-reviewer'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {createCustomScaleDefinition,hashScaleDefinition} from '../../modules/scale/scale-definition'
import {
  registerDescriptiveResource,transitionDescriptiveResource,
} from '../../modules/assessment-run/registeredResources'
import {changeTeacherScaleLicense} from '../../modules/huiteacher/scaleLicense.service'
import {
  createHuiteacherTarget,createHuiteacherEvent,
  createHuiteacherEventRunDraft,transitionHuiteacherEvent,
  readHuiteacherEventRun,
} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {teacherPilotContentIssues} from '../../modules/huiteacher/teacherPilotContent'
import teacherScaleRouter,{listOwnTeacherScaleTasks} from '../../modules/huiteacher/scaleRuntime.routes'

const URL=integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite=URL?describe:describe.skip
const previousEncryptionKey=process.env.DATA_ENCRYPTION_KEY
const TASK_COUNT=120
const PAGE=100

type TemplateGraph={
  organizationId:string
  targetId:string
  managerId:string
  teacherId:string
  teacherMembershipId:string
  resourceKey:string
  resourceVersion:string
  event:Record<string,unknown>
  run:Record<string,unknown>
  track:Record<string,unknown>
  respondent:Record<string,unknown>
  subject:Record<string,unknown>
  relationship:Record<string,unknown>
  execution:Record<string,unknown>
}

type SeededTask={executionId:string;eventId:string}

let db:PrismaClient
let teacherId=''
let seeded:SeededTask[]=[]

const edu=async()=>{
  const userId=randomUUID()
  return db.user.create({data:{
    id:userId,username:'keyset-teacher-'+userId.replace(/-/g,''),
    accountDomain:'SCHOOL',passwordHash:'synthetic-test-only',
    role:'TEACHER',teacherApproved:true,
  }})
}
const teacherSchool=async(userId:string)=>{
  const organization=await db.organization.create({data:{
    id:randomUUID(),name:'keyset-school-'+randomUUID(),
    createdByUserId:userId,productDomain:'SCHOOL',
  }})
  const membership=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:organization.id,userId,
    orgRole:'ORG_ADMIN',
  }})
  await db.organizationPersonaGrant.create({data:{
    id:randomUUID(),organizationId:organization.id,
    membershipId:membership.id,persona:'TEACHER',grantedByUserId:userId,
  }})
  await db.educationProductEntitlement.create({data:{
    organizationId:organization.id,product:'HUITEACHER',status:'ACTIVE',
    grantedByUserId:userId,
  }})
  await db.educationProductRoleGrant.create({data:{
    id:randomUUID(),organizationId:organization.id,
    membershipId:membership.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',
    grantedByUserId:userId,
  }})
  return {organization,membership}
}

async function publishLicensedTeacherScale(){
  const admin=await db.user.create({data:{
    username:'keyset-release-'+randomUUID(),passwordHash:'synthetic',
    accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN',
  }})
  const actor={userId:admin.id,platformRole:'SYSTEM_ADMIN' as const}
  const entryAdmin=await db.user.create({data:{
    username:'keyset-entry-'+randomUUID(),passwordHash:'synthetic-only',
    accountDomain:'TRAINING',platformRole:'STANDARD',role:'TEACHER',teacherApproved:true,
  }})
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:entryAdmin.id,entry:'HUITEACHER',grantedBy:admin.id}})
  const definition=createCustomScaleDefinition()
  definition.respondentType='teacher_self_report'
  definition.source.title='原创合成教师工作体验'
  definition.items=['Q1','Q2','Q3'].map((itemCode,sortOrder)=>({
    itemCode,sortOrder,content:'本轮教师工作体验 '+(sortOrder+1),
    type:'single',required:true,responseSetKey:'default',randomizeOptions:false,
  }))
  definition.scoring.itemRules=definition.items.map(item=>({
    itemCode:item.itemCode,transform:{type:'identity' as const},
  }))
  definition.scoring.scores=[{
    key:'support',type:'total',label:'自我支持体验',
    direction:'descriptive',canonical:true,displayPrecision:1,
    source:{type:'items',aggregation:'sum',
      items:definition.items.map(item=>({itemCode:item.itemCode,weight:1}))},
  }]
  definition.report.primaryScoreKeys=['support']
  definition.report.scoreOrder=['support']
  definition.report.audienceContract={
    schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',
    locale:'zh-CN',
    qcReview:{reviewer:'synthetic-test-independent-editor',
      reviewedAt:'2026-10-12T00:00:00.000Z',
      basis:'Isolated fixture: a reader-facing pilot explanation and privacy check'},
  }
  definition.report.interpretations=[{
    scoreKey:'support',headline:'你对支持资源的体验',
    source:{type:'score_only'},
    summary:'这三道题反映你最近一次填写问卷时对工作支持的主观感受。它们不能代表你所有的工作经历，也不能判断你是否是一位优秀教师。你可以回想某一次与同事协作或者寻求学校帮助的经历：当时真正帮助到你的是什么？哪些支持还不够具体？如果近期工作负担明显增加，可以把需要的时间、资源或者协作方式写下来，与信任的同事或学校沟通。再次测量前，也可以观察自己的工作环境是否发生了变化。',
    bands:[],
    guidance:[
      {category:'reflection',text:'回想最近一次获得实际支持的情境，记录哪种帮助起到了作用。'},
      {category:'strategy',text:'选出一个现实可行的需求，尝试与团队约定下一步行动。'},
    ],
  }]
  expect(teacherPilotContentIssues(definition)).toEqual([])
  const definitionHash=hashScaleDefinition(definition)
  const scale=await db.scale.create({data:{
    code:'teacher_self_'+randomUUID().replace(/-/g,''),
    name:'教师工作体验（合成测试）',status:'PUBLISHED',
    creatorId:admin.id,instrumentClass:'CUSTOM_DESCRIPTIVE',
    definition,definitionHash,
  }})
  await publishRegisteredScaleFixture(db,scale.id)
  const resource=await registerDescriptiveResource(actor,scale.id,'TEACHER_INDIVIDUAL')
  const reviewer=await independentReviewer(actor)
  await transitionDescriptiveResource(reviewer,resource.id,'review')
  await transitionDescriptiveResource(actor,resource.id,'publish')
  return {entryAdmin,resource}
}

async function publishOneRunForTeacher(input:{
  managerId:string
  schoolId:string
  teacherId:string
  resourceKey:string
  resourceVersion:string
  resourceId:string
  entryAdminId:string
  licensed:boolean
}){
  const target=await createHuiteacherTarget({
    organizationId:input.schoolId,actorUserId:input.managerId,
    kind:'ORGANIZATION',name:'本校教师个人发展',
  })
  const event=await createHuiteacherEvent({
    organizationId:input.schoolId,actorUserId:input.managerId,
    targetId:target.id,kind:'ASSESSMENT',title:'教师个人描述性自评',
  })
  const draft=await createHuiteacherEventRunDraft({
    organizationId:input.schoolId,actorUserId:input.managerId,
    eventId:event.id,name:'教师自评 Run',
  })
  const scope={organizationId:input.schoolId,actorUserId:input.managerId,eventId:event.id}
  if(!input.licensed){
    await changeTeacherScaleLicense({
      organizationId:input.schoolId,resourceId:input.resourceId,actorUserId:input.entryAdminId,
      action:'GRANT',
    })
  }
  await addTeacherRunTrack({
    ...scope,resource:{family:'SCALE',key:input.resourceKey,version:input.resourceVersion},
    subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},
    requestedPolicy:{
      subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
      relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
      analysisMode:'INDIVIDUAL_ONLY',minimumRespondents:null,
      visibilityPolicyKey:'HUITEACHER_ADULT_SELF_PILOT_V1',
    },
  })
  await transitionHuiteacherEvent({...scope,action:'OPEN',expectedVersion:1})
  const state=await readHuiteacherEventRun(scope)
  await publishTeacherRun({...scope,expectedVersion:state.version})
  return {targetId:target.id,eventId:event.id,runId:draft.runId}
}

async function loadTemplate(runId:string,teacherId:string):Promise<TemplateGraph>{
  const [row]=await db.$queryRaw<Array<any>>`
    SELECT
      e."id" AS execution_id, e."organization_id", e."run_id", e."track_id",
      e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id",
      e."relationship_snapshot_id", e."status" AS execution_status,
      e."scientific_maturity", e."scientific_provenance", e."scientific_provenance_hash",
      e."personal_changes_snapshots",
      run."name" AS run_name, run."status" AS run_status, run."version" AS run_version,
      run."created_by_user_id" AS run_created_by, run."published_at",
      track."resource_family", track."resource_key", track."resource_version",
      track."subject_selector", track."respondent_selector", track."requested_policy",
      track."frozen_resource_policy", track."resource_policy_hash",
      event."id" AS event_id, event."target_id", event."kind" AS event_kind,
      event."title" AS event_title, event."status" AS event_status,
      event."version" AS event_version, event."opened_at",
      event."created_by_user_id" AS event_created_by,
      respondent."id" AS respondent_id, respondent."provenance_kind" AS respondent_provenance,
      respondent."user_id" AS respondent_user, respondent."membership_id" AS respondent_membership,
      respondent."actor_role" AS respondent_role, respondent."snapshot_payload" AS respondent_payload,
      respondent."snapshot_hash" AS respondent_hash,
      subject."id" AS subject_id, subject."provenance_kind" AS subject_provenance,
      subject."user_id" AS subject_user, subject."membership_id" AS subject_membership,
      subject."actor_role" AS subject_role, subject."snapshot_payload" AS subject_payload,
      subject."snapshot_hash" AS subject_hash,
      rel."id" AS rel_id, rel."relationship_kind", rel."relationship_ref",
      rel."snapshot_payload" AS rel_payload, rel."snapshot_hash" AS rel_hash,
      link."bound_by_user_id"
    FROM "assessment_run_executions" e
    JOIN "assessment_runs" run ON run."id"=e."run_id" AND run."organization_id"=e."organization_id"
    JOIN "assessment_run_tracks" track ON track."id"=e."track_id" AND track."run_id"=e."run_id"
    JOIN "assessment_run_actor_snapshots" respondent ON respondent."id"=e."respondent_actor_snapshot_id"
      AND respondent."run_id"=e."run_id"
    JOIN "assessment_run_actor_snapshots" subject ON subject."id"=e."subject_actor_snapshot_id"
      AND subject."run_id"=e."run_id"
    JOIN "assessment_run_relationship_snapshots" rel ON rel."id"=e."relationship_snapshot_id"
      AND rel."run_id"=e."run_id"
    JOIN "huiteacher_evaluation_run_links" link ON link."run_id"=e."run_id"
    JOIN "huiteacher_evaluation_events" event ON event."id"=link."event_id"
    WHERE e."run_id"=${runId} AND respondent."user_id"=${teacherId}
    LIMIT 1
  `
  if(!row)throw new Error('published teacher execution was not found')
  return {
    organizationId:row.organization_id,
    targetId:row.target_id,
    managerId:row.event_created_by,
    teacherId:row.respondent_user,
    teacherMembershipId:row.respondent_membership,
    resourceKey:row.resource_key,
    resourceVersion:row.resource_version,
    event:row,
    run:row,
    track:row,
    respondent:row,
    subject:row,
    relationship:row,
    execution:row,
  }
}

async function cloneFromTemplate(template:TemplateGraph,createdAt:string):Promise<SeededTask>{
  const sameActor=template.respondent['respondent_id']===template.subject['subject_id']
  const eventId=randomUUID()
  const runId=randomUUID()
  const trackId=randomUUID()
  const respondentId=randomUUID()
  const subjectId=sameActor?respondentId:randomUUID()
  const relationshipId=randomUUID()
  const executionId=randomUUID()
  const row=template.event
  await db.$executeRawUnsafe(
    `INSERT INTO huiteacher_evaluation_events
      (id, organization_id, target_id, kind, title, status, version, opened_at, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,$8)`,
    eventId,template.organizationId,template.targetId,row['event_kind'],row['event_title'],
    row['event_version'],row['opened_at'],template.managerId,
  )
  await db.$executeRawUnsafe(
    `INSERT INTO assessment_runs
      (id, organization_id, name, status, version, created_by_user_id, published_at)
     VALUES ($1,$2,$3,'PUBLISHED',$4,$5,$6)`,
    runId,template.organizationId,row['run_name'],row['run_version'],
    row['run_created_by'],row['published_at'],
  )
  await db.$executeRawUnsafe(
    `INSERT INTO assessment_run_tracks
      (id, organization_id, run_id, resource_family, resource_key, resource_version,
       subject_selector, respondent_selector, requested_policy, frozen_resource_policy, resource_policy_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
    trackId,template.organizationId,runId,row['resource_family'],row['resource_key'],row['resource_version'],
    JSON.stringify(row['subject_selector']),JSON.stringify(row['respondent_selector']),
    JSON.stringify(row['requested_policy']),
    row['frozen_resource_policy']==null?null:JSON.stringify(row['frozen_resource_policy']),
    row['resource_policy_hash'],
  )
  const insertActor=async(id:string,prefix:string)=>{
    await db.$executeRawUnsafe(
      `INSERT INTO assessment_run_actor_snapshots
        (id, organization_id, run_id, provenance_kind, user_id, membership_id, actor_role,
         snapshot_payload, snapshot_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      id,template.organizationId,runId,row[`${prefix}_provenance`],row[`${prefix}_user`],
      row[`${prefix}_membership`],row[`${prefix}_role`],
      JSON.stringify(row[`${prefix}_payload`]),row[`${prefix}_hash`],
    )
  }
  await insertActor(respondentId,'respondent')
  if(!sameActor)await insertActor(subjectId,'subject')
  await db.$executeRawUnsafe(
    `INSERT INTO assessment_run_relationship_snapshots
      (id, organization_id, run_id, relationship_kind, relationship_ref,
       subject_actor_snapshot_id, respondent_actor_snapshot_id, snapshot_payload, snapshot_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    relationshipId,template.organizationId,runId,row['relationship_kind'],row['relationship_ref'],
    subjectId,respondentId,JSON.stringify(row['rel_payload']),row['rel_hash'],
  )
  await db.$executeRawUnsafe(
    `INSERT INTO huiteacher_evaluation_run_links
      (organization_id, event_id, run_id, bound_by_user_id)
     VALUES ($1,$2,$3,$4)`,
    template.organizationId,eventId,runId,row['bound_by_user_id'],
  )
  await db.$executeRawUnsafe(
    `INSERT INTO assessment_run_executions
      (id, organization_id, run_id, track_id, subject_actor_snapshot_id, respondent_actor_snapshot_id,
       relationship_snapshot_id, status, scientific_maturity, scientific_provenance,
       scientific_provenance_hash, personal_changes_snapshots, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::timestamptz)`,
    executionId,template.organizationId,runId,trackId,subjectId,respondentId,relationshipId,
    row['execution_status'],row['scientific_maturity'],
    row['scientific_provenance']==null?null:JSON.stringify(row['scientific_provenance']),
    row['scientific_provenance_hash'],
    JSON.stringify(row['personal_changes_snapshots']??{}),
    createdAt,
  )
  return {executionId,eventId}
}

async function setExecutionCreatedAt(executionId:string,createdAt:string){
  await db.$executeRawUnsafe(
    `UPDATE assessment_run_executions SET created_at=$1::timestamptz WHERE id=$2`,
    createdAt,executionId,
  )
}

/** Canonical microsecond instants that sort distinctly in created_at DESC. */
function stamp(indexFromNewest:number){
  // index 0 is newest. Use a fixed second and descending microseconds.
  const micros=900000-indexFromNewest
  if(micros<0)throw new Error('timestamp index overflow')
  return `2026-11-01T12:00:00.${String(micros).padStart(6,'0')}Z`
}

async function walkPages(userId:string){
  const pages:{ids:string[];cursor:{createdAt:string;id:string}|null;truncated:boolean}[]=[]
  let cursor:{createdAt:string;id:string}|undefined
  for(let guard=0;guard<20;guard++){
    const page=await listOwnTeacherScaleTasks(userId,cursor)
    const ids=page.list.map(item=>item.executionId)
    pages.push({ids,cursor:page.nextCursor,truncated:page.truncated})
    if(!page.truncated||!page.nextCursor)break
    cursor=page.nextCursor
  }
  return pages
}

type RouteLayer={route?:{path:string;methods:Record<string,boolean>;stack:Array<{handle:(req:unknown,res:unknown,next:(error?:unknown)=>void)=>void}>}}
function listHandler(){
  const layer=(teacherScaleRouter as unknown as {stack:RouteLayer[]}).stack.find(
    entry=>entry.route?.path==='/my-scale-tasks'&&entry.route.methods.get,
  )
  const handle=layer?.route?.stack.at(-1)?.handle
  if(!handle)throw new Error('GET /my-scale-tasks handler is not registered')
  return handle
}
async function getScaleTasks(queryString:Record<string,unknown>){
  let statusCode=200,body:unknown,forwarded:unknown
  const req={query:queryString,user:{userId:teacherId||randomUUID()},params:{},headers:{},get(){return undefined}}
  const res={
    status(code:number){statusCode=code;return this},
    setHeader(){return this},
    json(payload:unknown){body=payload;return this},
  }
  listHandler()(req,res,error=>{forwarded=error??new Error('next')})
  await new Promise(resolve=>setImmediate(resolve))
  return {statusCode,body:body as {message?:string}|undefined,forwarded}
}

suite('Teacher personal Scale task keyset (real PostgreSQL)',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(URL!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:URL!}}})
    await db.$connect()

    const manager=await edu()
    const teacher=await edu()
    teacherId=teacher.id
    const {organization}=await teacherSchool(manager.id)
    const member=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:organization.id,userId:teacher.id,orgRole:'MEMBER',
    }})
    await db.organizationPersonaGrant.create({data:{
      id:randomUUID(),organizationId:organization.id,membershipId:member.id,
      persona:'TEACHER',grantedByUserId:manager.id,
    }})
    const {entryAdmin,resource}=await publishLicensedTeacherScale()
    const first=await publishOneRunForTeacher({
      managerId:manager.id,schoolId:organization.id,teacherId:teacher.id,
      resourceKey:resource.resource_key,resourceVersion:resource.resource_version,
      resourceId:resource.id,entryAdminId:entryAdmin.id,licensed:false,
    })
    const template=await loadTemplate(first.runId,teacher.id)
    const firstTask={executionId:template.execution['execution_id'] as string,eventId:first.eventId}
    await setExecutionCreatedAt(firstTask.executionId,stamp(0))
    seeded=[firstTask]
    for(let i=1;i<TASK_COUNT;i++){
      seeded.push(await cloneFromTemplate(template,stamp(i)))
    }
  },180_000)

  afterAll(async()=>{
    await db?.$disconnect()
    if(previousEncryptionKey===undefined)delete process.env.DATA_ENCRYPTION_KEY
    else process.env.DATA_ENCRYPTION_KEY=previousEncryptionKey
  })

  it('pages more than 100 rows with no duplicates or gaps',async()=>{
    const expected=seeded.map(task=>task.executionId)
    // stamp(i) is newer for smaller i, and ids are unique; order is created_at DESC, id DESC.
    // Because every created_at is unique, order is exactly stamp index 0..119.
    const first=await listOwnTeacherScaleTasks(teacherId)
    expect(first.list).toHaveLength(PAGE)
    expect(first.truncated).toBe(true)
    expect(first.nextCursor).toEqual({createdAt:stamp(PAGE-1),id:expected[PAGE-1]})
    expect(first.nextCursor?.createdAt).toMatch(/\.\d{6}Z$/)
    expect(first.list.map(item=>item.executionId)).toEqual(expected.slice(0,PAGE))
    expect(first.list[0]).not.toHaveProperty('createdAtMicros')

    const pages=await walkPages(teacherId)
    expect(pages[0].ids).toEqual(expected.slice(0,PAGE))
    expect(pages[0].truncated).toBe(true)
    const concatenated=pages.flatMap(page=>page.ids)
    expect(concatenated).toEqual(expected)
    expect(new Set(concatenated).size).toBe(expected.length)
    expect(pages.at(-1)?.truncated).toBe(false)
    expect(pages.at(-1)?.cursor).toBeNull()
    for(let i=0;i<pages.length-1;i++){
      const left=pages[i].ids.at(-1)
      const right=pages[i+1].ids[0]
      const leftIndex=expected.indexOf(left!)
      const rightIndex=expected.indexOf(right!)
      expect(rightIndex).toBe(leftIndex+1)
    }
  })

  it('keeps identical timestamps stable and complete across the page cut',async()=>{
    // Positions 89..119 (0-based) straddle the 100/101 cut. After the update,
    // the first 89 rows stay ahead (newer unique times). The tied block sorts by id DESC.
    const uniquePrefix=seeded.slice(0,89).map(task=>task.executionId)
    const tied=seeded.slice(89)
    const tiedAt='2026-11-01T11:00:00.123456Z'
    for(const task of tied){
      await setExecutionCreatedAt(task.executionId,tiedAt)
    }
    const tiedOrdered=[...tied].map(task=>task.executionId).sort((a,b)=>a<b?1:a>b?-1:0)
    const expected=[...uniquePrefix,...tiedOrdered]
    expect(expected).toHaveLength(TASK_COUNT)
    expect(new Set(expected).size).toBe(TASK_COUNT)

    const pages=await walkPages(teacherId)
    const concatenated=pages.flatMap(page=>page.ids)
    expect(concatenated).toEqual(expected)
    expect(pages[0].ids).toHaveLength(PAGE)
    expect(pages[0].truncated).toBe(true)
    expect(pages[0].ids.slice(89)).toEqual(expected.slice(89,PAGE))
    expect(pages[1].ids).toEqual(expected.slice(PAGE))
    // Every tied id appears once, and the page-2 tied rows continue id DESC.
    const tiedSeen=concatenated.filter(id=>tiedOrdered.includes(id))
    expect(tiedSeen).toEqual(tiedOrdered)
    expect(new Set(tiedSeen).size).toBe(tiedOrdered.length)
  })

  it('re-applies authority SQL on page 2 after one later task is revoked',async()=>{
    const pagesBefore=await walkPages(teacherId)
    const page1=pagesBefore[0]
    const page2Ids=pagesBefore.slice(1).flatMap(page=>page.ids)
    expect(page1.ids).toHaveLength(PAGE)
    expect(page2Ids.length).toBeGreaterThan(1)
    const revokedId=page2Ids[0]
    const revoked=seeded.find(task=>task.executionId===revokedId)
    expect(revoked).toBeTruthy()
    await db.huiteacherEvaluationEvent.update({
      where:{id:revoked!.eventId},
      data:{status:'CANCELLED',closedAt:new Date()},
    })
    const page2=await listOwnTeacherScaleTasks(teacherId,page1.cursor!)
    const remaining=page2.list.map(item=>item.executionId)
    expect(remaining).not.toContain(revokedId)
    expect(remaining).toEqual(page2Ids.filter(id=>id!==revokedId))
    expect(page2.list.length).toBe(page2Ids.length-1)
  })

  it('rejects an invalid cursor with 400 and does not query',async()=>{
    const forged=Buffer.from(JSON.stringify({createdAt:'2026-02-31T12:00:00.123456Z',id:'exec-forged'})).toString('base64url')
    for(const cursor of ['!!!not-a-cursor',forged,'x'.repeat(501),['not','a-string']]){
      const response=await getScaleTasks({cursor})
      expect(response.statusCode).toBe(400)
      expect(response.body?.message).toBe('任务游标无效')
      expect(response.forwarded).toBeUndefined()
    }
  })
})
