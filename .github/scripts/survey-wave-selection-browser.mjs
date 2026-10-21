// Short synthetic UI contracts against bytes extracted from this job's production
// frontend image. This is not backend authorization or real-user evidence.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,stat,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../release-tools/package.json',import.meta.url));
const {chromium}=require('playwright-core');
assert.equal(require('playwright-core/package.json').version,require('./package.json').dependencies['playwright-core']);
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8'}).trim();
const image='server-version-frontend:latest',imageId=docker('image','inspect','--format','{{.Id}}',image);
const temp=await mkdtemp(join(tmpdir(),'survey-wave-selection-')),dist=join(temp,'html');
let container,server,browser,timer;
const reportDir='survey-wave-selection-browser-report',records=[];
const saveReport=()=>writeFile(reportDir+'/results.json',JSON.stringify({imageId,kind:'synthetic-production-frontend-browser',records},null,2));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const origin='http://survey.eduk12.top';
const projectId='11111111-1111-4111-8111-111111111111',waveId='22222222-2222-4222-8222-222222222222',toolId='33333333-3333-4333-8333-333333333333';
const reportId='44444444-4444-4444-8444-444444444444',referenceId='55555555-5555-4555-8555-555555555555',measurementId='66666666-6666-4666-8666-666666666666';
const entryKey='a'.repeat(64),prefix='/api/survey/projects/'+projectId;
const project={id:projectId,title:'合成版本选择研究',description:'仅用于界面合同',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1};
const tool={id:toolId,projectId,title:'合成测量',kind:'SCALE',status:'DRAFT',instrumentKey:'synthetic_scale',revision:2,updatedAt:'2026-10-20T00:00:00Z',definition:{dimensions:[{dimensionKey:'total',label:'总分'}],items:[]}};
const initialWave={id:waveId,projectId,title:'合成版本波次',ordinal:1,status:'DRAFT',revision:3,instrumentIds:[toolId],publicationId:null,
 consentText:'本次合成研究的参与说明与知情同意材料，仅用于自动化界面合同。',generalText:'谢谢',consentVersion:1,linkageNoticeConfirmed:false,
 opensAt:null,closesAt:null,finishUntil:null,quotaStarts:null,startsCount:0,allowNewParticipants:false,hardStopAt:null,flowDefinition:null};
const frozen=[{draftId:toolId,instrumentKey:tool.instrumentKey,title:'冻结合成测量',measurementRelease:{releaseId:measurementId,contentHash:'b'.repeat(64),measurementHash:'c'.repeat(64)},
 contentSelection:{reportRelease:{releaseId:reportId,contentHash:'d'.repeat(64)},referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:measurementId,
 choices:[{releaseId:referenceId,contentHash:'e'.repeat(64),entryKey,priority:2,metricKey:'total',referenceKind:'descriptive_sample'}]}}}];
