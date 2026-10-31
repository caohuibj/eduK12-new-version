import {createRequire} from 'node:module'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const back=process.env.PROBE_BACKEND_ROOT!,req=createRequire(back+'/package.json')
const {PrismaClient}=req('@prisma/client'),{encryptField}=req(back+'/src/utils/encryption.ts')
const db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}})
const out=process.env.PROBE_OUTPUT!,before=JSON.parse(readFileSync(process.env.BASELINE_QUERY!,'utf8')),after=JSON.parse(readFileSync(process.env.CANDIDATE_QUERY!,'utf8'))
const result:any={scope:'Actual PostgreSQL/Prisma replay of query arguments captured from real teacher batch service; synthetic opaque receipt/manifest rows, not accepted FINAL or full HTTP/permissions qualification',completed:false,samples:[]}
const sha=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const save=()=>writeFileSync(out,JSON.stringify(result,null,2)+'\n')
try{
 const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS name,version() AS version')
 assert.equal(identity.name,'b_variant_projection_test');result.postgres=identity.version
 assert.deepEqual(before.reports,after.reports);result.serviceReportSHA256=sha(before.reports)
 assert.deepEqual(before.query.where,after.query.where)
 const summaries=[]
 for(const [index,original]of before.jobs.entries()){
  const count=index===0?12:218
  const answers=encryptField({synthetic:true,responseCodes:Array.from({length:count},(_,i)=>({key:'Q'+i,value:'option_'+i%5}))})
  const validation=encryptField({synthetic:true,fields:Array.from({length:count},(_,i)=>({key:'Q'+i,prompt:'合成题目，仅用于列投影观测。'.repeat(3),required:true,options:['0','1','2','3','4']}))})
  await db.compositeReportJob.create({data:{id:'job-'+index,attemptId:original.attemptId,attemptEpoch:original.attemptEpoch,slotSetHash:original.slotSetHash,
   contextHash:original.contextHash,status:'READY',reportEncrypted:original.reportEncrypted,aggregateInputHash:original.aggregateInputHash,
   wholeSubmissionId:'synthetic-submission-'+index,wholePayloadHash:'a'.repeat(64),wholeAnswersEncrypted:answers,wholeAcceptedAt:new Date('2026-10-31T00:00:00Z'),wholeValidationEncrypted:validation,wholeValidationHash:'b'.repeat(64)}})
  summaries.push({attemptId:original.attemptId,responseCodes:count,answerCipherBytes:Buffer.byteLength(answers),validationCipherBytes:Buffer.byteLength(validation),reportCipherBytes:Buffer.byteLength(original.reportEncrypted)})
 }
 result.fixture=summaries
 const queries:any[]=[]
 for(const [kind,query]of [['baseline',before.query],['candidate',after.query],['candidate',after.query],['baseline',before.query]]as const){
  const t=performance.now(),cpu=process.cpuUsage()
  const rows=await db.$transaction(async(tx:any)=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
   return tx.compositeReportJob.findMany(query)
  })
  const selected=rows.map((row:any)=>Object.fromEntries(Object.keys(after.query.select).map(key=>[key,row[key]]))).sort((a:any,b:any)=>a.attemptId.localeCompare(b.attemptId))
  result.samples.push({kind,rows:rows.length,fieldCount:Object.keys(rows[0]).length,returnedJSONStringBytes:Buffer.byteLength(JSON.stringify(rows)),wallMs:performance.now()-t,cpuMicros:process.cpuUsage(cpu),selectedSHA256:sha(selected)})
  queries.push(selected);save()
 }
 assert.equal(new Set(result.samples.map((s:any)=>s.selectedSHA256)).size,1)
 const [counts]=await db.$queryRawUnsafe('SELECT count(*)::int AS rows,sum(octet_length(whole_answers_encrypted))::int AS answers,sum(octet_length(whole_validation_encrypted))::int AS manifests FROM composite_report_jobs')
 assert.equal(counts.rows,2);assert.equal(counts.answers,summaries.reduce((n,x)=>n+x.answerCipherBytes,0));assert.equal(counts.manifests,summaries.reduce((n,x)=>n+x.validationCipherBytes,0))
 result.storedAfterReads=counts;result.completed=true;save();console.log(JSON.stringify(result))
}catch(error:any){result.error={name:error.name,message:error.message};save();throw error}
finally{await db.$disconnect()}
