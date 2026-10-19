/** Explicit failed-C25 continuation preparation. Importing this module is pure.
 * Reuse A's accepted evidence; create only a new scheduled four-tool draft.
 * A new formally reviewed SJT release/grant avoids the old grant's time limit.
 * No seeding, upload, migration, FINAL replay, drain or historical-row renewal. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {harness,runtime,sha} from './c25-client.mjs'
import {actors,draftProduct,persist} from './c25-fixture.mjs'

export const MINIMUM_GRANT_REMAINING_MS=1200*1000
export const NEW_GRANT_LIFETIME_MS=3600*1000
const grantStartAllowanceMs=60000
const fixtureFile='c25-inherited-fixture-private.json',prepareFile='c25-prepare-result.json'
const originalRowsFile='c25-original-rows-private.json'
const grantFields=['id','releaseId','instrumentKey','instrumentVersion','definitionHash','contentDigest',
 'granteeTeacherId','courseId','purpose','permission','validFrom','expiresAt','status','version',
 'grantorId','note','revokedAt','revokedBy','revokeNote','createdAt']
const releaseFields=['id','status','instrumentKey','instrumentVersion','definitionHash','contentDigest','authorizationPolicy']
const select=fields=>Object.fromEntries(fields.map(key=>[key,true]))
const json=value=>JSON.parse(JSON.stringify(value))
const copy=value=>structuredClone(value)
const restoreFields=['name','mode','participant','compositeId','attemptId','courseId','accessTokenId','roundId']
const actorRoles=[['teacher','TEACHER'],['student','STUDENT'],['otherTeacher','TEACHER'],['outsider','STUDENT'],['admin','ADMIN']]

/** Only A and reusable actors/definitions belong to the new manifest. This is
 * intentionally an allowlist: the failed B/publication/schedule cannot leak in. */
export function inheritContinuationFixture(source){
 assert.equal(source.schemaVersion,1)
 assert.equal(source.scope,'NEW_SYNTHETIC_C25_ONLY')
 const a=source.cases?.A
 assert.ok(a&&source.products?.A,'Inherited immediate A is required')
 assert.equal(a.name,'A');assert.equal(a.mode,'IMMEDIATE');assert.equal(a.participant,'AUTHENTICATED')
 assert.equal(a.compositeId,source.products.A.id);assert.equal(a.courseId,source.courseId)
 assert.equal(source.products.A.status,'PUBLISHED')
 assert.ok(a.wholeSubmissionBody&&a.wholeSubmissionId,'Original accepted A body is required')
 assert.equal(a.wholeSubmissionBody.submissionId,a.wholeSubmissionId)
 assert.equal(a.wholeSubmissionBody.attemptEpoch,a.attemptEpoch)
 for(const [name,role] of actorRoles){
  assert.ok(source.actors?.[name]?.id);assert.equal(source.actors[name].role,role)
 }
 assert.ok(source.courseId&&source.resources?.scale&&source.resources?.cognitive&&source.resources?.sjt?.release&&source.resources?.grant)
 assert.ok(source.sjtResponses&&typeof source.sjtResponses==='object')
 const restore=source.restoreCases.filter(row=>row.name==='A'),checkpoint=source.checkpointCases.filter(row=>row.name==='A')
 assert.equal(restore.length,1);assert.equal(checkpoint.length,1)
 assert.deepEqual(restore[0],Object.fromEntries(restoreFields.map(key=>[key,a[key]])))
 assert.deepEqual(checkpoint[0],{name:'A',attemptId:a.attemptId,state:'TOMBSTONE'})
 return copy({schemaVersion:source.schemaVersion,scope:source.scope,actors:source.actors,courseId:source.courseId,
  resources:source.resources,sjtResponses:source.sjtResponses,products:{A:source.products.A},cases:{A:a},
  restoreCases:restore,checkpointCases:checkpoint})
}

