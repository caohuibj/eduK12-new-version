/** Synthetic, no-service adapter contracts only. No HTTP/DB connection,
 * compiled product import, build or runtime-qualification receipt is produced. */
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {createRequire} from 'node:module'
import {sha} from './c25-client.mjs'
import {inheritContinuationFixture,inheritedContinuationIdentity,assertContinuationSourceAdmission,
 assertContinuationGrantAdmission,protectedContinuationRows,MINIMUM_GRANT_REMAINING_MS,NEW_GRANT_LIFETIME_MS,
 readContinuationAdmission,runContinuationPrepare} from './c25-continuation-prepare.mjs'

const copy=value=>structuredClone(value)
const now='2026-10-19T09:40:00.000Z',until='2026-10-19T10:27:56.725Z'
const iso=(at,delta=0)=>new Date(Date.parse(at)+delta).toISOString()
const fields=['name','mode','participant','compositeId','attemptId','courseId','accessTokenId','roundId']
const freshKey='c25-continuation-00000000-0000-4000-8000-000000000001'
function fixture(){
 const actors=Object.fromEntries([['teacher','TEACHER'],['student','STUDENT'],['otherTeacher','TEACHER'],['outsider','STUDENT'],['admin','ADMIN']]
  .map(([name,role])=>[name,{id:name,username:'synthetic-'+name,password:'synthetic-only',role}]))
 const release={id:'release',status:'PUBLISHED',instrumentKey:'synthetic-online-sjt',instrumentVersion:'1.0.0',
  definitionHash:'a'.repeat(64),contentDigest:'b'.repeat(64),authorizationPolicy:'COURSE_GRANT_V1'}
 const grant={id:'formal-grant',releaseId:release.id,instrumentKey:release.instrumentKey,instrumentVersion:release.instrumentVersion,
  definitionHash:release.definitionHash,contentDigest:release.contentDigest,granteeTeacherId:actors.teacher.id,courseId:'course',
  purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',validFrom:'2026-10-19T09:26:56.725Z',expiresAt:until,
  status:'ACTIVE',version:1,grantorId:actors.admin.id,note:'Synthetic formal grant',revokedAt:null,revokedBy:null,revokeNote:null,
  createdAt:'2026-10-19T09:27:56.743Z'}
 const a={name:'A',mode:'IMMEDIATE',participant:'AUTHENTICATED',compositeId:'old-A-publication',attemptId:'old-A-attempt',courseId:'course',
  accessTokenId:null,roundId:null,attemptEpoch:1,wholeSubmissionId:'original-A-submission',
  wholeSubmissionBody:{submissionId:'original-A-submission',attemptEpoch:1,units:[{answers:[{value:'original'}]}]},
  slots:[{slotKey:'A-scale-slot'}],children:{scaleId:'A-scale'},steps:[]}
 const b={name:'B',mode:'SCHEDULED',participant:'AUTHENTICATED',compositeId:'old-scheduled-publication',attemptId:'old-B-partial',
  courseId:'course',accessTokenId:null,roundId:null,attemptEpoch:1,children:{scaleId:'old-B-scale'},steps:[]}
 return {schemaVersion:1,scope:'NEW_SYNTHETIC_C25_ONLY',actors,courseId:'course',
  resources:{scale:'scale',cognitive:'cognitive',sjt:{release,asset:{assetId:'asset',contentHash:'e'.repeat(64),mimeType:'image/png'}},grant,form:'old-form'},
  sjtResponses:[{itemKey:'item',answer:'answer'}],
  products:{A:{id:a.compositeId,status:'PUBLISHED',items:[{id:'old-A-item'}]},scheduled:{id:b.compositeId,status:'PUBLISHED',formSections:[{id:'old-form'}]}},
  cases:{A:a,B:b},restoreCases:[a,b].map(c=>Object.fromEntries(fields.map(key=>[key,c[key]]))),
  checkpointCases:[{name:'A',attemptId:a.attemptId,state:'TOMBSTONE'}],schedule:{t0:'old-t0',releaseAt:'old-release'}}
}
function admission(f,pgNow=now){
 const r=f.resources.sjt.release,reference=f.resources.sjt.asset,draftId=r.id==='release'?'old-sjt-draft':'new-sjt-draft'
 const actors=Object.fromEntries(Object.entries(f.actors).map(([name,u])=>[name,{id:u.id,username:u.username,role:u.role,
  isActive:true,isFrozen:false,teacherApproved:true,accountDomain:u.role==='ADMIN'?'LEGACY':'TRAINING',mustChangePassword:false,expiresAt:null}]))
 const template={templateVersion:'sjt-online-v1',instrumentKey:r.instrumentKey,instrumentVersion:r.instrumentVersion,title:'Synthetic scientific template',
  display:{title:'Synthetic scientific template',scenes:[{sceneKey:'scene',image:{asset:copy(reference),altText:'Synthetic image',rightsStatus:'self_authored',rightsNote:'Synthetic original'}}]},
  goldenCases:[{name:'golden',responses:copy(f.sjtResponses),expected:{cooperation:1}}]}
 return {pgNow,grant:copy(f.resources.grant),release:{...copy(r),sourceDraftId:draftId,authorId:'teacher',reviewerId:'admin',package:{retained:'scientific package'},createdAt:now},
  draft:{id:draftId,ownerId:'teacher',status:'PUBLISHED',revision:1,contentDigest:r.contentDigest,authorizationPolicy:'COURSE_GRANT_V1',adaptationSource:null,
   template,createdAt:now,updatedAt:now},
  asset:{id:reference.assetId,sha256:reference.contentHash,mimeType:reference.mimeType,ownerId:'teacher',accessScope:'PRIVATE',scopeId:'sjt-authoring',
   deletedAt:null,provider:'local',sizeBytes:70,objectKey:'assets/original.png',storageObjectKey:null,duplicateCleanupPending:false,createdAt:now,updatedAt:now},
  actors,course:{id:f.courseId,creatorId:f.actors.teacher.id,courseType:'TRAINING_COURSE',status:'PUBLISHED',isLibrary:false,endedAt:null},
  enrollment:{courseId:f.courseId,studentId:f.actors.student.id,status:'ACTIVE'}}
}
function freshCase(){
 const original=fixture(),f=inheritContinuationFixture(original),r={...copy(f.resources.sjt.release),id:'new-release',instrumentKey:freshKey,definitionHash:'c'.repeat(64),contentDigest:'d'.repeat(64)}
 f.resources.sjt.release=r
 f.resources.grant={...copy(f.resources.grant),id:'new-grant',releaseId:r.id,instrumentKey:r.instrumentKey,definitionHash:r.definitionHash,contentDigest:r.contentDigest,
  validFrom:iso(now,-60000),expiresAt:iso(now,NEW_GRANT_LIFETIME_MS),createdAt:iso(now,500),note:'C25 continuation fresh exact Training distribution'}
 const issued={pgNow:now,draftId:'new-sjt-draft',instrumentKey:freshKey,oldReleaseId:original.resources.sjt.release.id,oldGrantId:original.resources.grant.id}
 return {original,f,current:admission(f,iso(now,1000)),issued}
}
function setup(){
 const f=fixture(),current=admission(f),state='/synthetic-continuation-state',files=new Map(),calls=[],writes=[],logins=[]
 const put=(name,value)=>files.set(path.join(state,name),Buffer.from(JSON.stringify(value,null,2)+'\n'))
 put('c25-inherited-fixture-private.json',f)
 put('c25-prepare-result.json',{schemaVersion:1,phase:'prepare',passed:true,fixture:{scope:f.scope,immediateAttemptId:f.cases.A.attemptId,scheduledDraftId:f.products.scheduled.id}})
 put('c25-original-rows-private.json',{columns:{synthetic:['id']},rows:{synthetic:[{id:'untouched'}]}})
 const draft={id:'new-scheduled-draft',status:'DRAFT',revision:5,name:'C25 continuation B C D scheduled four-tool',
  expiresAt:'2026-10-19T10:40:00.000Z',formSections:[{id:'new-form'}],items:[{type:'FORM'},{type:'SCALE'},{type:'COGNITIVE'},{type:'SITUATIONAL'}]}
 const result={schemaVersion:1,phase:'continuation-prepare',passed:false,checks:[],requests:[],measurements:[]}
 const h={state,result,write(name,value){writes.push({name,value:copy(value)});put(name,value)},check(text){result.checks.push(text)},
  async finish(error){calls.push('finish');if(error){result.passed=false;result.error={name:error.name,message:error.message};h.error=error}}}
 const s={f,current,state,files,calls,writes,logins,draft,h,result,put,oldReads:0,issueNow:now,newClockDelta:1000,after:null,newMutation:null}
 const requester=actor=>({async request(route,method='GET',body){
  calls.push({actor,route,method,body:copy(body)})
  if(route==='/questionnaire-products'){assert.equal(actor,'teacher');assert.equal(method,'POST');return copy(draft)}
  if(route==='/situational/authoring/online/drafts'){
   assert.equal(actor,'teacher');assert.equal(method,'POST');assert.equal(body.authorizationPolicy,'COURSE_GRANT_V1')
   assert.deepEqual({...body.template,instrumentKey:f.resources.sjt.release.instrumentKey},current.draft.template)
   s.sjt={id:'new-sjt-draft',revision:1,status:'DRAFT',contentDigest:'d'.repeat(64),template:copy(body.template)};return copy(s.sjt)
  }
  if(route==='/situational/authoring/drafts/new-sjt-draft/request-review'){
   assert.equal(actor,'teacher');assert.equal(method,'POST');assert.deepEqual(body,{revision:1,contentDigest:'d'.repeat(64)})
   s.sjt.status='IN_REVIEW';return copy(s.sjt)
  }
  if(route==='/situational/authoring/drafts/new-sjt-draft/review'){
   assert.equal(actor,'admin');assert.equal(method,'POST');assert.equal(body.approve,true)
   assert.equal(body.revision,1);assert.equal(body.contentDigest,'d'.repeat(64));s.sjt.status='PUBLISHED'
   s.sjt.release={...copy(f.resources.sjt.release),id:'new-release',instrumentKey:s.sjt.template.instrumentKey,definitionHash:'c'.repeat(64),contentDigest:'d'.repeat(64)}
   return copy(s.sjt)
  }
  if(route==='/situational/authoring/drafts/new-sjt-draft'){assert.equal(actor,'teacher');assert.equal(method,'GET');return copy(s.sjt)}
  if(route==='/situational/authoring/releases/new-release/grants'){
   assert.equal(actor,'admin');assert.equal(method,'POST');s.grantRequest=copy(body)
   s.grant={...copy(f.resources.grant),...copy(body),id:'new-grant',releaseId:'new-release',createdAt:iso(s.issueNow,500)};return copy(s.grant)
  }
  throw new Error('Unexpected synthetic request '+route)
 }})
 const teacher=requester('teacher'),admin=requester('admin'),dbRow={id:draft.id,status:'DRAFT',publishedAt:null};s.dbRow=dbRow
 const prisma={compositeAssessment:{async findUniqueOrThrow(args){calls.push({dbRead:args});return copy(dbRow)}},
  async $queryRawUnsafe(sql){assert.equal(sql,'SELECT clock_timestamp() AS now');calls.push('grant-clock');return [{now:new Date(s.issueNow)}]}}
 s.dependencies={state,exists:file=>files.has(file),readBytes:file=>{assert.ok(files.has(file),file);return Buffer.from(files.get(file))},
  randomUUID:()=>freshKey.slice('c25-continuation-'.length),
  async harness(phase,budget){calls.push({phase,budget});return h},async runtime(){calls.push('runtime');return {prisma}},
  async readAdmission(db,source){
   assert.equal(db,prisma)
   if(source.resources.grant.id===f.resources.grant.id){
    assert.deepEqual(source,f);s.oldReads++;calls.push(s.oldReads===1?'old-admission':'old-preservation')
    return s.oldReads===1?copy(current):{...copy(s.after??current),pgNow:iso(s.issueNow,s.newClockDelta+1000)}
   }
   calls.push('new-admission');const observed=admission(source,iso(s.issueNow,s.newClockDelta));observed.draft.template=copy(s.sjt.template)
   if(s.newMutation)s.newMutation(observed);return observed
  },
  async actors(_h,source){assert.equal(_h,h);assert.deepEqual(Object.keys(source.cases),['A']);calls.push('actors');logins.push('teacher','admin');return {teacher,admin}},
  async draftProduct(client,source,options){
   assert.equal(client,teacher);assert.deepEqual(options,{name:'continuation B C D scheduled four-tool',four:true})
   assert.deepEqual(inheritedContinuationIdentity(source),inheritedContinuationIdentity(f));assert.equal(source.resources.sjt.release.id,'new-release')
   assert.equal(source.resources.grant.id,'new-grant');calls.push('draftProduct')
   return client.request('/questionnaire-products','POST',{name:options.name,courseIds:[source.courseId],four:options.four})
  },persist(_h,value){assert.equal(_h,h);h.write('c25-fixture-private.json',value)}}
 return s
}
const blocked=fn=>assert.throws(fn,error=>error.name==='ContinuationAdmissionError'&&error.code==='C25_CONTINUATION_ADMISSION_BLOCKED')

