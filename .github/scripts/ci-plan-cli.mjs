import {execFileSync}from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync}from 'node:fs';
import {join}from 'node:path';
import {changedEntries}from './content-scope.mjs';
import {dependencyScope}from './dependency-scope.mjs';
import {validationPlan,verifyDerivedPlan,planFailures,NODES}from './ci-validation-plan.mjs';
const command=process.argv[2];if(!['write','verify','gate'].includes(command))throw new Error('Usage: write|verify|gate');
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.CI!=='true'||sha!==process.env.GITHUB_SHA)throw new Error('Exact Actions checkout required');
if(event.pull_request&&event.pull_request.head.repo.full_name!==process.env.GITHUB_REPOSITORY)throw new Error('Untrusted PR cannot run on private CI hosts');
const forceFull=process.env.CI_FORCE_FULL==='true'||(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&event.inputs?.full_acceptance==='true');
if(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&!forceFull)throw new Error('Diagnostic probes do not constitute a validation plan or merge gate');
const base=event.pull_request?.base.sha||event.before||process.env.CI_BASE_SHA;
const entries=changedEntries(base,sha);
const dependencyOnly=!forceFull&&dependencyScope(entries,{base,head:sha});
let runtimeDependencies=false;
if(dependencyOnly){
 for(const root of ['server-version/backend','server-version/frontend']){
  if(!entries.some(e=>e.file.startsWith(root+'/package')))continue;
  const read=commit=>JSON.parse(execFileSync('git',['show',commit+':'+root+'/package.json'],{encoding:'utf8'}));
  const before=read(base),after=read(sha);
  // Canonical comparison ignores object order. Overrides may change transitive
  // runtime inputs, so they conservatively retain corresponding consumers.
  const canonical=o=>JSON.stringify(Object.entries(o??{}).sort(([a],[b])=>a.localeCompare(b)));
  if(['dependencies','optionalDependencies','overrides'].some(k=>canonical(before[k])!==canonical(after[k])))runtimeDependencies=true;
 }
}
const options={sha,base,runId:process.env.GITHUB_RUN_ID,draft:event.pull_request?.draft===true,forceFull,postMerge:process.env.GITHUB_EVENT_NAME==='push',dependencyOnly,runtimeDependencies};
const file=join(process.env.RUNNER_TEMP,'ci-validation-plan.json');
if(command==='write'){
 const plan=validationPlan(entries,options);writeFileSync(file,JSON.stringify(plan,null,2)+'\n');
 const outputs={required:JSON.stringify(plan.required),scenario:plan.scenario,media:JSON.stringify(plan.media),plan_digest:plan.digest,base};
 for(const node of Object.keys(NODES))outputs[node]=String(plan.required.includes(node));
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,Object.entries(outputs).map(([k,v])=>k+'='+v).join('\n')+'\n');
 const report=['## Exact-source validation plan',`Commit: ${sha}; base: ${base}; run: ${options.runId}`,`Scope: ${plan.scenario}`,`Required: ${plan.required.join(', ')}`,`Omitted: ${plan.omitted.join(', ')}`,'','| File | Change | Classification |','|---|---|---|',...plan.reasons.map(r=>`| ${r.file.replaceAll('|','\\|')} | ${r.status} ${r.oldMode} → ${r.newMode} | ${r.category} |`),'','Artifact producers and consumers:',...Object.entries(plan.jobs).filter(([,j])=>j.produces||j.consumes).map(([name,j])=>`- ${name}: ${j.produces?'produces '+j.produces:'consumes '+j.consumes.join(', ')}`)].join('\n')+'\n';
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,report);
 console.log(report);
}else{
 const plan=JSON.parse(readFileSync(file,'utf8'));verifyDerivedPlan(plan,entries,options);
 if(command==='gate'){
  if(plan.draft)throw new Error('Draft checks cannot approve merge');
  const needs=JSON.parse(process.env.CI_NEEDS_RESULTS);const results=Object.fromEntries(Object.entries(needs).map(([name,value])=>[name,value.result]));
  const missing=planFailures(plan,results,{sha,base,runId:options.runId});
  if(missing.length)throw new Error('Merge blocked: '+missing.map(n=>n+'='+String(results[n]??'missing')).join(', '));
  console.log('All selected stages succeeded for this exact source and invocation.');
 }
}
