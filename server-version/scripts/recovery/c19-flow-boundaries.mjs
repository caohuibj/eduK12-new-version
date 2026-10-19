/** C19 supplemental production HTTP producer. Only new synthetic fixtures are
 * mutated. Existing accepted FINALs, grants, resources and producer files are
 * never replayed, rewritten or repaired. ON and OFF are separate processes on
 * the same private PG/Redis clone; their lifecycle/lock belongs to the launcher.
 *
 * status.boundariesRuntimes[mode] = {apiUrl,apiPid,runtimeFile,runtimeSha256}.
 * runtimeFile is a private basename containing the exact API environment.
 * OFF also requires boundariesOnResultSha256 and boundariesOnPrivateSha256.
 * A failed phase is immutable: checkpoints record every issued FINAL before
 * transport and its accepted result immediately afterwards. Continuation must
 * be a distinct reviewed producer, never an automatic resubmission.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {harness,prisma,require,backend,children,candidateProof,census,noWrites,drainReports,cognitiveFinal,readCognitiveQuota,decryptUnifiedRuntimePayload,denied,prefix,products,sha} from './c19-flow-client.mjs'
import {logins,participant,formBody,formRows,form,unitKey,publish} from './c19-flow-fixture.mjs'

const production=file=>require(path.join(backend,'dist',file+'.js'))
const {canonicalHash}=production('modules/assessment-runtime/canonical')
const {loadFrozenScaleRuntimeSnapshot}=production('modules/assessment-runtime/runtime-snapshot')
const {loadCognitiveSessionConfig}=production('modules/cognitive/session.service')
const {decryptCognitivePayload}=production('modules/cognitive/cognitive.security')
const {isControlReferenceField}=production('modules/assessment-runtime/control-reference-codec')
const {loadStoredVersionedUnitAdmission}=production('modules/assessment-runtime/unit-admission')
const {decryptFrozenSituationalRuntimeSnapshot}=production('modules/assessment-runtime/situational-runtime-snapshot')
const {createCustomScaleDefinition}=production('modules/scale/scale-definition')
const flags=['ASSESSMENT_COMPACT_FACTS_ENABLED','ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED','ASSESSMENT_SHARED_CONTROL_ENABLED']
const hashRows=value=>sha(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v))
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]))
const nativeCounts=c=>[c.forms.length,c.scales.length,c.cognitive.length,c.sjt.length,c.snapshots.length]
const expires=()=>new Date(Date.now()+4*3600000).toISOString()
const safeBasename=name=>{assert.equal(typeof name,'string');assert.equal(path.basename(name),name);assert.ok(!name.startsWith('.'));return name}
const readBound=(h,name,hash)=>{const bytes=fs.readFileSync(path.join(h.state,safeBasename(name)));assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(sha(bytes),hash,'frozen private/result file SHA mismatch');return JSON.parse(bytes)}

function bindRuntime(h,mode){
 const entry=h.status.boundariesRuntimes?.[mode];assert.ok(entry,'launcher must explicitly bind this mode')
 const runtime=readBound(h,entry.runtimeFile,entry.runtimeSha256),url=new URL(entry.apiUrl)
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.equal(url.pathname,'/')
 assert.ok(Number.isSafeInteger(entry.apiPid)&&entry.apiPid>1)
 const live=Object.fromEntries(fs.readFileSync(`/proc/${entry.apiPid}/environ`,'utf8').split('\0').filter(Boolean).map(value=>{const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)]}))
 const expected={ASSESSMENT_COMPACT_FACTS_ENABLED:'true',ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED:mode==='on'?'true':'false',ASSESSMENT_SHARED_CONTROL_ENABLED:mode==='on'?'true':'false'}
 for(const key of flags){assert.equal(runtime[key],expected[key],key+' private runtime');assert.equal(live[key],expected[key],key+' live API');assert.equal(process.env[key],expected[key],key+' client')}
 for(const key of ['DATABASE_URL','REDIS_URL','DATA_ENCRYPTION_KEY','UPLOAD_DIR','EXPORT_DIR']){assert.ok(live[key]===runtime[key],key+' API/runtime binding mismatch');assert.ok(process.env[key]===runtime[key],key+' client/runtime binding mismatch')}
 assert.equal(live.PORT,url.port);assert.equal(runtime.PORT,url.port);assert.equal(live.NODE_ENV,'test')
 assert.equal(live.BACKGROUND_WORKERS_ENABLED,'false');assert.equal(live.HEAVY_PROCESSING_ENABLED,'false');assert.equal(live.VIDEO_PROCESSING_ENABLED,'false')
 assert.equal(live.MATERIAL_GRANTS_ENABLED??'true','true','material grants use the official true fallback')
 for(const key of ['DATABASE_URL','REDIS_URL'])assert.equal(new URL(runtime[key]).hostname,'127.0.0.1')
 assert.equal(Number(new URL(runtime.DATABASE_URL).port),h.status.ports.postgres);assert.equal(Number(new URL(runtime.REDIS_URL).port),h.status.ports.redis)
 h.status.apiUrl=entry.apiUrl
 h.result.runtime={mode,flags:expected,runtimeFileSha256:entry.runtimeSha256,apiPid:entry.apiPid,apiPort:Number(url.port)}
 h.check('Live API, private runtime and client have identical explicit compact/shared storage switches and local DB/Redis binding')
 return runtime
}

/** Whitelist scientific semantics, never erase fields recursively. Per-attempt
 * time, principal, assignment wrapper and authorization receipt are checked
 * separately and are intentionally not asserted equal across two attempts. */