test('import is pure and leaves the compiled product/Prisma closure unloaded',()=>{
 const require=createRequire(import.meta.url)
 assert.ok(!Object.keys(require.cache).some(file=>file.includes('/backend/dist/')||file.includes('/@prisma/client/')))
})

test('pure inheritance deep-copies exact A and reusable identities and excludes old B/publication/schedule',()=>{
 const source=fixture(),original=copy(source),fresh=inheritContinuationFixture(source)
 assert.deepEqual(Object.keys(fresh.products),['A']);assert.deepEqual(Object.keys(fresh.cases),['A']);assert.equal(fresh.schedule,undefined)
 assert.deepEqual(fresh.actors,source.actors);assert.deepEqual(fresh.resources,source.resources);assert.deepEqual(fresh.sjtResponses,source.sjtResponses)
 assert.deepEqual(fresh.products.A,source.products.A);assert.deepEqual(fresh.cases.A,source.cases.A)
 assert.deepEqual(fresh.restoreCases,[source.restoreCases[0]]);assert.deepEqual(fresh.checkpointCases,[source.checkpointCases[0]])
 assert.ok(!JSON.stringify(fresh).includes('old-B-partial'));assert.ok(!JSON.stringify(fresh).includes('old-scheduled-publication'))
 fresh.actors.teacher.username='changed';fresh.resources.sjt.asset.assetId='changed';fresh.sjtResponses[0].answer='changed'
 fresh.products.A.items[0].id='changed';fresh.cases.A.wholeSubmissionBody.units[0].answers[0].value='changed'
 fresh.restoreCases[0].attemptId='changed';fresh.checkpointCases[0].state='PAYLOAD';assert.deepEqual(source,original)
})

