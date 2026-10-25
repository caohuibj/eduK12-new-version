import net from 'node:net'
import {performance} from 'node:perf_hooks'
import {randomUUID} from 'node:crypto'
const root=process.env.PROBE_BACKEND_ROOT!,imp=(p:string)=>import(root+'/'+p)
async function run(workload:any){
 const direct=new URL(process.env.DATABASE_URL!),sockets=new Set<net.Socket>()
 let sent=0,received=0
 const proxy=net.createServer(source=>{
  const destination=net.connect(Number(direct.port),direct.hostname);sockets.add(source);sockets.add(destination)
  source.on('data',b=>{sent+=b.length});destination.on('data',b=>{received+=b.length})
  source.on('error',()=>destination.destroy());destination.on('error',()=>source.destroy())
  source.on('close',()=>{sockets.delete(source);destination.destroy()});destination.on('close',()=>sockets.delete(destination))
  source.pipe(destination).pipe(source)
 })
 await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve))
 const proxied=new URL(direct);proxied.port=String((proxy.address() as net.AddressInfo).port);process.env.DATABASE_URL=proxied.href
 const {prisma:db}=await imp('src/config/database.ts'),{default:express}=await imp('node_modules/express/index.js')
 const {publicSurveyRouter}=await imp('src/modules/survey/public.routes.ts'),{surveyGovernedResearcherRouter}=await imp('src/modules/survey/governed-tool.routes.ts')
 const {surveyOriginGuard}=await imp('src/modules/survey/originGuard.ts'),{csrfProtection}=await imp('src/middleware/csrf.ts')
 const {cacheService}=await imp('src/services/cacheService.ts');await cacheService.initialize();if(!cacheService.getStatus().connected)throw Error('Dedicated Redis required')
 const {canonicalHash}=await imp('src/modules/assessment-runtime/canonical.ts'),{generateToken}=await imp('src/utils/jwt.ts')
 const {syntheticUnitAnswers}=await imp('src/modules/survey/governed-tool.trial.ts'),{syntheticNativeSituationalSubmission}=await imp('src/modules/survey/governed-tool.native-trial.ts')
 const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:workload.publicationId}}),snapshot=publication.compiledSnapshot
 if(canonicalHash(snapshot)!==publication.definitionDigest)throw Error('Frozen source mismatch')
 const owner=await db.user.findUniqueOrThrow({where:{id:workload.ownerId}}),token=generateToken({userId:owner.id,role:owner.role,accountDomain:'SURVEY',tokenVersion:owner.tokenVersion,mfaVerifiedAt:Math.floor(Date.now()/1000)})
 const events:Array<{sql:string;duration:number;at:number}>=[]
 db.$on('query',(event:any)=>events.push({sql:event.query,duration:event.duration,at:performance.now()}))
 const app=express();app.use(express.json({limit:'2mb'}));app.use('/api',csrfProtection)
 app.use('/api/public/survey',surveyOriginGuard,publicSurveyRouter)
 app.use('/api/survey/governed-projects',surveyOriginGuard,surveyGovernedResearcherRouter)
 app.use((error:any,_req:any,res:any,_next:any)=>{console.error('Synthetic request error class/code:',error?.constructor?.name,error?.code??error?.statusCode??'unknown');res.status(500).json({code:-1,message:'probe request failed'})})
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve))
 const base='http://127.0.0.1:'+server.address().port,series:any[]=[]
 const relationSizes=async()=>new Map((await db.$queryRawUnsafe("SELECT c.relname AS name,pg_total_relation_size(c.oid)::text AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')")).map((r:any)=>[r.name,Number(r.bytes)]))
 try{
  for(const cache of ['PROCESS_FIRST','PROCESS_WARM']){
   const requests:any[]=[],sizes=await relationSizes()
   const call=async(label:string,path:string,body?:unknown,authorized=false)=>{
    const count=events.length,before={sent,received},cpu=process.cpuUsage(),start=performance.now()
    let peak=process.memoryUsage().rss;const sample=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss)},5)
    try{
     const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'https://survey.eduk12.top',...(authorized?{Cookie:'huisurvey_research_session='+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
     const text=await response.text(),value=JSON.parse(text),delta=process.cpuUsage(cpu),selected=events.slice(count),classes:Record<string,number>={}
     let firstLock:number|undefined;const lockIntervals:number[]=[]
     for(const e of selected){const type=e.sql.trim().match(/^[A-Za-z]+/)?.[0].toUpperCase()??'OTHER';classes[type]=(classes[type]??0)+1;if(/FOR (?:SHARE|UPDATE)|pg_advisory_xact_lock/i.test(e.sql))firstLock??=e.at-e.duration;if(/^(?:COMMIT|ROLLBACK)\b/i.test(e.sql)&&firstLock!==undefined){lockIntervals.push(Math.max(0,e.at-firstLock));firstLock=undefined}}
     requests.push({label,httpStatus:response.status,elapsedMs:performance.now()-start,processCpuMs:(delta.user+delta.system)/1000,observedPeakRssBytes:Math.max(peak,process.memoryUsage().rss),processLifetimeMaxRssBytes:process.resourceUsage().maxRSS*1024,sqlEvents:selected.length,sqlClasses:classes,queryEventDurationMs:selected.reduce((n,e)=>n+e.duration,0),dbSentBytes:sent-before.sent,dbReceivedBytes:received-before.received,responseBodyBytes:Buffer.byteLength(text),authorityTransactionIntervalUpperBoundsMs:lockIntervals})
     process.send?.({kind:'partial',evidence:{cache,...requests[requests.length-1]}})
     if(response.status!==200||value.code!==0)throw Error('Synthetic HTTP contract failed at '+label+' / '+response.status)
     return value.data
    }finally{clearInterval(sample)}
   }
   const entered=await call('join','/api/public/survey/r/'+workload.publicId+'/waves/'+workload.waveId+'/start-unlinked',{entryToken:workload.entryToken,consentVersion:1,consent:true})
   const prefix='/api/public/survey/r/'+workload.publicId+'/attempts/'+entered.attemptId,proof={accessCredential:entered.accessCredential}
   await call('task',prefix+'/task',proof)
   const answers:Record<string,unknown>={},references=[]
   for(const unit of snapshot.units){
    answers[unit.instrumentKey]=syntheticUnitAnswers(unit,0)
    if(unit.executionProtocol==='SITUATIONAL_NATIVE_V1'){
     const child=await call('native-start',prefix+'/situational/'+unit.instrumentKey+'/start',{...proof,priorAnswers:answers})
     const submission={submissionId:randomUUID(),attemptEpoch:1,definitionHash:unit.nativeSituational.definitionHash,...syntheticNativeSituationalSubmission(unit,0,child.attempt.id)}
     const path=prefix+'/situational/'+unit.instrumentKey+'/'+child.attempt.id
     const accepted=await call('native-final',path+'/final',{...proof,submission})
     const restored=await call('native-lost-response-recovery',path+'/read',proof)
     if(canonicalHash(accepted.receipt)!==canonicalHash(restored.receipt))throw Error('Native recovery receipt mismatch')
     references.push(accepted.receipt)
    }
   }
   await call('checkpoint',prefix+'/checkpoint/save',{...proof,revision:0,answers})
   const command={...proof,submissionId:randomUUID(),answers,...(references.length?{situationalReferences:references}:{})}
   const result=await call('final',prefix+'/final',command)
   const finalHash=(row:any)=>canonicalHash({...row,completedAt:row.completedAt.toISOString()})
   const before=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:entered.attemptId}}),beforeHash=finalHash(before)
   const replay=await call('final-lost-response-replay',prefix+'/final',command)
   const after=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:entered.attemptId}})
   if(result.receiptId!==replay.receiptId||beforeHash!==finalHash(after)||await db.surveyWaveFinal.count({where:{attemptId:entered.attemptId}})!==1)throw Error('FINAL replay changed durable facts')
   await call('general',prefix+'/general',proof)
   if(workload.group==='whole-package'){
    const report=await call('authorized-combined-report','/api/survey/governed-projects/'+workload.projectId+'/waves/'+workload.waveId+'/finals/'+before.id+'/package-reports',undefined,true)
    if(report.list.length!==1||!report.list[0].artifact.report.blocks.some((b:any)=>b.type==='METRIC'&&b.value===5))throw Error('Stored authoritative package metric differs')
   }
   const sizesAfter=await relationSizes(),relations=Object.fromEntries([...sizesAfter].flatMap(([name,size]:any)=>size!==sizes.get(name)?[[name,size-Number(sizes.get(name)??0)]]:[]))
   const cipherSizes=await db.$queryRawUnsafe(`SELECT octet_length(f.results_cipher)::int AS final_cipher_bytes,(SELECT COALESCE(sum(octet_length(r.report_cipher)),0)::int FROM survey_package_report_artifacts r WHERE r.final_id=f.id) AS package_report_cipher_bytes FROM survey_wave_finals f WHERE f.id=$1`,before.id)
   series.push({cache,requests,relationAllocatedBytesDelta:relations,storedCipherSizes:cipherSizes[0],verified:true,receiptReplayExact:true})
  }
  return {group:workload.group,frozenDefinitionDigest:publication.definitionDigest,protocols:snapshot.units.map((u:any)=>({kind:u.kind,protocol:u.executionProtocol??'SURVEY_FINAL_V1',sourceDigest:u.sourceDigest,scoringDigest:u.scoringDigest})),series,limits:{samplesPerGroup:2,freshApiProcessPerGroup:true,warmupRuns:0,coldDatabase:false,browser:false,publicNetwork:false,capacity:false,productionMiddleware:false,processCpuIncludesLocalHttpDriver:true,lockIntervalIsUpperBoundIncludingWaits:true,dbServerCpuMeasured:false}}
 }finally{
  await (await imp('src/config/queue.ts')).closeQueues(true);await cacheService.close();await db.$disconnect()
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));for(const s of sockets)s.destroy();await new Promise<void>(resolve=>proxy.close(()=>resolve()))
 }
}
process.send?.({kind:'ready'})
process.once('message',(message:any)=>run(message.workload).then(result=>process.send?.({kind:'result',result},()=>process.disconnect?.())).catch(()=>{console.error('Isolated resource probe failed; partial private diagnostics retained by launcher');process.exitCode=1;process.disconnect?.()}))