async function inspectAttempt(attemptId,mode,{complete=false}={}){
 const proof=await candidateProof(attemptId),c=await children(attemptId),candidate=proof.candidate
 assert.equal(canonicalHash(candidate),proof.row.trainingFlowSnapshotHash)
 assert.equal(candidate.attemptId,attemptId);assert.equal(candidate.attemptEpoch,proof.row.attemptEpoch)
 assert.equal(candidate.compositeId,proof.row.compositeAssessmentId);assert.equal(candidate.slotSetHash,proof.slots.snapshotHash)
 const publication=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:proof.row.compositeAssessmentId},select:{publishedAt:true,trainingFlowDigest:true}})
 assert.equal(candidate.publishedAt,publication.publishedAt.toISOString());assert.equal(candidate.flowDigest,publication.trainingFlowDigest)
 assert.equal(proof.slots.snapshotHash,proof.row.frozenActiveSlotSetHash)
 const slotWire=decryptUnifiedRuntimePayload(proof.row.frozenActiveSlotSetEncrypted)
 assert.equal(slotWire.k==='FSP2',mode==='on','actual slot representation must follow the API switch')
 const scientific={flowDigest:candidate.flowDigest,slots:proof.slots.slots.map(slot=>({...pick(slot,['slotKey','unitType','required','sourceDefinitionIdentity','sourceBinding']),...(slot.runtimeIdentity?{runtimeIdentity:pick(slot.runtimeIdentity,['instrumentKey','instrumentVersion','definitionHash','compiledRuntimeHash','scorerKey','scoringVersion','runtimeGeneration','deliveryMode'])}:{})})),scale:{},cognitive:{},situational:{}}
 const representations={slotPlan:mode==='on'?'FSP2':'INLINE',scale:[],cognitive:[],admissions:[]},bindings=[]
 for(const slot of proof.slots.slots){
  const itemId=slot.sourceBinding.compositeItemId,sectionId=slot.sourceBinding.sectionId
  let child,loaded
  if(slot.unitType==='SCALE'){
   const encrypted=candidate.references[itemId],wire=decryptUnifiedRuntimePayload(encrypted)
   assert.equal(wire.kind==='SHARED_SCALE_RUNTIME',mode==='on');loaded=await loadFrozenScaleRuntimeSnapshot(encrypted,prisma)
   scientific.scale[itemId]=pick(loaded,['schemaVersion','runtimeGeneration','instrumentKey','instrumentVersion','sourceDefinitionHash','legacyDefinitionHash','compiledRuntime','referenceBindings','definition','compiledPolicy','runtimePolicyHash'])
   assert.equal(loaded.sourceDefinitionHash,slot.sourceDefinitionIdentity.hash)
   child=c.scales.find(row=>row.compositeItemId===itemId)
   if(child){assert.equal(child.runtimeSnapshotEncrypted,encrypted);assert.equal(child.scaleId,(await prisma.compositeAssessmentItem.findUniqueOrThrow({where:{id:itemId}})).scaleId)}
   representations.scale.push({itemId,kind:mode==='on'?wire.kind:'INLINE',bytes:Buffer.byteLength(encrypted),...(mode==='on'?{artifactHash:wire.artifactHash}:{})})
  }else if(slot.unitType==='COGNITIVE'){
   const encrypted=candidate.references[itemId],wire=isControlReferenceField(encrypted)?decryptUnifiedRuntimePayload(encrypted):decryptCognitivePayload(encrypted)
   assert.equal(wire.kind==='SHARED_COGNITIVE_RUNTIME',mode==='on');loaded=await loadCognitiveSessionConfig(encrypted,prisma);assert.ok(loaded.snapshot?.compiledRuntime)
   scientific.cognitive[itemId]=pick(loaded.snapshot,['schemaVersion','testType','configVersion','engineVersion','scoringVersion','config','configHash','hashScheme','runtimeGeneration','compiledRuntime','referenceBindings','presentation','protocol','protocolSignature'])
   assert.equal(loaded.compiledRuntime.sourceDefinitionHash,slot.sourceDefinitionIdentity.hash)
   child=c.cognitive.find(row=>row.compositeItemId===itemId)
   if(child){
    assert.equal(child.configSnapshotEncrypted,encrypted);assert.equal(child.compiledRuntimeHash,loaded.compiledRuntime.compiledRuntimeHash)
    const prepared=candidate.assignments[itemId]
    if(prepared?.existing)assert.equal(child.assignmentId,prepared.existing.id)
    else if(prepared?.data){const actual=await prisma.cognitiveAssignment.findUniqueOrThrow({where:{id:child.assignmentId}}),dto=Object.fromEntries(Object.keys(prepared.data).map(key=>[key,actual[key] instanceof Date?actual[key].toISOString():actual[key]]));assert.deepEqual(dto,prepared.data,'deferred assignment DTO must be the actual admitted wrapper')}
   }
   representations.cognitive.push({itemId,kind:mode==='on'?wire.kind:'INLINE',bytes:Buffer.byteLength(encrypted),...(mode==='on'?{artifactHash:wire.artifactHash}:{})})
  }else if(slot.unitType==='SITUATIONAL'){
   loaded=candidate.situational[itemId];assert.ok(loaded)
   scientific.situational[itemId]=pick(loaded,['schemaVersion','runtimeGeneration','instrumentKey','instrumentVersion','definitionHash','compiledRuntimeHash','scorerKey','scoringVersion','definition','runnerDefinition','compiledRuntime','online','scientificContext'])
   assert.equal(loaded.definitionHash,slot.sourceDefinitionIdentity.hash);assert.equal(loaded.frozenAt,slot.runtimeIdentity.frozenAt)
   child=c.sjt.find(row=>row.compositeItemId===itemId)
   if(child){assert.deepEqual(decryptFrozenSituationalRuntimeSnapshot(child.runtimeSnapshotEncrypted),loaded);assert.equal(child.compositeSlotKey,slot.slotKey);assert.equal(child.userId,proof.row.userId);assert.equal(child.attemptEpoch,proof.row.attemptEpoch);assert.equal(child.compiledRuntimeHash,loaded.compiledRuntimeHash)}
  }else{assert.equal(slot.unitType,'FORM_SECTION');child=c.forms.find(row=>row.sectionId===sectionId)}
  if(complete)assert.ok(child,'all qualified mode slots need actual native children')
  if(!child)continue
  assert.equal(slot.unitType==='FORM_SECTION'?child.attemptId:child.compositeAttemptId,attemptId)
  if(slot.unitType!=='SITUATIONAL'){
   const admission=await loadStoredVersionedUnitAdmission(child,'boundary admission unreadable',prisma);assert.ok(admission,'delivered actual child must carry its frozen admission')
   assert.equal(admission.attemptEpoch,proof.row.attemptEpoch);assert.equal(admission.principal.userId,proof.row.userId)
   assert.equal(admission.parent.kind,'composite');assert.equal(admission.parent.parentId,attemptId);assert.equal(admission.parent.slotKey,slot.slotKey)
   assert.equal(admission.parent.sourceDefinitionHash,slot.sourceDefinitionIdentity.hash)
   if(loaded)assert.equal(admission.parent.compiledRuntimeHash,loaded.compiledRuntime.compiledRuntimeHash)
   else assert.equal(admission.formSection.identityHash,slot.sourceDefinitionIdentity.hash)
   const wire=decryptUnifiedRuntimePayload(child.frozenAdmissionSnapshotEncrypted)
   assert.equal(wire.k==='UAR2',mode==='on','actual admission representation must follow API switch')
   representations.admissions.push({type:slot.unitType,kind:mode==='on'?'UAR2':'INLINE',hash:admission.snapshotHash,bytes:Buffer.byteLength(child.frozenAdmissionSnapshotEncrypted)})
  }
  const accepted=c.snapshots.find(row=>row.slotKey===slot.slotKey)
  if(complete)assert.ok(accepted)
  if(accepted){assert.equal(accepted.sourceAttemptId,child.id);assert.equal(accepted.attemptEpoch,proof.row.attemptEpoch);assert.equal(accepted.sourceDefinitionHash,slot.sourceDefinitionIdentity.hash);if(loaded)assert.equal(accepted.compiledRuntimeHash,loaded.compiledRuntime.compiledRuntimeHash)}
  bindings.push({type:slot.unitType,slotKey:slot.slotKey,childId:child.id,acceptedSnapshotId:accepted?.id??null})
 }
 if(complete){
  const scaleFacts=await prisma.assessmentResultFact.findMany({where:{assessmentId:{in:c.scales.map(row=>row.id)}}}),cogRaw=await prisma.cognitiveRawSubmission.findMany({where:{sessionId:{in:c.cognitive.map(row=>row.id)}}}),sjtRaw=await prisma.situationalRawSubmission.findMany({where:{attemptId:{in:c.sjt.map(row=>row.id)}}})
  assert.equal(scaleFacts.length,c.scales.length);assert.equal(cogRaw.length,c.cognitive.length);assert.equal(sjtRaw.length,c.sjt.length)
  for(const raw of cogRaw)assert.equal(raw.trialCount,120)
 }
 return {proof,children:c,scientific,summary:{attemptId,candidate:proof.stable,scientificHash:canonicalHash(scientific),slotScientificHash:canonicalHash(scientific.slots),representations,bindings,counts:nativeCounts(c)}}
}

