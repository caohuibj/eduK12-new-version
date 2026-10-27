import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {binding,pr357Plan,pr357Outputs} from './pr357-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const head='a'.repeat(40),source='b'.repeat(40),tree='c'.repeat(40),base=binding.base;
const env={CI_EVENT:'pull_request',CI_HEAD_REF:binding.branch,CI_PR_NUMBER:'357',CI_PR_REPOSITORY:'caohuibj/eduK12-new-version',CI_SOURCE_HEAD:source};
const entries=[...Object.entries(binding.source).map(([file,s])=>({file,...s})),...binding.controls.map(file=>({file,status:'A',oldMode:'000000',newMode:'100644'}))];
const read=(cmd,arg)=>{if(cmd==='fetch')return '';if(cmd==='cat-file')return `tree ${tree}\nparent ${base}\nparent ${source}\n`;if(arg?.endsWith('^{tree}'))return tree;const [ref,...path]=arg.split(':'),p=path.join(':');if(p.startsWith('server-version/')&&!p.slice(15).includes('/'))return binding.components[p.slice(15)];const s=binding.source[p];assert(s);return ref===base?s.before:s.after;};
test('PR357 exact product accepts complete source and rejects path/blob/mode/tree/base/foreign/manual drift',()=>{
 const plan=pr357Plan(entries,base,head,read,env);assert.equal(plan.route,'pr357');
 for(const modified of [entries.slice(1),[...entries,{file:'unknown',status:'A',oldMode:'000000',newMode:'100644'}],entries.map((v,i)=>i?v:{...v,newMode:'120000'})])assert.throws(()=>pr357Plan(modified,base,head,read,env));
 for(const e of [{CI_EVENT:'workflow_dispatch'},{CI_FORCE_FULL:'true'},{CI_FULL_ACCEPTANCE:'true'},{CI_PR_NUMBER:'358'},{CI_PR_REPOSITORY:'foreign/repo'}])assert.throws(()=>pr357Plan(entries,base,head,read,{...env,...e}));
 assert.throws(()=>pr357Plan(entries,'d'.repeat(40),head,read,env));
 assert.throws(()=>pr357Plan(entries,base,head,(c,a)=>a===source+'^{tree}'?'d'.repeat(40):read(c,a),env));
 assert.throws(()=>pr357Plan(entries,base,head,(c,a)=>a===head+':'+entries[0].file?'e'.repeat(40):read(c,a),env));
 assert.throws(()=>pr357Plan([],base,head,read,env));
});
test('main reuse reads raw merge parents after bounded history fetch, never shallow pretty parents',()=>{
 const calls=[];const p=pr357Plan(entries,base,head,(...args)=>{calls.push(args);return read(...args)},{CI_EVENT:'push',GITHUB_REF_NAME:'main'});assert.equal(p.postMerge,true);assert(calls.some(a=>a[0]==='fetch'&&a.includes('--depth=2')));assert(calls.some(a=>a[0]==='cat-file'));
 assert.throws(()=>pr357Plan(entries,base,head,(c,...a)=>c==='cat-file'?`tree ${tree}\nparent ${source}\n`:read(c,...a),{CI_EVENT:'push',GITHUB_REF_NAME:'main'}));
});
test('required merge gate needs genuine qualification and CodeQL, refusing every missing/failed/skipped/draft state',()=>{
 const p=pr357Plan(entries,base,head,read,env),outputs=Object.fromEntries(Object.entries(pr357Outputs(p)).map(([k,v])=>[k,String(v)]));
 const n={scope:{result:'success',outputs},pr357:{result:'success'},codeql:{result:'success'}};assert.deepEqual(requiredChecks(n,false),['scope','pr357','codeql']);assert.deepEqual(failedChecks(n,false),[]);
 for(const k of ['scope','pr357','codeql'])for(const result of ['failure','cancelled','skipped',undefined])assert(failedChecks({...n,[k]:{...n[k],result}},false).length);
 assert(failedChecks(n,true).length);assert(failedChecks({...n,scope:{result:'success',outputs:{...outputs,frontend:'true'}}},false).length);
});
test('real YAML connects exact source, independent affected workflow, CodeQL and stable gate',()=>{
 const y=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8'),w=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 assert.match(y,/pr357_plan: \$\{\{ steps.scope.outputs.pr357_plan/);assert(!y.includes('uses: ./.github/workflows/ci-pr357.yml'));assert.match(y,/- pr357\n/);assert(y.includes(binding.branch));assert.match(y,/application_route == 'pr357' && steps.pr357-codeql-config.outputs.config/);
 for(const name of ['pr357-admission','pr357-frontend','pr357-backend','pr357-audit','pr357-connected','pr357'])assert(w.includes('\n  '+name+':'));
 for(const name of ['pr357-admission','pr357-frontend','pr357-backend','pr357-audit','pr357-connected'])assert(w.includes('- '+name));assert.match(w,/chrom[e].cjs preflight/);const bounded=w.slice(w.indexOf('\n  pr357-admission:'),w.indexOf('\n  post356:'));assert(!bounded.includes('--no-sandbox'));assert(!bounded.includes('continue-on-error'));assert(!bounded.includes('ignoreHTTPSErrors'));assert(!bounded.includes('permissions.cjs tighten'));
});
test('service and runner contexts are bound in steps, never in job env',()=>{
 const all=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');const yaml=all.slice(all.indexOf('\n  pr357-admission:'),all.indexOf('\n  post356:'));
 const check=text=>{for(const match of text.matchAll(/^    env:\n([\s\S]*?)(?=^    \S|^  \S|$(?![\s\S]))/gm))assert(!/\$\{\{\s*(job|runner|steps)\./.test(match[1]),'Unavailable job env context');};
 assert.throws(()=>check("  backend:\n    env:\n      DATABASE_URL: ${{ job.services.postgres.id }}\n    steps:\n"));
 assert.throws(()=>check("  connected:\n    env:\n      PRIVATE_DIR: ${{ runner.temp }}\n    steps:\n"));
 const backend=yaml.split('  pr357-backend:')[1].split('  pr357-audit:')[0];assert.doesNotMatch(backend,/services:|pr357-checks.mjs database|docker buildx build/);assert.match(backend,/pr357-checks.mjs backend-reuse/);check(yaml);assert.equal((yaml.match(/name: bind service endpoints only after runner service initialization/g)||[]).length,1);assert.match(yaml,/^      env:\n        DATABASE_URL: .*job.services/m);
});
test('inline PR357 adds no reusable-workflow references and retains the preexisting bounded call graph',async()=>{
 const graph=read=>{const seen=new Set();function walk(path){if(seen.has(path))return;seen.add(path);const text=read(path);for(const m of text.matchAll(/uses:\s*["']?(\.\/\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml)/g))walk(m[1].slice(2));}walk('.github/workflows/ci.yml');return [...seen].sort();};
 const previous=binding.reusableWorkflows;const current=graph(path=>readFileSync(path,'utf8'));
 assert.deepEqual(current,previous,'Do not remove old gates or add the 51st reusable workflow');assert(current.length-1<=50,'At most 50 referenced workflows, excluding the top-level caller');assert(!current.includes('.github/workflows/ci-pr357.yml'));
});
test('browser environment repair is limited to the approved opt directory and read-only font diagnostics',()=>{
 const text=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const block=text.split('  pr357-connected:')[1].split('  pr357:')[0];
 assert.match(block,/p='\/opt';st=os.lstat\(p\)/);assert.match(block,/os.chmod\(p,0o755\)/);
 assert.equal((block.match(/os.chmod\(/g)||[]).length,1);assert.doesNotMatch(block,/chmod -R|no-sandbox|disable-setuid-sandbox/);
 assert(block.indexOf('school-teacher-chrome.cjs preflight')<block.indexOf('school-teacher-fixture.cjs seed'));
 assert.match(block,/'readOnly':True/);
});
