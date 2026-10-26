import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PR356_BRANCH,PR356_MARKER,isPr356Entry,detectPr356Entry,readPr356Diff} from './pr356-entry.mjs';
const before='a'.repeat(40),after='b'.repeat(40);
test('Draft and Ready PR356 events select only the fixed narrow entry',()=>{
 for(const action of ['opened','synchronize','ready_for_review','reopened']){
  const read=()=>{throw Error('branch route does not read main diff')};
  assert.equal(detectPr356Entry({GITHUB_EVENT_NAME:'pull_request'},{action,pull_request:{head:{ref:PR356_BRANCH}}},read).candidate,true);
 }
});
test('manual phase, full/probe flags cannot restore a legacy route on the fixed branch',()=>{
 for(const phase of ['qualify','admit','', 'unknown'])assert.equal(detectPr356Entry({GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF_NAME:PR356_BRANCH,PR356_PHASE:phase,PR356_FULL_ACCEPTANCE:'true'},{}).candidate,true);
});
test('main complete raw marker routes to exact verification even with unknown extra files',()=>{
 const env={GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',GITHUB_SHA:after};
 let call;const result=detectPr356Entry(env,{before,after},(a,b)=>(call=[a,b],[{file:PR356_MARKER},{file:'unexpected.ts'}]));
 assert.equal(result.candidate,true);assert.deepEqual(call,[before,after]);
});
test('other main deltas do not accidentally enter or suppress their existing routes',()=>{
 assert.equal(detectPr356Entry({GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',GITHUB_SHA:after},{before,after},()=>[{file:'README.md'}]).candidate,false);
 assert.equal(isPr356Entry({event:'pull_request',headRef:'unrelated',entries:[{file:PR356_MARKER}]}),false);
});
test('missing main identities and unavailable raw diffs stop classification',()=>{
 const env={GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',GITHUB_SHA:after};
 assert.throws(()=>detectPr356Entry(env,{},()=>[]));
 assert.throws(()=>detectPr356Entry(env,{before:'0'.repeat(40),after},()=>[]));
 assert.throws(()=>detectPr356Entry(env,{before,after},()=>{throw Error('raw diff unavailable')}));
});

test('actual legacy CLI rejects Ready PR356 before classification',async()=>{
 const {spawnSync}=await import('node:child_process');
 const r=spawnSync(process.execPath,['.github/scripts/content-scope.mjs'],{env:{...process.env,CI_EVENT:'pull_request',CI_HEAD_REF:PR356_BRANCH},encoding:'utf8',timeout:5000});
 assert.equal(r.status,1);assert.match(r.stderr,/explicitly authorized bounded qualification dispatch/);assert.doesNotMatch(r.stderr,/unsettled top-level await/);
});
test('actual legacy CLI rejects the complete PR356 main delta before broad routing',async()=>{
 const {spawnSync,execFileSync}=await import('node:child_process');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const r=spawnSync(process.execPath,['.github/scripts/content-scope.mjs'],{env:{...process.env,CI_EVENT:'push',CI_HEAD_REF:'main',GITHUB_REF:'refs/heads/main',GITHUB_SHA:head,CI_BASE_SHA:'ff8471e529e7b3c56e1e20f17d1e2581040fc896'},encoding:'utf8',timeout:5000});
 assert.equal(r.status,1);assert.match(r.stderr,/explicitly authorized bounded qualification dispatch/);assert.doesNotMatch(r.stderr,/unsettled top-level await/);
});


test('strict NUL raw parser preserves complete path and regular mode identities and rejects truncated or malformed records',()=>{
 const raw=':100644 100644 '+before+' '+after+' M\0folder/file with spaces.ts\0:000000 100644 '+'0'.repeat(40)+' '+after+' A\0.github/scripts/new-file.mjs\0';
 let argv;const read=(command,args)=>(assert.equal(command,'git'),argv=args,raw);
 assert.deepEqual(readPr356Diff(before,after,read),[{file:'folder/file with spaces.ts',oldMode:'100644',newMode:'100644',status:'M'},{file:'.github/scripts/new-file.mjs',oldMode:'000000',newMode:'100644',status:'A'}]);
 assert(argv.includes('--no-renames')&&argv.includes('--no-textconv')&&argv.includes('-z'));assert.deepEqual(readPr356Diff(before,after,()=>''),[]);
 for(const invalid of [raw.slice(0,-1),raw+'orphan\0',':bad\0file\0'])assert.throws(()=>readPr356Diff(before,after,()=>invalid));
 assert.throws(()=>readPr356Diff('--untrusted',after,read));assert.throws(()=>readPr356Diff(before,'HEAD~1',read));
});