async function persistedRows(attemptId){
 const parent=(await candidateProof(attemptId)).row,c=await children(attemptId)
 const orderedChildren=Object.fromEntries(Object.entries(c).map(([key,rows])=>[key,[...rows].sort((a,b)=>a.id.localeCompare(b.id))]))
 return {parent,children:orderedChildren,formAnswers:await prisma.compositeFormAnswer.findMany({where:{attemptId},orderBy:{id:'asc'}}),scaleFacts:await prisma.assessmentResultFact.findMany({where:{assessmentId:{in:c.scales.map(row=>row.id)}},orderBy:{assessmentId:'asc'}}),cogRaw:await prisma.cognitiveRawSubmission.findMany({where:{sessionId:{in:c.cognitive.map(row=>row.id)}},orderBy:{id:'asc'}}),sjtRaw:await prisma.situationalRawSubmission.findMany({where:{attemptId:{in:c.sjt.map(row=>row.id)}},orderBy:{id:'asc'}})}
}

async function preserveDenied(h,name,ids,fn){
 const before=await Promise.all(ids.map(persistedRows))
 await noWrites(h,name,fn)
 const after=await Promise.all(ids.map(persistedRows))
 assert.equal(hashRows(after),hashRows(before),name+' must not rewrite any parent/child/fact/outbox bytes')
}

async function submission(client,attempt,fixture){
 const unit=attempt.currentItem,c=await children(attempt.id)
 if(unit.type==='FORM_SECTION')return {route:`${prefix}/attempts/${attempt.id}/form-sections/${unit.id}/submit`,body:formBody(attempt)}
 if(unit.type==='SCALE'){
  const child=c.scales.find(row=>row.compositeItemId===unit.id);assert.ok(child);await client.request(`/scales/assessments/${child.id}`)
  const snapshot=await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,prisma)
  return {route:`/scales/assessments/${child.id}/submit`,body:{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:snapshot.definition.items.map(item=>({itemCode:item.itemCode,responseValue:snapshot.definition.responseSets.find(set=>set.key===item.responseSetKey).options[0].value,responseTimeMs:17}))}}
 }
 if(unit.type==='COGNITIVE'){assert.equal(unit.cognitiveSession.config.totalTrials,120);await client.request(`/cognitive/sessions/${unit.cognitiveSession.sessionId}`);return {route:`/cognitive/sessions/${unit.cognitiveSession.sessionId}/submit`,body:cognitiveFinal(unit.cognitiveSession)}}
 assert.equal(unit.type,'SITUATIONAL')
 const route=`${prefix}/attempts/${attempt.id}/items/${unit.id}/situational/${unit.situationalAttemptId}`,runtime=await client.request(route)
 assert.deepEqual(await client.request(route+`/assets/${fixture.sjt.asset.assetId}/content`,'GET',undefined,200,true),Buffer.from(fixture.sjt.imageBase64,'base64'))
 return {route:route+'/submit',body:{submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:fixture.sjtResponses}}
}

