/** Targeted P2 only: real owned process-group descendant, no services/network. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {observeResourceChild,parseProcStat,summarizeProcesses} from './c25-c26-observer.mjs'
const moduleUrl=new URL('./c25-c26-observer.mjs',import.meta.url).href

test('owned group must be quiescent after normal and abnormal leader close; residual descendant fails and is killed',{timeout:15000},async()=>{
 for(const mode of ['healthy','descendant','abnormal-descendant']){
  const nonce=randomBytes(16).toString('hex'),role='report_worker'
  const source=`
   import {spawn} from 'node:child_process';
   import {once} from 'node:events';
   import {reportNodeResources} from ${JSON.stringify(moduleUrl)};
   const options={nonce:${JSON.stringify(nonce)},role:${JSON.stringify(role)},timeoutMs:1000};
   await reportNodeResources({...options,phase:'start'});
   if(${JSON.stringify(mode)}!=='healthy'){
    const grandchild=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdout.write('ready')"],{detached:false,stdio:['ignore','pipe','ignore']});
    await once(grandchild.stdout,'data');
    process.send({type:'c26-synthetic-descendant',pid:grandchild.pid});
    grandchild.stdout.destroy();grandchild.unref();
   }
   await reportNodeResources({...options,phase:'terminal'});
   if(${JSON.stringify(mode)}==='abnormal-descendant')process.exitCode=7;
  `
  const child=spawn(process.execPath,['--input-type=module','-e',source],{detached:true,stdio:['ignore','ignore','ignore','ipc']})
  let descendantPid=null;child.on('message',message=>{if(message?.type==='c26-synthetic-descendant')descendantPid=message.pid})
  const outcome=observeResourceChild(child,{nonce,role,deadlineMs:5000,killGraceMs:100,reapMs:1000})
  try{
   if(mode==='healthy'){
    const result=await outcome;assert.equal(result.lifecycle.groupQuiescent,true);assert.deepEqual(result.lifecycle.finalGroupMembers,[])
    assert.equal(summarizeProcesses([],100,{children:[result],requiredChildren:[result.start]}).physical.length,1)
   }else{
    await assert.rejects(outcome,error=>{
     assert.match(error.message,mode==='descendant'?/live descendant/:/abnormal close/)
     const l=error.lifecycle;assert.equal(l.closeObserved,true);assert.equal(l.code,mode==='descendant'?0:7)
     assert.equal(l.processGroupId,child.pid);assert.equal(l.groupQuiescent,true)
     assert.ok(l.groupMembersAtClose.some(x=>x.pid===descendantPid&&x.processGroupId===child.pid&&!['Z','X','x'].includes(x.state)))
     assert.ok(l.terminationSignals.some(x=>x.signal==='SIGKILL'&&x.sent))
     assert.ok(l.finalGroupMembers.every(x=>['Z','X','x'].includes(x.state)))
     return true
    })
    try{const current=parseProcStat(fs.readFileSync(`/proc/${descendantPid}/stat`,'utf8'));assert.ok(['Z','X','x'].includes(current.state),'descendant cannot remain live')}
    catch(error){if(error.code!=='ENOENT')throw error}
   }
  }finally{
   // Only this detached group belongs to this test; no name-based service kill.
   try{process.kill(-child.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}
   assert.ok(child.exitCode!==null||child.signalCode!==null,'leader must be reaped')
  }
 }
})
