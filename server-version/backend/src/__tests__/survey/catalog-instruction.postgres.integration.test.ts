import {randomUUID} from 'node:crypto'
import {afterAll,describe,expect,it,vi} from 'vitest'
const suite=process.env.PR356_INSTRUCTION_ISOLATED==='1'?describe:describe.skip
suite('ordinary published SCALE instruction through actual Survey delivery',()=>{
 let db:any
 afterAll(async()=>{if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}vi.unstubAllEnvs()})
 it('reads the exact source, grants/imports/publishes/freezes, and displays the frozen instruction publicly',async()=>{
  const u=new URL(process.env.DATABASE_URL!)
  if(process.env.NODE_ENV!=='test'||!['127.0.0.1','localhost'].includes(u.hostname)||u.port!=='55439'||!/^\/pr356_instruction_test_[a-f0-9]{10}$/.test(u.pathname))throw new Error('Explicit isolated cloned synthetic fixture required')
  vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true');vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64))
  db=(await import('../../config/database')).prisma
  const system=await db.user.findFirstOrThrow({where:{username:{startsWith:'dot356-system-'}}})
  if(await db.user.count()!==5||await db.scale.count()!==1)throw new Error('Retained synthetic vertical fixture required')
  const scale=await db.scale.findFirstOrThrow(),source=(await import('../../modules/scale/onboarding/instrument-registry')).getScaleInstrumentSource(scale.code,scale.instrumentVersion)!
  const expectedInstruction=source.instruction?.text??'Frozen administration instruction of this exact Scale version'
  const publication=await import('../../modules/scale/onboarding/publish')
  const input={instrumentKey:scale.code,instrumentVersion:scale.instrumentVersion,actorUserId:system.id,visibility:'HIDDEN' as const,allowedProducts:['TRAINING','SURVEY'] as Array<'TRAINING'|'SURVEY'>}
  const plan=await publication.planStandardScalePublication(db,input);expect(plan.blockers).toEqual([])
  await publication.publishStandardScale(db,{...input,expectedProofHash:plan.proofHash})
  // Prove STANDARD source resolution does not trust stale row wording.
  await db.scale.update({where:{id:scale.id},data:{instruction:source.instruction?'Stale row text':expectedInstruction}})
  const manager=await db.user.create({data:{username:'instruction-manager-'+randomUUID(),passwordHash:'SYNTHETIC',accountDomain:'TRAINING'}})
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager.id,entry:'SURVEY',grantedBy:system.id}})
  const owner=(await db.user.create({data:{username:'instruction-research-'+randomUUID(),passwordHash:'SYNTHETIC',accountDomain:'SURVEY'}})).id
  const login='r'+randomUUID().replace(/-/g,'').slice(0,18)
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:manager.id}})
  await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic-only'}})
  const ref={kind:'SCALE' as const,sourceId:scale.id,sourceVersion:scale.instrumentVersion}
  const snapshot=await (await import('../../modules/survey/catalog.sources')).getCatalogSourceSnapshot({actorUserId:manager.id,ref},db)
  expect(snapshot.instruction).toBe(expectedInstruction)
  const grant=await (await import('../../modules/survey/catalog.service')).grantCatalogSource(manager.id,owner,ref)
  const pid=randomUUID();await db.surveyProject.create({data:{id:pid,ownerUserId:owner,title:'Synthetic ordinary SCALE instructions',collectionMode:'SINGLE_UNLINKED'}})
  const draft=await (await import('../../modules/survey/builder.service')).importCatalogDraft(owner,pid,grant.id,{requestId:randomUUID(),instrumentKey:'ordinaryscale',title:'Ordinary source'})
  await (await import('../../modules/survey/measurement-publication.service')).publishSurveyMeasurementDraft(owner,pid,draft.id,draft.revision)
  const waves=await import('../../modules/survey/waves.service'),publish=await import('../../modules/survey/waves.publish')
  const wave=await waves.createWave(owner,pid,{requestId:randomUUID(),title:'Instruction freeze',consentText:'Synthetic isolated test consent, no human response.',generalText:'Synthetic test.',instrumentIds:[draft.id],allowNewParticipants:true})
  await publish.prepareWave(owner,pid,wave.id,wave.revision)
  const frozen=await waves.getWave(owner,pid,wave.id),opened=await publish.openWave(owner,pid,wave.id,frozen.revision)
  await db.scale.update({where:{id:scale.id},data:{instruction:'Changed after freeze'}})
  const admitted=await (await import('../../modules/survey/admission.service')).startSingleUnlinkedWave({publicId:opened.publicId,waveId:wave.id,entryToken:opened.entrySecret,consentVersion:1,consent:true})
  const task=await (await import('../../modules/survey/task.public')).getOwnResearchTask({publicId:opened.publicId,attemptId:admitted.attemptId,accessCredential:admitted.accessCredential})
  expect(task.units[0].instruction).toBe(expectedInstruction)
 },120000)
})