test('inherited identity permits only separately verified new SJT release/grant and form fields',()=>{
 const {original,f}=freshCase(),before=copy(original);f.products.scheduled={id:'new-draft'};f.resources.form='new-form'
 assert.deepEqual(inheritedContinuationIdentity(f),inheritedContinuationIdentity(original));assert.deepEqual(original,before)
 for(const mutate of [x=>x.resources.scale='other',x=>x.resources.cognitive='other',x=>x.resources.sjt.asset.assetId='other',
  x=>x.actors.student.id='other',x=>x.sjtResponses[0].answer='other',x=>x.cases.A.children.scaleId='other',
  x=>x.cases.A.wholeSubmissionBody.units[0].answers[0].value='other']){
  const bad=copy(f);mutate(bad);assert.notDeepEqual(inheritedContinuationIdentity(bad),inheritedContinuationIdentity(original))
 }
 for(const mutate of [x=>x.checkpointCases[0].state='PAYLOAD',x=>x.restoreCases[0].attemptId='other',x=>x.cases.A.wholeSubmissionBody.submissionId='replacement']){
  const bad=copy(original);mutate(bad);assert.throws(()=>inheritContinuationFixture(bad))
 }
})

test('new grant admission accepts exactly 1200 seconds at PostgreSQL clock and never consults client time',t=>{
 const {f,current,issued}=freshCase();current.pgNow=iso(issued.pgNow,NEW_GRANT_LIFETIME_MS-MINIMUM_GRANT_REMAINING_MS)
 const before=copy(current);t.mock.method(Date,'now',()=>{throw new Error('Client clock must not be used')})
 const result=assertContinuationGrantAdmission(f,current,issued)
 assert.equal(result.remainingMs,1200000);assert.equal(result.requestedLifetimeMs,3600000);assert.deepEqual(current,before)
 const tooLate=copy(current);tooLate.pgNow=iso(current.pgNow,1);blocked(()=>assertContinuationGrantAdmission(f,tooLate,issued))
})

