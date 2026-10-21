import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {integratedBinding as binding,trainingWorkspacePlan,verifyIntegratedWorkspaceBrowser} from './training-workspace-scope.mjs';
import {changedEntries} from './content-scope.mjs';
const root=process.env.GITHUB_WORKSPACE||process.cwd(),evidence=resolve(root,'training-workspace-integrated-evidence');
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',...options});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const mode=process.argv[2];
if(mode==='codeql-config'){
 const paths=[...Object.keys(binding.source),...binding.controls].filter(p=>/\.(?:[cm]?[jt]sx?)$/.test(p));assert(paths.length);
 appendFileSync(process.env.GITHUB_OUTPUT,'config='+JSON.stringify({paths})+'\n');
}else if(mode==='scope'){
 const head=run('git',['rev-parse','HEAD']).trim();
 assert.deepEqual(JSON.parse(process.env.PLAN),trainingWorkspacePlan(changedEntries(binding.base,head),binding.base,head));
 // Unchanged scientific generators/registries: compiler invocation replaces only their redundant checks.
 for(const path of binding.unchangedGeneratorInputs)assert.equal(run('git',['rev-parse',binding.base+':'+path]).trim(),run('git',['rev-parse','HEAD:'+path]).trim(),path);
}else if(mode==='restore-images'){
 for(const component of ['backend','frontend']){
  const dir=resolve(evidence,component),archive=resolve(root,'training-workspace-integrated-images',component,'images.tar.gz');
  assert.equal(readFileSync(resolve(dir,'source-head.txt'),'utf8').trim(),process.env.GITHUB_SHA);
  assert.equal(readFileSync(resolve(dir,'source-run.txt'),'utf8').trim(),process.env.GITHUB_RUN_ID);
  assert.equal(hash(archive),readFileSync(resolve(dir,'images.sha256'),'utf8').trim().split(/\s+/)[0]);
  run('docker',['load','-i',archive],{stdio:'inherit'});
  const original=JSON.parse(readFileSync(resolve(dir,'images.json')));assert.equal(original.length,2);
  for(const kind of ['builder','runtime']){
   const tag=`training-workspace-integrated-${component}-${kind}:${process.env.GITHUB_SHA}`;
   const current=JSON.parse(run('docker',['image','inspect',tag]))[0];
   const prior=original.find(row=>row.RepoTags.includes(tag));assert(prior);assert.equal(current.Id,prior.Id);assert.equal(current.Config.Labels['org.opencontainers.image.revision'],process.env.GITHUB_SHA);
  }
 }
}else if(mode==='browser-report'){
 const directory=resolve(evidence,'browser');
 const accepted=verifyIntegratedWorkspaceBrowser(JSON.parse(readFileSync(resolve(directory,'result.json'))),{head:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,directory});
 writeFileSync(resolve(evidence,'browser-accepted.json'),JSON.stringify(accepted));
}else throw Error('Explicit known evidence mode required');
