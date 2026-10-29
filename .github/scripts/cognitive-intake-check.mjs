import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readCognitiveIntakeDiff,cognitiveTaskRoot} from './cognitive-intake-scope.mjs';

const identity = id => `${id.testType}/${id.engineVersion}/${id.scoringVersion}`;
const tFor = file => file.slice(cognitiveTaskRoot.length).split('/')[0];
export function checkCognitiveDeclarations(root,selection,isDataModule) {
  for(const e of selection.entries) if(/^server-version\/backend\/src\/modules\/cognitive\/tasks\/[^/]+\/(seeds|participant-presentation|governance|scientific)\.ts$/.test(e.file))
    assert.ok(isDataModule(fs.readFileSync(path.join(root,e.file),'utf8')),'UNSAFE_DECLARATION:'+e.file);
}
const sameSet = (actual,expected,label) => {
  assert.ok(Array.isArray(actual),label);
  assert.equal(new Set(actual).size,actual.length,label+':duplicate');
  assert.deepEqual([...actual].sort(),[...expected].sort(),label);
};
const stages = (actual,names,label) => {
  sameSet(actual?.map(c=>c.name),names,label);
  for(const c of actual) assert.equal(c.status,'PASS',label+':'+c.name);
};
/** Exit zero alone, empty output, partial batches and old NDJSON cannot qualify. */
export function verifyCognitiveBatch(stdout, selection, packages) {
  const report=JSON.parse(stdout);
  assert.equal(report.schemaVersion,1); assert.equal(report.kind,'cognitive-onboarding-batch');
  assert.equal(report.selectionIsScopeEvidence,false); assert.equal(report.exitCode,0);
  sameSet(report.selectedTasks,selection.tasks,'selectedTasks');
  const selected=packages.filter(p=>selection.tasks.includes(p.task));
  const expected=selected.flatMap(p=>p.identities).map(identity);
  assert.ok(expected.length,'Nonempty identities required');
  sameSet(report.selectedIdentities?.map(identity),expected,'selectedIdentities');
  stages(report.checks,['manifest','dependencies','frontend-acceptance'],'batch checks');
  const acceptance=report.checks.find(c=>c.name==='frontend-acceptance').details;
  const suites=[...new Set(selected.flatMap(p=>p.acceptance.frontendSuites))];
  sameSet(acceptance?.suites,suites,'executed frontend suites');
  assert.equal(acceptance.count,suites.length,'frontend count');
  sameSet(report.identityResults?.map(r=>identity(r.identity)),expected,'identityResults');
  for(const r of report.identityResults) stages(r.checks,['contract','readiness','presentation','fixtures-scorer-report'],'identity '+identity(r.identity));
  sameSet(report.decisions?.map(d=>identity(d.identity)),expected,'decisions');
  for(const decision of report.decisions) {
    assert.equal(decision.technical?.ready,true,'technical gate'); assert.equal(decision.pilotPublish?.ready,true,'pilot gate');
    for(const gate of [decision.technical,decision.pilotPublish]) {
      assert.ok(Array.isArray(gate.blockers),'gate blockers');
      assert.ok(gate.blockers.every(b=>b.severity!=='ERROR'),'error blockers');
    }
  }
  return report;
}

/** Type-check real selected sources plus immediate runtime import consumers.
 * TypeScript resolves the full forward closure; no platform processes are run.
 * Save every consumed path and diagnostic, rather than filtering compiler errors.
 */
