import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync,existsSync,mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {createCodeqlCollector,CODEQL_CASES} from './pr356-codeql.mjs';
import {canonicalSHA256,sha256,sarifIdentity,validateSarifEvidence,verifySarifDisposition} from './pr356-sarif.mjs';
import {verifyProof} from './pr356-artifacts.mjs';

const HEAD='a'.repeat(40),TREE='b'.repeat(40),VERSION='2.23.0';
function fixture(language='javascript-typescript',{finding=false}={}){
 const temporary=mkdtempSync(path.join(os.tmpdir(),'pr356-codeql-fake-')),root=path.join(temporary,'workspace'),temp=path.join(temporary,'runner'),toolRoot=path.join(temporary,'installed'),packRoot=path.join(temporary,'packs','queries'),libraryRoot=path.join(temporary,'packs','library'),sarifRoot=path.join(temporary,'sarif'),phase='codeql-'+language,source=language==='python'?'python':'javascript';
 for(const p of [root,temp,toolRoot,packRoot,libraryRoot,sarifRoot])mkdirSync(p,{recursive:true});
 const put=(filename,data)=>{mkdirSync(path.dirname(filename),{recursive:true});writeFileSync(filename,typeof data==='object'&&!Buffer.isBuffer(data)?JSON.stringify(data,null,2)+'\n':data);return filename;};
 const payload=Buffer.from('synthetic frozen source\n'),sourcePath='server-version/backend/fixture.'+(source==='python'?'py':'ts');put(path.join(root,sourcePath),payload);
 const blob=createHash('sha1').update('blob '+payload.length+'\0').update(payload).digest('hex');
 const inputs={schemaVersion:1,files:[{path:sourcePath,mode:'100644',blob}],configuration:{codeql:{name:'PR356 bounded security-extended',paths:['server-version/backend','server-version/frontend','.github/scripts']}},tools:{codeql:{queries:'security-extended',init:{id:'codeql-init',name:'initialize CodeQL',uses:'github/codeql-action/init@v3'},analyze:{id:'codeql-analyze',name:'analyze with CodeQL',uses:'github/codeql-action/analyze@v3'}}},dependencies:{kind:'no application installation; fake collector fixture'}};
 const spec={id:phase,jobName:'pr356-'+phase,language,caseIds:CODEQL_CASES[language],inputs,inputsSHA256:canonicalSHA256(inputs)};
 const specPath=put(path.join(temp,'spec.json'),spec),inputPath=put(path.join(temp,'inputs.json'),inputs),config=put(path.join(temp,'config.json'),inputs.configuration.codeql);
 const tool=put(path.join(toolRoot,'codeql'),'#!/fake-codeql\n');chmodSync(tool,0o755);put(path.join(toolRoot,'engine.bin'),'real fake engine bytes');
 const packName='codeql/'+source+'-queries',suitePath='codeql-suites/'+source+'-security-extended.qls';
 put(path.join(packRoot,'qlpack.yml'),`name: ${packName}\nversion: 1.2.3\ndependencies:\n  codeql/util: 1.0.0\n`);put(path.join(packRoot,suitePath),'- query: Fixture.ql\n');const query=put(path.join(packRoot,'Fixture.ql'),'// fake query metadata, never executed\n');
 put(path.join(libraryRoot,'qlpack.yml'),'name: codeql/util\nversion: 1.0.0\nlibrary: true\n');put(path.join(libraryRoot,'Library.qll'),'// fake library\n');
 const database=path.join(temp,'database');mkdirSync(database);put(path.join(database,'codeql-database.yml'),`primaryLanguage: ${source}\ncreationMetadata:\n  cliVersion: ${VERSION}\n`);
 const sarif={version:'2.1.0',runs:[{tool:{driver:{name:'CodeQL',semanticVersion:VERSION,rules:[]},extensions:[{name:packName,semanticVersion:'1.2.3',rules:[{id:source+'/fixture-security',defaultConfiguration:{level:'error'},properties:{'security-severity':'8.7'}}]}]},automationDetails:{id:'pr356/'+phase+'/'},properties:{'semmle.sourceLanguage':source},versionControlProvenance:[{revisionId:HEAD}],results:finding?[{rule:{id:source+'/fixture-security',index:0,toolComponent:{index:0}},message:{text:'Synthetic finding remains a finding'},locations:[{physicalLocation:{artifactLocation:{uri:sourcePath},region:{startLine:1}}}],partialFingerprints:{location:'fixture-1'}}]:[]}]};
 const sarifFile=put(path.join(sarifRoot,source+'.sarif'),sarif);
 const env={...process.env,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'caohuibj/eduK12-new-version',GITHUB_JOB:'pr356-'+phase,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:HEAD,GITHUB_WORKSPACE:root,RUNNER_TEMP:temp,PR356_EVIDENCE_DIR:path.join(temp,'evidence'),PR356_PHASE_SPEC:specPath,PR356_PHASE_INPUTS:inputPath,PR356_CODEQL_CONFIG:config,PR356_CODEQL_PATH:tool,PR356_CODEQL_INIT_OUTCOME:'success',PR356_CODEQL_ANALYZE_OUTCOME:'success',PR356_CODEQL_DB_LOCATIONS:JSON.stringify({[source]:database}),PR356_CODEQL_SARIF_OUTPUT:sarifRoot};
 const calls=[],responses={};
 const execute=command=>{
  calls.push(command);
  let value;
  if(command[0]==='git'){assert.deepEqual(command.slice(1,3),['rev-parse',command[2]]);value=command[2]==='HEAD'?HEAD:TREE;}
  else{
   assert.equal(command[0],tool);assert(!['database','analyze','run-queries','interpret-results','finalize','create'].includes(command[1]),'fake tests cannot run analysis');
   const args=command.slice(1);
   if(args[0]==='version')value={version:VERSION};
   else if(args[1]==='qlpacks')value={[packName]:[packRoot],'codeql/util':[libraryRoot]};
   else if(args[1]==='queries'&&args[2]==='--format=json')value=[query];
   else if(args[1]==='queries'&&args[2]==='--format=startingpacks')value=[packRoot];
   else if(args[1]==='database')value={primaryLanguage:source,creationMetadata:{cliVersion:VERSION}};
   else throw Error('Unexpected metadata command: '+JSON.stringify(command));
   if(responses[args.join(' ')])return responses[args.join(' ')];
  }
  return {status:0,signal:null,stdout:Buffer.from(typeof value==='string'?value+'\n':JSON.stringify(value)),stderr:Buffer.alloc(0)};
 };
 const collector=()=>createCodeqlCollector({env,cwd:root,execute});
 const artifact=()=>{const files={};const visit=(dir,prefix='')=>{for(const name of readdirSync(dir,{withFileTypes:true})){if(name.isDirectory())visit(path.join(dir,name.name),prefix+name.name+'/');else files[prefix+name.name]=readFileSync(path.join(dir,name.name));}};visit(env.PR356_EVIDENCE_DIR);return {files};};
 return {temporary,root,temp,toolRoot,packRoot,libraryRoot,query,spec,inputs,env,sourcePath,sarif,sarifFile,database,source,phase,put,calls,responses,collector,artifact,clean:()=>rmSync(temporary,{recursive:true,force:true})};
}

