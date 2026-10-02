import {randomUUID} from 'node:crypto'
import type {Server} from 'node:http'
import express from 'express'
import bcrypt from 'bcryptjs'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {config} from '../../config'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl} from './integration-env'
import {miniHttpClient,nativeRequire,assertMiniTestDatabase} from './mini-http-client'
import {buildReportingFixture} from './reporting-fixture'
import {createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec} from '../../modules/reporting/spec'
import {generateOrganizationProtectedFeedback} from '../../modules/reporting/pr4Service'
import {createMembership,grantCapability,revokeCapability} from '../../modules/organization/service'
import {createParentPublisher} from '../../modules/parent-portal/publisher'
import {createParentTemplateRegistry} from '../../modules/parent-portal/templates'
import {parentToolPolicyService} from '../../modules/parent-portal/tool-policy'
import authRoutes from '../../routes/auth'
import capabilitiesRoutes from '../../routes/capabilities'
import {parentLinksRouter,parentsRouter,parentPublicationRouter} from '../../modules/parent-portal/routes'
import organizationRoutes from '../../modules/organization/organization.routes'
import {csrfProtection} from '../../middleware/csrf'
const {createParentService}=nativeRequire('../../../../miniprogram-v2/domains/parents/service.js')
const {createParentPublicationService}=nativeRequire('../../../../miniprogram-v2/domains/parents/publication.js')
const url=integrationDatabaseUrl('PARENT_PORTAL_TEST_DB_URL','RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let server:Server,baseUrl:string,previousFlag:boolean,passwordHash:string
const password='Synthetic-publication-test-2026'
const meta=(actorUserId:string)=>({actorUserId,commandKey:randomUUID()})
function client(){const c=miniHttpClient(baseUrl);c.runtime.parents=createParentService(c.runtime.api,c.runtime.session);c.runtime.parentPublications=createParentPublicationService(c.runtime.api,c.runtime.session);return c}
suite('PR3 independent PARENT publication through real Mini Cookie/CSRF HTTP and PostgreSQL',()=>{
 beforeAll(async()=>{assertMiniTestDatabase(url!);previousFlag=config.parentPortalEnabled;config.parentPortalEnabled=true;passwordHash=await bcrypt.hash(password,4);const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/auth',authRoutes);app.use('/api/capabilities',capabilitiesRoutes);app.use('/api/organizations',organizationRoutes);app.use('/api/parent-links',parentLinksRouter);app.use('/api/parents',parentsRouter);app.use('/api/parent-report-publications',parentPublicationRouter);app.use((e:any,_q:any,r:any,_n:any)=>{console.error(e);r.status(500).json({data:null,message:'fixture failure'})});server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();if(!address||typeof address==='string')throw new Error('listener missing');baseUrl='http://127.0.0.1:'+address.port},90000)
 afterAll(async()=>{config.parentPortalEnabled=previousFlag;if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}await prisma.$disconnect()})
 it('publishes immutable content; requires exact student consent and explicit officer capability; superseding, capability loss, tool withholding and unlink deny access',async()=>{
  const f=await buildReportingFixture(prisma,3,true)
  const child=await prisma.user.update({where:{id:f.ownerId},data:{role:'STUDENT',passwordHash}})
  const manager=await prisma.user.create({data:{username:'publication-manager-'+randomUUID(),passwordHash,role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  const principal={userId:manager.id,role:'ADMIN' as const,platformRole:'SYSTEM_ADMIN' as const},organizationId=f.organizationId
  const member=await createMembership({organizationId,userId:manager.id,orgRole:'ORG_ADMIN',meta:meta(manager.id)})
  const [ref]=await prisma.$queryRaw<Array<{key:string;version:string}>>`SELECT resource_key AS key,resource_version AS version FROM assessment_run_tracks WHERE id=${f.trackId}`
  const spec=await createPlatformReportingSpec({actor:principal,specKey:randomUUID(),version:1,definition:{schemaVersion:1,analysisKind:'PROTECTED_FEEDBACK',engineKey:'ORG_PROTECTED_FEEDBACK_V1',engineVersion:'1.0.0',privacyUnit:'RESPONDENT',selectionPolicy:'UNIQUE_OR_REJECT',minimumRespondentN:3,minimumContributorN:3,reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'score',sourceMetricKey:'score',sourceFamily:'BUNDLE',sourceResourceKey:ref.key,valueType:'NUMBER',longitudinalMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',aggregations:['MEAN'],missingnessRule:'EXCLUDE',minimumMetricN:3,observationUnit:'RESPONDENT',selectionPolicy:'UNIQUE_OR_REJECT'}]}})
  await reviewPlatformReportingSpec({actor:principal,specId:spec.id});await publishPlatformReportingSpec({actor:principal,specId:spec.id})
  const report=await generateOrganizationProtectedFeedback({principal,organizationId,runId:f.runId,trackId:f.trackId,subjectUserId:child.id,relationshipKind:'CLASS_TEACHER_STUDENT',perspective:'RELATIONAL_EXPERIENCE',specId:spec.id})
  const artifactId=report.artifactId,[sourceBefore]=await prisma.$queryRaw<any[]>`SELECT artifact_payload,snapshot_hash FROM reporting_analysis_artifacts WHERE id=${artifactId}`
  const parent=await prisma.user.create({data:{username:'publication-parent-'+randomUUID(),passwordHash,role:'PARENT'}})
  const outsider=await prisma.user.create({data:{username:'publication-outsider-'+randomUUID(),passwordHash,role:'PARENT'}})
  const course=await prisma.course.create({data:{creatorId:manager.id,title:'Publication synthetic course',courseCode:randomUUID().slice(0,12)}});await prisma.courseStudent.create({data:{courseId:course.id,studentId:child.id,status:'ACTIVE'}})
  const s=client(),p=client(),a=client(),other=client();for(const [c,u]of [[s,child],[p,parent],[a,manager],[other,outsider]]as const)await c.runtime.session.login({username:u.username,password})
  const invite=await s.runtime.parents.invite(course.id),link=await p.runtime.parents.claim(invite.inviteCode);await s.runtime.parents.approve(link.id,(await s.runtime.parents.view({view:'links'})).consent.version)
  const pub='/parent-report-publications/'+artifactId
  // SYSTEM_ADMIN alone cannot publish. Tool ceiling alone cannot grant reads.
  await expect(a.runtime.api.post(pub+'/preview',{})).rejects.toMatchObject({status:404})
  await grantCapability({organizationId,membershipId:member.id,capability:'PARENT_REPORT_DISCLOSURE',meta:meta(manager.id)})
  await expect(a.runtime.api.post(pub+'/preview',{})).rejects.toMatchObject({status:404})
  await parentToolPolicyService.update(manager.id,{family:'BUNDLE',...ref},{policy:{mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]},expectedVersion:0,commandKey:randomUUID()})
  expect((await a.runtime.parentPublications.list(organizationId)).list.some((r:any)=>r.id===artifactId)).toBe(true)
  await expect(s.runtime.api.post(pub+'/preview',{})).rejects.toMatchObject({status:404})
  const preview=await a.runtime.parentPublications.preview(artifactId)
  expect(preview.projection).toMatchObject({audience:'PARENT',summary:'',blocks:[],policy:{mode:'COMPLETION_ONLY',rawAnswers:false,itemLevel:false}})
  const race=await Promise.allSettled([a.runtime.parentPublications.publish(preview),a.runtime.parentPublications.publish(preview)]);expect(race.filter(r=>r.status==='fulfilled').length).toBeGreaterThan(0);for(const r of race)if(r.status==='rejected')expect(r.reason.status).toBe(409);const receipt=await a.runtime.parentPublications.publish(preview);expect(await a.runtime.parentPublications.publish(preview)).toEqual(receipt);const [count]=await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int AS n FROM parent_report_publications WHERE source_artifact_id=${artifactId}`;expect(count.n).toBe(1)
  await expect(a.runtime.api.post(pub+'/publish',{templateKey:preview.template.key,templateVersion:preview.template.version,previewHash:'b'.repeat(64),expectedVersion:preview.expectedVersion,commandKey:randomUUID()})).rejects.toMatchObject({status:409})
  expect((await s.runtime.parents.view({view:'reportOptions',relationshipId:link.id})).list[0].id).toBe(artifactId)
  const consentPreview=(await s.runtime.parents.view({view:'consent',relationshipId:link.id,artifactId})).preview
  await expect(s.runtime.parents.accept({...consentPreview,publicationHash:undefined})).rejects.toMatchObject({status:409})
  expect(consentPreview).toMatchObject({consentStatus:'NOT_ACCEPTED',canConsent:true,canRevoke:false})
  // A second, independently published report proves withdrawal remains artifact-scoped.
  const independentSpec=await createPlatformReportingSpec({actor:principal,specKey:randomUUID(),version:1,definition:{...spec.definition,metricRules:spec.definition.metricRules.map(rule=>({...rule,aggregations:['MEAN','MEDIAN']}))}})
  await reviewPlatformReportingSpec({actor:principal,specId:independentSpec.id});await publishPlatformReportingSpec({actor:principal,specId:independentSpec.id})
  const independent=await generateOrganizationProtectedFeedback({principal,organizationId,runId:f.runId,trackId:f.trackId,subjectUserId:child.id,relationshipKind:'CLASS_TEACHER_STUDENT',perspective:'RELATIONAL_EXPERIENCE',specId:independentSpec.id})
  expect(independent.artifactId).not.toBe(artifactId)
  await a.runtime.parentPublications.publish(await a.runtime.parentPublications.preview(independent.artifactId))
  const independentPreview=(await s.runtime.parents.view({view:'consent',relationshipId:link.id,artifactId:independent.artifactId})).preview
  const independentConsent=await s.runtime.parents.accept(independentPreview),independentRow=(await a.runtime.parentPublications.consents(independent.artifactId)).list.find((r:any)=>r.id===independentConsent.consentId)
  await a.runtime.parentPublications.grant(independent.artifactId,independentRow)
  const independentRead=()=>p.runtime.parents.view({view:'report',childId:child.id,artifactId:independent.artifactId})
  const firstConsent=await s.runtime.parents.accept(consentPreview);expect(await s.runtime.parents.accept(consentPreview)).toEqual(firstConsent)
  expect((await s.runtime.parents.view({view:'consent',relationshipId:link.id,artifactId})).preview).toMatchObject({consentStatus:'ACCEPTED',canConsent:false,canRevoke:true})
  await s.runtime.parents.withdraw(link.id,artifactId)
  const withdrawn=(await s.runtime.parents.view({view:'consent',relationshipId:link.id,artifactId})).preview
  expect(withdrawn).toMatchObject({consentStatus:'NOT_ACCEPTED',canConsent:true,canRevoke:false})
  await expect(a.runtime.api.post('/parent-links/'+link.id+'/reports/'+artifactId+'/grants',{consentId:firstConsent.consentId,commandKey:randomUUID()})).rejects.toMatchObject({status:404})
  await expect(p.runtime.parents.view({view:'report',childId:child.id,artifactId})).rejects.toMatchObject({status:404})
  expect((await independentRead()).report.artifactId).toBe(independent.artifactId)
  expect((await prisma.parentStudentRelationship.findUniqueOrThrow({where:{id:link.id}})).status).toBe('ACTIVE')
  const consent=await s.runtime.parents.accept(withdrawn)
  const row=(await a.runtime.parentPublications.consents(artifactId)).list.find((r:any)=>r.id===consent.consentId);expect(row).toBeTruthy()
  const grant=await a.runtime.parentPublications.grant(artifactId,row);expect(await a.runtime.parentPublications.grant(artifactId,row)).toEqual(grant)
  const read=()=>p.runtime.parents.view({view:'report',childId:child.id,artifactId});expect((await read()).report).toMatchObject({title:preview.projection.title,summary:preview.projection.summary,blocks:preview.projection.blocks,mode:preview.projection.policy.mode})
  await expect(other.runtime.parents.view({view:'report',childId:child.id,artifactId})).rejects.toMatchObject({status:404})
  await expect(other.runtime.parents.withdraw(link.id,artifactId)).rejects.toMatchObject({status:404})
  expect((await s.runtime.parents.view({view:'consent',relationshipId:link.id,artifactId})).report.canRevoke).toBe(true)
  await s.runtime.parents.withdraw(link.id,artifactId);await expect(read()).rejects.toMatchObject({status:404})
  expect((await independentRead()).report.artifactId).toBe(independent.artifactId)
  expect((await p.runtime.parents.view({view:'children'})).list.some((r:any)=>r.id===child.id)).toBe(true)
  const retryPreview=(await s.runtime.parents.view({view:'consent',relationshipId:link.id,artifactId})).preview,retryConsent=await s.runtime.parents.accept(retryPreview),retryRow=(await a.runtime.parentPublications.consents(artifactId)).list.find((r:any)=>r.id===retryConsent.consentId)
  await a.runtime.parentPublications.grant(artifactId,retryRow);expect((await read()).report.artifactId).toBe(artifactId)
  await revokeCapability({organizationId,membershipId:member.id,capability:'PARENT_REPORT_DISCLOSURE',meta:meta(manager.id)});await expect(read()).rejects.toMatchObject({status:404})
  await grantCapability({organizationId,membershipId:member.id,capability:'PARENT_REPORT_DISCLOSURE',meta:meta(manager.id)});expect((await read()).report.title).toBe(preview.projection.title)
  await parentToolPolicyService.update(manager.id,{family:'BUNDLE',...ref},{policy:{mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]},expectedVersion:1,commandKey:randomUUID()});await expect(read()).rejects.toMatchObject({status:404})
  await parentToolPolicyService.update(manager.id,{family:'BUNDLE',...ref},{policy:{mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]},expectedVersion:2,commandKey:randomUUID()})
  const next=await a.runtime.parentPublications.preview(artifactId),nextReceipt=await a.runtime.parentPublications.publish(next);expect(nextReceipt.publicationHash).not.toBe(receipt.publicationHash)
  await expect(read()).rejects.toMatchObject({status:404});await expect(s.runtime.parents.accept(consentPreview)).rejects.toMatchObject({status:409});await expect(a.runtime.parentPublications.grant(artifactId,row)).rejects.toMatchObject({status:404})
  const fresh=(await s.runtime.parents.view({view:'consent',relationshipId:link.id,artifactId})).preview,newConsent=await s.runtime.parents.accept(fresh),newRow=(await a.runtime.parentPublications.consents(artifactId)).list.find((r:any)=>r.id===newConsent.consentId)
  await a.runtime.parentPublications.grant(artifactId,newRow);expect((await read()).report).toMatchObject({title:next.projection.title,blocks:next.projection.blocks,mode:next.projection.policy.mode})
  // A synthetic reviewed per-tool template exercises production assembly without installing real content.
  await parentToolPolicyService.update(manager.id,{family:'BUNDLE',...ref},{policy:{mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:[]},expectedVersion:3,commandKey:randomUUID()})
  const template={key:'synthetic-parent-education',version:'1.0.0',status:'PUBLISHED' as const,title:'合成家长教育报告',mode:'EDUCATIONAL_SUMMARY' as const,toolRef:{family:'BUNDLE' as const,...ref},metrics:[{metricId:'score',sourceMetricKey:'score',label:'服务器指标',aggregation:'MEAN' as const}],disclaimer:'仅用于合成测试，不含原始作答。'}
  const publisher=createParentPublisher(prisma,createParentTemplateRegistry([template])),educational=await publisher.preview(principal,artifactId,template.key,template.version)
  expect(educational.projection.blocks[0]).toEqual({title:'服务器指标',text:'1'})
  await expect(a.runtime.api.post(pub+'/preview',{templateKey:template.key,templateVersion:template.version})).rejects.toMatchObject({status:404})
  await publisher.publish(principal,artifactId,{templateKey:template.key,templateVersion:template.version,previewHash:educational.previewHash,expectedVersion:educational.expectedVersion,commandKey:educational.commandKey})
  await expect(read()).rejects.toMatchObject({status:404});const educationalConsent=(await s.runtime.parents.view({view:'consent',relationshipId:link.id,artifactId})).preview
  const ec=await s.runtime.parents.accept(educationalConsent),er=(await a.runtime.parentPublications.consents(artifactId)).list.find((r:any)=>r.id===ec.consentId);await a.runtime.parentPublications.grant(artifactId,er)
  expect((await read()).report.blocks).toEqual(educational.projection.blocks);expect(JSON.stringify((await read()).report)).not.toMatch(/respondent|itemScores|answers/)
  await p.runtime.parents.revoke(link.id);await expect(read()).rejects.toMatchObject({status:404})
  const [sourceAfter]=await prisma.$queryRaw<any[]>`SELECT artifact_payload,snapshot_hash FROM reporting_analysis_artifacts WHERE id=${artifactId}`;expect(sourceAfter).toEqual(sourceBefore)
  await expect(prisma.$executeRaw`UPDATE parent_report_publications SET template_version='tampered' WHERE id=${receipt.publicationId}`).rejects.toThrow()
  expect(a.calls.filter((c:any)=>c.url.includes('/publish')).every((c:any)=>c.header['X-CSRF-Token']&&!c.header.Authorization)).toBe(true)
  await Promise.all([s,p,a,other].map(c=>c.runtime.session.logout()))
 },90000)
})
