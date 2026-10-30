/** Opt-in follow-on to the fresh normal setup fixture. Checkpoints retain every
 * accepted write; reruns inspect/resume them instead of reinstalling/resetting. */
import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const suite=process.env.PRECISE_DUAL_REPORT_JOURNEY==='1'?describe:describe.skip
suite('Registered standard/fun reports: exact grants, real anonymous FINAL and frozen report consumers',()=>{
 let db:any,server:Server|undefined,base='',sign:any,state:any,source:any,system:any,manager:any,a:any,b:any,stage='readback'
 const events:any[]=[],observations:any[]=[]
 const key='cfq7_zh_cn_research',version='1.0.1'
 async function save(){await writeFile(process.env.PRECISE_DUAL_REPORT_CHECKPOINT!,JSON.stringify(state,null,2)+'\n',{mode:0o600})}
 async function req(actor:any,path:string,body?:any,status=200,recovery?:string){
  const token=actor?sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}):null
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173','X-CSRF-Token':'dual-report-journey',...(token?{Cookie:'ptool_session='+token+'; ptool_csrf=dual-report-journey'}:{}),...(recovery?{'X-Recovery-Token':recovery}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const payload=await response.json() as any
  events.push({stage,method:body===undefined?'GET':'POST',path:path.replace(/\/public\/composite-assessments\/[^/]+\/start$/,'/public/composite-assessments/:token/start'),status:response.status})
  expect(response.status,stage+': '+(payload.message??JSON.stringify(payload))).toBe(status);return payload.data
 }
 async function once(name:string,fn:()=>Promise<any>){if(state[name]!==undefined)return state[name];state[name]=await fn();await save();return state[name]}
 beforeAll(async()=>{
  const u=new URL(process.env.PRECISE_DUAL_REPORT_DATABASE_URL!);if(u.hostname!=='127.0.0.1'||u.port!=='55439'||!['/precise_dual_report_test_20261030','/precise_dual_report_test_20261030_v2'].includes(u.pathname)||u.username!=='precise_task1_runtime')throw Error('Named restricted isolated runtime required')
  state=JSON.parse(await readFile(process.env.PRECISE_DUAL_REPORT_CHECKPOINT!,'utf8'));expect(state.setupComplete).toBe(true)
  db=(await import('../../config/database')).prisma
  ;[system,manager,a,b]=await Promise.all(['system','manager','standardTeacher','funTeacher'].map(name=>db.user.findUniqueOrThrow({where:{id:state[name+'Id']}})))
  if(!state.publicationStarted){const [count]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_standard_releases`;expect(count.n).toBe(0);state.emptyApprovalReadback=true;await save()}
  source=(await import('../../modules/scale/onboarding/instrument-registry')).getScaleInstrumentSource(key,version)!
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard)
  app.use('/api/platform/survey-standard',(await import('../../modules/survey/standard-triplet.routes')).surveyStandardTripletRouter)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default)
  app.use('/api/public/composite-assessments',(await import('../../modules/composite/composite.public.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler);sign=(await import('../../utils/jwt')).generateToken
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_DUAL_REPORT_EVIDENCE??'/tmp/dual-report-journey.json',JSON.stringify({productionAccessed:false,stage,events,observations,scope:'Two synthetic adult anonymous CFQ completions, one shared scorer/input; existing normal installation, publication and mandatory approval trials. No old cognitive/native chains, no real accounts.'},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()))}if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('normally approves both R, grants different recipients and binds drafts without changing C/P or the installed default',async()=>{
  stage='normal-install-publication'
  await once('installed',async()=>{const {getScaleInstrumentRuntimePolicy}=await import('../../modules/scale/onboarding/instrument-registry'),runtime=getScaleInstrumentRuntimePolicy(key,version)!
   return (await import('../../modules/scale/onboarding/install')).installScaleInstrument(db,{instrumentKey:key,instrumentVersion:version,actorUserId:system.id,deploymentPolicy:{schemaVersion:2,revision:1,locale:runtime.contentLocale,territory:source.scientificReview?.territory??'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE','PUBLIC_QUESTIONNAIRE'],runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:source.localization.localizationVersion,inFlightCompletion:'FROZEN_DEADLINE'}})})
  await once('published',async()=>{state.publicationStarted=true;await save();const p=await import('../../modules/scale/onboarding/publish'),input={instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'HIDDEN' as const,allowedProducts:['TRAINING' as const]};const plan=await p.planStandardScalePublication(db,input);expect(plan.blockers).toEqual([]);return p.publishStandardScale(db,{...input,expectedProofHash:plan.proofHash})})
  const candidate=await req(system,`/api/platform/survey-standard/candidate/${key}/${version}`)
  const realReports=candidate.available.filter((p:any)=>p.axis==='REPORT'&&p.payload!==null);expect(realReports).toHaveLength(2)
  async function approve(kind:string,selection:any){return once(kind+'Approval',async()=>{const preview=await req(system,'/api/platform/survey-standard/preview',selection);const requestId=await once(kind+'ApprovalRequest',async()=>randomUUID());const row=await req(system,'/api/platform/survey-standard/approve',{...selection,requestId,expectedCombinationHash:preview.combinationHash,allowedProducts:['TRAINING','SURVEY','SCHOOL','TEACHER'],reason:'Isolated reviewed nonempty R registration and exact identity adapter evidence'});expect(row.state,JSON.stringify(row.blockers)).toBe('ONLINE');return row})}
  const basic=await approve('basic',candidate.selection)
  async function grant(kind:string,actor:any,row:any){return once(kind+'Grant',async()=>req(manager,`/api/questionnaire-products/standard-combinations/${row.id}/use-grants`,{requestId:await once(kind+'GrantRequest',async()=>randomUUID()),userId:actor.id,combinationHash:row.combinationHash,configurationName:kind==='basic'?'CFQ 标准报告':'CFQ 趣味报告'}))}
  async function draft(kind:string,actor:any,row:any){
   let task=await once(kind+'Draft',async()=>req(actor,'/api/questionnaire-products',{requestId:await once(kind+'DraftRequest',async()=>randomUUID()),name:'Synthetic CFQ '+kind,questionnaireType:'GENERAL',publicEnabled:true,expiresAt:new Date(Date.now()+86400000).toISOString()}))
   task=await once(kind+'Form',async()=>req(actor,`/api/questionnaire-products/${task.id}/items`,{revision:task.revision,item:{type:'FORM',formType:'year_month',formLabel:'出生年月',required:true,contextKey:'birthYearMonth'}}))
   if(kind==='fun')await once('wrongReportDenied',async()=>{await req(actor,`/api/questionnaire-products/${task.id}/items`,{revision:task.revision,item:{type:'SCALE',scaleId:state.scaleId,required:true,standardCombination:{releaseId:basic.id,combinationHash:basic.combinationHash}}},403);return true})
   return once(kind+'BoundDraft',async()=>req(actor,`/api/questionnaire-products/${task.id}/items`,{revision:task.revision,item:{type:'SCALE',scaleId:state.scaleId,required:true,standardCombination:{releaseId:row.id,combinationHash:row.combinationHash}}}))
  }
  stage='basic-grant-draft-before-fun-publication';await grant('basic',a,basic);const da=await draft('basic',a,basic)
  const itemA=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:da.id,type:'SCALE'}})
  await once('basicDraftSourceHash',async()=>canonicalHash(itemA.standardCombinationSource))
  stage='fun-publication-separate-recipient';const fun=await approve('fun',{...candidate.selection,REPORT:realReports.find((r:any)=>r.version==='1.1.0').hash});await grant('fun',b,fun);const df=await draft('fun',b,fun)
  expect(canonicalHash((await db.compositeAssessmentItem.findUniqueOrThrow({where:{id:itemA.id}})).standardCombinationSource)).toBe(state.basicDraftSourceHash)
  const rows=await db.$queryRaw`SELECT id,snapshot,measurement_release FROM survey_standard_releases WHERE id IN (${basic.id},${fun.id})`;expect(rows).toHaveLength(2)
  expect(rows[0].measurement_release).toEqual(rows[1].measurement_release)
  const snapshots=rows.map((r:any)=>r.snapshot);expect(snapshots[0].parts.CONTENT.hash).toEqual(snapshots[1].parts.CONTENT.hash);expect(snapshots[0].parts.PARAMETERS.hash).toEqual(snapshots[1].parts.PARAMETERS.hash);expect(snapshots[0].parts.REPORT.hash).not.toEqual(snapshots[1].parts.REPORT.hash)
  expect(rows.find((r:any)=>r.id===fun.id).snapshot.title).toContain('趣味版')
  const installed=await db.scale.findUniqueOrThrow({where:{id:state.scaleId}});expect(installed.definition.report).toEqual(source.executable.definition.report)
  state.registrationComplete=true;await save();observations.push({registrationComplete:true,normalApprovalTrials:'Existing mandatory trial path, both ONLINE',bothNonempty:true,sameMeasurementRelease:true,basicDraftStableAfterFunPublicationAndGrant:true,otherReportUseDenied:true,defaultReportUnchanged:true,basic:{id:basic.id,hash:basic.combinationHash},fun:{id:fun.id,hash:fun.combinationHash},tasks:[da.id,df.id]})
 },120000)
 it('delivers different frozen nonempty participant reports with identical scores from the same C/P and answers',async()=>{
  expect(state.registrationComplete).toBe(true)
  const reports:any[]=[],results:any[]=[]
  for(const [kind,actor]of [['basic',a],['fun',b]] as const){
   stage=kind+'-publish-start-final';const task=state[kind+'BoundDraft']
   await once(kind+'PublishedTask',async()=>req(actor,`/api/questionnaire-products/${task.id}/publish`,{revision:task.revision}))
   const link=await once(kind+'PublicLink',async()=>req(actor,`/api/composite-assessments/${task.id}/public-tokens`,{expiresAt:new Date(Date.now()+3600000).toISOString(),maxUses:2}))
   const started=await once(kind+'Started',async()=>req(null,`/api/public/composite-assessments/${link.token}/start`,{})),path=`/api/public/composite-assessments/attempts/${started.attempt.id}`,recovery=started.recoveryToken
   let current=await req(null,path,undefined,200,recovery)
   if(current.currentItem?.type==='FORM_SECTION'){
    const section=current.currentItem
    await req(null,`${path}/form-sections/${section.id}/submit`,{submissionId:await once(kind+'FormSubmission',async()=>randomUUID()),attemptEpoch:current.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:current.contextSnapshotHash,answers:section.answers.map((v:any)=>({formItemId:v.formItemId??v.id,value:'1990-01'}))},200,recovery)
    current=await req(null,path,undefined,200,recovery)
   }
   const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.attempt.id}})
   await once(kind+'AdmissionHash',async()=>canonicalHash(parent.trainingContentBinding))
   if(current.status!=='COMPLETED'){
    expect(current.currentItem.type).toBe('SCALE');const item=current.currentItem
    await req(null,`${path}/items/${item.id}/scale/submit?response=receipt`,{submissionId:await once(kind+'ScaleSubmission',async()=>randomUUID()),attemptEpoch:current.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:current.contextSnapshotHash,answers:source.executable.definition.items.map((i:any)=>({itemCode:i.itemCode,responseValue:'3'}))},200,recovery)
   }
   current=await req(null,path,undefined,200,recovery);expect(current.status).toBe('COMPLETED')
   const frozen=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.attempt.id}});expect(canonicalHash(frozen.trainingContentBinding)).toBe(state[kind+'AdmissionHash'])
   stage=kind+'-participant-report';const report=await req(null,path+'/report',undefined,200,recovery);reports.push(report)
   expect(await req(null,path+'/report',undefined,200,recovery)).toEqual(report)
   // CFQ is adult self report: staff ownership does not grant its interpretation.
   const teacher=await req(actor,`/api/composite-assessments/${task.id}/attempts/${started.attempt.id}/report`);expect(teacher.contentReports[0].status).toBe('UNAVAILABLE')
   const units=await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:started.attempt.id,unitType:'SCALE',payloadKind:'UNIT_RESULT'}});expect(units).toHaveLength(1)
   const [canonical]=await(await import('../../modules/assessment-runtime/compact-assessment-storage')).loadStoredCanonicalUnitResults(units.map((u:any)=>u.canonicalResultEncrypted),db)
   results.push(canonical.core.metrics)
  }
  const {registeredParts}=await import('../../modules/survey/standard-triplet.model'),parts=registeredParts(key).filter(p=>p.axis==='REPORT'&&p.payload!==null)
  const texts=parts.map(p=>(p.payload as any).interpretations[0].summary)
  for(let i=0;i<2;i++){
   expect(reports[i].unitReports[0].interpretations[0].interpretation).toBe(texts[i])
   expect(JSON.stringify(reports[i])).not.toContain(JSON.stringify(texts[1-i]).slice(1,-1))
  }
  const original=state.basicStarted
  expect(await req(null,`/api/public/composite-assessments/attempts/${original.attempt.id}/report`,undefined,200,original.recoveryToken)).toEqual(reports[0])
  expect(results[0]).toEqual(results[1]);expect(results[0].length).toBeGreaterThan(0)
  state.journeyComplete=true;await save();observations.push({twoRealFinals:true,identicalCanonicalMetrics:results[0],participantReportsDifferent:true,otherReportTextAbsent:true,reportRereadStable:true,admissionHashes:[state.basicAdmissionHash,state.funAdmissionHash],reportHashes:reports.map(canonicalHash)})
 },120000)
 it('reads both registered exact identities and their normal source policies at each entry adapter boundary',async()=>{
  expect(state.registrationComplete).toBe(true)
  const {readCurrentStandardCombination}=await import('../../modules/measurement-content/standard-combination-source')
  const {standardConfigurationIdentity}=await import('../../modules/assessment-authorization/standard-configuration-binding')
  const {assertToolEntryPolicy}=await import('../../modules/assessment-governance/tool-entry-policy')
  const identities=await db.$transaction(async(tx:any)=>{
   const output=[]
   for(const kind of ['basic','fun']){
    const row=state[kind+'Approval'],pointer={releaseId:row.id,combinationHash:row.combinationHash}
    const source=await readCurrentStandardCombination(tx,pointer),identity=standardConfigurationIdentity(source)
    expect(source.row.snapshot.parts.REPORT.payload).not.toBeNull()
    for(const product of ['TRAINING','SURVEY','SCHOOL','TEACHER'] as const)expect((await assertToolEntryPolicy(tx,{resourceKey:'standard-release:'+row.id,fingerprint:row.combinationHash},product)).decision).toBe('APPROVED')
    output.push(identity)
   }
   return output
  })
  expect(identities[0].axes.CONTENT).toEqual(identities[1].axes.CONTENT);expect(identities[0].axes.PARAMETERS).toEqual(identities[1].axes.PARAMETERS);expect(identities[0].axes.REPORT).not.toEqual(identities[1].axes.REPORT)
  observations.push({entrySourceBoundary:{products:['TRAINING','SURVEY','SCHOOL','TEACHER'],exactNonemptyReportsPerProduct:2,sourcePolicies:8,identityHashes:identities.map(canonicalHash),limitation:'Source identity/policy readback only; not eight new end-to-end grants or scientific approval for children.'}})
 })
})