async function issueFinal(h,record,save,client,attempt,request){
 record.finals??=[];const entry={attemptId:attempt.id,type:attempt.currentItem.type,request,issuedAt:new Date().toISOString(),accepted:false}
 record.finals.push(entry);save()
 await client.request(request.route,'POST',request.body)
 entry.accepted=true;entry.acceptedAt=new Date().toISOString();save()
 const proof=await candidateProof(attempt.id);assert.ok(proof.proof,'accepted FINAL must write the authoritative path proof')
 h.result.measurements.push({stage:'NEW_FINAL_ACCEPTED',attemptId:attempt.id,type:attempt.currentItem.type,submissionId:request.body.submissionId,pathHash:proof.row.trainingFlowPathHash,snapshots:(await children(attempt.id)).snapshots.length})
}

async function finishTerminal(h,client,attemptId,processed){
 const before=await candidateProof(attemptId),c=await children(attemptId)
 assert.equal(before.row.status,'IN_PROGRESS');assert.equal(before.proof.path.currentInstrumentKey,null);assert.equal(before.proof.path.termination,'COMPLETE')
 assert.equal(c.jobs.length,1);assert.equal(c.jobs[0].status,'PENDING');assert.equal(c.jobs[0].attemptCount,0)
 processed.push(...await drainReports(h,[attemptId]));h.result.originalOutboxProcessed=processed
 const final=await client.request(`${prefix}/attempts/${attemptId}`);assert.equal(final.status,'COMPLETED');assert.equal(final.currentItem,null)
 const after=await candidateProof(attemptId);assert.deepEqual(after.stable,before.stable);assert.equal(after.row.trainingFlowPathHash,before.row.trainingFlowPathHash)
 assert.deepEqual((await children(attemptId)).snapshots,c.snapshots)
 return final
}

async function nonownerMatrix(h,outsider,attempt,request,fixture){
 const type=attempt.currentItem.type,c=await children(attempt.id),unit=attempt.currentItem
 await preserveDenied(h,type+' real native nonowner matrix',[attempt.id],async()=>{
  await outsider.request(`${prefix}/attempts/${attempt.id}`,'GET',undefined,[403,404])
  await outsider.request(request.route,'POST',request.body,[403,404])
  if(type==='SCALE'){
   const child=c.scales.find(row=>row.compositeItemId===unit.id)
   await outsider.request(`/scales/assessments/${child.id}`,'GET',undefined,[403,404])
   await outsider.request(`${prefix}/attempts/${attempt.id}/items/${unit.id}/scale/submit`,'POST',request.body,[403,404])
  }else if(type==='COGNITIVE')await outsider.request(`/cognitive/sessions/${unit.cognitiveSession.sessionId}`,'GET',undefined,[403,404])
  else if(type==='SITUATIONAL'){
   const base=request.route.slice(0,-'/submit'.length),native=`/situational/attempts/${unit.situationalAttemptId}`
   await outsider.request(base,'GET',undefined,[403,404])
   await outsider.request(base+`/assets/${fixture.sjt.asset.assetId}/content`,'GET',undefined,[403,404])
   await outsider.request(native,'GET',undefined,[403,404])
   await outsider.request(native+'/submit','POST',request.body,[403,404])
   await outsider.request(native+`/assets/${fixture.sjt.asset.assetId}/content`,'GET',undefined,[403,404])
  }
 })
 h.check(type+' real IDs and well-formed FINAL reject nonowner without changing parent, child, facts, proof or outbox')
}

