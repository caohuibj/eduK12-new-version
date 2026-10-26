import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {describe,it,expect,beforeAll,afterAll} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {
  createHuiteacherTarget,createHuiteacherEvent,transitionHuiteacherEvent,
} from '../../modules/huiteacher/evaluation.service'
import {
  inviteHuiteacherObserver,acceptHuiteacherObserver,createHuiteacherObservation,
  submitHuiteacherObservation,revokeHuiteacherObserver,
} from '../../modules/huiteacher/observer.service'
import {
  createHuiteacherFieldConsensus,updateHuiteacherFieldConsensus,
  approveHuiteacherFieldConsensus,submitHuiteacherFieldConsensus,
  readHuiteacherFieldConsensus,myHuiteacherConsensusReviews,
} from '../../modules/huiteacher/consensus.service'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const originalKey=process.env.DATA_ENCRYPTION_KEY
const actor=async()=>db.user.create({data:{
  id:randomUUID(),username:'teacher_consensus_'+randomUUID().replace(/-/g,''),
  accountDomain:'SCHOOL',passwordHash:'synthetic-only',
  role:'TEACHER',teacherApproved:true,
}})
suite('Huiteacher PR4 human consensus — distinct experts, matching signature, immutable evidence',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(URL!)
    process.env.DATA_ENCRYPTION_KEY||='56'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{
    await db?.$disconnect()
    if(originalKey===undefined)delete process.env.DATA_ENCRYPTION_KEY
  })
  it('never averages raters or releases unsigned / stale / foreign / private consensus',async()=>{
    const manager=await actor(),a=await actor(),b=await actor(),stranger=await actor()
    const org=await db.organization.create({data:{
      id:randomUUID(),name:'hui-consensus-'+randomUUID(),
      productDomain:'SCHOOL',createdByUserId:manager.id,
    }})
    const member=await db.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,
      userId:manager.id,orgRole:'ORG_ADMIN',
    }})
    await db.educationProductEntitlement.create({data:{
      organizationId:org.id,product:'HUITEACHER',
      status:'ACTIVE',grantedByUserId:manager.id,
    }})
    await db.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:org.id,
      membershipId:member.id,product:'HUITEACHER',
      role:'PRODUCT_ADMIN',grantedByUserId:manager.id,
    }})
    const target=await createHuiteacherTarget({
      organizationId:org.id,actorUserId:manager.id,
      kind:'TEAM',name:'学校管理团队',
    })
    const event=await createHuiteacherEvent({
      organizationId:org.id,actorUserId:manager.id,
      targetId:target.id,kind:'MEETING',title:'专家观察学校会议',
    })
    await expect(transitionHuiteacherEvent({
      organizationId:org.id,actorUserId:manager.id,eventId:event.id,
      action:'OPEN',expectedVersion:1,
    })).rejects.toThrow()
    const invited=[]
    for(const observer of [a,b]){
      const i=await inviteHuiteacherObserver({
        organizationId:org.id,eventId:event.id,actorUserId:manager.id,
        observerUserId:observer.id,role:'EXPERT',
        expiresAt:new Date(Date.now()+86400000),
      })
      invited.push(i)
      await acceptHuiteacherObserver({userId:observer.id,invitationId:i.id})
    }
    await transitionHuiteacherEvent({
      organizationId:org.id,actorUserId:manager.id,eventId:event.id,
      action:'OPEN',expectedVersion:1,
    })
    const raw=[]
    for(const observer of [a,b]){
      const note=await createHuiteacherObservation({
        organizationId:org.id,eventId:event.id,actorUserId:observer.id,
        kind:'FORMAL_FEEDBACK',content:'独立评价者建议：完善会前共享资料。'+observer.id,
      })
      await submitHuiteacherObservation({
        id:note.id,actorUserId:observer.id,expectedRevision:note.revision,
      })
      raw.push(note)
    }
    const privateNote=await createHuiteacherObservation({
      organizationId:org.id,eventId:event.id,actorUserId:a.id,
      kind:'PRIVATE_REFLECTION',content:'不会进入共识的私人反思',
    })
    await submitHuiteacherObservation({
      id:privateNote.id,actorUserId:a.id,expectedRevision:privateNote.revision,
    })
    await transitionHuiteacherEvent({
      organizationId:org.id,actorUserId:manager.id,eventId:event.id,
      action:'CLOSE',expectedVersion:2,
    })
    await expect(createHuiteacherFieldConsensus({
      organizationId:org.id,eventId:event.id,actorUserId:manager.id,
      title:'不合法私人来源',content:'不应通过',sourceRecordIds:[raw[0].id,privateNote.id],
    })).rejects.toThrow()
    const draft=await createHuiteacherFieldConsensus({
      organizationId:org.id,eventId:event.id,actorUserId:manager.id,
      title:'会议观察人工共识',
      content:'综合讨论：记录差异、事实依据和下一步改进，不对评价者得分求均值。',
      sourceRecordIds:raw.map(x=>x.id),
    })
    expect(draft.independentEvaluatorCount).toBe(2)
    expect(draft.approvalCount).toBe(0)
    await expect(submitHuiteacherFieldConsensus({
      actorUserId:manager.id,consensusId:draft.id,
      expectedRevision:draft.revision,
    })).rejects.toThrow()
    const reviewed=await myHuiteacherConsensusReviews(a.id)
    expect(reviewed.list.some(x=>x.id===draft.id)).toBe(true)
    await expect(approveHuiteacherFieldConsensus({
      actorUserId:stranger.id,consensusId:draft.id,
      expectedRevision:draft.revision,expectedDigest:draft.digest,
    })).rejects.toThrow()
    const parallel=await Promise.all([0,1].map(()=>approveHuiteacherFieldConsensus({
      actorUserId:a.id,consensusId:draft.id,expectedRevision:draft.revision,
      expectedDigest:draft.digest,
    })))
    expect(parallel.every(receipt=>receipt.approved)).toBe(true)
    expect(parallel.map(receipt=>receipt.replayed).sort()).toEqual([false,true])
    expect(await db.huiteacherFieldConsensusApproval.count({where:{consensusId:draft.id,observerUserId:a.id,revision:draft.revision}})).toBe(1)
    expect((await myHuiteacherConsensusReviews(a.id)).list.find(row=>row.id===draft.id)?.approvedByMe).toBe(true)
    expect((await approveHuiteacherFieldConsensus({
      actorUserId:a.id,consensusId:draft.id,expectedRevision:draft.revision,
      expectedDigest:draft.digest,
    })).replayed).toBe(true)
    const revised=await updateHuiteacherFieldConsensus({
      actorUserId:manager.id,consensusId:draft.id,expectedRevision:draft.revision,
      title:'会议观察人工共识',
      content:'二次审议后补充：记录具体分歧，保留专家原始评价。',
    })
    expect(revised.approvalCount).toBe(0)
    await expect(approveHuiteacherFieldConsensus({
      actorUserId:b.id,consensusId:draft.id,
      expectedRevision:draft.revision,expectedDigest:draft.digest,
    })).rejects.toThrow()
    for(const observer of [a,b]){
      await approveHuiteacherFieldConsensus({
        actorUserId:observer.id,consensusId:draft.id,
        expectedRevision:revised.revision,expectedDigest:revised.digest,
      })
    }
    const official=await submitHuiteacherFieldConsensus({
      actorUserId:manager.id,consensusId:draft.id,
      expectedRevision:revised.revision,
    })
    expect(official.status).toBe('SUBMITTED')
    const read=await readHuiteacherFieldConsensus({
      actorUserId:manager.id,consensusId:draft.id,
    })
    expect(read.approvalCount).toBe(2)
    expect(read.content).toContain('二次审议')
    expect(read.content).not.toContain('私人反思')
    expect(read.sourceRecordIds).toEqual(expect.arrayContaining(raw.map(x=>x.id)))
    await expect(db.huiteacherFieldConsensus.update({
      where:{id:draft.id},data:{title:'tampered',revision:{increment:1}},
    })).rejects.toThrow()
    await expect(db.huiteacherFieldConsensusSource.delete({
      where:{consensusId_recordId:{consensusId:draft.id,recordId:raw[0].id}},
    })).rejects.toThrow()
    await expect(approveHuiteacherFieldConsensus({
      actorUserId:b.id,consensusId:draft.id,
      expectedRevision:revised.revision,expectedDigest:revised.digest,
    })).rejects.toThrow()
    // Current grant revocation never erases immutable historic signoffs.
    await revokeHuiteacherObserver({
      organizationId:org.id,eventId:event.id,actorUserId:manager.id,
      observerUserId:a.id,
    })
    expect((await readHuiteacherFieldConsensus({
      actorUserId:manager.id,consensusId:draft.id,
    })).status).toBe('SUBMITTED')
  })
})
