import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const REPOSITORY = 'caohuibj/eduK12-new-version';
export const BRANCHES = Object.freeze({
  'work/measurement-version-final-20261020': 'measurement',
  'work/training-mac-ui-final-20261020': 'training-mac',
});
export const REQUIRED = Object.freeze(['historical-local','compiled-browser','runtime-packaging',
  'runtime-scans','dependency-audit','changed-lint','frontend-app-types','schema-upgrade-restore','sast']);
export const MAC_REQUIRED = Object.freeze(['historical-local','backend-compile','frontend-compile',
  'frontend-app-types','changed-lint','compiled-browser','scoped-pg-http','runtime-packaging',
  'runtime-scans','dependency-audit','schema-upgrade-restore','sast']);
export const requiredFor = candidate => candidate === 'training-mac' ? MAC_REQUIRED : REQUIRED;
// Exact paths, not a directory exemption. All remain subject to independent
// review of the final candidate; the product fingerprint excludes only these.
export const TOOLS = Object.freeze([
  '.github/scripts/exact-candidate-scope.mjs',
  '.github/scripts/training-mac-admission.mjs',
  '.github/scripts/training-mac-admission.test.mjs',
  '.github/scripts/training-mac-attestation.json',
  '.github/scripts/training-mac-inputs.json',
  '.github/scripts/training-mac-runtime.py',
  '.github/scripts/training-mac-runtime.test.py',
  '.github/scripts/training-mac-browser.mjs',
  '.github/scripts/training-mac-browser.test.mjs',
  '.github/workflows/ci-training-mac-qualification.yml',
  '.github/scripts/exact-candidate-admission.mjs',
  '.github/scripts/exact-candidate.test.mjs',
  '.github/scripts/exact-candidate-bindings.json',
  '.github/scripts/exact-candidate-attestation.json',
  '.github/scripts/exact-candidate-runtime.py',
  '.github/scripts/exact-candidate-runtime.test.py',
  '.github/scripts/exact-candidate-runtime-inputs.json',
  '.github/scripts/exact-candidate-runtime-reuse.py',
  '.github/scripts/exact-candidate-runtime-reuse.test.py',
  '.github/scripts/exact-candidate-schema-diagnostic.py',
  '.github/scripts/exact-candidate-schema-diagnostic.test.py',
  '.github/workflows/ci-exact-candidate.yml',
  '.github/workflows/situational-publication.yml',
  '.github/scripts/content-scope.mjs',
  '.github/scripts/merge-gate.mjs',
  '.github/workflows/ci.yml',
  'docs/release/README.md',
]);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const git = (...args) => execFileSync('git', args, {encoding:'utf8',maxBuffer:32*1024*1024}).trim();
export const fullSha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
export function inventory(ref) {
  const raw = execFileSync('git',['ls-tree','-rz',ref],{encoding:'utf8',maxBuffer:32*1024*1024});
  return raw.split('\0').filter(Boolean).map(line => {
    const m=/^([0-7]{6}) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    if(!m) throw Error('Non-blob or malformed candidate tree');
    return {mode:m[1],blob:m[2],path:m[3]};
  });
}
export function productFingerprint(rows) {
  return sha256(JSON.stringify(rows.filter(r=>!TOOLS.includes(r.path))));
}
export function changedFingerprint(base,head) {
  const raw=execFileSync('git',['diff','--no-ext-diff','--no-textconv','--no-renames',
    '--raw','-z','--abbrev=40',base,head],{encoding:'utf8',maxBuffer:32*1024*1024});
  const parts=raw.split('\0').filter(Boolean), result=[];
  for(let i=0;i<parts.length;i+=2) {
    if(!/^:[0-7]{6} [0-7]{6} [a-f0-9]{40} [a-f0-9]{40} [AMDT]$/.test(parts[i]) || !parts[i+1])
      throw Error('Malformed complete candidate diff');
    if(!TOOLS.includes(parts[i+1])) result.push([parts[i],parts[i+1]]);
  }
  return sha256(JSON.stringify(result));
}
export function validateFrozen({candidate,base,head,sourceHead,tree,sourceTree,rows,diffHash}, bindings) {
  const frozen=bindings?.candidates?.[candidate];
  if(!frozen || frozen.enabled!==true) throw Error('Candidate not frozen: '+candidate);
  if(!fullSha(base)||!fullSha(head)||!fullSha(sourceHead)||!fullSha(tree)||tree!==sourceTree)
    throw Error('Exact source and checkout merge tree required');
  if(base!==frozen.base) throw Error('Candidate base changed; re-freeze affected inputs');
  if(rows.some(r=>r.mode!=='100644' && TOOLS.includes(r.path))) throw Error('Qualification tool mode changed');
  if(productFingerprint(rows)!==frozen.productInventorySha256 || diffHash!==frozen.diffSha256)
    throw Error('Candidate product paths/blobs/modes changed');
  return frozen;
}
export function exactCandidatePlan(base,head,env=process.env) {
  const branch=env.CI_HEAD_REF || (env.GITHUB_REF||'').replace(/^refs\/heads\//,'');
  const bindings=JSON.parse(readFileSync(new URL('./exact-candidate-bindings.json',import.meta.url),'utf8'));
  const postMerge=env.CI_EVENT==='push'&&branch==='main';
  const mergedCandidate=postMerge?Object.entries(bindings.candidates).find(([,c])=>c.enabled===true&&c.base===base)?.[0]:null;
  const candidate=BRANCHES[branch]||mergedCandidate;
  if(!candidate) return null;
  // Known branches never fall back to an unrelated full/platform route.
  if((env.CI_EVENT!=='pull_request'&&!postMerge)||env.CI_FORCE_FULL==='true'||env.CI_FULL_ACCEPTANCE==='true')
    throw Error('Exact candidate allows only its bounded PR qualification, not full/manual/push');
  if((!postMerge&&env.CI_PR_REPOSITORY!==REPOSITORY)||env.GITHUB_REPOSITORY!==REPOSITORY)
    throw Error('Exact candidate must be a same-repository PR');
  if(bindings.candidates[candidate]?.enabled!==true) throw Error('Candidate not frozen: '+candidate);
  const sourceHead=postMerge?head:env.CI_SOURCE_HEAD;
  if(!fullSha(sourceHead)) throw Error('Missing exact PR source HEAD');
  const tree=git('rev-parse',head+'^{tree}');
  const frozen=validateFrozen({candidate,base,head,sourceHead,tree,
    sourceTree:git('rev-parse',sourceHead+'^{tree}'),rows:inventory(head),
    diffHash:changedFingerprint(base,head)},bindings);
  const runtimePath=new URL(candidate==='training-mac'?'./training-mac-inputs.json':'./exact-candidate-runtime-inputs.json',import.meta.url);
  let runtimeInputs=null;
  try { runtimeInputs=JSON.parse(readFileSync(runtimePath,'utf8')); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  return {schema:1,route:'exact-candidate',candidate,base,head,sourceHead,tree,postMerge,
    productInventorySha256:frozen.productInventorySha256,diffSha256:frozen.diffSha256,
    required:[...requiredFor(candidate)],components:runtimeInputs?.components??null,runtime:runtimeInputs?.runtime??null,
    ...(candidate==='training-mac'?{macRuntime:runtimeInputs?.macRuntime??null}: {})};
}
export function exactCandidateOutputs(plan) {
  const output={application_route:'exact-candidate',scenario:'exact-candidate',
    exact_candidate_plan:JSON.stringify(plan),runner_profile:'hosted',codeql:!plan.postMerge,
    media_selection:'[]',media_groups:'[]'};
  for(const k of ['maintenance','documentation','content','presentation','frontend','frontend_test',
    'frontend_build','ui_required','visual_hosted','scale','cognitive','situational','bundle',
    'media2','media7','situational_video','situational_branching','video_core','app_shell',
    'canonical_visual','perf_smoke','ops']) output[k]=false;
  return output;
}
export function validExactPlan(p) {
  return p?.schema===1&&p.route==='exact-candidate'&&['measurement','training-mac'].includes(p.candidate)
    &&typeof p.postMerge==='boolean'
    &&[p.base,p.head,p.sourceHead,p.tree].every(fullSha)
    &&/^[a-f0-9]{64}$/.test(p.productInventorySha256||'')
    &&/^[a-f0-9]{64}$/.test(p.diffSha256||'')
    &&JSON.stringify(p.required)===JSON.stringify(requiredFor(p.candidate));
}

// The standalone catalog workflow must classify the same frozen candidate, not
// start an unrelated all-instrument installation on either PR/review event.
export function verifyUnchangedCatalogInputs(inputs,baseRows,headRows) {
  if(!Array.isArray(inputs)||!inputs.length||new Set(inputs.map(r=>r.path)).size!==inputs.length)
    throw Error('Missing reviewed Situational checker input boundary');
  const catalog=rows=>rows.filter(r=>r.path.startsWith('server-version/backend/src/modules/situational/instruments/'));
  if(JSON.stringify(catalog(baseRows))!==JSON.stringify(catalog(headRows))
    ||catalog(headRows).some(r=>r.mode!=='100644')) throw Error('Situational instrument catalog tree changed');
  const before=new Map(baseRows.map(r=>[r.path,r])),after=new Map(headRows.map(r=>[r.path,r]));
  for(const r of inputs) if(r.mode!=='100644'||!fullSha(r.blob)
    ||before.get(r.path)?.blob!==r.blob||before.get(r.path)?.mode!==r.mode
    ||after.get(r.path)?.blob!==r.blob||after.get(r.path)?.mode!==r.mode)
    throw Error('Situational catalog/checker consumed input changed');
}
export function situationalPublicationBoundary(base,head,env=process.env) {
  if(!BRANCHES[env.CI_HEAD_REF]) return null;
  if(!['pull_request','pull_request_review'].includes(env.CI_EVENT))
    throw Error('Catalog boundary is limited to actual PR/review events');
  // Review events inspect the same PR source; this does not grant merge status.
  const plan=exactCandidatePlan(base,head,{...env,CI_EVENT:'pull_request'});
  const bindings=JSON.parse(readFileSync(new URL('./exact-candidate-bindings.json',import.meta.url),'utf8'));
  const proof=bindings.candidates[plan.candidate].situationalCatalogBoundary;
  if(proof?.disposition!=='not-executed-unaffected-catalog'||proof.reviewed!==true)
    throw Error('Missing exact reviewed catalog relevance decision');
  verifyUnchangedCatalogInputs(proof.inputs,inventory(base),inventory(head));
  return {schema:1,candidate:plan.candidate,head:plan.head,base:plan.base,
    disposition:proof.disposition,checkerExecuted:false,
    affectedConsumerQualification:'required main exact-candidate and SAST gates; not granted here'};
}