async function futureMatrix(h,actor,attempt,fixture,on){
 const p=await candidateProof(attempt.id),product=fixture.product,scaleItem=product.items.find(x=>x.type==='SCALE'),cogItem=product.items.find(x=>x.type==='COGNITIVE'),sjtItem=product.items.find(x=>x.type==='SITUATIONAL')
 const scale=await loadFrozenScaleRuntimeSnapshot(p.candidate.references[scaleItem.id],prisma),sjt=p.candidate.situational[sjtItem.id]
 const onChild=(await children(on.attemptId)).sjt[0];assert.ok(onChild)
 const sjtRoute=`${prefix}/attempts/${attempt.id}/items/${sjtItem.id}/situational/${onChild.id}`
 await preserveDenied(h,'future native candidate paths and cross-parent real SJT child',[attempt.id,on.attemptId],async()=>{
  await actor.client.request(`${prefix}/attempts/${attempt.id}/items/${scaleItem.id}/scale/submit`,'POST',{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:scale.legacyDefinitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:scale.definition.items.map(item=>({itemCode:item.itemCode,responseValue:scale.definition.responseSets.find(set=>set.key===item.responseSetKey).options[0].value}))},denied)
  await actor.client.request('/cognitive/sessions','POST',{assignmentId:cogItem.cognitiveAssignmentId},denied)
  await actor.client.request(sjtRoute,'GET',undefined,[403,404,409])
  await actor.client.request(sjtRoute+'/submit','POST',{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:sjt.definitionHash,compiledRuntimeHash:sjt.compiledRuntimeHash,scoringVersion:sjt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:fixture.sjtResponses},[403,404,409])
  await actor.client.request(sjtRoute+`/assets/${fixture.sjt.asset.assetId}/content`,'GET',undefined,[403,404,409])
 })
 assert.deepEqual(nativeCounts(await children(attempt.id)),[1,0,0,0,0])
 assert.equal((await readCognitiveQuota(prisma,actor.user.id,fixture.assignmentId)).usedAttempts,0)
 // Form has no independent GET and future native rows deliberately do not
 // exist. Use an authentic skipped Form section, not a fabricated child UUID.
 const old=fixture.cases.find(row=>row.name==='dependency_suppressed');assert.ok(old?.user)
 const oldClient=h.client();await oldClient.login(old.user,'STUDENT')
 const oldProof=await candidateProof(old.attemptId),oldChildren=await children(old.attemptId)
 const skipped=fixture.dependencyProduct.formSections.find(section=>!oldChildren.forms.some(row=>row.sectionId===section.id));assert.ok(skipped)
 const slot=oldProof.slots.slots.find(row=>row.sourceBinding.sectionId===skipped.id);assert.ok(slot)
 await preserveDenied(h,'authentic skipped Form section rejects owner FINAL',[old.attemptId],()=>oldClient.request(`${prefix}/attempts/${old.attemptId}/form-sections/${skipped.id}/submit`,'POST',{submissionId:randomUUID(),attemptEpoch:oldProof.row.attemptEpoch,definitionHash:slot.sourceDefinitionIdentity.hash,contextSnapshotHash:oldProof.row.contextSnapshotHash,answers:skipped.items.map(item=>({formItemId:item.id,value:'yes'}))},denied))
 h.result.nativeMatrixScope={form:'Parent state/FINAL nonowner; authenticated skipped-section FINAL',scale:'Actual assessment GET/FINAL nonowner; future parent item FINAL with real candidate hash',cognitive:'Actual session GET/FINAL nonowner; future wrapper standalone-start bypass denied',situational:'Actual embedded+standalone GET/FINAL/media nonowner; future parent with real foreign child denies binding',limitation:'No future native child ID exists by design. Cross-parent/standalone bypass probes are distinguished from nonexistent-resource 404s; no browser or selected-video qualification.'}
 h.check('Future Scale, Cognitive wrapper and cross-parent SJT paths leave child/quota absent; real skipped Form remains unadmitted')
}

async function fourTools(h,mode,fixture,actors,record,save,processed,on){
 const sharedBefore={runtimeArtifacts:await prisma.assessmentRuntimeArtifact.count(),frozenBindings:await prisma.assessmentFrozenBinding.count()}
 const actor=await participant(h,fixture,'boundaries-'+mode);record.actor=actor.user;save()
 const quotaBefore=await readCognitiveQuota(prisma,actor.user.id,fixture.assignmentId);assert.equal(quotaBefore.usedAttempts,0)
 let {attempt}=await actor.client.request(`${prefix}/${fixture.product.id}/attempts`,'POST',{})
 record.attemptId=attempt.id;save()
 const initial=await inspectAttempt(attempt.id,mode);record.initial=initial.summary;save()
 assert.deepEqual(nativeCounts(initial.children),[1,0,0,0,0]);assert.equal(initial.proof.proof,null);assert.equal(initial.children.jobs.length,0)
 assert.equal((await readCognitiveQuota(prisma,actor.user.id,fixture.assignmentId)).usedAttempts,0)
 if(mode==='off')await futureMatrix(h,actor,attempt,fixture,on)
 for(const type of ['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL']){
  assert.equal(attempt.currentItem.type,type)
  const request=await submission(actor.client,attempt,fixture)
  const admitted=await inspectAttempt(attempt.id,mode);assert.deepEqual(admitted.proof.stable,initial.proof.stable)
  if(mode==='off')await nonownerMatrix(h,actors.outsider,attempt,request,fixture)
  await issueFinal(h,record,save,actor.client,attempt,request)
  if(type==='SITUATIONAL')attempt=await finishTerminal(h,actor.client,attempt.id,processed)
  else attempt=await actor.client.request(`${prefix}/attempts/${attempt.id}`)
  const after=await inspectAttempt(attempt.id,mode);assert.deepEqual(after.proof.stable,initial.proof.stable)
  const expected=type==='FORM_SECTION'?[1,1,0,0,1]:type==='SCALE'?[1,1,1,0,2]:type==='COGNITIVE'?[1,1,1,1,3]:[1,1,1,1,4]
  assert.deepEqual(nativeCounts(after.children),expected)
  assert.equal((await readCognitiveQuota(prisma,actor.user.id,fixture.assignmentId)).usedAttempts,type==='FORM_SECTION'?0:1)
 }
 const complete=await inspectAttempt(attempt.id,mode,{complete:true})
 const sharedAfter={runtimeArtifacts:await prisma.assessmentRuntimeArtifact.count(),frozenBindings:await prisma.assessmentFrozenBinding.count()}
 if(mode==='off')assert.deepEqual(sharedAfter,sharedBefore,'inline OFF four-tool path must not create runtime artifacts or frozen binding rows')
 else assert.ok(await prisma.assessmentFrozenBinding.count({where:{compositeAttemptId:attempt.id}})>0,'ON actual admissions require durable per-parent shared bindings')
 assert.equal(complete.proof.row.status,'COMPLETED');assert.equal(complete.proof.row.taskSatisfaction,'SATISFIED')
 record.completed=true;record.complete=complete.summary;record.scientific=complete.scientific;save()
 h.result.storage=complete.summary;h.result.measurements.push({stage:'MODE_FOURTOOL_COMPLETED',mode,sharedBefore,sharedAfter,quotaBefore,quotaAfter:await readCognitiveQuota(prisma,actor.user.id,fixture.assignmentId)})
 h.check(mode.toUpperCase()+' actual four-tool FINALs preserve canonical candidate/slot identities and exact child binding with one original outbox and one quota charge')
 return complete
}

