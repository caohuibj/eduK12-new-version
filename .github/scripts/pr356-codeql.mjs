import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,writeFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {assertPhaseInputs,canonicalSHA256,REPOSITORY} from './pr356-plan.mjs';
import {sha256,sarifIdentity,validateSarifEvidence} from './pr356-sarif.mjs';

export const CODEQL_CASES=Object.freeze({'javascript-typescript':['javascript-typescript-complete-security-extended'],python:['python-complete-security-extended']});
const SOURCE={'javascript-typescript':'javascript',python:'python'},FILE=fileURLToPath(import.meta.url);
const TOOL_STEPS=Object.freeze({init:{id:'codeql-init',name:'initialize CodeQL',uses:'github/codeql-action/init@v3'},analyze:{id:'codeql-analyze',name:'analyze with CodeQL',uses:'github/codeql-action/analyze@v3'}});
const need=(value,message)=>assert(value,'PR356_CODEQL_'+message);
const equal=(a,b,message)=>need(canonicalSHA256(a)===canonicalSHA256(b),message);
const parse=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const iso=()=>new Date().toISOString();
function regular(filename){need(path.isAbsolute(filename),'ABSOLUTE_PATH');let current=path.parse(filename).root;for(const part of filename.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);need(!lstatSync(current).isSymbolicLink(),'SYMLINK_PATH');}need(lstatSync(filename).isFile(),'REGULAR_FILE');return readFileSync(filename);}
function below(filename,root){const p=path.resolve(filename),r=path.resolve(root);need(p!==r&&p.startsWith(r+path.sep),'RUNNER_TEMP_PATH');let current=r;need(!lstatSync(r).isSymbolicLink(),'RUNNER_TEMP_SYMLINK');for(const part of path.relative(r,p).split(path.sep)){current=path.join(current,part);if(existsSync(current))need(!lstatSync(current).isSymbolicLink(),'RUNNER_TEMP_SYMLINK');}return p;}
function inventory(root){
  const files=[];
  const visit=(dir,prefix='')=>{need(!lstatSync(dir).isSymbolicLink(),'INVENTORY_SYMLINK');for(const name of readdirSync(dir).sort()){const file=path.join(dir,name),relative=prefix+name,stat=lstatSync(file);need(!/[\\\x00-\x1f]/.test(relative),'INVENTORY_PATH');need(!stat.isSymbolicLink(),'INVENTORY_SYMLINK');if(stat.isDirectory())visit(file,relative+'/');else{need(stat.isFile(),'INVENTORY_SPECIAL_FILE');const bytes=readFileSync(file);files.push({path:relative,sha256:sha256(bytes),bytes:bytes.length});}}};
  visit(root);need(files.length>0,'EMPTY_INVENTORY');return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function scalar(value){value=value.trim();if(value.startsWith('"'))return JSON.parse(value);if(value.startsWith("'")){need(value.endsWith("'"),'PACK_YAML_SCALAR');return value.slice(1,-1).replaceAll("''", "'");}return value.replace(/\s+#.*$/,'').trim();}
function packHeader(root){
  const raw=regular(path.join(root,'qlpack.yml')).toString('utf8'),field=name=>{const match=new RegExp('^'+name+':\\s*(.+)$','m').exec(raw);need(match,'PACK_'+name);return scalar(match[1]);};
  const name=field('name'),version=field('version');need(/^[\w.-]+\/[\w.-]+$/.test(name)&&/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version),'PACK_IDENTITY');
  const dependencies=[];let inDependencies=false;
  for(const line of raw.split(/\r?\n/)){
    if(/^dependencies:/.test(line)){need(/^dependencies:\s*(?:\{\})?\s*$/.test(line),'UNSUPPORTED_PACK_DEPENDENCIES');inDependencies=true;continue;}
    if(inDependencies&&/^\S/.test(line))break;
    if(!inDependencies||!line.trim()||line.trim().startsWith('#'))continue;
    const match=/^  ([\w.-]+\/[\w.-]+):\s*(.+)$/.exec(line);need(match,'UNSUPPORTED_PACK_DEPENDENCIES');dependencies.push({name:match[1],version:scalar(match[2])});
  }
  const buildBlock=/^buildMetadata:\s*\n((?:[ \t].*\n)*)/m.exec(raw),buildSHA=buildBlock?/^  sha:\s*([a-f0-9]{40})\s*$/m.exec(buildBlock[1])?.[1]:undefined;need(!buildBlock||buildSHA,'PACK_BUILD_METADATA');
  return {name,version,dependencies,...(buildSHA?{buildSHA}:{} )};
}
// Resolve the actual compiled query pack and its vendored dependency closure.
// startingpacks includes suite helpers; it is not a singleton query-pack API.
export function resolveActualQueryPacks(sourceLanguage,queries,starts,resolved){
  need(Array.isArray(queries)&&queries.length>0&&Array.isArray(starts)&&starts.length>0,'ACTUAL_RESOLUTION');
  const roots=starts.map(p=>realpathSync(p));need(new Set(roots).size===roots.length,'DUPLICATE_STARTING_PACK');
  const directRoots=roots.filter(p=>packHeader(p).name==='codeql/'+sourceLanguage+'-queries');need(directRoots.length===1,'DIRECT_QUERY_PACK');
  const directRoot=directRoots[0],direct=packHeader(directRoot);
  need(Array.isArray(resolved[direct.name])&&resolved[direct.name].some(p=>realpathSync(p)===directRoot),'STARTING_PACK_RESOLUTION');
  const selected=new Map();
  function select(packRoot){
    const real=realpathSync(packRoot),header=packHeader(real);if(selected.has(header.name)){need(selected.get(header.name).root===real,'PACK_RESOLUTION_AMBIGUOUS');return;}
    selected.set(header.name,{...header,root:real});
    for(const dependency of header.dependencies){
      const candidates=resolved[dependency.name];need(Array.isArray(candidates)&&candidates.length>0,'DEPENDENCY_RESOLUTION');
      const matching=[...new Set(candidates.map(p=>realpathSync(p)))].filter(p=>{const h=packHeader(p);return h.name===dependency.name&&(dependency.version==='*'||h.version===dependency.version);});
      const vendored=matching.filter(p=>p.startsWith(path.join(directRoot,'.codeql','libraries')+path.sep));
      const applicable=vendored.length?vendored:matching;need(applicable.length===1,'DEPENDENCY_RESOLUTION_AMBIGUOUS');select(applicable[0]);
    }
  }
  select(directRoot);
  need(roots.every(p=>[...selected.values()].some(v=>v.root===p)),'STARTING_PACK_OUTSIDE_CLOSURE');
  for(const query of queries){need(typeof query==='string'&&query.endsWith('.ql'),'QUERY_PATH');const real=realpathSync(query);need(real.startsWith(directRoot+path.sep),'QUERY_OUTSIDE_SELECTED_PACK');regular(real);}
  return {directRoot,selected};
}
const defaultExecutor=(command,options)=>spawnSync(command[0],command.slice(1),{cwd:options.cwd,env:options.env,encoding:null,maxBuffer:64*1024*1024,timeout:60000});

export function createCodeqlCollector({env=process.env,cwd=env.GITHUB_WORKSPACE||process.cwd(),execute=defaultExecutor}={}){
  const root=path.resolve(cwd),temp=path.resolve(env.RUNNER_TEMP||'');need(env.RUNNER_TEMP&&lstatSync(temp).isDirectory(),'RUNNER_TEMP');
  const out=below(env.PR356_EVIDENCE_DIR||'',temp);need(env.PR356_EVIDENCE_DIR,'EVIDENCE_DIR');
  function context(language,mode){
    need(CODEQL_CASES[language],'LANGUAGE');const phase='codeql-'+language;
    need(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===REPOSITORY&&env.GITHUB_JOB==='pr356-'+phase,'OFFICIAL_PRODUCER_CONTEXT');
    need(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')&&/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID||'')&&/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT||''),'PRODUCER_IDENTITY');
    const specPath=below(env.PR356_PHASE_SPEC||'',temp),inputsPath=below(env.PR356_PHASE_INPUTS||'',temp),specBytes=regular(specPath),inputBytes=regular(inputsPath),spec=parse(specBytes),inputs=parse(inputBytes);
    assertPhaseInputs(inputs);equal(spec.inputs,inputs,'PHASE_INPUTS');need(spec.inputsSHA256===canonicalSHA256(inputs)&&spec.id===phase&&spec.jobName==='pr356-'+phase&&spec.language===language,'PHASE_SPEC');equal(spec.caseIds,CODEQL_CASES[language],'CASE_IDS');
    const settings=inputs.tools.codeql;need(settings?.queries==='security-extended','SECURITY_EXTENDED_REQUIRED');equal(settings.init,TOOL_STEPS.init,'INIT_STEP_SPEC');equal(settings.analyze,TOOL_STEPS.analyze,'ANALYZE_STEP_SPEC');
    const configPath=path.resolve(env.PR356_CODEQL_CONFIG||'');need(env.PR356_CODEQL_CONFIG,'CONFIG_PATH');const configBytes=regular(configPath);equal(parse(configBytes),inputs.configuration.codeql,'CONFIG_INPUT');
    need(inputs.configuration.codeql?.name==='PR356 bounded security-extended','CONFIG_NAME');equal(inputs.configuration.codeql.paths,['server-version/backend','server-version/frontend','.github/scripts'],'CONFIG_PATHS');need(inputs.configuration.codeql.queries===undefined,'CONFIG_QUERY_OVERRIDE');
    if(existsSync(out)){need(lstatSync(out).isDirectory()&&!lstatSync(out).isSymbolicLink(),'OUTPUT_DIRECTORY');need(!existsSync(path.join(out,'phase-receipt.json')),'PHASE_ALREADY_FINISHED');}
    const c={language,phase,root,out,inputs,spec,settings,configBytes,specBytes,inputBytes,source:{repository:REPOSITORY,runId:env.GITHUB_RUN_ID,head:env.GITHUB_SHA,producerAttempt:Number(env.GITHUB_RUN_ATTEMPT)}};
    if(mode==='begin')need(!existsSync(path.join(out,'begin-state.json')),'PHASE_ALREADY_BEGUN');
    return c;
  }
  function raw(command){const r=execute(command,{cwd:root,env});need(r.status===0&&!r.signal&&!r.error,'READ_COMMAND_FAILED');return Buffer.from(r.stdout??'');}
  function sourceManifest(c){
    need(raw(['git','rev-parse','HEAD']).toString().trim()===c.source.head,'CHECKOUT_HEAD');const sourceTree=raw(['git','rev-parse','HEAD^{tree}']).toString().trim();need(/^[a-f0-9]{40}$/.test(sourceTree),'CHECKOUT_TREE');
    const files=c.inputs.files.map(f=>{const file=path.join(root,f.path),bytes=regular(file),blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');need(blob===f.blob,'SOURCE_BLOB_DRIFT:'+f.path);need((lstatSync(file).mode&0o111? '100755':'100644')===f.mode,'SOURCE_MODE_DRIFT');return {...f,sha256:sha256(bytes)};});
    return {sourceHead:c.source.head,sourceTree,phaseInputsSHA256:c.spec.inputsSHA256,files};
  }
  function save(name,bytes){need(!name.startsWith('/')&&!name.split('/').some(p=>!p||p==='.'||p==='..')&&!name.includes('\\'),'OUTPUT_PATH');const file=path.join(out,name);mkdirSync(path.dirname(file),{recursive:true});const data=Buffer.isBuffer(bytes)?bytes:Buffer.from(typeof bytes==='string'?bytes:JSON.stringify(bytes,null,2)+'\n');if(existsSync(file))need(regular(file).equals(data),'OUTPUT_OVERWRITE:'+name);else writeFileSync(file,data,{flag:'wx'});return {path:name,sha256:sha256(data)};}
  function event(value){appendFileSync(path.join(out,'collector.log'),JSON.stringify({at:iso(),...value})+'\n');}
  function capture(name,command){
    const startedAt=iso(),r=execute(command,{cwd:root,env}),endedAt=iso(),stdout=Buffer.from(r.stdout??''),stderr=Buffer.from(r.stderr??'');
    const stdoutDescriptor=save('metadata/'+name+'.json',stdout),log=save('metadata/'+name+'.log',Buffer.concat([stdout,stderr]));
    const record={name,command,status:r.error||r.signal?'failed':'completed',exitCode:r.status??null,signal:r.signal??null,truncated:!!r.error,startedAt,endedAt,stdout:stdoutDescriptor,log};save('metadata/'+name+'-execution.json',record);event({kind:'metadata-command',...record});need(r.status===0&&!r.signal&&!r.error,'METADATA_COMMAND_FAILED:'+name);return record;
  }
  function outputs(){return Object.fromEntries(inventory(out).filter(f=>f.path!=='phase-receipt.json').map(({path:p,...value})=>[p,value]));}
  function proof(c,state,status,error){
    event({kind:'collector-completed',status,...(error?{error:String(error.message||error)}:{})});
    const p={schemaVersion:1,kind:'pr356-phase-proof',phaseId:c.phase,status,source:c.source,inputs:c.inputs,inputsSHA256:c.spec.inputsSHA256,
      command:{argv:[process.execPath,FILE,'finish',c.language],cwd:root,exitCode:status==='success'?0:1,logSHA256:sha256(regular(path.join(out,'collector.log'))),startedAt:state?.startedAt||iso(),completedAt:iso()},
      checks:c.spec.caseIds.map(id=>({id,status:status==='success'?'passed':'failed'})),outputs:{files:outputs(),upstream:[],...(state?.expected?.sarif?{sarifEvidence:state.expected}:{}),...(state?.action?{codeqlActionSteps:state.action}:{}),executionProfile:'codeql-action-v3'},externalDotApprovalRequired:true,releaseAuthorized:false,...(error?{reason:error.message}:{})};
    save('phase-receipt.json',p);return p;
  }
  function begin(language){
    const c=context(language,'begin');mkdirSync(out,{recursive:true});
    const existing=existsSync(out)?readdirSync(out):[];need(existing.every(p=>['phase-spec.json','phase-inputs.json'].includes(p)),'OUTPUT_NOT_FRESH');
    const startedAt=iso();event({kind:'collector-begin',language});
    try{
      need(env.PR356_CODEQL_INIT_OUTCOME==='success','INIT_OUTCOME');const source=sourceManifest(c);
      const tool=realpathSync(env.PR356_CODEQL_PATH||'');need(path.basename(tool)==='codeql'&&lstatSync(tool).isFile(),'ACTUAL_CODEQL_PATH');const toolRoot=path.dirname(tool),sourceLanguage=SOURCE[language],selector='codeql/'+sourceLanguage+'-queries:codeql-suites/'+sourceLanguage+'-security-extended.qls';
      const installation=inventory(toolRoot),installationInventory=save('cli-installation.json',{schemaVersion:1,kind:'actual-installed-codeql-tree',files:installation});
      const records=[capture('version',[tool,'version','--format=json']),capture('resolve-packs',[tool,'resolve','qlpacks','--format=json']),capture('resolve-queries',[tool,'resolve','queries','--format=json',selector]),capture('starting-packs',[tool,'resolve','queries','--format=startingpacks',selector])];
      const version=parse(regular(path.join(out,records[0].stdout.path))).version,queries=parse(regular(path.join(out,records[2].stdout.path))),starts=parse(regular(path.join(out,records[3].stdout.path))),resolved=parse(regular(path.join(out,records[1].stdout.path)));
      need(typeof version==='string','ACTUAL_VERSION');
      const {directRoot,selected}=resolveActualQueryPacks(sourceLanguage,queries,starts,resolved);
      const packs=[...selected.values()].sort((a,b)=>a.name<b.name?-1:1).map((p,i)=>{const files=inventory(p.root),sarifSemanticVersion=p.buildSHA?p.version+'+'+p.buildSHA:p.version,descriptor=save('packs/'+i+'-inventory.json',{schemaVersion:1,name:p.name,version:p.version,sarifSemanticVersion,files});return {name:p.name,version:p.version,sarifSemanticVersion,treeSHA256:canonicalSHA256(files),inventory:descriptor};});
      const packPath='codeql-suites/'+sourceLanguage+'-security-extended.qls';
      const expected={schemaVersion:1,executionProfile:'codeql-action-v3',sourceHead:c.source.head,sourceTree:source.sourceTree,language,
        sourceInputs:save('source-inputs.json',source),config:save('codeql-config.json',c.configBytes),
        cli:{version,bundleKind:'installed-tree',bundleSHA256:canonicalSHA256(installation),installationInventory,versionOutput:records[0].stdout},queryPacks:packs,
        querySuite:{name:'security-extended',packPath,...save('security-extended.qls',regular(path.join(directRoot,packPath)))},resolvedPacks:records[1].stdout,resolvedQueries:records[2].stdout,startingPacks:records[3].stdout,
        commands:Object.fromEntries(records.map(r=>[r.name,r.command])),actionSteps:{init:c.settings.init,analyze:c.settings.analyze}};
      save('phase-spec.json',c.specBytes);save('phase-inputs.json',c.inputBytes);
      const state={schemaVersion:1,startedAt,source:c.source,sourceManifest:source,inputsSHA256:c.spec.inputsSHA256,specSHA256:sha256(c.specBytes),configSHA256:sha256(c.configBytes),toolRoot,tool,selectedPacks:[...selected.values()].map(p=>({root:p.root,name:p.name,version:p.version})),expected,metadataCommands:records,initOutcome:env.PR356_CODEQL_INIT_OUTCOME,payload:outputs()};
      save('begin-state.json',state);return {status:'begun',phaseId:c.phase,executionProfile:'codeql-action-v3',releaseAuthorized:false};
    }catch(error){proof(c,{startedAt},'failure',error);throw error;}
  }
  function finish(language){
    const c=context(language,'finish');need(existsSync(path.join(out,'begin-state.json')),'BEGIN_REQUIRED');const state=parse(regular(path.join(out,'begin-state.json')));
    try{
      equal(state.source,c.source,'SOURCE_IDENTITY_DRIFT');need(state.specSHA256===sha256(c.specBytes)&&state.inputsSHA256===c.spec.inputsSHA256&&state.configSHA256===sha256(c.configBytes),'FROZEN_CONTEXT_DRIFT');equal(state.sourceManifest,sourceManifest(c),'SOURCE_INPUT_DRIFT');
      const actualBefore=outputs();equal(Object.keys(actualBefore).sort(),[...Object.keys(state.payload),'begin-state.json'].sort(),'UNDECLARED_INTERMEDIATE_OUTPUT');for(const [p,file]of Object.entries(state.payload))equal(actualBefore[p],file,'INTERMEDIATE_OUTPUT_DRIFT');
      event({kind:'collector-finish',language});
      const sarifDirectory=path.resolve(env.PR356_CODEQL_SARIF_OUTPUT||'');need(env.PR356_CODEQL_SARIF_OUTPUT,'SARIF_OUTPUT_REQUIRED');const sarifBytes=regular(path.join(sarifDirectory,SOURCE[language]+'.sarif'));state.expected.sarif=save('results.sarif',sarifBytes);
      state.action={origin:'workflow-step-context-unverified',init:{...c.settings.init,outcome:env.PR356_CODEQL_INIT_OUTCOME??null},analyze:{...c.settings.analyze,outcome:env.PR356_CODEQL_ANALYZE_OUTCOME??null}};save('action-step-context.json',state.action);
      need(state.action.init.outcome==='success'&&state.action.analyze.outcome==='success','ACTION_OUTCOME');
      equal(canonicalSHA256(inventory(state.toolRoot)),state.expected.cli.bundleSHA256,'CLI_INSTALLATION_DRIFT');
      for(const p of state.selectedPacks){const expected=state.expected.queryPacks.find(q=>q.name===p.name);need(canonicalSHA256(inventory(p.root))===expected.treeSHA256,'QUERY_PACK_DRIFT');}
      const locations=JSON.parse(env.PR356_CODEQL_DB_LOCATIONS||'null'),database=locations?.[SOURCE[language]];need(typeof database==='string','DATABASE_LOCATION');const databasePath=below(database,temp);need(lstatSync(databasePath).isDirectory()&&!lstatSync(databasePath).isSymbolicLink(),'DATABASE_DIRECTORY');
      const info=capture('database-info',[state.tool,'resolve','database',databasePath,'--format=json']),databaseMetadata=save('codeql-database.yml',regular(path.join(databasePath,'codeql-database.yml')));
      state.metadataCommands.push(info);state.expected.commands['database-info']=info.command;
      const sarif=parse(sarifBytes),categories=[...new Set((sarif.runs??[]).map(r=>r.automationDetails?.id))];need(categories.length===1&&typeof categories[0]==='string'&&categories[0].length,'SARIF_CATEGORY');state.expected.category=categories[0];
      const receipt={schemaVersion:1,profile:'codeql-action-v3',complete:true,partial:false,identity:sarifIdentity(state.expected),sarifSHA256:state.expected.sarif.sha256,resolvedQueryCount:parse(regular(path.join(out,state.expected.resolvedQueries.path))).length,action:state.action,metadataCommands:state.metadataCommands,database:{info:info.stdout,metadata:databaseMetadata}};
      state.expected.analysis=save('analysis-receipt.json',receipt);
      const artifact={files:Object.fromEntries(inventory(out).map(f=>[f.path,regular(path.join(out,f.path))]))},summary=validateSarifEvidence(state.expected,artifact);
      save('sarif-summary.json',summary);save('analysis-bundle.json',state.expected);
      return proof(c,state,'success');
    }catch(error){proof(c,state,'failure',error);throw error;}
  }
  return {begin,finish};
}
export function main(args=process.argv.slice(2)){need(args.length===2&&['begin','finish'].includes(args[0]),'USAGE');const collector=createCodeqlCollector();const result=collector[args[0]](args[1]);console.log(JSON.stringify(result.kind==='pr356-phase-proof'?{status:result.status,phaseId:result.phaseId,proofPath:path.join(process.env.PR356_EVIDENCE_DIR,'phase-receipt.json'),releaseAuthorized:false}:result));}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