for(const language of ['javascript-typescript','python'])test('begin/finish '+language+' produce a complete exact standard proof using only fake metadata execution',()=>{
 const f=fixture(language);try{
  assert.equal(f.collector().begin(language).status,'begun');const proof=f.collector().finish(language);
  assert.equal(proof.status,'success');assert.deepEqual(proof.checks,CODEQL_CASES[language].map(id=>({id,status:'passed'})));
  const expected={phaseId:f.phase,role:f.phase,repository:f.env.GITHUB_REPOSITORY,runId:f.env.GITHUB_RUN_ID,head:HEAD,producerAttempt:2,spec:f.spec};
  const declared=verifyProof(proof,expected),actual=Object.keys(f.artifact().files).filter(p=>p!=='phase-receipt.json').sort();assert.deepEqual(Object.keys(declared).sort(),actual);
  for(const [name,value]of Object.entries(declared)){const bytes=f.artifact().files[name];assert.equal(value.sha256,sha256(bytes));assert.equal(value.bytes,bytes.length);}
  const summary=validateSarifEvidence(proof.outputs.sarifEvidence,f.artifact());assert.equal(summary.analysisSuccessful,true);assert.equal(summary.zeroFindings,true);
  assert.equal(proof.outputs.sarifEvidence.executionProfile,'codeql-action-v3');assert.equal(proof.outputs.sarifEvidence.cli.bundleKind,'installed-tree');assert.equal(proof.outputs.sarifEvidence.queryPacks.length,2);
  const receipt=JSON.parse(f.artifact().files['analysis-receipt.json']);assert.equal(receipt.stages,undefined);assert.deepEqual(receipt.metadataCommands.map(r=>r.name),['version','resolve-packs','resolve-queries','starting-packs','database-info']);assert(receipt.metadataCommands.every(r=>r.exitCode===0));
 }finally{f.clean();}
});