async function createRevocationFixtures(h,fixture,actors,record,save){
 const {teacher,otherTeacher,admin}=actors
 const course=await teacher.request('/courses','POST',{title:'C19 new synthetic grant-revocation Training course'})
 assert.equal(course.courseType,'TRAINING_COURSE');assert.equal(course.creatorId,fixture.users.teacher.id)
 record.revocation={courseId:course.id,products:{},cases:[]};save()
 let scale=await otherTeacher.request('/scales','POST',{code:'C19-BOUNDARY-'+randomUUID(),name:'C19 new synthetic revocable Scale',visibility:'HIDDEN'})
 record.revocation.scaleId=scale.id;save()
 const definition=createCustomScaleDefinition()
 definition.responseSets=[{key:'default',options:[{value:'yes',label:'yes',score:1},{value:'no',label:'no',score:0}]}]
 definition.items=[{itemCode:'c19-boundary-scale-item',content:'Synthetic boundary response',type:'single',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}]
 definition.scoring.itemRules=[{itemCode:'c19-boundary-scale-item',transform:{type:'identity'}}]
 definition.scoring.scores=[{key:'total',type:'total',label:'Synthetic descriptive total',direction:'descriptive',canonical:true,displayPrecision:0,source:{type:'items',items:[{itemCode:'c19-boundary-scale-item',weight:1}],aggregation:'sum'}}]
 definition.report.primaryScoreKeys=['total'];definition.report.scoreOrder=['total']
 definition.report.interpretations=[{scoreKey:'total',headline:'Synthetic qualification only',source:{type:'score_only'},summary:'This synthetic response is used only to check the access boundary.',bands:[],guidance:[]}]
 scale=await otherTeacher.request(`/scales/${scale.id}/definition`,'PUT',{definition})
 await otherTeacher.request(`/scales/${scale.id}/publish`,'POST',{})
 const scaleRow=await prisma.scale.findUniqueOrThrow({where:{id:scale.id}});assert.equal(scaleRow.status,'PUBLISHED');assert.equal(scaleRow.creatorId,fixture.users.otherTeacher.id)
 const scaleGrant=await admin.request('/admin/material-grants','POST',{teacherId:fixture.users.teacher.id,resourceType:'SCALE',resourceId:scale.id})
 record.revocation.scaleGrant=scaleGrant;save()
 const release=fixture.sjt.release
 const sjtGrant=await admin.request(`/situational/authoring/releases/${release.id}/grants`,'POST',{instrumentKey:release.instrumentKey,instrumentVersion:release.instrumentVersion,definitionHash:release.definitionHash,contentDigest:release.contentDigest,granteeTeacherId:fixture.users.teacher.id,courseId:course.id,purpose:'TRAINING_COURSE',permission:'DISTRIBUTE',validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:expires(),note:'C19 new-course synthetic revocation boundary'})
 record.revocation.sjtGrant=sjtGrant;save()
 for(const type of ['SCALE','SITUATIONAL']){
  let product=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C19 fresh '+type+' revoke boundary',questionnaireType:'COURSE',courseIds:[course.id],publicEnabled:false,expiresAt:expires()})
  product=await teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item:form('boundary_form')})
  product=await teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item:type==='SCALE'?{type,scaleId:scale.id,required:true}:{type,situationalInstrumentKey:release.instrumentKey,situationalInstrumentVersion:release.instrumentVersion,required:true}})
  product=await publish(teacher,product,{schemaVersion:1,blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:unitKey(formRows(product)[0])},{blockKey:'native',kind:'INSTRUMENT',instrumentKey:unitKey(product.items.find(item=>item.type===type))}]})
  record.revocation.products[type]=product;save()
 }
 const scoped={...fixture,courseId:course.id},a=await participant(h,scoped,'revoke-reached'),b=await participant(h,scoped,'revoke-unreached')
 record.revocation.actors={a:a.user,b:b.user};save()
 h.result.revocationFixture={courseId:course.id,scaleId:scale.id,scaleOwnerIsDifferent:true,sjtReleaseId:release.id,sjtReleaseReuse:'Existing independently ADMIN-reviewed synthetic release; new grant is limited to the new course',newProductIds:Object.values(record.revocation.products).map(p=>p.id)}
 h.check('Official teacher course/Scale authoring and ADMIN grant APIs create isolated revocation resources; no old grant/resource is edited')
 return {a,b}
}