test('old grant may expire, but scalar identity, validity, revocation and exact release bindings cannot change',()=>{
 const f=fixture(),expired=admission(f,iso(until,1));assert.equal(assertContinuationSourceAdmission(f,expired).oldGrantMayExpire,true)
 const reordered=admission(f),reverse=value=>Object.fromEntries(Object.entries(value).reverse())
 reordered.draft.template.display.scenes[0].image.asset=reverse(reordered.draft.template.display.scenes[0].image.asset)
 reordered.draft.template.goldenCases[0].responses=reordered.draft.template.goldenCases[0].responses.map(reverse)
 assert.equal(assertContinuationSourceAdmission(f,reordered).passed,true,'JSONB key order cannot invalidate unchanged image or scientific responses')
 for(const mutate of [s=>s.pgNow='invalid',s=>s.pgNow='2026-10-19T09:26:56.724Z',s=>s.grant=null,
  s=>s.grant.id='new-grant',s=>s.grant.expiresAt=iso(until,1),s=>s.grant.validFrom='2026-10-19T09:26:55.725Z',
  s=>s.grant.status='REVOKED',s=>s.grant.version=2,s=>s.grant.revokedAt=now,s=>s.grant.granteeTeacherId='outsider',
  s=>s.grant.courseId='other',s=>s.grant.permission='ADAPT',s=>s.grant.releaseId='other',s=>s.grant.definitionHash='c'.repeat(64),
  s=>s.release=null,s=>s.release.status='RETIRED',s=>s.release.authorizationPolicy=null,s=>s.release.contentDigest='c'.repeat(64)]){
  const current=admission(f);mutate(current);blocked(()=>assertContinuationSourceAdmission(f,current))
 }
 const missing=copy(f);delete missing.resources.grant.version;blocked(()=>assertContinuationSourceAdmission(missing,admission(f)))
})