test('successful analysis with nonzero findings exports every original finding and pending policy cannot admit',()=>{
 const f=fixture('javascript-typescript',{finding:true});try{
  f.collector().begin('javascript-typescript');const proof=f.collector().finish('javascript-typescript'),summary=JSON.parse(f.artifact().files['sarif-summary.json']);assert.equal(summary.findings.length,1);assert.equal(summary.findings[0].severity.securitySeverity,'8.7');assert.equal(summary.zeroFindings,false);
  assert.throws(()=>verifySarifDisposition({plan:{head:HEAD,tree:TREE,sarifPolicy:{state:'pending'}},phase:{...f.spec,sarifEvidence:proof.outputs.sarifEvidence},proof,artifact:f.artifact()}),/POLICY_PENDING/);
 }finally{f.clean();}
});

test('phase/input file paths, fixed cases, exact config and security-extended settings are required',()=>{
 const mutations=[f=>f.env.PR356_PHASE_SPEC=JSON.stringify(f.spec),f=>{f.spec.caseIds=['fake-pass'];f.put(f.env.PR356_PHASE_SPEC,f.spec);},f=>{f.inputs.tools.codeql.queries='default';f.spec.inputs=f.inputs;f.spec.inputsSHA256=canonicalSHA256(f.inputs);f.put(f.env.PR356_PHASE_INPUTS,f.inputs);f.put(f.env.PR356_PHASE_SPEC,f.spec);},f=>f.put(f.env.PR356_CODEQL_CONFIG,{name:'wrong'}),f=>f.env.GITHUB_SHA='c'.repeat(40)];
 for(const mutate of mutations){const f=fixture();try{mutate(f);assert.throws(()=>f.collector().begin('javascript-typescript'));}finally{f.clean();}}
});

test('boolean/action outcomes without a usable original SARIF never become a success proof',()=>{
 for(const mutate of [f=>f.env.PR356_CODEQL_ANALYZE_OUTCOME='true',f=>f.env.PR356_CODEQL_ANALYZE_OUTCOME='failure',f=>rmSync(f.sarifFile),f=>f.put(f.sarifFile,''),f=>f.put(f.sarifFile,'{"version":"2.1.0","runs":[')]){
  const f=fixture();try{f.collector().begin('javascript-typescript');mutate(f);assert.throws(()=>f.collector().finish('javascript-typescript'));const proof=JSON.parse(readFileSync(path.join(f.env.PR356_EVIDENCE_DIR,'phase-receipt.json')));assert.equal(proof.status,'failure');assert(proof.checks.every(c=>c.status==='failed'));assert.equal(proof.command.exitCode,1);}finally{f.clean();}
 }
});

test('actual source, CLI and query-package input drift after begin is refused',()=>{
 for(const mutate of [f=>f.put(path.join(f.root,f.sourcePath),'changed source'),f=>f.put(path.join(f.toolRoot,'engine.bin'),'changed installed CLI'),f=>f.put(f.query,'changed query'),f=>f.put(path.join(f.env.PR356_EVIDENCE_DIR,'unexpected.txt'),'unregistered file')]){
  const f=fixture();try{f.collector().begin('javascript-typescript');mutate(f);assert.throws(()=>f.collector().finish('javascript-typescript'));assert.equal(JSON.parse(readFileSync(path.join(f.env.PR356_EVIDENCE_DIR,'phase-receipt.json'))).status,'failure');}finally{f.clean();}
 }
});

test('metadata subprocess failure and unfinalized/foreign database evidence retain failed proof',()=>{
 for(const mutate of [f=>f.responses['resolve database '+f.database+' --format=json']={status:2,signal:null,stdout:Buffer.from('{}'),stderr:Buffer.from('actual fake metadata failure')},f=>f.put(path.join(f.database,'codeql-database.yml'),'primaryLanguage: javascript\ncreationMetadata:\n  cliVersion: 2.23.0\ninProgress:\n  started: now\n'),f=>f.put(path.join(f.database,'codeql-database.yml'),'primaryLanguage: python\ncreationMetadata:\n  cliVersion: 2.23.0\n')]){
  const f=fixture();try{f.collector().begin('javascript-typescript');mutate(f);assert.throws(()=>f.collector().finish('javascript-typescript'));assert.equal(JSON.parse(readFileSync(path.join(f.env.PR356_EVIDENCE_DIR,'phase-receipt.json'))).status,'failure');}finally{f.clean();}
 }
});

