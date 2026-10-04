const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {createRequire}=require('node:module')
const {platform,response,csrf,session,user}=require('./helpers.cjs');const {createRuntime}=require('../app/bootstrap/index');const {createDomainService}=require('../domains/shared/service');const {createWorkspaceService}=require('../workspaces/service')
const origin='https://acceptance.example';const root=path.resolve(__dirname,'..')
function loadPage(name,app,p,t){
 const file=path.join(root,'pages',name+'.js');let spec
 const previous={getApp:global.getApp,wx:global.wx};global.getApp=()=>app;global.wx=p;t.after(()=>{global.getApp=previous.getApp;global.wx=previous.wx})
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),getApp:()=>app,wx:p,Page:value=>{spec=value},console,Promise})
 const instance=Object.assign({},spec,{data:structuredClone(spec.data),setData(value){Object.assign(this.data,value)}})
 return instance
}
function setup(role='STUDENT',mustChangePassword=false){
 let loggedIn=false
 const p=platform(o=>{const key=o.url.slice((origin+'/api').length).split('?')[0]
  if(key==='/auth/csrf')return csrf()
  if(key==='/auth/login'){loggedIn=true;return response({user:user(role,mustChangePassword)},200,session())}
  if(key==='/auth/logout'){loggedIn=false;return response(null,200,['ptool_session=; Max-Age=0'])}
  if(key==='/auth/me')return loggedIn?response(user(role,mustChangePassword)):response(null,401)
  if(key==='/capabilities')return response({cognitive:false})
  if(key==='/auth/change-password'){mustChangePassword=false;return response(null)}
  if(['/courses','/courses/my','/organizations','/users'].includes(key))return response({list:[{id:'resource-1',title:'示例',name:'组织'}],total:1})
  if(key==='/courses/my/tasks')return response({list:[{id:'task-1',title:'作业',state:'PENDING',canStart:true,courses:[]}],total:1})
  if(key==='/my-assessments')return response({list:[],truncated:false})
  if(key==='/courses/resource-1')return response({title:'获准课程'})
  throw new Error('unexpected '+key)
 })
 const runtime=createRuntime(p,origin);runtime.domains=createDomainService(runtime.api,runtime.session);runtime.workspaces=createWorkspaceService(runtime.domains,runtime.session)
 return {runtime,ready:Promise.resolve(),pendingEntry:null,p}
}
for(const role of ['STUDENT','PARENT','TEACHER','ADMIN'])test('actual '+role+' page lifecycle login → home → profile → logout',async t=>{
 const app=setup(role);const p=app.p
 const login=loadPage('auth/login/index',app,p,t);login.data.username='test';login.data.password='secret123';await login.submit();assert.equal(login.data.password,'');assert.equal(p.navigation.at(-1),'/pages/entry/index')
 const entry=loadPage('entry/index',app,p,t);entry.onLoad({});await entry.enter();assert.equal(p.navigation.at(-1),'/pages/home/index')
 const home=loadPage('home/index',app,p,t);home.onLoad({});await home.onShow();assert.equal(home.data.status,'ready');assert.ok(home.data.blocks.length);assert.ok(home.data.navItems.length>=3)
 const profile=loadPage('profile/index',app,p,t);profile.onLoad({});await profile.onShow();assert.equal(profile.data.username,role.toLowerCase());await profile.logout();assert.equal(app.runtime.session.get().user,null);assert.equal(profile.data.username,null);assert.equal(home.data.blocks.length,0);assert.equal(p.stored.size,0);assert.equal(p.navigation.at(-1),'/pages/auth/login/index');home.onUnload();profile.onUnload()
})
test('entry preserves QR until login then authorizes and opens shared detail',async t=>{const app=setup();app.pendingEntry={kind:'course',id:'resource-1',requiresAuth:true};const entry=loadPage('entry/index',app,app.p,t);await entry.enter();assert.equal(app.p.navigation.at(-1),'/pages/auth/login/index');assert.ok(app.pendingEntry);await app.runtime.session.login({username:'test',password:'secret123'});await entry.enter();assert.equal(app.pendingEntry,null);assert.equal(app.p.navigation.at(-1),'/pages/detail/index?domain=courses&id=resource-1')})
test('required password flow blocks home and uses canonical password mutation',async t=>{const app=setup('ADMIN',true);await app.runtime.session.login({username:'test',password:'secret123'});const home=loadPage('home/index',app,app.p,t);home.onLoad({});await home.onShow();assert.equal(app.p.navigation.at(-1),'/pages/auth/password/index');const page=loadPage('auth/password/index',app,app.p,t);Object.assign(page.data,{oldPassword:'temporary123',newPassword:'newsecret123',confirmation:'newsecret123'});await page.submit();assert.equal(app.runtime.session.get().user.mustChangePassword,false);assert.equal(page.data.newPassword,'');assert.equal(app.p.navigation.at(-1),'/pages/entry/index');home.onUnload()})
test('duplicate login tap sends one write and presents request failure',async t=>{const app=setup();let release;let count=0;app.runtime.session.login=()=>{count++;return new Promise(resolve=>{release=resolve})};const login=loadPage('auth/login/index',app,app.p,t);Object.assign(login.data,{username:'test',password:'secret123'});const pending=login.submit();await login.submit();assert.equal(count,1);assert.equal(login.data.status,'submitting');release();await pending;assert.equal(login.data.status,'ready')})
test('expired resource returns recoverable error on actual detail page',async t=>{const app=setup();await app.runtime.session.login({username:'test',password:'secret123'});app.runtime.domains.detail=async()=>{throw new Error('内容不存在或已移除')};const page=loadPage('detail/index',app,app.p,t);page.onLoad({domain:'courses',id:'missing'});await page.onShow();assert.equal(page.data.status,'error');assert.equal(page.data.errorMessage,'内容不存在或已移除');app.runtime.domains.detail=async()=>({title:'恢复课程',status:'ACTIVE'});await page.retry();assert.equal(page.data.status,'ready');assert.equal(page.data.title,'恢复课程');page.onUnload()})
test('list pagination is sequential and empty state is visible',async t=>{const app=setup('ADMIN');await app.runtime.session.login({username:'test',password:'secret123'});app.runtime.domains.list=async(_,page=1)=>({title:'用户',list:page===1?[{id:'one'}]:[{id:'two'}],total:21,hasMore:page===1});const page=loadPage('list/index',app,app.p,t);page.onLoad({domain:'users'});await page.onShow();await Promise.all([page.more(),page.more()]);assert.equal(page.data.list.length,2);assert.equal(page.data.hasMore,false);app.runtime.domains.list=async()=>({title:'用户',list:[],total:0});await page.retry();assert.equal(page.data.status,'empty');page.onUnload()})
test('foreground refresh and deep link redirection use App lifecycle',async t=>{let spec;const file=path.join(root,'app.js');const p=platform(o=>o.url.endsWith('/capabilities')?response({cognitive:false}):response(user()));vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:key=>key==='./core/config/environment'?{origins:{develop:'https://acceptance.eduk12.top',trial:'https://trial.eduk12.top',release:'https://eduk12.top'}}:createRequire(file)(key),wx:p,App:value=>{spec=value},Date,Promise});spec.onLaunch({query:{}});await spec.ready;const before=p.calls.length;spec.onHide();spec.hiddenAt=Date.now()-31000;spec.onShow({query:{kind:'course',id:'resource-1'}});await spec.ready;assert.equal(p.calls.length-before,2);assert.equal(spec.pendingEntry.id,'resource-1');assert.equal(p.navigation.at(-1),'/pages/entry/index')})