test('source admission rejects inactive actors/course/enrollment, changed author template and invalid shared image',()=>{
 const f=fixture()
 for(const mutate of [s=>s.actors.teacher=null,s=>s.actors.teacher.id='other',s=>s.actors.teacher.username='other',
  s=>s.actors.teacher.accountDomain='LEGACY',s=>s.actors.teacher.teacherApproved=false,s=>s.actors.teacher.isFrozen=true,
  s=>s.actors.student.isActive=false,s=>s.actors.student.mustChangePassword=true,s=>s.actors.student.expiresAt=now,
  s=>s.actors.admin.role='TEACHER',s=>s.actors.admin.isActive=false,s=>s.actors.otherTeacher.teacherApproved=false,s=>s.actors.outsider.isFrozen=true,
  s=>s.course.creatorId='other',s=>s.course.status='ENDED',s=>s.course.isLibrary=true,s=>s.course.endedAt=now,
  s=>s.enrollment=null,s=>s.enrollment.status='PENDING',s=>s.enrollment.studentId='outsider',
  s=>s.asset.ownerId='other',s=>s.asset.deletedAt=now,s=>s.asset.sha256='f'.repeat(64),s=>s.asset.scopeId='other',
  s=>s.draft.status='DRAFT',s=>s.draft.ownerId='other',s=>s.release.reviewerId='teacher',
  s=>s.draft.template.display.scenes[0].image.asset.assetId='other',s=>s.draft.template.goldenCases[0].responses=[]]){
  const current=admission(f);mutate(current);blocked(()=>assertContinuationSourceAdmission(f,current))
 }
})