test('linked artifacts and repeated begin/finish are rejected without overwriting completed evidence',()=>{
 const f=fixture();try{
  f.collector().begin('javascript-typescript');assert.throws(()=>f.collector().begin('javascript-typescript'),/ALREADY_BEGUN/);
  f.collector().finish('javascript-typescript');const name=path.join(f.env.PR356_EVIDENCE_DIR,'phase-receipt.json'),original=readFileSync(name);assert.throws(()=>f.collector().finish('javascript-typescript'),/ALREADY_FINISHED/);assert(readFileSync(name).equals(original));
 }finally{f.clean();}
 const linked=fixture();try{linked.collector().begin('javascript-typescript');const real=linked.sarifFile+'.real';linked.put(real,readFileSync(linked.sarifFile));rmSync(linked.sarifFile);symlinkSync(real,linked.sarifFile);assert.throws(()=>linked.collector().finish('javascript-typescript'),/SYMLINK_PATH/);}finally{linked.clean();}
});

test('Action evidence profile rejects forged completion metadata without rerunning old CLI-profile cases',()=>{
 const f=fixture();try{
  f.collector().begin('javascript-typescript');const proof=f.collector().finish('javascript-typescript'),expected=proof.outputs.sarifEvidence;
  for(const mutate of [r=>r.action.analyze.outcome='failure',r=>r.metadataCommands.pop(),r=>r.metadataCommands[0].exitCode=1,r=>r.action.init.id='wrong-id',r=>r.profile='cli-stages']){
   const e=structuredClone(expected),artifact=f.artifact(),receipt=JSON.parse(artifact.files[e.analysis.path]);mutate(receipt);artifact.files[e.analysis.path]=Buffer.from(JSON.stringify(receipt));e.analysis.sha256=sha256(artifact.files[e.analysis.path]);assert.throws(()=>validateSarifEvidence(e,artifact),/ACTION_/);
  }
 }finally{f.clean();}
});


