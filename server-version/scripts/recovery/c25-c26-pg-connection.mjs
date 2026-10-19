/** Dedicated read-only node-postgres adapter. No connection at import time.
 * Timeout/abort closes this exact socket; no second cancellation connection,
 * SQL retry, SET/reset, transaction, extension install or write is issued. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {PG_OBSERVER_SQL,TARGET_DATABASE} from './c25-c26-pg-observer.mjs'
const require=createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend/package.json'))
export const PG_OBSERVER_IDENTITY_SQL=`SELECT current_database() AS "databaseName",current_user AS "role",pg_backend_pid() AS "observerBackendPid",(SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",pg_postmaster_start_time()::text AS "postmasterStartedAt",inet_server_port() AS "serverPort",current_setting('server_version_num') AS "serverVersionNum",current_setting('statement_timeout') AS "statementTimeout",current_setting('transaction_read_only') AS "transactionReadOnly",current_setting('stats_fetch_consistency') AS "statsFetchConsistency",current_setting('application_name') AS "applicationName",to_regclass('public.pg_stat_statements')::text AS "pgStatStatements"`
export async function openReadonlyPgObserver({ownerUrl,port,applicationName,expectedSystemIdentifier,primaryDatabase,remainingMs,record,onFault},{Client}={}){
 for(const fn of [remainingMs,record,onFault])assert.equal(typeof fn,'function')
 const url=new URL(ownerUrl);assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.username,'eduk12_owner');assert.equal(url.pathname,'/'+TARGET_DATABASE);assert.equal(Number(url.port),port)
 assert.match(applicationName,/^c26:observer:[a-f0-9]{16}$/);assert.match(expectedSystemIdentifier,/^[1-9][0-9]*$/);assert.equal(primaryDatabase,'eduk12_recovery')
 const remaining=()=>{const value=remainingMs();assert.ok(Number.isFinite(value)&&value>0,'PG connection aggregate deadline');return value}
 assert.ok(remaining()>=3000,'PG observer startup needs bounded connection budget')
 const options={host:'127.0.0.1',port,user:'eduk12_owner',password:decodeURIComponent(url.password),database:TARGET_DATABASE,ssl:false,application_name:applicationName,options:'-c default_transaction_read_only=on -c statement_timeout=200 -c stats_fetch_consistency=none',connectionTimeoutMillis:Math.min(3000,Math.floor(remaining())),query_timeout:200}
 const ActualClient=Client??require('pg').Client,client=new ActualClient(options)
 let failure=null,closed=false,ending=null,inFlight=false,connected=false,issued=0,completed=0
 function stop(error){if(failure)return failure;failure=error;try{record({stage:'PG_ADAPTER_FAULT',errorClass:error.name,code:error.code??null})}catch{};try{onFault(error)}catch{};return failure}
 function end(){
  if(ending)return ending
  // pg 8.16.3 Client.end destroys its own socket when an active query exists.
  closed=true;try{ending=Promise.resolve(client.end())}catch(error){ending=Promise.reject(error)}ending.catch(()=>{});return ending
 }
 const bounded=async(fn,ms,signal)=>{
  assert.ok(!signal?.aborted,'PG query already cancelled')
  let timer,abort
  const failurePromise=new Promise((_,reject)=>{
   abort=()=>{const error=stop(new Error('PG observer query cancelled'));void end();reject(error)}
   timer=setTimeout(()=>{const error=stop(new Error('PG observer socket deadline'));void end();reject(error)},ms)
   signal?.addEventListener('abort',abort,{once:true})
  })
  try{return await Promise.race([Promise.resolve().then(fn),failurePromise])}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 }
 client.on('error',error=>{stop(error);void end()})
 const queryOne=async(text,signal,limit)=>{
  if(failure)throw failure;assert.ok(!closed&&!inFlight,'overlapping or closed observer PG connection');assert.ok(remaining()>=limit)
  inFlight=true;issued++;const at=performance.now(),cpu=process.cpuUsage()
  try{
   record({stage:'PG_ADAPTER_QUERY_ISSUED',sequence:issued,kind:text===PG_OBSERVER_IDENTITY_SQL?'identity':Object.keys(PG_OBSERVER_SQL).find(k=>PG_OBSERVER_SQL[k]===text),timeoutMs:limit})
   const result=await bounded(()=>client.query({text,values:[],query_timeout:limit}),limit,signal)
   if(failure)throw failure;remaining();assert.equal(result.command,'SELECT');assert.equal(result.rows.length,1);assert.equal(result.rowCount,1);assert.equal(result.rows[0].transactionReadOnly,'on');assert.equal(result.rows[0].statementTimeout,'200ms');assert.equal(result.rows[0].statsFetchConsistency,'none')
   completed++;record({stage:'PG_ADAPTER_QUERY_COMPLETED',sequence:issued,elapsedMs:performance.now()-at,cpuMicros:process.cpuUsage(cpu),rowCount:1});return result
  }catch(error){stop(error);void end();throw error}finally{inFlight=false}
 }
 try{
  const at=performance.now();await bounded(()=>client.connect(),options.connectionTimeoutMillis);connected=true;record({stage:'PG_ADAPTER_CONNECTED',elapsedMs:performance.now()-at,applicationName,port})
  const response=await queryOne(PG_OBSERVER_IDENTITY_SQL,undefined,200),row=response.rows[0]
  assert.equal(row.databaseName,TARGET_DATABASE);assert.equal(row.role,'eduk12_owner');assert.equal(row.systemIdentifier,expectedSystemIdentifier);assert.equal(row.serverPort,port);assert.equal(row.serverVersionNum,'160015');assert.equal(row.applicationName,applicationName);assert.ok(Number.isSafeInteger(row.observerBackendPid)&&row.observerBackendPid>0);assert.ok(typeof row.postmasterStartedAt==='string'&&row.postmasterStartedAt.length>0)
  assert.ok(row.pgStatStatements===null||row.pgStatStatements==='pg_stat_statements'||row.pgStatStatements==='public.pg_stat_statements')
  const target={database:TARGET_DATABASE,primaryDatabase,primarySystemIdentifier:expectedSystemIdentifier,systemIdentifier:row.systemIdentifier,postmasterStartedAt:row.postmasterStartedAt,observerBackendPid:row.observerBackendPid,port}
  return Object.freeze({target,pgStatStatements:row.pgStatStatements===null?{mode:'unsupported',reason:'EXTENSION_VIEW_NOT_INSTALLED'}:{mode:'required'},
   async query({text,values,statementTimeoutMs,remainingMs:left,signal,readOnly}){
    try{assert.ok(Object.values(PG_OBSERVER_SQL).includes(text),'unreviewed observer SQL');assert.deepEqual(values,[]);assert.equal(readOnly,true);assert.equal(statementTimeoutMs,200,'fixed server timeout cannot fit shortened remaining window');assert.ok(left>=200);return await queryOne(text,signal,200)}catch(error){stop(error);void end();throw error}
   },
   async close(){const pending=end();try{await bounded(()=>pending,Math.min(1000,Math.floor(remaining())));record({stage:'PG_ADAPTER_CLOSED',connected,issued,completed,previousFailure:!!failure});assert.ok(!failure,'PG observer previously failed');return {closed:true,issued,completed}}catch(error){stop(error);throw error}},
  })
 }catch(error){stop(error);const pending=end();try{await bounded(()=>pending,Math.max(1,Math.min(1000,Math.floor(remaining()))))}catch{};throw error}
}