/** The new form plus separately verified fresh SJT release/grant are the only
 * exceptions. A, all actors, the image, other definitions and responses remain exact. */
export function inheritedContinuationIdentity(fixture){
 const identity=inheritContinuationFixture(fixture)
 delete identity.resources.form
 delete identity.resources.sjt.release
 delete identity.resources.grant
 return identity
}

function block(reason){
 const error=new Error('C25 continuation admission blocked: '+reason+'. Historical rows must remain unchanged; no alternate grant path is allowed.')
 error.name='ContinuationAdmissionError';error.code='C25_CONTINUATION_ADMISSION_BLOCKED';error.reason=reason
 throw error
}
function requireAdmission(ok,reason){if(!ok)block(reason)}
function millis(value,label){
 const parsed=value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):NaN
 requireAdmission(Number.isFinite(parsed),label+' is missing or invalid');return parsed
}

/** Pure source admission. The old grant may expire naturally, but all of its
 * recorded scalar fields, including its original validity interval, stay exact. */
export function assertContinuationSourceAdmission(source,current){
 const expected=source.resources.grant,r=source.resources.sjt.release,g=current.grant
 const now=millis(current.pgNow,'PostgreSQL clock')
 requireAdmission(!!g,'inherited grant is missing')
 for(const key of grantFields){
  requireAdmission(Object.hasOwn(expected,key),'inherited grant field '+key+' is missing')
  requireAdmission(Object.hasOwn(g,key)&&JSON.stringify(json(g[key]))===JSON.stringify(expected[key]),'inherited grant field '+key+' changed')
 }
 requireAdmission(g.status==='ACTIVE'&&g.permission==='DISTRIBUTE'&&g.purpose==='TRAINING_COURSE','inherited grant is not active Training distribution')
 requireAdmission(g.granteeTeacherId===source.actors.teacher.id&&g.courseId===source.courseId,'grant owner/course does not match inherited fixture')
 requireAdmission(g.releaseId===r.id,'grant release ID does not match inherited release')
 for(const key of ['instrumentKey','instrumentVersion','definitionHash','contentDigest'])
  requireAdmission(g[key]===r[key],'grant release '+key+' does not match inherited release')
 requireAdmission(/^[a-f0-9]{64}$/.test(r.definitionHash)&&/^[a-f0-9]{64}$/.test(r.contentDigest),'release digest is invalid')
 requireAdmission(!!current.release,'inherited release is missing')
 for(const key of releaseFields)requireAdmission(current.release[key]===r[key],'inherited release field '+key+' changed')
 requireAdmission(current.release.status==='PUBLISHED'&&current.release.authorizationPolicy==='COURSE_GRANT_V1','inherited release is not formally published and course-controlled')
 const from=millis(g.validFrom,'grant validFrom'),until=millis(g.expiresAt,'grant expiresAt')
 requireAdmission(from<=now,'inherited grant is not yet valid at PostgreSQL clock')
 requireAdmission(until>from,'inherited grant validity interval is invalid')
 for(const [name,role] of actorRoles){
  const u=current.actors?.[name],actor=source.actors[name]
  requireAdmission(!!u&&u.id===actor.id&&u.username===actor.username&&u.role===role&&u.accountDomain===(role==='ADMIN'?'LEGACY':'TRAINING')
   &&u.isActive===true&&u.isFrozen===false&&u.mustChangePassword===false,name+' account is not active in the inherited identity')
  if(u.expiresAt!==null)requireAdmission(millis(u.expiresAt,name+' expiry')>now,name+' account expired at PostgreSQL clock')
  if(role==='TEACHER')requireAdmission(u.teacherApproved===true,'inherited '+name+' is not approved')
 }
 const c=current.course,e=current.enrollment
 requireAdmission(!!c&&c.id===source.courseId&&c.creatorId===source.actors.teacher.id&&c.courseType==='TRAINING_COURSE'
  &&c.status==='PUBLISHED'&&c.isLibrary===false&&c.endedAt===null,'inherited owned Training course is not active')
 requireAdmission(!!e&&e.courseId===source.courseId&&e.studentId===source.actors.student.id&&e.status==='ACTIVE','inherited student enrollment is not active')
 const draft=current.draft,asset=current.asset,reference=source.resources.sjt.asset
 requireAdmission(!!draft&&draft.id===current.release.sourceDraftId&&draft.status==='PUBLISHED'
  &&draft.ownerId===source.actors.teacher.id&&draft.contentDigest===r.contentDigest,'original published author draft is not bound to the exact release')
 requireAdmission(current.release.authorId===source.actors.teacher.id&&current.release.reviewerId===source.actors.admin.id
  &&current.release.authorId!==current.release.reviewerId,'release lacks the independent inherited reviewer')
 requireAdmission(draft.authorizationPolicy==='COURSE_GRANT_V1'&&draft.adaptationSource===null,'published source must be the original controlled synthetic template')
 const template=draft.template
 requireAdmission(!!template&&template.templateVersion==='sjt-online-v1'&&template.instrumentKey===r.instrumentKey
  &&template.instrumentVersion===r.instrumentVersion,'published source template identity changed')
 requireAdmission(!!asset&&asset.id===reference.assetId&&asset.sha256===reference.contentHash&&asset.mimeType===reference.mimeType
  &&asset.ownerId===source.actors.teacher.id&&asset.accessScope==='PRIVATE'&&asset.scopeId==='sjt-authoring'
  &&asset.deletedAt===null&&['local','cos'].includes(asset.provider)&&asset.sizeBytes>0&&asset.sizeBytes<=2*1024*1024
  &&typeof asset.objectKey==='string'&&asset.objectKey.length>0,'shared synthetic image is unavailable or no longer owned')
 const images=template.display?.scenes?.flatMap(scene=>scene.image?[scene.image]:[])??[]
 requireAdmission(images.length===1&&isDeepStrictEqual(images[0].asset,reference)
  &&images[0].rightsStatus==='self_authored'&&!!images[0].rightsNote?.trim()&&!!images[0].altText?.trim(),'source template image identity or original rights changed')
 requireAdmission(isDeepStrictEqual(template.goldenCases?.[0]?.responses,source.sjtResponses),'inherited scientific responses differ from the original accepted template')
 return {passed:true,clock:'POSTGRESQL_CLOCK_TIMESTAMP',pgNow:new Date(now).toISOString(),oldGrantMayExpire:true,
  grantId:g.id,originalExpiresAt:new Date(until).toISOString(),inheritedGrantUnchanged:true,actorsCourseStudentAssetActive:true}
}

