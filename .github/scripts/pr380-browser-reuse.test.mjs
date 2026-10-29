import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {PIN,verifyOfficial,verifyInputClosure,restoreArchive,ZIP_RESTORE} from './pr380-browser-reuse.mjs';
const now=Date.parse('2026-10-28T10:20:00Z'),date=n=>new Date(now+n).toISOString();
function metadata(){return [
 {id:PIN.runId,run_attempt:1,head_sha:PIN.sourceHead,head_branch:PIN.branch,event:'pull_request',path:'.github/workflows/ci.yml',repository:{full_name:PIN.repository},head_repository:{full_name:PIN.repository},pull_requests:[{number:380}],status:'completed',conclusion:'failure'},
 {id:PIN.jobId,run_id:PIN.runId,run_attempt:1,head_sha:PIN.sourceHead,name:PIN.jobName,status:'completed',conclusion:'failure',completed_at:date(-1000),steps:[...['verify exact candidate and original local results without application replay','install only missing reviewed browser consumer dependencies'].map(name=>({name,status:'completed',conclusion:'success'})),{name:'build once and verify bounded postlogin task and editor loading',status:'completed',conclusion:'failure'}]},
 {id:PIN.artifactId,name:PIN.artifactName,expired:false,size_in_bytes:PIN.zipBytes,digest:'sha256:'+PIN.zipSHA256,created_at:date(-2000),expires_at:date(86400000),workflow_run:{id:PIN.runId,head_sha:PIN.sourceHead,head_branch:PIN.branch}}
 ];}
test('authenticates the exact failed origin without relabelling its successful build as job success',()=>{
 const rows=metadata();assert.equal(verifyOfficial(...rows,now).originalJobConclusion,'failure');
 for(const [index,key,value] of [[0,'run_attempt',2],[0,'head_sha','0'.repeat(40)],[1,'conclusion','success'],[1,'id',1],[2,'id',1],[2,'digest','sha256:wrong'],[2,'expired',true]]){const copy=structuredClone(rows);copy[index][key]=value;assert.throws(()=>verifyOfficial(...copy,now));}
 assert.throws(()=>verifyOfficial(...rows,now+86400001));
});
test('rejects application, unknown control, changed modes and dirty tracked inputs',()=>{
 const git=(...args)=>{const value=execFileSync('git',args,{encoding:'utf8'});return args[0]==='show'?value:value.replace(/\n$/,'');};
 for(const line of [':100644 100644 '+'a'.repeat(40)+' '+'b'.repeat(40)+' M\tserver-version/frontend/src/App.tsx',':100644 100644 '+'a'.repeat(40)+' '+'b'.repeat(40)+' M\t.github/unknown.mjs',':100644 120000 '+'a'.repeat(40)+' '+'b'.repeat(40)+' M\t.github/scripts/pr380-browser.mjs'])assert.throws(()=>verifyInputClosure((...args)=>args[0]==='diff'&&args[1]==='--raw'?line:args[0]==='diff'?'':git(...args),git('rev-parse','HEAD')));
 assert.throws(()=>verifyInputClosure((...args)=>args[0]==='diff'&&args[1]==='--raw'?'':args[0]==='diff'?'dirty':git(...args),git('rev-parse','HEAD')));
 const verified=verifyInputClosure((...args)=>args[0]==='diff'?'':git(...args),git('rev-parse','HEAD'));assert.equal(verified.frontendTree,PIN.frontendTree);
});
test('restores only fixed archive bytes and preserves original browser failure plus build log',t=>{
 const archive=process.env.PR380_TEST_ZIP;if(!archive){t.skip('Requires the explicitly pinned original ZIP via PR380_TEST_ZIP');return;}
 const cwd=mkdtempSync(join(tmpdir(),'pr380-archive-test-'));
 try{const result=restoreArchive(archive,{cwd});assert.equal(result.report.status,'FAIL');assert.equal(result.report.build.exitCode,0);assert.equal(result.report.cases[2].status,'FAIL');assert(Object.keys(result.files).length>700);assert(existsSync(resolve(cwd,'server-version/frontend/dist/.vite/manifest.json')));assert(readFileSync(resolve(cwd,'onboarding-evidence/postlogin/build.log')).length>80000);assert.throws(()=>restoreArchive(archive,{cwd}));}finally{rmSync(cwd,{recursive:true,force:true});}
});
test('rejects unsafe ZIP paths before any destination is written',()=>{
 const cwd=mkdtempSync(join(tmpdir(),'pr380-unsafe-test-'));
 try{for(const name of ['../escape','/absolute','postlogin/dist/../escape','postlogin/dist\\escape']){
  const zip=join(cwd,'unsafe.zip');execFileSync('python3',['-c',"import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],'w') as z:z.writestr(sys.argv[2],'bad')",zip,name]);
  assert.throws(()=>execFileSync('python3',['-c',ZIP_RESTORE,zip,join(cwd,'dist'),join(cwd,'out'),'{}'],{stdio:'pipe'}));assert(!existsSync(join(cwd,'dist')));
 }}finally{rmSync(cwd,{recursive:true,force:true});}
});