test('actual begin/finish CLI entry uses temporary fake executables and preserves phase input bindings',()=>{
 const f=fixture();try{
  const bin=path.join(f.temporary,'fake-bin');mkdirSync(bin);
  const fakeGit=f.put(path.join(bin,'git'),['#!/usr/bin/env node',`const a=process.argv.slice(2);if(a[0]!=='rev-parse'||!['HEAD','HEAD^{tree}'].includes(a[1]))process.exit(9);process.stdout.write(a[1]==='HEAD'?'${HEAD}':'${TREE}');`,''].join(String.fromCharCode(10)));
  chmodSync(fakeGit,0o755);
  const responses={
   'version --format=json':{version:VERSION},
   'resolve qlpacks --format=json':{'codeql/javascript-queries':[f.packRoot],'codeql/util':[f.libraryRoot]},
   ['resolve queries --format=json codeql/javascript-queries:codeql-suites/javascript-security-extended.qls']:[f.query],
   ['resolve queries --format=startingpacks codeql/javascript-queries:codeql-suites/javascript-security-extended.qls']:[f.packRoot],
   ['resolve database '+f.database+' --format=json']:{primaryLanguage:'javascript',creationMetadata:{cliVersion:VERSION}},
  };
  f.put(f.env.PR356_CODEQL_PATH,['#!/usr/bin/env node',"const a=process.argv.slice(2),r=JSON.parse(process.env.PR356_FAKE_METADATA_RESPONSES);if(!Object.hasOwn(r,a.join(' ')))process.exit(9);require('node:fs').appendFileSync(process.env.PR356_FAKE_CALLS,JSON.stringify(a)+String.fromCharCode(10));process.stdout.write(JSON.stringify(r[a.join(' ')]));",''].join(String.fromCharCode(10)));
  chmodSync(f.env.PR356_CODEQL_PATH,0o755);
  const env={...f.env,PATH:bin+path.delimiter+process.env.PATH,PR356_FAKE_METADATA_RESPONSES:JSON.stringify(responses),PR356_FAKE_CALLS:path.join(f.temporary,'fake-calls.log')};
  const script=new URL('./pr356-codeql.mjs',import.meta.url).pathname;
  for(const mode of ['begin','finish']){const result=spawnSync(process.execPath,[script,mode,'javascript-typescript'],{cwd:f.root,env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).status,mode==='begin'?'begun':'success');}
  const proof=JSON.parse(readFileSync(path.join(f.env.PR356_EVIDENCE_DIR,'phase-receipt.json'))),manifest=JSON.parse(readFileSync(path.join(f.env.PR356_EVIDENCE_DIR,'source-inputs.json')));
  assert.equal(manifest.phaseInputsSHA256,f.spec.inputsSHA256);assert.deepEqual(manifest.files.map(x=>x.path),f.spec.inputs.files.map(x=>x.path));assert(manifest.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
  assert.equal(proof.status,'success');assert.deepEqual(proof.outputs.upstream,[]);assert.deepEqual(proof.checks,[{id:'javascript-typescript-complete-security-extended',status:'passed'}]);
  const commands=readFileSync(env.PR356_FAKE_CALLS,'utf8').trim().split(String.fromCharCode(10)).map(JSON.parse);assert.equal(commands.length,5);assert(commands.every(a=>a[0]==='version'||a[0]==='resolve'));assert(!commands.some(a=>a[0]==='database'));
 }finally{f.clean();}
});


test('collector rejects unsupported pack dependency layouts and linked runner-temporary ancestors',()=>{
 const f=fixture();try{
  f.put(path.join(f.packRoot,'qlpack.yml'),['name: codeql/javascript-queries','version: 1.2.3','dependencies: {codeql/util: 1.0.0}',''].join(String.fromCharCode(10)));
  assert.throws(()=>f.collector().begin('javascript-typescript'),/UNSUPPORTED_PACK_DEPENDENCIES/);
 }finally{f.clean();}
 const linked=fixture();try{
  const outside=path.join(linked.temporary,'outside');mkdirSync(outside);symlinkSync(outside,path.join(linked.temp,'linked'),'dir');linked.env.PR356_EVIDENCE_DIR=path.join(linked.temp,'linked','evidence');
  assert.throws(()=>linked.collector().begin('javascript-typescript'),/RUNNER_TEMP_SYMLINK/);assert.equal(existsSync(path.join(outside,'evidence')),false);
 }finally{linked.clean();}
});


test('SARIF summary CLI loads complete real Action-profile artifact layouts for both languages',()=>{
 const fixtures=[fixture(),fixture('python')],directory=mkdtempSync(path.join(os.tmpdir(),'pr356-action-sarif-cli-'));
 try{
  const analyses={};
  for(const f of fixtures){
   const language=f.spec.language;f.collector().begin(language);const proof=f.collector().finish(language),prefix=language+'/';
   const prefixPaths=value=>Array.isArray(value)?value.map(prefixPaths):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='path'&&typeof value.sha256==='string'?prefix+v:prefixPaths(v)])):value;
   const expected=prefixPaths(proof.outputs.sarifEvidence),artifact=f.artifact();
   for(const [name,bytes]of Object.entries(artifact.files)){const filename=path.join(directory,prefix+name);mkdirSync(path.dirname(filename),{recursive:true});writeFileSync(filename,bytes);}
   const receipt=prefixPaths(JSON.parse(artifact.files[proof.outputs.sarifEvidence.analysis.path]));receipt.identity=sarifIdentity(expected);const receiptBytes=Buffer.from(JSON.stringify(receipt));writeFileSync(path.join(directory,expected.analysis.path),receiptBytes);expected.analysis.sha256=sha256(receiptBytes);analyses[language]=expected;
  }
  const filename=path.join(directory,'expected.json');writeFileSync(filename,JSON.stringify({schemaVersion:1,sourceHead:HEAD,sourceTree:TREE,analyses}));
  const result=spawnSync(process.execPath,[new URL('./pr356-sarif.mjs',import.meta.url).pathname,'summary',filename],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(result.stdout);assert.equal(summary.analyses.length,2);assert.equal(summary.findings.length,0);assert.equal(summary.releaseAuthorized,false);
 }finally{fixtures.forEach(f=>f.clean());rmSync(directory,{recursive:true,force:true});}
});


