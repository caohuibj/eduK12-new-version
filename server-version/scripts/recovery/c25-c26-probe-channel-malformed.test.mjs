/** One new fault only: received malformed shared IPC must use controlled stop. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {createProbeChannel} from './c25-c26-probe-channel.mjs'

test('malformed IPC types latch one controlled fault and reject an outstanding sample; valid other namespaces remain ignored',async()=>{
 for(const value of [null,undefined,{},[],{type:1},{type:false},{type:{}},{type:null},{get type(){throw new Error('synthetic IPC getter')}}]){
  const child=new EventEmitter();child.pid=99;child.send=(_message,done)=>done()
  const faults=[],records=[],nonce='a'.repeat(64),identity={pid:99,startTicks:'123'},bindings={runtime:'b'.repeat(64)}
  const channel=createProbeChannel(child,{nonce,role:'api',identity,bindings,remainingMs:()=>1000,record:x=>records.push(x),onFault:e=>faults.push(e)})
  child.emit('message',{type:'c26-runtime-probe-ready',nonce,role:'api',...identity,bindings});await channel.ready()
  child.emit('message',{type:'c26:resources',phase:'start'});assert.equal(channel.assertHealthy().ready,true)
  const pending=channel.request();await Promise.resolve()
  assert.doesNotThrow(()=>child.emit('message',value),'EventEmitter callback must never escape the controlled stop path')
  await assert.rejects(pending,/malformed IPC|synthetic IPC getter/)
  assert.equal(faults.length,1);assert.equal(records.filter(x=>x.stage==='PROBE_FAULT').length,1)
  assert.throws(()=>channel.assertHealthy());await assert.rejects(channel.request())
  assert.doesNotThrow(()=>child.emit('message',{type:1}));assert.equal(faults.length,1)
 }
})
