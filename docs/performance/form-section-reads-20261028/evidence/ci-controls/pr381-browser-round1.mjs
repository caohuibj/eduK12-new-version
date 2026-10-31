import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,extname,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),front=resolve('server-version/frontend');
const dist=resolve(front,'dist'),out=resolve('onboarding-evidence/form-section-reads');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.CI,'true');
const plan=JSON.parse(process.env.PLAN);
assert.equal(plan.pr,381);assert.equal(plan.postMerge,false);assert.equal(plan.draft,false);
assert.equal(plan.head,git('rev-parse','HEAD'));assert.equal(plan.tree,git('rev-parse','HEAD^{tree}'));
assert.equal(plan.components.frontend,git('rev-parse','HEAD:server-version/frontend'));
const admitted=JSON.parse(readFileSync('onboarding-evidence/admission.json','utf8'));
assert.deepEqual(admitted.source,plan);assert.equal(admitted.testsExecutedInCI,false);
assert.equal(new Set(admitted.admitted.flatMap(row=>row.caseNames)).size,23);
mkdirSync(out,{recursive:true});
const result={source:plan,status:'RUNNING',scope:'One compiled ordinary editor GET-only consumer. Synthetic session and management DTOs; not backend authorization, actual login/START/FINAL or production network/timing evidence.',
  node:process.version,build:{status:'NOTRUN',executedThisRun:false},sandbox:null,cases:[]};
