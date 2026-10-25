import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {submitGovernedSource,approveGovernedTool,governedRow,withdrawGovernedTool} from '../../modules/survey/governed-tool.service'
import {governedPolicyIdentity} from '../../modules/survey/governed-tool.model'
import {syntheticNativeSituationalSubmission} from '../../modules/survey/governed-tool.native-trial'
import {grantCatalogSource,revokeToolGrant} from '../../modules/survey/catalog.service'
import {changeSurveyToolPolicy} from '../../modules/survey/library-admin.service'
import {importCatalogDraft} from '../../modules/survey/builder.service'
import {createWave,getWave} from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {startSingleUnlinkedWave} from '../../modules/survey/admission.service'
import {startSurveySituational,submitSurveySituationalFinal,readSurveySituational} from '../../modules/survey/situational-native.service'
import {submitResearchFinal,readGeneralForOwnAttempt} from '../../modules/survey/final.service'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileSjtNativeV1Fixture,createSjtNativeV1ScientificDeclaration} from '../fixtures/sjt-native-v1.fixture'
import {createSjtNativeStagedPackage} from '../fixtures/sjt-native-staged.fixture'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {compileSjtTemplate} from '../../modules/situational/authoring/template'
import {createSjtDraft,requestSjtReview,reviewSjtDraft} from '../../modules/situational/authoring/service'
import {sjtNativeStagedTemplate} from '../fixtures/sjt-native-staged.fixture'
import {readSurveyStoredReport} from '../../modules/survey/report-results.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {saveSurveyCheckpoint,readSurveyCheckpoint} from '../../modules/survey/checkpoint.service'
import {assertSurveyScaleCollectionAllowed} from '../../modules/survey/scale-collection-guard'

