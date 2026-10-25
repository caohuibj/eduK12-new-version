import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {submitGovernedSource,approveGovernedTool,governedRow,withdrawGovernedTool} from '../../modules/survey/governed-tool.service'
import {governedPolicyIdentity} from '../../modules/survey/governed-tool.model'
import {syntheticNativeSituationalSubmission} from '../../modules/survey/governed-tool.native-trial'
import {grantCatalogSource} from '../../modules/survey/catalog.service'
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
 it.each([1,2])('completes v%i approval/trials, exact grant, frozen child/parent receipts and old-attempt recovery',async version=>{
  const pkg=registry.packages[version-1],source={kind:'SJT' as const,sourceId:'registry:'+pkg.key,sourceVersion:pkg.instrumentVersion}
  await expect(grantCatalogSource(manager,owner,source)).rejects.toThrow()
  const submitted=await submitGovernedSource(system,{requestId:randomUUID(),source,version:'native-'+version,title:'Synthetic native '+version,
   report:{version:'r1',template:{title:'Synthetic report',blocks:[{type:'METRIC',metricKey:'coordination',display:'RAW'}],limitations:[]}},reference:{}},proof)
  const approved=await approveGovernedTool(system,submitted.id,{expectedVersion:submitted.version,hash:submitted.hash,decision:'APPROVE',reason:'Synthetic native approval'},proof)
  expect(approved.state,approved.blockers.join(';')).toBe('ONLINE')
  const trials=await db.$queryRaw<Array<{result:Record<string,unknown>;result_hash:string}>>`SELECT result,result_hash FROM survey_governed_trials WHERE tool_id=${submitted.id}`
  expect(trials).toHaveLength(3);for(const trial of trials){expect(canonicalHash(trial.result)).toBe(trial.result_hash);expect(trial.result.rawNative).toBeTruthy();expect(trial.result.report).toBeTruthy()}
  await expect(approveGovernedTool(system,submitted.id,{expectedVersion:submitted.version,hash:submitted.hash,decision:'APPROVE',reason:'Stale approval'},proof)).rejects.toMatchObject({statusCode:409})
  const ref={kind:'SJT' as const,sourceId:'survey-tool:'+submitted.id,sourceVersion:submitted.hash}
  await expect(grantCatalogSource(manager,owner,ref)).rejects.toThrow()
  await changeSurveyToolPolicy(manager,{...governedPolicyIdentity(await governedRow(db,submitted.id)),expectedVersion:0,decision:'APPROVED',paused:false,reason:'Synthetic entry approval'})
  const grant=await grantCatalogSource(manager,owner,ref),projectId=randomUUID()
  await db.surveyProject.create({data:{id:projectId,ownerUserId:owner,title:'Synthetic native research',collectionMode:'SINGLE_UNLINKED'}})
  const draft=await importCatalogDraft(owner,projectId,grant.id,{requestId:randomUUID(),instrumentKey:'native',title:'Frozen native'})
  const wave=await createWave(owner,projectId,{requestId:randomUUID(),title:'Synthetic wave',consentText:'Synthetic isolated consent without human participants.',generalText:'Synthetic feedback',instrumentIds:[draft.id],allowNewParticipants:true})
  await prepareWave(owner,projectId,wave.id,wave.revision)
  const frozen=await getWave(owner,projectId,wave.id),opened=await openWave(owner,projectId,wave.id,frozen.revision)
  const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:opened.publicationId!}}),snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication,unit=snapshot.units[0]
  expect(unit.executionProtocol).toBe('SITUATIONAL_NATIVE_V1');expect(unit.nativeSituational).toMatchObject({attemptEpoch:1,definitionHash:canonicalHash(pkg.definition)})
  const enter=async()=>{const a=await startSingleUnlinkedWave({publicId:opened.publicId,waveId:wave.id,entryToken:opened.entrySecret,consentVersion:1,consent:true});return {publicId:opened.publicId,attemptId:a.attemptId,accessCredential:a.accessCredential}}
  const first=await enter(),inFlight=await enter()
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
  // Previously frozen participants still use their original native protocol.
  const oldChild=await startSurveySituational(inFlight,'native'),oldInput={submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.nativeSituational!.definitionHash,...syntheticNativeSituationalSubmission(unit,1,oldChild.attempt.id)}
  const oldReceipt=await submitSurveySituationalFinal(inFlight,'native',oldChild.attempt.id,oldInput)
  await submitResearchFinal({...inFlight,submissionId:randomUUID(),answers:{native:{}},situationalReferences:[oldReceipt.receipt!]})
  expect(await db.surveyWaveFinal.findUniqueOrThrow({where:{id:final.id}})).toEqual(final)
 },60000)
})
