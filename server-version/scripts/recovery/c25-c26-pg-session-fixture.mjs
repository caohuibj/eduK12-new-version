/** SERVICE-FREE CLI fixture. Runs the actual observer parent/leaf protocol,
 * readonly PG adapter, PG observer and proc reader. Only pg.Client and proc
 * file/network tables are synthetic; owned Node identities/CPU are real.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {EventEmitter} from 'node:events'
import {runPgSessionChild} from './c25-c26-pg-session-child.mjs'
import {PG_OBSERVER_IDENTITY_SQL} from './c25-c26-pg-connection.mjs'
import {PG_OBSERVER_SQL,TARGET_DATABASE} from './c25-c26-pg-observer.mjs'
const directory=path.dirname(process.argv[2]),fixture=JSON.parse(fs.readFileSync(path.join(directory,'fixture-config.json'),'utf8'))
assert.equal(fixture.scope,'NO_SERVICE_PG_SESSION')
const event=value=>fs.appendFileSync(path.join(directory,'fixture-events-private.jsonl'),JSON.stringify({pid:process.pid,...value})+'\n',{mode:0o600})
const inetHeader='  sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n',unixHeader='Num RefCount Protocol Flags Type St Inode Path\n'
const databaseKeys=['xact_commit','xact_rollback','blks_read','blks_hit','tup_returned','tup_fetched','tup_inserted','tup_updated','tup_deleted','temp_files','temp_bytes','deadlocks'],walKeys=['wal_records','wal_fpi','wal_bytes','wal_buffers_full','wal_write','wal_sync']
await runPgSessionChild({createIo:({registry,config,self})=>{
 let clients=0,queries=0,closed=false,connections=new Map(),nextBackend=9000001,barrierUsed=false
 const controls=()=>JSON.parse(fs.readFileSync(path.join(directory,'fixture-control.json'),'utf8'))
 const ownerId=p=>`${p.pid}:${p.startTicks}`
 const active=()=>{
  const control=controls(),owners=registry.entries().filter(p=>p.role==='observer'||control.connected.includes(ownerId(p)))
  for(const owner of owners)if(!connections.has(ownerId(owner)))connections.set(ownerId(owner),{owner,pid:nextBackend++,startTicks:String(900000000+nextBackend),port:41000+connections.size,inode:String(100000+connections.size)})
  return owners.map(owner=>connections.get(ownerId(owner)))
 }
 const postmaster=()=>registry.entries().find(p=>p.role==='pg_postmaster')
 const envelope=()=>({databaseName:TARGET_DATABASE,role:'eduk12_owner',observerBackendPid:active().find(p=>p.owner.pid===self.pid).pid,systemIdentifier:config.expectedSystemIdentifier,postmasterStartedAt:'2026-10-19 00:00:00+00',serverPort:config.port,serverVersionNum:'160015',statementTimeout:'200ms',transactionReadOnly:'on',statsFetchConsistency:'none',applicationName:config.identity.applicationName,pgStatStatements:null})
 class Client extends EventEmitter{
  constructor(options){super();assert.equal(++clients,1,'one fixture PG client only');assert.equal(options.application_name,config.identity.applicationName);assert.equal(options.options,'-c default_transaction_read_only=on -c statement_timeout=200 -c stats_fetch_consistency=none');event({stage:'CLIENT_CONSTRUCTED',observerIdentity:config.identity})}
  async connect(){
   assert.ok(registry.entries().some(p=>p.pid===process.pid&&p.role==='observer'),'observer not registered before PG connect');event({stage:'CLIENT_CONNECTED'})
   if(fixture.mode==='bad-ipc')process.send({type:'unrecognized-observer-namespace'})
   if(fixture.mode==='hang-connect-ignore-term'){process.removeAllListeners('SIGTERM');process.on('SIGTERM',()=>{});return new Promise(()=>{})}
  }
  async query({text,values}){
   assert.equal(closed,false);assert.deepEqual(values,[]);assert.ok(text===PG_OBSERVER_IDENTITY_SQL||Object.values(PG_OBSERVER_SQL).includes(text));event({stage:'QUERY',sequence:++queries,identity:text===PG_OBSERVER_IDENTITY_SQL})
   if(text!==PG_OBSERVER_IDENTITY_SQL&&fixture.mode==='query-fault')throw Object.assign(new Error('Synthetic required SELECT denied'),{code:'42501'})
   const row={...envelope(),database:{...Object.fromEntries(databaseKeys.map(k=>[k,'10'])),blk_read_time:0,blk_write_time:0,stats_reset:null},wal:{...Object.fromEntries(walKeys.map(k=>[k,'10'])),wal_write_time:0,wal_sync_time:0,stats_reset:null},activity:active().map(p=>({pid:p.pid,datname:TARGET_DATABASE,backend_type:'client backend',backend_start:'2026-10-19 00:00:01+00',client_addr:'127.0.0.1',client_port:p.port,state:p.owner.role==='observer'?'active':'idle',wait_event_type:null,wait_event:null,application_name:p.owner.applicationName})),databaseBytes:'1048576',relations:[]}
   return {command:'SELECT',rowCount:1,rows:[row]}
  }
  async end(){assert.equal(closed,false,'fixture connection ended more than once');closed=true;event({stage:'CLIENT_ENDED',queries});if(fixture.mode==='hang-connect-ignore-term')return new Promise(()=>{})}
 }
 function tree(){
  const entries=registry.entries(),backends=active(),pm=postmaster(),texts=new Map(),links=new Map(),dirs=new Map()
  const ns='net:[999]';links.set('/proc/self/ns/net',ns)
  for(const owner of entries){
   for(const suffix of ['stat','status'])try{texts.set(`/proc/${owner.pid}/${suffix}`,fs.readFileSync(`/proc/${owner.pid}/${suffix}`,'utf8'))}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error}
   links.set(`/proc/${owner.pid}/ns/net`,ns);dirs.set(`/proc/${owner.pid}/fd`,[])
  }
  dirs.set(`/proc/${pm.pid}/task`,[String(pm.pid)]);texts.set(`/proc/${pm.pid}/task/${pm.pid}/children`,backends.map(p=>p.pid).join(' '))
  for(const backend of backends){
   const fields=['S',pm.pid,pm.processGroupId,0,0,0,0,0,0,0,0,4,2,0,0,0,0,1,0,backend.startTicks,0,1]
   texts.set(`/proc/${backend.pid}/stat`,`${backend.pid} (synthetic-pg-io) ${fields.join(' ')}\n`);texts.set(`/proc/${backend.pid}/status`,'VmRSS:\t4 kB\nVmHWM:\t8 kB\n');links.set(`/proc/${backend.pid}/ns/net`,ns);dirs.set(`/proc/${backend.pid}/fd`,[])
   dirs.set(`/proc/${backend.owner.pid}/fd`,['7']);links.set(`/proc/${backend.owner.pid}/fd/7`,`socket:[${backend.inode}]`)
  }
  const hex=n=>n.toString(16).toUpperCase().padStart(4,'0')
  texts.set('/proc/net/tcp',inetHeader+backends.map((p,index)=>` ${index}: 0100007F:${hex(p.port)} 0100007F:${hex(config.port)} 01 00000000:00000000 00:00000000 00000000 1000 0 ${p.inode}\n`).join(''))
  for(const name of ['tcp6','udp','udp6'])texts.set('/proc/net/'+name,inetHeader)
  texts.set('/proc/net/unix',unixHeader)
  return {texts,links,dirs}
 }
 // Snapshot consistency is real parser/reader behavior: the synthetic tables
 // are rebuilt for each read, so control changes can produce actual races.
 const get=(kind,name)=>{const map=tree()[kind];if(!map.has(name))throw Object.assign(new Error(`fixture proc path absent: ${name}`),{code:'ENOENT'});return map.get(name)}
 const readText=name=>{
  if(fixture.mode.startsWith('async-fault-')&&!barrierUsed&&name==='/proc/net/unix'&&fs.existsSync(path.join(directory,'fault-arm'))){
   barrierUsed=true;event({stage:'ASYNC_FAULT_BARRIER_ENTERED'});fs.writeFileSync(path.join(directory,'fault-entered'),'entered',{mode:0o600})
   const until=performance.now()+1000
   while(!fs.existsSync(path.join(directory,'fault-release'))){assert.ok(performance.now()<until,'fixture barrier deadline');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1)}
   event({stage:'ASYNC_FAULT_BARRIER_RELEASED'});const inode=active().find(p=>p.owner.pid===self.pid).inode
   return unixHeader+`0000000000000000: 00000003 00000000 00000000 0001 03 ${inode}\n`
  }
  return get('texts',name)
 }
 return {Client,procIo:{readText,readlink:name=>get('links',name),readdir:name=>get('dirs',name)}}
}})
