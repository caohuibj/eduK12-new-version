/** Pure node-postgres I/O doubles; the real adapter does not connect in tests. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {openReadonlyPgObserver,PG_OBSERVER_IDENTITY_SQL} from './c25-c26-pg-connection.mjs'
import {PG_OBSERVER_SQL} from './c25-c26-pg-observer.mjs'
function fixture(fault){
 const events=[],queries=[],clients=[];let heldResolve
 const identity={databaseName:'eduk12_c25_joint_restore',role:'eduk12_owner',observerBackendPid:123,systemIdentifier:'456',postmasterStartedAt:'2026-10-19 15:00:00+00',serverPort:54321,serverVersionNum:'160015',statementTimeout:'200ms',transactionReadOnly:'on',statsFetchConsistency:'none',applicationName:'c26:observer:1234567890abcdef',pgStatStatements:null}
 class Client extends EventEmitter{
  constructor(options){super();this.options=options;this.ends=0;clients.push(this)}
  async connect(){events.push({stage:'fake-connect'});if(fault==='connect')throw new Error('synthetic connect failure')}
  async query(q){queries.push(q);if(fault==='query'&&queries.length>1)throw Object.assign(new Error('permission denied'),{code:'42501'});if(fault==='hold'&&queries.length>1)return new Promise(resolve=>heldResolve=resolve);return {command:'SELECT',rowCount:1,rows:[{...identity,...(fault==='write-setting'?{transactionReadOnly:'off'}:{}),...(fault==='system'?{systemIdentifier:'999'}:{}),...(fault==='extension'?{pgStatStatements:'pg_stat_statements'}:{})}]}}
  async end(){this.ends++;events.push({stage:'fake-end'});heldResolve?.({command:'SELECT',rowCount:1,rows:[identity]})}
 }
 const opts={ownerUrl:'postgresql://eduk12_owner:synthetic@127.0.0.1:54321/eduk12_c25_joint_restore?application_name=untrusted&options=-c%20default_transaction_read_only=off',port:54321,applicationName:identity.applicationName,expectedSystemIdentifier:'456',primaryDatabase:'eduk12_recovery',remainingMs:()=>5000,record:x=>events.push(x),onFault:error=>events.push({stage:'fault',errorClass:error.name})}
 return {events,queries,clients,open:()=>openReadonlyPgObserver(opts,{Client})}
}
const request=signal=>({text:PG_OBSERVER_SQL.activity,values:[],statementTimeoutMs:200,remainingMs:1000,readOnly:true,signal})
test('real PG adapter creates one exact read-only startup and only pinned single SELECTs without SET/reset/metrics SQL',async()=>{
 const f=fixture(),c=await f.open();assert.equal(f.clients.length,1);const options=f.clients[0].options
 assert.equal(options.options,'-c default_transaction_read_only=on -c statement_timeout=200 -c stats_fetch_consistency=none');assert.equal(options.application_name,'c26:observer:1234567890abcdef');assert.equal(options.ssl,false)
 assert.equal(c.target.database,'eduk12_c25_joint_restore');assert.equal(c.target.observerBackendPid,123);assert.deepEqual(c.pgStatStatements,{mode:'unsupported',reason:'EXTENSION_VIEW_NOT_INSTALLED'})
 await c.query(request());assert.deepEqual(f.queries.map(x=>x.text),[PG_OBSERVER_IDENTITY_SQL,PG_OBSERVER_SQL.activity]);assert.equal((await c.close()).completed,2);assert.equal(f.clients[0].ends,1)
})
test('PG adapter rejects settings or physical identity drift and preserves actual permission failure without retry',async()=>{
 for(const fault of ['write-setting','system','connect']){const f=fixture(fault);await assert.rejects(f.open());assert.equal(f.clients[0].ends,1);assert.equal(f.events.filter(x=>x.stage==='fault').length,1)}
 const f=fixture('query'),c=await f.open();await assert.rejects(c.query(request()),e=>e.code==='42501');await assert.rejects(c.close());assert.equal(f.queries.length,2);assert.equal(f.clients[0].ends,1)
})
test('abort destroys only the existing observer connection, never opens cancellation connection or retries',async()=>{
 const f=fixture('hold'),c=await f.open(),controller=new AbortController(),pending=c.query(request(controller.signal));pending.catch(()=>{});await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(pending,/cancelled/)
 await assert.rejects(c.close());assert.equal(f.clients.length,1);assert.equal(f.clients[0].ends,1);assert.equal(f.queries.length,2)
})
test('unreviewed SQL, too-short server budget and overlapping requests fail closed rather than queueing SQL',async()=>{
 for(const change of [{text:'SELECT 1; DELETE FROM old_rows'},{statementTimeoutMs:100},{readOnly:false}]){const f=fixture(),c=await f.open();await assert.rejects(c.query({...request(),...change}));await assert.rejects(c.close());assert.equal(f.queries.length,1)}
 const f=fixture('hold'),c=await f.open(),p=c.query(request());p.catch(()=>{});await new Promise(resolve=>setImmediate(resolve));await assert.rejects(c.query(request()),/overlapping/);await assert.rejects(p,/overlapping/);await assert.rejects(c.close());assert.equal(f.queries.length,2)
})
test('installed statement view is required and an actual query deadline fails the same connection within 200ms',{timeout:2000},async()=>{
 const available=fixture('extension'),a=await available.open();assert.deepEqual(a.pgStatStatements,{mode:'required'});await a.close()
 const f=fixture('hold'),c=await f.open(),at=performance.now();await assert.rejects(c.query(request()),/deadline/);assert.ok(performance.now()-at<1000);await assert.rejects(c.close());assert.equal(f.clients[0].ends,1)
})
