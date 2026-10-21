import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,lstatSync,appendFileSync} from 'node:fs';
export const bindingPath='.github/scripts/scale-library-governance-bindings.json';
export const binding=JSON.parse(readFileSync(new URL('./scale-library-governance-bindings.json',import.meta.url)));
const tools=new Set([bindingPath,'.github/scripts/scale-library-governance-resume.py','.github/scripts/scale-library-governance-scope.mjs','.github/scripts/scale-library-governance-scope.test.mjs','.github/scripts/scale-library-governance-build.sh','.github/scripts/scale-library-governance-checks.mjs','.github/scripts/scale-library-governance-backend.sh','.github/scripts/scale-library-governance-recovery.py','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','.github/workflows/ci-scale-library-governance.yml','docs/release/README.md']);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
export function scaleLibraryGovernancePlan(entries,base,head,read=git){
 const marker=entries.find(e=>e.file===bindingPath);
 if(!marker)return null;
 if(binding.frozen!==true)throw Error('Governance product and validation inputs are not frozen');
 if(marker.status!=='A'||base!==binding.base||!/^[a-f0-9]{40}$/.test(head))throw Error('Scale library governance candidate requires its exact current-main base and new binding');
 if(!['pull_request','push'].includes(process.env.CI_EVENT||'pull_request')||process.env.CI_FORCE_FULL==='true')throw Error('Scale library governance candidate does not admit dispatch or full-platform fallback');
 if(process.env.CI_EVENT==='pull_request'&&process.env.CI_SOURCE_HEAD&&read('rev-parse',head+'^{tree}')!==read('rev-parse',process.env.CI_SOURCE_HEAD+'^{tree}'))throw Error('Governance PR merge tree differs from source');
 if(new Set(entries.map(e=>e.file)).size!==entries.length)throw Error('Duplicate Scale library governance candidate diff path');
 for(const e of entries){
  if(!tools.has(e.file)&&!Object.hasOwn(binding.source,e.file))throw Error('Unknown Scale library governance candidate path: '+e.file);
  if(e.newMode!=='100644'||!((e.status==='A'&&e.oldMode==='000000')||(e.status==='M'&&e.oldMode==='100644')))throw Error('Scale library governance candidate deletion, rename or mode change');
 }
 for(const[file,b]of Object.entries(binding.source)){
  const e=entries.find(e=>e.file===file);
  if(!e||read('rev-parse',head+':'+file)!==b.after||(b.before?e.status!=='M'||read('rev-parse',base+':'+file)!==b.before:e.status!=='A'))throw Error('Scale library governance candidate source changed: '+file);
 }
 return {schema:1,route:'scale-library-governance',base,head,sourceCount:Object.keys(binding.source).length,changes:entries};
}
export function scaleLibraryGovernanceOutputs(plan){
 const acceptance=JSON.parse(readFileSync(new URL('../config/acceptance-scopes.json',import.meta.url)));
 return {...Object.fromEntries(['maintenance','documentation','content','presentation','frontend','frontend_test','frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle','training_functional_only','admin_permissions_functional_only','run_performance_tests',...Object.keys(acceptance)].map(k=>[k,false])),
  application_route:'scale-library-governance',scenario:'scale-library-governance',codeql:true,runner_profile:'hosted',media_selection:'[]',media_groups:'[]',scale_library_governance_plan:JSON.stringify(plan)};
}

