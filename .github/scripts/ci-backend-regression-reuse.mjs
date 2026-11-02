// Reuse *complete* backend regression only if an earlier official PR run's
// successfully aggregated report covers byte-identical executable inputs.
// Failure/timeout/cancelled or absent evidence ALWAYS means execute normally.
// This script has no GitHub write permission and never sets a commit status.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {regressionGroups} from './backend-regression-selection.mjs';
import {closureDigest,verifyHistoricalSuccess} from './ci-qualification.mjs';

const sha40=/^[a-f0-9]{40}$/;
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const mustSha=v=>{assert(sha40.test(v||''),'Exact Git SHA required');return v;};

export function treeFor(sha){
  mustSha(sha);
  const raw=execFileSync('git',['ls-tree','-r','-z',sha],{encoding:'utf8',maxBuffer:32*1024*1024});
  return raw.split('\0').filter(Boolean).map(entry=>{
    const m=entry.match(/^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40})\t(.+)$/s);
    assert(m,'Malformed historical git tree entry');
    return {mode:m[1],type:m[2],sha:m[3],path:m[4]};
  });
}

export function verifyGroupInventories(inventories,{runId,attempt,groups=regressionGroups}){
  assert.equal(inventories.length,groups.length,'Missing backend regression inventory');
  assert.deepEqual(inventories.map(x=>x.group).sort(),[...groups].sort());
  const tested=new Set();
  const source=new Set();
  let full=null;
  for(const inventory of inventories){
    assert.equal(String(inventory.execution?.runId),String(runId),'Foreign run artifact');
    assert(Number.isSafeInteger(inventory.execution?.attempt)&&inventory.execution.attempt>=1
      &&inventory.execution.attempt<=attempt,'Invalid source attempt');
    const sourceSha=mustSha(inventory.execution.sha);
    source.add(sourceSha);
    assert(Array.isArray(inventory.expectedFiles)&&inventory.expectedFiles.length>0,'Empty regression group');
    assert(Array.isArray(inventory.fullExpectedFiles)&&inventory.fullExpectedFiles.length>0,'Missing complete inventory');
    if(!full)full=inventory.fullExpectedFiles;
    else assert.deepEqual(inventory.fullExpectedFiles,full,'Mismatch in full regression inventory');
    for(const file of inventory.expectedFiles){
      assert(typeof file==='string'&&file.startsWith('src/__tests__/')&&file.endsWith('.test.ts'));
      // A small set of retained consumers is intentionally exercised by the fixtures lane.
      if(tested.has(file))throw Error('Regression test was counted twice: '+file);
      tested.add(file);
    }
  }
  assert.equal(source.size,1,'Group artifacts refer to different checkout trees');
  const expected=new Set(full);
  for(const file of full)assert(tested.has(file),'Missing regression test: '+file);
  for(const file of tested)assert(expected.has(file),'Unexpected regression test: '+file);
  return [...source][0];
}

async function github(route,token,repo){
  const res=await fetch('https://api.github.com/repos/'+repo+route,{
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'eduK12-ci-verified-regression-reuse'},redirect:'follow'});
  if(!res.ok)throw Error('GitHub API '+res.status+' '+route);
  return res.json();
}
async function pages(route,token,repo,key){
  const values=[];
  for(let page=1;page<=4;page++){
    const data=await github(route+(route.includes('?')?'&':'?')+'per_page=100&page='+page,token,repo);
    const part=data[key]??[];
    values.push(...part);
    if(part.length<100)break;
  }
  return values;
}
async function officialZip(id,expectedDigest,token,repo){
  assert.match(expectedDigest||'',/^sha256:[a-f0-9]{64}$/);
  const url='https://api.github.com/repos/'+repo+'/actions/artifacts/'+id+'/zip';
  const response=await fetch(url,{
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
      'User-Agent':'eduK12-ci-verified-regression-reuse'},redirect:'follow'});
  if(!response.ok)throw Error('Official artifact download unavailable: '+response.status);
  const maxBytes=64*1024*1024;
  const len=Number(response.headers.get('content-length')||0);
  if(len>maxBytes)throw Error('Oversized artifact');
  const zip=new Uint8Array(await response.arrayBuffer());
  if(!zip.length||zip.length>maxBytes)throw Error('Artifact archive missing or oversized');
  const actual='sha256:'+createHash('sha256').update(zip).digest('hex');
  assert.equal(actual,expectedDigest,'Original GitHub artifact archive digest mismatch');
  return zip;
}
function inventoriesFromZip(zip,runId,attempt){
  const dir=mkdtempSync(join(tmpdir(),'backend-reuse-'));
  try{
    const path=join(dir,'official.zip');
    writeFileSync(path,zip,{flag:'wx',mode:0o600});
    const names=execFileSync('unzip',['-Z','-1',path],{encoding:'utf8',maxBuffer:4*1024*1024})
      .trim().split('\n').filter(Boolean);
    const inventories=[];
    for(const group of regressionGroups){
      const target='eduk12-backend-inventory-'+group+'.json';
      const files=names.filter(name=>name.endsWith('/'+target));
      assert.equal(files.length,1,'Missing/duplicate original inventory: '+group);
      const filename=files[0];
      assert(/^group-artifacts\/backend-regression-group-(fixtures|shard-[0-9]+)-run-[0-9]+-attempt-[0-9]+\//.test(filename),
        'Inventory outside bounded regression group');
      assert(filename.includes('backend-regression-group-'+group+'-run-'+runId+'-attempt-'),
        'Inventory from unexpected group or run');
      const bytes=execFileSync('unzip',['-p',path,filename],{maxBuffer:5*1024*1024});
      inventories.push(JSON.parse(bytes.toString('utf8')));
    }
    return verifyGroupInventories(inventories,{runId,attempt});
  }finally{rmSync(dir,{recursive:true,force:true});}
}
function fetchHistoricalCommit(sha){
  mustSha(sha);
  try{git('cat-file','-e',sha+'^{commit}');}
  catch{git('fetch','--no-tags','--depth=1','origin',sha);git('cat-file','-e',sha+'^{commit}');}
}
function isAncestor(source,target){
  mustSha(source);mustSha(target);
  try{execFileSync('git',['merge-base','--is-ancestor',source,target]);return true;}catch{return false;}
}
function knownJob(jobs,name){
  const a=jobs.filter(j=>j.name===name&&j.status==='completed'&&j.conclusion==='success');
  assert.equal(a.length,1,'Successful official job missing or ambiguous: '+name);
  return a[0];
}

