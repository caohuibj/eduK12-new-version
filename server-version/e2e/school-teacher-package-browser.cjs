'use strict';
const {execFileSync,spawnSync}=require('node:child_process');const {randomBytes}=require('node:crypto');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'school-teacher-evidence'),context=process.env.P6_BROWSER_CONTEXT;
const report={status:'RUNNING',scope:'one public whole-package connection',authentication:'synthetic principal with real database authority; not a login/MFA ceremony',applicationTestsReplayed:false,scoringOrFinalReplayed:false};
const run=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 assert.equal(process.env.GITHUB_ACTIONS,'true');const plan=JSON.parse(process.env.PLAN);assert.equal(plan.publicPackage,true);
 const {chromium}=require(path.join(root,'.github/release-tools/node_modules/playwright-core'));
 const {preflightChrome,verifyChromeSandbox,CHROME_LAUNCH_OPTIONS}=require('./school-teacher-chrome.cjs');
 const preflight=preflightChrome({repo:root,diagnostics:true});report.preflight=preflight;
 if(!preflight.ok){report.status='FAILED';report.error='CHROME_PREFLIGHT_REJECTED';fs.writeFileSync(path.join(out,'package-browser.json'),JSON.stringify(report,null,2));}
 assert(preflight.ok,'Existing official Chrome sandbox preflight failed; no security changes permitted');
 const runtime=JSON.parse(fs.readFileSync(path.join(out,'native-runtime.json')));assert.equal(runtime.head,process.env.GITHUB_SHA);assert.equal(runtime.runId,process.env.GITHUB_RUN_ID);
 const backend=runtime.results.find(r=>r.component==='backend');assert(backend);assert.equal(backend.context.tree,plan.components.backend);
 const suffix=process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT,network='p6-browser-'+suffix,pg=network+'-pg',app=network+'-app';let browser,networkCreated=false,pgCreated=false,appCreated=false;
 const redis=network+'-redis';let redisCreated=false;
 const credentials=randomBytes(24).toString('hex'),dbUrl='postgresql://ptool:'+credentials+'@'+pg+':5432/p6_browser_ci_test';
 const env={DATABASE_URL:dbUrl,NODE_ENV:'test',P6_BROWSER_ISOLATED_SETUP:'true',REDIS_URL:'redis://'+redis+':6379',JWT_SECRET:randomBytes(32).toString('hex'),ASSET_SIGNING_SECRET:randomBytes(32).toString('hex'),DATA_PSEUDONYM_KEY:randomBytes(32).toString('hex'),DATA_ENCRYPTION_KEY:randomBytes(32).toString('hex'),BUNDLE_REVIEW_SIGNING_KEY:randomBytes(32).toString('hex'),BUNDLE_PRODUCTS_ENABLED:'true',ASSESSMENT_COMPACT_FACTS_ENABLED:'false',BACKGROUND_WORKERS_ENABLED:'false'};
 try{
  run(['network','create',network]);networkCreated=true;
  run(['run','--detach','--name',pg,'--network',network,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_USER=ptool','-e','POSTGRES_PASSWORD='+credentials,'-e','POSTGRES_DB=p6_browser_ci_test','postgres:16.15-bookworm@sha256:efedf3595f1d6f415c08568ba171029bf54052e754cc9f030e3f2412b21f3d67']);pgCreated=true;
  run(['run','--detach','--name',redis,'--network',network,'--tmpfs','/data','redis:7.4.11-bookworm@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f']);redisCreated=true;
  let ready=false;for(let i=0;i<40;i++){if(spawnSync('docker',['exec',pg,'pg_isready','-U','ptool','-d','p6_browser_ci_test']).status===0){ready=true;break}await pause(500)}assert(ready,'Isolated fixture PG readiness failed');
  run(['run','--rm','--network',network,'--mount','type=bind,src='+path.join(context,'backend')+',dst=/app,readonly','-w','/app','-e','DATABASE_URL='+dbUrl,runtime.baseImages.node,'node','node_modules/prisma/build/index.js','migrate','deploy']);
  const args=['run','--detach','--name',app,'--network',network,'-p','127.0.0.1::3000','--mount','type=bind,src='+path.join(root,'server-version/e2e/school-teacher-package-fixture.cjs')+',dst=/probe/fixture.cjs,readonly','--mount','type=bind,src='+path.join(context,'frontend/dist')+',dst=/frontend,readonly'];for(const[k,v]of Object.entries(env))args.push('-e',k+'='+v);args.push(backend.imageId,'node','/probe/fixture.cjs');run(args);appCreated=true;
  const port=run(['port',app,'3000/tcp']).trim();assert.match(port,/^127\.0\.0\.1:\d+$/);const origin='http://'+port;
  ready=false;for(let i=0;i<60;i++){try{const response=await fetch(origin+'/api/fixture-config',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break}}catch{}await pause(500)}assert(ready,'Actual compiled fixture API failed readiness');
  browser=await chromium.launch(CHROME_LAUNCH_OPTIONS);report.sandbox=await verifyChromeSandbox(browser);assert.equal(report.sandbox.ok,true);report.browserVersion=browser.version();
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/p6-package-probe.html');await page.getByRole('button',{name:'查看完整包'}).first().click();await page.getByRole('region',{name:'固定整包只读预览'}).waitFor();await page.getByRole('button',{name:'引用整包到本校任务'}).click();await page.getByRole('button',{name:'读取登记权限与资源'}).click();await page.getByRole('button',{name:'读取获授权来源'}).click();
  const selector=page.getByLabel('获授权来源',{exact:true});await page.waitForFunction(()=>document.querySelectorAll('select')[0]?.options.length>1);const options=await selector.locator('option').evaluateAll(os=>os.filter(o=>o.value&&!o.disabled).map(o=>o.value));assert.equal(options.length,1);await selector.selectOption(options[0]);await page.getByLabel('登记标题').fill('P6 浏览器连接');await page.getByRole('button',{name:'准备独立教育版本'}).click();await page.getByText(/整包的成员、顺序、参数和综合报告保持原版/).waitFor();assert(await selector.isDisabled());assert(await page.getByRole('button',{name:'搜索',exact:true}).isDisabled());
  await page.getByLabel('反馈开放方式').selectOption('IMMEDIATE');await page.getByRole('button',{name:'冻结登记为草稿'}).click();await page.getByRole('region',{name:'冻结登记详情'}).waitFor();const published=await page.request.post(origin+'/api/fixture-publish');assert.equal(published.status(),200);const saved=(await published.json()).data;assert(saved.originalParameters.length);assert(saved.originalParameters.every(u=>u.references.length===0&&u.report===null));
  await page.getByRole('button',{name:'读取已授权测评目录'}).click();await page.getByLabel('已授权测评 · 精确版本',{exact:true}).getByRole('option',{name:/P6 浏览器连接/}).waitFor({state:'attached'});assert.deepEqual(errors,[]);
  Object.assign(report,{status:'PASSED',head:plan.head,runId:process.env.GITHUB_RUN_ID,frontendManifest:runtime.results.find(r=>r.component==='frontend').context.manifest,backendManifest:backend.context.manifest,checks:['public granted catalog','exact original preview','fixed original source and P/R absence','dirty state retained','existing register and independent publication','resource visible in actual task catalog']});
 }catch(e){report.status='FAILED';report.error='PUBLIC_PACKAGE_CONNECTION_FAILED';throw e}finally{
  if(browser)await browser.close();if(appCreated){try{fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'p6-browser-api.log'),run(['logs',app]),{mode:0o600})}catch{}run(['rm','--force',app])}if(pgCreated)run(['rm','--force',pg]);if(redisCreated)run(['rm','--force',redis]);if(networkCreated)run(['network','rm',network]);fs.writeFileSync(path.join(out,'package-browser.json'),JSON.stringify(report,null,2));
 }
})().catch(e=>{console.error('Public package browser connection failed:',e.name);process.exitCode=1});
