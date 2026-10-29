import {validateSurveyScaleTimings,type SurveyScaleTimings} from '../../modules/survey/timing.definition'
import {readSurveyScalePresentation} from '../../modules/survey/catalog-scale.presentation'
import {dryRunSurveyForm} from '../../modules/survey/final.compute'
import {it,expect,vi} from 'vitest'
import fs from 'node:fs'
import {randomUUID,createHmac} from 'node:crypto'
import type {Request,Response} from 'express'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {changeEntryGrant} from '../../modules/admin-permissions/service'
import {inviteResearcher,redeemResearcherInvite} from '../../modules/survey/governance.service'
import {startSurveyMfaEnrollment,completeSurveyMfa,totpAt} from '../../modules/survey/mfa.service'
import * as tools from '../../modules/survey/governed-tool.service'
import * as packages from '../../modules/survey/governed-package.service'
import {createDraft,updateDraft} from '../../modules/survey/builder.service'
import {createWave,getWave} from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {startSingleUnlinkedWave} from '../../modules/survey/admission.service'
import {submitResearchFinal,readGeneralForOwnAttempt} from '../../modules/survey/final.service'
import {readGovernedPackageReports} from '../../modules/survey/governed-package.reports'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {readInstance} from '../../modules/bundle-product/instance'
import {publishPackage} from '../../modules/bundle-product/package-release'
import {hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {getCatalogSourceSnapshot} from '../../modules/survey/catalog.sources'
import type {ScaleDefinitionV2} from '../../modules/scale/scale-definition'
import * as scorer from '../../modules/scale/scale-scoring'
import * as profile from '../../modules/assessment-bundle/report-facts'

const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),directory=process.env.EVC_EVIDENCE_DIRECTORY,fixture=process.env.EVC_RUNTIME_FIXTURE
const test=url&&directory&&fixture?it:it.skip
/** Checkpoint each normal publication once; setup repair never repeats successful trial/scoring. */
test('publishes a whole native Survey Bundle, preserves single feedback and saves audience-restricted profile without rescoring on read/replay',async()=>{
 requireIsolatedReleaseDatabase(url!);const input=JSON.parse(fs.readFileSync(fixture!,'utf8')) as {compositeId:string;signingKey:string}
 const file=directory+'/survey-native-checkpoint.json',state:Record<string,unknown>=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{}
 const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600})
 async function once<T>(key:string,work:()=>Promise<T>):Promise<T>{if(state[key])return state[key] as T;const value=await work();state[key]=value;save();return value}
 const oldKey=process.env.BUNDLE_REVIEW_SIGNING_KEY,oldMfa=process.env.SURVEY_MFA_ENCRYPTION_KEY
 process.env.BUNDLE_REVIEW_SIGNING_KEY=input.signingKey;process.env.SURVEY_MFA_ENCRYPTION_KEY='3'.repeat(64)
 process.env.SURVEY_WORKSPACE_ENABLED='true';process.env.SURVEY_PUBLICATION_ENABLED='true';process.env.BUNDLE_PRODUCTS_ENABLED='true'
 const proof=()=>({tokenVersion:0,adminSessionId:'synthetic-survey-strong-proof',adminVerifiedAt:Date.now()/1000})
 try{
 const source=await db.compositeAssessment.findUniqueOrThrow({where:{id:input.compositeId},include:{bundleInstance:true,items:{include:{scale:true}}}}),system=await db.user.findUniqueOrThrow({where:{id:source.createdBy!}})
 const reviewer=await once('reviewer',()=>db.user.create({data:{username:'evc-survey-reviewer-'+randomUUID(),role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING',passwordHash:'synthetic-only'}}))
 const manager=await once('manager',async()=>{const u=await db.user.create({data:{username:'evc-survey-manager-'+randomUUID(),accountDomain:'TRAINING',platformRole:'STANDARD',role:'STUDENT',passwordHash:'synthetic-only'}});await changeEntryGrant({actorUserId:system.id,targetUserId:u.id,entry:'SURVEY',active:true,expectedVersion:0,reason:'Synthetic Survey package manager',actorSession:proof()});return u})
 const owner=await once('owner',async()=>{
  const invite=await inviteResearcher(manager.id),login='evc_r_'+randomUUID().replace(/-/g,'').slice(0,16);let challenge=''
  const req={secure:false} as Request,res={append:(name:string,value:string)=>{if(name==='Set-Cookie'&&value.startsWith('huisurvey_mfa_pending='))challenge=decodeURIComponent(value.split(';')[0].split('=')[1])}} as unknown as Response
  await redeemResearcherInvite(req,res,invite.token,login,'SyntheticEvcOnly123')
  const enrollment=await startSurveyMfaEnrollment(challenge);if(!enrollment)throw new Error('MFA_ENROLLMENT_REQUIRED')
  const encoded=new URL(enrollment.otpauthUri).searchParams.get('secret')!,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of encoded)bits+=alphabet.indexOf(c).toString(2).padStart(5,'0')
  const secret=Buffer.from((bits.match(/.{8}/g)??[]).map(b=>parseInt(b,2)));expect(await completeSurveyMfa(challenge,totpAt(secret,Math.floor(Date.now()/30000)),'ENROLL')).not.toBeNull()
  return db.surveyAccount.findUniqueOrThrow({where:{normalizedLogin:login}})
 })
 const project=await once('project',()=>db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner.userId,title:'数学学习动机｜原生整包试验',collectionMode:'SINGLE_UNLINKED'}}))
 const native=readInstance(source.bundleInstance!).frozen.declarativePackage!;if(native.schemaVersion!==2)throw new Error('PROFILE_PACKAGE_REQUIRED')
 await once('renewal',async()=>{const review={contentHash:hashDeclarativePackage(native),reviewerId:reviewer.id,expiresAt:new Date(Date.now()+3600000).toISOString(),claims:['cross_source_condition'],scientific:true,rights:true,language:true,report:true};await publishPackage(db,system.id,native.manifest.definition.bundleKey,native.manifest.definition.bundleVersion,{...review,signature:createHmac('sha256',input.signingKey).update(canonicalJsonString(review)).digest('hex')});return true})
 async function approve(id:string){const row=await tools.governedRow(db,id);if(row.state==='ONLINE')return row;if(row.state!=='SUBMITTED')throw new Error('CHECKPOINT_TOOL_STATE_'+row.state);const result=await tools.approveGovernedTool(reviewer.id,id,{expectedVersion:row.version,hash:row.snapshot_hash,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Independent native Survey synthetic review'},proof());expect(result.state,result.blockers.join(';')).toBe('ONLINE');return tools.governedRow(db,id)}
 const components:Array<{slotKey:string;source:{type:'GOVERNED';id:string;hash:string}}>=[]
 for(const slot of native.manifest.definition.slots){
  const id=await once('component-'+slot.slotKey,async()=>{
   if(slot.unitType==='FORM'){const draft=await db.surveyInstrumentDraft.findFirst({where:{projectId:project.id,instrumentKey:'grade',catalogGrantId:null}})??await createDraft(owner.userId,project.id,{requestId:randomUUID(),instrumentKey:'grade',kind:'FORM',title:'年级'});const updated=await updateDraft(owner.userId,project.id,draft.id,{revision:draft.revision,title:'年级',definition:{schemaVersion:2,pages:[{pageKey:'context',title:'本次学习情境',questions:[{itemKey:'grade',type:'NUMBER',prompt:'当前年级（七至十二年级适用）',required:true,min:1,max:12,integerOnly:true,options:[],rows:[]}]}]}});return (await tools.submitOwnedSurveyTool(owner.userId,project.id,draft.id,{requestId:randomUUID(),revision:updated.revision,version:'1.0.0',statement:'Synthetic declared grade form',reference:{}})).id}
   const item=source.items.find(i=>i.scale?.code===slot.instrumentKey)!,ref={kind:'SCALE' as const,sourceId:item.scaleId!,sourceVersion:slot.instrumentVersion},unit=await getCatalogSourceSnapshot({actorUserId:system.id,ref}),d=unit.compiledDefinition as ScaleDefinitionV2
   return (await tools.submitGovernedSource(system.id,{requestId:randomUUID(),source:ref,version:'evc-native-'+randomUUID(),title:item.scale!.name,report:{version:'1.0.0',audience:'student',template:{title:item.scale!.name,blocks:d.scoring.scores.map(s=>({type:'METRIC' as const,metricKey:s.key,label:s.label,display:'RAW' as const})),limitations:[]}},reference:{nativeBundleSource:source.id}},proof())).id
  })
  const row=await approve(id);components.push({slotKey:slot.slotKey,source:{type:'GOVERNED' as const,id:row.id,hash:row.snapshot_hash}})
 }
 const bundleId=await once('bundleId',async()=>{const ref=await tools.previewSurveyNativeSource(system.id,source.id);return (await tools.submitGovernedPackage(system.id,{requestId:randomUUID(),family:'BUNDLE',toolKey:'evc_native_'+randomUUID().replace(/-/g,''),version:'1.0.0',title:'数学学习动机综合画像｜研究试验',components,report:null,nativeBundle:{compositeId:source.id,definitionHash:ref.definitionHash,bindingsHash:ref.bindingsHash,context:[{contextKey:'grade_level',slotKey:'context',itemKey:'grade'}]},reference:{sourceArchive:native.profile.sourceArchiveHash}},proof())).id})
 const approved=await approve(bundleId)
 const grant=await once('grant',()=>packages.grantSurveyPackage(manager.id,{requestId:randomUUID(),toolId:approved.id,hash:approved.snapshot_hash,userId:owner.userId,reason:'Explicit exact WHOLE native Bundle use, no standalone rights'}))
 const imported=await once('imported',()=>packages.importSurveyPackage(owner.userId,project.id,grant.id,randomUUID()))
 const wave=await once('wave',()=>createWave(owner.userId,project.id,{requestId:randomUUID(),title:'数学学习动机试验',consentText:'合成验收：数学学习动机理论试验，仅适用七至十二年级，不作诊断或排名。',generalText:'作答已保存。',instrumentIds:imported.bindings.map(b=>b.draftId),allowNewParticipants:true}))
 await once('prepared',async()=>{await prepareWave(owner.userId,project.id,wave.id,wave.revision,undefined,components.filter(c=>c.slotKey!=='context').map(c=>({instrumentId:imported.bindings.find(b=>b.slotKey===c.slotKey)!.draftId,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1' as const,mode:'DESCRIPTIVE' as const,metricKeys:native.evidence.filter(e=>e.slotKey===c.slotKey).map(e=>e.selector),release:'AFTER_FINAL' as const}})));return true})
 const opened=await once('opened',async()=>{const current=await getWave(owner.userId,project.id,wave.id);return openWave(owner.userId,project.id,wave.id,current.revision)})
 const attempt=await once('attempt',()=>startSingleUnlinkedWave({publicId:opened.publicId,waveId:wave.id,entryToken:opened.entrySecret,consentVersion:1,consent:true}))
 const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:opened.publicationId!}}),snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication,answers:Record<string,Record<string,string|number>>={}
 for(const binding of imported.bindings){const u=snapshot.units.find(u=>u.draftId===binding.draftId)!;if(u.kind==='FORM'){answers[u.instrumentKey]={grade:9};dryRunSurveyForm(u.displayDefinition,answers[u.instrumentKey]);continue}answers[u.instrumentKey]=Object.fromEntries(Object.keys(u.sourceAnswerMapping!.items).map((key,i)=>{const value=binding.slotKey==='ase'?[2,2,2,2,3][i]:5;return [key,Object.entries(u.sourceAnswerMapping!.options).find(([,v])=>Number(v)===value)![0]]}))}
 const itemTimings:SurveyScaleTimings=Object.fromEntries(snapshot.units.filter(u=>u.kind==='SCALE'&&readSurveyScalePresentation(u.displayDefinition).presentationMode==='ONE_BY_ONE').map(u=>[u.instrumentKey,Object.fromEntries(readSurveyScalePresentation(u.displayDefinition).items.map(item=>[item.itemKey,{schemaVersion:1 as const,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))]))
 validateSurveyScaleTimings(snapshot,answers,itemTimings,true)
 const submissionId=await once('submissionId',async()=>randomUUID()),proofInput={publicId:opened.publicId,attemptId:attempt.attemptId,accessCredential:attempt.accessCredential},finalInput={...proofInput,submissionId,answers,itemTimings}
 await once('final',()=>submitResearchFinal(finalInput))
 const final=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:attempt.attemptId}})
 const scoreSpy=vi.spyOn(scorer,'scoreScale').mockImplementation(()=>{throw new Error('SURVEY_REOPEN_MUST_NOT_RESCORE')}),profileSpy=vi.spyOn(profile,'projectBundleReportFacts').mockImplementation(()=>{throw new Error('SURVEY_REOPEN_MUST_NOT_REPROFILE')})
 try{
 const feedback=await readGeneralForOwnAttempt(proofInput);expect(feedback).toMatchObject({kind:'DESCRIPTIVE',measurements:expect.any(Array),nativeBundles:[{status:'READY',profileView:{profileId:'P4',actions:[]}}]});if(!('measurements'in feedback)||!('nativeBundles'in feedback))throw new Error('NATIVE_FEEDBACK_REQUIRED');expect(feedback.measurements).toHaveLength(2)
 const reports=await readGovernedPackageReports(owner.userId,{projectId:project.id,waveId:wave.id,finalId:final.id});expect(reports.list[0].artifact).toMatchObject({nativeBundle:{profileView:{state:'WITHHELD',profileId:null,constructs:[]}}});await expect(readGovernedPackageReports(manager.id,{projectId:project.id,waveId:wave.id,finalId:final.id})).rejects.toThrow()
 expect(await submitResearchFinal(finalInput)).toMatchObject({idempotent:true});expect(scoreSpy).not.toHaveBeenCalled();expect(profileSpy).not.toHaveBeenCalled();expect(await db.surveyWaveFinal.count({where:{attemptId:attempt.attemptId}})).toBe(1)
 fs.writeFileSync(directory+'/survey-native-result.json',JSON.stringify({status:'PASS',projectId:project.id,waveId:wave.id,publicId:opened.publicId,attemptId:attempt.attemptId,finalId:final.id,sourceHash:source.bundleInstance!.definitionHash,factsHash:feedback.nativeBundles?.[0]?.factsHash,singleReports:feedback.measurements.length,researcherProfileWithheld:true,managerDataDenied:true,replayed:true,noRescore:true,noReprofile:true},null,2))
 }finally{scoreSpy.mockRestore();profileSpy.mockRestore()}
 }finally{await db.$disconnect();if(oldKey===undefined)delete process.env.BUNDLE_REVIEW_SIGNING_KEY;else process.env.BUNDLE_REVIEW_SIGNING_KEY=oldKey;if(oldMfa===undefined)delete process.env.SURVEY_MFA_ENCRYPTION_KEY;else process.env.SURVEY_MFA_ENCRYPTION_KEY=oldMfa}
},120000)
