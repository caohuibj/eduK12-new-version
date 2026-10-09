import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const REPO='caohuibj/eduK12-new-version';
const keyFile=()=>process.env.HUI_VALIDATION_KEY || path.join(os.homedir(),'.codex/huisurvey-local-validation/key.pem');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
export const canonical=x=>JSON.stringify(x);
const script='.github/scripts/local-validation.mjs';
const recipes={
 documentation:[['node','.github/scripts/documentation-check.mjs']],
 'release-tools':[['node','--test','server-version/scripts/release/policy.test.mjs','.github/scripts/content-scope.test.mjs','.github/scripts/local-validation.test.mjs']],
};
export function recipe(check,base,head) {
 if(!recipes[check])throw Error('Unsupported receipt check: '+check);
 const commands=structuredClone(recipes[check]);
 if(check==='release-tools') {
  const files=git('diff','--name-only','--no-renames',base,head).split('\n');
  for(const name of ['executor','qualify']) if(files.some(f=>f.endsWith('/'+name+'.py')||f.endsWith('/test_'+name+'.py')||(name==='executor'&&f.endsWith('/evidence.py'))))
   commands.push(['python3','-B','-m','unittest','discover','-s','server-version/scripts/release','-p','test_'+name+'.py']);
 }
 return commands;
}
export function binding(check,base,head) {
 const paths=check==='documentation'?[script,'.github/scripts/documentation-check.mjs','.github/scripts/content-scope.mjs','server-version/scripts/release/policy.mjs',...git('diff','--name-only','--no-renames',base,head).split('\n')]:
  check==='release-tools'?['.github/scripts','.github/workflows','.github/config','.github/release-tools','server-version/scripts/release']:
  ['server-version/frontend','server-version/backend','server-version/scripts/release','.github/scripts','.github/workflows','.github/release-tools'];
 const tree=git('ls-tree','-r',head,'--',...paths.filter(Boolean));
 const diff=check==='documentation'?git('diff','--no-ext-diff','--no-textconv','--no-renames','--raw','--abbrev=40',base,head):'';
 return hash(canonical({check,tree,diff,commands:recipe(check,base,head)}));
}
export function seal(payload,key) {return {payload,signature:crypto.sign(null,Buffer.from(canonical(payload)),key).toString('base64')};}
export function authenticate(envelope,publicKey) {
 if(!publicKey)throw Error('Local evidence public key is not configured');
 if(!envelope?.payload||!envelope.signature||!crypto.verify(null,Buffer.from(canonical(envelope.payload)),publicKey,Buffer.from(envelope.signature,'base64')))throw Error('Untrusted/tampered local evidence');
 const p=envelope.payload;
 if(p.schema!==1||p.repository!==REPO||!Array.isArray(p.checks)||new Set(p.checks.map(c=>c.check)).size!==p.checks.length)throw Error('Invalid local evidence structure');
 for(const c of p.checks)if(!recipes[c.check]||c.status!=='success'||!c.logSha256||!c.binding||!Array.isArray(c.commands)||c.commands.some(r=>r.exitCode!==0))throw Error('Failed/incomplete local evidence');
 return p;
}
export function admit(envelope,publicKey,base,head) {
 const p=authenticate(envelope,publicKey);
 if(!/^[a-f0-9]{40}$/.test(p.head)||!/^[a-f0-9]{40}$/.test(p.base))throw Error('Evidence requires full source SHAs');
 // An existing claim is never silently converted to a rerun on stale inputs.
 for(const c of p.checks)if(c.binding!==binding(c.check,base,head)||JSON.stringify(c.commands.map(r=>r.argv))!==JSON.stringify(recipe(c.check,base,head)))throw Error('Local evidence inputs changed: '+c.check+'; resolve only the changed inputs');
 return p;
}
export function fromEnvironment(base,head) {
 const raw=process.env.HUI_LOCAL_VALIDATION_EVIDENCE;
 if(!raw)return {checks:[]};
 const p=authenticate(JSON.parse(raw),process.env.HUI_LOCAL_VALIDATION_PUBLIC_KEY);
 // A different active PR has no local claim; do not apply its evidence here.
 if(p.head!==head && spawnSync('git',['merge-base','--is-ancestor',p.head,head]).status!==0 && git('rev-parse',p.head+'^{tree}')!==git('rev-parse',head+'^{tree}')) return {checks:[]};
 return admit(JSON.parse(raw),process.env.HUI_LOCAL_VALIDATION_PUBLIC_KEY,base,head);
}
function runCommands(check,base,head) {
 const commands=recipe(check,base,head),records=[];const h=crypto.createHash('sha256');
 for(const argv of commands) {
  const start=Date.now();const r=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,CI_BASE_SHA:base,CI:'true',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:process.env.GITHUB_RUN_ID||'local-'+crypto.randomUUID(),VITE_COGNITIVE_MODULE_ENABLED:'true'}});
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');h.update(r.stdout||'');h.update(r.stderr||'');
  if(r.error||r.status!==0)throw Error('Local check failed: '+check+'; no success evidence was issued');
  records.push({argv,exitCode:r.status,seconds:(Date.now()-start)/1000});
 }
 return {check,status:'success',binding:binding(check,base,head),commands:records,logSha256:h.digest('hex'),node:process.version};
}
// Proposed local-only prototype. No workflow calls this file; admission requires explicit approval.
async function main() {
 const [mode,...args]=process.argv.slice(2);
 if(mode==='init') {
  const file=keyFile();fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(!fs.existsSync(file))fs.writeFileSync(file,crypto.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});
  const pub=crypto.createPublicKey(fs.readFileSync(file)).export({type:'spki',format:'pem'});
  execFileSync('gh',['variable','set','HUI_LOCAL_VALIDATION_PUBLIC_KEY','--repo',REPO],{input:pub});
  console.log('Local signing identity configured; no checks were run.');return;
 }
 const base=process.env.CI_BASE_SHA||git('merge-base','origin/main','HEAD'),head=git('rev-parse','HEAD');
 if(mode==='verify') {const p=fromEnvironment(base,head);console.log(JSON.stringify({accepted:p.checks.map(c=>c.check)}));return;}
 if(mode==='ci') {
  const check=args[0],p=fromEnvironment(base,head);
  if(p.checks.some(c=>c.check===check)){console.log('REUSED local check: '+check+' (tests not executed)');return;}
  runCommands(check,base,head);return;
 }
 if(mode==='run') {
  const check=args[0],output=args[1];if(!output)throw Error('Specify an evidence output outside the tracked tree');
  if(git('status','--porcelain','--untracked-files=normal'))throw Error('Commit changed inputs before running the formal check');
  const before=binding(check,base,head);const record=runCommands(check,base,head);
  if(before!==record.binding||git('status','--porcelain','--untracked-files=normal'))throw Error('Inputs changed during validation');
  const payload={schema:1,repository:REPO,head,base,completedAt:new Date().toISOString(),checks:[record]};
  fs.writeFileSync(output,JSON.stringify(seal(payload,fs.readFileSync(keyFile()))),{flag:'wx',mode:0o600});console.log('Recorded '+check+' at '+head);return;
 }
 if(mode==='publish') {
  const envelope=JSON.parse(fs.readFileSync(args[0]));const pub=crypto.createPublicKey(fs.readFileSync(keyFile())).export({type:'spki',format:'pem'});
  const p=admit(envelope,pub,base,head);
  execFileSync('gh',['variable','set','HUI_LOCAL_VALIDATION_EVIDENCE','--repo',REPO],{input:JSON.stringify(envelope)});
  console.log('Published signed local evidence; no CI was triggered.');return;
 }
 throw Error('Use init, run CHECK OUTPUT, publish OUTPUT, verify, ci CHECK');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exit(1)});