/** New grant must be genuinely API-issued for a distinct reviewed release,
 * bounded to one hour from its actual PostgreSQL issuance clock. */
export function assertContinuationGrantAdmission(fixture,current,issued){
 assertContinuationSourceAdmission(fixture,current)
 const now=millis(current.pgNow,'PostgreSQL clock'),at=millis(issued.pgNow,'grant issuance PostgreSQL clock')
 const grant=current.grant,release=current.release
 requireAdmission(release.id!==issued.oldReleaseId&&grant.id!==issued.oldGrantId,'fresh SJT release/grant reused a historical identity')
 requireAdmission(release.instrumentKey===issued.instrumentKey&&release.sourceDraftId===issued.draftId,'new SJT release differs from the requested fresh draft')
 requireAdmission(millis(grant.validFrom,'new grant validFrom')===at-grantStartAllowanceMs
  &&millis(grant.expiresAt,'new grant expiresAt')===at+NEW_GRANT_LIFETIME_MS,'new grant validity differs from the bounded request')
 requireAdmission(grant.grantorId===fixture.actors.admin.id&&grant.version===1,'new grant was not issued by the independent existing admin')
 requireAdmission(now>=at,'PostgreSQL grant observation predates issuance')
 const remaining=millis(grant.expiresAt,'new grant expiresAt')-now
 requireAdmission(remaining>=MINIMUM_GRANT_REMAINING_MS,'new formal grant has less than 1200 seconds remaining at PostgreSQL clock')
 return {passed:true,clock:'POSTGRESQL_CLOCK_TIMESTAMP',pgNow:new Date(now).toISOString(),grantId:grant.id,releaseId:release.id,
  validFrom:json(grant.validFrom),expiresAt:json(grant.expiresAt),remainingMs:remaining,
  minimumRemainingMs:MINIMUM_GRANT_REMAINING_MS,requestedLifetimeMs:NEW_GRANT_LIFETIME_MS}
}