test('real admission reader reads full old grant/release/draft/asset rows, all actors, and server clock last in read-only transaction',async()=>{
 const f=fixture(),current=admission(f),calls=[]
 for(const key of ['validFrom','expiresAt','createdAt'])current.grant[key]=new Date(current.grant[key])
 const find=(kind,value)=>({async findUnique(args){calls.push({kind,args});return copy(value)}})
 const tx={async $executeRawUnsafe(sql){calls.push(sql)},async $queryRawUnsafe(sql){calls.push(sql);return [{now:new Date(now)}]},
  sjtReleaseGrant:find('grant',current.grant),sjtAuthorRelease:find('release',current.release),sjtAuthorDraft:find('draft',current.draft),storedAsset:find('asset',current.asset),
  user:{async findUnique(args){calls.push({kind:'user',args});return copy(current.actors[args.where.id])}},course:find('course',current.course),courseStudent:find('enrollment',current.enrollment)}
 const prisma={async $transaction(fn,options){assert.deepEqual(options,{isolationLevel:'RepeatableRead',maxWait:10000,timeout:30000});return fn(tx)}}
 const observed=await readContinuationAdmission(prisma,f)
 assert.equal(calls[0],'SET TRANSACTION READ ONLY');assert.equal(calls.at(-1),'SELECT clock_timestamp() AS now')
 for(const [kind,id] of [['grant','formal-grant'],['release','release'],['draft','old-sjt-draft'],['asset','asset']])
  assert.deepEqual(calls.find(c=>c.kind===kind).args,{where:{id}})
 assert.deepEqual(calls.find(c=>c.kind==='enrollment').args.where,{courseId_studentId:{courseId:'course',studentId:'student'}})
 assert.equal(calls.filter(c=>typeof c==='object').length,11);assert.equal(calls.filter(c=>c.kind==='user').length,5)
 assert.equal(observed.pgNow.toISOString(),now);assert.equal(assertContinuationSourceAdmission(f,observed).passed,true)
 const changed=copy(observed);changed.asset.updatedAt='changed';assert.notDeepEqual(protectedContinuationRows(changed),protectedContinuationRows(observed))
})