export async function verifiedBackendRegression({token,repo,pr,branch,prHead,baseSha,currentRunId,
  currentCheckout='HEAD',currentTree=treeFor(git('rev-parse',currentCheckout)),fetchApi=github,fetchPages=pages,download=officialZip}){
  assert(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo));
  mustSha(prHead);mustSha(baseSha);
  assert(Number.isSafeInteger(pr)&&pr>0&&Number.isSafeInteger(currentRunId));
  const currentFingerprint=closureDigest('backend-regression',currentTree);
  const runs=(await fetchPages('/actions/runs?branch='+encodeURIComponent(branch)+'&event=pull_request',
    token,repo,'workflow_runs')).filter(run=>run.id!==currentRunId&&run.id<currentRunId);
  for(const run of runs.slice(0,30)){
    try{
      if(run.path!=='.github/workflows/ci.yml'||run.event!=='pull_request'||
        run.repository?.full_name!==repo||run.head_branch!==branch||
        run.status!=='completed'||!['success','failure'].includes(run.conclusion)||
        !run.pull_requests?.some(p=>p.number===pr)||!isAncestor(run.head_sha,prHead))continue;
      const jobs=await fetchPages('/actions/runs/'+run.id+'/jobs?filter=latest',token,repo,'jobs');
      const summary=knownJob(jobs,'backend regression complete reports');
      for(const group of regressionGroups)
        knownJob(jobs,'backend regression ('+group+', isolated job database)');
      const artifacts=await fetchPages('/actions/runs/'+run.id+'/artifacts',token,repo,'artifacts');
      const expectedName='backend-vitest-report-run-'+run.id+'-attempt-'+run.run_attempt;
      const matches=artifacts.filter(a=>a.name===expectedName&&!a.expired);
      assert.equal(matches.length,1,'Exact complete artifact missing');
      const artifact=matches[0];
      assert.equal(artifact.workflow_run?.id,run.id);
      const zip=await download(artifact.id,artifact.digest,token,repo);
      const testedSha=inventoriesFromZip(zip,run.id,run.run_attempt);
      fetchHistoricalCommit(testedSha);
      const sourceTree=treeFor(testedSha);
      if(closureDigest('backend-regression',sourceTree)!==currentFingerprint)continue;
      const current={
        repository:repo,pr,baseSha,headSha:prHead,workflowPath:'.github/workflows/ci.yml',
        workflowDigest:git('rev-parse',currentCheckout+':.github/workflows/ci.yml'),
        prHeadHistory:[run.head_sha]
      };
      const proof={
        schema:1,outcome:'success',check:'backend-regression',repository:repo,pr,
        sourceSha:run.head_sha,baseSha,workflowPath:current.workflowPath,
        workflowDigest:current.workflowDigest,inputDigest:closureDigest('backend-regression',sourceTree),
        runId:run.id,jobId:summary.id,jobName:summary.name,artifactId:artifact.id,testedSha,
        archiveDigest:artifact.digest.slice(7)
      };
      const result=verifyHistoricalSuccess({proof,run,job:summary,artifact,archiveBytes:zip,current,
        sourceTree,currentTree});
      return {...result,artifactId:artifact.id,testedSha};
    }catch(e){console.warn('Reject historical CI '+run.id+': '+String(e?.message??e).slice(0,350));}
  }
  return null;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const out=process.env.GITHUB_OUTPUT;
  let result=null;
  try{
    const pr=Number(process.env.CI_PR_NUMBER),currentRunId=Number(process.env.GITHUB_RUN_ID);
    result=await verifiedBackendRegression({
      token:process.env.GH_TOKEN,repo:process.env.GITHUB_REPOSITORY,
      pr,branch:process.env.CI_HEAD_REF,prHead:process.env.CI_PR_HEAD,
      baseSha:process.env.CI_BASE_SHA,currentRunId
    });
  }catch(e){console.warn('No safe cross-run reuse: '+String(e?.message??e));}
  const success=result?.outcome==='REUSED_VERIFIED';
  const outputs='reuse_backend_regression='+String(success)+'\n'
    +'source_run='+(success?result.runId:'')+'\n'
    +'evidence_digest='+(success?result.inputDigest:'')+'\n';
  console.log(JSON.stringify({reuse:'backend-regression',outcome:success?'REUSED_VERIFIED':'RETEST_REQUIRED',
    head:process.env.CI_PR_HEAD,sourceRun:result?.runId??null}));
  if(out)await import('node:fs').then(fs=>fs.appendFileSync(out,outputs));
}
