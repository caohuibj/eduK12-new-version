import { createParentToolPolicyService } from '../../modules/parent-portal/tool-policy'
import { randomUUID } from 'node:crypto'
import { afterAll,beforeAll,describe,it,expect } from 'vitest'
import { PrismaClient,UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createParentPortalService } from '../../modules/parent-portal/service'
import { LINK_CONSENT_VERSION,REPORT_CONSENT_VERSION,type ParentProjection,type ParentReportSource } from '../../modules/parent-portal/contracts'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
const url=integrationDatabaseUrl('PARENT_PORTAL_TEST_DB_URL','RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
if(url){
 const parsed=new URL(url)
 const releaseFixture=process.env.RELEASE_VERIFY_LOCAL==='true'&&['localhost','127.0.0.1'].includes(parsed.hostname)&&parsed.pathname==='/eduk12_release'
 const hostedFixture=process.env.CI==='true'&&['localhost','127.0.0.1'].includes(parsed.hostname)&&parsed.pathname==='/ptool'
 if(!/test|ci/i.test(parsed.pathname)&&!hostedFixture&&!releaseFixture)throw new Error('Parent integration requires a named test database or the hosted CI loopback fixture')
}
const suite=url?describe:describe.skip
let db:PrismaClient
const suffix=randomUUID()
async function actor(role:UserRole){const user=await db.user.create({data:{username:'parent-test-'+role+'-'+randomUUID(),passwordHash:'test-only',role}});return {userId:user.id,role,platformRole:'STANDARD' as const}}
async function fixture(){
 const child=await actor(UserRole.STUDENT),parent=await actor(UserRole.PARENT),otherParent=await actor(UserRole.PARENT),officer=await actor(UserRole.TEACHER),admin=await actor(UserRole.ADMIN)
 const org=await db.organization.create({data:{id:randomUUID(),name:'Parent Portal Synthetic '+suffix,createdByUserId:admin.userId}})
 const childMembership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:child.userId}})
 const officerMembership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:officer.userId}})
 await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:admin.userId,orgRole:'ORG_ADMIN'}})
 await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:officerMembership.id,capability:'PARENT_REPORT_DISCLOSURE',grantedByUserId:admin.userId}})
 const course=await db.course.create({data:{title:'Synthetic course',creatorId:officer.userId,courseCode:randomUUID().slice(0,12)}})
 await db.courseStudent.create({data:{courseId:course.id,studentId:child.userId,status:'ACTIVE'}})
 const service=createParentPortalService(db,async()=>{throw new Error('source unavailable')})
 const invite=await service.invitations(child,course.id)
 const link=await service.claim(parent,invite.inviteCode)
 return {child,parent,otherParent,officer,admin,org,childMembership,officerMembership,course,invite,link,service}
}
async function reportFixture(longitudinal=false){
 const f=await fixture();await f.service.approve(f.child,f.link.id,LINK_CONSENT_VERSION)
 await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.org.id,membershipId:f.officerMembership.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:f.admin.userId}})
 const artifactId=randomUUID(),specId=randomUUID(),seriesId=randomUUID()
 const policy={key:'synthetic-parent-policy',version:'1',audience:'PARENT' as const,mode:'EDUCATIONAL_SUMMARY' as const,rawAnswers:false as const,itemLevel:false as const,researchExport:false as const}
 const toolRef={family:'SCALE' as const,key:'synthetic-'+randomUUID(),version:'1'}
 const root=await actor(UserRole.ADMIN);await db.user.update({where:{id:root.userId},data:{platformRole:'SYSTEM_ADMIN'}})
 const ceiling=createParentToolPolicyService(db);await ceiling.update(root.userId,toolRef,{policy:{mode:'INDIVIDUAL_SUMMARY',metricKeys:['educational'],longitudinalMetricKeys:longitudinal?['educational']:[]},expectedVersion:0,commandKey:randomUUID()})
 const projection:ParentProjection={schemaVersion:1,toolRef,disclosedMetricKeys:['educational'],disclosedLongitudinalMetricKeys:longitudinal?['educational']:[],audience:'PARENT',artifactId,subjectUserId:f.child.userId,title:'Synthetic approved parent summary',publicationStatus:'PUBLISHED',policy,policyHash:canonicalHash(policy),summary:'服务端已批准的家长说明',blocks:[]}
 const payload={artifactId,organizationId:f.org.id,subjectUserId:f.child.userId,parentAudience:projection,PRIVATE_STAFF_DATA:'MUST_NEVER_LEAK'}
 const sourceHash=canonicalHash(payload);const identity=canonicalHash({artifactId});const scope={schemaVersion:1,resourceFamily:'SCALE',resourceKey:'synthetic'}
 await db.$executeRaw`INSERT INTO reporting_analysis_specs (id,spec_key,version,definition,spec_hash,created_by_user_id) VALUES (${specId},${specId},1,'{}'::jsonb,${identity},${f.officer.userId})`
 await db.$executeRaw`INSERT INTO reporting_series (id,organization_id,series_key,scope,series_identity_hash,snapshot_hash,created_by_user_id) VALUES (${seriesId},${f.org.id},${seriesId},${JSON.stringify(scope)}::jsonb,${identity},${identity},${f.officer.userId})`
 await db.$executeRaw`INSERT INTO reporting_analysis_artifacts (id,organization_id,analysis_kind,policy_domain,subject_user_id,cohort_snapshot_id,series_id,spec_id,analysis_identity_hash,artifact_payload,snapshot_hash,generated_by_user_id) VALUES (${artifactId},${f.org.id},'INDIVIDUAL_LONGITUDINAL','ORG_INDIVIDUAL_REPORT_V1',${f.child.userId},NULL,${seriesId},${specId},${identity},${JSON.stringify(payload)}::jsonb,${sourceHash},${f.officer.userId})`
 // This suite exercises DB authority with synthetic preverified reader input.
 // Real artifact-reader and canonical package compatibility are separate release gates.
 const source:ParentReportSource={artifactId,organizationId:f.org.id,subjectUserId:f.child.userId,policyDomain:'ORG_INDIVIDUAL_REPORT_V1',sourceHash,projection}
 const service=createParentPortalService(db,async id=>{if(id!==artifactId)throw new Error('source missing');return source})
 return {...f,service,artifactId,sourceHash,projection,toolRef,root,ceiling}
}
suite('Parent portal authority and evidence (real PostgreSQL, synthetic sources)',()=>{
 beforeAll(async()=>{db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 it('student must confirm before parent can discover child; stranger cannot approve or view',async()=>{
  const f=await fixture();expect((await f.service.children(f.parent,1,20)).list).toEqual([])
  await expect(f.service.approve(f.admin,f.link.id,LINK_CONSENT_VERSION)).rejects.toMatchObject({status:404})
  await expect(f.service.overview(f.otherParent,f.child.userId)).rejects.toMatchObject({status:404})
  await f.service.approve(f.child,f.link.id,LINK_CONSENT_VERSION)
  expect((await f.service.children(f.parent,1,20)).list.map(row=>row.childId)).toEqual([f.child.userId])
  expect((await f.service.overview(f.parent,f.child.userId)).courses).toEqual([{id:f.course.id,title:'Synthetic course'}])
  expect(JSON.stringify(await f.service.children(f.parent,1,20))).not.toMatch(/passwordHash|phone|parentUserId/)
 })
 it('one-time invite is idempotent only for consuming parent; another parent cannot replay',async()=>{
  const f=await fixture();expect((await f.service.claim(f.parent,f.invite.inviteCode)).id).toBe(f.link.id)
  await expect(f.service.claim(f.otherParent,f.invite.inviteCode)).rejects.toThrow()
  expect(await db.parentStudentRelationship.count({where:{studentUserId:f.child.userId}})).toBe(1)
 })
 it('concurrent claim has one winner and one persisted relationship',async()=>{
  const f=await fixture();const secondChild=await actor(UserRole.STUDENT)
  await db.courseStudent.create({data:{courseId:f.course.id,studentId:secondChild.userId,status:'ACTIVE'}})
  const invite=await f.service.invitations(secondChild,f.course.id)
  const result=await Promise.allSettled([f.service.claim(f.parent,invite.inviteCode),f.service.claim(f.otherParent,invite.inviteCode)])
  expect(result.filter(row=>row.status==='fulfilled')).toHaveLength(1)
  expect(await db.parentStudentRelationship.count({where:{studentUserId:secondChild.userId}})).toBe(1)
 })
 it('expired invite and removed course membership fail closed',async()=>{
  const f=await fixture();const invite=await f.service.invitations(f.child,f.course.id)
  await db.parentInviteCode.updateMany({where:{studentUserId:f.child.userId,status:'ACTIVE'},data:{expiresAt:new Date(Date.now()-1000)}})
  await expect(f.service.claim(f.otherParent,invite.inviteCode)).rejects.toThrow()
  await db.courseStudent.deleteMany({where:{studentId:f.child.userId,courseId:f.course.id}})
  await expect(f.service.invitations(f.child,f.course.id)).rejects.toMatchObject({status:404})
 })
 it('association does not disclose report; consent and independent officer grant are both required',async()=>{
  const f=await reportFixture();expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toEqual([])
  const preview=await f.service.reportConsentPreview(f.child,f.link.id,f.artifactId)
  expect(preview).toMatchObject({canConsent:true,artifactId:f.artifactId,projection:f.projection,consentVersion:REPORT_CONSENT_VERSION})
  await expect(f.service.reportConsentPreview(f.parent,f.link.id,f.artifactId)).rejects.toMatchObject({status:404})
  const consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,preview.commandKey,preview.consentVersion)
  await expect(f.service.grantReport(f.admin,f.link.id,f.artifactId,consent.consentId,'grant-'+randomUUID())).rejects.toMatchObject({status:404})
  await db.user.update({where:{id:f.officer.userId},data:{isFrozen:true}})
  await expect(f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,'grant-'+randomUUID())).rejects.toMatchObject({status:404})
  await db.user.update({where:{id:f.officer.userId},data:{isFrozen:false}})
  const grant=await f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,'grant-'+randomUUID())
  expect(grant.grantId).toBeTruthy();expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toHaveLength(1)
  const report=await f.service.readReport(f.parent,f.child.userId,f.artifactId)
  expect(report.summary).toBe(f.projection.summary);expect(report.audience).toBe('PARENT')
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE_STAFF_DATA|MUST_NEVER_LEAK|sourceHash|rawAnswers|researchExport/)
  await expect(f.service.readReport(f.otherParent,f.child.userId,f.artifactId)).rejects.toMatchObject({status:404})
  await expect(f.service.readReport(f.parent,randomUUID(),f.artifactId)).rejects.toMatchObject({status:404})
 })
 it('only current SYSTEM_ADMIN may change per-tool ceilings; retries audit once and stale versions conflict',async()=>{
  const f=await reportFixture();await expect(f.ceiling.read(f.admin.userId,f.toolRef)).rejects.toMatchObject({status:403})
  const body={policy:{mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]},expectedVersion:1,commandKey:randomUUID()}
  expect((await f.ceiling.update(f.root.userId,f.toolRef,body)).version).toBe(2)
  expect((await f.ceiling.update(f.root.userId,f.toolRef,body)).version).toBe(2)
  await expect(f.ceiling.update(f.root.userId,f.toolRef,{...body,commandKey:randomUUID()})).rejects.toMatchObject({status:409})
  const audit=await db.$queryRaw<Array<{count:number}>>`SELECT COUNT(*)::int AS count FROM parent_tool_disclosure_policy_events WHERE actor_user_id=${f.root.userId}`;expect(audit[0].count).toBe(2)
  await db.user.update({where:{id:f.root.userId},data:{platformRole:'STANDARD'}});await expect(f.ceiling.read(f.root.userId,f.toolRef)).rejects.toMatchObject({status:403})
 })
 it('tightening the exact tool immediately hides old grants; widening preserves the consented frozen projection',async()=>{
  const f=await reportFixture(),consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,randomUUID(),REPORT_CONSENT_VERSION)
  await f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())
  await f.ceiling.update(f.root.userId,f.toolRef,{policy:{mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]},expectedVersion:1,commandKey:randomUUID()})
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toEqual([])
  await expect(f.service.readReport(f.parent,f.child.userId,f.artifactId)).rejects.toMatchObject({status:404})
  await expect(f.service.reportConsentPreview(f.child,f.link.id,f.artifactId)).rejects.toMatchObject({status:404})
  await f.ceiling.update(f.root.userId,f.toolRef,{policy:{mode:'INDIVIDUAL_SUMMARY',metricKeys:['educational','extra'],longitudinalMetricKeys:[]},expectedVersion:2,commandKey:randomUUID()})
  expect((await f.service.readReport(f.parent,f.child.userId,f.artifactId)).summary).toBe(f.projection.summary)
  const persisted=await db.$queryRaw<Array<{projection:unknown}>>`SELECT projection_payload AS projection FROM parent_report_disclosure_grants WHERE source_artifact_id=${f.artifactId}`;expect(persisted[0].projection).toEqual(f.projection)
  await f.ceiling.update(f.root.userId,f.toolRef,{policy:{mode:'INDIVIDUAL_SUMMARY',metricKeys:['extra'],longitudinalMetricKeys:[]},expectedVersion:3,commandKey:randomUUID()})
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toEqual([])
 })
 it('longitudinal indicators require their own tool ceiling on consent, grant and later reads',async()=>{
  const f=await reportFixture(true),consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,randomUUID(),REPORT_CONSENT_VERSION)
  await f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toHaveLength(1)
  await f.ceiling.update(f.root.userId,f.toolRef,{policy:{mode:'INDIVIDUAL_SUMMARY',metricKeys:['educational'],longitudinalMetricKeys:[]},expectedVersion:1,commandKey:randomUUID()})
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toEqual([])
  await expect(f.service.reportConsentPreview(f.child,f.link.id,f.artifactId)).rejects.toMatchObject({status:404})
  await expect(f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())).rejects.toMatchObject({status:404})
  await expect(f.service.readReport(f.parent,f.child.userId,f.artifactId)).rejects.toMatchObject({status:404})
 })
 it('multiple valid disclosure grants present one report per frozen artifact',async()=>{
  const f=await reportFixture();const c=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,'consent-'+randomUUID(),REPORT_CONSENT_VERSION)
  await f.service.grantReport(f.officer,f.link.id,f.artifactId,c.consentId,'grant-'+randomUUID());await f.service.grantReport(f.officer,f.link.id,f.artifactId,c.consentId,'grant-'+randomUUID())
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toHaveLength(1)
 })
 it('same command cannot be reused for another artifact, and revoked grants cannot reactivate',async()=>{
  const f=await reportFixture();const command='consent-'+randomUUID();const first=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,command,REPORT_CONSENT_VERSION)
  expect((await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,command,REPORT_CONSENT_VERSION)).consentId).toBe(first.consentId)
  const grantKey='grant-'+randomUUID();const grant=await f.service.grantReport(f.officer,f.link.id,f.artifactId,first.consentId,grantKey)
  expect((await f.service.grantReport(f.officer,f.link.id,f.artifactId,first.consentId,grantKey)).grantId).toBe(grant.grantId)
  await f.service.revokeReport(f.child,f.link.id,f.artifactId,'subject withdrew')
  await expect(f.service.grantReport(f.officer,f.link.id,f.artifactId,first.consentId,grantKey)).rejects.toMatchObject({status:404})
  await expect(db.$executeRaw`UPDATE parent_report_disclosure_grants SET revoked_at=NULL WHERE id=${grant.grantId}`).rejects.toThrow()
 })
 it('unlink stops children and all new report access while preserving evidence and frozen source',async()=>{
  const f=await reportFixture();const consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,'consent-'+randomUUID(),REPORT_CONSENT_VERSION);await f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,'grant-'+randomUUID())
  await f.service.revoke(f.parent,f.link.id,'unlink')
  expect((await f.service.children(f.parent,1,20)).list).toEqual([]);expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toEqual([])
  await expect(f.service.readReport(f.parent,f.child.userId,f.artifactId)).rejects.toMatchObject({status:404})
  expect(await db.parentStudentRelationship.findUnique({where:{id:f.link.id}})).toMatchObject({status:'REVOKED'})
  const raw=await db.$queryRaw<Array<{hash:string}>>`SELECT snapshot_hash AS hash FROM reporting_analysis_artifacts WHERE id=${f.artifactId}`;expect(raw[0].hash).toBe(f.sourceHash)
  const audit=await db.$queryRaw<Array<{count:number}>>`SELECT COUNT(*)::int AS count FROM parent_portal_audit WHERE relationship_id=${f.link.id}`;expect(audit[0].count).toBeGreaterThanOrEqual(4)
 })
 it.each(['deny','member-deny','policy-deny','membership-ended','organization-suspended','child-frozen','parent-frozen','parent-role-changed','child-role-changed'])('current %s invalidates an already granted parent report',async condition=>{
  const f=await reportFixture();const consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,'consent-'+randomUUID(),REPORT_CONSENT_VERSION);await f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,'grant-'+randomUUID())
  if(condition==='deny')await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.org.id,userId:f.parent.userId,permission:'PARENT_REPORT_READ',reason:'test',deniedByUserId:f.admin.userId}})
  if(condition==='member-deny'||condition==='policy-deny')await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.org.id,userId:f.parent.userId,permission:condition==='member-deny'?'REPORT_MEMBER_READ':'ORG_INDIVIDUAL_REPORT_V1',reason:'test',deniedByUserId:f.admin.userId}})
  if(condition==='membership-ended')await db.organizationMembership.update({where:{id:f.childMembership.id},data:{validUntil:new Date()}})
  if(condition==='organization-suspended')await db.organization.update({where:{id:f.org.id},data:{status:'SUSPENDED'}})
  if(condition==='child-frozen')await db.user.update({where:{id:f.child.userId},data:{isFrozen:true}})
  if(condition==='parent-role-changed')await db.user.update({where:{id:f.parent.userId},data:{role:'TEACHER'}})
  if(condition==='child-role-changed')await db.user.update({where:{id:f.child.userId},data:{role:'TEACHER'}})
  if(condition==='parent-frozen')await db.user.update({where:{id:f.parent.userId},data:{isFrozen:true}})
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toEqual([]);await expect(f.service.readReport(f.parent,f.child.userId,f.artifactId)).rejects.toMatchObject({status:404})
 })
 it('a report read blocked behind a committed unlink never returns its old snapshot',async()=>{
  const f=await reportFixture();const c=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,'consent-'+randomUUID(),REPORT_CONSENT_VERSION);await f.service.grantReport(f.officer,f.link.id,f.artifactId,c.consentId,'grant-'+randomUUID())
  let pending:Promise<{value?:unknown;error?:any}>|undefined
  await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM parent_student_relationships WHERE id=${f.link.id} FOR UPDATE`
   pending=f.service.readReport(f.parent,f.child.userId,f.artifactId).then(value=>({value}),error=>({error}))
   let blocked=false
   for(let n=0;n<30&&!blocked;n++){
    const waiting=await tx.$queryRaw<Array<{blocked:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid))>0 AND query LIKE '%parent_report_disclosure_grants%') AS blocked`
    blocked=waiting[0].blocked
    if(!blocked)await tx.$executeRaw`SELECT pg_sleep(0.01)`
   }
   expect(blocked).toBe(true)
   await tx.parentStudentRelationship.update({where:{id:f.link.id},data:{status:'REVOKED',revokedAt:new Date(),revokedByUserId:f.parent.userId,revokeReason:'concurrency fixture'}})
   await tx.$executeRaw`UPDATE parent_report_disclosure_grants SET revoked_at=statement_timestamp(),revoked_by_user_id=${f.parent.userId},revoke_reason='CONCURRENT_UNLINK' WHERE relationship_id=${f.link.id}`
   await tx.$executeRaw`UPDATE parent_report_consents SET revoked_at=statement_timestamp() WHERE relationship_id=${f.link.id}`
  })
  const result=await pending!;expect(result.value).toBeUndefined();expect(result.error).toBeTruthy()
  await expect(f.service.readReport(f.parent,f.child.userId,f.artifactId)).rejects.toMatchObject({status:404})
 })
 it('database bindings independently reject cross-parent consent and grant inserts',async()=>{
  const f=await reportFixture();const c=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,'consent-'+randomUUID(),REPORT_CONSENT_VERSION);const g=await f.service.grantReport(f.officer,f.link.id,f.artifactId,c.consentId,'grant-'+randomUUID())
  await expect(db.$executeRaw`INSERT INTO parent_report_consents (id,relationship_id,student_user_id,parent_user_id,source_artifact_id,source_hash,consent_version,consent_hash,valid_until,command_key) SELECT ${randomUUID()},relationship_id,student_user_id,${f.otherParent.userId},source_artifact_id,source_hash,consent_version,consent_hash,valid_until,${randomUUID()} FROM parent_report_consents WHERE id=${c.consentId}`).rejects.toThrow()
  await expect(db.$executeRaw`INSERT INTO parent_report_disclosure_grants (id,relationship_id,student_user_id,parent_user_id,organization_id,source_artifact_id,source_hash,source_policy_key,source_policy_version,source_policy_hash,projection_mode,projection_payload,projection_hash,consent_id,consent_version,consent_hash,valid_until,approved_by_user_id,command_key) SELECT ${randomUUID()},relationship_id,student_user_id,${f.otherParent.userId},organization_id,source_artifact_id,source_hash,source_policy_key,source_policy_version,source_policy_hash,projection_mode,projection_payload,projection_hash,consent_id,consent_version,consent_hash,valid_until,approved_by_user_id,${randomUUID()} FROM parent_report_disclosure_grants WHERE id=${g.grantId}`).rejects.toThrow()
 })
 it('consent and grant bindings cannot be edited or deleted',async()=>{
  const f=await reportFixture();const c=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,'consent-'+randomUUID(),REPORT_CONSENT_VERSION);const g=await f.service.grantReport(f.officer,f.link.id,f.artifactId,c.consentId,'grant-'+randomUUID())
  await expect(db.$executeRaw`UPDATE parent_report_consents SET parent_user_id=${f.otherParent.userId} WHERE id=${c.consentId}`).rejects.toThrow()
  await expect(db.$executeRaw`UPDATE parent_report_disclosure_grants SET projection_payload='{}'::jsonb WHERE id=${g.grantId}`).rejects.toThrow()
  await expect(db.$executeRaw`DELETE FROM parent_report_disclosure_grants WHERE id=${g.grantId}`).rejects.toThrow()
  await expect(db.$executeRaw`DELETE FROM parent_portal_audit WHERE relationship_id=${f.link.id}`).rejects.toThrow()
 })
 it('disclosure capability alone cannot enumerate consents or grant a report',async()=>{
  const f=await reportFixture(),consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,randomUUID(),REPORT_CONSENT_VERSION)
  await db.organizationCapabilityGrant.updateMany({where:{membershipId:f.officerMembership.id,capability:'PSYCHOLOGY_STAFF'},data:{revokedAt:new Date()}})
  await expect(f.service.disclosureConsents(f.officer,f.artifactId)).rejects.toMatchObject({status:404})
  await expect(f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())).rejects.toMatchObject({status:404})
  expect(await db.$queryRaw<Array<{count:number}>>`SELECT COUNT(*)::int AS count FROM parent_report_disclosure_grants WHERE source_artifact_id=${f.artifactId}`).toEqual([{count:0}])
 })
 it.each(['source-capability','member-deny','policy-deny'])('officer %s withdrawal hides existing disclosures and forbids new ones',async condition=>{
  const f=await reportFixture(),consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,randomUUID(),REPORT_CONSENT_VERSION)
  await f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())
  if(condition==='source-capability')await db.organizationCapabilityGrant.updateMany({where:{membershipId:f.officerMembership.id,capability:'PSYCHOLOGY_STAFF'},data:{revokedAt:new Date()}})
  else await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.org.id,userId:f.officer.userId,permission:condition==='member-deny'?'REPORT_MEMBER_READ':'ORG_INDIVIDUAL_REPORT_V1',reason:'synthetic withdrawal',deniedByUserId:f.admin.userId}})
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toEqual([])
  await expect(f.service.readReport(f.parent,f.child.userId,f.artifactId)).rejects.toMatchObject({status:404})
  await expect(f.service.disclosureConsents(f.officer,f.artifactId)).rejects.toMatchObject({status:404})
  await expect(f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())).rejects.toMatchObject({status:404})
 })
 it('ORG_ADMIN without individual source authority cannot issue disclosure',async()=>{
  const f=await reportFixture(),consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,randomUUID(),REPORT_CONSENT_VERSION)
  await db.organizationMembership.update({where:{id:f.officerMembership.id},data:{orgRole:'ORG_ADMIN'}})
  await db.organizationCapabilityGrant.updateMany({where:{membershipId:f.officerMembership.id,capability:'PSYCHOLOGY_STAFF'},data:{revokedAt:new Date()}})
  await expect(f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())).rejects.toMatchObject({status:404})
 })
 it('an alternative currently authorized approver keeps the report visible before pagination',async()=>{
  const f=await reportFixture(),consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,randomUUID(),REPORT_CONSENT_VERSION)
  await f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())
  const second=await actor(UserRole.TEACHER),m=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:f.org.id,userId:second.userId}})
  for(const capability of ['PSYCHOLOGY_STAFF','PARENT_REPORT_DISCLOSURE'])await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.org.id,membershipId:m.id,capability,grantedByUserId:f.admin.userId}})
  await f.service.grantReport(second,f.link.id,f.artifactId,consent.consentId,randomUUID())
  await db.organizationCapabilityGrant.updateMany({where:{membershipId:f.officerMembership.id,capability:'PSYCHOLOGY_STAFF'},data:{revokedAt:new Date()}})
  const page=await f.service.reports(f.parent,f.child.userId,1,1)
  expect(page.list).toHaveLength(1)
  expect((await f.service.readReport(f.parent,f.child.userId,f.artifactId)).summary).toBe(f.projection.summary)
 })
 it.each(['teacher','counselor'])('current %s relationship grants source access and its withdrawal hides the old report',async persona=>{
  const f=await reportFixture(),consent=await f.service.acceptReportConsent(f.child,f.link.id,f.artifactId,randomUUID(),REPORT_CONSENT_VERSION)
  await db.organizationCapabilityGrant.updateMany({where:{membershipId:f.officerMembership.id,capability:'PSYCHOLOGY_STAFF'},data:{revokedAt:new Date()}})
  for(const [membershipId,kind] of [[f.officerMembership.id,persona==='teacher'?'TEACHER':'COUNSELOR'],[f.childMembership.id,persona==='teacher'?'STUDENT':'CLIENT']])await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.org.id,membershipId,persona:kind,grantedByUserId:f.admin.userId}})
  const relationId=randomUUID()
  if(persona==='teacher'){
   const grade=randomUUID(),klass=randomUUID()
   await db.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name) VALUES(${grade},${f.org.id},'GRADE','Synthetic grade')`
   await db.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name,parent_unit_id) VALUES(${klass},${f.org.id},'CLASS','Synthetic class',${grade})`
   await db.$executeRaw`INSERT INTO organization_student_class_assignments(id,organization_id,membership_id,class_unit_id) VALUES(${randomUUID()},${f.org.id},${f.childMembership.id},${klass})`
   await db.$executeRaw`INSERT INTO organization_staff_class_assignments(id,organization_id,membership_id,class_unit_id,staff_role) VALUES(${relationId},${f.org.id},${f.officerMembership.id},${klass},'TEACHING')`
  }else await db.$executeRaw`INSERT INTO organization_counselor_client_relationships(id,organization_id,counselor_membership_id,client_membership_id) VALUES(${relationId},${f.org.id},${f.officerMembership.id},${f.childMembership.id})`
  await f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toHaveLength(1)
  if(persona==='teacher')await db.$executeRaw`UPDATE organization_staff_class_assignments SET valid_until=statement_timestamp() WHERE id=${relationId}`
  else await db.$executeRaw`UPDATE organization_counselor_client_relationships SET valid_until=statement_timestamp() WHERE id=${relationId}`
  expect((await f.service.reports(f.parent,f.child.userId,1,20)).list).toEqual([])
  await expect(f.service.grantReport(f.officer,f.link.id,f.artifactId,consent.consentId,randomUUID())).rejects.toMatchObject({status:404})
 })

})