/** Full old scalar rows are retained, including timestamps/package/template and
 * shared asset fields; no column exceptions or normalization beyond JSON dates. */
export function protectedContinuationRows(current){
 return json(Object.fromEntries(['grant','release','draft','asset','actors','course','enrollment'].map(key=>[key,current[key]])))
}

/** SELECT-only, consistent snapshot; the real server clock is read last. No
 * historical checkpoint HTTP read, maintenance call or account login occurs. */
export async function readContinuationAdmission(prisma,source){
 return prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
  const userSelect=select(['id','username','role','accountDomain','isActive','isFrozen','teacherApproved','mustChangePassword','expiresAt'])
  const [grant,release,asset,actorRows,course,enrollment]=await Promise.all([
   tx.sjtReleaseGrant.findUnique({where:{id:source.resources.grant.id}}),
   tx.sjtAuthorRelease.findUnique({where:{id:source.resources.sjt.release.id}}),
   tx.storedAsset.findUnique({where:{id:source.resources.sjt.asset.assetId}}),
   Promise.all(actorRoles.map(async([name])=>[name,await tx.user.findUnique({where:{id:source.actors[name].id},select:userSelect})])),
   tx.course.findUnique({where:{id:source.courseId},select:select(['id','creatorId','courseType','status','isLibrary','endedAt'])}),
   tx.courseStudent.findUnique({where:{courseId_studentId:{courseId:source.courseId,studentId:source.actors.student.id}},select:select(['courseId','studentId','status'])}),
  ])
  const draft=release?await tx.sjtAuthorDraft.findUnique({where:{id:release.sourceDraftId}}):null
  const rows=await tx.$queryRawUnsafe('SELECT clock_timestamp() AS now')
  assert.equal(rows.length,1)
  return {pgNow:rows[0].now,grant,release,draft,asset,actors:Object.fromEntries(actorRows),course,enrollment}
 },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:30000})
}

/** Injection is for no-service adapter tests. The CLI uses only these real
 * defaults and keeps process.argv[2] as the existing harness state contract. */