const expected={revision:3,contentSelections:[{instrumentId:toolId,reportReleaseId:reportId,references:[{releaseId:referenceId,entryKey,priority:2}]}]};
try{
 container=docker('create',imageId);await mkdir(dist);docker('cp',container+':/usr/share/nginx/html/.',dist);docker('rm',container);container=null;
 await stat(join(dist,'index.html'));await mkdir(reportDir,{recursive:true});await saveReport();
 server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=resolve(dist,'.'+pathname);
   assert.ok(file===dist||file.startsWith(dist+sep));
   try{assert.ok((await stat(file)).isFile());}catch{if(extname(pathname)){res.writeHead(404);res.end();return;}file=join(dist,'index.html');}
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(400);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const local='http://127.0.0.1:'+server.address().port;
 timer=setTimeout(()=>{console.error('Survey selection browser exceeded 120 seconds');process.exit(1);},120000);
 browser=await chromium.launch({headless:true});
 for(const mode of ['success','stale']){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1365,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);
  let wave=structuredClone(initialWave);const unknown=[],errors=[],posts=[],optionReads=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{
   // Chromium itself reports the deliberately rejected 409 as a resource error.
   if(message.type()==='error'&&!(mode==='stale'&&message.text()==='Failed to load resource: the server responded with a status of 409 (Conflict)'))errors.push(message.text());
  });
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method(),key=method+' '+url.pathname+url.search;
   const json=(data,status=200,message='ok')=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,data,message})});
   try{
    assert.equal(url.origin,origin,'unexpected origin');
    if(url.pathname.startsWith('/api/')){
     const body=request.postData()?request.postDataJSON():undefined;
     if(method==='GET')assert.equal(body,undefined);
     else {assert.equal(request.headers()['x-csrf-token'],'synthetic-csrf');posts.push({key,body});}
     if(key==='GET /api/survey/auth/me')return json({id:'synthetic-owner',username:'合成研究者',mustChangePassword:false});
     if(key==='GET /api/survey/auth/capabilities')return json({analytics:false,publication:true});
     if(key==='GET /api/survey/auth/csrf')return json({csrfToken:'synthetic-csrf'});
     if(key==='GET /api/survey/projects?page=1')return json({list:[project]});
     if(key==='GET '+prefix)return json(project);
     if(key==='GET '+prefix+'/catalog?page=1')return json({list:[]});
     if(key==='GET '+prefix+'/instruments?page=1')return json({list:[tool]});
     if(key==='GET '+prefix+'/instruments/'+toolId)return json(tool);
     if(key==='GET '+prefix+'/waves?page=1')return json({list:[wave]});
     if(key==='GET '+prefix+'/waves/'+waveId)return json(wave);
     if(method==='GET'&&url.pathname===prefix+'/waves/'+waveId+'/content-options'){
      assert.deepEqual([...url.searchParams.keys()].sort(),['instrumentId','layer','page']);
      assert.equal(url.searchParams.get('instrumentId'),toolId);assert.equal(url.searchParams.get('page'),'1');
      const layer=url.searchParams.get('layer');assert.ok(['REPORT','REFERENCE'].includes(layer));optionReads.push(layer);
      return json({instrumentId:toolId,instrumentKey:tool.instrumentKey,draftRevision:2,waveRevision:3,measurement:{releaseId:measurementId,contentHash:'b'.repeat(64),version:'m1'},layer,page:1,pageSize:25,hasMore:false,
       options:layer==='REPORT'?[{releaseId:reportId,key:'合成私有报告',title:'合成私有报告',version:'r1',contentHash:'d'.repeat(64),status:'PUBLISHED',audience:'researcher',language:'zh-CN'}]
        :[{releaseId:referenceId,key:'合成私有参考',version:'ref1',contentHash:'e'.repeat(64),status:'PUBLISHED',entries:[{entryKey,metricKey:'total',referenceKind:'descriptive_sample',population:{description:'合成研究样本'}}]}]});
     }
     if(key==='POST '+prefix+'/waves/'+waveId+'/preflight'){assert.deepEqual(body,{});return json({ok:true,publicationReady:true,checks:[]});}
     if(key==='POST '+prefix+'/waves/'+waveId+'/prepare'){
      assert.deepEqual(body,expected,'freeze must carry exact explicit selections, separately from participant feedback');
      if(mode==='stale')return json(null,409,'合成报告已停用');
      wave={...wave,revision:4,publicationId:'synthetic-publication',frozenContentSelections:frozen,frozenParticipantFeedback:[]};return json({publicationId:wave.publicationId});
     }
     throw Error('unmocked API '+key);
    }
    assert.equal(method,'GET');const response=await fetch(local+url.pathname+url.search,{signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200,'static asset '+url.pathname);
    return route.fulfill({status:200,contentType:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer())});
   }catch(error){unknown.push({key,error:String(error)});return json(null,500,'unexpected browser contract request');}
  });
  try{
   const panel=page.getByRole('region',{name:'研究者报告与参考版本',exact:true});
   // The label wraps the select and its options. Match its stable accessible
   // prefix, not an exact label string that also includes option text.
   const reportSelect=panel.getByRole('combobox',{name:/^报告版本 · 合成测量/});
   const openWave=async()=>{
    await page.getByRole('button',{name:'查看/编辑',exact:true}).click();
    await page.getByRole('tab',{name:'发布与采集',exact:true}).click();
    await page.getByRole('button',{name:/T1 · 合成版本波次/}).click();
   };
   await page.goto(origin+'/workspace');await openWave();
   await page.getByRole('button',{name:'读取 合成测量 的报告版本',exact:true}).click();
   await reportSelect.waitFor({state:'visible'});assert.equal(await reportSelect.count(),1);
   await reportSelect.selectOption(reportId);
   await page.getByRole('button',{name:'读取 合成测量 的参考版本',exact:true}).click();
   await page.getByRole('checkbox',{name:'合成私有参考 · ref1 · total · descriptive_sample',exact:true}).check();
   await page.getByLabel('优先级 · ref1 · total',{exact:true}).fill('2');
   await page.waitForLoadState('networkidle');assert.deepEqual(posts,[],'selection itself must never write');assert.deepEqual(optionReads,['REPORT','REFERENCE']);
   await page.getByRole('button',{name:'检查知情同意与所有工具',exact:true}).click();
   await page.getByRole('button',{name:'冻结研究定义',exact:true}).click();
   if(mode==='success'){
    await panel.getByText('报告版本：'+reportId,{exact:true}).waitFor();
    assert.equal(await panel.getByRole('combobox').count(),0,'frozen selection must be read-only');
    await panel.getByText('冻结技术标识',{exact:true}).click();
    assert.deepEqual(JSON.parse(await panel.locator('pre').innerText()),{measurement:frozen[0].measurementRelease,selection:frozen[0].contentSelection});
    await page.reload();await openWave();
    await panel.getByText('报告版本：'+reportId,{exact:true}).waitFor();
    assert.equal(await panel.getByRole('combobox').count(),0);assert.deepEqual(optionReads,['REPORT','REFERENCE'],'frozen reload must not discover current candidates');
   }else{
    await page.getByText(/合成报告已停用；原报告／参考选择保留/).waitFor();
    assert.equal(await reportSelect.inputValue(),reportId);
    assert.equal(await page.getByRole('checkbox',{name:'合成私有参考 · ref1 · total · descriptive_sample',exact:true}).isChecked(),true);
   }
   await page.waitForLoadState('networkidle');
   assert.equal(posts.filter(row=>row.key.endsWith('/prepare')).length,1,'no automatic retry or re-selection');
   assert.deepEqual(posts.map(row=>row.key),['POST '+prefix+'/waves/'+waveId+'/preflight','POST '+prefix+'/waves/'+waveId+'/prepare']);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'viewport overflow');
   assert.deepEqual(errors,[],'browser errors');assert.deepEqual(unknown,[],'unknown API/assets');
   await page.screenshot({path:reportDir+'/'+mode+'.png',fullPage:false});
   records.push({mode,status:'passed',optionReads,preparePosts:1});console.log('PASS Survey Wave selection '+mode);
  }catch(error){
   const failure={mode,status:'failed',error:String(error),stack:error?.stack,unknown,errors,posts,optionReads};
   try{failure.alerts=await page.getByRole('alert').allTextContents();failure.visibleText=await page.locator('body').innerText({timeout:2000});}
   catch(diagnosticError){failure.diagnosticError=String(diagnosticError);}
   try{await page.screenshot({path:reportDir+'/'+mode+'-failure.png',fullPage:false,timeout:5000});}
   catch(screenshotError){failure.screenshotError=String(screenshotError);}
   records.push(failure);await saveReport();throw error;
  }finally{await saveReport();await context.close();}
 }
 await saveReport();
}finally{
 clearTimeout(timer);await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(container)docker('rm','-f',container);await rm(temp,{recursive:true,force:true});
}
