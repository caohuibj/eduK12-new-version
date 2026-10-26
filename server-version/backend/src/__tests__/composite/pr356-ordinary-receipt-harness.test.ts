import {createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {assertOrdinaryReceiptQueue,createOrdinaryReceiptRunner,ordinaryReceiptJourneys,readOrdinaryReceiptLedger,readOrdinaryReceiptPlan,writeOrdinaryReceiptLedger,type OrdinaryReceiptPlan} from './pr356-ordinary-receipt-harness'

let root:string,env:NodeJS.ProcessEnv
const dbName=(index:number)=>`pr356_ordinary_receipt_test_${String(index).padStart(10,'0')}`
const urls=()=>Object.fromEntries(ordinaryReceiptJourneys.map((key,index)=>[key,`postgresql://synthetic:unused@127.0.0.1:5432/${dbName(index+1)}`]))
const saved=()=>({parentId:'parent',participantId:'subject',scaleIds:['scale-a','scale-b'],input:{submissionId:'submission',attemptEpoch:1,units:[{itemId:'a'},{itemId:'b'}]},wholePayloadHash:'payload',wholeAnswersEncrypted:'sealed'})
beforeEach(()=>{
 root=mkdtempSync(join(tmpdir(),'pr356-ordinary-harness-contract-'))
 env={NODE_ENV:'test',PR356_ORDINARY_RECEIPT_MODE:'fresh',PR356_ORDINARY_RECEIPT_DATABASE_URLS:JSON.stringify(urls()),PR356_ORDINARY_RECEIPT_EVIDENCE_ROOT:root,PR356_ORDINARY_RECEIPT_OUT:join(root,'new-evidence')}
})
afterEach(()=>rmSync(root,{recursive:true,force:true}))
function replayPlan():OrdinaryReceiptPlan{
 const ledger=join(root,dbName(1)+'.fixture.json');writeFileSync(ledger,JSON.stringify(saved()))
 env.PR356_ORDINARY_RECEIPT_MODE='replay';env.PR356_ORDINARY_RECEIPT_DATABASE_URLS=JSON.stringify({single:urls().single})
 env.PR356_ORDINARY_RECEIPT_REPLAY_LEDGERS=JSON.stringify({single:ledger})
 return readOrdinaryReceiptPlan(env)
}
function fixtureLoader(plan:OrdinaryReceiptPlan,options:{jobs?:any[];wrongDatabase?:boolean;parent?:any;stops?:any[];cache?:any}={}){
 const cache=options.cache??{},events:string[]=[],clients:any[]=[]
 const load={resetModules:vi.fn(()=>{events.push('reset')}),loadClient:vi.fn(async()=>{
  const databaseName=new URL(env.DATABASE_URL!).pathname.slice(1)
  const db:any={$disconnect:vi.fn(async()=>{events.push('disconnect:'+databaseName)}),
   $queryRaw:vi.fn(async()=>[{databaseName:options.wrongDatabase?'another-database':databaseName}]),
   compositeReportJob:{findMany:vi.fn(async()=>options.jobs??[])},
   compositeAssessmentAttempt:{findUnique:vi.fn(async()=>options.parent??{id:'parent',userId:'subject',attemptEpoch:1})},
   assessment:{findMany:vi.fn(async()=>[{scaleId:'scale-a',compositeItemId:'a'},{scaleId:'scale-b',compositeItemId:'b'}])},
   scaleLibraryEmergencyStop:{findMany:vi.fn(async()=>options.stops??[{targetId:'scale-a'},{targetId:'scale-b'}])}}
  cache.prisma=db;cache.prismaObservabilityClient=db;clients.push(db);events.push('client:'+databaseName);return db
 }),loadQueues:vi.fn(async()=>({closeQueues:vi.fn(async()=>{events.push('queues-close')})})),
 loadServices:vi.fn(async()=>({client:cache.prisma,url:env.DATABASE_URL}))}
 return {cache,events,clients,load,run:createOrdinaryReceiptRunner(plan,load,{env,cache})}
}

describe('ordinary receipt harness database and evidence identity',()=>{
 it('requires four independent physical databases and portable explicit loopback ports',()=>{
  const plan=readOrdinaryReceiptPlan(env)
  expect(Object.keys(plan.targets)).toEqual([...ordinaryReceiptJourneys])
  expect(new Set(Object.values(plan.targets).map(target=>target!.databaseName)).size).toBe(4)
  expect(new Set(Object.values(plan.targets).map(target=>target!.ledger)).size).toBe(4)
  for(const key of ordinaryReceiptJourneys)expect(plan.targets[key]!.ledger).toBe(join(env.PR356_ORDINARY_RECEIPT_OUT!,`${key}.${plan.targets[key]!.databaseName}.fixture.json`))
 })
 it('rejects database aliases even if credentials or URL options differ',()=>{
  const map=urls();map.batch=map.single+'?connection_limit=2';env.PR356_ORDINARY_RECEIPT_DATABASE_URLS=JSON.stringify(map)
  expect(()=>readOrdinaryReceiptPlan(env)).toThrow('different physical databases')
 })
 it.each(['remote','missing port','unscoped database','cross journey name','host override','other schema'] as const)('rejects unsafe %s input before imports or evidence writes',kind=>{
  const map=urls()
  map.single=kind==='remote'?map.single.replace('127.0.0.1','production.example'):kind==='missing port'?map.single.replace(':5432',''):kind==='unscoped database'?map.single.replace(dbName(1),'postgres'):kind==='cross journey name'?map.single.replace(dbName(1),'pr356_ordinary_receipt_batch_test_0000000001'):map.single+(kind==='host override'?'?host=production.example':'?schema=other')
  env.PR356_ORDINARY_RECEIPT_DATABASE_URLS=JSON.stringify(map)
  expect(()=>readOrdinaryReceiptPlan(env)).toThrow()
 })
 it('rejects incomplete maps, unknown cases and different physical ports',()=>{
  for(const map of [{single:urls().single},{...urls(),other:urls().single},{...urls(),lockwait:urls().lockwait.replace(':5432',':55439')}]){
   env.PR356_ORDINARY_RECEIPT_DATABASE_URLS=JSON.stringify(map);expect(()=>readOrdinaryReceiptPlan(env)).toThrow()
  }
 })
 it('allows CI evidence only below its real RUNNER_TEMP and disallows CI replay',()=>{
  const ciRoot=join(root,'runner');mkdirSync(ciRoot);env.CI='true';env.RUNNER_TEMP=ciRoot
  expect(()=>readOrdinaryReceiptPlan(env)).toThrow('escapes')
  env.PR356_ORDINARY_RECEIPT_OUT=join(ciRoot,'receipt-evidence');expect(readOrdinaryReceiptPlan(env).out).toBe(env.PR356_ORDINARY_RECEIPT_OUT)
  env.PR356_ORDINARY_RECEIPT_MODE='replay';expect(()=>readOrdinaryReceiptPlan(env)).toThrow('CI requires fresh')
 })
 it.each(['symlink','dangling symlink','traversal','outside root'] as const)('rejects %s evidence paths',kind=>{
  const target=join(root,'target');mkdirSync(target)
  if(kind.includes('symlink')){const link=join(root,'link');symlinkSync(kind==='symlink'?target:join(root,'missing'),link);env.PR356_ORDINARY_RECEIPT_OUT=join(link,'evidence')}
  else env.PR356_ORDINARY_RECEIPT_OUT=kind==='traversal'?join(root,'target')+'/../evidence':root+'-outside'
  expect(()=>readOrdinaryReceiptPlan(env)).toThrow()
 })
 it('creates each fresh ledger once and refuses to overwrite previous evidence',()=>{
  const plan=readOrdinaryReceiptPlan(env);writeOrdinaryReceiptLedger(plan,'single',saved())
  const original=readFileSync(plan.targets.single!.ledger)
  expect(()=>writeOrdinaryReceiptLedger(plan,'single',saved())).toThrow()
  expect(()=>readOrdinaryReceiptPlan(env)).toThrow('already exists')
  expect(readFileSync(plan.targets.single!.ledger)).toEqual(original)
 })
 it('reads an explicitly selected legacy ledger without changing its bytes or permitting writes',()=>{
  const plan=replayPlan(),path=plan.targets.single!.ledger
  const digest=()=>createHash('sha256').update(readFileSync(path)).digest('hex'),before=digest()
  expect(readOrdinaryReceiptLedger(plan,'single')).toEqual(saved())
  expect(()=>readOrdinaryReceiptLedger(plan,'batch')).toThrow('explicitly selected')
  expect(()=>writeOrdinaryReceiptLedger(plan,'single',saved())).toThrow('read-only')
  expect(digest()).toBe(before)
 })
 it('refuses arbitrary files and replay paths outside the explicit evidence root',()=>{
  const plan=replayPlan();env.PR356_ORDINARY_RECEIPT_REPLAY_LEDGERS=JSON.stringify({single:join(root,'unrelated.json')})
  expect(()=>readOrdinaryReceiptPlan(env)).toThrow('does not match')
  env.PR356_ORDINARY_RECEIPT_REPLAY_LEDGERS=JSON.stringify({single:join(root+'-other',dbName(1)+'.fixture.json')})
  expect(()=>readOrdinaryReceiptPlan(env)).toThrow('does not match')
  expect(readOrdinaryReceiptLedger(plan,'single')).toEqual(saved())
 })
})

describe('ordinary receipt harness claim and production-client lifecycle',()=>{
 it('rejects foreign/extra claim jobs and retains the settled READY prohibition',()=>{
  expect(()=>assertOrdinaryReceiptQueue([{attemptId:'other',attemptEpoch:1,status:'PENDING'}])).toThrow('empty physical report queue')
  const expected={parentId:'parent',attemptEpoch:1},row={attemptId:'parent',attemptEpoch:1,status:'PENDING'}
  expect(assertOrdinaryReceiptQueue([row],expected)).toBe(row)
  for(const rows of [[{...row,attemptId:'other'}],[{...row,attemptEpoch:2}],[row,{...row,attemptId:'other'}]])expect(()=>assertOrdinaryReceiptQueue(rows,expected)).toThrow('another journey or epoch')
  expect(()=>assertOrdinaryReceiptQueue([{...row,status:'READY'}],expected)).toThrow('Settled READY fixtures are never rerun')
 })
 it('loads a distinct client/module context per case and closes queues before its owned client',async()=>{
  const plan=readOrdinaryReceiptPlan(env);env.DATABASE_URL='untouched-original';const f=fixtureLoader(plan)
  for(const key of ['single','batch'] as const)await f.run(key,async({db,services,target})=>{
   expect(services.client).toBe(db);expect(services.url).toBe(target.databaseUrl)
   expect(env.ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED).toBe(key==='batch'?'true':'false')
  })
  expect(f.clients).toHaveLength(2);expect(f.clients[0]).not.toBe(f.clients[1]);expect(f.load.resetModules).toHaveBeenCalledTimes(2)
  expect(f.events).toEqual(['reset','client:'+dbName(1),'queues-close','disconnect:'+dbName(1),'reset','client:'+dbName(2),'queues-close','disconnect:'+dbName(2)])
  expect(f.cache).toEqual({});expect(env.DATABASE_URL).toBe('untouched-original');expect(env.BACKGROUND_WORKERS_ENABLED).toBeUndefined()
 })
 it.each(['prisma','prismaObservabilityClient'] as const)('blocks unknown global %s without resetting modules or disconnecting another client',async key=>{
  const unknown={$disconnect:vi.fn()},plan=readOrdinaryReceiptPlan(env),f=fixtureLoader(plan,{cache:{[key]:unknown}})
  await expect(f.run('single',async()=>{})).rejects.toThrow('Unknown global Prisma')
  expect(unknown.$disconnect).not.toHaveBeenCalled();expect(f.load.resetModules).not.toHaveBeenCalled();expect(f.load.loadClient).not.toHaveBeenCalled()
 })
 it('does not disconnect a returned client that never proved ownership of both global keys',async()=>{
  const plan=readOrdinaryReceiptPlan(env),f=fixtureLoader(plan),unknown={$disconnect:vi.fn()}
  f.load.loadClient.mockResolvedValueOnce(unknown)
  await expect(f.run('single',async()=>{})).rejects.toThrow('does not own both')
  expect(unknown.$disconnect).not.toHaveBeenCalled();expect(f.load.loadServices).not.toHaveBeenCalled()
 })
 it('checks the actual selected database before loading product services or creating fixtures',async()=>{
  const plan=readOrdinaryReceiptPlan(env),f=fixtureLoader(plan,{wrongDatabase:true}),work=vi.fn()
  await expect(f.run('single',work)).rejects.toThrow('another journey database')
  expect(work).not.toHaveBeenCalled();expect(f.load.loadServices).not.toHaveBeenCalled();expect(f.clients[0].$disconnect).toHaveBeenCalledOnce();expect(f.cache).toEqual({})
 })
 it('checks an empty fresh queue before product imports and global claims',async()=>{
  const f=fixtureLoader(readOrdinaryReceiptPlan(env),{jobs:[{attemptId:'foreign',attemptEpoch:1,status:'PENDING'}]})
  await expect(f.run('single',async()=>{})).rejects.toThrow('empty physical report queue')
  expect(f.load.loadServices).not.toHaveBeenCalled();expect(f.cache).toEqual({})
 })
 it('closes owned resources and restores the source URL when a case or import fails',async()=>{
  const plan=readOrdinaryReceiptPlan(env),f=fixtureLoader(plan);const failure=new Error('fixture failure')
  await expect(f.run('single',async()=>{throw failure})).rejects.toBe(failure)
  expect(f.clients[0].$disconnect).toHaveBeenCalledOnce();expect(f.cache).toEqual({});expect(env.DATABASE_URL).toBeUndefined()
  f.load.loadServices.mockRejectedValueOnce(failure)
  await expect(f.run('batch',async()=>{})).rejects.toBe(failure)
  expect(f.clients[1].$disconnect).toHaveBeenCalledOnce();expect(f.cache).toEqual({})
 })
 it('admits an explicitly owned FAILED replay and retains the original ledger bytes',async()=>{
  const plan=replayPlan(),snapshot=readFileSync(plan.targets.single!.ledger)
  const job={attemptId:'parent',attemptEpoch:1,status:'FAILED',wholeSubmissionId:'submission',wholePayloadHash:'payload',wholeAnswersEncrypted:'sealed'}
  const f=fixtureLoader(plan,{jobs:[job]});const work=vi.fn().mockResolvedValue(undefined)
  await f.run('single',work)
  expect(work).toHaveBeenCalledOnce();expect(readFileSync(plan.targets.single!.ledger)).toEqual(snapshot)
 })
 it.each(['READY','foreign parent','wrong subject','missing stop'] as const)('rejects %s replay before loading services or mutating a fixture',async kind=>{
  const plan=replayPlan(),job={attemptId:kind==='foreign parent'?'foreign':'parent',attemptEpoch:1,status:kind==='READY'?'READY':'FAILED',wholeSubmissionId:'submission',wholePayloadHash:'payload',wholeAnswersEncrypted:'sealed'}
  const f=fixtureLoader(plan,{jobs:[job],...(kind==='wrong subject'?{parent:{id:'parent',userId:'foreign',attemptEpoch:1}}:{}),...(kind==='missing stop'?{stops:[]}:{} )})
  await expect(f.run('single',async()=>{})).rejects.toThrow()
  expect(f.load.loadServices).not.toHaveBeenCalled();expect(f.cache).toEqual({})
 })
})
