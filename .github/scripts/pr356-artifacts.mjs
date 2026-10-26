import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync,statSync,writeFileSync,linkSync,copyFileSync,realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

const REPOSITORY='caohuibj/eduK12-new-version',ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const MAX_ZIP=8*1024**3,PROOF='phase-receipt.json';
export const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
const sha=value=>createHash('sha256').update(value).digest('hex');
export const inputsSHA256=value=>sha(canonical(value));
const number=value=>{assert.match(String(value??''),/^[1-9][0-9]*$/,'Positive numeric identity required');const n=Number(value);assert(Number.isSafeInteger(n));return n;};
const digest=value=>{assert.match(value??'',/^(sha256:)?[a-f0-9]{64}$/,'Artifact digest is required');return value.startsWith('sha256:')?value:'sha256:'+value;};
export function safeRelative(value){assert.equal(typeof value,'string');assert(value.length>0&&!value.startsWith('/')&&!/[\\\x00-\x1f]/.test(value)&&value.split('/').every(x=>x&&x!=='.'&&x!=='..'),'Unsafe artifact path');return value;}
export async function hashFile(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
function checkedSpecification(role,spec){
 assert.match(role,/^[a-z][a-z0-9-]*$/);assert.equal(spec.id,role==='frontend-dist'?'frontend-image':role,'Wrong producer phase');assert.equal(typeof spec.jobName,'string');assert(spec.jobName);
 assert.equal(spec.inputs?.schemaVersion,1);assert(spec.inputs?.files?.length);
 for(const key of ['configuration','tools','dependencies'])assert(spec.inputs[key]&&typeof spec.inputs[key]==='object'&&!Array.isArray(spec.inputs[key])&&Object.keys(spec.inputs[key]).length,'Complete '+key+' inputs required');
 const inputPaths=spec.inputs.files.map(file=>{safeRelative(file.path);assert(['100644','100755'].includes(file.mode));assert.match(file.blob??'',/^[a-f0-9]{40}$/);return file.path;});assert.deepEqual(inputPaths,[...new Set(inputPaths)].sort(),'Unique sorted source inputs required');assert.equal(spec.inputsSHA256,inputsSHA256(spec.inputs));
 assert(Array.isArray(spec.caseIds)&&spec.caseIds.length&&new Set(spec.caseIds).size===spec.caseIds.length);
}
function pinnedIdentity(role,spec,pin){
 checkedSpecification(role,spec);assert.equal(pin.repository,REPOSITORY);assert.match(pin.head??'',/^[a-f0-9]{40}$/);
 const runId=String(number(pin.runId)),producerAttempt=number(pin.producerAttempt),name=`pr356-${role}-${runId}-${producerAttempt}`;
 assert.equal(pin.artifactName,name,'Missing or wrong original producer artifact name');
 return {role,phaseId:spec.id,repository:REPOSITORY,runId,head:pin.head,producerAttempt,artifactId:number(pin.artifactId),artifactName:name,artifactDigest:digest(pin.artifactDigest),spec};
}
export function expectedFromEnvironment(role,spec,env=process.env){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,REPOSITORY);
 assert.equal(env.PR356_PRODUCER_RUN,env.GITHUB_RUN_ID,'Cross-run artifact reuse is unsupported');assert.equal(env.PR356_PRODUCER_HEAD,env.GITHUB_SHA,'Cross-head reuse requires a separate reviewed adapter');
 assert(number(env.PR356_PRODUCER_ATTEMPT)<=number(env.GITHUB_RUN_ATTEMPT),'A future producer attempt is invalid');
 return pinnedIdentity(role,spec,{repository:env.GITHUB_REPOSITORY,runId:env.GITHUB_RUN_ID,head:env.GITHUB_SHA,producerAttempt:env.PR356_PRODUCER_ATTEMPT,
  artifactId:env.PR356_ARTIFACT_ID,artifactName:env.PR356_ARTIFACT_NAME,artifactDigest:env.PR356_ARTIFACT_DIGEST});
}
/** Evidence reads for an aggregate's explicitly pinned, separately verified Q /
 * stable chain. This is not exposed by the default CLI and grants no admission;
 * callers pass every original identity without modifying any GitHub environment. */
