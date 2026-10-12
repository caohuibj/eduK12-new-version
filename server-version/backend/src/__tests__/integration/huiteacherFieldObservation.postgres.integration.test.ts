import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe,it,expect,beforeAll,afterAll } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import {
  createHuiteacherTarget,createHuiteacherEvent,
} from '../../modules/huiteacher/evaluation.service'
import {
  inviteHuiteacherObserver,acceptHuiteacherObserver,
  revokeHuiteacherObserver,myHuiteacherFieldAssignments,
  listHuiteacherObserverGrants,createHuiteacherObservation,
  readOwnHuiteacherObservations,readFormalHuiteacherObservations,
  updateHuiteacherObservation,submitHuiteacherObservation,
} from '../../modules/huiteacher/observer.service'

const dbUrl=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=dbUrl?describe:describe.skip
let db:PrismaClient
const originalKey=process.env.DATA_ENCRYPTION_KEY
const makeUser=async()=>db.user.create({data:{
  id:randomUUID(),username:'field-review-'+randomUUID().replace(/-/g,''),
  passwordHash:'synthetic-only',accountDomain:'SCHOOL',
  role:'TEACHER',teacherApproved:true,
}})

suite('Huiteacher PR4 event-scoped expert access and encrypted field records',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(dbUrl!)
    process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:dbUrl!}}})
    await db.$connect()
  })
  afterAll(async()=>{
    await db?.$disconnect()
    if(originalKey===undefined)delete process.env.DATA_ENCRYPTION_KEY
  })
  it('keeps invited outside expert separate from School membership and private reflection',async()=>{
    const manager=await makeUser()
    const expert=await makeUser()
    const stranger=await makeUser()
    const school=await db.organization.create({data:{
      id:randomUUID(),name:'field-test-'+randomUUID(),productDomain:'SCHOOL',
      createdByUserId:manager.id,
    }})
    const member=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:school.id,userId:manager.id,orgRole:'ORG_ADMIN',
    }})
    await db.educationProductEntitlement.create({data:{
      organizationId:school.id,product:'HUITEACHER',
      status:'ACTIVE',grantedByUserId:manager.id,
    }})
    await db.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:school.id,membershipId:member.id,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:manager.id,
    }})
    const target=await createHuiteacherTarget({
      organizationId:school.id,actorUserId:manager.id,
      kind:'TEAM',name:'外部专家观察项目组',
    })
    const event=await createHuiteacherEvent({
      organizationId:school.id,actorUserId:manager.id,
      targetId:target.id,kind:'CLASSROOM',title:'受控观察',
    })
    const invitation=await inviteHuiteacherObserver({
      organizationId:school.id,eventId:event.id,
      actorUserId:manager.id,observerUserId:expert.id,
      role:'EXPERT',expiresAt:new Date(Date.now()+3600_000),
    })
    expect(invitation.status).toBe('INVITED')
    const claims=await myHuiteacherFieldAssignments(expert.id)
    expect(claims.list.some(x=>x.invitationId===invitation.id)).toBe(true)
    expect(await db.organizationMembership.findFirst({
      where:{organizationId:school.id,userId:expert.id},
    })).toBeNull()
    const accepted=await acceptHuiteacherObserver({
      userId:expert.id,invitationId:invitation.id,
    })
    expect(accepted.status).toBe('ACCEPTED')
    await expect(createHuiteacherObservation({
      organizationId:school.id,eventId:event.id,
      actorUserId:expert.id,kind:'FACT',content:'event still draft',
    })).rejects.toThrow()
    // Isolated event fixture opens only once. The canonical Run
    // publish lifecycle is separately specified/tested by PR2.
    await db.huiteacherEvaluationEvent.update({where:{id:event.id},
      data:{status:'OPEN',version:2,openedAt:new Date()},
    })
    await expect(createHuiteacherObservation({
      organizationId:school.id,eventId:event.id,
      actorUserId:stranger.id,kind:'FACT',content:'should be forbidden',
    })).rejects.toThrow()
    const raw=await createHuiteacherObservation({
      organizationId:school.id,eventId:event.id,actorUserId:expert.id,
      kind:'FORMAL_FEEDBACK',content:'课堂互动建议：先观察，再给反馈。',
    })
    const privateNote=await createHuiteacherObservation({
      organizationId:school.id,eventId:event.id,actorUserId:expert.id,
      kind:'PRIVATE_REFLECTION',content:'独立反思：只给专家本人保存。',
    })
    const encrypted=await db.huiteacherObservationRecord.findUniqueOrThrow({
      where:{id:privateNote.id},
    })
    expect(encrypted.bodyCipher).not.toContain('独立反思')
    const before=await readFormalHuiteacherObservations({
      organizationId:school.id,eventId:event.id,actorUserId:manager.id,
    })
    expect(before.list).toHaveLength(0)
    const updated=await updateHuiteacherObservation({
      id:raw.id,actorUserId:expert.id,expectedRevision:1,
      content:'事实基础的反馈：教学讨论较充分。',
    })
    expect(updated.revision).toBe(2)
    const submitted=await submitHuiteacherObservation({
      id:raw.id,actorUserId:expert.id,expectedRevision:2,
    })
    expect(submitted.status).toBe('SUBMITTED')
    await submitHuiteacherObservation({
      id:privateNote.id,actorUserId:expert.id,expectedRevision:1,
    })
    const shared=await readFormalHuiteacherObservations({
      organizationId:school.id,eventId:event.id,actorUserId:manager.id,
    })
    expect(shared.list).toHaveLength(1)
    expect(shared.list[0].content).toContain('事实基础')
    expect(JSON.stringify(shared)).not.toContain('独立反思')
    expect(JSON.stringify(shared)).not.toContain(expert.id)
    const owned=await readOwnHuiteacherObservations(expert.id)
    expect(owned.list.some(x=>x.id===privateNote.id&&x.content.includes('独立反思'))).toBe(true)
    await expect(updateHuiteacherObservation({
      id:raw.id,actorUserId:expert.id,expectedRevision:3,
      content:'attempt to rewrite a submitted observation',
    })).rejects.toThrow()
    await expect(db.huiteacherObservationRecord.delete({
      where:{id:raw.id},
    })).rejects.toThrow()
    const grants=await listHuiteacherObserverGrants({
      organizationId:school.id,eventId:event.id,actorUserId:manager.id,
    })
    expect(grants.list[0].observerUserId).toBe(expert.id)
    await revokeHuiteacherObserver({
      organizationId:school.id,eventId:event.id,
      actorUserId:manager.id,observerUserId:expert.id,
    })
    await expect(createHuiteacherObservation({
      organizationId:school.id,eventId:event.id,actorUserId:expert.id,
      kind:'FACT',content:'revoked should not write',
    })).rejects.toThrow()
    expect((await readOwnHuiteacherObservations(expert.id)).list
      .some(x=>x.kind==='PRIVATE_REFLECTION')).toBe(true)
  })
})
