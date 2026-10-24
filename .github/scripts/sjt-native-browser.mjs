// Real candidate dist + real Chrome decoder. API responses are synthetic UI
// contracts, not browser-to-database authorization or scientific package admission.
// No build, backend, database, Image/decode mock or second application is created.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const dist=resolve(process.env.FRONTEND_DIST||resolve(root,'server-version/frontend/dist'));
const evidence=resolve(process.env.SJT_NATIVE_EVIDENCE||resolve(root,'sjt-native-evidence'));
const require=createRequire(new URL('../release-tools/package.json',import.meta.url));
const {chromium}=require('playwright-core');
const playwrightVersion=require('playwright-core/package.json').version;
assert.equal(playwrightVersion,require('./package.json').dependencies['playwright-core']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const date='2026-10-24T00:00:00.000Z';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQSl0FAAGuASIgVC/fAAAAAElFTkSuQmCC','base64');
const bad=Buffer.from('HTTP 200 image/png, deliberately not a PNG');
const parent='11111111-1111-4111-8111-111111111111',child='22222222-2222-4222-8222-222222222222';
const imageIds=['55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
const publicId='33333333-3333-4333-8333-333333333333',item='44444444-4444-4444-8444-444444444444',credential='p'.repeat(43);
const fixture=()=>({attemptId:child,attempt:{id:child,instrumentKey:'synthetic-decoder',instrumentVersion:'1.0.0',attemptNo:1,
  status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,progress:0,
  definitionHash:'a'.repeat(64),compiledRuntimeHash:'b'.repeat(64),scorerKey:'situational.default',scoringVersion:'synthetic',
  submissionId:null,submissionPayloadHash:null,submittedAt:null,startedAt:date,completedAt:null,totalTime:null,createdAt:date,updatedAt:date},
  instrument:{key:'synthetic-decoder',version:'1.0.0',releaseStatus:'PUBLISHED',scienceMaturity:'PILOT',
    definitionHash:'a'.repeat(64),compiledRuntimeHash:'b'.repeat(64),scorerKey:'situational.default',scoringVersion:'synthetic',frozenAt:date,sampling:{strategy:'ALL'},
    definition:{schemaVersion:2,respondentType:'synthetic',sampling:{strategy:'BRANCH_REACHABLE'},
      scenes:[1,2].map(n=>({sceneKey:`S${n}`,title:`合成情境 ${n}`,sortOrder:n-1,
        stimulus:{type:'IMAGE',asset:{assetId:imageIds[n-1],contentHash:hash(png),mimeType:'image/png'},altText:`合成图片 ${n}`},
        channels:[{channelKey:'choice',responseType:'SINGLE_CHOICE',prompt:'选择合成行动',options:[{optionKey:'A',label:`情境 ${n} 选择 A`},{optionKey:'B',label:`情境 ${n} 选择 B`}]}]})),
      flow:{strategy:'BRANCHING_DAG_V1',entryNodeKey:'node-1',nodes:[...[1,2].map(n=>({nodeType:'SCENE',nodeKey:`node-${n}`,sceneKey:`S${n}`,motherSceneKey:'M',roundKey:'R',stepKey:`step-${n}`,
        responseStages:[{stageKey:'choice',kind:'CHOICE',channelKeys:['choice']}],transition:{type:'NEXT',nextNodeKey:n===1?'node-2':'terminal'}})),{nodeType:'TERMINAL',nodeKey:'terminal'}]}},
    assignment:{assignmentVersion:'all-administered-v1',assignmentIdentity:'c'.repeat(64),seedIdentity:'d'.repeat(64),selections:[]},
    report:{reportVersion:'v1',primaryMetricKeys:['metric'],metricOrder:['metric'],interpretations:[],limitations:[],disclaimer:'Synthetic only'},
    referencePolicy:{type:'none'},runtimeCapabilities:{standalone:false,embedded:true,aggregateEligible:true,collectionFacts:true,supported:true}}});
await mkdir(evidence,{recursive:true});
const manifest=await Promise.all((await readdir(dist,{recursive:true,withFileTypes:true})).filter(f=>f.isFile()).map(async f=>{
  const path=resolve(f.parentPath,f.name),bytes=await readFile(path);return {path:relative(dist,path).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)};
}));
manifest.sort((a,b)=>a.path.localeCompare(b.path));
assert(manifest.some(f=>f.path==='index.html'),'Actual candidate dist required');
assert(manifest.some(f=>/^assets\/SituationalRunner-.*\.js$/.test(f.path)),'Shared built Runner chunk required');
await writeFile(resolve(evidence,'dist-manifest.json'),JSON.stringify(manifest,null,2));
const sourceFiles=execFileSync('git',['ls-files','-z','--','server-version/frontend'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).sort();
const sourceManifest=await Promise.all(sourceFiles.map(async path=>({path,sha256:hash(await readFile(resolve(root,path)))})));
await writeFile(resolve(evidence,'component-source-manifest.json'),JSON.stringify(sourceManifest,null,2));
const report={status:'RUNNING',startedAt:new Date().toISOString(),sourceSha:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),
  frontendGitTree:git('rev-parse','HEAD:server-version/frontend'),harnessSha256:hash(await readFile(fileURLToPath(import.meta.url))),
  distManifestSha256:hash(JSON.stringify(manifest)),componentManifestSha256:hash(JSON.stringify(sourceManifest)),playwrightVersion,nodeVersion:process.version,
  chromiumSandbox:true,syntheticApi:true,requiredScenarios:['training-native-decode','survey-native-decode'],scenarios:[],
  limitations:['Built host UI and actual Chromium decoder only. API is synthetic, not browser-to-database authorization.',
    'Backend private-media, grants and frozen scientific acceptance use separate PostgreSQL evidence; this fixture is not a publishable scientific package.',
    'No production access, real participant data, mobile Safari or performance benchmark.']};
const persist=()=>writeFile(resolve(evidence,'browser.json'),JSON.stringify(report,null,2));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(dist,'.'+path);
  assert(file===dist||file.startsWith(dist+sep));try{assert((await stat(file)).isFile());}catch{if(extname(path)){res.writeHead(404).end();return;}file=resolve(dist,'index.html');}
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
}catch{res.writeHead(400).end();}});
let browser;
const deadline=setTimeout(()=>{report.status='TIMEOUT';void persist();server.closeAllConnections();void browser?.close();process.exitCode=1;},180000);
const tick=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
async function exposure(page){return page.evaluate(async()=>{
  const databases=await indexedDB.databases();if(!databases.some(d=>d.name==='eduk12-final-drafts-v1'))return [];
  const db=await new Promise((yes,no)=>{const r=indexedDB.open('eduk12-final-drafts-v1');r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});
  try{return await new Promise((yes,no)=>{const r=db.transaction('draftTrials','readonly').objectStore('draftTrials').getAll();r.onerror=()=>no(r.error);
    r.onsuccess=()=>yes(r.result.flatMap(row=>row.payload?.events??[row.payload]).filter(e=>e?.type==='NODE_EXPOSED'));});}finally{db.close();}
});}
const until=async(fn,message)=>{const end=Date.now()+12000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,25));}throw Error(message);};
async function scenario(host,local){
  const origin=host==='training'?'https://training.eduk12.top':'https://survey.eduk12.top';
  const result={name:host+'-native-decode',status:'RUNNING',checks:[],requests:[],errors:[],consoleErrors:[],unexpected:[]};report.scenarios.push(result);await persist();
  const context=await browser.newContext({serviceWorkers:'block',locale:'zh-CN',timezoneId:'UTC',viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  const held=[];let firstReads=0,secondReads=0;
  const defer=()=>{let release;const promise=new Promise(r=>{release=r;});const gate={promise,release};held.push(gate);return gate;};
  const oldSecond=defer(),newFirst=defer();
  await context.addInitScript(({parent,publicId,credential})=>{
    sessionStorage.setItem(`composite:recovery:attempt:${parent}`,credential);
    sessionStorage.setItem(`huisurvey:v1:single:${publicId}`,JSON.stringify({attemptId:parent,accessCredential:credential,createdAt:Date.now()}));
    window.__sjtUrls={created:[],revoked:[]};
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);window.__sjtUrls.created.push(url);return url;};
    URL.revokeObjectURL=url=>{window.__sjtUrls.revoked.push(url);return revoke(url);};
  },{parent,publicId,credential});
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push({text:message.text(),url:message.location().url});});
  await context.routeWebSocket('**/*',socket=>{result.unexpected.push('Unexpected WebSocket '+socket.url());socket.close();});
  page.on('dialog',async d=>{result.unexpected.push('Unexpected dialog: '+d.message());await d.dismiss();});
  const json=data=>({status:200,contentType:'application/json',body:JSON.stringify({code:0,message:'ok',data})});
  const training=`/api/public/composite-assessments/attempts/${parent}/items/${item}/situational/${child}`;
  const survey=`/api/public/survey/r/${publicId}/attempts/${parent}/situational/native`;
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());try{
    assert.equal(url.origin,origin);assert(!req.url().includes(credential));
    if(!url.pathname.startsWith('/api/')){const res=await fetch(local+url.pathname+url.search);assert.equal(res.status,200);return route.fulfill({status:200,contentType:res.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await res.arrayBuffer())});}
    result.requests.push({method:req.method(),path:url.pathname});
    if(url.pathname==='/api/auth/me')return route.fulfill({...json(null),status:401});
    if(url.pathname==='/api/auth/csrf')return route.fulfill(json({csrfToken:'synthetic'}));
    if(url.pathname==='/api/capabilities')return route.fulfill(json({cognitive:false,parentPortal:false}));
    if(host==='survey'){
      if(url.pathname===`/api/public/survey/r/${publicId}/info`)return route.fulfill(json({project:{name:'Synthetic decoder study',description:'Synthetic only',collectionMode:'SINGLE_UNLINKED',status:'OPEN'},waves:[]}));
      assert.equal(req.method(),'POST');assert.equal(req.postDataJSON().accessCredential,credential);
      if(url.pathname===`/api/public/survey/r/${publicId}/attempts/${parent}/task`)return route.fulfill(json({attemptId:parent,waveId:'wave',status:'STARTED',definitionDigest:'e'.repeat(64),reportMode:'GENERAL_ONLY',
        units:[{kind:'SJT',instrumentKey:'native',title:'合成共享情境任务',executionProtocol:'SITUATIONAL_NATIVE_V1'}]}));
      if(url.pathname===survey+'/start'||url.pathname===survey+`/${child}/read`)return route.fulfill(json(fixture()));
    }else{assert.equal(req.headers()['x-recovery-token'],credential);if(url.pathname===training)return route.fulfill(json(fixture()));}
    const imageIndex=imageIds.findIndex(id=>url.pathname===(host==='training'?training+`/assets/${id}/content`:survey+`/${child}/images/${id}`));
    const image=imageIndex>=0?imageIds[imageIndex]:null;
    assert(image,'Unexpected API '+req.method()+' '+url.pathname);
    const n=image===imageIds[0]?++firstReads:++secondReads;
    if(image===imageIds[0]&&n===1)return route.fulfill({status:200,contentType:'image/png',body:bad});
    if(image===imageIds[1]&&n===1)await oldSecond.promise;
    if(image===imageIds[0]&&n===3)await newFirst.promise;
    await route.fulfill({status:200,contentType:'image/png',body:png});
  }catch(e){result.unexpected.push(String(e));await route.abort().catch(()=>{});}});
  const proof=async label=>{await tick(page);assert.deepEqual(result.errors,[]);assert.deepEqual(result.unexpected,[]);
    assert.deepEqual(result.consoleErrors.filter(e=>!(e.url.endsWith('/api/auth/me')&&/^Failed to load resource:/.test(e.text))),[],'Unexpected console error');
    const screenshot=result.name+'-'+label+'.png';await page.screenshot({path:resolve(evidence,screenshot),fullPage:true});result.checks.push({label,screenshot});await persist();};
  try{
    await page.goto(origin+(host==='training'?`/public/composite/situational/${child}?compositeAttemptId=${parent}&compositeItemId=${item}`:`/r/${publicId}`));
    if(host==='survey')await page.getByRole('button',{name:'恢复本次作答／查看已完成回执',exact:true}).click();
    await page.getByText('视觉内容加载失败，当前内容暂不能作答。',{exact:true}).waitFor();
    assert(await page.getByLabel('情境 1 选择 A',{exact:true}).isDisabled());assert(await page.getByRole('button',{name:'提交测评',exact:true}).isDisabled());
    assert.deepEqual(await exposure(page),[]);assert.equal(firstReads,1);
    const failedUrls=await page.evaluate(()=>window.__sjtUrls);assert(failedUrls.created.length>0);assert(failedUrls.created.every(u=>failedUrls.revoked.includes(u)));
    await proof('bad-200-zero-exposure-blocked');
    await page.getByRole('button',{name:'重试',exact:true}).click();
    const image=page.getByRole('img',{name:'合成图片 1',exact:true});await image.waitFor();
    await image.evaluate(async img=>{await img.decode();if(img.naturalWidth!==1||img.naturalHeight!==1)throw Error('Actual PNG decode failed');});
    await until(async()=>await page.getByLabel('情境 1 选择 A',{exact:true}).isEnabled(),'Decoded image did not enable choice');
    await until(async()=>(await exposure(page)).length===1,'Successful decode did not create exactly one exposure');
    assert.equal(firstReads,2);await proof('real-decode-retry-one-exposure');
    await page.getByLabel('情境 1 选择 A',{exact:true}).check();
    await page.getByRole('button',{name:'确认行动选择',exact:true}).click();
    await page.getByRole('button',{name:'下一题',exact:true}).click();
    await until(()=>secondReads===1,'Second image request missing');
    assert(await page.getByLabel('情境 2 选择 A',{exact:true}).isDisabled());
    await page.getByRole('button',{name:'上一题',exact:true}).click();
    await until(()=>firstReads===3,'Returning scene did not load new image generation');
    const beforeLate=await page.evaluate(()=>window.__sjtUrls.created.length);
    const lateResponse=page.waitForResponse(response=>response.url().includes(imageIds[1]));
    oldSecond.release();await (await lateResponse).finished();await tick(page);await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.__sjtUrls.created.length),beforeLate,'Disposed late fetch allocated a blob URL');
    assert(await page.getByRole('button',{name:'提交测评',exact:true}).isDisabled(),'Old image made new pending generation ready');
    assert(!(await exposure(page)).some(e=>e.nodeKey==='node-2'),'Unpresented late image emitted exposure');
    await proof('old-generation-cannot-unlock-current');
    newFirst.release();await image.waitFor();await image.evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw Error('Return image not decoded');});
    await until(async()=>!(await page.getByRole('button',{name:'提交测评',exact:true}).isDisabled()),'Current decoded generation stayed blocked');
    assert.equal((await exposure(page)).filter(e=>e.nodeKey==='node-1').length,1,'Returning scene duplicated same-history exposure');
    const urls=await page.evaluate(()=>window.__sjtUrls);assert.equal(urls.created.filter(u=>!urls.revoked.includes(u)).length,1,'Old object URLs leaked or current URL prematurely revoked');
    assert(!result.requests.some(r=>/\/(submit|final)$/.test(r.path)),'Harness must not manufacture accepted scientific facts');
    await proof('current-generation-only-url-live');result.status='PASS';
  }catch(e){result.status='FAIL';result.failure=e.stack||String(e);await page.screenshot({path:resolve(evidence,result.name+'-failure.png'),fullPage:true}).catch(()=>{});throw e;}
  finally{held.forEach(g=>g.release());await context.close();await persist();}
}
try{
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,chromiumSandbox:true});
  report.browserVersion=browser.version();const local=`http://127.0.0.1:${server.address().port}`;
  for(const host of ['training','survey'])await scenario(host,local);
  assert.deepEqual(report.scenarios.map(s=>s.name),report.requiredScenarios);assert(report.scenarios.every(s=>s.status==='PASS'));report.status='PASS';
}catch(e){report.status=report.status==='TIMEOUT'?'TIMEOUT':'FAIL';report.failure=e.stack||String(e);process.exitCode=1;console.error(e);}
finally{clearTimeout(deadline);await browser?.close();server.closeAllConnections();if(server.listening)await new Promise(done=>server.close(done));report.finishedAt=new Date().toISOString();await persist();}
