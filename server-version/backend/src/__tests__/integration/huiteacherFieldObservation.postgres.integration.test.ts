import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe,it,expect,beforeAll,afterAll } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from './integration-env'
import {
  createHuiteacherTarget,createHuiteacherEvent,transitionHuiteacherEvent,
} from '../../modules/huiteacher/evaluation.service'
import {
  inviteHuiteacherObserver,acceptHuiteacherObserver,
  revokeHuiteacherObserver,myHuiteacherFieldAssignments,
  listHuiteacherObserverGrants,createHuiteacherObservation,
  readOwnHuiteacherObservations,readFormalHuiteacherObservations,
  updateHuiteacherObservation,submitHuiteacherObservation,
} from '../../modules/huiteacher/observer.service'
import * as tools from '../../modules/education-tools/private-tool.service'
import {startInvitedFieldComposition} from '../../modules/huiteacher/fieldComposition.service'
import {getAttemptState} from '../../modules/composite/composite.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {bindHuiteacherFieldForm,readInvitedHuiteacherFieldForm,
  readSubmittedHuiteacherFieldFormEvidence}
  from '../../modules/huiteacher/fieldForm.service'

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
  // R executes this on a migrated disposable PG; no qualification is claimed by collection alone.
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
    await expect(transitionHuiteacherEvent({
      organizationId:school.id,eventId:event.id,actorUserId:manager.id,
      action:'OPEN',expectedVersion:1,
    })).rejects.toThrow()
    const context={entry:'TEACHER' as const,organizationId:school.id,principal:{userId:manager.id,accountDomain:'SCHOOL' as const}}
    const fixed=async(kind:'FORM'|'COMPOSITION',title:string,definition:unknown)=>{
      const draft=await tools.createPrivateTool(context,{kind,title})
      const saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title,definition})
      return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
    }
    const formVersion=await fixed('FORM','课堂观察指标',{schemaVersion:2,pages:[{pageKey:'p1',title:'课堂观察',questions:[
      {itemKey:'q1',type:'LIKERT',prompt:'课堂讨论证据',required:true,options:[{optionKey:'low',label:'不足'},{optionKey:'high',label:'充分'}],rows:[]},
    ]}]})
    const version=await fixed('COMPOSITION','团队专家观察',{schemaVersion:2,adapterVersion:'2.0.0',administration:{population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind:'TEAM'},instruction:'观察真实团队',
      blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:formVersion.id,contentHash:formVersion.contentHash}}]})
    const binding={actorUserId:manager.id,organizationId:school.id,eventId:event.id,privateComposition:{versionId:version.id,contentHash:version.contentHash}}
    await expect(bindHuiteacherFieldForm({...binding,privateComposition:undefined,formId:formVersion.id})).rejects.toMatchObject({code:'HUITEACHER_FIELD_FIXED_QUESTIONNAIRE_REQUIRED'})
    await bindHuiteacherFieldForm(binding)
    await expect(bindHuiteacherFieldForm(binding)).rejects.toThrow()
    const completeForm=async(invitationId:string,actorUserId:string)=>{
      const start=await startInvitedFieldComposition({invitationId,actorUserId})
      expect((await startInvitedFieldComposition({invitationId,actorUserId})).attemptId).toBe(start.attemptId)
      const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:start.attemptId}})
      expect(parent).toMatchObject({subjectUserId:null,respondentUserId:actorUserId,userId:actorUserId,assignmentRef:null,episodeId:null,consentId:null,respondentType:'OBSERVER'})
      const state=await getAttemptState(start.attemptId,{userId:actorUserId},undefined,'current-unit'),item=state.currentItem as any
      const payload={attemptId:start.attemptId,sectionId:item.formSectionId,userId:actorUserId,submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.contextSnapshotHash,
        answers:item.answers.map((question:any)=>({formItemId:question.formItemId,value:'high'}))}
      await submitCompositeFormSectionFinal(payload)
      expect((await getAttemptState(start.attemptId,{userId:actorUserId})).status).toBe('COMPLETED')
      return start.attemptId
    }
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
    const opened=await transitionHuiteacherEvent({
      organizationId:school.id,eventId:event.id,actorUserId:manager.id,
      action:'OPEN',expectedVersion:1,
    })
    expect(opened.status).toBe('OPEN')
    const fieldForm=await readInvitedHuiteacherFieldForm({
      invitationId:invitation.id,actorUserId:expert.id,
    })
    expect(fieldForm?.assessmentRef.origin.versionId).toBe(version.id)
    expect(fieldForm?.assessmentRef.origin.targetKind).toBe('TEAM')
    await expect(readInvitedHuiteacherFieldForm({
      invitationId:invitation.id,actorUserId:stranger.id,
    })).rejects.toThrow()
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
    await expect(submitHuiteacherObservation({
      id:raw.id,actorUserId:expert.id,expectedRevision:2,
    })).rejects.toThrow()
    await expect(submitHuiteacherObservation({
      id:raw.id,actorUserId:expert.id,expectedRevision:2,
      fieldFormId:formVersion.id,answers:{q1:'unknown'},
    })).rejects.toThrow()
    const staleDraft=await createHuiteacherObservation({
      organizationId:school.id,eventId:event.id,actorUserId:expert.id,
      kind:'FORMAL_FEEDBACK',content:'另一标签页预先保存的草稿',
    })
    const attemptId=await completeForm(invitation.id,expert.id)
    const submitted=await submitHuiteacherObservation({
      id:raw.id,actorUserId:expert.id,expectedRevision:2,
      assessmentAttemptId:attemptId,
    })
    await expect(createHuiteacherObservation({
      organizationId:school.id,eventId:event.id,actorUserId:expert.id,
      kind:'FORMAL_FEEDBACK',content:'再次新建正式反馈',
    })).rejects.toMatchObject({code:'HUITEACHER_FORMAL_FEEDBACK_ALREADY_SUBMITTED',statusCode:409})
    await expect(submitHuiteacherObservation({
      id:staleDraft.id,actorUserId:expert.id,expectedRevision:1,
      assessmentAttemptId:attemptId,
    })).rejects.toMatchObject({code:'HUITEACHER_FORMAL_FEEDBACK_ALREADY_SUBMITTED',statusCode:409})
    const structured=await db.huiteacherFieldFormEvidence.findUniqueOrThrow({
      where:{recordId:raw.id},
    })
    expect(structured.attemptId).toBe(attemptId)
    expect(structured.formId).toBeNull();expect(structured.definitionDigest).toBeNull();expect(structured.finalHash).toMatch(/^[a-f0-9]{64}$/)
    expect(structured.answersCipher).not.toContain('high')
    await expect(db.huiteacherFieldFormEvidence.delete({
      where:{recordId:raw.id},
    })).rejects.toThrow()
    expect(submitted.status).toBe('SUBMITTED')
    const evidence=await readSubmittedHuiteacherFieldFormEvidence({
      organizationId:school.id,eventId:event.id,recordId:raw.id,
      actorUserId:manager.id,
    })
    expect(evidence.assessmentRef.origin.versionId).toBe(version.id)
    expect(evidence.units).toMatchObject([{kind:'FORM',items:[{state:'ANSWERED',value:'high'}]}])
    expect(JSON.stringify(evidence)).not.toContain('独立反思')
    expect(JSON.stringify(evidence)).not.toContain(expert.id)
    await expect(readSubmittedHuiteacherFieldFormEvidence({
      organizationId:school.id,eventId:event.id,recordId:raw.id,
      actorUserId:expert.id,
    })).rejects.toThrow()
    await expect(readSubmittedHuiteacherFieldFormEvidence({
      organizationId:school.id,eventId:event.id,recordId:privateNote.id,
      actorUserId:manager.id,
    })).rejects.toThrow()
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
    // A different evaluator owns a different slot. Two pre-existing drafts
    // for that evaluator race through real PostgreSQL transactions.
    const concurrentExpert=await makeUser()
    const concurrentInvite=await inviteHuiteacherObserver({
      organizationId:school.id,eventId:event.id,actorUserId:manager.id,
      observerUserId:concurrentExpert.id,role:'EXPERT',expiresAt:new Date(Date.now()+3600_000),
    })
    await acceptHuiteacherObserver({userId:concurrentExpert.id,invitationId:concurrentInvite.id})
    const racing=[]
    for(const content of ['并发草稿 A','并发草稿 B'])racing.push(await createHuiteacherObservation({
      organizationId:school.id,eventId:event.id,actorUserId:concurrentExpert.id,
      kind:'FORMAL_FEEDBACK',content,
    }))
    const racingAttempt=await completeForm(concurrentInvite.id,concurrentExpert.id)
    const outcomes=await Promise.allSettled(racing.map(row=>submitHuiteacherObservation({
      id:row.id,actorUserId:concurrentExpert.id,expectedRevision:1,
      assessmentAttemptId:racingAttempt,
    })))
    expect(outcomes.filter(row=>row.status==='fulfilled')).toHaveLength(1)
    expect(outcomes.filter(row=>row.status==='rejected').map(row=>(row as PromiseRejectedResult).reason.code))
      .toEqual(['HUITEACHER_FORMAL_FEEDBACK_ALREADY_SUBMITTED'])
    expect(await db.huiteacherObservationRecord.count({where:{
      organizationId:school.id,eventId:event.id,observerUserId:concurrentExpert.id,
      kind:'FORMAL_FEEDBACK',status:'SUBMITTED',
    }})).toBe(1)
    expect(await db.huiteacherFieldFormEvidence.count({where:{recordId:{in:racing.map(row=>row.id)}}})).toBe(1)
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
