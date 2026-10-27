import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {original,verifyJob,verifyArtifact,allowedDelta} from './pr363-continuation.mjs';
test('original qualification needs exact successful job, not parent run or skipped state',()=>{
 const name='pr363-pg',j={id:original.jobs[name],name,run_id:original.run,head_sha:original.head,run_attempt:1,status:'completed',conclusion:'success'};verifyJob(j,name);
 for(const patch of [{conclusion:'skipped'},{conclusion:'failure'},{run_attempt:2},{head_sha:'0'.repeat(40)},{id:1}])assert.throws(()=>verifyJob({...j,...patch},name));
});
test('artifact pins reject wrong bytes, stale evidence and other source',()=>{
 const key='frontend-dist',a=original.artifacts[key],now=Date.now(),m={id:a.id,name:a.name,digest:'sha256:'+a.sha256,size_in_bytes:a.size,expired:false,created_at:new Date(now-1000).toISOString(),workflow_run:{id:original.run,head_sha:original.head,head_branch:'perf/four-entry-feedback-20261027'}};verifyArtifact(m,key,now);
 for(const patch of [{digest:'sha256:'+'0'.repeat(64)},{expired:true},{created_at:new Date(now-86400001).toISOString()},{workflow_run:{...m.workflow_run,head_sha:'0'.repeat(40)}}])assert.throws(()=>verifyArtifact({...m,...patch},key,now));
});
test('actual YAML flattens both dist archives and preserves original producer IDs and run',()=>{
 const y=readFileSync('.github/workflows/ci.yml','utf8'),b=y.split('  pr363-browser:\n')[1].split('  pr363-backend-scan:\n')[0];
 for(const c of ['backend','frontend'])assert(b.includes(`artifact-ids: \${{ needs.pr363-${c}-build.outputs.dist_id }}\n        path: server-version/${c}/dist\n        merge-multiple: true`));
 assert.equal((b.match(/run-id: 40511522009/g)||[]).length,2);assert.equal((b.match(/run-id: 40525412926/g)||[]).length,2);assert(b.includes('pr363-continuation.mjs browser'));
 for(const phase of ['build-backend','build-frontend','backend','frontend','pg-schema','pg-current','audit','scan-backend','scan-frontend'])assert(y.includes('pr363-continuation.mjs '+phase));
 assert(!y.includes('run: node .github/scripts/pr363-checks.mjs build-backend'));assert(!y.includes('run: node .github/scripts/pr363-checks.mjs build-frontend'));
 assert(allowedDelta.every(p=>!p.startsWith('server-version/backend/')&&!p.startsWith('server-version/frontend/')));
});
import {unchanged} from './pr363-continuation.mjs';
import {execFileSync} from 'node:child_process';
test('continuation refuses application drift and unrelated source while retaining qualified input selection',()=>{
 const read=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
 assert.throws(()=>unchanged((...a)=>a[0]==='rev-parse'&&a[1]==='HEAD:server-version/backend'?'0'.repeat(40):read(...a)),/(application|backend) input changed/);
 assert.throws(()=>unchanged((...a)=>a[0]==='diff'&&a.length===4?'unknown-unreviewed.txt':read(...a)),/Unreviewed continuation delta/);
});
test('new backend evidence is pinned to its actual successful producer and cannot fall back to first-run bytes',()=>{
 const pin=original.qualifiedBackend,name='pr363-backend-build',job={id:pin.jobs[name],name,run_id:pin.run,head_sha:pin.head,run_attempt:1,status:'completed',conclusion:'success'}
 verifyJob(job,name,pin);assert.throws(()=>verifyJob(job,name))
 const a=pin.artifacts['backend-dist'],now=Date.now(),meta={id:a.id,name:a.name,digest:'sha256:'+a.sha256,size_in_bytes:a.size,expired:false,created_at:new Date(now-1000).toISOString(),workflow_run:{id:pin.run,head_sha:pin.head,head_branch:'perf/four-entry-feedback-20261027'}}
 verifyArtifact(meta,'backend-dist',now,pin);assert.throws(()=>verifyArtifact(meta,'backend-dist',now));assert.throws(()=>verifyArtifact({...meta,digest:'sha256:'+original.artifacts['backend-dist'].sha256},'backend-dist',now,pin))
})
