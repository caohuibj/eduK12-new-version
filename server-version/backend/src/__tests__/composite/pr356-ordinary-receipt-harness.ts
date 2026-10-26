import {randomUUID} from 'node:crypto'
import {constants,accessSync,closeSync,existsSync,lstatSync,mkdirSync,openSync,readFileSync,realpathSync,statSync,unlinkSync,writeFileSync} from 'node:fs'
import {basename,isAbsolute,join,parse,relative,resolve,sep} from 'node:path'

export const ordinaryReceiptJourneys=['single','batch','prestop','lockwait'] as const
export type OrdinaryReceiptJourney=typeof ordinaryReceiptJourneys[number]
type JourneyTarget={databaseUrl:string;databaseName:string;ledger:string}
export type OrdinaryReceiptPlan={mode:'fresh'|'replay';root:string;out:string;targets:Partial<Record<OrdinaryReceiptJourney,JourneyTarget>>}
function fail(message:string):never{throw new Error(message)}
const record=(raw:string|undefined,label:string):Record<string,unknown>=>{
 let value:unknown;try{value=JSON.parse(raw??'')}catch{fail(`Explicit ${label} JSON object required`)}
 if(!value||typeof value!=='object'||Array.isArray(value))fail(`Explicit ${label} JSON object required`)
 return value as Record<string,unknown>
}
const within=(root:string,path:string,allowRoot=false)=>{const part=relative(root,path);return (allowRoot||part!=='')&&!part.startsWith('..'+sep)&&part!=='..'&&!isAbsolute(part)}
const noSymlinks=(path:string)=>{
 let current=parse(path).root
 for(const part of path.slice(current.length).split(sep).filter(Boolean)){
  current=join(current,part)
  try{if(lstatSync(current).isSymbolicLink())fail('Evidence paths must not contain symlinks')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 }
}
const absolute=(path:unknown,label:string)=>{
 if(typeof path!=='string'||!isAbsolute(path)||path.split(sep).includes('..'))fail(`Explicit absolute ${label} required`)
 const normalized=resolve(path as string);noSymlinks(normalized);return normalized
}

/** Four physical databases, not four schemas or four names for one claim queue. */
export function readOrdinaryReceiptPlan(env:NodeJS.ProcessEnv):OrdinaryReceiptPlan{
 if(env.NODE_ENV!=='test')fail('Synthetic receipt harness requires NODE_ENV=test')
 const mode=env.PR356_ORDINARY_RECEIPT_MODE
 if(mode!=='fresh'&&mode!=='replay')fail('Explicit ordinary receipt fresh/replay mode required')
 const ci=env.CI==='true'||env.GITHUB_ACTIONS==='true'
 if(ci&&mode==='replay')fail('CI requires fresh isolated receipt journeys')
 const urls=record(env.PR356_ORDINARY_RECEIPT_DATABASE_URLS,'ordinary receipt database map')
 const keys=Object.keys(urls)
 if(mode==='fresh'?(keys.length!==4||ordinaryReceiptJourneys.some(key=>!keys.includes(key))):(!keys.length||keys.some(key=>!['single','batch'].includes(key))))fail('Receipt database map has missing or unsupported journeys')
 const replay=mode==='replay'?record(env.PR356_ORDINARY_RECEIPT_REPLAY_LEDGERS,'local replay ledger map'):{}
 if(mode==='replay'&&(Object.keys(replay).length!==keys.length||keys.some(key=>!(key in replay))))fail('Replay ledger map must exactly match selected journeys')
 const targets:OrdinaryReceiptPlan['targets']={};const names=new Set<string>();let port:string|undefined
 for(const key of keys as OrdinaryReceiptJourney[]){
  let url:URL;try{url=new URL(urls[key] as string)}catch{fail('Dedicated loopback PostgreSQL receipt URL required')}
  if(!['postgres:','postgresql:'].includes(url!.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url!.hostname)||!url!.port||Number(url!.port)<1||Number(url!.port)>65535||url!.hash)fail('Dedicated loopback PostgreSQL receipt URL with explicit port required')
  const match=/^\/pr356_ordinary_receipt_(?:(single|batch|prestop|lockwait)_)?test_[a-f0-9]{10}$/.exec(url!.pathname)
  if(!match||(match[1]&&match[1]!==key))fail('Dedicated receipt database name must match its journey')
  for(const [name,value]of url!.searchParams)if(!['connection_limit','pool_timeout','schema'].includes(name)||(name==='schema'&&value!=='public'))fail('Unsupported receipt database URL option')
  if(port!==undefined&&port!==url!.port)fail('Receipt databases must use the same explicit loopback port')
  port=url!.port
  const databaseName=url!.pathname.slice(1)
  if(names.has(databaseName))fail('Receipt journeys must use different physical databases')
  names.add(databaseName);targets[key]={databaseUrl:url!.toString(),databaseName,ledger:''}
 }
 const root=absolute(ci?env.RUNNER_TEMP:env.PR356_ORDINARY_RECEIPT_EVIDENCE_ROOT,'controlled evidence root')
 if(root===parse(root).root||!existsSync(root)||!statSync(root).isDirectory()||realpathSync(root)!==root)fail('Existing controlled evidence root required')
 const out=absolute(env.PR356_ORDINARY_RECEIPT_OUT,'evidence directory')
 if(!within(root,out,!ci&&mode==='replay'))fail('Evidence directory escapes its controlled root')
 for(const key of keys as OrdinaryReceiptJourney[]){
  const target=targets[key]!
  target.ledger=mode==='fresh'?join(out,`${key}.${target.databaseName}.fixture.json`):absolute(replay[key],'replay ledger')
  if(!within(root,target.ledger)||![`${target.databaseName}.fixture.json`,`${key}.${target.databaseName}.fixture.json`].includes(basename(target.ledger)))fail('Replay ledger path does not match its database/journey')
  if(mode==='fresh'&&existsSync(target.ledger))fail('Fresh receipt ledger already exists; prior evidence must be retained')
  if(mode==='replay'&&(!existsSync(target.ledger)||!statSync(target.ledger).isFile()||statSync(target.ledger).size>2*1024*1024))fail('Explicit bounded local replay ledger required')
 }
 mkdirSync(out,{recursive:true});noSymlinks(out)
 if(!within(root,realpathSync(out),!ci&&mode==='replay'))fail('Evidence directory escapes its controlled root')
 accessSync(out,constants.W_OK)
 const probe=join(out,`.pr356-receipt-write-probe-${randomUUID()}`)
 const fd=openSync(probe,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
 closeSync(fd);unlinkSync(probe)
 return {mode,root,out,targets}
}

export function readOrdinaryReceiptLedger(plan:OrdinaryReceiptPlan,journey:OrdinaryReceiptJourney):any{
 const target=plan.targets[journey]
 if(plan.mode!=='replay'||!target)fail('Only an explicitly selected local replay ledger may be read')
 noSymlinks(target.ledger)
 const fd=openSync(target.ledger,constants.O_RDONLY|constants.O_NOFOLLOW)
 let saved:any;try{saved=JSON.parse(readFileSync(fd,'utf8'))}catch{fail('Explicit replay ledger is not valid JSON')}finally{closeSync(fd)}
 if(!saved||typeof saved.parentId!=='string'||typeof saved.participantId!=='string'||!Array.isArray(saved.scaleIds)||saved.scaleIds.length!==2||new Set(saved.scaleIds).size!==2
  ||!saved.scaleIds.every((id:unknown)=>typeof id==='string')||typeof saved.input?.submissionId!=='string'||!Number.isInteger(saved.input?.attemptEpoch)||!Array.isArray(saved.input?.units)||saved.input.units.length!==2
  ||typeof saved.wholePayloadHash!=='string'||typeof saved.wholeAnswersEncrypted!=='string'
  ||(saved.journey!==undefined&&saved.journey!==journey)||(saved.databaseName!==undefined&&saved.databaseName!==target.databaseName))fail('Replay ledger identity is incomplete or belongs to another journey')
 return saved
}
export function writeOrdinaryReceiptLedger(plan:OrdinaryReceiptPlan,journey:OrdinaryReceiptJourney,saved:unknown):void{
 const target=plan.targets[journey]
 if(plan.mode!=='fresh'||!target)fail('Replay ledgers are read-only')
 noSymlinks(target.ledger)
 const fd=openSync(target.ledger,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
 try{writeFileSync(fd,JSON.stringify({...saved as object,journey,databaseName:target.databaseName},null,2)+'\n')}finally{closeSync(fd)}
}

export function assertOrdinaryReceiptQueue(rows:any[],expected?:{parentId:string;attemptEpoch:number}):any{
 if(!expected){if(rows.length)fail('Fresh receipt journey requires an empty physical report queue');return}
 if(rows.length!==1||rows[0].attemptId!==expected.parentId||rows[0].attemptEpoch!==expected.attemptEpoch)fail('Receipt claim queue contains another journey or epoch')
 if(rows[0].status==='READY')fail('Settled READY fixtures are never rerun')
 return rows[0]
}
async function verifyDatabase(db:any,target:JourneyTarget,saved:any){
 const [identity]=await db.$queryRaw`SELECT current_database() AS "databaseName"`
 if(identity?.databaseName!==target.databaseName)fail('Production Prisma client points to another journey database')
 const jobs=await db.compositeReportJob.findMany({select:{id:true,attemptId:true,attemptEpoch:true,status:true,wholeSubmissionId:true,wholePayloadHash:true,wholeAnswersEncrypted:true}})
 const job=assertOrdinaryReceiptQueue(jobs,saved?{parentId:saved.parentId,attemptEpoch:saved.input.attemptEpoch}:undefined)
 if(!saved)return
 const parent=await db.compositeAssessmentAttempt.findUnique({where:{id:saved.parentId},select:{id:true,userId:true,attemptEpoch:true}})
 const children=await db.assessment.findMany({where:{compositeAttemptId:saved.parentId,attemptEpoch:saved.input.attemptEpoch},select:{scaleId:true,compositeItemId:true}})
 const stops=await db.scaleLibraryEmergencyStop.findMany({where:{targetKind:'TRAINING_SCALE',targetId:{in:saved.scaleIds}},select:{targetId:true}})
 if(parent?.userId!==saved.participantId||parent.attemptEpoch!==saved.input.attemptEpoch||job.wholeSubmissionId!==saved.input.submissionId||job.wholePayloadHash!==saved.wholePayloadHash||job.wholeAnswersEncrypted!==saved.wholeAnswersEncrypted
  ||children.length!==2||children.some((child:any)=>!saved.scaleIds.includes(child.scaleId)||!saved.input.units.some((unit:any)=>unit.itemId===child.compositeItemId))
  ||saved.scaleIds.some((id:string)=>!stops.some((stop:any)=>stop.targetId===id)))fail('Replay parent, job, sources or post-ACK stop do not match the explicit ledger')
}

const baseline={BACKGROUND_WORKERS_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'true',ASSESSMENT_WHOLE_SUBMIT_ENABLED:'true',ASSESSMENT_REPORT_MAX_ATTEMPTS:'1',ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED:'true',ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED:'true',ASSESSMENT_REPORT_ASYNC_COURSE_IDS:'',ASSESSMENT_REPORT_LEASE_MS:'30000'}
type PrismaGlobals={prisma?:any;prismaObservabilityClient?:any}
/** Real imports are supplied by the integration file. Close only clients and
 * queues created by this runner; an unknown global client blocks before reset.
 * resetModules alone cannot invalidate config/database.ts's two global keys. */
export function createOrdinaryReceiptRunner<Services>(plan:OrdinaryReceiptPlan,load:{
 resetModules:()=>unknown;loadClient:()=>Promise<any>;loadQueues:()=>Promise<{closeQueues:(doNotWaitJobs:boolean)=>Promise<unknown>}>;loadServices:()=>Promise<Services>
},options:{env?:NodeJS.ProcessEnv;cache?:PrismaGlobals}={}){
 const env=options.env??process.env,cache=options.cache??globalThis as PrismaGlobals
 let active=false,poisoned=false
 return async<Result>(journey:OrdinaryReceiptJourney,work:(context:{db:any;services:Services;saved:any;target:JourneyTarget})=>Promise<Result>):Promise<Result>=>{
  const target=plan.targets[journey]
  if(!target)fail('This receipt journey was not explicitly configured')
  if(active||poisoned)fail('Receipt journey contexts cannot overlap or reuse failed cleanup')
  if(cache.prisma!==undefined||cache.prismaObservabilityClient!==undefined)fail('Unknown global Prisma client is active; no connection was closed')
  active=true
  const selected={...baseline,DATABASE_URL:target.databaseUrl,ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED:journey==='batch'?'true':'false'}
  const prior=Object.fromEntries(Object.keys(selected).map(key=>[key,env[key]]))
  let db:any,queues:Awaited<ReturnType<typeof load.loadQueues>>|undefined,originalError:unknown
  try{
   const saved=plan.mode==='replay'?readOrdinaryReceiptLedger(plan,journey):null
   Object.assign(env,selected);await load.resetModules()
   if(cache.prisma!==undefined||cache.prismaObservabilityClient!==undefined)fail('Unknown global Prisma client appeared before module loading')
   const loaded=await load.loadClient()
   if(cache.prisma!==loaded||cache.prismaObservabilityClient!==loaded)fail('Loaded production client does not own both Prisma cache keys')
   db=loaded
   await verifyDatabase(db,target,saved)
   queues=await load.loadQueues()
   const services=await load.loadServices()
   return await work({db,services,saved,target})
  }catch(error){originalError=error;throw error}
  finally{
   const errors:unknown[]=[]
   if(queues)try{await queues.closeQueues(true)}catch(error){errors.push(error)}
   if(db)try{await db.$disconnect();if(cache.prisma===db)delete cache.prisma;if(cache.prismaObservabilityClient===db)delete cache.prismaObservabilityClient}catch(error){errors.push(error)}
   for(const [key,value]of Object.entries(prior)){if(value===undefined)delete env[key];else env[key]=value}
   active=false
   if(errors.length){poisoned=true;throw new AggregateError(originalError?[originalError,...errors]:errors,'Receipt journey cleanup failed; later journeys are blocked')}
  }
 }
}
