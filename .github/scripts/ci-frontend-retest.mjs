// Fail-closed reuse of a completed platform PR CI run when its only broken
// check was one frontend Vitest assertion and the next commit edits that test.
// Never post synthetic statuses: the new head must run an actual frontend job
// and a fresh protected merge gate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {failedChecks} from './merge-gate.mjs';
import {frontendTestFile} from './content-scope.mjs';

const sha40=/^[a-f0-9]{40}$/;
const filePrefix='server-version/frontend/';
const frontendJob='frontend (lint + types + selected tests) / frontend checks';
const gateJob='merge gate / ready PR';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const safeSha=value=>{assert(sha40.test(value||''),'Invalid Git SHA');return value;};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

export function eligibleTestDelta(before,after) {
  assert(Array.isArray(before)&&Array.isArray(after)&&before.length&&after.length);
  const tree=entries=>{
    const result=new Map();
    for(const entry of entries){
      assert(typeof entry.path==='string'&&!result.has(entry.path),'Bad/duplicate tree path');
      assert(/^[a-f0-9]{40}$/.test(entry.sha)&&/^(100644|100755|120000|160000)$/.test(entry.mode)
        &&(entry.mode==='160000'?entry.type==='commit':entry.type==='blob'),'Unsafe tree object');
      result.set(entry.path,entry.mode+':'+entry.type+':'+entry.sha);
    }
    return result;
  };
  const source=tree(before),target=tree(after);
  const changed=[...new Set([...source.keys(),...target.keys()])]
    .filter(path=>source.get(path)!==target.get(path));
  if(changed.length!==1)return null;
  const path=changed[0];
  if(!frontendTestFile(path)||!source.has(path)||!target.has(path)
      ||!source.get(path).startsWith('100644:blob:')||!target.get(path).startsWith('100644:blob:'))return null;
  return path.slice(filePrefix.length);
}

export function validateFailureReport(report,testFile) {
  assert(report&&report.success===false&&report.numFailedTests===1
    &&Number.isSafeInteger(report.numPassedTests)&&report.numPassedTests>0,
    'Source report was not a single failing test from a completed suite');
  assert(Array.isArray(report.testResults)&&report.testResults.length>1,'Incomplete frontend test inventory');
  let failed=0;
  const names=new Set();
  for(const suite of report.testResults){
    assert(typeof suite.name==='string'&&!names.has(suite.name),'Duplicate/missing suite name');
    names.add(suite.name);
    const assertions=suite.assertionResults;
    assert(Array.isArray(assertions)&&assertions.length>0,'Missing suite assertions');
    const bad=assertions.filter(t=>t.status==='failed');
    assert(!assertions.some(t=>!['passed','failed','pending','skipped','todo'].includes(t.status)),
      'Unknown test result');
    if(bad.length){
      assert(suite.name.replaceAll('\\','/').endsWith('/'+filePrefix+testFile),
        'A different frontend file failed');
      failed+=bad.length;
    }
  }
  assert.equal(failed,1,'Frontend report failures do not reconcile');
  return true;
}

export function validateSourceEvidence({run,jobs,needs,report,baseSha,pr,repo,testFile,now=Date.now()}) {
  assert(run&&run.path==='.github/workflows/ci.yml'&&run.event==='pull_request'
    &&run.status==='completed'&&run.conclusion==='failure','Source run is not a completed failed CI');
  assert(run.repository?.full_name===repo&&run.pull_requests?.some(p=>p.number===pr),
    'Source run belongs to a different PR');
  assert(Number.isInteger(run.id)&&Number.isInteger(run.run_attempt)&&run.run_attempt>=1,
    'Invalid source run identity');
  assert(Date.parse(run.updated_at)>0&&now-Date.parse(run.updated_at)>=0
    &&now-Date.parse(run.updated_at)<=48*3600*1000,'Source evidence expired');
  assert(Array.isArray(jobs)&&jobs.length>=5,'Missing source jobs');
  const official=(name,conclusion)=>{
    const found=jobs.filter(j=>j.name===name);
    assert(found.length===1&&found[0].status==='completed'
      &&found[0].conclusion===conclusion,'Missing/ambiguous official job: '+name);
    if(found[0].run_attempt!==undefined&&found[0].run_attempt!==null)
      assert.equal(found[0].run_attempt,run.run_attempt,'Job from a different attempt');
  };
  official(frontendJob,'failure');
  official(gateJob,'failure');
  // No other run job may fail, be cancelled, time out or remain in progress.
  for(const job of jobs){
    assert(job.status==='completed','Incomplete source job');
    if(job.name!==frontendJob&&job.name!==gateJob)
      assert(['success','skipped','neutral'].includes(job.conclusion),'Other failed source job: '+job.name);
  }
  assert(needs?.scope?.result==='success','Missing prior scope');
  const scope=needs.scope.outputs;
  assert(scope.scenario==='platform'&&scope.application_route==='legacy'
    &&scope.diff_base===baseSha&&scope.frontend_retest!=='true',
    'Historical run was not a normal platform gate on this base');
  assert.deepEqual(failedChecks(needs,false),['frontend'],
    'Another required source dependency did not pass');
  validateFailureReport(report,testFile);
  return true;
}