export async function runContinuationPrepare(dependencies={}){
 const d={harness,runtime,actors,draftProduct,persist,readAdmission:readContinuationAdmission,randomUUID,
  readBytes:file=>fs.readFileSync(file),exists:file=>fs.existsSync(file),state:process.argv[2],...dependencies}
 assert.ok(typeof d.state==='string'&&d.state.length>0,'Continuation state directory argument is required')
 for(const name of ['c25-fixture-private.json','c25-continuation-prepare-result.json','c25-continuation-prepare-http-private.jsonl'])
  assert.equal(d.exists(path.join(d.state,name)),false,'Continuation output already exists; never overwrite a previous attempt')
 const h=await d.harness('continuation-prepare',300);let error
 try{
  assert.equal(h.state,d.state,'Continuation harness state differs')
  const inputs=new Map([fixtureFile,prepareFile,originalRowsFile].map(name=>[name,Buffer.from(d.readBytes(path.join(h.state,name)))]))
  const source=JSON.parse(inputs.get(fixtureFile)),prepare=JSON.parse(inputs.get(prepareFile)),f=inheritContinuationFixture(source)
  assert.equal(prepare.schemaVersion,1);assert.equal(prepare.passed,true);assert.equal(prepare.phase,'prepare')
  assert.equal(prepare.fixture.scope,source.scope);assert.equal(prepare.fixture.immediateAttemptId,source.cases.A.attemptId)
  assert.equal(prepare.fixture.scheduledDraftId,source.products.scheduled.id)
  assert.equal(source.products.scheduled.status,'PUBLISHED','Expected failed first scheduled publication')
  assert.deepEqual(Object.keys(source.cases).sort(),['A','B'],'Only the reviewed partial old B may be inherited as untouched history')
  assert.equal(source.cases.B.compositeId,source.products.scheduled.id)
  h.result.inheritance={inherited:true,caseNames:['A'],prepareRerun:false,
   inputs:Object.fromEntries([...inputs].map(([name,bytes])=>[name,{sha256:sha(bytes),bytes:bytes.length}]))}
  const {prisma}=await d.runtime(),current=await d.readAdmission(prisma,source)
  h.write('c25-continuation-admission-private.json',current)
  h.result.admission=assertContinuationSourceAdmission(source,current)
  const protectedBefore=protectedContinuationRows(current)
  h.check('Original SJT release/grant/template/image remain exact; existing actors and Training course/student are active')
  // Fixed fresh-resource path: the old grant is never renewed, revoked or used
  // for new distribution. Its expiry cannot choose an alternate execution path.
  const a=await d.actors(h,f)
  const template=copy(current.draft.template),oldKey=template.instrumentKey
  template.instrumentKey='c25-continuation-'+d.randomUUID()
  assert.notEqual(template.instrumentKey,oldKey)
  assert.deepEqual({...template,instrumentKey:oldKey},current.draft.template,'Only the new instrument key may change the accepted scientific template')
  let sjt=await a.teacher.request('/situational/authoring/online/drafts','POST',{template,authorizationPolicy:'COURSE_GRANT_V1'})
  assert.ok(sjt.id&&sjt.id!==current.draft.id);assert.equal(sjt.status,'DRAFT')
  const newDraftId=sjt.id,review={revision:sjt.revision,contentDigest:sjt.contentDigest}
  const requested=await a.teacher.request(`/situational/authoring/drafts/${newDraftId}/request-review`,'POST',review)
  assert.equal(requested.id,newDraftId);assert.equal(requested.status,'IN_REVIEW');assert.equal(requested.contentDigest,review.contentDigest)
  const approved=await a.admin.request(`/situational/authoring/drafts/${newDraftId}/review`,'POST',{...review,approve:true,note:'C25 continuation independent synthetic review'})
  assert.equal(approved.id,newDraftId);assert.equal(approved.status,'PUBLISHED');assert.equal(approved.contentDigest,review.contentDigest)
  sjt=await a.teacher.request(`/situational/authoring/drafts/${newDraftId}`)
  assert.deepEqual(sjt.template,template);assert.equal(sjt.status,'PUBLISHED')
  const release=sjt.release
  assert.ok(release?.id&&release.id!==source.resources.sjt.release.id);assert.equal(release.instrumentKey,template.instrumentKey)
  assert.equal(release.instrumentVersion,template.instrumentVersion);assert.equal(release.status,'PUBLISHED')
  assert.equal(release.authorizationPolicy,'COURSE_GRANT_V1');assert.equal(release.contentDigest,review.contentDigest)
  assert.notEqual(release.contentDigest,source.resources.sjt.release.contentDigest)
  for(const key of ['definitionHash','contentDigest'])assert.match(release[key],/^[a-f0-9]{64}$/)
  const clock=await prisma.$queryRawUnsafe('SELECT clock_timestamp() AS now');assert.equal(clock.length,1)
  const issuance=millis(clock[0].now,'grant issuance PostgreSQL clock')
  const issued={pgNow:new Date(issuance).toISOString(),draftId:newDraftId,instrumentKey:template.instrumentKey,
   oldReleaseId:source.resources.sjt.release.id,oldGrantId:source.resources.grant.id}
  const grant=await a.admin.request(`/situational/authoring/releases/${release.id}/grants`,'POST',{
   instrumentKey:release.instrumentKey,instrumentVersion:release.instrumentVersion,definitionHash:release.definitionHash,contentDigest:release.contentDigest,
   granteeTeacherId:f.actors.teacher.id,courseId:f.courseId,purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',
   validFrom:new Date(issuance-grantStartAllowanceMs).toISOString(),expiresAt:new Date(issuance+NEW_GRANT_LIFETIME_MS).toISOString(),
   note:'C25 continuation fresh exact Training distribution'})
  f.resources.sjt={...f.resources.sjt,release:copy(release)};f.resources.grant=copy(grant)
  const fresh=await d.readAdmission(prisma,f)
  h.result.grantAdmission=assertContinuationGrantAdmission(f,fresh,issued)
  assert.deepEqual(fresh.draft.template,template)
  h.write('c25-continuation-new-sjt-private.json',{issued,template,release,grant,current:fresh})
  h.result.sjtContinuation={strategy:'FRESH_FORMAL_RELEASE',old:{release:source.resources.sjt.release,grantId:source.resources.grant.id,asset:source.resources.sjt.asset},
   fresh:{release:copy(release),grantId:grant.id,asset:copy(f.resources.sjt.asset)},scientificTemplateUnchangedExceptInstrumentKey:true}
  const p=await d.draftProduct(a.teacher,f,{name:'continuation B C D scheduled four-tool',four:true})
  assert.ok(p&&typeof p.id==='string'&&p.id.length>0)
  assert.ok(!Object.values(source.products).some(product=>product.id===p.id),'New draft must not reuse any inherited publication')
  assert.equal(p.status,'DRAFT');assert.equal(p.formSections.length,1)
  assert.deepEqual(p.items.map(item=>item.type),['FORM','SCALE','COGNITIVE','SITUATIONAL'],'Continuation requires the actual four-tool draft')
  const form=p.formSections[0].id
  assert.ok(typeof form==='string'&&form.length>0);assert.notEqual(form,source.resources.form,'New draft must have a fresh form')
  const row=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:p.id}})
  assert.equal(row.id,p.id);assert.equal(row.status,'DRAFT');assert.equal(row.publishedAt,null)
  f.products.scheduled=copy(p);f.resources.form=form
  assert.deepEqual(inheritedContinuationIdentity(f),inheritedContinuationIdentity(source),'Inherited A/actor/resource identity changed')
  assert.deepEqual(Object.keys(f.cases),['A']);assert.equal(f.schedule,undefined)
  const after=await d.readAdmission(prisma,source)
  assertContinuationSourceAdmission(source,after)
  assert.deepEqual(protectedContinuationRows(after),protectedBefore,'Historical SJT release/grant/template/asset or active scope rows changed')
  h.result.grantAdmission=assertContinuationGrantAdmission(f,{...fresh,pgNow:after.pgNow},issued)
  h.result.sjtContinuation.oldRowsUnchanged=true
  h.write('c25-continuation-old-sjt-after-private.json',after)
  for(const [name,bytes] of inputs)assert.ok(bytes.equals(Buffer.from(d.readBytes(path.join(h.state,name)))),'Inherited input bytes changed: '+name)
  d.persist(h,f)
  h.result.fixture={scope:f.scope,immediateAttemptId:f.cases.A.attemptId,scheduledDraftId:p.id,inheritedCaseNames:['A']}
  h.result.passed=true
  h.check('Original A and all old SJT rows preserved; new formally reviewed SJT/grant and four-tool DRAFT/form ready for a fresh scheduled T0')
 }catch(e){error=e;if(e.code==='C25_CONTINUATION_ADMISSION_BLOCKED')h.result.admission={passed:false,code:e.code,reason:e.reason}}
 finally{await h.finish(error)}
 return h.result
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await runContinuationPrepare()
