'use strict'
// Actions-only synthetic source/Run producer and post-browser persisted-fact reader.
// Never inserts a child session, answer, accepted FINAL, snapshot or result.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {randomUUID,createHash}=require('node:crypto'),{spawnSync,spawn}=require('node:child_process'),{pathToFileURL}=require('node:url')
const base=require('./school-teacher-fixture.cjs')
let stage='bootstrap',privateRoot
const app=name=>require(path.join(base.backend,'dist',name))
const sha=value=>createHash('sha256').update(value).digest('hex')
const origins={SCHOOL:'https://school.eduk12.top',TEACHER:'https://teacher.eduk12.top'}
function origin(product,env=process.env){const value=env['PR363_'+product+'_ORIGIN']||origins[product];const url=new URL(value);assert.equal(url.protocol,'https:');assert.equal(url.port,'','Use the actual production canonical origin, no port rewrite');assert.equal(url.hostname,new URL(origins[product]).hostname);assert.equal(url.origin,value);return value}
async function artifact(kind){
 const dir=kind==='backend'?path.join(base.backend,'dist'):fs.realpathSync(process.env.SCHOOL_TEACHER_FRONTEND_DIST||path.join(base.repo,'server-version/frontend/dist'))
 const tools=await import(pathToFileURL(path.join(base.repo,'.github/scripts/ci-artifact.mjs')).href)
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'ci-build-manifest.json'),'utf8'))
 tools.verifyManifest(manifest,{schemaVersion:1,kind,sha:base.sourceIdentity().head,runId:process.env.GITHUB_RUN_ID,lockDigest:sha(fs.readFileSync(path.join(base.repo,'server-version',kind,'package-lock.json')))},tools.treeDigest(dir))
 return manifest
}
function assertCases(cases){assert.ok(Array.isArray(cases));assert.deepEqual(cases.map(c=>c.product+':'+c.mode).sort(),['SCHOOL:IMMEDIATE','TEACHER:IMMEDIATE','TEACHER:SCHEDULED']);assert.equal(new Set(cases.map(c=>c.executionId)).size,3);assert.ok(cases.every(c=>typeof c.executionId==='string'&&typeof c.runtimeId==='string'&&c.title?.startsWith('PR363 ')))}
function privateFile(root,name,value){assert.equal(path.basename(name),name);fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600})}
function runtime(fixture){Object.assign(process.env,fixture.secrets,{DATABASE_URL:fixture.runtimeUrl,DATABASE_URL_RUNTIME:fixture.runtimeUrl,NODE_ENV:'test',BACKGROUND_WORKERS_ENABLED:'false',COGNITIVE_MODULE_ENABLED:'true',HUITEACHER_WORKSPACE_ENABLED:'true'})}
function principal(u){return {userId:u.id,username:u.username,role:u.role,platformRole:u.platformRole,accountDomain:u.accountDomain,tokenVersion:u.tokenVersion,mustChangePassword:u.mustChangePassword}}
async function seed(){
 const root=base.guard();privateRoot=root;stage='artifact-identity';await artifact('backend');await artifact('frontend')
 assert.equal(fs.existsSync(path.join(root,'fixture.json')),false,'Use a fresh isolated service; no seeded-attempt retry')
 const seeded=spawnSync(process.execPath,[path.join(__dirname,'school-teacher-fixture.cjs'),'seed'],{env:process.env,encoding:'utf8',maxBuffer:1024*1024})
 if(seeded.status!==0){if(fs.existsSync(root))fs.writeFileSync(path.join(root,'pr363-base-seed.log'),seeded.stdout+'\n'+seeded.stderr,{mode:0o600,flag:'wx'});throw new Error('BASE_IDENTITY_SEED_FAILED')}
 const {value:fixture}=base.readFixture();const ownerUrl=process.env.DATABASE_URL;runtime(fixture)
 const {PrismaClient}=require('../backend/node_modules/@prisma/client'),owner=new PrismaClient({datasources:{db:{url:ownerUrl}}})
 try{
  const passwordHash=await app('utils/password').hashPassword('Synthetic!'+randomUUID())
  const system=async label=>owner.user.create({data:{username:'pr363_'+label+'_'+randomUUID(),passwordHash,accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  const issuer=await system('issuer'),reviewer=await system('reviewer'),cases=[]
  for(const [product,mode] of [['SCHOOL','IMMEDIATE'],['TEACHER','IMMEDIATE'],['TEACHER','SCHEDULED']]){
   const f=fixture.products[product],author=await owner.user.findUniqueOrThrow({where:{id:f.author.id}}),actor=principal(author)
   stage='source-'+product+'-'+mode
   const title='PR363 '+product+' '+mode+' '+fixture.suffix,feedbackPolicy=mode==='IMMEDIATE'?{schemaVersion:1,mode}:{schemaVersion:1,mode,releaseAt:new Date(Date.now()+86400000).toISOString()}
   const delivery=await createDelivery(owner,product,{id:f.organizationId},issuer,reviewer,'BUNDLE',false,true,feedbackPolicy,false,false,author,title)
   stage='workflow-'+product+'-'+mode
   let workflowId,runId
   if(product==='SCHOOL'){
    const activities=app('modules/campus/activity.service'),scope={actor,organizationId:f.organizationId}
    const activity=await activities.createCampusActivity({...scope,title,purpose:'STUDENT_WELLBEING'});workflowId=activity.id
    await app('modules/campus/activity.allocation').allocateCampusActivityParticipants({...scope,courseId:workflowId,classUnitIds:[f.classUnitId],requestKey:randomUUID(),expectedVersion:1})
    const run=await app('modules/campus/activity.runs').createCampusActivityRunDraft({...scope,courseId:workflowId,name:title});runId=run.id
   }else{
    const service=app('modules/huiteacher/evaluation.service'),scope={organizationId:f.organizationId,actorUserId:author.id}
    const target=await service.createHuiteacherTarget({...scope,kind:'ORGANIZATION',name:title})
    const event=await service.createHuiteacherEvent({...scope,targetId:target.id,kind:'ASSESSMENT',title});workflowId=event.id
    runId=(await service.createHuiteacherEventRunDraft({...scope,eventId:workflowId,name:title})).runId
   }
   const db=app('config/database').prisma,a=delivery.entry.applicability
   const [{version}]=await db.$queryRaw`SELECT version FROM assessment_runs WHERE id=${runId}`
   await app('modules/assessment-run/repository').addAssessmentRunTrackDraft({organizationId:f.organizationId,runId,actorUserId:author.id,expectedRunId:runId,expectedVersion:version,
    educationWorkflow:{product,id:workflowId},resource:{family:'BUNDLE',key:delivery.resourceKey,version:'1.0.0'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.participantMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.participantMembershipId]},requestedPolicy:{subjectRoles:a.subjectRoles,respondentRoles:a.respondentRoles,relationshipKinds:a.relationshipKinds,perspectives:a.perspectives,analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents}})
   if(product==='SCHOOL'){
    const service=app('modules/campus/activity.service'),scope={actor,organizationId:f.organizationId,courseId:workflowId},detail=await service.readCampusActivity(scope)
    const submitted=await service.changeCampusActivityStatus({...scope,action:'SUBMIT',expectedVersion:detail.version})
    await service.changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})
   }else await app('modules/huiteacher/evaluation.service').transitionHuiteacherEvent({organizationId:f.organizationId,actorUserId:author.id,eventId:workflowId,action:'OPEN',expectedVersion:1})
   const [current]=await db.$queryRaw`SELECT version FROM assessment_runs WHERE id=${runId}`
   await app('modules/assessment-run/publish').publishAssessmentRun({organizationId:f.organizationId,runId,actorUserId:author.id,expectedVersion:current.version})
   const [execution]=await db.$queryRaw`SELECT e.id,e.status,e.runtime_binding_ref FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id WHERE e.run_id=${runId} AND r.user_id=${f.participant.id}`
   assert.equal(execution.status,'ASSIGNED');assert.equal(execution.runtime_binding_ref,null)
   assert.equal(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:delivery.runtimeId}}),0)
   cases.push({product,mode,title,organizationId:f.organizationId,workflowId,runId,executionId:execution.id,resourceKey:delivery.resourceKey,runtimeId:delivery.runtimeId,feedbackPolicy})
  }
  assertCases(cases);privateFile(root,'pr363.json',{schemaVersion:1,identity:fixture.identity,cases})
 }finally{await owner.$disconnect();await app('config/database').prisma.$disconnect();await app('services/cacheService').cacheService.close();await app('config/queue').closeQueues()}
}
function exactMetric(reportMetric,fact){assert.equal(typeof reportMetric.metricKey,'string');const saved=fact.core.metrics.find(m=>m.key===reportMetric.metricKey);assert.ok(saved,'Exact metric key missing');assert.equal(reportMetric.value,saved.value)}
async function verify(){
 const {root,value:fixture}=base.readFixture(),data=JSON.parse(fs.readFileSync(path.join(root,'pr363.json'))),observed=JSON.parse(fs.readFileSync(path.join(root,'pr363-observed.json')))
 assertCases(data.cases);assert.equal(observed.length,3);runtime(fixture);const db=app('config/database').prisma
 try{for(const c of data.cases){
  const o=observed.find(x=>x.executionId===c.executionId);assert.ok(o)
  const [execution]=await db.$queryRaw`SELECT status,runtime_binding_ref FROM assessment_run_executions WHERE id=${c.executionId}`;assert.equal(execution.status,'COMPLETED')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:execution.runtime_binding_ref}});assert.equal(parent.status,'COMPLETED');assert.equal(parent.compositeAssessmentId,c.runtimeId)
  assert.equal(o.parentId,parent.id);assert.equal(o.resumedParentId,parent.id)
  if(c.mode==='SCHEDULED'){assert.equal(o.report.state,'WITHHELD');assert.equal(o.report.releaseAt,c.feedbackPolicy.releaseAt);assert.equal(o.report.reports,undefined);continue}
  assert.equal(o.report.state,'READY');assert.equal(o.report.reports.length,2)
  for(const unit of o.report.reports){assert.equal(unit.status,'READY');const row=await db.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:parent.id,slotKey:{endsWith:unit.itemId},attemptEpoch:parent.attemptEpoch}});const [fact]=await app('modules/assessment-runtime/compact-assessment-storage').loadStoredCanonicalUnitResults([row.canonicalResultEncrypted]);for(const m of unit.rendered.blocks.filter(b=>b.type==='METRIC'))exactMetric(m,fact)}
 }}finally{await db.$disconnect();await app('services/cacheService').cacheService.close();await app('config/queue').closeQueues()}
}
async function serveBackend(product){
 assert.ok(['SCHOOL','TEACHER'].includes(product));const {root,value}=base.readFixture();await artifact('backend')
 const port=Number(process.env['PR363_BACKEND_'+product+'_PORT']);assert.ok(Number.isSafeInteger(port)&&port>=1024&&port<=65535)
 const redis=new URL(process.env.REDIS_URL);assert.equal(redis.protocol,'redis:');assert.ok(['127.0.0.1','localhost'].includes(redis.hostname))
 const env={...require('./school-teacher-browser.cjs').backendEnvironment(value,root,port,redis.href,product),CORS_ORIGIN:origin(product),DATABASE_URL_RUNTIME:value.runtimeUrl,COGNITIVE_MODULE_ENABLED:'true',ASSESSMENT_REPORT_ASYNC_ENABLED:'false'}
 const log=fs.openSync(path.join(root,'pr363-backend-'+product+'.log'),'wx',0o600)
 const child=spawn(process.execPath,[path.join(base.backend,'dist/index.js')],{cwd:base.backend,env,stdio:['ignore',log,log]})
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal))
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('BACKEND_EXIT_'+code)))})
}
module.exports={origin,artifact,exactMetric,assertCases,seed,verify,privateFile,serveBackend}
if(require.main===module)Promise.resolve().then(()=>{assert.ok(['seed','verify','serve-backend'].includes(process.argv[2]));return process.argv[2]==='seed'?seed():process.argv[2]==='verify'?verify():serveBackend(process.argv[3])}).catch(error=>{if(privateRoot&&fs.existsSync(privateRoot))fs.writeFileSync(path.join(privateRoot,'pr363-failure.log'),String(error?.stack||error),{mode:0o600});console.error('PR363_FIXTURE_FAILED '+JSON.stringify({stage,errorName:error?.name,code:/^[A-Z0-9_]{2,80}$/.test(error?.code||'')?error.code:null,digest:sha(String(error))}));process.exitCode=1})
async function createDelivery(owner, product, org, issuer, reviewer, family, consentRequired = false, withReports = false, feedbackPolicy = { schemaVersion: 1, mode: 'IMMEDIATE' }, formOnly = false, completionOnly = false, author, caseTitle) {
    const resourceId = randomUUID(), resourceKey = `education-assessment:${product}:${org.id}:${resourceId}`;
    const { getContentRelease, publishContentRelease } = app('modules/measurement-content/repository');
    const { DECLARATIVE_REPORT_GENERATOR } = app('modules/measurement-content/report-renderer');
    const { publishAssignmentMeasurementRelease } = app('modules/cognitive/assignment-measurement-release');
    const { freezeAssignmentProfile } = app('modules/cognitive/profile-freeze');
    const { requireCognitiveRegistryEntry } = app('modules/cognitive/cognitive.registry');
    const { formQuestionSchema } = app('modules/assessment-core/form/definition');
    const { prepareTrainingContentSnapshot } = app('modules/composite/training-content-binding');
    const { resolveCompositeSituationalItems } = app('modules/composite/composite.service');
    const { readEducationAssessmentDeliveryIdentity } = app('modules/education-tools/assessment-resource.repository');
    const { issueAdminContentRoot } = app('modules/measurement-content/admin-authority.service');
    const producer = app('modules/education-tools/assessment-resource.service');
    const { createSjtDraft, requestSjtReview, reviewSjtDraft } = app('modules/situational/authoring/service');
    const testDisclosure = () => ({ schemaVersion: 1, policyKey: 'pr363-explicit-self', minimumRespondents: null, audiences: Object.fromEntries(app('modules/assessment-policy/result-disclosure').resultAudiences.map(a => [a, { mode: 'NONE', metricKeys: [], longitudinalMetricKeys: [] }])) });
    const source = await owner.compositeAssessment.create({ data: { code: 'pr363-source-' + randomUUID(), name: 'Synthetic actual source', createdBy: issuer.id,
            status: 'PUBLISHED', publishedAt: new Date(), publicEnabled: false, copyable: false } });
    const runtime = source;
    if (family !== 'SITUATIONAL' && !formOnly) {
        const config = await owner.cognitiveTestConfig.create({ data: { testType: 'reaction', configVersion: 'pr363-' + randomUUID(), name: 'Synthetic reaction runtime parameters', status: 'PUBLISHED',
                engineVersion: '1.0.0', scoringVersion: '1.1.0', accessPolicy: 'OPEN', publishedAt: new Date(), config: { totalTrials: 5, foreperiodMinMs: 700, foreperiodMaxMs: 1500, timeoutMs: 2000, readyDurationMs: 1000,
                    report: { reportVersion: '1.1.0', referenceMode: 'none' } } } });
        const { resolvedConfig: _resolved, ...frozen } = freezeAssignmentProfile({ entry: requireCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion), baseConfig: config.config, profile: 'experience' });
        const assignment = await owner.cognitiveAssignment.create({ data: { configId: config.id, createdBy: issuer.id, title: 'Synthetic reaction assignment', status: 'PUBLISHED',
                publishedAt: new Date(), maxAttempts: 10, listedStandalone: false, ...frozen } });
        await owner.$transaction(tx => publishAssignmentMeasurementRelease(tx, issuer.id, assignment.id));
        await owner.compositeAssessmentItem.create({ data: { compositeAssessmentId: runtime.id, type: 'COGNITIVE', position: 0, required: true, cognitiveAssignmentId: assignment.id } });
    }
    if (family !== 'COGNITIVE' && !formOnly) {
        const template = JSON.parse(JSON.stringify(require('./pr363-native-template.json')));
        Object.assign(template, { instrumentKey: 'pr363-native-' + randomUUID(), respondentType: product === 'TEACHER' ? 'teacher_self_report' : 'student_self_report', title: caseTitle + ' native' });
        const draft = await createSjtDraft({ userId: author.id, admin: false }, template);
        await requestSjtReview({ userId: author.id, admin: false }, draft.id, draft.revision, draft.contentDigest);
        await reviewSjtDraft({ userId: reviewer.id, admin: true }, draft.id, draft.revision, draft.contentDigest, true, 'Independent synthetic native fixture review only');
        const release = await owner.sjtAuthorRelease.findFirstOrThrow({ where: { sourceDraftId: draft.id } });
        await owner.compositeAssessmentItem.create({ data: { compositeAssessmentId: runtime.id, type: 'SITUATIONAL', position: 1, required: true, situationalInstrumentKey: release.instrumentKey, situationalInstrumentVersion: release.instrumentVersion } });
    }
    if (family === 'BUNDLE') {
        const section = await owner.compositeFormSection.create({ data: { compositeAssessmentId: runtime.id, title: 'Synthetic optional note', position: 2 } });
        await owner.compositeAssessmentItem.create({ data: { compositeAssessmentId: runtime.id, type: 'FORM', position: 2, required: true, formSectionId: section.id, formSectionPosition: 0,
                formType: 'SHORT_TEXT', formLabel: 'Synthetic note', formDefinition: formQuestionSchema.parse({ itemKey: 'synthetic_note', type: 'SHORT_TEXT', prompt: 'Synthetic note', required: true, options: [], rows: [], maxLength: 100 }) } });
    }
    const loaded = await owner.compositeAssessment.findUniqueOrThrow({ where: { id: runtime.id }, include: { items: { include: { scale: true, cognitiveAssignment: { include: { config: true } } } }, formSections: { include: { items: true } } } });
    const prepared = await owner.$transaction(async (tx) => prepareTrainingContentSnapshot(tx, loaded, await resolveCompositeSituationalItems(loaded.items, tx, true)));
    await owner.compositeAssessment.update({ where: { id: source.id }, data: { trainingContentSnapshot: prepared.snapshot, trainingContentSnapshotHash: prepared.snapshotHash } });
    const proof = { tokenVersion: 0, adminSessionId: 'synthetic-strong-admin-proof', adminVerifiedAt: Date.now() / 1000 };
    const resourceIds = [source.id, ...prepared.snapshot.units.map(unit => unit.measurement.releaseId)];
    const distribution = await issueAdminContentRoot(issuer.id, proof, { requestId: randomUUID(), expectedVersion: 0,
        reason: 'Explicit target redistribution of synthetic disposable test content only', grant: { subjectId: issuer.id,
            scope: { product, scopeKind: 'ORGANIZATION', scopeId: org.id, resourceKind: 'material', resourceKeys: resourceIds },
            capabilities: ['material.distribute'], delegableCapabilities: [], remainingDelegationDepth: 0,
            validFrom: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString() } });
    const context = (actor) => ({ product, organizationId: org.id, principal: { userId: actor.id, username: actor.username,
            role: 'ADMIN', accountDomain: actor.accountDomain, platformRole: 'SYSTEM_ADMIN', mustChangePassword: false, ...proof } });
    const licenses = resourceIds.map(resourceId => ({ resourceId, grantId: distribution.grantId }));
    const preparation = await producer.prepareEducationAssessment(context(issuer), { resourceId, sourceCompositeId: source.id, title: caseTitle, family, licenses });
    const reports = [], metricKeys = [];
    if (withReports)
        for (const unit of preparation.units) {
            const measurement = await owner.$transaction(tx => getContentRelease(tx, unit.measurement.releaseId));
            if (!measurement || measurement.layer !== 'MEASUREMENT')
                throw new Error('Actual C release required');
            const metric = measurement.content.metrics[0].metricKey;
            metricKeys.push(metric);
            const report = await owner.$transaction(tx => publishContentRelease(tx, { family: unit.family, layer: 'REPORT', key: 'pr363-report-' + randomUUID(), version: '1.0.0',
                scope: { kind: 'PRIVATE', product, ownerId: issuer.id, resourceId: preparation.runtimeCompositeId }, sourceReleaseId: null, provenance: {}, assetRefs: [],
                content: { projectionVersion: 1, measurements: [{ releaseId: measurement.releaseId, contentHash: measurement.contentHash }], metricKeys: [metric],
                    audience: product === 'TEACHER' ? 'teacher' : 'student', language: 'zh-CN', generatorVersion: DECLARATIVE_REPORT_GENERATOR,
                    template: { title: 'Synthetic frozen report', blocks: [{ type: 'TEXT', text: 'Synthetic software verification only' }, { type: 'METRIC', metricKey: metric, display: 'RAW' }] } } }, issuer.id));
            const grant = await issueAdminContentRoot(issuer.id, proof, { requestId: randomUUID(), expectedVersion: 0, reason: 'Explicit synthetic report distribution',
                grant: { subjectId: issuer.id, scope: { product, scopeKind: 'ORGANIZATION', scopeId: org.id, resourceKind: 'material', resourceKeys: [report.releaseId] }, capabilities: ['material.distribute'],
                    delegableCapabilities: [], remainingDelegationDepth: 0, validFrom: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString() } });
            licenses.push({ resourceId: report.releaseId, grantId: grant.grantId });
            reports.push({ itemId: unit.itemId, releaseId: report.releaseId });
        }
    const disclosure = { ...testDisclosure(), ...(consentRequired ? { policyKey: 'observer_private_respondent_v1' } : {}) };
    if (completionOnly)
        disclosure.audiences.RESPONDENT = { mode: 'COMPLETION_ONLY', metricKeys: [], longitudinalMetricKeys: [] };
    if (withReports)
        disclosure.audiences.RESPONDENT = { mode: 'INDIVIDUAL_SUMMARY', metricKeys: [...new Set(metricKeys)], longitudinalMetricKeys: [] };
    const registered = await producer.registerEducationAssessment(context(issuer), resourceId, { expectedPreparationHash: preparation.preparationHash,
        disclosure, references: { schemaVersion: 1, units: [] }, reports, licenses, ...(feedbackPolicy ? { feedbackPolicy } : {}) });
    const reviewed = await producer.transitionEducationAssessment(context(reviewer), resourceId, 'REVIEW', { expectedEntryHash: registered.entryHash, reason: 'Independent synthetic runtime fixture review' });
    await producer.transitionEducationAssessment(context(reviewer), resourceId, 'PUBLISH', { expectedEntryHash: reviewed.entryHash, reason: 'Publish synthetic runtime fixture only' });
    const identity = await owner.$transaction(tx => readEducationAssessmentDeliveryIdentity(tx, { resourceKey, version: '1.0.0', purpose: 'NEW_USE' }));
    const entry = identity.entry, origin = identity.origin;
    return { resourceId, resourceKey, entry, origin, distribution, proof, runtimeId: preparation.runtimeCompositeId, reports };
}