test('actual adapter performs one formal fresh-SJT API sequence then distinct four-tool draft, preserving all inherited bytes',async()=>{
 const s=setup(),originals=new Map([...s.files].map(([file,bytes])=>[file,Buffer.from(bytes)])),result=await runContinuationPrepare(s.dependencies)
 assert.equal(s.h.error,undefined);assert.equal(result.passed,true);assert.deepEqual(s.calls[0],{phase:'continuation-prepare',budget:300})
 assert.ok(s.calls.indexOf('old-admission')<s.calls.indexOf('actors'));assert.ok(s.calls.indexOf('new-admission')<s.calls.indexOf('draftProduct'))
 const fresh=s.writes.find(w=>w.name==='c25-fixture-private.json').value
 assert.equal(fresh.products.scheduled.id,s.draft.id);assert.notEqual(fresh.products.scheduled.id,s.f.products.scheduled.id)
 assert.equal(fresh.resources.form,'new-form');assert.deepEqual(Object.keys(fresh.cases),['A']);assert.equal(fresh.schedule,undefined)
 assert.deepEqual(inheritedContinuationIdentity(fresh),inheritedContinuationIdentity(s.f));assert.equal(fresh.resources.sjt.release.id,'new-release')
 assert.equal(fresh.resources.grant.id,'new-grant');assert.deepEqual(fresh.resources.sjt.asset,s.f.resources.sjt.asset)
 assert.deepEqual(result.fixture.inheritedCaseNames,['A']);assert.equal(result.inheritance.prepareRerun,false)
 assert.equal(result.sjtContinuation.strategy,'FRESH_FORMAL_RELEASE');assert.equal(result.sjtContinuation.oldRowsUnchanged,true)
 assert.equal(result.sjtContinuation.old.grantId,'formal-grant');assert.equal(result.sjtContinuation.fresh.grantId,'new-grant')
 assert.equal(s.grantRequest.validFrom,iso(s.issueNow,-60000));assert.equal(s.grantRequest.expiresAt,iso(s.issueNow,NEW_GRANT_LIFETIME_MS))
 for(const [file,bytes] of originals){assert.ok(s.files.get(file).equals(bytes));assert.equal(result.inheritance.inputs[path.basename(file)].sha256,sha(bytes))}
 assert.deepEqual(s.writes.map(w=>w.name),['c25-continuation-admission-private.json','c25-continuation-new-sjt-private.json','c25-continuation-old-sjt-after-private.json','c25-fixture-private.json'])
 const requests=s.calls.filter(c=>c&&typeof c==='object'&&c.route)
 assert.deepEqual(requests.map(c=>[c.actor,c.method,c.route]),[
  ['teacher','POST','/situational/authoring/online/drafts'],['teacher','POST','/situational/authoring/drafts/new-sjt-draft/request-review'],
  ['admin','POST','/situational/authoring/drafts/new-sjt-draft/review'],['teacher','GET','/situational/authoring/drafts/new-sjt-draft'],
  ['admin','POST','/situational/authoring/releases/new-release/grants'],['teacher','POST','/questionnaire-products']])
})

test('insufficient new formal grant remaining time blocks the scheduled draft without a second grant or retry',async()=>{
 const s=setup();s.newClockDelta=NEW_GRANT_LIFETIME_MS-MINIMUM_GRANT_REMAINING_MS+1
 const result=await runContinuationPrepare(s.dependencies)
 assert.equal(result.passed,false);assert.equal(s.h.error.code,'C25_CONTINUATION_ADMISSION_BLOCKED');assert.match(s.h.error.message,/less than 1200 seconds/)
 assert.ok(!s.calls.includes('draftProduct'));assert.ok(!s.writes.some(w=>w.name==='c25-fixture-private.json'))
 assert.equal(s.calls.filter(c=>c&&typeof c==='object'&&c.route?.endsWith('/grants')).length,1)
})

test('changed original grant or inactive inherited scope blocks before any login or API write',async()=>{
 for(const mutate of [s=>s.current.grant.expiresAt=iso(until,1),s=>s.current.grant.id='replacement',s=>s.current.enrollment.status='PENDING',s=>s.current.asset.ownerId='other']){
  const s=setup();mutate(s);await runContinuationPrepare(s.dependencies)
  assert.equal(s.result.passed,false);assert.equal(s.h.error.code,'C25_CONTINUATION_ADMISSION_BLOCKED')
  assert.deepEqual(s.logins,[]);assert.ok(!s.calls.some(c=>c&&typeof c==='object'&&c.route))
 }
})

