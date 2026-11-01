import {it,expect,vi} from 'vitest'
import installationCases from './fixtures/b10-installation-cases.json'
import {randomUUID,createHmac} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {runtimePackageFixture} from './runtime-packages.fixture'
import {parseDeclarativePackage,hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {parseBundleContextDefinition} from '../../modules/assessment-bundle/context'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {BundleDefinitionProvider} from '../../modules/bundle-product/definition-provider'
import {createBundleProductService} from '../../modules/bundle-product/service'
import {installPackage,publishPackage} from '../../modules/bundle-product/package-release'
import {installScaleInstrument,planScaleInstrumentInstall} from '../../modules/scale/onboarding/install'
import {planStandardScalePublication,publishStandardScale} from '../../modules/scale/onboarding/publish'
import {getScaleInstrumentRuntimePolicy} from '../../modules/scale/onboarding/instrument-registry'
import {canonicalHash,canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {getCatalogSourceSnapshot} from '../../modules/survey/catalog.sources'
import * as tools from '../../modules/survey/governed-tool.service'
import * as packages from '../../modules/survey/governed-package.service'
import {createDraft,updateDraft} from '../../modules/survey/builder.service'
import {createWave,getWave} from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {startSingleUnlinkedWave} from '../../modules/survey/admission.service'
import {submitResearchFinal,readGeneralForOwnAttempt} from '../../modules/survey/final.service'
import {withdrawSingleResearchAttempt} from '../../modules/survey/identity.service'
import {readSurveyScalePresentation,scalePresentationOptions} from '../../modules/survey/catalog-scale.presentation'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
import type {SurveyComputedFinal} from '../../modules/survey/final.compute'
import type {ScaleDefinitionV2} from '../../modules/scale/scale-definition'
import * as scorer from '../../modules/scale/scale-scoring'
import * as engine from '../../modules/assessment-bundle/report-facts'
import * as demographic from '../../modules/assessment-context/context'

const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL')
const directory=url?(process.env.BUNDLE_RUNTIME_EVIDENCE_DIRECTORY??fs.mkdtempSync(path.join(tmpdir(),'bundle-schema3-native-'))):undefined
const test=url?it:it.skip
/** One real service chain on a disposable migrated DB. No browser, load test or
 * source readiness claim for any other Bundle. Checkpoints retain setup on repair. */
test('installs one schema3 native Bundle, grants exact use, commits FINAL and reopens frozen feedback under current authority',async()=>{
 requireIsolatedReleaseDatabase(url!)
 const file=path.join(directory!,'checkpoint.json'),state:Record<string,any>=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{}
 const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600})
 const once=async<T>(key:string,work:()=>Promise<T>):Promise<T>=>{if(state[key])return state[key];const v=await work();state[key]=v;save();return v}
 const signing='isolated-schema3-synthetic-signing-only'
 vi.stubEnv('BUNDLE_REVIEW_SIGNING_KEY',signing)
 vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true');vi.stubEnv('BUNDLE_PRODUCTS_ENABLED','true')
 const proof=()=>({tokenVersion:0,adminSessionId:'isolated-schema3-proof',adminVerifiedAt:Date.now()/1000})
 // A source-owned test declaration, not the real B10 content release. Keep only
 // string/boolean context so this short chain does not test enum authoring.
 const raw=structuredClone(runtimePackageFixture('B10'))
 raw.manifest.definition.bundleKey='synthetic_native_schema3_dob'
 raw.manifest.definition.name='Synthetic native schema3 DOB chain'
 const context=parseBundleContextDefinition(raw.context)
 for(const f of context.fields)if(f.valueType==='enum'){f.valueType='string';delete f.enumValues}
 raw.context=context
 raw.fixtures=installationCases as typeof raw.fixtures
 const pack=parseDeclarativePackage(raw)
 try{
  const actors=await once('actors',()=>db.$transaction(async tx=>{
   const make=(name:string,role:'SYSTEM_ADMIN'|'STANDARD',domain:'TRAINING'|'SURVEY'='TRAINING')=>tx.user.create({data:{username:name+'-'+randomUUID(),role:role==='SYSTEM_ADMIN'?'ADMIN':'STUDENT',platformRole:role,accountDomain:domain,passwordHash:'synthetic-only'}})
   const system=await make('native-system','SYSTEM_ADMIN'),reviewer=await make('native-reviewer','SYSTEM_ADMIN'),manager=await make('native-manager','STANDARD'),owner=await make('native-owner','STANDARD','SURVEY')
   await tx.adminEntryGrant.create({data:{id:randomUUID(),userId:manager.id,entry:'SURVEY',grantedBy:system.id}})
   const login='r'+randomUUID().replace(/-/g,'').slice(0,18)
   await tx.surveyAccount.create({data:{userId:owner.id,loginName:login,normalizedLogin:login}})
   await tx.surveyResearcherGrant.create({data:{userId:owner.id,status:'ACTIVE',grantedBy:manager.id}})
   await tx.surveyMfaCredential.create({data:{userId:owner.id,enabled:true,secretCipher:'synthetic-fixture-only'}})
   return {system,reviewer,manager,owner}
  }))
  const {system,reviewer,manager,owner}=actors
  const bindings:Array<{slotKey:string;resourceId:string}>=[]
  for(const slot of pack.manifest.definition.slots.filter(s=>s.unitType==='SCALE')){
   const id=await once('scale-'+slot.slotKey,async()=>{
    const request={instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,actorUserId:system.id,deploymentPolicy:{schemaVersion:2 as const,revision:1,locale:'zh-CN',territory:'CN',deploymentModes:['STANDALONE','COMPOSITE'] as ('STANDALONE'|'COMPOSITE')[],runtimePolicyHash:getScaleInstrumentRuntimePolicy(slot.instrumentKey,slot.instrumentVersion)!.runtimePolicyHash,localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE' as const,completionWindowMs:86400000}}
    expect((await planScaleInstrumentInstall(db,request)).blockers).toEqual([])
    await installScaleInstrument(db,request)
    const publish={instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,actorUserId:system.id,visibility:'HIDDEN' as const,allowedProducts:['TRAINING','SURVEY'] as ('TRAINING'|'SURVEY')[]}
    const preview=await planStandardScalePublication(db,publish);expect(preview.blockers).toEqual([])
    return (await publishStandardScale(db,{...publish,expectedProofHash:preview.proofHash})).scaleId
   });bindings.push({slotKey:slot.slotKey,resourceId:id})
  }
  await once('installed',()=>installPackage(db,system.id,pack))
  await once('published',async()=>{
   const review={contentHash:hashDeclarativePackage(pack),reviewerId:reviewer.id,expiresAt:new Date(Date.now()+3600000).toISOString(),claims:['independent_summary','cross_source_condition'],scientific:true,rights:true,language:true,report:true}
   await publishPackage(db,system.id,pack.manifest.definition.bundleKey,pack.manifest.definition.bundleVersion,{...review,signature:createHmac('sha256',signing).update(canonicalJsonString(review)).digest('hex')});return true
  })
  const course=await once('course',()=>db.course.create({data:{creatorId:system.id,title:'Synthetic schema3 source course',courseCode:'schema3-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}}))
  const source=await once('source',async()=>{
   const product=createBundleProductService(new BundleDefinitionProvider([packageEntry(pack)])),actor={userId:system.id,role:system.role}
   const created=await product.create(actor,{requestId:randomUUID(),bundleKey:pack.manifest.definition.bundleKey,bundleVersion:pack.manifest.definition.bundleVersion,name:'Synthetic DOB source',courseId:course.id,publicEnabled:false,bindings})
   return product.publish(actor,created.id,created.revision)
  })
  const project=await once('project',()=>db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner.id,title:'Synthetic native schema3 chain',collectionMode:'SINGLE_UNLINKED'}}))
  const components:Array<{slotKey:string;source:{type:'GOVERNED';id:string;hash:string}}>=[]
  for(const slot of pack.manifest.definition.slots){
   const id=await once('component-'+slot.slotKey,async()=>{
    if(slot.unitType==='FORM'){
     const draft=await createDraft(owner.id,project.id,{requestId:randomUUID(),instrumentKey:'context',kind:'FORM',title:'Synthetic context'})
     const questions=context.fields.map(f=>({itemKey:f.contextKey,type:f.valueType==='boolean'?'SINGLE':'SHORT_TEXT',prompt:f.contextKey,required:f.required,rows:[],options:f.valueType==='boolean'?[{optionKey:'true',label:'是'},{optionKey:'false',label:'否'}]:[]}))
     const updated=await updateDraft(owner.id,project.id,draft.id,{revision:draft.revision,title:'Synthetic context',definition:{schemaVersion:2,pages:[{pageKey:'background',title:'Synthetic context',questions}]}})
     return (await tools.submitOwnedSurveyTool(owner.id,project.id,draft.id,{requestId:randomUUID(),revision:updated.revision,version:'1.0.0',statement:'Synthetic fixed context only',reference:{synthetic:true}})).id
    }
    const ref={kind:'SCALE' as const,sourceId:bindings.find(b=>b.slotKey===slot.slotKey)!.resourceId,sourceVersion:slot.instrumentVersion},unit=await getCatalogSourceSnapshot({actorUserId:system.id,ref}),d=unit.compiledDefinition as ScaleDefinitionV2
    return (await tools.submitGovernedSource(system.id,{requestId:randomUUID(),source:ref,version:'synthetic-'+randomUUID(),title:slot.slotKey,report:{version:'1.0.0',audience:'student',template:{title:slot.slotKey,blocks:d.scoring.scores.map(s=>({type:'METRIC' as const,metricKey:s.key,label:s.label,display:'RAW' as const})),limitations:[]}},reference:{synthetic:true}},proof())).id
   })
   await once('approved-'+slot.slotKey,async()=>{const r=await tools.governedRow(db,id);const a=await tools.approveGovernedTool(reviewer.id,id,{expectedVersion:r.version,hash:r.snapshot_hash,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Disposable synthetic runtime approval'},proof());expect(a.state,a.blockers.join(';')).toBe('ONLINE');return true})
   const row=await tools.governedRow(db,id);components.push({slotKey:slot.slotKey,source:{type:'GOVERNED' as const,id,hash:row.snapshot_hash}})
  }
  const wholeSubmitted=await once('wholeSubmitted',async()=>{const preview=await tools.previewSurveyNativeSource(system.id,source.id);return tools.submitGovernedPackage(system.id,{requestId:randomUUID(),family:'BUNDLE',toolKey:'synthetic_native_schema3_dob',version:'1.0.0',title:'Synthetic DOB whole package',components,report:null,nativeBundle:{compositeId:source.id,definitionHash:preview.definitionHash,bindingsHash:preview.bindingsHash,context:context.fields.map(f=>({contextKey:f.contextKey,slotKey:'context',itemKey:f.contextKey}))},reference:{synthetic:true}},proof())})
  await once('wholeApproved',async()=>{const r=await tools.governedRow(db,wholeSubmitted.id);const approved=await tools.approveGovernedTool(reviewer.id,r.id,{expectedVersion:r.version,hash:r.snapshot_hash,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Disposable synthetic whole-package approval'},proof());expect(approved.state,approved.blockers.join(';')).toBe('ONLINE');return true})
  const whole=await tools.governedRow(db,wholeSubmitted.id)
  const grant=await once('grant',()=>packages.grantSurveyPackage(manager.id,{requestId:randomUUID(),toolId:whole.id,hash:whole.snapshot_hash,userId:owner.id,reason:'Exact synthetic WHOLE Bundle grant'}))
  await expect(packages.importSurveyPackage(manager.id,project.id,grant.id,randomUUID())).rejects.toThrow()
  const imported=await once('imported',()=>packages.importSurveyPackage(owner.id,project.id,grant.id,randomUUID()))
  const wave=await once('wave',()=>createWave(owner.id,project.id,{requestId:randomUUID(),title:'Synthetic schema3 final',consentText:'Synthetic noncommercial test only. No human participant or diagnosis.',generalText:'Saved.',instrumentIds:imported.bindings.map((b:any)=>b.draftId),allowNewParticipants:true}))
  await once('prepared',async()=>{await prepareWave(owner.id,project.id,wave.id,wave.revision,undefined,imported.bindings.filter((b:any)=>b.slotKey!=='context').map((b:any)=>({instrumentId:b.draftId,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1' as const,mode:'DESCRIPTIVE' as const,metricKeys:pack.manifest.definition.slots.find(s=>s.slotKey===b.slotKey)!.valueSelectors!,release:'AFTER_FINAL' as const}})));return true})
  const opened=await once('opened',async()=>{const w=await getWave(owner.id,project.id,wave.id);return openWave(owner.id,project.id,wave.id,w.revision)})
  const attempt=await once('attempt',()=>startSingleUnlinkedWave({publicId:opened.publicId,waveId:wave.id,entryToken:opened.entrySecret,consentVersion:1,consent:true}))
  const snapshot=(await db.surveyPublication.findUniqueOrThrow({where:{id:opened.publicationId!}})).compiledSnapshot as unknown as ResearchFrozenPublication
  const answers:Record<string,unknown>={},timings:Record<string,unknown>={}
  for(const unit of snapshot.units){
   if(unit.kind==='FORM'){answers[unit.instrumentKey]={adult_confirmed:'true',birth_year_month:'1996-01'};continue}
   const display=readSurveyScalePresentation(unit.displayDefinition)
   answers[unit.instrumentKey]=Object.fromEntries(display.items.map(item=>[item.itemKey,scalePresentationOptions(display,item)[0].optionKey]))
   if(display.presentationMode==='ONE_BY_ONE')timings[unit.instrumentKey]=Object.fromEntries(display.items.map(item=>[item.itemKey,{schemaVersion:1,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))
  }
  const credential={publicId:opened.publicId,attemptId:attempt.attemptId,accessCredential:attempt.accessCredential},submissionId=await once('submissionId',async()=>randomUUID()),input={...credential,submissionId,answers,...(Object.keys(timings).length?{itemTimings:timings}:{})}
  await once('final',()=>submitResearchFinal(input))
  const final=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:attempt.attemptId}}),saved=decryptUnifiedRuntimePayload<SurveyComputedFinal>(final.resultsCipher),host=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:attempt.attemptId}})
  expect(saved.nativeBundleAdmissions![0].demographic).toMatchObject({frozenAt:host.startedAt.toISOString(),values:{birthYearMonth:'1996-01'}})
  expect(canonicalHash(saved)).toBe(final.resultsHash)
  expect(saved.nativeBundleReports![0].status).toBe('READY')
  const score=vi.spyOn(scorer,'scoreScale').mockImplementation(()=>{throw new Error('SAVED_READ_MUST_NOT_RESCORE')}),report=vi.spyOn(engine,'projectBundleReportFacts').mockImplementation(()=>{throw new Error('SAVED_READ_MUST_NOT_RECOMPUTE')}),age=vi.spyOn(demographic,'buildAssessmentContext').mockImplementation(()=>{throw new Error('SAVED_READ_MUST_NOT_REAGE')})
  try{
   const feedback=await readGeneralForOwnAttempt(credential)
   expect(feedback).toMatchObject({kind:'DESCRIPTIVE',measurements:expect.any(Array),nativeBundles:[{status:'READY',factsHash:saved.nativeBundleReports![0].factsHash,derivedView:{rows:expect.any(Array)}}]})
   if(!('measurements'in feedback))throw new Error('SINGLE_FEEDBACK_REQUIRED')
   expect(feedback.measurements).toHaveLength(2)
   expect(await readGeneralForOwnAttempt(credential)).toEqual(feedback)
   await expect(readGeneralForOwnAttempt({...credential,accessCredential:'x'.repeat(43)})).rejects.toThrow()
   expect(await submitResearchFinal(input)).toMatchObject({idempotent:true})
   expect(await db.surveyWaveFinal.count({where:{attemptId:attempt.attemptId}})).toBe(1)
   expect(score).not.toHaveBeenCalled();expect(report).not.toHaveBeenCalled();expect(age).not.toHaveBeenCalled()
   await withdrawSingleResearchAttempt(credential)
   await expect(readGeneralForOwnAttempt(credential)).rejects.toThrow()
   expect((await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:attempt.attemptId}})).resultsHash).toBe(final.resultsHash)
   fs.writeFileSync(path.join(directory!,'result.json'),JSON.stringify({status:'PASS',schemaVersion:3,installed:true,exactWholeGrant:true,wrongOwnerImportDenied:true,finalCommitted:true,singleReports:feedback.measurements.length,jointReady:true,frozenDobAndTime:true,resultsHash:final.resultsHash,reopenEqual:true,replayIdempotent:true,wrongCredentialDenied:true,withdrawnFeedbackDenied:true,noRescore:true,noRecompute:true,noReage:true,historyRetained:true,production:false},null,2),{mode:0o600})
  }finally{score.mockRestore();report.mockRestore();age.mockRestore()}
 }finally{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect();vi.unstubAllEnvs()}
},120000)
