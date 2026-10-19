/** New missing-open pure contracts only; never import compiled applications. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {assertMissingOpenRequest,limitedReadClient} from './c25-missing-open.mjs'

test('missing-open import is pure and does not load any installed application',()=>{
 const require=createRequire(import.meta.url);assert.ok(!Object.keys(require.cache).some(file=>file.includes('/backend/dist/')||file.includes('/node_modules/@prisma/')))
})
test('missing-only request guard rejects FINAL checkpoint and actual export operations',()=>{
 for(const [route,method] of [['/cognitive/sessions/e/submit','POST'],['/composite-assessments/attempts/b/whole/submit','POST'],['/composite-assessments/attempts/d/checkpoint','GET'],['/composite-assessments/attempts/d/checkpoint','PUT'],['/composite-assessments/id/export','POST'],['/situational/attempts/b/research-export','GET'],['/composite-assessments/attempts/b/report','POST']])assert.throws(()=>assertMissingOpenRequest(route,method))
 for(const route of ['/composite-assessments/attempts/b/report','/public/composite-assessments/attempts/c/report-status','/cognitive/history'])assertMissingOpenRequest(route)
 for(const route of ['/composite-assessments/attempts/b/analysis-export?format=json','/public/composite-assessments/attempts/c/analysis-export?format=json'])assertMissingOpenRequest(route)
 assert.throws(()=>assertMissingOpenRequest('/composite-assessments/attempts/b/analysis-export?format=csv'))
})
test('native read-only SJT resume remains a real POST in the transported evidence',async()=>{
 const calls=[],raw={recovery:null,request(...args){calls.push(args);return Promise.resolve({result:true})}},client=limitedReadClient(raw),body={}
 await client.request('/situational/attempts/b/resume','POST',body)
 assert.deepEqual(calls,[['/situational/attempts/b/resume','POST',body]]);assert.equal(calls[0][2],body)
 await assert.rejects(async()=>client.request('/situational/attempts/b/submit','POST',body));assert.equal(calls.length,1)
})
test('missing-open source keeps original fixture immutable and invokes original open consumer only',()=>{
 const source=fs.readFileSync(new URL('./c25-missing-open.mjs',import.meta.url),'utf8')
 assert.match(source,/runConsumerChild\(h,'c25-consumers\.mjs','open'\)/);assert.doesNotMatch(source,/participantMatrix|receiptRoute|unreceivedWholeSubmissionId|await .*\.request\([^\n]*checkpoint/)
 assert.match(source,/assert\.deepEqual\(after,before/);assert.match(source,/readMissingPrerequisites\(process\.argv\[2\]\)/)
 assert.match(source,/detached:false/);assert.match(source,/child\.kill\(signal\)/);assert.match(source,/Math\.min\(30000,h\.remaining\(\)\)/)
})
