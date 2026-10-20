/** Compiled UI integration with synthetic intercepted HTTP, NOT backend/auth E2E. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
export const REQUIRED_CHECKS = [1440,390].flatMap(width=>['course-shell','analysis-reference','pending-publication'].map(name=>`${name}-${width}`));
export const ORIGIN='https://training.eduk12.top';
const COURSE='11111111-1111-4111-8111-111111111111', PRODUCT='22222222-2222-4222-8222-222222222222';
const ACTOR='33333333-3333-4333-8333-333333333333', ITEM='44444444-4444-4444-8444-444444444444';
const course={id:COURSE,title:'合成培训课程 · 浏览器验证',creatorId:ACTOR,courseType:'TRAINING_COURSE',isLibrary:false,status:'PUBLISHED',courseCode:'SYNTHETIC',studentCount:0,description:'仅合成浏览器界面数据'};
const product={id:PRODUCT,name:'合成待核对认知发布',status:'DRAFT',revision:8,questionnaireType:'COURSE',questionnaireCourses:[],items:[{id:ITEM,type:'COGNITIVE',position:0,cognitiveAssignment:{id:ITEM,title:'合成认知单元'}}],formSections:[],publicEnabled:false};
export function fixture(method,pathname){
  if(method!=='GET')throw new Error('UNEXPECTED_MUTATION');
  const rows={
    '/api/auth/me':{id:ACTOR,username:'synthetic-teacher',name:'合成教师',role:'TEACHER',isActive:true,teacherApproved:true,mustChangePassword:false},
    '/api/auth/csrf':{csrfToken:'synthetic-ui-only'},
    '/api/capabilities':{cognitive:true,parentPortal:false},
    '/api/organizations':{list:[],total:0,page:1,pageSize:50},
    [`/api/courses/${COURSE}`]:course,
    '/api/assignments':{list:[],total:0,page:1,pageSize:20},
    '/api/checkins':{list:[],total:0,page:1,pageSize:20},
    [`/api/courses/${COURSE}/training-assessments`]:{list:[{id:PRODUCT,key:'QUESTIONNAIRE:'+PRODUCT,kind:'QUESTIONNAIRE',name:product.name,status:'DRAFT',tags:[],typeLabel:'课程问卷',unitCount:1,unitLabel:'个测评单元',manageHref:'/questionnaire-products/'+PRODUCT}],total:1,page:1,pageSize:20},
    [`/api/courses/${COURSE}/training-analysis/sources`]:{list:[{taskId:PRODUCT,taskName:'合成发布测评',publication:'2026-10-01T00:00:00.000Z',configDigest:'a'.repeat(64),variantKey:null,metrics:[{itemId:ITEM,metricKey:'score',label:'合成得分'}]}],total:1,canQuality:false,canExport:false},
    '/api/training/reference-governance/capabilities':[],
    '/api/questionnaire-products/resources':{scales:[],cognitive:[],situational:[],courses:[course]},
    [`/api/questionnaire-products/${PRODUCT}`]:product,
    [`/api/composite-assessments/${PRODUCT}/public-tokens`]:{list:[]},
  };
  if(!Object.hasOwn(rows,pathname))throw new Error('UNEXPECTED_API');
  return {code:0,data:rows[pathname]};
}
export function staticRelative(url){
  const parsed=new URL(url);
  assert.equal(parsed.origin,ORIGIN,'EXTERNAL_ORIGIN');
  const decoded=decodeURIComponent(parsed.pathname);
  assert(!decoded.includes('\\')&&!decoded.split('/').includes('..')&&!decoded.includes('\0'),'UNSAFE_STATIC_PATH');
  if(decoded.startsWith('/assets/'))return decoded.slice(1);
  if(decoded==='/favicon.ico'||decoded==='/vite.svg')return decoded.slice(1);
  if(!path.posix.extname(decoded))return 'index.html';
  throw new Error('UNEXPECTED_STATIC');
}
export function requireComplete(result){
  assert.equal(result.status,'PASS');
  assert.deepEqual(result.checks.map(row=>row.name),REQUIRED_CHECKS);
  assert(result.checks.every(row=>row.status==='PASS'));
  assert.deepEqual(result.errors,[]);
}
async function distIdentity(root){
  const hash=createHash('sha256');let count=0;
  async function visit(relative=''){
    for(const entry of (await readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=path.posix.join(relative,entry.name);
      assert(!entry.isSymbolicLink(),'DIST_SYMLINK');
      if(entry.isDirectory())await visit(name);else {assert(entry.isFile());hash.update(name+'\0');hash.update(await readFile(path.join(root,name)));count++;}
    }
  }
  await visit();assert(count>1,'EMPTY_DIST');return {sha256:hash.digest('hex'),files:count};
}
export async function run({frontendDir,playwrightModule,output}){
  const root=await realpath(frontendDir);await readFile(path.join(root,'index.html'));
  await mkdir(output,{recursive:true});
  const result={schema:1,kind:'compiled-ui-synthetic-api-integration',status:'FAIL',backendE2E:false,authenticationVerified:false,transport:'all browser requests fulfilled locally before network; no TLS qualification',dist:await distIdentity(root),checks:[],errors:[],apiReads:{}};
  const require=createRequire(import.meta.url);const {chromium}=require(await realpath(playwrightModule));
  let browser,lastPage;let active='setup';
  const record=code=>{result.errors.push({check:active,code});};
  try{
    browser=await chromium.launch({headless:true});
    for(const width of [1440,390]){
      const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',locale:'zh-CN',timezoneId:'UTC'});
      await context.addInitScript(({actor,product,item})=>{
        if(location.pathname.startsWith('/questionnaire-products/'))sessionStorage.setItem('training-cognitive-publication:'+JSON.stringify([actor,product]),JSON.stringify({actorId:actor,id:product,revision:7,itemIds:[item],hadUnknownOutcome:true}));
      },{actor:ACTOR,product:PRODUCT,item:ITEM});
      await context.route('**/*',async route=>{
        try{
          const request=route.request(),url=new URL(request.url());
          assert.equal(url.origin,ORIGIN,'EXTERNAL_REQUEST');
          if(url.pathname.startsWith('/api/')){
            const body=fixture(request.method(),url.pathname);
            result.apiReads[url.pathname]=(result.apiReads[url.pathname]||0)+1;
            return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
          }
          assert.equal(request.method(),'GET','STATIC_METHOD');
          const relative=staticRelative(request.url()),filename=await realpath(path.join(root,relative));
          assert(filename.startsWith(root+path.sep),'STATIC_ESCAPE');
          const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'}[path.extname(filename)]||'application/octet-stream';
          await route.fulfill({status:200,contentType:mime,body:await readFile(filename)});
        }catch{record('REQUEST_REJECTED');await route.abort().catch(()=>record('ABORT_FAILED'));}
      });
      await context.routeWebSocket('**/*',socket=>{record('UNEXPECTED_WEBSOCKET');socket.close();});
      const page=await context.newPage();lastPage=page;page.setDefaultTimeout(15000);
      page.on('pageerror',()=>record('PAGE_ERROR'));
      page.on('console',message=>{if(message.type()==='error')record('CONSOLE_ERROR');});
      page.on('dialog',dialog=>{record('UNEXPECTED_DIALOG');void dialog.dismiss().catch(()=>record('DIALOG_DISMISS_FAILED'));});
      async function shot(name){
        await page.evaluate(()=>document.fonts.ready);
        const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
        await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});
        assert(geometry.document<=geometry.viewport+1,'HORIZONTAL_OVERFLOW');
        assert.equal(result.errors.length,0,'BROWSER_ERRORS');
        result.checks.push({name,status:'PASS',geometry,screenshot:`${name}.png`});
      }
      active=`course-shell-${width}`;
      await page.goto(ORIGIN+`/courses/${COURSE}/detail`,{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:course.title,exact:true}).waitFor();
      assert.equal(await page.locator('main#hui-main').count(),1);
      await page.getByRole('button',{name:'测评',exact:true}).click();
      await page.getByRole('region',{name:'课程测评管理'}).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('section'),'assessments');
      await page.getByRole('link',{name:'继续编制',exact:true}).waitFor();
      await shot(active);
      active=`analysis-reference-${width}`;
      await page.getByRole('button',{name:'信息统计',exact:true}).click();
      await page.getByRole('region',{name:'课程描述性参考工作台'}).waitFor();
      await page.getByRole('region',{name:'正式参考独立审核与发布'}).waitFor();
      await page.getByRole('combobox',{name:'波次 1 任务',exact:true}).selectOption(PRODUCT);
      assert.equal(await page.getByRole('combobox',{name:'波次 1 任务',exact:true}).inputValue(),PRODUCT);
      const reference=page.getByRole('region',{name:'课程描述性参考工作台'});
      const source=reference.locator('label').filter({hasText:/^参考来源投放/}).locator('select');
      const value=await source.locator('option').nth(1).getAttribute('value');assert(value);
      await source.selectOption(value);
      assert.equal(await reference.locator('label').filter({hasText:/^参考数值指标/}).locator('select').isEnabled(),true);
      assert.equal(await page.getByRole('button',{name:'生成课程分析',exact:true}).isDisabled(),true);
      await shot(active);
      active=`pending-publication-${width}`;
      await page.goto(ORIGIN+`/questionnaire-products/${PRODUCT}`,{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'重试原修订请求',exact:true}).waitFor();
      assert.equal(await page.getByLabel('测评名称',{exact:true}).inputValue(),product.name);
      assert.equal(await page.getByLabel('测评名称',{exact:true}).isDisabled(),true);
      assert.equal(await page.getByRole('button',{name:'发布当前认知配置版本',exact:true}).isDisabled(),true);
      const readsBefore=result.apiReads[`/api/questionnaire-products/${PRODUCT}`];
      await page.getByRole('button',{name:'重新读取当前草稿',exact:true}).click();
      await page.getByText('已重新读取当前草稿。请核对认知配置及发布记录；原请求仍保持未确认。',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'发布当前认知配置版本',exact:true}).isDisabled(),true);
      assert(result.apiReads[`/api/questionnaire-products/${PRODUCT}`]>readsBefore,'REFRESH_NOT_READ');
      await shot(active);await context.close();
    }
    result.status='PASS';requireComplete(result);
  }catch{
    result.status='FAIL';record('ASSERTION_OR_RUN_FAILURE');process.exitCode=1;
    if(lastPage&&!lastPage.isClosed())await lastPage.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>record('FAILURE_SCREENSHOT_FAILED'));
  }
  finally{
    if(browser)await browser.close().catch(()=>record('BROWSER_CLOSE_FAILED'));
    if(result.errors.length)result.status='FAIL';
    await writeFile(path.join(output,'browser-result.json'),JSON.stringify(result,null,2)+'\n');
    if(result.status!=='PASS')process.exitCode=1;
  }
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];
  assert(args.includes('--frontend-dir')&&args.includes('--playwright-module')&&args.includes('--output'),'MISSING_ARGUMENT');
  await run({frontendDir:get('--frontend-dir'),playwrightModule:get('--playwright-module'),output:get('--output')}).catch(()=>{console.error('COMPILED_UI_SETUP_FAILED');process.exitCode=1;});
}
