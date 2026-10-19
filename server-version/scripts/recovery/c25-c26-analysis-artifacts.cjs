'use strict'
/** Fixed A/B analysis artifacts. Inert until explicitly selected. This is not
 * the historical producer validator and never changes a recovery descriptor. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {createHash}=require('node:crypto'),{createRequire,isBuiltin}=require('node:module')
const ROOT='/workspace/scratch/5a77e8bdc1ae',REPO=ROOT+'/eduk12_c22_20261019',BACKEND=REPO+'/server-version/backend'
const PINS=Object.freeze({
 anchor:{path:'/tmp/c25-c26-analysis-b-prepare-01/a-immutable-binding.json',sha256:'673e59f74323ec1041e0eaecf0c4a30de07a15efdd1f14bae6d9ddbee258554e'},
 producer:{path:ROOT+'/c25-build-evidence/backend-b-01/backend-build.receipt.json',sha256:'a95ec66b06b4857558c1d370493e4fcb35c199209e8d26b5d3d96620b335659b'},
 inventory:{path:ROOT+'/c25-build-evidence/backend-b-01/dist-inventory.json',sha256:'d2083bef0bbee732dab92349e93253a41525065b161433d82b0e28ede7a01773'},
 recovery:{path:ROOT+'/c25-build-evidence/c26-analysis-recovery-01/recovery-descriptor.json',sha256:'b2d78a9adaa3b24ccbfd035a9cc6a0cb322368474d041c6bbc42e55a497e0756'},
 dependencies:{path:ROOT+'/c25-build-evidence/backend-01/backend-build.receipt.json',sha256:'ffca85332844b7f9caeac3252119e1354c498e9de11e757c5763e525d2bf8d95'},
})
const A_HEAD='c41cabef47b2f933800d638e5bad3fa3ab5e110d',B_HEAD='394731e684dcaa99070b609f052d16c849aa3204'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
function checked(file,expected){
 assert.equal(path.resolve(file),file);assert.equal(fs.realpathSync(file),file)
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
 try{const before=fs.fstatSync(fd);assert.ok(before.isFile());assert.equal(before.nlink,1)
  const bytes=fs.readFileSync(fd),after=fs.fstatSync(fd);assert.equal(hash(bytes),expected,'artifact/evidence bytes changed')
  for(const key of ['dev','ino','size','mtimeMs','ctimeMs','nlink','mode'])assert.equal(after[key],before[key],'artifact changed while read')
  return bytes
 }finally{fs.closeSync(fd)}
}
const readPin=name=>JSON.parse(checked(PINS[name].path,PINS[name].sha256))
function selectAnalysisArtifact(arm,{full=false}={}){
 assert.ok(arm==='A'||arm==='B','only the two fixed analysis arms')
 const anchor=readPin('anchor'),producer=readPin('producer'),inventory=readPin('inventory'),recovery=readPin('recovery')
 assert.equal(anchor.head,A_HEAD);assert.equal(producer.head,B_HEAD)
 for(const key of ['passed','typeCheckPassed','emittingBuildPassed','AArtifactsUnchanged','allInputsBeforeAfterExact'])assert.equal(producer[key],true)
 assert.equal(producer.emitAttempts,1);assert.equal(producer.exitCode,0);assert.equal(producer.runtimeServicesStarted,false)
 assert.equal(producer.distInventory.sha256,PINS.inventory.sha256);assert.equal(producer.recovery.sha256,PINS.recovery.sha256)
 assert.equal(recovery.producer.BProductEmitted,false,'historical recovery identity must remain unchanged')
 const dist=arm==='A'?BACKEND+'/dist':ROOT+'/c25-build-evidence/backend-b-01/dist'
 const expected=arm==='A'?anchor.components.backend.actualDist:Object.fromEntries(Object.entries(inventory).filter(([key])=>key.startsWith('dist/')).map(([key,value])=>[key,value.sha256]))
 assert.equal(Object.keys(expected).length,5173)
 const critical=['index.js','config/database.js','config/databasePool.js','services/runtimeObservability.js','utils/logger.js','modules/training-analysis/core.js','modules/training-analysis/service.js','modules/training-analysis/manifest.js']
 for(const relative of full?Object.keys(expected).map(key=>key.slice(5)):critical){assert.ok(expected['dist/'+relative]);checked(path.join(dist,relative),expected['dist/'+relative])}
 if(full){const actual=[];function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);assert.ok(!entry.isSymbolicLink());if(entry.isDirectory())visit(p);else{assert.ok(entry.isFile());actual.push('dist/'+path.relative(dist,p))}}}visit(dist);assert.deepEqual(actual.sort(),Object.keys(expected).sort())}
 return Object.freeze({arm,dist,entry:dist+'/index.js',cwd:BACKEND,nodePath:BACKEND+'/node_modules',expected:Object.freeze(expected),
  inputIdentity:Object.freeze({AHead:A_HEAD,BProducerHead:B_HEAD,AAnchor:PINS.anchor,BProducer:PINS.producer,recovery:PINS.recovery,BProductEmittedInHistoricalRecovery:false}),
  probeBindings:Object.freeze(Object.fromEntries(['services/runtimeObservability.js','utils/logger.js','config/database.js','config/databasePool.js'].map(key=>['dist/'+key,expected['dist/'+key]])))})
}
function analysisArtifactEnvironment(arm,env){
 const selected=selectAnalysisArtifact(arm)
 assert.ok(!env.NODE_OPTIONS&&!env.C26_ANALYSIS_ARTIFACT_ARM,'caller cannot inject alternate preload/artifact')
 assert.ok(!env.NODE_PATH||env.NODE_PATH===selected.nodePath)
 for(const key of ['UPLOAD_DIR','EXPORT_DIR'])assert.equal(env[key],ROOT+'/eduk12_c25_http_01/'+(key==='UPLOAD_DIR'?'uploads':'exports'),'absolute common material root required')
 return {selected,env:{...env,NODE_PATH:selected.nodePath,NODE_DISABLE_COMPILE_CACHE:'1',C26_ANALYSIS_ARTIFACT_ARM:arm}}
}
/** Real Node resolution, not a cwd assumption. Does not import API/database. */
function analysisResolutionProof(selected){
 assert.equal(process.env.NODE_PATH,selected.nodePath,'explicit single dependency root required at process startup')
 const from=createRequire(selected.entry),original=createRequire(BACKEND+'/dist/index.js'),resolved={}
 // Original dependencies deliberately include previously verified package
 // symlinks into the C20 immutable install. Exact receipt realpath+SHA, not a
 // new directory-prefix allowance, is the authority for their resolution.
 const dependencyPins=new Map(Object.values(readPin('dependencies').dependencies).map(value=>[value.realpath,value.sha256]))
 const checkDependency=filename=>{const real=fs.realpathSync(filename);assert.ok(dependencyPins.has(real),'unbound dependency realpath');assert.equal(hash(fs.readFileSync(real)),dependencyPins.get(real),'dependency bytes drift');return real}
 for(const name of ['@prisma/client','express','zod','pg','ioredis','bull']){
  const actual=from.resolve(name),expected=original.resolve(name)
  assert.equal(actual,expected,`dependency split: ${name}`);checkDependency(actual)
  resolved[name]={path:actual,sha256:hash(fs.readFileSync(actual))}
 }
 for(const name of ['config/database.js','services/runtimeObservability.js','modules/training-analysis/core.js','modules/training-analysis/manifest.js'])assert.equal(from.resolve('./'+name),path.join(selected.dist,name))
 const consumer=createRequire(selected.dist+'/config/database.js')
 assert.equal(consumer.resolve('../services/runtimeObservability'),selected.dist+'/services/runtimeObservability.js')
 // Traverse only the emitted application's literal static require closure.
 // Resolution evaluates no API/Prisma/queue module. JSON resources are hashed
 // against the same artifact inventory, not found via a fallback to A.
 const seen=new Set(),json=[],bare=new Map(),pending=[selected.entry]
 while(pending.length){
  const filename=pending.pop();if(seen.has(filename))continue;seen.add(filename);assert.ok(seen.size<=4000)
  assert.ok(filename.startsWith(selected.dist+path.sep));const relative='dist/'+path.relative(selected.dist,filename)
  const bytes=checked(filename,selected.expected[relative])
  if(filename.endsWith('.json')){JSON.parse(bytes);json.push(relative);continue}
  assert.ok(filename.endsWith('.js'));const req=createRequire(filename)
  for(const match of bytes.toString().matchAll(/\brequire\(["']([^"']+)["']\)/g)){
   const name=match[1];if(isBuiltin(name))continue
   const target=req.resolve(name)
   if(name.startsWith('.')){assert.ok(target.startsWith(selected.dist+path.sep),'relative resource escaped selected artifact');pending.push(target)}
   else{const originalFrom=createRequire(BACKEND+'/'+relative);assert.equal(target,originalFrom.resolve(name),'static dependency resolution differs from A');checkDependency(target);bare.set(name,target)}
  }
 }
 return {arm:selected.arm,cwd:selected.cwd,dist:selected.dist,nodePath:selected.nodePath,dependencies:resolved,staticApplicationFiles:seen.size,jsonResources:json.sort(),staticBareDependencies:Object.fromEntries([...bare].sort()),consumerRuntimeSingletonPath:selected.dist+'/services/runtimeObservability.js',scope:'STATIC_LITERAL_REQUIRE_CLOSURE; DYNAMIC_IMPORTS_REMAIN_BOUND_BY_FULL_ARTIFACT',servicesStarted:false}
}
module.exports={PINS,A_HEAD,B_HEAD,BACKEND,selectAnalysisArtifact,analysisArtifactEnvironment,analysisResolutionProof,checked,hash}
