const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{fork}=require('node:child_process'),{createRequire}=require('node:module'),{randomBytes}=require('node:crypto')
const r=createRequire((process.env.DAILY_PROBE_CANDIDATE_ROOT||'/workspace/eduK12-new-version')+'/server-version/backend/package.json'),{PrismaClient}=r('@prisma/client')
const directory=process.env.DAILY_PROBE_EVIDENCE_DIR||'/workspace/survey-followup-evidence',candidateRoot=process.env.DAILY_PROBE_CANDIDATE_ROOT||'/workspace/eduK12-new-version',baselineRoot=process.env.DAILY_PROBE_BASELINE_ROOT||'/workspace/ci355-lifecycle-baseline',fixture=JSON.parse(fs.readFileSync(process.env.DAILY_PROBE_FIXTURE||directory+'/daily-probe-fixture.json','utf8'))
const template=new URL(process.env.DATABASE_URL),target=new URL(template);target.pathname='/postgres'
if(process.env.NODE_ENV!=='test'||template.hostname!=='127.0.0.1'||template.port!=='55433'||!/^\/eduk12_admin_permissions_ci355_probe_template_[a-f0-9]+$/.test(template.pathname))throw Error('Only the dedicated synthetic template may be cloned')
const output=directory+'/daily-probe-http-results.json',report={schemaVersion:1,scope:'Ordinary Survey Form+Scale, source HTTP server, exact cloned publication and three matched participants',baseline:'149441f908b57e67d53b55532206cc36b4b55580',candidate:'db225657d25b5a36effc908c5bd24fde12a34085',definitionDigest:fixture.definitionDigest,publicationId:fixture.publicationId,order:['baseline','candidate','candidate','baseline'],publicationCosts:fixture.publicationCosts,limitations:['First request vs later process reuse; PostgreSQL/OS caches were not flushed. Not database-cold evidence.','No native SJT, cognitive, whole-package, Training, or personally rendered report in this initial probe.','Survey parent advance and report computation occur inside parent FINAL; no fabricated separate advance job.','Publication setup is service-level, excludes HTTP authentication; its DB wire bytes are unmeasured.','SQL gate tags overlap and are not a SQL total. SQL text fingerprints and counts only; no parameters or credentials.','Per-record PG sizes exclude index/WAL/TOAST attribution; whole physical disk-per-response is not measured.','No load/capacity claim. Real rate middleware retained; no PERF rate-limit bypass.'],runs:[]}
let sequence=0
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600})
async function run(label,index){
 const sourceRoot=label==='baseline'?baselineRoot:candidateRoot,expected=label==='baseline'?'9d8ded8f1f8fdda2d683816d30103bd5547f54b0':'4d10a9468488551e049b097e060b34cef07324ba';
 const tree=require('node:child_process').execFileSync('git',['rev-parse','HEAD:server-version/backend/src'],{cwd:sourceRoot,encoding:'utf8'}).trim();
 const dirty=require('node:child_process').execFileSync('git',['status','--porcelain','--','server-version/backend/src'],{cwd:sourceRoot,encoding:'utf8'}).trim();
 if(tree!==expected||dirty)throw Error('Frozen backend source mismatch; this probe must not label a later implementation as the old candidate');
 const admin=new PrismaClient({datasources:{db:{url:target.toString()}}}),dbName='eduk12_admin_permissions_ci355_probe_'+label+'_'+randomBytes(4).toString('hex')
 try{await admin.$executeRawUnsafe('CREATE DATABASE "'+dbName+'" TEMPLATE "'+template.pathname.slice(1)+'"')}finally{await admin.$disconnect()}
 const dbURL=new URL(template);dbURL.pathname='/'+dbName;const proxied=new URL(dbURL);proxied.port='55434'
 let wire={up:0,down:0},countWire=false
 const sockets=new Set(),proxy=net.createServer(socket=>{
  const upstream=net.connect({host:'127.0.0.1',port:55433});sockets.add(socket);sockets.add(upstream)
  socket.on('data',chunk=>{if(countWire)wire.up+=chunk.length});upstream.on('data',chunk=>{if(countWire)wire.down+=chunk.length})
  socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('close',()=>sockets.delete(socket));upstream.on('close',()=>sockets.delete(upstream));socket.pipe(upstream);upstream.pipe(socket)
 })
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(55434,'127.0.0.1',resolve)})
 const source=label==='baseline'?baselineRoot:candidateRoot,log=fs.openSync(`${directory}/daily-probe-${index}-${label}-server.log`,'w',0o600)
 const redis=new URL(process.env.REDIS_URL);if(redis.hostname!=='127.0.0.1'||redis.port!=='56380')throw Error('Task-owned Redis required');redis.pathname='/'+(index+8)
 const child=fork(path.join(__dirname,'daily-probe-server.cjs'),[],{cwd:source+'/server-version/backend',execArgv:[],env:{...process.env,DAILY_PROBE_SOURCE:source,DATABASE_URL:proxied.toString(),RELEASE_INTEGRATION_DATABASE_URL:proxied.toString(),NODE_ENV:'test',PORT:'3000',REDIS_URL:redis.toString(),CORS_ORIGIN:'http://127.0.0.1:3000',SURVEY_WORKSPACE_ENABLED:'true',SURVEY_PUBLICATION_ENABLED:'true',BACKGROUND_WORKERS_ENABLED:'false',PERF_ISOLATED_TEST_MODE:'0',PERF_SQL_EVENT_COUNT:'0'},stdio:['ignore',log,log,'ipc']});fs.closeSync(log)
 const replies=new Map();child.on('message',message=>{const pending=replies.get(message.id);if(pending){replies.delete(message.id);pending(message)}})
 const rpc=kind=>new Promise((resolve,reject)=>{const id=++sequence;replies.set(id,resolve);child.send({id,kind},error=>{if(error)reject(error)})})
 const record={label,replicate:index,status:'running',phases:[],database:dbName};report.runs.push(record);save()
 try{
  let ready=false;for(let n=0;n<180;n++){if(child.exitCode!==null)throw Error('Probe source server exited');try{const response=await fetch('http://127.0.0.1:3000/ready',{signal:AbortSignal.timeout(500)});if(response.ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100))}if(!ready)throw Error('Source HTTP readiness timeout')
  for(let participant=0;participant<fixture.participants.length;participant++){
   const person=fixture.participants[participant],proof={researchCode:person.researchCode,accessCredential:person.accessCredential};let attemptId
   const base=`/api/public/survey/r/${fixture.publicId}`
   const steps=[['START',()=>`${base}/waves/${fixture.waveId}/start`,()=>({...proof,consent:true,consentVersion:1})],['TASK_READ',()=>`${base}/attempts/${attemptId}/task`,()=>proof],['CHECKPOINT_SAVE',()=>`${base}/attempts/${attemptId}/checkpoint/save`,()=>({...proof,revision:0,answers:fixture.answers})],['CHECKPOINT_READ',()=>`${base}/attempts/${attemptId}/checkpoint/read`,()=>proof],['FINAL_GENERATE_PERSIST_ADVANCE',()=>`${base}/attempts/${attemptId}/final`,()=>({...proof,submissionId:person.submissionId,answers:fixture.answers})],['FINAL_REPLAY',()=>`${base}/attempts/${attemptId}/final`,()=>({...proof,submissionId:person.submissionId,answers:fixture.answers})],['OWN_GENERAL_REPORT_READ',()=>`${base}/attempts/${attemptId}/general`,()=>proof]]
   for(const [phase,endpoint,body] of steps){
    const payload=JSON.stringify(body());wire={up:0,down:0};countWire=true;await rpc('begin');const start=process.hrtime.bigint()
    let response,text,data,failed
    try{response=await fetch('http://127.0.0.1:3000'+endpoint(),{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:3000'},body:payload,signal:AbortSignal.timeout(15000)});text=await response.text();data=JSON.parse(text);if(response.status!==200||data.code!==0)failed='HTTP '+response.status+' '+String(data.message).slice(0,200)}catch(error){failed=error.message}
    const wallMs=Number(process.hrtime.bigint()-start)/1e6,metrics=(await rpc('end')).result;countWire=false
    record.phases.push({participant,temperature:participant===0?'process-first':'process-reused',phase,status:failed?'failed':'passed',...(failed?{failure:failed}:{}),httpStatus:response?.status,wallMs,requestBodyUtf8Bytes:Buffer.byteLength(payload),responseBodyUtf8Bytes:text?Buffer.byteLength(text):0,postgresWireUpBytes:wire.up,postgresWireDownBytes:wire.down,...metrics});save()
    if(failed)throw Error(phase+': '+failed)
    if(phase==='START')attemptId=data.data.attemptId
    if(phase==='FINAL_GENERATE_PERSIST_ADVANCE'&&data.data.status!=='COMPLETED')throw Error('FINAL did not complete')
    if(phase==='FINAL_REPLAY'&&data.data.idempotent!==true)throw Error('FINAL response is not an exact replay')
   }
   const inspect=new PrismaClient({datasources:{db:{url:dbURL.toString()}}})
   try{const [size]=await inspect.$queryRawUnsafe('SELECT pg_column_size(a)::int AS attempt_record_bytes,pg_column_size(f)::int AS final_record_bytes FROM survey_wave_attempts a JOIN survey_wave_finals f ON f.attempt_id=a.id WHERE a.id=$1',attemptId);record.phases.push({participant,phase:'STORAGE_INSPECTION',status:'passed',sqlExcludedFromUserRequests:true,...size})}finally{await inspect.$disconnect()}
  }
  record.status='passed'
 }catch(error){record.status='failed';record.failure=error.message;throw error}
 finally{
  countWire=false;save();child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(child.exitCode===null)child.kill('SIGKILL');for(const socket of sockets)socket.destroy();await new Promise(resolve=>proxy.close(resolve))
 }
 console.log(JSON.stringify({label,replicate:index,status:record.status,completedRequests:record.phases.filter(x=>x.httpStatus===200).length}))
}
(async()=>{for(let i=0;i<report.order.length;i++)await run(report.order[i],i);report.status='passed';save()})().catch(error=>{report.status='failed';report.failure=error.message;save();console.error(error.message);process.exitCode=1})
