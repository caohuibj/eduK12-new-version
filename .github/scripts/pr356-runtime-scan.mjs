import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,statSync,realpathSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {expectedFromEnvironment,verifyArtifact,inputsSHA256,hashFile,safeRelative} from './pr356-artifacts.mjs';
const REPO='caohuibj/eduK12-new-version',sha=b=>createHash('sha256').update(b).digest('hex');
export function verifyTrivyResult(report,imageId){
 assert.match(imageId,/^sha256:[a-f0-9]{64}$/);assert(report&&report.SchemaVersion>=2,'Structured Trivy report required');
 assert.equal(report.Metadata?.ImageID,imageId,'Scanner inspected another image');
 assert(Array.isArray(report.Results)&&report.Results.length,'Missing runtime scan results');
 const findings=[];
 for(const result of report.Results){assert.equal(typeof result.Target,'string');assert(result.Target);if(result.Vulnerabilities!==undefined)assert(Array.isArray(result.Vulnerabilities));for(const v of result.Vulnerabilities??[]){assert(v&&typeof v.VulnerabilityID==='string'&&typeof v.Severity==='string');findings.push({target:result.Target,id:v.VulnerabilityID,severity:v.Severity,fixedVersion:v.FixedVersion??null});}}
 assert(!findings.some(v=>['HIGH','CRITICAL'].includes(v.severity)&&v.fixedVersion),'Fixable HIGH/CRITICAL runtime findings');
 return {imageId,targets:report.Results.length,findings,threshold:'HIGH,CRITICAL',ignoreUnfixed:true};
}
export function scanArguments(imageId,out,cache){assert.match(imageId,/^sha256:[a-f0-9]{64}$/);return ['image','--cache-dir',cache,'--format','json','--output',join(out,'trivy.json'),'--exit-code','1','--ignore-unfixed','--vuln-type','os,library','--severity','CRITICAL,HIGH',imageId];}
function actualInputs(spec,inputs){
 assert.deepEqual(inputs,spec.inputs);assert.equal(inputsSHA256(inputs),spec.inputsSHA256);assert(inputs.files.length);
 for(const f of inputs.files){safeRelative(f.path);const path=resolve(f.path),st=lstatSync(path);assert(st.isFile()&&!st.isSymbolicLink());const b=readFileSync(path);assert.equal(createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex'),f.blob,'Actual input bytes changed: '+f.path);assert.equal(st.mode&0o100?'100755':'100644',f.mode);}
}
async function main(){
 const component=process.argv[2];assert(['backend','frontend'].includes(component));assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,REPO);
 const phaseId=component+'-scan',spec=JSON.parse(readFileSync(process.env.PR356_PHASE_SPEC,'utf8')),inputs=JSON.parse(readFileSync(process.env.PR356_PHASE_INPUTS,'utf8'));
 assert.equal(spec.id,phaseId);assert.equal(spec.jobName,'pr356-'+phaseId);assert.equal(spec.inputs.tools.trivy?.version,'0.70.0','Pinned Trivy tool required');assert.deepEqual(spec.inputs.configuration.scan,{severity:['CRITICAL','HIGH'],ignoreUnfixed:true,vulnerabilityTypes:['os','library']});assert.deepEqual(spec.caseIds,[component+'-runtime-high-critical']);actualInputs(spec,inputs);
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(head,process.env.GITHUB_SHA);
 const root=resolve(process.env.RUNNER_TEMP),out=resolve(process.env.PR356_EVIDENCE_DIR),cache=resolve(process.env.PR356_TRIVY_CACHE_DIR);for(const dir of [out,cache]){const p=relative(root,dir);assert(p&&!p.startsWith('../')&&!isAbsolute(p));mkdirSync(dir,{recursive:true});}assert.equal(readdirSync(out).length,0,'Preserve existing scan evidence');
 const upstreamSpec=JSON.parse(readFileSync(process.env.PR356_UPSTREAM_PHASE_SPEC,'utf8'));
 const expected=expectedFromEnvironment(component+'-image',upstreamSpec);
 const producer=await verifyArtifact({expected,directory:process.env.PR356_UPSTREAM_DIRECTORY,mode:'verify-local',token:process.env.GH_TOKEN});
 const proof=JSON.parse(readFileSync(producer.proofPath,'utf8')),imageId=proof.outputs.image.imageId;
 const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
 const calls=[];
 const run=(name,command,args)=>{const startedAt=new Date().toISOString(),r=spawnSync(command,args,{env,encoding:'utf8',maxBuffer:16*1024*1024});const log=Buffer.from((r.stdout??'')+(r.stderr??''));writeFileSync(join(out,name+'.log'),log,{flag:'wx',mode:0o600});const record={argv:[command,...args],cwd:process.cwd(),exitCode:r.status,logSHA256:sha(log),startedAt,completedAt:new Date().toISOString()};calls.push(record);assert.equal(r.error,undefined,'Runtime tool could not execute');assert.equal(r.status,0,'Runtime '+name+' failed; original log retained');return record;};
 run('load','docker',['--host=unix:///var/run/docker.sock','load','--input',join(producer.directory,proof.outputs.image.archive)]);
 const inspect=JSON.parse(execFileSync('docker',['--host=unix:///var/run/docker.sock','image','inspect',imageId],{env,encoding:'utf8'}));assert.equal(inspect.length,1);assert.equal(inspect[0].Id,imageId);
 if(component==='backend')run('native','docker',['--host=unix:///var/run/docker.sock','run','--rm','--network','none','--entrypoint','node',imageId,'-e',"require('canvas');require('sharp');if(!require('fs').existsSync('/app/dist/workers/main.js'))throw Error('Missing worker runtime')"]);
 run('trivy-version','trivy',['--version']);
 const trivyVersion=/^Version:\s*([0-9.]+)/m.exec(readFileSync(join(out,'trivy-version.log'),'utf8'))?.[1];assert.equal(trivyVersion,spec.inputs.tools.trivy.version,'Actual scanner version drift');
 const trivyBinary=realpathSync(execFileSync('which',['trivy'],{encoding:'utf8'}).trim());
 const tools={node:{version:process.version,executableSHA256:await hashFile(process.execPath)},trivy:{version:trivyVersion,executableSHA256:await hashFile(trivyBinary)},docker:JSON.parse(execFileSync('docker',['--host=unix:///var/run/docker.sock','version','--format','{{json .}}'],{env,encoding:'utf8'}))};
 writeFileSync(join(out,'execution-tools.json'),JSON.stringify(tools,null,2)+'\n',{flag:'wx'});
 const command=run('scan','trivy',scanArguments(imageId,out,cache));
 const summary=verifyTrivyResult(JSON.parse(readFileSync(join(out,'trivy.json'),'utf8')),imageId);
 const metadataPath=join(cache,'db','metadata.json');assert(lstatSync(metadataPath).isFile(),'Actual vulnerability database metadata missing');const dbMetadata=readFileSync(metadataPath);writeFileSync(join(out,'trivy-database.json'),dbMetadata,{flag:'wx'});
 writeFileSync(join(out,'scan-summary.json'),JSON.stringify({...summary,producer:producer.artifact,producerInputsSHA256:producer.inputsSHA256,databaseMetadataSHA256:sha(dbMetadata),calls},null,2)+'\n',{flag:'wx'});
 actualInputs(spec,inputs);const files={};for(const name of readdirSync(out).sort()){const f=join(out,name);assert(lstatSync(f).isFile());files[name]={bytes:statSync(f).size,sha256:await hashFile(f)};}
 const receipt={schemaVersion:1,kind:'pr356-phase-proof',phaseId,status:'success',source:{repository:REPO,runId:process.env.GITHUB_RUN_ID,head,producerAttempt:Number(process.env.GITHUB_RUN_ATTEMPT)},inputs,inputsSHA256:spec.inputsSHA256,command,checks:spec.caseIds.map(id=>({id,status:'passed'})),outputs:{files,scan:summary,producer:producer.artifact,upstream:[{phaseId:producer.phaseId,role:producer.role,artifactId:String(producer.artifact.id),runId:String(producer.source.runId),producerAttempt:Number(producer.source.producerAttempt),proofSHA256:producer.proofSHA256,artifactDigest:producer.artifact.digest,inputsSHA256:producer.inputsSHA256}]}};
 writeFileSync(join(out,'phase-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('PR356 runtime scan failed; preserve original evidence, no rebuild/fallback');process.exitCode=1;});
