import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const [root,base] = process.argv.slice(2)
if(!root||!base) throw new Error('Usage: node benchmark-whole-v2-client.mjs evidence-dir http://isolated-container:19030')
const fixtures=JSON.parse(readFileSync(root+'/fixtures.json','utf8'))
const summary=xs=>{const a=xs.toSorted((a,b)=>a-b);return {n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)}}
const results={scope:'Shared V2 HTTP submit route with synthetic entry adapter; not full product authentication / START',measurements:{},raw:{}}
async function submit(flavor,f,body=f.body){const start=performance.now();const r=await fetch(`${base}/${flavor}/attempts/${f.attemptId}/v2/whole/submit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={text}}return {ms:performance.now()-start,status:r.status,data}}
for(const flavor of ['training','teacher']){
 const all=fixtures[flavor],warm=all.slice(-6)
 for(const f of warm.slice(0,4)){const r=await submit(flavor,f);assert.equal(r.status,200,JSON.stringify(r))}
 await fetch(base+'/reset-observation',{method:'POST'});const resourceStart=await(await fetch(base+'/resources')).json()
 const started=performance.now(),rows=await Promise.all(all.slice(0,200).map(f=>submit(flavor,f)))
 const resources=await(await fetch(base+'/resources')).json();resources.cpu={user:resources.cpu.user-resourceStart.cpu.user,system:resources.cpu.system-resourceStart.cpu.system}
 results.raw[flavor]=rows
 results.measurements[flavor]={receiptMs:summary(rows.map(r=>r.ms)),success:rows.filter(r=>r.status===200&&r.data?.data?.status==='COMPLETED').length,wallMs:performance.now()-started,resources,errors:rows.filter(r=>r.status!==200)}
 writeFileSync(root+'/results.json',JSON.stringify(results,null,2))
 // Two concurrent same-payload fresh submissions must resolve to exactly one fresh receipt.
 const pair=await Promise.all([submit(flavor,warm[4]),submit(flavor,warm[4])]);assert.deepEqual(pair.map(r=>r.status),[200,200],JSON.stringify(pair));assert.equal(pair.filter(r=>r.data.data.replayed).length,1)
 const conflict=structuredClone(warm[4].body);conflict.units['scale:0'].answers[0].responseValue=conflict.units['scale:0'].answers[1].responseValue
 const conflicting=await submit(flavor,warm[4],conflict);assert.equal(conflicting.status,409,JSON.stringify(conflicting))
 results.measurements[flavor].duplicateAndConflict='passed'
}
results.verify=await(await fetch(base+'/verify')).json()
assert.equal(results.verify.restored,410,JSON.stringify(results.verify));assert.equal(results.verify.hydrated,410);assert.equal(results.verify.teacherCompleted,205);assert.equal(results.verify.children,0);assert.equal(results.verify.feedbackRows,0)
writeFileSync(root+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({measurements:results.measurements,verify:results.verify},null,2))