export function governanceCodeqlConfig(){
 if(binding.frozen!==true)throw Error('Unfrozen analysis inventory');
 const original='e74783c4a8baffa7b999b49182bd697018825bc7';
 const selected=git('diff','--name-only',original,'HEAD').split('\n').filter(f=>/\.(?:[cm]?[jt]sx?|py)$/.test(f));
 if(!selected.length||selected.some(f=>!tools.has(f)&&!Object.hasOwn(binding.source,f)))throw Error('Unknown or empty changed SAST input');
 const directories=[...new Set(selected.map(f=>f.slice(0,f.lastIndexOf('/'))))];
 const roots=directories.filter(d=>!directories.some(other=>d!==other&&d.startsWith(other+'/')));
 const ignored=[];
 const visit=directory=>{
  for(const name of readdirSync(directory)){
   const file=directory+'/'+name,stat=lstatSync(file);
   if(selected.includes(file)){if(!stat.isFile())throw Error('Nonregular analysis input');continue;}
   if(stat.isDirectory()&&selected.some(s=>s.startsWith(file+'/')))visit(file);else ignored.push(file);
  }
 };
 for(const file of selected)if(!lstatSync(file).isFile())throw Error('Missing selected analysis input: '+file);
 for(const root of roots)visit(root);
 if(!selected.some(f=>f.endsWith('.py')))throw Error('Recovery Python must be analyzed');
 return {paths:roots,'paths-ignore':ignored.sort()};
}
export const requiredGovernanceChecks=['real-virtual-ctap2-administrator-session','real-upload-worker-completed','training-approved-and-granted-survey','training-to-survey-readonly-exact-release-frozen','v2-and-ordinary-revoke-preserve-exact-frozen-v1','training-to-survey-final-original-scorer-media','survey-approved-and-granted-training','survey-to-training-recipient-course-published','survey-to-training-composite-final-all-at-once','emergency-denies-new-collection-preserves-final-replay','unified-catalog-exact-identity-pagination'];
export function verifyGovernanceBrowserReport(report,{head,runId,directory,read=readFileSync}){
 const require=(ok,message)=>{if(!ok)throw Error('Governance browser evidence: '+message);};
 const same=(actual,expected,message)=>require(JSON.stringify(actual)===JSON.stringify(expected),message);
 require(report.schemaVersion===1&&report.status==='PASS'&&report.phase==='complete','completed real browser result required');
 require(/^[a-f0-9]{40}$/.test(head)&&report.sourceCommit===head&&report.ciRunId===runId,'candidate/run identity');
 same(report.checks,requiredGovernanceChecks,'all ordered checkpoints');
 same(report.browserErrors,[],'browser errors');require(report.blockedExternalRequests===0,'external requests');
 require(report.physicalSecurityKeyVerified===false,'virtual authenticator must not claim physical-key acceptance');
 const names=['training-all-at-once','survey-shared-scale-report','library-governance'];
 for(const key of ['screenshots','layoutChecks']){
  require(Array.isArray(report[key])&&report[key].length===6,key+' matrix');
  for(const name of names)for(const width of [1440,390]){
   const rows=report[key].filter(row=>row.name===name&&row.width===width);require(rows.length===1,key+' unique viewport');const row=rows[0];
   if(key==='layoutChecks')require(row.overflow===false,'viewport overflow');
   else{require(row.file===`${name}-${width}.png`,'screenshot safe exact name');const bytes=read(directory+'/'+row.file);require(bytes.length>100&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(16)===width&&bytes.readUInt32BE(20)>0,'actual PNG dimensions');}
  }
 }
 require(Array.isArray(report.accessibility)&&report.accessibility.length===3,'accessibility matrix');
 for(const name of names){const rows=report.accessibility.filter(row=>row.name===name);require(rows.length===1&&rows[0].passes>0,'nonempty accessibility execution');same(rows[0].violations,[],'zero accessibility violations');}
 same(report.catalog,{standardVisible:true,authoredVisible:true,paginationUnique:true,approvedIdentitiesMatched:2},'unified catalog');
 same(report.lifecycle,{newRevisionDistinct:true,ordinaryRevocationFrozenFinalPassed:true,emergencyNewAdmissionStatus:409,previousFinalReplayStatus:200,sameReceipt:true},'frozen lifecycle and replay');
 same(report.journeys,[{name:'training-to-survey',finalAnswerCount:3,typedAnswersPreserved:true,contentScore:1,qualityItemsExcluded:2,exactApprovedRelease:true,reportImageExact:true},{name:'survey-to-training',allAtOnce:true,finalAnswerCount:3,contentScore:1,qualityItemsExcluded:2,exactApprovedRelease:true,reportImageExact:true}],'two real product journeys');
 require(Array.isArray(report.media),'actual media evidence');
 const media=name=>report.media.filter(row=>row.name===name);
 const one=name=>{const rows=media(name);require(rows.length===1,'one '+name);return rows[0];};
 const worker=one('real-video-worker');require(worker.status==='COMPLETED'&&/^[a-f0-9]{64}$/.test(worker.originalUploadSha256)&&/^[a-f0-9]{64}$/.test(worker.processedSha256)&&worker.processedBytes>0,'real uploaded video processing');
 for(const name of ['review-image','survey-question-image','survey-frozen-report-image','training-parent-report-image']){
  const rows=media(name);require(rows.length===(name==='review-image'?2:1),'exact image deliveries '+name);
  for(const image of rows){require(image.sourceKind==='blob'&&image.complete===true&&image.naturalWidth===16&&image.naturalHeight===16&&image.byteLength===103&&image.contentType==='image/png'&&image.sha256==='f152348704ab15cbdb0c57d769e0541c42100dccf86572485b8b912b248d33b3','actual known uploaded image bytes');same(image.signature,[137,80,78,71,13,10,26,10],'actual PNG signature');}
 }
 for(const[name,seconds]of [['review-video',60],['survey-runtime-video',600]]){const v=one(name);require(v.capabilityMaxSeconds===seconds&&v.status===206&&/^video\//.test(v.contentType)&&/^bytes 0-1023\/\d+$/.test(v.contentRange)&&v.byteLength===1024&&v.currentTime>0&&v.videoWidth>0&&v.videoHeight>0,'real bounded capability / Range / playback '+name);if(name==='survey-runtime-video')require(v.ended===true,'actual complete stimulus viewing');}
 require(report.media.length===8,'no missing or unknown media observations');
 return {status:'PASS',sourceCommit:head,ciRunId:runId,checkpoints:11,screenshots:6,actualJourneys:2,physicalSecurityKeyVerified:false};
}

// Never return success for an unfinished or unknown executable entry point.
if(process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='codeql-config'){
  const config=governanceCodeqlConfig();
  if(!process.env.GITHUB_OUTPUT)throw Error('Actions output required');
  appendFileSync(process.env.GITHUB_OUTPUT,'config='+JSON.stringify(config)+'\n');console.log(JSON.stringify(config));
 }else if(process.argv[2]==='browser-report'){
  if(binding.frozen!==true)throw Error('Unfrozen browser contract');
  const directory=process.env.SCALE_GOVERNANCE_EVIDENCE_DIR;if(!directory)throw Error('Explicit browser evidence directory required');
  const report=JSON.parse(readFileSync(directory+'/result.json','utf8'));
  console.log(JSON.stringify(verifyGovernanceBrowserReport(report,{head:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,directory})));
 }else throw Error('Unknown governance entry point');
}
