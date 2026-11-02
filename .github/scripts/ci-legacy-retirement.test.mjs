import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
  assert.doesNotMatch(ci,/^\s+pr356_(?:phase|qualification|security_review):/m);
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