function treeFor(sha){
  safeSha(sha);
  const bytes=execFileSync('git',['ls-tree','-r','-z',sha],{encoding:'utf8',maxBuffer:32*1024*1024});
  return bytes.split('\0').filter(Boolean).map(entry=>{
    const m=entry.match(/^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40})\t(.+)$/s);
    assert(m,'Invalid tree entry');
    return {mode:m[1],type:m[2],sha:m[3],path:m[4]};
  });
}
async function gh(path,token,repo){
  assert(/^[\w.-]+\/[\w.-]+$/.test(repo)&&typeof token==='string'&&token,'Missing authorized API context');
  const res=await fetch('https://api.github.com/repos/'+repo+path,{
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28','User-Agent':'eduK12-single-frontend-retest'},redirect:'follow'});
  if(!res.ok)throw Error('GitHub API '+res.status+' '+path);
  return res.json();
}
async function pages(path,token,repo,key){
  const items=[];
  for(let page=1;page<=4;page++){
    const data=await gh(path+(path.includes('?')?'&':'?')+'per_page=100&page='+page,token,repo);
    const batch=data[key]||[];
    items.push(...batch);
    if(batch.length<100)break;
  }
  return items;
}
async function officialJsonZip(artifact,filename,token,repo){
  assert(artifact&&!artifact.expired&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest||''),
    'Original artifact missing digest');
  const response=await fetch('https://api.github.com/repos/'+repo+'/actions/artifacts/'+artifact.id+'/zip',{
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
      'User-Agent':'eduK12-single-frontend-retest'},redirect:'follow'});
  if(!response.ok)throw Error('Artifact unavailable');
  const size=Number(response.headers.get('content-length')||0);
  assert(size<=24*1024*1024,'Artifact oversized');
  const bytes=Buffer.from(await response.arrayBuffer());
  assert(bytes.length>0&&bytes.length<=24*1024*1024,'Artifact empty or oversized');
  assert.equal('sha256:'+sha256(bytes),artifact.digest,'GitHub artifact archive hash mismatch');
  const dir=mkdtempSync(join(tmpdir(),'frontend-retest-evidence-'));
  try{
    const zip=join(dir,'official.zip');
    writeFileSync(zip,bytes,{flag:'wx',mode:0o600});
    const names=execFileSync('unzip',['-Z','-1',zip],{encoding:'utf8'}).trim().split('\n');
    assert.deepEqual(names,[filename],'Unexpected archive inventory');
    const raw=execFileSync('unzip',['-p',zip,filename],{maxBuffer:18*1024*1024});
    assert(raw.length>0&&raw.length<18*1024*1024,'Invalid artifact report');
    return JSON.parse(raw.toString('utf8'));
  }finally{rmSync(dir,{recursive:true,force:true});}
}
async function artifactReport(run,prefix,token,repo){
  const name=prefix+'-run-'+run.id+'-attempt-'+run.run_attempt;
  const list=await pages('/actions/runs/'+run.id+'/artifacts',token,repo,'artifacts');
  const found=list.filter(a=>a.name===name&&!a.expired&&a.workflow_run?.id===run.id
    &&(!a.workflow_run?.head_sha||a.workflow_run.head_sha===run.head_sha));
  assert.equal(found.length,1,'Missing/duplicate report artifact '+name);
  const filename=(prefix==='frontend-vitest-report'?'frontend-vitest.json':
    'merge-gate-needs-'+run.id+'-'+run.run_attempt+'.json');
  const data=await officialJsonZip(found[0],filename,token,repo);
  return {data,digest:found[0].digest.slice('sha256:'.length)};
}
function fetchParent(sha){
  safeSha(sha);
  try{git('cat-file','-e',sha+'^{commit}');}
  catch{git('fetch','--no-tags','--depth=3','origin',sha);}
  git('cat-file','-e',sha+'^{commit}');
}

// Only an immediate, single-test-file follow-up commit qualifies. Source run
// must have already FINISHED before that follow-up, never be cancelled by it.
export async function verifiedFrontendRetest({token,repo,pr,branch,prHead,baseSha,currentRunId,
  sourceId=null,quiet=false}){
  if(!Number.isSafeInteger(pr)||pr<1||!Number.isSafeInteger(currentRunId)
    ||!sha40.test(prHead||'')||!sha40.test(baseSha||'')
    ||typeof branch!=='string'||!branch||!token)return null;
  fetchParent(prHead);
  const parent=git('rev-parse',prHead+'^');
  if(!sha40.test(parent))return null;
  fetchParent(parent);
  const sourceTree=treeFor(parent),currentTree=treeFor(prHead);
  const testFile=eligibleTestDelta(sourceTree,currentTree);
  if(!testFile)return null;
  // The entire workflow, lockfiles, production files and main base are
  // byte-identical to the source. A source-to-head merge is not admitted.
  const runs=(await pages('/actions/runs?branch='+encodeURIComponent(branch)+'&event=pull_request',
    token,repo,'workflow_runs'))
    .filter(run=>run.id<currentRunId&&run.id!==currentRunId
      &&(!sourceId||run.id===Number(sourceId))&&run.head_sha===parent
      &&run.head_branch===branch).slice(0,8);
  for(const run of runs){
    try{
      const [jobs,prior,vitest]=await Promise.all([
        pages('/actions/runs/'+run.id+'/jobs?filter=latest',token,repo,'jobs'),
        artifactReport(run,'ci-gate-evidence',token,repo),
        artifactReport(run,'frontend-vitest-report',token,repo)
      ]);
      validateSourceEvidence({run,jobs,needs:prior.data,report:vitest.data,
        baseSha,pr,repo,testFile});
      // CI source checkout may be a synthetic merge commit; the PR head
      // source->current tree relationship is independently authenticated.
      if(sourceId&&String(run.id)!==String(sourceId))throw Error('Incorrect provenance run');
      return {testFile,runId:run.id,sourceSha:parent,baseSha,
        gateDigest:prior.digest,reportDigest:vitest.digest};
    }catch(e){
      if(!quiet)console.warn('Reject frontend retest source '+run.id+': '+String(e?.message||e).slice(0,350));
    }
  }
  return null;
}
