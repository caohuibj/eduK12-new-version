const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const root=path.resolve(__dirname,'../../..'),frontend=path.join(root,'server-version/frontend');
const esbuild=require(path.join(frontend,'node_modules/esbuild'));
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source='server-version/frontend/src/services/persistence/finalDraftStore.ts';
const sources=[source,'server-version/frontend/src/services/persistence/cognitiveRawArchiveState.ts'];
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
(async()=>{
 const before=Object.fromEntries(sources.map(p=>[p,digest(p)]));
 const build=esbuild.buildSync({entryPoints:[path.join(root,source)],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const js=build.outputFiles[0].contents,report={kind:'REAL_CHROMIUM_INDEXEDDB_EXPECTED_OWNERSHIP_CONTRACT',startedAt:new Date().toISOString(),sourceSha256:before,bundleSha256:crypto.createHash('sha256').update(js).digest('hex'),checks:[],notVerified:['No assessment exposure/scorer/HTTP business workflow rerun','No external COS or production data','No cross-browser or physical timing claim']};
 const server=http.createServer((req,res)=>{if(req.url==='/store.mjs'){res.setHeader('Content-Type','text/javascript');res.end(js)}else if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic IndexedDB ownership contract</title>')}else{res.statusCode=404;res.end()}});
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,chromiumSandbox:true});
  const context=await browser.newContext();await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  const page=await context.newPage();await page.goto(origin);
  report.chromium=browser.version();
  report.checks=await page.evaluate(async()=>{
   const {IndexedDbFinalDraftStore}=await import('/store.mjs'),store=new IndexedDbFinalDraftStore();
   const check=(v,m)=>{if(!v)throw Error(m)};
   const meta=(key,epoch)=>({draftKey:key,instrument:'cognitive',attemptId:'synthetic-session',attemptEpoch:epoch,definitionHash:'a'.repeat(64),contextSnapshotHash:null,deliveryMode:'final_only',submissionId:'synthetic-submission-'+epoch,status:'DRAFT',createdAt:1,updatedAt:1});
   const active=meta('synthetic-idb-active',1);await store.ensure(active);
   await store.putTrial({draftKey:active.draftKey,trialIndex:0,payload:{original:true},createdAt:2},active);
   const seal=await store.sealForSubmission(active.draftKey,s=>({submissionId:s.meta.submissionId,trials:s.trials}),active);
   check(seal.payload.trials.length===1&&seal.payload.trials[0].payload.original===true,'active original record did not seal');
   await store.setStatus(active.draftKey,'COMPLETED',undefined,active);check((await store.get(active.draftKey)).status==='COMPLETED','active completion refused');
   await store.delete(active.draftKey,active);check(await store.get(active.draftKey)===null,'active cleanup refused');
   const current=meta('synthetic-idb-same-session',2);await store.ensure(current);
   await store.putTrial({draftKey:current.draftKey,trialIndex:0,payload:{newEpoch:true},createdAt:3},current);
   const before=JSON.stringify(await store.snapshot(current.draftKey));
   const staleEpoch={...current,attemptEpoch:1};
   const ops=[
    ['putTrial',()=>store.putTrial({draftKey:current.draftKey,trialIndex:1,payload:{stale:true},createdAt:4},staleEpoch)],
    ['sealForSubmission',()=>store.sealForSubmission(current.draftKey,()=>({stale:true}),staleEpoch)],
    ['setStatus',()=>store.setStatus(current.draftKey,'SUBMITTING',undefined,staleEpoch)],
    ['delete',()=>store.delete(current.draftKey,staleEpoch)],
   ];
   for(const [name,op] of ops){let error;try{await op()}catch(e){error=e}check(error?.code==='FINAL_DRAFT_IDENTITY_CONFLICT',name+' failed to reject stale epoch');check(JSON.stringify(await store.snapshot(current.draftKey))===before,name+' changed current epoch data')}
   let error;try{await store.delete(current.draftKey,{...current,submissionId:'synthetic-old-submission'})}catch(e){error=e}
   check(error?.code==='FINAL_DRAFT_IDENTITY_CONFLICT','cleanup failed to reject stale submission');check(JSON.stringify(await store.snapshot(current.draftKey))===before,'stale submission deleted current data');
   await store.delete(current.draftKey,current);
   return [{name:'active_expected_identity_writes_seals_completes_and_cleans',passed:true},{name:'same_session_new_epoch_rejects_all_four_stale_transaction_mutations_and_stale_submission_cleanup',passed:true}];
  });
  const after=Object.fromEntries(sources.map(p=>[p,digest(p)]));if(JSON.stringify(after)!==JSON.stringify(before))throw Error('Storage source changed during actual IndexedDB contract');
  report.status='PASS';
 }catch(error){report.status='FAIL';report.error=error.stack||String(error);process.exitCode=1}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();report.scriptSha256=digest('server-version/scripts/cognitive/native-mot-idb-ownership-review.cjs');fs.writeFileSync(process.argv[2]||'/tmp/native-mot-idb-ownership-review.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,error:report.error}));}
})().catch(e=>{console.error(e);process.exitCode=1});