test('adapter refuses old publication/form reuse, incorrect fresh API/DB evidence and changes to any old SJT full row',async()=>{
 for(const mutate of [s=>s.draft.id=s.f.products.scheduled.id,s=>s.draft.id=s.f.products.A.id,
  s=>s.draft.formSections[0].id=s.f.resources.form,s=>s.draft.status='PUBLISHED',s=>s.draft.items.pop(),s=>s.dbRow.publishedAt=now,
  s=>s.newMutation=x=>x.release.definitionHash='f'.repeat(64),
  ...['grant','release','draft','asset'].map(key=>s=>{s.after=copy(s.current);s.after[key].createdAt='changed'}),
  s=>{const original=s.dependencies.draftProduct;s.dependencies.draftProduct=async(...args)=>{const p=await original(...args);args[1].actors.teacher.username='changed';return p}},
  s=>{const original=s.dependencies.draftProduct;s.dependencies.draftProduct=async(...args)=>{const p=await original(...args);s.put('c25-prepare-result.json',{passed:true,rewritten:true});return p}}]){
  const s=setup();mutate(s);await runContinuationPrepare(s.dependencies)
  assert.equal(s.result.passed,false);assert.ok(s.h.error);assert.ok(!s.writes.some(w=>w.name==='c25-fixture-private.json'))
 }
})

test('adapter refuses failed or mismatched prepare evidence before importing runtime or logging in',async()=>{
 for(const change of [p=>p.passed=false,p=>p.phase='scheduled',p=>p.fixture.immediateAttemptId='other',p=>p.fixture.scheduledDraftId='other']){
  const s=setup(),file=path.join(s.state,'c25-prepare-result.json'),p=JSON.parse(s.files.get(file));change(p);s.put('c25-prepare-result.json',p)
  await runContinuationPrepare(s.dependencies);assert.equal(s.result.passed,false);assert.ok(!s.calls.includes('runtime'));assert.deepEqual(s.logins,[])
 }
})

test('adapter never overwrites an existing continuation result/journal/fixture',async()=>{
 for(const name of ['c25-fixture-private.json','c25-continuation-prepare-result.json','c25-continuation-prepare-http-private.jsonl']){
  const s=setup();s.put(name,{existing:true});await assert.rejects(runContinuationPrepare(s.dependencies),/output already exists/)
  assert.deepEqual(s.calls,[]);assert.deepEqual(s.writes,[])
 }
})

test('already expired old grant uses the same single new-resource branch and remains unchanged',async()=>{
 const s=setup();s.current.pgNow=iso(until,1);s.issueNow=s.current.pgNow
 const before=protectedContinuationRows(s.current);await runContinuationPrepare(s.dependencies)
 assert.equal(s.result.passed,true);assert.deepEqual(protectedContinuationRows(s.current),before)
 assert.equal(s.f.resources.grant.expiresAt,until);assert.equal(s.result.sjtContinuation.strategy,'FRESH_FORMAL_RELEASE')
 assert.equal(s.calls.filter(c=>c&&typeof c==='object'&&c.route?.endsWith('/grants')).length,1)
 assert.ok(s.result.grantAdmission.remainingMs>=1200000)
})

test('new grant must bind distinct release/draft identities and the exact bounded issuance request',()=>{
 for(const mutate of [x=>x.issued.oldReleaseId=x.current.release.id,x=>x.issued.oldGrantId=x.current.grant.id,
  x=>x.issued.draftId='other',x=>x.issued.instrumentKey='other',x=>x.issued.pgNow=iso(now,1),
  x=>{x.f.resources.grant.expiresAt=iso(now,NEW_GRANT_LIFETIME_MS+1);x.current.grant.expiresAt=x.f.resources.grant.expiresAt},
  x=>{x.f.resources.grant.grantorId='teacher';x.current.grant.grantorId='teacher'},x=>x.current.pgNow=iso(now,-1)]){
  const x=freshCase();mutate(x);blocked(()=>assertContinuationGrantAdmission(x.f,x.current,x.issued))
 }
})
