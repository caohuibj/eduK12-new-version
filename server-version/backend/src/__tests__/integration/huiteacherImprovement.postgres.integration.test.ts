import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createHuiteacherTarget,createHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {readHuiteacherTargetTimeline} from '../../modules/huiteacher/timeline.service'
import {
  createHuiteacherImprovement,listHuiteacherImprovements,
  transitionHuiteacherImprovement,listMyHuiteacherImprovementTargets,
} from '../../modules/huiteacher/improvement.service'

/** PR6 only: disposal-grade PostgreSQL with real FKs, locks, encryption,
 * audited state transitions and DB immutable-history trigger. No mocks.
 * CI execution is intentionally deferred until all PR1–PR6 source is frozen.
 */
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=url?describe:describe.skip
let db:PrismaClient
const makeUser=(role:'TEACHER'|'STUDENT')=>db.user.create({data:{
  id:randomUUID(),username:'ht_pr6_'+randomUUID().replaceAll('-',''),
  role,accountDomain:'SCHOOL',teacherApproved:true,passwordHash:'synthetic',
}})
suite('Huiteacher PR6 longitudinal metadata and confidential improvement (isolated PG)',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('separates teacher personal actions from school governance with auditable immutable lifecycle',async()=>{
    const [admin,teacher,other,student]=await Promise.all([
      makeUser('TEACHER'),makeUser('TEACHER'),makeUser('TEACHER'),makeUser('STUDENT'),
    ])
    const org=await db.organization.create({data:{
      id:randomUUID(),name:'PR6 Teacher-only '+randomUUID(),
      productDomain:'SCHOOL',createdByUserId:admin.id,
    }})
    const adminMember=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:admin.id,orgRole:'ORG_ADMIN',
    }})
    await db.educationProductEntitlement.create({data:{
      organizationId:org.id,product:'HUITEACHER',status:'ACTIVE',
      grantedByUserId:admin.id,
    }})
    await db.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:org.id,membershipId:adminMember.id,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:admin.id,
    }})
    for(const participant of [teacher,other,student]){
      const member=await db.organizationMembership.create({data:{
        id:randomUUID(),organizationId:org.id,userId:participant.id,
        orgRole:'MEMBER',
      }})
      await db.organizationPersonaGrant.create({data:{
        id:randomUUID(),organizationId:org.id,membershipId:member.id,
        persona:participant.role==='STUDENT'?'STUDENT':'TEACHER',
        grantedByUserId:admin.id,
      }})
    }
    const target=await createHuiteacherTarget({
      organizationId:org.id,actorUserId:admin.id,kind:'PERSON',
      subjectUserId:teacher.id,name:'Professional growth target',
    })
    const event=await createHuiteacherEvent({
      organizationId:org.id,actorUserId:admin.id,targetId:target.id,
      kind:'ASSESSMENT',title:'First evaluation metadata',
    })
    await expect(createHuiteacherImprovement({
      organizationId:org.id,targetId:target.id,actorUserId:teacher.id,
      sourceEventId:event.id,audience:'PRIVATE_PERSONAL',
      goal:'提高课堂提问质量',plan:'记录每节课使用的追问方式并开展反思',
    })).rejects.toThrow() // no closed source and no fake report

    const privateGoal='这是一份只有教师本人可见的行动目标'
    const privateAction=await createHuiteacherImprovement({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
      audience:'PRIVATE_PERSONAL',goal:privateGoal,
      plan:'每周记录一次教学反思和与学生的沟通变化',
    })
    expect(privateAction.goal).toBe(privateGoal)
    const schoolAction=await createHuiteacherImprovement({
      actorUserId:admin.id,organizationId:org.id,targetId:target.id,
      audience:'SCHOOL_SHARED',goal:'优化学科组反馈机制',
      plan:'明确责任人和反馈时间，每月进行一次团队复盘',
    })
    expect(schoolAction.audience).toBe('SCHOOL_SHARED')
    await expect(createHuiteacherImprovement({
      actorUserId:admin.id,organizationId:org.id,targetId:target.id,
      audience:'PRIVATE_PERSONAL',goal:'管理者不可以为他人建立私人目标',
      plan:'此请求必须被正式业务权限拒绝',
    })).rejects.toThrow()
    await expect(createHuiteacherImprovement({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
      audience:'SCHOOL_SHARED',goal:'绕过学校管理者',
      plan:'普通教师没有学校产品管理授权',
    })).rejects.toThrow()
    const adminView=await listHuiteacherImprovements({
      actorUserId:admin.id,organizationId:org.id,targetId:target.id,
    })
    expect(adminView.list).toHaveLength(1)
    expect(adminView.list[0].id).toBe(schoolAction.id)
    expect(JSON.stringify(adminView)).not.toContain(privateGoal)
    const teacherView=await listHuiteacherImprovements({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
    })
    expect(teacherView.list.map(item=>item.id).sort()).toEqual(
      [privateAction.id,schoolAction.id].sort())
    for(const forbiddenActor of [other.id,student.id]){
      await expect(listHuiteacherImprovements({
        actorUserId:forbiddenActor,organizationId:org.id,targetId:target.id,
      })).rejects.toThrow()
      await expect(readHuiteacherTargetTimeline({
        actorUserId:forbiddenActor,organizationId:org.id,targetId:target.id,
      })).rejects.toThrow()
    }
    const ownTargets=await listMyHuiteacherImprovementTargets(teacher.id)
    expect(ownTargets.list.some(t=>t.targetId===target.id)).toBe(true)
    const otherTargets=await listMyHuiteacherImprovementTargets(other.id)
    expect(otherTargets.list.some(t=>t.targetId===target.id)).toBe(false)
    const metadata=await readHuiteacherTargetTimeline({
      actorUserId:admin.id,organizationId:org.id,targetId:target.id,
    })
    expect(metadata.target.id).toBe(target.id)
    expect(metadata.list.some(item=>item.eventId===event.id)).toBe(true)
    expect(metadata.list.every(item=>!item.scoresReleased&&!item.compared)).toBe(true)
    expect(JSON.stringify(metadata)).not.toContain(privateGoal)
    const encrypted=await db.huiteacherImprovementAction.findUniqueOrThrow({
      where:{id:privateAction.id},
    })
    expect(encrypted.goalCipher).not.toContain(privateGoal)
    expect(encrypted.goalHash).toMatch(/^[a-f0-9]{64}$/)

    const start=await transitionHuiteacherImprovement({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
      actionId:privateAction.id,expectedAudience:'PRIVATE_PERSONAL',
      expectedVersion:1,action:'START',
    })
    expect(start.status).toBe('IN_PROGRESS')
    await expect(transitionHuiteacherImprovement({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
      actionId:privateAction.id,expectedAudience:'PRIVATE_PERSONAL',
      expectedVersion:1,action:'START',
    })).rejects.toThrow()
    await expect(transitionHuiteacherImprovement({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
      actionId:privateAction.id,expectedAudience:'PRIVATE_PERSONAL',
      expectedVersion:2,action:'COMPLETE',evidence:'太短',
    })).rejects.toThrow()
    const final=await transitionHuiteacherImprovement({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
      actionId:privateAction.id,expectedAudience:'PRIVATE_PERSONAL',
      expectedVersion:2,action:'COMPLETE',
      evidence:'经过四次课堂实践，我记录了追问和同伴反馈的具体变化。',
    })
    expect(final.version).toBe(3)
    await expect(transitionHuiteacherImprovement({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
      actionId:privateAction.id,expectedAudience:'PRIVATE_PERSONAL',
      expectedVersion:3,action:'CANCEL',
    })).rejects.toThrow()
    const adminAfter=await listHuiteacherImprovements({
      actorUserId:admin.id,organizationId:org.id,targetId:target.id,
    })
    expect(JSON.stringify(adminAfter)).not.toContain('经过四次课堂实践')
    // Actual database trigger, not mocked authorization:
    await expect(db.huiteacherImprovementAction.update({
      where:{id:privateAction.id},data:{audience:'SCHOOL_SHARED'},
    })).rejects.toThrow()
    await expect(db.huiteacherImprovementAction.delete({
      where:{id:privateAction.id},
    })).rejects.toThrow()
    const audits=await db.organizationGovernanceAudit.count({where:{
      organizationId:org.id,targetType:'IMPROVEMENT_ACTION',
      targetId:privateAction.id,
    }})
    expect(audits).toBe(3) // create -> start -> complete
    // Revoking Teacher-only access removes BOTH school-shared and own reads.
    await db.educationProductEntitlement.update({
      where:{organizationId_product:{organizationId:org.id,product:'HUITEACHER'}},
      data:{status:'SUSPENDED'},
    })
    await expect(listHuiteacherImprovements({
      actorUserId:teacher.id,organizationId:org.id,targetId:target.id,
    })).rejects.toThrow()
  })
})
