import {trainingFollowupPlan} from './training-followup-scope.mjs';
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
export const bindingPath='.github/scripts/training-workspace-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./training-workspace-bindings.json',import.meta.url)));
const tools=new Set([bindingPath,'.github/scripts/training-workspace-scope.mjs','.github/scripts/training-workspace-scope.test.mjs','.github/scripts/training-workspace-checks.mjs','.github/scripts/training-workspace-reuse.mjs','.github/scripts/training-workspace-browser.mjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','.github/workflows/ci-training-workspace.yml']);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export const integratedBindingPath='.github/scripts/training-workspace-integrated-bindings.json';
export const integratedBinding=existsSync(new URL('./training-workspace-integrated-bindings.json',import.meta.url))?JSON.parse(readFileSync(new URL('./training-workspace-integrated-bindings.json',import.meta.url))):null;
export function integratedWorkspacePlan(entries,base,head,read=git){
 const marker=entries.find(e=>e.file===integratedBindingPath);
 if(!marker)return null;
 const b=integratedBinding;
 if(!b||marker.status!=='A'||base!==b.base||!/^[a-f0-9]{40}$/.test(head))throw Error('Integrated workspace requires frozen current-main base');
 if(!['pull_request','push'].includes(process.env.CI_EVENT||'pull_request')||process.env.CI_FORCE_FULL==='true')throw Error('No manual/full fallback');
 const expected=new Set([...Object.keys(b.source),...b.controls]);
 if(entries.length!==expected.size||new Set(entries.map(e=>e.file)).size!==entries.length)throw Error('Incomplete integrated workspace diff');
 for(const e of entries){
  if(!expected.has(e.file)||e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))throw Error('Unknown path or mode: '+e.file);
  const blob=b.source[e.file];
  if(blob&&(read('rev-parse',head+':'+e.file)!==blob.after||(blob.before?e.status!=='M'||read('rev-parse',base+':'+e.file)!==blob.before:e.status!=='A')))throw Error('Integrated workspace input drift: '+e.file);
 }
 return {schema:1,route:'training-workspace',candidate:'mac-integrated',base,head,sourceCount:Object.keys(b.source).length,changes:entries};
}
export function trainingWorkspacePlan(entries,base,head,read=git){
 const followup=trainingFollowupPlan(entries,base,head,read);if(followup)return followup;
 const integrated=integratedWorkspacePlan(entries,base,head,read);if(integrated)return integrated;
 const marker=entries.find(e=>e.file===bindingPath);
 if(!marker)return null;
 if(marker.status!=='A'||base!==binding.base||!/^[a-f0-9]{40}$/.test(head))throw Error('Training workspace requires its exact current-main base and new binding');
 if(!['pull_request','push'].includes(process.env.CI_EVENT||'pull_request')||process.env.CI_FORCE_FULL==='true')throw Error('Training workspace does not admit dispatch or full-platform fallback');
 if(new Set(entries.map(e=>e.file)).size!==entries.length)throw Error('Duplicate workspace diff path');
 for(const e of entries){
  if(!tools.has(e.file)&&!Object.hasOwn(binding.source,e.file))throw Error('Unknown workspace path: '+e.file);
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))throw Error('Workspace deletion, rename or mode change');
 }
 for(const[file,b]of Object.entries(binding.source)){
  const e=entries.find(e=>e.file===file);
  if(!e||read('rev-parse',head+':'+file)!==b.after||(b.before?e.status!=='M'||read('rev-parse',base+':'+file)!==b.before:e.status!=='A'))throw Error('Workspace source changed: '+file);
 }
 return {schema:1,route:'training-workspace',base,head,sourceCount:Object.keys(binding.source).length,changes:entries};
}
export function trainingWorkspaceOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),
  application_route:'training-workspace',scenario:'training-workspace',codeql:true,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',training_workspace_plan:JSON.stringify(plan)};
}

export function verifyIntegratedWorkspaceBrowser(report,{head,runId,directory,read=readFileSync}){
 const must=(ok,message)=>{if(!ok)throw Error('Workspace browser evidence: '+message)};
 const same=(a,b,message)=>must(JSON.stringify(a)===JSON.stringify(b),message);
 must(report.schemaVersion===1&&report.status==='PASS'&&report.phase==='complete','complete actual browser run');
 must(report.sourceCommit===head&&report.ciRunId===runId,'same candidate/run');
 same(report.checks,['real-virtual-ctap2-administrator-session','real-exact-publication-review-grant','toolkit-exact-readonly','authorized-form-private-copy','student-course-frozen-native-mode','forged-hint-and-nonmember-denied','revoke-denies-new-use','frozen-final-historical-report-back-reload'],'exact checkpoints');
 same(report.browserErrors,[],'browser errors');must(report.blockedExternalRequests===0&&report.physicalSecurityKeyVerified===false,'isolated virtual authenticator');
 const f=report.frozen;must(f?.publicationMode==='RUNNER_DEFAULT'&&f.runnerMode==='ONE_BY_ONE'&&f.allAtOnceRequalified===false,'honest native presentation scope');
 must(typeof f.releaseId==='string'&&f.releaseId.length>0&&/^[a-f0-9]{64}$/.test(f.contentHash)&&/^[a-f0-9]{64}$/.test(f.definitionHash),'exact frozen release');
 same(report.lifecycle,{newUseDenied:true,existingFrozenCompleted:true,historicalReportReloaded:true,newCopyResponseCount:0,newCopyTokenCount:0,sourcePrivateEndpointsDenied:true},'new use and frozen history');
 const names=['toolkit-granted-scale','toolkit-authorized-form','learner-course','learner-frozen-scale','learner-historical-report'];
 for(const key of ['screenshots','layoutChecks','accessibility','keyboard'])must(Array.isArray(report[key])&&report[key].length===10,'exact '+key+' matrix');
 for(const name of names)for(const width of [1440,390])for(const key of ['screenshots','layoutChecks','accessibility','keyboard']){
  const rows=report[key].filter(row=>row.name===name&&row.width===width);must(rows.length===1,'unique '+key);const row=rows[0];
  if(key==='layoutChecks')must(row.overflow===false,'no overflow');
  else if(key==='accessibility')must(row.passes>0&&Array.isArray(row.violations)&&row.violations.length===0,'nonempty zero-violation axe');
  else if(key==='keyboard')must(row.reached===true&&Number.isInteger(row.tabPresses)&&row.tabPresses>=0&&row.tabPresses<=100,'actual keyboard navigation');
  else{must(row.file===`${name}-${width}.png`,'exact screenshot name');const bytes=read(directory+'/'+row.file);must(bytes.length>100&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(16)===width&&bytes.readUInt32BE(20)>0,'actual screenshot');}
 }
 return {status:'PASS',sourceCommit:head,ciRunId:runId,checkpoints:8,screenshots:10,nativePresentation:'ONE_BY_ONE',allAtOnceRequalified:false,physicalSecurityKeyVerified:false};
}
