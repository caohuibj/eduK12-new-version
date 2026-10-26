const binding={browserOrigin:'https://training.eduk12.top'};
import {verifyDist,runBrowserPhase,statusBrowserResources} from './pr356-product-browser.mjs';
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve,extname} from 'node:path';import {createHash} from 'node:crypto';const sha=b=>createHash('sha256').update(b).digest('hex'),out=process.env.PR356_EVIDENCE_DIR||'pr356-evidence';

const statusScenarioIds=['onboarding-1440-light','onboarding-1440-dark','onboarding-390-light','onboarding-390-dark'];
await runBrowserPhase('status-browser',statusScenarioIds,async receipt=>{
const {chromium}=await import('../release-tools/node_modules/playwright-core/index.mjs');
const verifiedDist=verifyDist(process.env.PR356_FRONTEND_ARTIFACT_DIR),root=verifiedDist.root,manifest=verifiedDist.manifest;receipt.upstream(verifiedDist.upstream);
for(const[p,h]of Object.entries(manifest.files)){const bytes=readFileSync(root+'/'+p);assert.equal(sha(bytes),h.sha256);assert.equal(bytes.length,h.bytes);}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const server=createServer((req,res)=>{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+'/')&&p!==root){res.writeHead(403).end();return}const file=existsSync(p)&&extname(p)?p:root+'/index.html';try{res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(readFileSync(file))}catch{res.writeHead(404).end()}});
const resources=statusBrowserResources(server,()=>chromium.launch({headless:true,args:['--no-proxy-server']}));const results=[];let browser,currentPage;let currentDebug={};
try{
 browser=await resources.start();
 for(const width of [1440,390])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme}),page=await context.newPage(),errors=[],unexpected=[],writes=[];
  currentPage=page;currentDebug={width,theme,errors,unexpected,writes};
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==binding.browserOrigin){unexpected.push(u.origin);return route.abort();}const response=await fetch('http://127.0.0.1:4179'+u.pathname+u.search);return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await response.arrayBuffer())});});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);await route.fulfill({status:403,json:{code:403,message:'Fixture refuses mutations'}});return;}
   let data;const p=url.pathname;
   if(p==='/api/platform/survey-standard/onboarding-status'){
    assert.equal(url.searchParams.get('limit'),'25');assert([...url.searchParams.keys()].every(k=>['limit','cursor','query'].includes(k)));
    const next=url.searchParams.get('cursor')==='fixture-page-2',query=url.searchParams.get('query');
    const row={scaleId:null,instrumentKey:'pending',instrumentVersion:next?'2.0':'1.0',name:'待审译本',measurementReleaseId:null,runtimePolicyHash:null,states:{imported:true,localizationReview:'RETURNED',expertReview:'PENDING',scientificMaturity:'PILOT',scientificQualified:true,deployed:false,published:false,visible:false,trainingEntry:'PENDING',surveyEntry:'RETURNED',trainingEntryPaused:false,surveyEntryPaused:false},stage:'已导入待部署',allowActivation:false,blockers:['LOCALIZATION_REVIEW_RETURNED'],nextActions:[{code:'LOCALIZATION_REVIEW_RETURNED',stage:'译文治理审核',owner:'内容线',next:'按退回原因修订译文并递增版本，再次送审'}]};
    data={list:[{...row,instrumentVersion:query?'3.0':row.instrumentVersion}],hasMore:!next&&!query,nextCursor:!next&&!query?'fixture-page-2':null,pageSize:25};
   }
   else
   if(p==='/api/auth/me')data={id:'synthetic-system',username:'system_admin',role:'STUDENT',businessRole:'STUDENT',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',entryGrants:[],isActive:true,mustChangePassword:false};
   else if(p==='/api/platform/survey-standard/management-design')data={schemaVersion:1,rules:[{action:'people.manage',label:'管理人员与资格',training:'仅 Training',survey:'仅 Survey',school:'仅 School · 待接通',teacher:'仅 Teacher · 待接通',system:'不代管入口人员'}],families:[],boundaries:['审批不授予私有数据访问或导出权限']};
   else if(p==='/api/capabilities')data={cognitive:true,parentPortal:false};
   else if(p==='/api/platform/survey-standard/catalog'||p==='/api/platform/survey-tools/catalog')data={list:[],hasMore:false,page:1};
   else if(p==='/api/training/scale-library-governance/capabilities')data={systemAdmin:true,canReview:true,reviewGrants:[],distributionGrants:[]};
   else if(p==='/api/training/scale-library-governance/submissions'||p==='/api/training/scale-library-governance/catalog')data={list:[],hasMore:false,page:1};
   else{unexpected.push(req.method()+' '+p);await route.fulfill({status:500,json:{code:500,message:'Unknown synthetic route'}});return;}
   await route.fulfill({json:{code:0,message:'',data}});
  });
  await page.goto(binding.browserOrigin+'/admin/scale-library-governance');assert.equal(await page.evaluate(()=>window.isSecureContext&&typeof crypto.randomUUID==='function'),true,'Native secure browser capabilities required');await page.getByRole('heading',{name:'工具库治理',exact:true}).waitFor();await page.locator('.system-admin-shell').waitFor();
  assert.equal(await page.locator('.hui-survey-admin-shell,.training-workspace-shell').count(),0);
  await page.getByRole('button',{name:'接入状态',exact:true}).click();
  const first=page.getByRole('article',{name:'待审译本 · 1.0'});await first.waitFor();
  for(const text of ['已导入待部署','已退回','未发布','按退回原因修订译文并递增版本，再次送审'])await first.getByText(text,{exact:true}).waitFor();
  assert.equal(await first.getByText('已上线',{exact:true}).count(),0);
  await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByRole('article',{name:'待审译本 · 2.0'}).waitFor();assert.equal(await first.count(),0);
  await page.getByRole('button',{name:'上一页',exact:true}).click();await first.waitFor();
  await page.getByRole('searchbox',{name:'检索接入版本'}).fill(' 3.0 ');await page.getByRole('button',{name:'检索',exact:true}).click();await page.getByRole('article',{name:'待审译本 · 3.0'}).waitFor();assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:theme==='dark'?'切换为浅色外观':'切换为深色外观',exact:true}).click();
  assert.equal(await page.locator('.system-admin-shell').getAttribute('data-system-theme'),theme==='dark'?'light':'dark');
  const size=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.client,'Management horizontal overflow');assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(writes,[]);
  const imageId=width+'-'+theme,id='onboarding-'+imageId;await page.screenshot({path:out+'/'+imageId+'.png',fullPage:true});results.push({id,size,noMutation:true,errors,unexpected});await context.close();receipt.pass(id);
 }
 writeFileSync(out+'/compiled-browser.json',JSON.stringify({sourceHead:process.env.PR356_SOURCE_HEAD,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,transport:'synthetic-https-fulfillment-no-live-production-requests',artifact:{kind:'verified-independent-producer-frontend-dist',...verifiedDist.artifact,sourceHead:manifest.sourceHead??manifest.head,run:manifest.run,attempt:manifest.attempt},syntheticOnly:true,results},null,2));
}catch(error){writeFileSync(out+'/browser-failure.json',JSON.stringify({...currentDebug,error:error.message,url:currentPage?.url(),body:await currentPage?.locator('body').innerText().catch(()=>'' )},null,2));if(currentPage)await currentPage.screenshot({path:out+'/browser-failure.png',fullPage:true}).catch(()=>{});console.error(JSON.stringify({browserFailure:currentDebug,error:error.message,url:currentPage?.url()}));throw error;}finally{await resources.close();}

});
