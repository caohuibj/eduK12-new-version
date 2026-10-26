const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
/** Real isolated Chromium IndexedDB. No product server, real COS, or human timing qualification. */
module.exports=async({browser,url,out,only=null})=>{
 const sourcePath=path.join(out,'browser-completed-records.json');
 const source=JSON.parse(fs.readFileSync(sourcePath));
 const fixture=source.formal;
 const seed='browser-mot-contract',hash='synthetic-only-frozen-hash';
 const results=[];
 async function withPage(name,run,query=''){
  if(only&&name!==only)return;
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,timezoneId:'UTC'});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{if(name==='practice-original-save-retry')await page.clock.install({time:new Date('2026-10-26T00:00:00Z')});await page.goto(url+'?sid=synthetic-draft-test'+query);await page.waitForFunction(()=>Boolean(window.motReview));
   const data=await run(page);if(errors.length)throw Error(JSON.stringify(errors));results.push({name,status:'passed',...data});
  }catch(error){await page.screenshot({path:path.join(out,'draft-failure-'+name+'.png'),fullPage:true});throw error}
  finally{await context.close()}
 }
 await withPage('legacy-order-and-identity',async page=>page.evaluate(async({fixture,seed,hash})=>{
  const binding={sessionId:'synthetic-legacy',attemptNo:1,protocolKey:'mot/1.1.0/1.1.0',resolvedConfigHash:hash,randomSeed:seed};
  const reordered={randomSeed:seed,resolvedConfigHash:hash,protocolKey:binding.protocolKey,attemptNo:1,sessionId:binding.sessionId};
  const legacyKey=JSON.stringify(reordered),legacy={records:fixture.slice(0,2),pending:{trialIndex:2,calibration:fixture[2].core.calibration},practice:[]};
  const database=await new Promise((ok,fail)=>{const request=indexedDB.open('eduk12-mot-drafts-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>ok(request.result);request.onerror=()=>fail(request.error)});
  await new Promise((ok,fail)=>{const tx=database.transaction('drafts','readwrite');tx.objectStore('drafts').put(legacy,legacyKey);tx.objectStore('drafts').put({untouched:true},'unrelated-key');tx.oncomplete=ok;tx.onerror=()=>fail(tx.error)});database.close();
  const port=window.motReview.createDraft(binding);
  if((await port.pending()).trialIndex!==2||JSON.stringify(await port.records())!==JSON.stringify(legacy.records))throw Error('Legacy recovery changed records');
  await port.append(fixture[2]);await port.append(fixture[2]);
  const alias=window.motReview.createDraft(reordered);
  if((await alias.records()).length!==3||await alias.pending()!==null)throw Error('Equivalent bindings did not share one draft');
  const changed=structuredClone(fixture[2]);changed.core.prematureInputs=999;
  let code;try{await alias.append(changed)}catch(e){code=e.code}
  if(code!=='CONFLICT'||(await port.records())[2].core.prematureInputs!==fixture[2].core.prematureInputs)throw Error('Conflicting retry changed original record');
  try{await port.begin({trialIndex:4,calibration:fixture[3].core.calibration});throw Error('Accepted gap')}catch(e){if(e.code!=='SEQUENCE')throw e}
  const other=window.motReview.createDraft({...binding,attemptNo:2});if((await other.records()).length)throw Error('Attempt isolation failed');
  const input={trialIndex:0,calibration:fixture[0].core.calibration},begin=other.begin(input);input.trialIndex=44;await begin;
  if((await other.pending()).trialIndex!==0)throw Error('Mutable caller changed exposure marker');
  const record=structuredClone(fixture[0]),append=other.append(record);record.raw.motionFrameTimesMs=[];await append;
  if(!(await other.records())[0].raw.motionFrameTimesMs.length)throw Error('Mutable caller erased raw frames');
  const rawDatabase=await new Promise((ok,fail)=>{const q=indexedDB.open('eduk12-mot-drafts-v1',2);q.onsuccess=()=>ok(q.result);q.onerror=()=>fail(q.error)});
  const preserved=await new Promise((ok,fail)=>{const q=rawDatabase.transaction('drafts').objectStore('drafts').get('unrelated-key');q.onsuccess=()=>ok(q.result);q.onerror=()=>fail(q.error)});
  if(!preserved.untouched)throw Error('Unrelated legacy key was deleted');rawDatabase.close();port.close();alias.close();other.close();
  return{legacyPendingPreserved:true,canonicalIdentity:true,idempotentAppend:true,conflictPreserved:true,attemptIsolated:true,mutableCallerIsolated:true,unrelatedKeyPreserved:true};
 },{fixture,seed,hash}));
 await withPage('conflicting-legacy-aliases',async page=>page.evaluate(async({fixture,seed,hash})=>{
  const binding={sessionId:'synthetic-ambiguous',attemptNo:1,protocolKey:'mot/1.1.0/1.1.0',resolvedConfigHash:hash,randomSeed:seed};
  const keys=[JSON.stringify(binding),JSON.stringify({randomSeed:seed,resolvedConfigHash:hash,protocolKey:binding.protocolKey,attemptNo:1,sessionId:binding.sessionId})];
  const database=await new Promise(ok=>{const r=indexedDB.open('eduk12-mot-drafts-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>ok(r.result)});
  await new Promise((ok,fail)=>{const tx=database.transaction('drafts','readwrite');keys.forEach((key,i)=>tx.objectStore('drafts').put({records:fixture.slice(0,i),pending:null,practice:[]},key));tx.oncomplete=ok;tx.onerror=()=>fail(tx.error)});database.close();
  const port=window.motReview.createDraft(binding);let code;try{await port.records()}catch(e){code=e.code}
  if(code!=='CONFLICT')throw Error('Ambiguous aliases were silently selected');
  const raw=await new Promise(ok=>{const r=indexedDB.open('eduk12-mot-drafts-v1',2);r.onsuccess=()=>ok(r.result)});
  const count=await new Promise(ok=>{const r=raw.transaction('drafts').objectStore('drafts').count();r.onsuccess=()=>ok(r.result)});
  raw.close();port.close();if(count!==2)throw Error('An ambiguous draft was removed');return{rejected:true,originalDrafts:count};
 },{fixture,seed,hash}));
 await withPage('blocked-open-retry',async page=>page.evaluate(async({seed,hash})=>{
  const blocker=await new Promise(ok=>{const r=indexedDB.open('eduk12-mot-drafts-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>ok(r.result)});
  const port=window.motReview.createDraft({sessionId:'synthetic-blocked',attemptNo:1,protocolKey:'mot/1.1.0/1.1.0',resolvedConfigHash:hash,randomSeed:seed});
  let code;try{await port.pending()}catch(e){code=e.code}
  if(code!=='UNAVAILABLE')throw Error('Blocked upgrade did not surface');blocker.close();
  if(await port.pending()!==null)throw Error('Open retry failed after blocker closed');port.close();return{blockedReported:true,retrySucceeded:true};
 },{seed,hash}));
 await withPage('pending-exposure-recovery-ui',async page=>{
  await page.evaluate(async({fixture})=>{await window.motReview.draft.begin({trialIndex:0,calibration:fixture[0].core.calibration})},{fixture});
  await page.reload();await page.waitForFunction(()=>Boolean(window.motReview));
  await page.getByRole('button',{name:'校准屏幕'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认校准'}).click();
  await page.getByRole('button',{name:'开始',exact:true}).click();await page.waitForFunction(()=>window.motReview.index===1);
  const saved=await page.evaluate(async()=>({records:await window.motReview.draft.records(),pending:await window.motReview.draft.pending(),stage:document.querySelector('[data-mot-stage]').getAttribute('data-mot-stage')}));
  const record=saved.records[0];
  if(saved.records.length!==1||saved.pending!==null||record.core.recordOrigin!=='recovered_without_timing'||!record.core.interruptions.includes('runner_restart')||record.raw.motionFrameTimesMs.length!==0||saved.stage!=='ready')throw Error('Recovery replayed exposure or invented timing');
  return{refreshPreservedPending:true,interruptedRecordSaved:true,exposureRepeated:false,timingInvented:false};
 });
 await withPage('practice-original-save-retry',async page=>{
  await page.getByRole('button',{name:'校准屏幕'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认校准'}).click();
  await page.getByRole('button',{name:'开始',exact:true}).click();await page.locator('[data-mot-stage="fixation"]').waitFor();
  await page.clock.runFor(10200);await page.locator('[data-mot-stage="response"]').waitFor();
  await page.evaluate(()=>{const p=window.motReview.plan(0,true),board=document.querySelector('.mot-board');
   for(const id of p.targetIds){document.querySelector('[data-mot-id="'+id+'"]').focus();board.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))}});
  const text=await page.getByRole('alert').textContent();if(!text.includes('无需重复练习'))throw Error('Practice save failure asks for another exposure');
  await page.screenshot({path:path.join(out,'draft-practice-save-error-390.png'),fullPage:true});
  if((await page.evaluate(async()=>await window.motReview.draft.practices())).length)throw Error('Injected precommit failure was persisted');
  await page.evaluate(()=>{const retry=document.querySelector('.mot-intro button');retry.click();retry.click()});
  await page.getByRole('heading',{name:'练习记录'}).waitFor();
  const saved=await page.evaluate(async()=>({calls:window.practiceSaveCalls,records:await window.motReview.draft.practices(),board:document.querySelector('.mot-board')!==null}));
  if(saved.calls!==2||saved.records.length!==1||saved.records[0].core.responses.length!==5||!saved.records[0].raw.motionFrameTimesMs.length||saved.board)throw Error('Practice retry duplicated saving or replayed exposure');
  return{fault:'injected precommit port failure',practiceSaveCalls:2,savedPracticeCount:1,exposureRepeated:false,completeRawRetained:true};
 },'&failPracticeOnce=1');
 const result={kind:'REAL_CLOUD_CHROMIUM_INDEXEDDB_AND_COMPONENT_RECOVERY_NOT_PRODUCT_API_DB_COS',browser:browser.version(),chromiumSandbox:true,
  sourceFixtureSha256:crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),cases:results,productionMutations:false};
 fs.writeFileSync(path.join(out,only?'draft-practice-save-review-20261026.json':'draft-recovery-review-20261026.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({draftRecoveryCases:results.length,status:'passed'}));
};
