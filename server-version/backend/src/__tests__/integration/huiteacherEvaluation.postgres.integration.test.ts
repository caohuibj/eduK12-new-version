import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll,beforeAll,describe,expect,it } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import {
  createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,
  transitionHuiteacherEvent,listHuiteacherTargets,
} from '../../modules/huiteacher/evaluation.service'
import {
  createHuiteacherForm,readHuiteacherForm,updateHuiteacherForm,
  publishHuiteacherForm,previewHuiteacherForm,
} from '../../modules/huiteacher/forms.service'
import { assertCurrentRunManagerBoundary } from '../../modules/assessment-run/resourceBoundary'
const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
type Fixture={organizationId:string;adminUserId:string;memberUserId:string}
async function setupTeacher():Promise<Fixture>{
  const admin=await db.user.create({data:{
    username:'evaluation_admin_'+randomUUID().replace(/-/g,''),
    accountDomain:'SCHOOL',role:'TEACHER',
    passwordHash:'synthetic',teacherApproved:true,
  }})
  const member=await db.user.create({data:{
    username:'evaluation_member_'+randomUUID().replace(/-/g,''),
    accountDomain:'SCHOOL',role:'TEACHER',
    passwordHash:'synthetic',teacherApproved:true,
  }})
  const org=await db.organization.create({data:{
    id:randomUUID(),name:'teacher-evaluation-'+randomUUID(),
    productDomain:'SCHOOL',createdByUserId:admin.id,
  }})
  const manager=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN',
  }})
  await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:org.id,userId:member.id,orgRole:'MEMBER',
  }})
  await db.educationProductEntitlement.create({data:{
    organizationId:org.id,product:'HUITEACHER',
    status:'ACTIVE',grantedByUserId:admin.id,
  }})
  await db.educationProductRoleGrant.create({data:{
    id:randomUUID(),organizationId:org.id,
    membershipId:manager.id,product:'HUITEACHER',
    role:'PRODUCT_ADMIN',grantedByUserId:admin.id,
  }})
  return {organizationId:org.id,adminUserId:admin.id,memberUserId:member.id}
}
suite('Huiteacher evaluation and Survey Form V2 contracts — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(URL!)
    db=new PrismaClient({datasources:{db:{url:URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})

  it('separates manager-only targets, event transition, and canonical Run bindings',async()=>{
    const f=await setupTeacher()
    await expect(createHuiteacherTarget({
      organizationId:f.organizationId,actorUserId:f.memberUserId,
      kind:'PERSON',name:'unauthorized',
    })).rejects.toThrow()
    const target=await createHuiteacherTarget({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      kind:'PERSON',name:'Observed Teacher',
    })
    expect((await listHuiteacherTargets({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
    })).list.some(x=>x.id===target.id)).toBe(true)
    await expect(listHuiteacherTargets({
      organizationId:f.organizationId,actorUserId:f.memberUserId,
    })).rejects.toThrow()
    const event=await createHuiteacherEvent({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      targetId:target.id,kind:'CLASSROOM',title:'Classroom Observation',
    })
    const result=await createHuiteacherEventRunDraft({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      eventId:event.id,name:'Canonical Run',
    })
    const [run,link]=await Promise.all([
      db.$queryRaw<Array<{status:string;organizationId:string}>>`
        SELECT "status","organization_id" AS "organizationId"
        FROM "assessment_runs" WHERE "id"=${result.runId}
      `,
      db.huiteacherEvaluationRunLink.findUnique({
        where:{organizationId_eventId:{
          organizationId:f.organizationId,eventId:event.id,
        }},
      }),
    ])
    expect(run[0]?.status).toBe('DRAFT')
    expect(run[0]?.organizationId).toBe(f.organizationId)
    expect(link?.runId).toBe(result.runId)
    await expect(createHuiteacherEventRunDraft({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      eventId:event.id,name:'duplicate',
    })).rejects.toThrow()
    await expect(assertCurrentRunManagerBoundary({
      organizationId:f.organizationId,runId:result.runId,
      actorUserId:f.memberUserId,
    })).rejects.toThrow()
    await assertCurrentRunManagerBoundary({
      organizationId:f.organizationId,runId:result.runId,
      actorUserId:f.adminUserId,
    })
    // Do not allow an empty Run to OPEN: it would freeze all later Track
    // configuration and leave the school activity permanently unusable.
    await expect(transitionHuiteacherEvent({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      eventId:event.id,expectedVersion:1,action:'OPEN',
    })).rejects.toThrow()
    expect((await transitionHuiteacherEvent({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      eventId:event.id,expectedVersion:1,action:'CANCEL',
    })).status).toBe('CANCELLED')
  })

  it('Form-only uses Survey V2 validation and freezes published answers',async()=>{
    const f=await setupTeacher()
    const created=await createHuiteacherForm({
      organizationId:f.organizationId,actorUserId:f.adminUserId,title:'Meeting Form',
    })
    const body={schemaVersion:2,pages:[{
      pageKey:'page1',title:'现场观察',
      questions:[{
        itemKey:'likert1',type:'LIKERT',prompt:'讨论质量',
        required:true,options:[
          {optionKey:'low',label:'较低'},
          {optionKey:'high',label:'较高'},
        ],rows:[],
      },{
        itemKey:'text1',type:'LONG_TEXT',prompt:'请列举支持判断的事实',
        required:false,options:[],rows:[],maxLength:500,
      }],
    }]}
    await updateHuiteacherForm({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      formId:created.id,expectedRevision:created.revision,
      title:'Meeting Form',definition:body,
    })
    const preview=await previewHuiteacherForm({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      formId:created.id,answers:{likert1:'high',text1:'客观观察证据'},
    })
    expect(preview.score).toBeNull()
    expect(preview.rawAnswers.likert1).toBe('high')
    const fetched=await readHuiteacherForm({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      formId:created.id,
    })
    const published=await publishHuiteacherForm({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      formId:created.id,expectedRevision:fetched.revision,
    })
    expect(published.status).toBe('PUBLISHED')
    await expect(updateHuiteacherForm({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      formId:created.id,expectedRevision:published.revision,
      title:'malicious change',definition:body,
    })).rejects.toThrow()
    await expect(db.huiteacherFormInstrument.delete({where:{id:created.id}}))
      .rejects.toThrow()
  })

  it('product suspension revokes evaluation access without deleting old records',async()=>{
    const f=await setupTeacher()
    const target=await createHuiteacherTarget({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
      kind:'ORGANIZATION',name:'School',
    })
    await db.educationProductEntitlement.update({
      where:{organizationId_product:{organizationId:f.organizationId,product:'HUITEACHER'}},
      data:{status:'SUSPENDED',suspendedAt:new Date()},
    })
    await expect(listHuiteacherTargets({
      organizationId:f.organizationId,actorUserId:f.adminUserId,
    })).rejects.toThrow()
    expect(await db.huiteacherEvaluationTarget.findUnique({where:{id:target.id}})).not.toBeNull()
  })
})