async function revokeCase(h,type,fixture,actors,revActors,record,save,processed){
 const product=record.revocation.products[type],{a,b}=revActors
 const quotaBefore={a:await readCognitiveQuota(prisma,a.user.id,fixture.assignmentId),b:await readCognitiveQuota(prisma,b.user.id,fixture.assignmentId)}
 assert.equal(quotaBefore.a.usedAttempts,0);assert.equal(quotaBefore.b.usedAttempts,0)
 let aAttempt=(await a.client.request(`${prefix}/${product.id}/attempts`,'POST',{})).attempt
 const bAttempt=(await b.client.request(`${prefix}/${product.id}/attempts`,'POST',{})).attempt
 const test={type,aAttemptId:aAttempt.id,bAttemptId:bAttempt.id,finals:[]};record.revocation.cases.push(test);save()
 const aInitial=await candidateProof(aAttempt.id),bInitial=await candidateProof(bAttempt.id)
 assert.deepEqual(nativeCounts(await children(aAttempt.id)),[1,0,0,0,0]);assert.deepEqual(nativeCounts(await children(bAttempt.id)),[1,0,0,0,0])
 await issueFinal(h,test,save,a.client,aAttempt,await submission(a.client,aAttempt,fixture))
 aAttempt=await a.client.request(`${prefix}/attempts/${aAttempt.id}`);assert.equal(aAttempt.currentItem.type,type)
 const admitted=await inspectAttempt(aAttempt.id,'off'),nativeRow=type==='SCALE'?admitted.children.scales[0]:admitted.children.sjt[0]
 assert.ok(nativeRow);test.nativeId=nativeRow.id;test.frozenNativeHash=hashRows(pick(nativeRow,['runtimeSnapshotEncrypted','frozenAdmissionSnapshotEncrypted','frozenAdmissionSnapshotHash']));save()
 const request=await submission(a.client,aAttempt,fixture)
 if(type==='SCALE')await actors.admin.request(`/admin/material-grants/${record.revocation.scaleGrant.id}`,'DELETE')
 else await actors.admin.request(`/situational/authoring/grants/${record.revocation.sjtGrant.id}/revoke`,'POST',{version:record.revocation.sjtGrant.version,note:'C19 new-course grant revoked after only A admission'})
 test.revoked=true;save()
 if(type==='SCALE')assert.equal(await prisma.materialGrant.count({where:{id:record.revocation.scaleGrant.id}}),0)
 else {const grant=await prisma.sjtReleaseGrant.findUniqueOrThrow({where:{id:record.revocation.sjtGrant.id}});assert.equal(grant.status,'REVOKED')}
 // Existing A is recovered using fresh authenticated requests and immutable
 // runtime/admission, after the current distribution authorization is gone.
 const fresh=h.client();await fresh.login(a.user,'STUDENT')
 const resumed=await fresh.request(`${prefix}/attempts/${aAttempt.id}`);assert.equal(resumed.currentItem.type,type)
 const recoveredRequest=await submission(fresh,resumed,fixture)
 assert.deepEqual({...recoveredRequest.body,submissionId:null},{...request.body,submissionId:null})
 const recovered=await inspectAttempt(aAttempt.id,'off'),recoveredRow=type==='SCALE'?recovered.children.scales[0]:recovered.children.sjt[0]
 assert.equal(hashRows(pick(recoveredRow,['runtimeSnapshotEncrypted','frozenAdmissionSnapshotEncrypted','frozenAdmissionSnapshotHash'])),test.frozenNativeHash)
 assert.deepEqual(recovered.proof.stable,aInitial.stable)
 await issueFinal(h,test,save,fresh,resumed,recoveredRequest)
 await finishTerminal(h,fresh,aAttempt.id,processed)
 // B's Form FINAL is genuinely accepted once after revocation. Its next GET
 // must fail admission without inventing the native child or making WAITING
 // eligible for the worker/budget. It is intentionally left pending.
 await issueFinal(h,test,save,b.client,bAttempt,await submission(b.client,bAttempt,fixture))
 const beforeDenied=await candidateProof(bAttempt.id),beforeChildren=await children(bAttempt.id)
 assert.deepEqual(nativeCounts(beforeChildren),[1,0,0,0,1]);assert.equal(beforeChildren.jobs.length,1)
 assert.equal(beforeChildren.jobs[0].status,'WAITING');assert.equal(beforeChildren.jobs[0].budgetHeld,false)
 assert.equal(beforeChildren.jobs[0].attemptCount,0)
 await preserveDenied(h,type+' revoked not-yet-admitted child',[bAttempt.id],async()=>{
  await b.client.request(`${prefix}/attempts/${bAttempt.id}`,'GET',undefined,403)
  if(type==='SCALE')await b.client.request(`${prefix}/attempts/${bAttempt.id}/items/${product.items.find(item=>item.type===type).id}/scale/submit`,'POST',{...recoveredRequest.body,submissionId:randomUUID()},denied)
  else {const route=`${prefix}/attempts/${bAttempt.id}/items/${product.items.find(item=>item.type===type).id}/situational/${nativeRow.id}`;await b.client.request(route,'GET',undefined,[403,404,409]);await b.client.request(route+`/assets/${fixture.sjt.asset.assetId}/content`,'GET',undefined,[403,404,409])}
 })
 assert.deepEqual((await candidateProof(bAttempt.id)).stable,bInitial.stable)
 assert.deepEqual(beforeDenied.stable,bInitial.stable);assert.equal((await candidateProof(bAttempt.id)).row.status,'IN_PROGRESS')
 const aFinal=await inspectAttempt(aAttempt.id,'off',{complete:true});assert.deepEqual(aFinal.proof.stable,aInitial.stable)
 const quotaAfter={a:await readCognitiveQuota(prisma,a.user.id,fixture.assignmentId),b:await readCognitiveQuota(prisma,b.user.id,fixture.assignmentId)}
 assert.deepEqual(quotaAfter,quotaBefore)
 test.passed=true;test.aFinal=aFinal.summary;test.bStable=beforeDenied.stable;save()
 h.result.measurements.push({stage:'REVOKED_'+type,quotaBefore,quotaAfter,admitted:{attemptId:aAttempt.id,childId:nativeRow.id,completed:true,candidate:aFinal.proof.stable,frozenNativeHash:test.frozenNativeHash},unadmitted:{attemptId:bAttempt.id,children:nativeCounts(beforeChildren),parentStatus:'IN_PROGRESS',jobStatus:'WAITING',budgetHeld:false,attemptCount:0,candidate:bInitial.stable}})
 h.check(type+' revoked new grant blocks B admission while already-admitted A restores original runtime/media and completes through original FINAL/outbox')
}

