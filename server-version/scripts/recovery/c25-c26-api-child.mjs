/** Gate the unchanged compiled API behind exact parent ownership registration. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {parseProcStat} from './c25-c26-observer.mjs'
assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test')
assert.equal(process.env.C26_PROBE_ROLE,'api');const nonce=process.env.C26_PROBE_NONCE;assert.match(nonce,/^[a-f0-9]{64}$/)
const identity=parseProcStat(fs.readFileSync('/proc/self/stat','utf8'))
assert.equal(identity.parentPid,Number(process.env.C26_API_PARENT_PID));assert.equal(identity.processGroupId,process.pid)
for(const key of ['BACKGROUND_WORKERS_ENABLED','HEAVY_PROCESSING_ENABLED','VIDEO_PROCESSING_ENABLED'])assert.equal(process.env[key],'false')
const deadline=BigInt(process.env.C26_API_START_DEADLINE_NS),left=()=>{const ms=Number(deadline-process.hrtime.bigint())/1e6;assert.ok(ms>0&&ms<=30000,'API registration startup deadline');return ms}
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>finish(new Error('API ownership permission deadline')),Math.floor(left()))
 const finish=error=>{clearTimeout(timer);process.off('message',message);process.off('disconnect',disconnected);error?reject(error):resolve()}
 const disconnected=()=>finish(new Error('API parent disconnected before registration'))
 const message=value=>{if(value?.type!=='c26:api-permission')return;try{assert.deepEqual(value,{type:'c26:api-permission',nonce,action:'LOAD',parentPid:process.ppid});left();finish()}catch(error){finish(error)}}
 process.on('message',message);process.once('disconnect',disconnected)
 process.send({type:'c26:api-booted',nonce,pid:process.pid,startTicks:identity.startTicks},error=>{if(error)finish(error)})
})
left();await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend/dist/index.js')))
