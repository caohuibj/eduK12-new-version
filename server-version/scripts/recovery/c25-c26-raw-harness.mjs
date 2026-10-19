/** C26-only DTO bridge. Inert import; no legacy harness or /metrics transport.
 * The coordinator supplies private I/O, the one deadline and global stop latch. */
import assert from 'node:assert/strict'
import {createOperationGate,createHttpTransport} from './c25-c26-transport.mjs'

export function createRawHarness({state,apiUrl,remaining,read,write,check,record,onFault,normalize,fetchImpl=fetch,now=()=>performance.now()}){
 for(const callback of [remaining,read,write,check,record,onFault,normalize])assert.equal(typeof callback,'function')
 let failure=null,clientSequence=0
 const gate=createOperationGate(record),measurements=[]
 const stop=error=>{if(!failure){failure=error;gate.stop(error);try{onFault(error)}catch{}}return failure}
 const guarded=run=>{if(failure)throw failure;try{return run()}catch(error){throw stop(error)}}
 const h={state,result:{requests:measurements},remaining:()=>guarded(remaining),
  read:name=>guarded(()=>read(name)),write:(name,value)=>guarded(()=>{remaining();return write(name,value)}),check:label=>guarded(()=>check(label)),
  client(){
   guarded(remaining);const clientId=++clientSequence
   const transport=createHttpTransport({apiUrl,remainingMs:h.remaining,record,gate,normalize,fetchImpl,now})
   return {
    async request(...args){
     try{
      h.remaining();const {value,measurement}=await transport.request(...args)
      assert.ok(measurements.length<1000,'finite C26 HTTP journal bound')
      const retained={clientId,...measurement};record({stage:'DTO_DELIVERED',...retained});measurements.push(retained)
      return value // Preserve the real transport DTO; measurement remains separate.
     }catch(error){throw stop(error)}
    },
    async login(who,role){
     assert.ok(['ADMIN','TEACHER','STUDENT'].includes(role));assert.equal(typeof who.username,'string');assert.equal(typeof who.password,'string')
     // Use this.request so the driver's setup wrapper sees both actual requests.
     await this.request('/auth/csrf')
     return this.request(role==='ADMIN'?'/auth/login':'/auth/training-login','POST',role==='ADMIN'?{username:who.username,password:who.password}:{username:who.username,password:who.password,expectedRole:role})
    },
   }
  },
  stop,
  assertQuiescent(){if(failure)throw failure;return {...gate.assertQuiescent(),delivered:measurements.length,clients:clientSequence}},
 }
 return Object.freeze(h)
}
