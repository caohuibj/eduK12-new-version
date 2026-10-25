const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{randomUUID}=require('node:crypto')
const root=process.env.DAILY_PROBE_SOURCE,r=createRequire(path.join(root,'server-version/backend/package.json'))
r('tsx/cjs/api').register()
const {PrismaClient}=r('@prisma/client'),{blank,query}=require('./daily-probe-common.cjs')
const url=new URL(process.env.DATABASE_URL)
if(process.env.NODE_ENV!=='test'||url.hostname!=='127.0.0.1'||url.port!=='55433'||!/^\/eduk12_admin_permissions_ci355_probe_template_/.test(url.pathname))throw Error('Synthetic template database required')
const client=new PrismaClient({datasources:{db:{url:url.toString()}},log:[{level:'query',emit:'event'}]});globalThis.prisma=client
const load=file=>require(path.join(root,'server-version/backend/src/modules/survey',file))
const {createDraft,updateDraft}=load('builder.service.ts'),{createWave,getWave}=load('waves.service.ts'),{prepareWave,openWave}=load('waves.publish.ts'),{joinLinkedStudy}=load('admission.service.ts'),{publishSurveyMeasurementDraft}=load('measurement-publication.service.ts')
let measured=null;client.$on('query',event=>{if(measured)query(measured,event)})
const publicationCosts=[]
async function publish(owner,project,tools,title){
 const w=await createWave(owner,project,{requestId:randomUUID(),title,consentText:'这是隔离合成资源探针。多轮作答按同一研究编号关联，仅用于验证程序，不含真实用户数据。',generalText:'感谢完成合成测量。本流程仅提供研究参与确认，不提供个人诊断。',linkageNoticeConfirmed:true,instrumentIds:tools,allowNewParticipants:true,checkpointPolicy:{schemaVersion:1,enabled:true,ttlHours:2}})
 const sql=blank(),cpu=process.cpuUsage(),start=process.hrtime.bigint();let peak=process.memoryUsage().rss
 const timer=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss)},5);measured=sql
 try{await prepareWave(owner,project,w.id,w.revision);const frozen=await getWave(owner,project,w.id);return {id:w.id,...await openWave(owner,project,w.id,frozen.revision)}}
 finally{measured=null;clearInterval(timer);const delta=process.cpuUsage(cpu);publicationCosts.push({boundary:'prepareWave + getWave + openWave; service-level fixture setup, excludes HTTP authentication',sql,wallMs:Number(process.hrtime.bigint()-start)/1e6,cpuUserUs:delta.user,cpuSystemUs:delta.system,peakRssBytes:Math.max(peak,process.memoryUsage().rss),dbWireBytes:null})}
}
async function main(){
 const tag=randomUUID().slice(0,10),admin=await client.user.create({data:{username:'probe_admin_'+tag,passwordHash:'synthetic-unusable',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
 const owner=await client.user.create({data:{username:'probe_owner_'+tag,passwordHash:'synthetic-unusable',accountDomain:'SURVEY'}})
 await client.surveyAccount.create({data:{userId:owner.id,loginName:'probe_'+tag,normalizedLogin:'probe_'+tag}})
 await client.surveyResearcherGrant.create({data:{userId:owner.id,status:'ACTIVE',grantedBy:admin.id}})
 await client.surveyMfaCredential.create({data:{userId:owner.id,enabled:true,secretCipher:'synthetic-enrollment-only'}})
 const project=await client.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner.id,title:'Ordinary lifecycle resource probe',collectionMode:'LINKED_WAVES',status:'DRAFT'}})
 const form={schemaVersion:1,pages:[{pageKey:'page',title:'合成背景',questions:[{itemKey:'subject',type:'SINGLE',prompt:'选择合成科目',required:true,options:[{optionKey:'math',label:'数学'},{optionKey:'chemistry',label:'化学'}],rows:[]}]}]}
 const scale={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[1,2,3,4,5].map(n=>({optionKey:'o'+n,label:String(n),score:n})),dimensions:[{dimensionKey:'motivation',label:'动机',direction:'descriptive'},{dimensionKey:'strategy',label:'策略',direction:'descriptive'}],items:[{itemKey:'itemone',prompt:'我喜欢合成学习任务',required:true,reverse:false,dimensionKeys:['motivation']},{itemKey:'itemtwo',prompt:'我不愿意整理学习步骤',required:true,reverse:true,dimensionKeys:['strategy']}]}
 const tools=[]
 for(const [kind,instrumentKey,definition] of [['FORM','probebackground',form],['SCALE','probescore',scale]]){
  const id=randomUUID();await createDraft(owner.id,project.id,{requestId:id,kind,instrumentKey,title:'Synthetic '+kind+' lifecycle probe'})
  await updateDraft(owner.id,project.id,id,{revision:0,title:'Synthetic '+kind+' lifecycle probe',definition});tools.push(id)
  if(kind==='SCALE')await publishSurveyMeasurementDraft(owner.id,project.id,id,1)
 }
 const first=await publish(owner.id,project.id,tools,'Probe cohort enrollment'),participants=[]
 for(let i=0;i<3;i++){const p=await joinLinkedStudy({publicId:first.publicId,waveId:first.id,entryToken:first.entrySecret,consentVersion:1,consent:true});participants.push({researchCode:p.researchCode,accessCredential:p.accessCredential,submissionId:randomUUID()})}
 const target=await publish(owner.id,project.id,tools,'Probe exact publication'),targetWave=await client.surveyWave.findUniqueOrThrow({where:{id:target.id}}),publication=await client.surveyPublication.findUniqueOrThrow({where:{id:targetWave.publicationId}})
 const snapshot=publication.compiledSnapshot
 fs.writeFileSync(process.env.DAILY_PROBE_FIXTURE,JSON.stringify({projectId:project.id,publicId:target.publicId,waveId:target.id,publicationId:publication.id,definitionDigest:publication.definitionDigest,participants,answers:Object.fromEntries(snapshot.units.map(unit=>[unit.instrumentKey,unit.kind==='FORM'?{subject:'math'}:{itemone:'o4',itemtwo:'o3'}])),publicationCosts},null,2)+'\n',{mode:0o600})
 console.log(JSON.stringify({setup:'completed',participants:3,units:2,publicationDigest:publication.definitionDigest,publicationCostSQL:publicationCosts.map(x=>x.sql.total)}))
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>client.$disconnect())