const registry=vi.hoisted(()=>({packages:[] as import('../../modules/situational/situation-package').SituationPackage[]}))
vi.mock('../../modules/situational/situation-package.registry',async original=>{
 const actual=await original<typeof import('../../modules/situational/situation-package.registry')>()
 return {...actual,getSituationPackage:(key:string,version:string)=>registry.packages.find(p=>p.key===key&&p.instrumentVersion===version)??actual.getSituationPackage(key,version),
  hasSituationPackage:(key:string,version:string)=>registry.packages.some(p=>p.key===key&&p.instrumentVersion===version)||actual.hasSituationPackage(key,version)}
})
vi.mock('../../modules/situational/onboarding/scientific-registry',async original=>{
 const actual=await original<typeof import('../../modules/situational/onboarding/scientific-registry')>()
 return {...actual,getSituationalScientificDeclaration:(key:string,version:string)=>registry.packages.some(p=>p.key===key&&p.instrumentVersion===version)?createSjtNativeV1ScientificDeclaration():actual.getSituationalScientificDeclaration(key,version)}
})
const url=integrationDatabaseUrl('SURVEY_FOLLOWUP_TEST_DATABASE_URL')
const suite=url?describe:describe.skip
suite('new native governance grants on isolated synthetic PostgreSQL',()=>{
 let system:string,manager:string,owner:string
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID(),tokenVersion:0}
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64))
  system=(await db.user.create({data:{username:'native-system-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN'}})).id
  manager=(await db.user.create({data:{username:'native-manager-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING'}})).id
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager,entry:'SURVEY',grantedBy:system}})
  owner=(await db.user.create({data:{username:'native-owner-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SURVEY'}})).id
  const login='r'+randomUUID().replace(/-/g,'').slice(0,18)
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:manager}})
  await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic-only'}})
  registry.packages=[compileSjtNativeV1Fixture().package,createSjtNativeStagedPackage()].map(p=>({...p,releaseStatus:'PUBLISHED'}))
 })
 afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect();vi.unstubAllEnvs()})
 it('stops only the revoked exact researcher grant, retaining a completed native child and serializing stop with collection',async()=>{
  const pkg=registry.packages[1],submitted=await submitGovernedSource(system,{requestId:randomUUID(),source:{kind:'SJT',sourceId:'registry:'+pkg.key,sourceVersion:pkg.instrumentVersion},version:'scope-'+randomUUID(),title:'Synthetic scoped stop',report:null,reference:{}},proof)
  await approveGovernedTool(system,submitted.id,{expectedVersion:submitted.version,hash:submitted.hash,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Synthetic scope approval'},proof)
  expect((await db.$queryRaw<Array<{decision:string}>>`SELECT decision FROM survey_tool_policies WHERE product='SURVEY' AND resource_key=${'governed-release:'+submitted.id} AND fingerprint=${submitted.hash}`)[0]?.decision).toBe('APPROVED')
  const secondOwner=(await db.user.create({data:{username:'native-other-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SURVEY'}})).id
  const login='r'+randomUUID().replace(/-/g,'').slice(0,18)
  await db.surveyAccount.create({data:{userId:secondOwner,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:secondOwner,status:'ACTIVE',grantedBy:manager}})
  await db.surveyMfaCredential.create({data:{userId:secondOwner,enabled:true,secretCipher:'synthetic-only'}})
  const setup=async(actor:string)=>{
   const grant=await grantCatalogSource(manager,actor,{kind:'SJT',sourceId:'survey-tool:'+submitted.id,sourceVersion:submitted.hash}),projectId=randomUUID()
   await db.surveyProject.create({data:{id:projectId,ownerUserId:actor,title:'Synthetic scoped project',collectionMode:'SINGLE_UNLINKED'}})
   const draft=await importCatalogDraft(actor,projectId,grant.id,{requestId:randomUUID(),instrumentKey:'native',title:'Frozen scoped native'})
   const wave=await createWave(actor,projectId,{requestId:randomUUID(),title:'Synthetic scope',consentText:'Synthetic scope consent without human participants.',generalText:'Synthetic',instrumentIds:[draft.id],allowNewParticipants:true})
   await prepareWave(actor,projectId,wave.id,wave.revision);const prepared=await getWave(actor,projectId,wave.id),opened=await openWave(actor,projectId,wave.id,prepared.revision)
   const snapshot=(await db.surveyPublication.findUniqueOrThrow({where:{id:opened.publicationId!}})).compiledSnapshot as unknown as ResearchFrozenPublication
   const enter=async()=>{const a=await startSingleUnlinkedWave({publicId:opened.publicId,waveId:wave.id,entryToken:opened.entrySecret,consentVersion:1,consent:true});return {publicId:opened.publicId,attemptId:a.attemptId,accessCredential:a.accessCredential}}
   const participant=await enter(),child=await startSurveySituational(participant,'native')
   const input={submissionId:randomUUID(),attemptEpoch:1,definitionHash:snapshot.units[0].nativeSituational!.definitionHash,...syntheticNativeSituationalSubmission(snapshot.units[0],0,child.attempt.id)}
   const receipt=(await submitSurveySituationalFinal(participant,'native',child.attempt.id,input)).receipt!
   return {grant,snapshot,enter,participant,child,receipt,parent:{...participant,submissionId:randomUUID(),answers:{native:{}},situationalReferences:[receipt]}}
  }
  const stopped=await setup(owner),other=await setup(secondOwner)
  await revokeToolGrant(manager,stopped.grant.id)
  await expect(stopped.enter()).rejects.toMatchObject({statusCode:403})
  const stoppedFinal=await submitResearchFinal(stopped.parent)
  expect(stoppedFinal.status).toBe('COMPLETED')
  expect(await db.situationalRawSubmission.count({where:{attemptId:stopped.child.attempt.id}})).toBe(1)
  expect(await db.surveyWaveFinal.count({where:{attemptId:stopped.participant.attemptId}})).toBe(1)
  expect((await submitResearchFinal(other.parent)).status).toBe('COMPLETED')
  // A revocation cannot commit behind an already-verified collection write.
  let release!:()=>void,locked!:()=>void
  const ready=new Promise<void>(resolve=>{locked=resolve}),hold=new Promise<void>(resolve=>{release=resolve})
  const collection=db.$transaction(async tx=>{await assertSurveyScaleCollectionAllowed(tx,other.snapshot);locked();await hold},{timeout:10000})
  await ready
  const revoke=revokeToolGrant(manager,other.grant.id)
  try{
   let waiting=false
   for(let i=0;i<20&&!waiting;i++){
    const rows=await db.$queryRaw<Array<{waiting:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%UPDATE survey_tool_grants SET status=%') AS waiting`
    waiting=rows[0].waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10))
   }
   expect(waiting).toBe(true)
  }finally{release();await collection;await revoke}
  await expect(db.$transaction(tx=>assertSurveyScaleCollectionAllowed(tx,other.snapshot))).rejects.toMatchObject({statusCode:403})
  expect((await submitResearchFinal(other.parent)).status).toBe('COMPLETED')
 },60000)
 it('qualifies a real synthetic V2 author release and preserves concurrent child replay plus the configured report',async()=>{
  const template={...structuredClone(sjtNativeStagedTemplate),instrumentKey:'synthetic-author-governed-'+randomUUID()},compiled=compileSjtTemplate(template)
  const draft=await createSjtDraft({userId:manager,admin:false},template,{authorizationPolicy:null})
  await requestSjtReview({userId:manager,admin:false},draft.id,draft.revision,draft.contentDigest)
  await reviewSjtDraft({userId:system,admin:true},draft.id,draft.revision,draft.contentDigest,true,'Synthetic independently approved source')
  const release=await db.sjtAuthorRelease.findFirstOrThrow({where:{instrumentKey:template.instrumentKey}}),source={kind:'SJT' as const,sourceId:release.id,sourceVersion:release.instrumentVersion}
  const submitted=await submitGovernedSource(system,{requestId:randomUUID(),source,version:'1',title:'Synthetic actual author release',report:{version:'r1',template:{blocks:[{type:'METRIC',metricKey:'coordination',display:'RAW'}],limitations:[]}},reference:{}},proof)
  expect((await approveGovernedTool(system,submitted.id,{expectedVersion:submitted.version,hash:submitted.hash,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Synthetic governing approval'},proof)).state).toBe('ONLINE')
  expect((await db.$queryRaw<Array<{decision:string}>>`SELECT decision FROM survey_tool_policies WHERE product='SURVEY' AND resource_key=${'governed-release:'+submitted.id} AND fingerprint=${submitted.hash}`)[0]?.decision).toBe('APPROVED')
  const grant=await grantCatalogSource(manager,owner,{kind:'SJT',sourceId:'survey-tool:'+submitted.id,sourceVersion:submitted.hash}),projectId=randomUUID()
  await db.surveyProject.create({data:{id:projectId,ownerUserId:owner,title:'Synthetic actual source',collectionMode:'SINGLE_UNLINKED'}})
  const imported=await importCatalogDraft(owner,projectId,grant.id,{requestId:randomUUID(),instrumentKey:'native',title:'Synthetic native'})
  const wave=await createWave(owner,projectId,{requestId:randomUUID(),title:'Synthetic author wave',consentText:'Synthetic isolated consent with no actual participant.',generalText:'Synthetic',instrumentIds:[imported.id],allowNewParticipants:true})
  await prepareWave(owner,projectId,wave.id,wave.revision);const prepared=await getWave(owner,projectId,wave.id),opened=await openWave(owner,projectId,wave.id,prepared.revision)
  const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:opened.publicationId!}}),unit=(publication.compiledSnapshot as unknown as ResearchFrozenPublication).units[0]
  expect(unit.nativeSituational!.definitionHash).toBe(compiled.definitionHash)
  const attempt=await startSingleUnlinkedWave({publicId:opened.publicId,waveId:wave.id,entryToken:opened.entrySecret,consentVersion:1,consent:true}),p={publicId:opened.publicId,attemptId:attempt.attemptId,accessCredential:attempt.accessCredential}
  const child=await startSurveySituational(p,'native'),input={submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.nativeSituational!.definitionHash,...syntheticNativeSituationalSubmission(unit,0,child.attempt.id)}
  const receipts=await Promise.all([submitSurveySituationalFinal(p,'native',child.attempt.id,input),submitSurveySituationalFinal(p,'native',child.attempt.id,input)])
  expect(receipts[0].receipt).toEqual(receipts[1].receipt)
  expect((await readSurveySituational(p,'native',child.attempt.id)).receipt).toEqual(receipts[0].receipt)
  const command={...p,submissionId:randomUUID(),answers:{native:{}},situationalReferences:[receipts[0].receipt!]}
  await submitResearchFinal(command);await submitResearchFinal(command)
  const final=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:attempt.attemptId}})
  expect(await db.situationalRawSubmission.count({where:{attemptId:child.attempt.id}})).toBe(1)
  expect((await readSurveyStoredReport(owner,{projectId,waveId:wave.id,finalId:final.id,instrumentKey:'native'})).report.blocks).toContainEqual(expect.objectContaining({type:'METRIC',value:5}))
 },60000)
 it.each([1,2])('completes v%i approval and receipts; withdrawal blocks only new admissions while established participants complete',async version=>{
  const pkg=registry.packages[version-1],source={kind:'SJT' as const,sourceId:'registry:'+pkg.key,sourceVersion:pkg.instrumentVersion}
  await expect(grantCatalogSource(manager,owner,source)).rejects.toThrow()
  const submitted=await submitGovernedSource(system,{requestId:randomUUID(),source,version:'native-'+version+'-'+randomUUID(),title:'Synthetic native '+version,
   report:{version:'r1',template:{title:'Synthetic report',blocks:[{type:'METRIC',metricKey:'coordination',display:'RAW'}],limitations:[]}},reference:{}},proof)
  const approved=await approveGovernedTool(system,submitted.id,{expectedVersion:submitted.version,hash:submitted.hash,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Synthetic native approval'},proof)
  expect(approved.state,approved.blockers.join(';')).toBe('ONLINE')
  const trials=await db.$queryRaw<Array<{result:Record<string,unknown>;result_hash:string}>>`SELECT result,result_hash FROM survey_governed_trials WHERE tool_id=${submitted.id}`
  expect(trials).toHaveLength(3);for(const trial of trials){expect(canonicalHash(trial.result)).toBe(trial.result_hash);expect(trial.result.rawNative).toBeTruthy();expect(trial.result.report).toBeTruthy()}
  await expect(approveGovernedTool(system,submitted.id,{expectedVersion:submitted.version,hash:submitted.hash,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Stale approval'},proof)).rejects.toMatchObject({statusCode:409})
  const ref={kind:'SJT' as const,sourceId:'survey-tool:'+submitted.id,sourceVersion:submitted.hash}
  expect((await db.$queryRaw<Array<{decision:string}>>`SELECT decision FROM survey_tool_policies WHERE product='SURVEY' AND resource_key=${'governed-release:'+submitted.id} AND fingerprint=${submitted.hash}`)[0]?.decision).toBe('APPROVED')
  const grant=await grantCatalogSource(manager,owner,ref),projectId=randomUUID()
  await db.surveyProject.create({data:{id:projectId,ownerUserId:owner,title:'Synthetic native research',collectionMode:'SINGLE_UNLINKED'}})
  const draft=await importCatalogDraft(owner,projectId,grant.id,{requestId:randomUUID(),instrumentKey:'native',title:'Frozen native'})
  const wave=await createWave(owner,projectId,{requestId:randomUUID(),title:'Synthetic wave',consentText:'Synthetic isolated consent without human participants.',generalText:'Synthetic feedback',instrumentIds:[draft.id],allowNewParticipants:true,checkpointPolicy:{schemaVersion:1,enabled:true,ttlHours:1}})
  await prepareWave(owner,projectId,wave.id,wave.revision)
  const frozen=await getWave(owner,projectId,wave.id),opened=await openWave(owner,projectId,wave.id,frozen.revision)
  const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:opened.publicationId!}}),snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication,unit=snapshot.units[0]
  expect(unit.executionProtocol).toBe('SITUATIONAL_NATIVE_V1');expect(unit.nativeSituational).toMatchObject({attemptEpoch:1,definitionHash:canonicalHash(pkg.definition)})
  const enter=async()=>{const a=await startSingleUnlinkedWave({publicId:opened.publicId,waveId:wave.id,entryToken:opened.entrySecret,consentVersion:1,consent:true});return {publicId:opened.publicId,attemptId:a.attemptId,accessCredential:a.accessCredential}}
  const first=await enter(),inFlight=await enter(),notStarted=await enter()
  const oldChild=await startSurveySituational(inFlight,'native'),oldInput={submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.nativeSituational!.definitionHash,...syntheticNativeSituationalSubmission(unit,1,oldChild.attempt.id)}
  await saveSurveyCheckpoint(inFlight,{revision:0,answers:{native:{}}})
  const child=await startSurveySituational(first,'native')
  expect((await startSurveySituational(first,'native')).attempt.id).toBe(child.attempt.id)
  const input={submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.nativeSituational!.definitionHash,...syntheticNativeSituationalSubmission(unit,0,child.attempt.id)}
  await expect(submitSurveySituationalFinal(first,'native',child.attempt.id,{...input,definitionHash:'f'.repeat(64)})).rejects.toThrow()
  expect((await readSurveySituational(first,'native',child.attempt.id)).receipt).toBeUndefined()
  const accepted=await submitSurveySituationalFinal(first,'native',child.attempt.id,input)
  expect((await readSurveySituational(first,'native',child.attempt.id)).receipt).toEqual(accepted.receipt)
  expect((await submitSurveySituationalFinal(first,'native',child.attempt.id,input)).receipt).toEqual(accepted.receipt)
  const parent={...first,submissionId:randomUUID(),answers:{native:{}},situationalReferences:[accepted.receipt!]}
  await expect(submitResearchFinal({...parent,situationalReferences:[{...accepted.receipt!,payloadHash:'f'.repeat(64)}]})).rejects.toThrow()
  const receipt=await submitResearchFinal(parent)
  expect((await submitResearchFinal(parent)).receiptId).toBe(receipt.receiptId)
  const final=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:first.attemptId}})
  const result=decryptUnifiedRuntimePayload<{units:Array<{rawAnswers:unknown;nativeReference:unknown}>}>(final.resultsCipher)
  expect(result.units[0]).toMatchObject({rawAnswers:{},nativeReference:accepted.receipt})
  expect(JSON.stringify(await readGeneralForOwnAttempt(first))).not.toContain('rawNative')
  const current=await governedRow(db,submitted.id)
  await withdrawGovernedTool(system,submitted.id,current.version,'Synthetic stop new admissions',proof)
  await expect(enter()).rejects.toThrow()
  const resumed=await startSurveySituational(notStarted,'native'),resumedInput={submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.nativeSituational!.definitionHash,...syntheticNativeSituationalSubmission(unit,0,resumed.attempt.id)}
  const resumedReceipt=(await submitSurveySituationalFinal(notStarted,'native',resumed.attempt.id,resumedInput)).receipt!
  expect((await submitResearchFinal({...notStarted,submissionId:randomUUID(),answers:{native:{}},situationalReferences:[resumedReceipt]})).status).toBe('COMPLETED')
  await expect(getOwnResearchTask(inFlight)).resolves.toBeDefined()
  await expect(readSurveyCheckpoint(inFlight)).resolves.toBeDefined()
  await saveSurveyCheckpoint(inFlight,{revision:1,answers:{native:{}}})
  const resumedChildReceipt=(await submitSurveySituationalFinal(inFlight,'native',oldChild.attempt.id,oldInput)).receipt!
  const inFlightFinal=await submitResearchFinal({...inFlight,submissionId:randomUUID(),answers:{native:{}},situationalReferences:[resumedChildReceipt]})
  expect(inFlightFinal.status).toBe('COMPLETED')
  expect(await db.situationalRawSubmission.count({where:{attemptId:oldChild.attempt.id}})).toBe(1)
  expect(await db.surveyWaveFinal.count({where:{attemptId:inFlight.attemptId}})).toBe(1)
  expect((await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:inFlight.attemptId}})).status).toBe('COMPLETED')
  expect((await submitResearchFinal(parent)).receiptId).toBe(receipt.receiptId)
  // No historical-report policy change or deletion is inferred from this stop.
  expect((await readSurveyStoredReport(owner,{projectId,waveId:wave.id,finalId:final.id,instrumentKey:'native'})).report.blocks).toHaveLength(1)
  expect(await db.surveyWaveFinal.findUniqueOrThrow({where:{id:final.id}})).toEqual(final)
 },60000)
})