export function expectedFromOfficialOrigin(role,spec,origin){
 assert(origin&&origin.kind==='pr356-explicit-official-origin','Explicit official origin required');
 const expected=pinnedIdentity(role,spec,{repository:REPOSITORY,runId:origin.runId,head:origin.sourceHead,producerAttempt:origin.producerAttempt,
  artifactId:origin.artifactId,artifactName:origin.artifactName,artifactDigest:origin.artifactDigest});
 return {...expected,producerJobId:number(origin.jobId),originKind:'explicit-official-evidence-read',qualificationClaim:false};
}
function timestampInterval(value){
 assert.equal(typeof value,'string');const m=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d{1,3}))?Z$/.exec(value);assert(m,'Unsupported official timestamp precision');
 const lower=Date.parse(value),width=m[1]?10**(3-m[1].length):1000;assert(Number.isFinite(lower));return {lower,upper:lower+width-1};
}
export function validateArtifactMetadata(meta,expected){
 assert.equal(number(meta.id),expected.artifactId,'Wrong official artifact ID');assert.equal(meta.name,expected.artifactName,'Wrong official artifact name');assert.equal(meta.expired,false,'Artifact expired');assert(Number.isFinite(Date.parse(meta.expires_at))&&Date.parse(meta.expires_at)>Date.now(),'Artifact expiry missing or elapsed');
 assert.equal(String(meta.workflow_run?.id),expected.runId,'Wrong artifact run');assert.equal(meta.workflow_run?.head_sha,expected.head,'Wrong artifact source');
 assert.equal(meta.digest,expected.artifactDigest,'Official artifact digest mismatch');assert(Number.isSafeInteger(meta.size_in_bytes)&&meta.size_in_bytes>0&&meta.size_in_bytes<=MAX_ZIP,'Invalid artifact size');return meta;
}
export async function officialMetadata(expected,token,fetcher=fetch){
 assert(token,'Official artifact metadata token required');
 const api=async path=>{const r=await fetcher(`https://api.github.com/repos/${REPOSITORY}/${path}`,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error'});assert.equal(r.status,200,`Official artifact metadata unavailable (${r.status}); no fallback`);return r.json();};
 const meta=validateArtifactMetadata(await api(`actions/artifacts/${expected.artifactId}`),expected);
 const run=await api(`actions/runs/${expected.runId}/attempts/${expected.producerAttempt}`);
 assert.equal(String(run.id),expected.runId);assert.equal(run.head_sha,expected.head);assert.equal(number(run.run_attempt),expected.producerAttempt);assert.equal(run.path,'.github/workflows/ci.yml','Unexpected producer workflow');
 const matches=[];
 for(let page=1;page<=20;page++){
  const data=await api(`actions/runs/${expected.runId}/attempts/${expected.producerAttempt}/jobs?per_page=100&page=${page}`);
  assert(Array.isArray(data.jobs));matches.push(...data.jobs.filter(j=>j.name===expected.spec.jobName));
  if(data.jobs.length<100)break;
  assert(page<20,'Producer job metadata exceeded the bounded lookup');
 }
 assert.equal(matches.length,1,'Producer job missing or ambiguous');const job=matches[0];
 assert.equal(job.status,'completed','Producer job has not completed');assert.equal(job.conclusion,'success','Only a successful original producer can qualify');assert.equal(job.head_sha,expected.head);assert.equal(String(job.run_id),expected.runId);assert.equal(number(job.run_attempt),expected.producerAttempt);
 const created=timestampInterval(meta.created_at),started=timestampInterval(job.started_at),completed=timestampInterval(job.completed_at);assert(created.upper>=started.lower&&created.lower<=completed.upper,'Artifact was not created by the pinned producer job attempt');
 if(expected.producerJobId)assert.equal(number(job.id),expected.producerJobId,'Explicit original producer job ID changed');
 return {meta,producerJob:{id:number(job.id),name:job.name,attempt:expected.producerAttempt,conclusion:job.conclusion}};
}
export function verifyProof(proof,expected){
 assert.equal(proof.schemaVersion,1);assert.equal(proof.kind,'pr356-phase-proof');assert.equal(proof.status,'success');assert.equal(proof.phaseId,expected.phaseId);
 assert.equal(proof.source?.repository,expected.repository);assert.equal(String(proof.source?.runId),expected.runId);assert.equal(proof.source?.head,expected.head);assert.equal(number(proof.source?.producerAttempt),expected.producerAttempt,'Producer identity changed');
 assert.deepEqual(proof.inputs,expected.spec.inputs,'Complete phase inputs mismatch');assert.equal(proof.inputsSHA256,expected.spec.inputsSHA256);assert.equal(inputsSHA256(proof.inputs),proof.inputsSHA256);
 assert.deepEqual(proof.checks,expected.spec.caseIds.map(id=>({id,status:'passed'})),'Missing, extra, filtered or failed checks');
 assert.equal(proof.command?.exitCode,0);assert(Array.isArray(proof.command.argv)&&proof.command.argv.length);assert.equal(typeof proof.command.cwd,'string');assert.match(proof.command.logSHA256??'',/^[a-f0-9]{64}$/);assert(Number.isFinite(Date.parse(proof.command.startedAt))&&Number.isFinite(Date.parse(proof.command.completedAt))&&Date.parse(proof.command.startedAt)<=Date.parse(proof.command.completedAt));
 const files=proof.outputs?.artifactFiles?.[expected.role]??(expected.role===proof.phaseId?proof.outputs?.files:null);
 assert(files&&typeof files==='object'&&!Array.isArray(files)&&Object.keys(files).length,'Complete output manifest required');
 const manifests=proof.outputs.artifactFiles?Object.values(proof.outputs.artifactFiles):[files];assert(manifests.some(m=>Object.entries(m).some(([path,file])=>path.endsWith('.log')&&file.sha256===proof.command.logSHA256)),'Original command log is missing from the producer manifests');
 for(const [path,entry]of Object.entries(files)){safeRelative(path);assert.notEqual(path,PROOF,'Proof cannot hash itself');assert.match(entry.sha256??'',/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(entry.bytes)&&entry.bytes>=0);}
 return files;
}
function regularFiles(directory,prefix=''){
 assert(!lstatSync(directory).isSymbolicLink()&&lstatSync(directory).isDirectory(),'Artifact directory must be a real directory');const result=[];
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  const relative=prefix+entry.name;safeRelative(relative);const path=join(directory,entry.name),st=lstatSync(path);assert(!st.isSymbolicLink(),'Artifact symlinks are prohibited');
  if(st.isDirectory())result.push(...regularFiles(path,relative+'/'));else{assert(st.isFile(),'Non-regular artifact entry');result.push(relative);}
 }
 return result.sort();
}
const TARCHECK=String.raw`import hashlib,json,sys,tarfile
with tarfile.open(sys.argv[1],'r:') as archive:
 m=archive.getmember('manifest.json')
 if not m.isfile() or m.size>8*1024*1024:raise ValueError('Invalid image save manifest')
 values=json.load(archive.extractfile(m))
 if not isinstance(values,list) or len(values)!=1:raise ValueError('Exactly one Docker image required')
 path=values[0]['Config']
 if path.startswith('/') or '\\' in path or any(x in ('','..','.') for x in path.split('/')):raise ValueError('Unsafe image config path')
 c=archive.getmember(path)
 if not c.isfile() or c.size>32*1024*1024:raise ValueError('Invalid image config')
 if 'sha256:'+hashlib.sha256(archive.extractfile(c).read()).hexdigest()!=sys.argv[2]:raise ValueError('Archive image ID mismatch')`;
export async function verifyLocalPayload(directory,expected){
 const proof=JSON.parse(readFileSync(join(directory,PROOF),'utf8')),files=verifyProof(proof,expected);
 assert.deepEqual(regularFiles(directory),[PROOF,...Object.keys(files)].sort(),'Missing or additional artifact files');
 for(const [relative,entry]of Object.entries(files)){const path=join(directory,relative);assert.equal(statSync(path).size,entry.bytes,'Local artifact size mismatch');assert.equal(await hashFile(path),entry.sha256,'Local artifact bytes changed');}
 if(expected.role==='backend-image'||expected.role==='frontend-image'){
  const image=proof.outputs.image;assert.match(image?.imageId??'',/^sha256:[a-f0-9]{64}$/);safeRelative(image.archive);assert.equal(files[image.archive]?.sha256,image.archiveSHA256,'Archive receipt differs from output manifest');
  const inspect=JSON.parse(readFileSync(join(directory,expected.role.split('-')[0]+'-image.json'),'utf8'));assert.equal(inspect.length,1);assert.equal(inspect[0].Id,image.imageId,'Image inspect ID differs from producer');
  execFileSync('python3',['-c',TARCHECK,join(directory,image.archive),image.imageId],{stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});
 }
 if(expected.role==='frontend-dist'){
  const m=JSON.parse(readFileSync(join(directory,'frontend-dist.json'),'utf8'));assert.equal(m.head,expected.head);assert.equal(String(m.run),expected.runId);assert.equal(number(m.attempt),expected.producerAttempt);
  assert.deepEqual(Object.keys(m.files).sort(),Object.keys(files).filter(p=>p.startsWith('dist/')).map(p=>p.slice(5)).sort());
  for(const [path,entry]of Object.entries(m.files)){safeRelative(path);assert.deepEqual(entry,files['dist/'+path]);}
 }
 return {proof,files};
}
const EXTRACT=String.raw`import os,pathlib,shutil,stat,sys,zipfile
root=pathlib.Path(sys.argv[2]);root.mkdir(mode=0o700)
with zipfile.ZipFile(sys.argv[1]) as archive:
 values=archive.infolist()
 if not values or len(values)>100000 or sum(x.file_size for x in values)>24*1024**3:raise ValueError('Archive limits exceeded')
 seen=set()
 for item in values:
  name=item.filename.rstrip('/') if item.is_dir() else item.filename
  if not name or name.startswith('/') or '\\' in name or any(ord(x)<32 for x in name) or any(x in ('','..','.') for x in name.split('/')) or name in seen:raise ValueError('Unsafe or duplicate ZIP path')
  seen.add(name)
  mode=(item.external_attr>>16)&0o170000
  if mode not in (0,stat.S_IFDIR if item.is_dir() else stat.S_IFREG) or item.flag_bits&1:raise ValueError('Linked, encrypted or special ZIP entry')
  target=root.joinpath(*name.split('/'))
  if item.is_dir():target.mkdir(parents=True,exist_ok=True)
  else:
   target.parent.mkdir(parents=True,exist_ok=True)
   with archive.open(item) as source,target.open('xb') as output:shutil.copyfileobj(source,output,1024*1024)
   if target.stat().st_size!=item.file_size:raise ValueError('Incomplete ZIP file')`;
const ZIPBIND=String.raw`import hashlib,pathlib,stat,sys,zipfile
root=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(sys.argv[1]) as archive:
 entries=archive.infolist();names=[];seen=set()
 if not entries or len(entries)>100000 or sum(x.file_size for x in entries)>24*1024**3:raise ValueError('Archive limits exceeded')
 for item in entries:
  name=item.filename.rstrip('/') if item.is_dir() else item.filename
  if not name or name.startswith('/') or '\\' in name or any(ord(x)<32 for x in name) or any(x in ('','..','.') for x in name.split('/')) or name in seen:raise ValueError('Unsafe or duplicate ZIP path')
  seen.add(name);mode=(item.external_attr>>16)&0o170000
  if mode not in (0,stat.S_IFDIR if item.is_dir() else stat.S_IFREG) or item.flag_bits&1:raise ValueError('Linked, encrypted or special ZIP entry')
  if not item.is_dir():
   names.append(name);target=root.joinpath(*name.split('/'))
   if target.is_symlink() or not target.is_file() or target.stat().st_size!=item.file_size:raise ValueError('ZIP and local payload differ')
 if sorted(names)!=sorted(p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()):raise ValueError('ZIP and local file lists differ')
 if hashlib.sha256(archive.read('phase-receipt.json')).digest()!=hashlib.sha256((root/'phase-receipt.json').read_bytes()).digest():raise ValueError('Original ZIP proof bytes changed')`;
export async function downloadArchive(expected,meta,zipPath,token,fetcher=fetch){
 assert(!existsSync(zipPath),'Existing ZIP must be verified locally, never downloaded again');
 const response=await fetcher(`https://api.github.com/repos/${REPOSITORY}/actions/artifacts/${expected.artifactId}/zip`,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'manual'});
 let body=response;
 if(response.status===302){
  const url=new URL(response.headers.get('location')??'invalid:');assert.equal(url.protocol,'https:');assert(!url.username&&!url.password&&(/^[a-z0-9-]+\.blob\.core\.windows\.net$/i.test(url.hostname)||/^[a-z0-9.-]+\.actions\.githubusercontent\.com$/i.test(url.hostname)),'Unexpected artifact storage redirect');
  // Never forward the GitHub bearer token to the signed blob URL.
  body=await fetcher(url.href,{redirect:'error'});
 }else assert.equal(response.status,200,`Artifact download unavailable (${response.status}); no fallback`);
 assert.equal(body.status,200,'Official artifact bytes unavailable');assert(body.body,'Missing official ZIP body');let bytes=0;
 const count=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>meta.size_in_bytes||bytes>MAX_ZIP)callback(new Error('Artifact ZIP size exceeded'));else callback(null,chunk);}});
 await pipeline(Readable.fromWeb(body.body),count,createWriteStream(zipPath,{flags:'wx',mode:0o600}));
 assert.equal(bytes,meta.size_in_bytes,'Official ZIP size mismatch');assert.equal('sha256:'+await hashFile(zipPath),expected.artifactDigest,'Official ZIP digest mismatch');return {bytes,sha256:expected.artifactDigest.slice(7)};
}
export async function verifyArtifact({expected,directory,mode='verify-local',token,fetcher=fetch}){
 assert(['download','verify-local'].includes(mode));directory=resolve(directory);const zipPath=directory+'.artifact.zip',receiptPath=directory+'.verified.json';
 const {meta,producerJob}=await officialMetadata(expected,token,fetcher);
 if(mode==='download'){
  assert(!existsSync(directory),'Existing payload must be verified locally, never overwritten');mkdirSync(dirname(directory),{recursive:true});await downloadArchive(expected,meta,zipPath,token,fetcher);
  const staging=directory+'.extracting';assert(!existsSync(staging),'A previous extraction remains; stop for review');
  try{execFileSync('python3',['-c',EXTRACT,zipPath,staging],{stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});await verifyLocalPayload(staging,expected);renameSync(staging,directory);}catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
 }
 assert(existsSync(zipPath),'Original official ZIP is required; no fallback or redownload');assert.equal(statSync(zipPath).size,meta.size_in_bytes);const zipSHA256=await hashFile(zipPath);assert.equal('sha256:'+zipSHA256,expected.artifactDigest);
 execFileSync('python3',['-c',ZIPBIND,zipPath,directory],{stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});
 const {proof,files}=await verifyLocalPayload(directory,expected);
 const receipt={schemaVersion:1,kind:'pr356-official-artifact-validation',phaseId:proof.phaseId,role:expected.role,source:proof.source,
  artifact:{id:meta.id,name:meta.name,digest:meta.digest,sizeBytes:meta.size_in_bytes},producerJob,zipPath,zipSHA256,zipBytes:meta.size_in_bytes,directory,proofPath:join(directory,PROOF),inputsSHA256:proof.inputsSHA256,proofSHA256:await hashFile(join(directory,PROOF)),payloadFiles:files};
 writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});return {...receipt,verificationReceipt:receiptPath};
}
/** Producer-only byte staging. A local stage is never official qualification. */
export async function stageArtifact({role,spec,directory,destination,env=process.env,readHead=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()}){
 checkedSpecification(role,spec);assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,REPOSITORY);assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.equal(readHead(),env.GITHUB_SHA,'Staging checkout/source mismatch');
 const expected={role,phaseId:spec.id,repository:REPOSITORY,runId:String(number(env.GITHUB_RUN_ID)),head:env.GITHUB_SHA,producerAttempt:number(env.GITHUB_RUN_ATTEMPT),spec};
 const temporary=realpathSync(env.RUNNER_TEMP??'');directory=realpathSync(directory);destination=resolve(destination);
 const within=(path,root)=>path.startsWith(root+'/');assert(within(directory,temporary)&&within(destination,temporary),'Both producer and staging must be inside RUNNER_TEMP');assert(!within(destination,directory)&&!within(directory,destination),'Staging must be separate from source');assert(!existsSync(destination),'Staging destination must be new');
 const proofPath=join(directory,PROOF),proofBytes=readFileSync(proofPath),proof=JSON.parse(proofBytes),files=verifyProof(proof,expected),union={};
 for(const manifest of proof.outputs.artifactFiles?Object.values(proof.outputs.artifactFiles):[files])for(const [path,entry]of Object.entries(manifest)){safeRelative(path);if(union[path])assert.deepEqual(union[path],entry,'Conflicting role manifests');union[path]=entry;}
 assert.deepEqual(regularFiles(directory),[PROOF,...Object.keys(union)].sort(),'Unregistered producer output');
 for(const [relative,entry]of Object.entries(files)){const path=join(directory,relative);assert.equal(statSync(path).size,entry.bytes);assert.equal(await hashFile(path),entry.sha256,'Producer output changed before staging');}
 mkdirSync(dirname(destination),{recursive:true});const parent=realpathSync(dirname(destination));assert(parent===temporary||within(parent,temporary),'Staging parent escaped RUNNER_TEMP');mkdirSync(destination,{mode:0o700});
 const copy=(source,target)=>{mkdirSync(dirname(target),{recursive:true});try{linkSync(source,target);}catch(error){if(error.code!=='EXDEV')throw error;copyFileSync(source,target);}};
 try{for(const relative of Object.keys(files))copy(join(directory,relative),join(destination,relative));copy(proofPath,join(destination,PROOF));assert.equal(sha(readFileSync(join(destination,PROOF))),sha(proofBytes),'Original producer proof changed');for(const [path,entry]of Object.entries(files))assert.equal(await hashFile(join(destination,path)),entry.sha256,'Staged output changed');}
 catch(error){rmSync(destination,{recursive:true,force:true});throw error;}
 return {schemaVersion:1,kind:'pr356-local-artifact-stage',role,phaseId:proof.phaseId,source:proof.source,sourceDirectory:directory,stagedDirectory:destination,proofSHA256:sha(proofBytes),payloadFiles:files,qualificationClaim:false};
}
async function main(){
 const [mode,role,...args]=process.argv.slice(2);const option=name=>{const i=args.indexOf(name);assert(i>=0&&args[i+1],name+' required');return args[i+1];};
 const spec=JSON.parse(readFileSync(option('--phase-spec'),'utf8'));if(mode==='stage'){console.log(JSON.stringify(await stageArtifact({role,spec,directory:option('--directory'),destination:option('--destination')})));return;}const expected=expectedFromEnvironment(role,spec);
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),expected.head,'Consumer checkout differs from the producer');
 const receipt=await verifyArtifact({mode,expected,directory:option('--directory'),token:process.env.GH_TOKEN??process.env.GITHUB_TOKEN});
 console.log(JSON.stringify({verificationReceipt:receipt.verificationReceipt,proofPath:receipt.proofPath,directory:receipt.directory,phaseId:receipt.phaseId,role:receipt.role,zipSHA256:receipt.zipSHA256,zipBytes:receipt.zipBytes,artifact:receipt.artifact}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'PR356 artifact verification failed; no fallback');process.exitCode=1;});
