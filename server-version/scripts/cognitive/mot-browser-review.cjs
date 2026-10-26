const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.MOT_REVIEW_ROOT||path.resolve(__dirname,'../../..'),front=path.join(root,'server-version/frontend');
const temp=fs.mkdtempSync(path.join(front,'.mot-review-')),out=path.join(root,'docs/cognitive-library/implementation-20261026/runtime-evidence');
let server,browser;
(async()=>{
 try{
 fs.mkdirSync(temp,{recursive:true});fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(temp,'index.html'),'<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="./app.tsx"></script></body></html>');
 fs.writeFileSync(path.join(temp,'app.tsx'),`import React,{useMemo,useState} from 'react';import{createRoot}from'react-dom/client';
 import{MotTask}from'../src/modules/cognitive/tasks/mot/MotTask';
 import{MotReportCard}from'../src/modules/cognitive/tasks/mot/MotReportCard';
 import{createMotDraft}from'../src/modules/cognitive/tasks/mot/draft';
 import{motConfig,motTrialPlan,motPosition}from'../src/modules/cognitive/tasks/mot/generated/protocol';
 const query=new URLSearchParams(location.search),seed='browser-mot-contract',config=motConfig('experience');
 const state=query.get('state')||'interpretable',language=query.get('lang')==='en'?'en':'zh';
 const authoritySnapshot={
  "metrics": {
    "expectedTrialCount": 9,
    "receivedTrialCount": 9,
    "validTrialCount": 9,
    "excludedTrialCount": 0,
    "excludedTrialIndices": [],
    "excludedTrialReasons": {},
    "meanTargetsSpeed1": 5,
    "accuracySpeed1": 1,
    "validTrialsSpeed1": 3,
    "totalTrialsSpeed1": 3,
    "observedTrialsSpeed1": 3,
    "meanTargetsSpeed4": 5,
    "accuracySpeed4": 1,
    "validTrialsSpeed4": 3,
    "totalTrialsSpeed4": 3,
    "observedTrialsSpeed4": 3,
    "meanTargetsSpeed8": 5,
    "accuracySpeed8": 1,
    "validTrialsSpeed8": 3,
    "totalTrialsSpeed8": 3,
    "observedTrialsSpeed8": 3,
    "meanTrackedTargets": 5,
    "trackingAccuracy": 1
  },
  "quality": {
    "state": "interpretable",
    "flags": {
      "incompleteRecords": false,
      "unreliableSpeed1": false,
      "unreliableSpeed4": false,
      "unreliableSpeed8": false,
      "noInterpretableCondition": false
    },
    "reasons": []
  },
  "audit": {
    "trialCount": 9,
    "scorerVersion": "1.1.0"
  }
};
 const result={quality:{state,flags:{unreliableSpeed1:false,unreliableSpeed4:state!=='interpretable',unreliableSpeed8:false},reasons:[]},metrics:{meanTrackedTargets:3.4,meanTargetsSpeed1:4.2,meanTargetsSpeed4:3.4,meanTargetsSpeed8:2.6,validTrialsSpeed1:3,totalTrialsSpeed1:3,validTrialsSpeed4:3,totalTrialsSpeed4:3,validTrialsSpeed8:3,totalTrialsSpeed8:3,internalSecret:98765}};
 function App(){const [index,setIndex]=useState(query.has('resume')?8:0),[done,setDone]=useState(false),[scored,setScored]=useState(null);const calls=React.useRef({core:0,archive:0});const draft=useMemo(()=>{const port=createMotDraft({sessionId:query.get('sid')||'synthetic-review-session',attemptNo:1,protocolKey:'mot/1.1.0/1.1.0',resolvedConfigHash:'synthetic-only-frozen-hash',randomSeed:seed});const append=port.appendPractice;let practiceCalls=0;port.appendPractice=async record=>{practiceCalls++;(window as any).practiceSaveCalls=practiceCalls;if(query.has('failPracticeOnce')&&practiceCalls===1)throw new Error('synthetic precommit practice save failure');return append(record)};return port},[]);
 Object.assign(window,{motReview:{config,seed,index,createDraft:createMotDraft,plan:(i,p=false)=>motTrialPlan(config,seed,i,p),position:(o)=>motPosition(o,8000,config),draft}});
 return query.has('report')||done?<MotReportCard result={(scored||(query.has('actual')?authoritySnapshot:result)) as any} profile="experience" language={language}/>:<MotTask config={config} randomSeed={seed} trialIndex={index} language={language} draft={draft} prepareFinalArchive={async(records)=>{calls.current.archive++;if(query.has('failArchiveOnce')&&calls.current.archive===1)throw new Error('synthetic upload failure');(window as any).archiveFixtureRecords=records;/* synthetic port: no COS */}} onTrialComplete={async(core)=>{calls.current.core++;if(query.has('failCoreOnce')&&calls.current.core===1)throw new Error('synthetic lost ACK');if(core.trialIndex===8){const records=await draft.records();const response=await fetch('/__mot_review_score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(records.map(r=>r.core))});if(!response.ok){const detail=await response.text();console.error(detail);throw new Error('score fixture failure '+detail)};setScored(await response.json());setDone(true)}else setIndex(core.trialIndex+1);return true}}/>};
 createRoot(document.getElementById('root')!).render(<App/>);`);
 const {createServer}=await import(path.join(front,'node_modules/vite/dist/node/index.js'));
const backend=path.join(root,'server-version/backend');require(path.join(backend,'node_modules/tsx/dist/cjs/index.cjs'));
 const {motDefinition,createMotSnapshot,motTrialEnvelope}=require(path.join(backend,'src/modules/cognitive/content-candidates/mot/package.ts'));
 const {runAuthoritativeScorer}=require(path.join(backend,'src/modules/cognitive/v2/authoritative-scorer.ts'));
 const serveScore=(req,res)=>{let size=0;const chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>1500000)req.destroy();else chunks.push(chunk)});req.on('end',()=>{try{const cores=JSON.parse(Buffer.concat(chunks).toString());const result=runAuthoritativeScorer({definition:motDefinition,session:createMotSnapshot('experience'),randomSeed:'browser-mot-contract',trials:cores.map(motTrialEnvelope)});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result))}catch(error){res.statusCode=400;res.end(JSON.stringify({error:String(error)}))}})};
 server=await createServer({configFile:path.join(front,'vite.config.ts'),root:front,plugins:[{name:'mot-native-score-fixture',configureServer(server){server.middlewares.use('/__mot_review_score',serveScore)}}],server:{host:'127.0.0.1',port:5196,strictPort:true}});
 await server.listen();
 const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']})}
 catch(e){fs.writeFileSync(path.join(out,'sandbox-launch-failure.txt'),String(e));await server.close();throw e}
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,locale:'zh-CN',timezoneId:'UTC',acceptDownloads:true});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage(),errors=[],shots=[];page.on('pageerror',e=>errors.push(e.message));
 async function shot(name){await page.evaluate(()=>document.fonts.ready);const file=path.join(out,name+'.png');await page.screenshot({path:file,fullPage:true});shots.push({name,file:path.relative(root,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')})}
 const url='http://127.0.0.1:5196/'+path.basename(temp)+'/index.html';
 if(process.argv.includes('--draft-recovery')||process.argv.includes('--practice-retry')){
  await require('./mot-draft-browser-cases.cjs')({browser,url,out,only:process.argv.includes('--practice-retry')?'practice-original-save-retry':null});return;
 }

 if(process.argv.includes('--small-layout')){
  await page.setViewportSize({width:390,height:530});await page.goto(url+'?sid=small-layout-fixture');
  await page.getByRole('button',{name:'校准屏幕'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认校准'}).click();await page.getByRole('button',{name:'开始',exact:true}).click();
  await page.locator('[data-mot-stage="cue"]').waitFor();
  const geometry=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},board:document.querySelector('.mot-board').getBoundingClientRect().toJSON(),root:document.querySelector('.mot-stage').getBoundingClientRect().toJSON(),scrollWidth:document.documentElement.scrollWidth}));
  if(geometry.root.height>530||geometry.board.bottom>530||geometry.scrollWidth>390)throw Error('Small screen clipping');
  await shot('small-screen-calibrated-390x530');fs.writeFileSync(path.join(out,'small-screen-layout.json'),JSON.stringify(geometry,null,2));
  await browser.close();await server.close();fs.rmSync(temp,{recursive:true,force:true});console.log(JSON.stringify({smallScreenClipping:false}));return;
 }

 if(process.argv.includes('--flow')||process.argv.includes('--resume-final')){
  await page.clock.install({time:new Date('2026-10-26T00:00:00Z')});
  await page.goto(url+(process.argv.includes('--resume-final')?'?sid=resume-final-fixture&resume=1&failArchiveOnce=1':'?sid=flow-with-retries&failCoreOnce=1&failArchiveOnce=1'));
  if(process.argv.includes('--resume-final')){const source=JSON.parse(fs.readFileSync(path.join(out,'browser-flow-debug.json'))).records;await page.evaluate(async source=>{for(const record of source){await window.motReview.draft.begin({trialIndex:record.core.trialIndex,calibration:record.core.calibration});await window.motReview.draft.append(record)}},source)}
  await page.getByRole('button',{name:'校准屏幕'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认校准'}).click();
  async function runTrial(i,practice){
   await page.getByRole('button',{name:'开始',exact:true}).click();await page.locator('[data-mot-stage="fixation"]').waitFor();
   await page.clock.runFor(10200);await page.locator('[data-mot-stage="response"]').waitFor();
   await page.evaluate(({i,practice})=>{const fixture=window.motReview,p=fixture.plan(i,practice),board=document.querySelector('.mot-board'),rect=board.getBoundingClientRect(),positions=p.objects.map(o=>fixture.position(o));
    for(const id of p.targetIds){let point=positions[id];
     for(let a=0;a<33;a++){const t=a/32*Math.PI*2,candidate=a?{x:positions[id].x+Math.cos(t)*.59,y:positions[id].y+Math.sin(t)*.59}:positions[id];
      if(positions.every((p,j)=>j===id||Math.hypot(p.x-candidate.x,p.y-candidate.y)>.6)){point=candidate;break}}
     board.dispatchEvent(new PointerEvent('pointerdown',{clientX:rect.left+board.clientLeft+point.x/12*board.clientWidth,clientY:rect.top+board.clientTop+point.y/12*board.clientHeight,pointerType:'touch',isPrimary:true,button:0,bubbles:true}))}
   },{i,practice});
  }
  await runTrial(0,true);await page.getByRole('button',{name:'再练习一次'}).click();await runTrial(1,true);await page.getByRole('button',{name:'进入正式作答'}).click();
  if(process.argv.includes('--resume-final')){await page.getByRole('button',{name:'开始',exact:true}).click();await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'重试',exact:true}).click()}
  else for(let i=0;i<9;i++){
   await runTrial(i,false);
   if(i===0||i===8){await page.getByRole('alert').waitFor();const records=await page.evaluate(async()=>await window.motReview.draft.records());if(records.length!==i+1)throw Error('Retry lost/duplicated draft');await page.getByRole('button',{name:'重试',exact:true}).click()}
   if(i<8)await page.getByRole('button',{name:'开始',exact:true}).waitFor();
  }
  await page.waitForTimeout(300);
  fs.writeFileSync(path.join(out,'browser-flow-debug.json'),JSON.stringify({body:await page.locator('body').innerText(),records:await page.evaluate(async()=>await window.motReview.draft.records()),errors},null,2));
  await page.getByRole('heading',{name:'看看你找回了多少目标'}).waitFor();
  const record=await page.evaluate(async()=>({formal:await window.motReview.draft.records(),practice:await window.motReview.draft.practices(),archive:window.archiveFixtureRecords}));
  if(record.formal.length!==9||record.practice.length!==2||record.archive.formal.length!==9)throw Error('Boundary record counts incorrect');
  if(await page.locator('.mot-number').textContent()!=='5 / 5 个 / 次')throw Error('Report not bound to authoritative browser-captured result');
  await shot('synthetic-completed-authoritative-report-390');
  fs.writeFileSync(path.join(out,'browser-completed-records.json'),JSON.stringify(record,null,2));
  fs.writeFileSync(path.join(out,'browser-flow.json'),JSON.stringify({kind:'SYNTHETIC_CLOUD_BROWSER_AND_NATIVE_SCORER_NOT_PRODUCT_API_DB_OR_COS',browser:browser.version(),chromiumSandbox:true,formal:9,practice:2,actualCapture:true,virtualClock:true,coreAckRetry:true,archiveRetry:true,formalCaptureReused:process.argv.includes('--resume-final'),localDraftPersistence:true,nativeScorerBound:true,realCOS:false,realProductAPI:false,errors},null,2));
  await browser.close();await server.close();fs.rmSync(temp,{recursive:true,force:true});console.log(JSON.stringify({formal:9,practice:2,retries:true,nativeScorerBound:true,reusedFormalCapture:process.argv.includes('--resume-final')}));return;
 }

 for(const state of ['interpretable','limited','invalid']){await page.goto(url+'?report=1&state='+state);await page.getByRole('heading').first().waitFor();await shot('report-'+state+'-390');
  const svg=page.getByRole('img');if(await svg.count()!==1)throw Error('Expected exactly one optional summary image');
  if(state!=='interpretable'&&(await svg.textContent()).includes('3.4'))throw Error('Gated value leaked in image');
  if(!(await svg.textContent()).includes('EDUK12.TOP'))throw Error('Missing brand');
 }
 await page.goto(url+'?report=1&lang=en');await page.getByRole('heading').first().waitFor();await shot('report-en-390');
 await page.evaluate(()=>document.documentElement.style.zoom='2');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Report horizontal overflow at 200%');
 await shot('report-en-200percent');
 await page.goto(url+'?report=1');const download=page.waitForEvent('download');await page.getByRole('button',{name:'保存这张小结图'}).click();const d=await download;await d.saveAs(path.join(out,'take-home-message.png'));
 if(process.argv.includes('--report-only')){await page.goto(url+'?report=1&actual=1');await page.getByRole('heading').first().waitFor();await shot('current-authoritative-report-390');await page.setViewportSize({width:1280,height:900});await shot('current-authoritative-report-1280');fs.writeFileSync(path.join(out,'report-final-review.json'),JSON.stringify({kind:'ACTUAL_COMPONENT_SYNTHETIC_FROZEN_RESULT',browser:browser.version(),chromiumSandbox:true,shots,reportPNG:true,zoom200:true,errors},null,2));await browser.close();await server.close();fs.rmSync(temp,{recursive:true,force:true});console.log(JSON.stringify({reportOnly:true,shots:shots.length}));return;}
 await page.goto(url);await page.getByRole('button',{name:'校准屏幕'}).click();await shot('calibration-390');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认校准'}).click();await page.getByRole('button',{name:'开始',exact:true}).click();
 await page.locator('[data-mot-stage="cue"]').waitFor();await shot('actual-cue-390');
 await page.locator('[data-mot-stage="motion"]').waitFor();await shot('actual-motion-390');
 await page.locator('[data-mot-stage="response"]').waitFor();await shot('actual-response-390');
 // Save a real browser practice trace using keyboard focus; no claims about physical timing/efficacy.
 await page.evaluate(()=>{const fixture=window.motReview,p=fixture.plan(0,true),board=document.querySelector('.mot-board');
  for(const id of p.targetIds){document.querySelector('[data-mot-id="'+id+'"]').focus();board.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))}});
 await page.getByRole('heading',{name:'练习记录'}).waitFor();await shot('practice-feedback-390');
 const practice=await page.evaluate(async()=>await window.motReview.draft.practices());
 if(practice.length!==1||practice[0].core.responses.length!==5||!practice[0].raw.motionFrameTimesMs.length)throw Error('Practice capture/draft failed');
 fs.writeFileSync(path.join(out,'browser-practice-record.json'),JSON.stringify(practice,null,2));
 if(errors.length)throw Error(JSON.stringify(errors));
 fs.writeFileSync(path.join(out,'browser-review.json'),JSON.stringify({kind:'REAL_CLOUD_CHROMIUM_COMPONENT_AND_INDEXEDDB_NOT_PRODUCT_API_OR_COS',browser:browser.version(),chromiumSandbox:true,shots,practiceCount:practice.length,frames:practice[0].raw.motionFrameTimesMs.length,reportPNG:true,zoom200:true,realProductEntrances:false,realCOS:false,hardwareTimingValidated:false,errors},null,2));
 await browser.close();await server.close();fs.rmSync(temp,{recursive:true,force:true});console.log(JSON.stringify({out,shots:shots.length,practiceFrames:practice[0].raw.motionFrameTimesMs.length,png:true}));
 }finally{
   await browser?.close().catch(()=>{});await server?.close().catch(()=>{});
   fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
