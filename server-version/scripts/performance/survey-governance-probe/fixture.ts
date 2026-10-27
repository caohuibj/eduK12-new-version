import {randomUUID} from 'node:crypto'
const root=process.env.PROBE_BACKEND_ROOT!,imp=(p:string)=>import(root+'/'+p)
export async function prepare(){
 const {prisma:db}=await imp('src/config/database.ts')
 const gov=await imp('src/modules/survey/governed-tool.service.ts'),pkg=await imp('src/modules/survey/governed-package.service.ts')
 const builder=await imp('src/modules/survey/builder.service.ts'),waves=await imp('src/modules/survey/waves.service.ts'),publish=await imp('src/modules/survey/waves.publish.ts')
 const catalog=await imp('src/modules/survey/catalog.service.ts'),{assertToolEntryPolicy}=await imp('src/modules/survey/tool-policy.ts')
 const {governedPolicyIdentity}=await imp('src/modules/survey/governed-tool.model.ts')
 const create=async(domain:string,role='STANDARD')=>db.user.create({data:{username:'probe-'+randomUUID(),passwordHash:'synthetic-unusable',accountDomain:domain,platformRole:role}})
 const system=await create('TRAINING','SYSTEM_ADMIN'),manager=await create('TRAINING'),owner=await create('SURVEY')
 await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager.id,entry:'SURVEY',grantedBy:system.id}})
 const login='p'+randomUUID().replaceAll('-','').slice(0,18)
 await db.surveyAccount.create({data:{userId:owner.id,loginName:login,normalizedLogin:login}})
 await db.surveyResearcherGrant.create({data:{userId:owner.id,status:'ACTIVE',grantedBy:manager.id}})
 await db.surveyMfaCredential.create({data:{userId:owner.id,enabled:true,secretCipher:'synthetic-unusable'}})
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID(),tokenVersion:0}
 const approve=async(id:string)=>{const r=await gov.governedRow(db,id),a=await gov.approveGovernedTool(system.id,id,{expectedVersion:r.version,hash:r.snapshot_hash,decision:'APPROVE',allowedProducts:['SURVEY'],reason:'Isolated resource fixture'},proof);if(a.state!=='ONLINE')throw Error('Synthetic exact version did not pass trial');return gov.governedRow(db,id)}
 const admit=async(row:any)=>db.$transaction((tx:any)=>assertToolEntryPolicy(tx,governedPolicyIdentity(row),'SURVEY'))
 const project=async(title:string)=>db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner.id,title,collectionMode:'SINGLE_UNLINKED'}})
 const form=async(pid:string,key:string)=>{
  const d=await builder.createDraft(owner.id,pid,{requestId:randomUUID(),instrumentKey:key,kind:'FORM',title:'Synthetic form'})
  return builder.updateDraft(owner.id,pid,d.id,{revision:d.revision,title:d.title,definition:{schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:Array.from({length:20},(_,i)=>({itemKey:'q'+i,type:'SINGLE',prompt:'Synthetic '+i,required:true,options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}],rows:[]}))}]}})
 }
 // Use an actual author/reviewer release, never patch a registry publication.
 const {sjtNativeStagedTemplate}=await imp('src/__tests__/fixtures/sjt-native-staged.fixture.ts')
 const author=await imp('src/modules/situational/authoring/service.ts'),template={...structuredClone(sjtNativeStagedTemplate),instrumentKey:'synthetic-probe-'+randomUUID()}
 const source=await author.createSjtDraft({userId:manager.id,admin:false},template,{authorizationPolicy:null})
 await author.requestSjtReview({userId:manager.id,admin:false},source.id,source.revision,source.contentDigest)
 await author.reviewSjtDraft({userId:system.id,admin:true},source.id,source.revision,source.contentDigest,true,'Independent synthetic fixture review')
 const release=await db.sjtAuthorRelease.findFirstOrThrow({where:{instrumentKey:template.instrumentKey}})
 const submitted=await gov.submitGovernedSource(system.id,{requestId:randomUUID(),source:{kind:'SJT',sourceId:release.id,sourceVersion:release.instrumentVersion},version:'1',title:'Synthetic native fixture',report:{version:'r1',template:{title:'Synthetic',blocks:[{type:'METRIC',metricKey:'coordination',display:'RAW'}],limitations:[]}},reference:{}},proof)
 const native=await approve(submitted.id);await admit(native)
 const nativeGrant=await catalog.grantCatalogSource(manager.id,owner.id,{kind:'SJT',sourceId:'survey-tool:'+native.id,sourceVersion:native.snapshot_hash})
 const origin=await project('Synthetic source'),originalForm=await form(origin.id,'shared')
 const shared=await gov.submitOwnedSurveyTool(owner.id,origin.id,originalForm.id,{requestId:randomUUID(),revision:originalForm.revision,version:'1',statement:'Synthetic explicitly shared form',reference:{}})
 const fixedForm=await approve(shared.id)
 const submittedPackage=await gov.submitGovernedPackage(system.id,{requestId:randomUUID(),family:'BUNDLE',toolKey:'probe_'+randomUUID().replaceAll('-',''),version:'1',title:'Synthetic whole package',components:[{slotKey:'form',source:{type:'GOVERNED',id:fixedForm.id,hash:fixedForm.snapshot_hash}},{slotKey:'native',source:{type:'GOVERNED',id:native.id,hash:native.snapshot_hash}}],report:{version:'r1',title:'Synthetic combined report',introduction:'Synthetic only',blocks:[{type:'FORM_FIELD',slotKey:'form',itemKey:'q0',label:'Choice'},{type:'METRIC',slotKey:'native',metricKey:'coordination',label:'Synthetic coordination'}],disclaimer:'Software fixture only'},reference:{}},proof)
 const fixedPackage=await approve(submittedPackage.id);await admit(fixedPackage)
 const grant=await pkg.grantSurveyPackage(manager.id,{requestId:randomUUID(),toolId:fixedPackage.id,hash:fixedPackage.snapshot_hash,userId:owner.id,reason:'Synthetic complete package'})
 const workloads=[]
 for(const group of ['ordinary','native-mixed','whole-package']){
  const p=await project('Probe '+group)
  let ids:string[]
  if(group==='whole-package')ids=(await pkg.importSurveyPackage(owner.id,p.id,grant.id,randomUUID())).bindings.map((b:any)=>b.draftId)
  else{
   const f=await form(p.id,'form');ids=[f.id]
   if(group==='native-mixed')ids.push((await builder.importCatalogDraft(owner.id,p.id,nativeGrant.id,{requestId:randomUUID(),instrumentKey:'native',title:'Synthetic native'})).id)
  }
  const w=await waves.createWave(owner.id,p.id,{requestId:randomUUID(),title:'Synthetic '+group,consentText:'Isolated synthetic resource fixture; no actual participants.',generalText:'Synthetic completion',instrumentIds:ids,allowNewParticipants:true,checkpointPolicy:{schemaVersion:1,enabled:true,ttlHours:1}})
  await publish.prepareWave(owner.id,p.id,w.id,w.revision)
  const prepared=await waves.getWave(owner.id,p.id,w.id),opened=await publish.openWave(owner.id,p.id,w.id,prepared.revision)
  workloads.push({group,projectId:p.id,waveId:w.id,publicationId:opened.publicationId,publicId:opened.publicId,entryToken:opened.entrySecret,ownerId:owner.id})
 }
 await (await imp('src/config/queue.ts')).closeQueues(true);await db.$disconnect()
 return workloads
}
prepare().then(workloads=>process.send?.({kind:'fixtures',workloads},()=>process.disconnect?.())).catch(()=>{console.error('Synthetic fixture preparation failed; no credentials logged');process.exitCode=1;process.disconnect?.()})