const save=()=>writeFileSync(resolve(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
save();let browser,page,context;
try{
  const {chromium}=require('../release-tools/node_modules/playwright-core');
  result.playwright=require('../release-tools/node_modules/playwright-core/package.json').version;
  // A live sandbox check precedes the sole build. A failed launch must not
  // spend or falsely qualify a production build, and has no sandbox fallback.
  browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});
  result.browserVersion=browser.version();
  result.sandbox=await require('../../server-version/e2e/school-teacher-chrome.cjs').verifyChromeSandbox(browser);
  assert.equal(result.sandbox.ok,true);save();
  const command=['run','build','--','--manifest'],started=Date.now();
  result.build={status:'RUNNING',executedThisRun:true,command:['npm',...command]};save();
  try{
    const log=execFileSync('npm',command,{cwd:front,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});
    writeFileSync(resolve(out,'build.log'),log);
    result.build={...result.build,status:'PASS',exitCode:0,elapsedMs:Date.now()-started,logSHA256:hash(Buffer.from(log))};
  }catch(error){
    const log=String(error.stdout??'')+String(error.stderr??'');writeFileSync(resolve(out,'build.log'),log);
    result.build={...result.build,status:'FAIL',exitCode:Number.isInteger(error.status)?error.status:null,signal:error.signal??null,elapsedMs:Date.now()-started,logSHA256:hash(Buffer.from(log))};
    save();throw error;
  }
  cpSync(dist,resolve(out,'dist'),{recursive:true});
  cpSync(resolve(dist,'.vite/manifest.json'),resolve(out,'manifest.json'));
  const files=[];
  function inventory(directory){for(const name of readdirSync(directory).sort()){
    const path=resolve(directory,name),stat=lstatSync(path);assert(!stat.isSymbolicLink());
    if(stat.isDirectory())inventory(path);
    else {assert(stat.isFile());const bytes=readFileSync(path);files.push({path:relative(dist,path),bytes:bytes.length,sha256:hash(bytes)});}
  }}
  inventory(dist);result.build.files=files;save();

  const base='/api/general-questionnaires/q';
  const field=(id,label,position)=>({id,label,type:'text_input',position,sectionPosition:0,required:true,placeholder:null,options:null,contextKey:null,createdAt:'2026-10-28T00:00:00.000Z',updatedAt:'2026-10-28T00:00:00.000Z'});
  const first=field('field-a','编译字段甲',0),second=field('field-b','编译字段乙',1);
  const sections=[{id:'section-a',title:'编译分区一',position:0,contextSection:false,items:[first]},
    {id:'section-b',title:'编译分区二',position:1,contextSection:false,items:[second]}];
  // Real nested section DTOs omit the parent ID. The parent's flat read has
  // that ID. One permitted flat GET remains; the manager must not issue two.
  const fixtures=new Map([
    ['/api/capabilities',{cognitive:false,parentPortal:false}],
    ['/api/auth/me',{id:'synthetic-trainer',username:'合成培训师',role:'TEACHER',platformRole:'STANDARD',mustChangePassword:false,entryGrants:[]}],
    ['/api/organizations',{allowedActions:[],platformRole:'STANDARD',list:[],total:0,page:1,pageSize:25}],
    ['/api/relational-assessments/catalog',{list:[]}],['/api/relational-assessments/tasks',{list:[]}],
    [base,{id:'q',code:'synthetic-pr381',name:'合成普通问卷',description:'',instruction:'',status:'DRAFT',estimatedTime:5}],
    [base+'/form-items',{list:[{...first,sectionId:'section-a'},{...second,sectionId:'section-b'}]}],
    [base+'/scales',{list:[]}],
    [base+'/form-sections',{list:sections}],
    [base+'/content',{units:sections.map(section=>({type:'form-section',id:section.id,label:section.title,position:section.position,itemCount:section.items.length,contextSection:false}))}],
    ['/api/scales?status=PUBLISHED&page=1&pageSize=100',{list:[]}],
  ]);
  writeFileSync(resolve(out,'fixtures.json'),JSON.stringify([...fixtures],null,2)+'\n');
  result.fixtureSHA256=hash(readFileSync(resolve(out,'fixtures.json')));
  const host='training.eduk12.top',routePath='/general-questionnaires/q/edit';
  const row={name:'compiled-ordinary-editor-section-fields',host,path:routePath,status:'RUNNING',api:[],static:[],documents:0,errors:[]};
  result.cases.push(row);save();
  context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  page=await context.newPage();page.on('pageerror',error=>row.errors.push(error.message));
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'};
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const refuse=reason=>{row.errors.push(reason);return route.abort();};
    if(url.origin!=='https://'+host)return refuse('Unexpected external origin '+url.origin);
    if(request.method()!=='GET')return refuse('GET-only fixture refuses '+request.method()+' '+url.pathname);
    if(request.resourceType()==='document')row.documents++;
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname+url.search;row.api.push({path:key,method:request.method()});
      if(!fixtures.has(key))return refuse('Unexpected API '+key);
      return route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,message:'成功',data:fixtures.get(key)})});
    }
    const file=resolve(dist,url.pathname.replace(/^\/+/,''));
    if(file!==dist&&!file.startsWith(dist+'/'))return refuse('Invalid static path');
    if(existsSync(file)&&lstatSync(file).isFile()&&extname(file)){
      row.static.push(url.pathname);return route.fulfill({path:file,contentType:mime[extname(file)]??'application/octet-stream'});
    }
    if(url.pathname===routePath)return route.fulfill({path:resolve(dist,'index.html'),contentType:'text/html'});
    return refuse('Unexpected static or document '+url.pathname);
  });
  await page.goto('https://'+host+routePath,{waitUntil:'domcontentloaded'});
  await page.getByLabel('问卷名称 *',{exact:true}).waitFor();
  await page.getByRole('button',{name:'内容编排',exact:true}).click();
  const select=page.getByRole('combobox',{name:'向编译分区二添加字段',exact:true});
  await select.waitFor();
  row.fieldOptions=await select.locator('option').allTextContents();
  assert(row.fieldOptions.includes('编译字段甲'));
  assert(!row.fieldOptions.includes('编译字段乙'));
  for(const suffix of ['/form-items','/form-sections','/content'])assert.equal(row.api.filter(request=>request.path===base+suffix).length,1,suffix+' count');
  assert.equal(row.documents,1);assert.deepEqual(row.errors,[]);
  await page.screenshot({path:resolve(out,'compiled-ordinary-editor.png'),fullPage:true,animations:'disabled'});
  assert.deepEqual(row.errors,[]);row.status='PASS';
  assert.equal(result.cases.length,1);assert(result.cases.every(row=>row.status==='PASS'));
  result.status='PASS';save();
}catch(error){
  result.status='FAIL';result.error=String(error.stack??error);
  for(const row of result.cases)if(row.status==='RUNNING')row.status='FAIL';
  save();throw error;
}finally{
  await context?.close();await browser?.close();save();
}
