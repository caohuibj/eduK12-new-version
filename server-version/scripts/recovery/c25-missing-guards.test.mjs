/** New missing-only guard prerequisites and exact body extraction. No database,
 * service, HTTP, guard transaction or accepted historical test is executed. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import test from 'node:test'
import {validateGuardReceipts,requiredGuardPhases} from './c25-missing-guards.mjs'
import {requireOriginalGuardPrerequisites,runGuardBody} from './c25-guards.mjs'

const valid=()=>Object.fromEntries(requiredGuardPhases.map(name=>[name,{schemaVersion:1,passed:true,phase:`missing-${name}`}]))
test('missing guard accepts only all three actual missing-only phases',()=>{
 assert.equal(validateGuardReceipts(valid()),true)
 for(const name of requiredGuardPhases){
  const failed=valid();failed[name].passed=false;assert.throws(()=>validateGuardReceipts(failed))
  const substituted=valid();substituted[name].phase='scheduled';assert.throws(()=>validateGuardReceipts(substituted))
  const omitted=valid();delete omitted[name];assert.throws(()=>validateGuardReceipts(omitted))
 }
 const extra=valid();extra.scheduled={passed:true};assert.throws(()=>validateGuardReceipts(extra))
})

test('original guard CLI still rejects both historical scheduled failures',()=>{
 const h={read:name=>({passed:name==='c25-prepare-result.json'})}
 assert.throws(()=>requireOriginalGuardPrerequisites(h))
 assert.throws(()=>requireOriginalGuardPrerequisites({read:()=>({passed:false})}))
 assert.doesNotThrow(()=>requireOriginalGuardPrerequisites({read:()=>({passed:true})}))
 assert.equal(typeof runGuardBody,'function')
})

test('guard SQL case body stays byte-exact and rollback remains unconditional',()=>{
 const source=fs.readFileSync(new URL('./c25-guards.mjs',import.meta.url),'utf8')
 const body=source.slice(source.indexOf(' const url=new URL(process.env.DATABASE_URL)'),source.indexOf('\n}finally{if(connection)'))
 assert.equal(createHash('sha256').update(body).digest('hex'),'d02f0f9a8eb3907355470695d3fc53f785db2af33928b3993d081bd0accd56e0')
 assert.match(source,/finally\{if\(connection\)\{await connection\.query\('ROLLBACK'\)\.catch\(\(\)=>\{\}\);await connection\.end\(\)\}\}/)
 assert.match(source,/try\{requireOriginalGuardPrerequisites\(h\);await runGuardBody\(h\)\}/)
})