export async function runBoundaries(mode){
 assert.ok(['on','off'].includes(mode))
 const h=harness('boundaries-'+mode),privateName='c19-boundaries-'+mode+'-private.json',processed=[]
 // Deliberately outside the phase finalizer: do not overwrite an old result
 // even when someone mistakenly invokes this original producer a second time.
 assert.ok(![privateName,'c19-boundaries-'+mode+'-result.json','c19-boundaries-'+mode+'-failure-private.json'].some(name=>fs.existsSync(path.join(h.state,name))),'phase already attempted: preserve it and use an explicit continuation producer')
 let error,record
 try{
  const runtime=bindRuntime(h,mode)
  const fixture=h.read('c19-fixture-private.json'),budgetBefore=await prisma.compositeReportQueueBudget.findMany({orderBy:{id:'asc'}}),beforeCounts=await census()
  record={schemaVersion:1,mode,createdAt:new Date().toISOString(),finals:[]}
  const save=()=>h.write(privateName,record);save()
  const actors=await logins(h,fixture)
  let on,onBefore,onRowsHash
  if(mode==='off'){
   const qualified=readBound(h,'c19-boundaries-on-result.json',h.status.boundariesOnResultSha256)
   on=readBound(h,'c19-boundaries-on-private.json',h.status.boundariesOnPrivateSha256)
   assert.equal(qualified.passed,true);assert.equal(qualified.phase,'boundaries-on');assert.equal(on.mode,'on');assert.equal(on.completed,true);assert.equal(on.finished,true)
   const onEntry=h.status.boundariesRuntimes.on,onRuntime=readBound(h,onEntry.runtimeFile,onEntry.runtimeSha256)
   assert.equal(qualified.runtime.runtimeFileSha256,onEntry.runtimeSha256)
   const allowedSwitches=new Set(['PORT','ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED','ASSESSMENT_SHARED_CONTROL_ENABLED'])
   assert.deepEqual(Object.keys(runtime).sort(),Object.keys(onRuntime).sort(),'ON/OFF runtime keysets must match')
   for(const key of Object.keys(runtime))if(!allowedSwitches.has(key))assert.ok(runtime[key]===onRuntime[key],key+' changed outside the two storage switches/port')
   assert.notEqual(runtime.PORT,onRuntime.PORT,'ON/OFF must use distinct dynamic API ports')
   onBefore=await inspectAttempt(on.attemptId,'on',{complete:true})
   onRowsHash=hashRows(await persistedRows(on.attemptId))
   assert.equal(onBefore.summary.scientificHash,qualified.storage.scientificHash);assert.deepEqual(onBefore.summary,on.complete)
   h.result.reusedOn={resultSha256:h.status.boundariesOnResultSha256,privateSha256:h.status.boundariesOnPrivateSha256,attemptId:on.attemptId,scientificHash:onBefore.summary.scientificHash}
  }
  const current=await fourTools(h,mode,fixture,actors,record,save,processed,on)
  if(mode==='off'){
   assert.deepEqual(current.scientific,onBefore.scientific,'explicit candidate, compiled runtime and slot scientific identities must match ON/OFF')
   assert.notEqual(current.proof.row.id,onBefore.proof.row.id);assert.notEqual(current.proof.row.userId,onBefore.proof.row.userId)
   assert.notEqual(current.proof.row.trainingFlowSnapshotHash,onBefore.proof.row.trainingFlowSnapshotHash,'full canonical candidate remains independently attempt-bound')
   assert.ok(current.summary.bindings.every(child=>!onBefore.summary.bindings.some(old=>old.childId===child.childId)))
   h.check('Shared ON and inline OFF canonical scientific projections match exactly; each full candidate hash and actual child binding is independently verified')
   const revActors=await createRevocationFixtures(h,fixture,actors,record,save)
   for(const type of ['SCALE','SITUATIONAL'])await revokeCase(h,type,fixture,actors,revActors,record,save,processed)
   assert.deepEqual((await inspectAttempt(on.attemptId,'on',{complete:true})).summary,onBefore.summary)
   assert.equal(hashRows(await persistedRows(on.attemptId)),onRowsHash,'OFF must leave every ON parent/child/answer/raw/fact/job byte unchanged')
   h.result.reusedOn.rowsBeforeAfterSha256=onRowsHash
  }
  const budgetAfter=await prisma.compositeReportQueueBudget.findMany({orderBy:{id:'asc'}});assert.deepEqual(budgetAfter,budgetBefore,'all original queue budget rows must remain byte-identical')
  record.finished=true;save()
  h.result.privateCheckpointSha256=sha(fs.readFileSync(path.join(h.state,privateName)))
  h.result.counts.push({name:'supplement mode totals',before:beforeCounts,after:await census()})
  h.result.queueBudget={beforeHash:hashRows(budgetBefore),afterHash:hashRows(budgetAfter),equal:true}
  h.result.qualification={browser:false,capacity:false,selectedVideo:false,newFinalCount:record.finals.filter(x=>x.accepted).length+(record.revocation?.cases??[]).reduce((sum,c)=>sum+c.finals.filter(x=>x.accepted).length,0),oldFinalsReplayed:0}
  h.result.passed=true
 }catch(e){
  // Assertion diffs can contain private rows. Preserve full diagnostics only
  // in a private checkpoint; the public phase result/log gets a bounded label.
  if(record){record.failure={name:e.name,message:e.message,stack:e.stack};h.write(privateName,record)}
  else h.write('c19-boundaries-'+mode+'-failure-private.json',{name:e.name,message:e.message,stack:e.stack})
  error=new Error('C19 boundaries-'+mode+' failed; inspect its private checkpoint for the exact request/assertion.');error.name=e.name
  throw error
 }finally{await h.finish(error)}
}