export function checkSelectedTypes(root, selection, output) {
  const require=createRequire(path.join(root,'server-version/backend/package.json'));
  const ts=require('typescript'), backend=path.join(root,'server-version/backend');
  const tracked=execFileSync('git',['ls-files','-z','--','server-version/backend/src'],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>/\.tsx?$/.test(f)&&!f.includes('/__tests__/'));
  const selected=tracked.filter(f=>selection.tasks.some(t=>f.startsWith(cognitiveTaskRoot+t+'/')) &&
    (selection.taskModes[tFor(f)]==='task'||selection.files.includes(f)));
  assert.ok(selected.length,'Missing selected type sources');
  const config=ts.readConfigFile(path.join(backend,'tsconfig.json'),ts.sys.readFile); assert.ok(!config.error,'Invalid backend tsconfig');
  const configFile=path.join(backend,'tsconfig.json');
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,backend,undefined,configFile); assert.equal(parsed.errors.length,0,'Invalid backend compiler options');
  // Match tsc -p's config-relative ambient type discovery, independent of cwd.
  const options={...parsed.options,noEmit:true,incremental:false,composite:false};
  const selectedSet=new Set(selected.map(f=>path.resolve(root,f)));
  const {dependencies}=require(path.join(root,'server-version/scripts/cognitive/dependencies.cjs'));
  const edges=[];
  for(const file of tracked) {
    const absolute=path.resolve(root,file);
    // Preprocessing only finds possible direct consumers; the existing audited
    // runtime parser decides real edges and rejects nonliteral imports in each
    // selected source/direct consumer. Type-only imports remain compiler-owned.
    const refs=ts.preProcessFile(fs.readFileSync(absolute,'utf8'),true,true).importedFiles;
    const resolveRef=ref=>ts.resolveModuleName(ref,absolute,options,ts.sys).resolvedModule?.resolvedFileName;
    if(!selectedSet.has(absolute)&&!refs.some(r=>selectedSet.has(resolveRef(r.fileName)))) continue;
    for(const ref of dependencies(absolute)) {
      const resolved=resolveRef(ref);
      assert.ok(resolved||!ref.startsWith('.'),'UNRESOLVED_SELECTED_DEPENDENCY:'+file+':'+ref);
      if(resolved) edges.push({from:file,to:path.relative(root,resolved).split(path.sep).join('/'),typeOnly:false});
    }
  }
  const consumers=[...new Set(edges.filter(e=>!e.typeOnly&&selectedSet.has(path.resolve(root,e.to))).map(e=>e.from))].sort();
  const roots=[...new Set([...selected,...consumers])].sort();
  const program=ts.createProgram(roots.map(f=>path.join(root,f)),options);
  const diagnostics=ts.getPreEmitDiagnostics(program);
  const trace={compilerVersion:ts.version,compilerConfig:path.relative(root,configFile),automaticTypes:ts.getAutomaticTypeDirectiveNames(options,ts.sys),roots,selectedSources:selected,consumers,edges:edges.filter(e=>roots.includes(e.from)||selected.includes(e.to)),
    closure:program.getSourceFiles().map(s=>path.relative(root,s.fileName).split(path.sep).join('/')).sort(),
    diagnostics:diagnostics.map(d=>({file:d.file?path.relative(root,d.file.fileName):null,start:d.start,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))};
  fs.writeFileSync(path.join(output,'selected-types.json'),JSON.stringify(trace,null,2)+'\n');
  fs.writeFileSync(path.join(output,'selected-types.log'),ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
  assert.equal(diagnostics.length,0,'SELECTED_TYPES_FAILED: see selected-types.log');
  return trace;
}

export async function runCognitiveIntake({root=process.cwd(),base=process.env.COGNITIVE_INTAKE_BASE_SHA,head=process.env.COGNITIVE_INTAKE_HEAD_SHA,output=process.env.COGNITIVE_INTAKE_REPORT_DIR||'/tmp/cognitive-intake'}={}) {
  const selection=readCognitiveIntakeDiff(base,head,{cwd:root});
  fs.mkdirSync(output,{recursive:true}); fs.writeFileSync(path.join(output,'scope.json'),JSON.stringify(selection,null,2)+'\n');
  assert.ok(selection.selected,selection.reason); assert.ok(!selection.requiresBrowser,selection.status);
  const require=createRequire(path.join(root,'server-version/backend/package.json'));
  // Import the existing AST guard only after exact Git planning and locked installation.
  const {isDataModule}=await import(pathToFileURL(path.join(root,'.github/scripts/cognitive-content.mjs')));
  checkCognitiveDeclarations(root,selection,isDataModule);
  const manifests=require(path.join(root,'server-version/scripts/cognitive/manifests.cjs'));
  // Discovery is structural; global manifest/dependency validation executes once in the child.
  const packages=manifests.discover();
  const command=[process.execPath,'--import',path.join(root,'server-version/backend/node_modules/tsx/dist/loader.mjs'),path.join(root,'server-version/backend/src/scripts/cognitive-onboarding-check.ts'),'--tasks',selection.tasks.join(','),'--json'];
  const env={...process.env,NODE_ENV:'test',COGNITIVE_MODULE_ENABLED:'true',VITE_COGNITIVE_MODULE_ENABLED:'true',BACKGROUND_WORKERS_ENABLED:'false',TZ:'UTC'};
  delete env.DATABASE_URL;
  fs.writeFileSync(path.join(output,'command.json'),JSON.stringify({command,base,head,tasks:selection.tasks,environment:{NODE_ENV:env.NODE_ENV,COGNITIVE_MODULE_ENABLED:env.COGNITIVE_MODULE_ENABLED,VITE_COGNITIVE_MODULE_ENABLED:env.VITE_COGNITIVE_MODULE_ENABLED,BACKGROUND_WORKERS_ENABLED:env.BACKGROUND_WORKERS_ENABLED,TZ:env.TZ,DATABASE_URL:'unset'}},null,2)+'\n');
  const child=spawnSync(command[0],command.slice(1),{cwd:root,env,encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024});
  fs.writeFileSync(path.join(output,'onboarding.json'),child.stdout||''); fs.writeFileSync(path.join(output,'onboarding.log'),child.stderr||'');
  fs.writeFileSync(path.join(output,'exit.json'),JSON.stringify({exitCode:child.status,signal:child.signal,error:child.error?.message})+'\n');
  if(child.stderr) process.stderr.write(child.stderr);
  assert.ok(!child.error,child.error?.message); assert.equal(child.status,0,'SELECTED_ONBOARDING_FAILED');
  const report=verifyCognitiveBatch(child.stdout,selection,packages);
  checkSelectedTypes(root,selection,output);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const report=await runCognitiveIntake();console.log(JSON.stringify({status:'PASS',selectedTasks:report.selectedTasks,selectedIdentities:report.selectedIdentities}));}
  catch(e) {console.error(e.stack||e.message);process.exitCode=1;}
}
