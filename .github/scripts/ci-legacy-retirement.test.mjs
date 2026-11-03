import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
const body=ci.slice(ci.indexOf('\njobs:\n')+7);
const jobs=[...body.matchAll(/^  ([a-z][a-z0-9-]*):\s*$/gm)];
const names=jobs.map(match=>match[1]);
test('closed historical PR pipelines are retired without losing current gate',()=>{
  assert.equal(new Set(names).size,names.length);
  assert.ok(names.includes('scope'));
  assert.ok(names.includes('merge-gate'));
  assert.ok(names.includes('backend-regression-reuse'));
  assert.ok(!names.some(name=>/^(pr356(?:-|$)|pr357(?:-|$)|pr363(?:-|$)|pr364$|post356$)/.test(name)));
  const dispatch=ci.slice(ci.indexOf('  workflow_dispatch:\n'),ci.indexOf('\n\npermissions:\n'));
  assert.doesNotMatch(dispatch,/^\s+pr356_(?:phase|qualification|security_review):/m);
  const gateStart=body.indexOf('  merge-gate:\n');
  const next=body.slice(gateStart+1).match(/^  [a-z][a-z0-9-]*:$/m);
  const gateEnd=next?gateStart+1+next.index:body.length;
  const gate=body.slice(gateStart,gateEnd);
  for(const name of ['scope','frontend','backend','backend-regression','browser','docker','codeql','backend-regression-reuse'])
    assert.match(gate,new RegExp('^    - '+name+'$','m'));
});
test('no active CI job references removed or undefined dependencies',()=>{
 const active=new Set(names),nodeRx=/^[a-z][a-z0-9-]*$/;
 for(let i=0;i<jobs.length;i++){
   const start=jobs[i].index,end=jobs[i+1]?.index??body.length;
   const block=body.slice(start,end),name=jobs[i][1],lines=block.split('\n');
   const inline=block.match(/^    needs: \[([^\]]+)\]/m);
   if(inline)for(const n of inline[1].split(',').map(v=>v.trim())) {
     assert(nodeRx.test(n),name+': malformed inline need '+n);
     assert(active.has(n),name+': missing dependency '+n);
   }
   const at=lines.findIndex(line=>line==='    needs:');
   if(at<0)continue;
   for(let k=at+1;k<lines.length&&/^    - /.test(lines[k]);k++){
     const dep=lines[k].trim().slice(2);
     assert(active.has(dep),name+': missing dependency '+dep);
   }
 }
});

const root=new URL('../../',import.meta.url);
const workflowDir=new URL('../workflows/',import.meta.url);
const workflows=readdirSync(workflowDir).filter(name=>/\.ya?ml$/.test(name));
test('every ci-* reusable workflow is reachable from ci.yml (no orphan per-PR lanes)',()=>{
  for(const name of workflows.filter(n=>/^ci-.+\.ya?ml$/.test(n)))
    assert.ok(ci.includes('./.github/workflows/'+name),name+' is not called by ci.yml');
});
test('workflows and non-test scripts only reference files that exist',()=>{
  const files=[...workflows.map(name=>'.github/workflows/'+name),
    ...readdirSync(new URL('../scripts/',import.meta.url)).filter(n=>/\.(?:mjs|cjs|py|sh)$/.test(n)&&!/\.test\./.test(n)).map(n=>'.github/scripts/'+n)];
  for(const file of files){
    const text=readFileSync(new URL(file,root),'utf8');
    for(const match of text.matchAll(/\.github\/(?:scripts|workflows|config)\/[A-Za-z0-9_.-]+\.(?:mjs|cjs|py|sh|json|ya?ml)/g))
      assert.ok(existsSync(new URL(match[0],root)),file+' references missing '+match[0]);
  }
});
test('exact-candidate evidence and per-product lane files stay retired',()=>{
  assert.equal(existsSync(new URL('.github/evidence',root)),false);
  assert.ok(!workflows.some(name=>/^ci-(?:survey|training|school-teacher|scale-authoring|campus|cognitive-step|measurement-browser|shared-assessment)/.test(name)));
  assert.ok(!names.some(name=>/^(?:survey|training|school-teacher|campus|admin-permissions)-/.test(name)));
  for(const file of ['maintenance-merge.py','test_maintenance_merge.py','admin-permissions-functional.test.mjs','training-functional.mjs'])
    assert.equal(existsSync(new URL('.github/scripts/'+file,root)),false,file);
});