// Exercise the actual YAML consumer with only its declared synthetic runner
// inputs. A syntax check accepts subtraction in an env member expression and
// therefore cannot prove that the script reads the bound phase-spec variable.
function codeqlWorkflowInline(language,stepName){
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const job='pr356-codeql-'+language,start=workflow.indexOf('\n  '+job+':\n');assert(start>=0,'Actual CodeQL job missing');
 const rest=workflow.slice(start+1),next=/\n  [a-z][a-z0-9-]*:\n/.exec(rest),block=next?rest.slice(0,next.index):rest;
 const lines=block.split('\n'),step=lines.findIndex(line=>line==='    - name: '+stepName);assert(step>=0,'Actual inline step missing');
 const nextStep=lines.findIndex((line,index)=>index>step&&/^    - /.test(line)),segment=lines.slice(step,nextStep<0?undefined:nextStep);
 assert(segment.includes('      shell: node {0}'),'Expected actual Node inline script');const run=segment.findIndex(line=>/^      run: \|[-+]?$/.test(line));assert(run>=0,'Literal run body missing');
 const body=[];for(const line of segment.slice(run+1)){if(!line.trim()){body.push('');continue;}if(!line.startsWith('        '))break;body.push(line.slice(8));}
 assert(body.length,'Empty actual inline script');return body.join('\n')+'\n';
}
for(const language of ['javascript-typescript','python'])test('actual YAML CodeQL identity consumes bound phase spec for '+language,()=>{
 const temp=mkdtempSync(path.join(os.tmpdir(),'pr356-codeql-yaml-control-'));
 try{
  const workspace=path.join(temp,'workspace');mkdirSync(workspace);
  const env={GITHUB_WORKSPACE:workspace,RUNNER_TEMP:temp,GITHUB_ENV:path.join(temp,'runner.env'),GITHUB_OUTPUT:path.join(temp,'step.output'),GITHUB_RUN_ID:'40100000001',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:HEAD};
  const builtins={'node:fs':{realpathSync:read=>{assert([temp,workspace].includes(read));return read;},mkdirSync:(dir,options)=>{assert.equal(dir,path.join(workspace,'.pr356-codeql'));assert.equal(options.recursive,false);mkdirSync(dir,options);},appendFileSync:(file,...args)=>{assert.equal(file,env.GITHUB_ENV);return(requireFs()).appendFileSync(file,...args);}},'node:path':path,'node:assert/strict':assert};
  function requireFs(){return {appendFileSync:(file,data)=>writeFileSync(file,(existsSync(file)?readFileSync(file):Buffer.alloc(0))+data)};}
  vm.runInNewContext(codeqlWorkflowInline(language,'Bind controlled runner paths after runner allocation'),{require:name=>{assert(Object.hasOwn(builtins,name),'Unexpected binding import');return builtins[name];},process:{env}},{timeout:1000});
  for(const row of readFileSync(env.GITHUB_ENV,'utf8').trim().split('\n')){const split=row.indexOf('=');assert(split>0);env[row.slice(0,split)]=row.slice(split+1);}
  assert.equal(env.PR356_PHASE_SPEC,path.join(temp,'pr356/specs/codeql-'+language+'/phase-spec.json'));assert.equal(env.PR356_CODEQL_CONFIG,path.join(workspace,'.pr356-codeql',language+'.json'));assert(!path.relative(workspace,env.PR356_CODEQL_CONFIG).startsWith('..'));assert(readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8').includes('config-file: ./.pr356-codeql/'+language+'.json'));
  mkdirSync(path.dirname(env.PR356_PHASE_SPEC),{recursive:true});const config={name:'PR356 bounded security-extended',paths:['server-version/backend','server-version/frontend','.github/scripts']};writeFileSync(env.PR356_PHASE_SPEC,JSON.stringify({id:'codeql-'+language,inputs:{configuration:{codeql:config}}}));const specBefore=readFileSync(env.PR356_PHASE_SPEC);
  const script=codeqlWorkflowInline(language,'Write the frozen CodeQL configuration and producer identity');
  const fsOnly={readFileSync:(file,...args)=>{assert.equal(file,env.PR356_PHASE_SPEC,'Read only the bound phase spec');return readFileSync(file,...args);},writeFileSync:(file,...args)=>{assert.equal(file,env.PR356_CODEQL_CONFIG,'Write only the declared config');return writeFileSync(file,...args);},appendFileSync:(file,data)=>{assert.equal(file,env.GITHUB_OUTPUT,'Append only the declared output');return writeFileSync(file,(existsSync(file)?readFileSync(file):Buffer.alloc(0))+data);}};
  const run=()=>vm.runInNewContext(script,{require:name=>{assert.equal(name,'node:fs');return fsOnly;},process:{env}},{timeout:1000});run();
  assert.deepEqual(readFileSync(env.PR356_PHASE_SPEC),specBefore);assert.equal(readFileSync(env.PR356_CODEQL_CONFIG,'utf8'),JSON.stringify(config,null,2)+'\n');
  const observed=Object.fromEntries(readFileSync(env.GITHUB_OUTPUT,'utf8').trim().split('\n').map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
  assert.deepEqual(observed,{artifact_name:'pr356-codeql-'+language+'-40100000001-2',producer_run:'40100000001',producer_head:HEAD,producer_attempt:'2'});
  const outputBefore=readFileSync(env.GITHUB_OUTPUT),configBefore=readFileSync(env.PR356_CODEQL_CONFIG);assert.throws(run,error=>error.code==='EEXIST');assert.deepEqual(readFileSync(env.GITHUB_OUTPUT),outputBefore);assert.deepEqual(readFileSync(env.PR356_CODEQL_CONFIG),configBefore);
 }finally{rmSync(temp,{recursive:true,force:true});}
});

test('real starting-pack shape retains suite helpers and selects only the query-local dependency closure',()=>{
 const f=fixture();try{
  const vendor=path.join(f.packRoot,'.codeql/libraries/codeql/util/1.0.0');f.put(path.join(vendor,'qlpack.yml'),'name: codeql/util\nversion: 1.0.0\nlibrary: true\n');f.put(path.join(vendor,'Library.qll'),'// synthetic local library\n');
  const response=value=>({status:0,signal:null,stdout:Buffer.from(JSON.stringify(value)),stderr:Buffer.alloc(0)});
  f.responses['resolve qlpacks --format=json']=response({'codeql/javascript-queries':[f.packRoot],'codeql/util':[f.libraryRoot,vendor]});
  f.responses['resolve queries --format=startingpacks codeql/javascript-queries:codeql-suites/javascript-security-extended.qls']=response([f.packRoot,vendor]);
  const state=f.collector().begin('javascript-typescript');assert.equal(state.status,'begun');const saved=JSON.parse(readFileSync(path.join(f.env.PR356_EVIDENCE_DIR,'begin-state.json')));assert.equal(saved.selectedPacks.find(p=>p.name==='codeql/util').root,vendor);assert.equal(saved.selectedPacks.length,2);
 }finally{f.clean();}
 const bad=fixture();try{bad.responses['resolve queries --format=startingpacks codeql/javascript-queries:codeql-suites/javascript-security-extended.qls']={status:0,signal:null,stdout:Buffer.from(JSON.stringify([bad.packRoot,bad.packRoot])),stderr:Buffer.alloc(0)};assert.throws(()=>bad.collector().begin('javascript-typescript'),/DUPLICATE_STARTING_PACK/);}finally{bad.clean();}
});

test('native CodeQL SARIF uses finalized database language and exact pack build identity, not an invented required hint',()=>{
 for(const kind of ['valid','wrong-hint','wrong-build','wrong-database']){const f=fixture();try{
  const build='a'.repeat(40),pack=path.join(f.packRoot,'qlpack.yml');f.put(pack,readFileSync(pack,'utf8')+'buildMetadata:\n  sha: '+build+'\n');
  delete f.sarif.runs[0].properties['semmle.sourceLanguage'];f.sarif.runs[0].tool.extensions[0].semanticVersion='1.2.3+'+build;
  if(kind==='wrong-hint')f.sarif.runs[0].properties['semmle.sourceLanguage']='python';
  if(kind==='wrong-build')f.sarif.runs[0].tool.extensions[0].semanticVersion='1.2.3+'+'b'.repeat(40);
  if(kind==='wrong-database')f.put(path.join(f.database,'codeql-database.yml'),'primaryLanguage: python\ncreationMetadata:\n  cliVersion: '+VERSION+'\n');
  f.put(f.sarifFile,f.sarif);f.collector().begin('javascript-typescript');
  if(kind==='valid')assert.equal(f.collector().finish('javascript-typescript').status,'success');
  else assert.throws(()=>f.collector().finish('javascript-typescript'),/SARIF_LANGUAGE|SARIF_QUERY_PACK_IDENTITY|ACTION_DATABASE_LANGUAGE/);
 }finally{f.clean();}}
});
