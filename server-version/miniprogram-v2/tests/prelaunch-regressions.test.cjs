const {test}=require('node:test')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {createRequire}=require('node:module')
const {platform,response,csrf,session,user}=require('./helpers.cjs')
const {createRuntime}=require('../app/bootstrap/index')
const {createOperations}=require('../domains/operations/service')
const {createApiClient}=require('../core/api/client')
const origin='https://acceptance.example',root=path.resolve(__dirname,'..')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function page(name,app,t) {
 const file=path.join(root,'pages',name+'.js');let spec
 const previous={getApp:global.getApp,wx:global.wx}
 global.getApp=()=>app;global.wx=app.p;t.after(()=>Object.assign(global,previous))
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),getApp:()=>app,wx:app.p,Page:value=>spec=value,Promise,Date,console})
 return Object.assign({},spec,{data:structuredClone(spec.data),setData(v){Object.assign(this.data,v)}})
}
async function setup(handler=()=>response(null),role='STUDENT') {
 const u=user(role),p=platform(o=>{
  const endpoint=o.url.slice((origin+'/api').length).split('?')[0]
  if(endpoint==='/auth/csrf')return csrf()
  if(endpoint==='/auth/login')return response({user:u},200,session())
  if(endpoint==='/auth/me')return response(u)
  if(endpoint==='/capabilities')return response({parentPortal:true})
  if(endpoint==='/auth/logout')return response(null)
  return handler(o,endpoint)
 })
 const runtime=createRuntime(p,origin);runtime.operations=createOperations(runtime.api,runtime.session)
 await runtime.session.login({username:'synthetic',password:'synthetic123'})
 return {runtime,p,ready:Promise.resolve()}
}
function client(platform,jar,onExpired) {
 return createApiClient({platform,jar,config:{apiBase:origin+'/api',timeout:1000},
  network:{isOnline:()=>true},telemetry:{record(){}},onExpired})
}
test('late form preparation cannot restore form memory after logout',async t=>{
 let finish;const app=await setup(),view=page('operation/index',app,t)
 app.runtime.operations.prepare=()=>new Promise(resolve=>{finish=()=>resolve({fields:[{key:'content',value:'private'}],images:[],title:'old form'})})
 view.onLoad({domain:'assignments',id:'task-1',action:'submit'})
 const pending=view.onShow();await tick();await app.runtime.session.logout();
 assert.doesNotThrow(()=>view.change({currentTarget:{dataset:{key:'content'}},detail:{value:'late old input'}}));
 await view.choose({currentTarget:{dataset:{key:'courseId'}}});finish();await pending
 assert.equal(view.form,null);assert.equal(Object.keys(view.values).length,0);assert.equal(view.data.fields?.length||0,0)
 view.onUnload()
})
test('response delayed by encrypted cookie persistence cannot cross a session change',async()=>{
 let epoch=0,finish
 const jar={epoch:()=>epoch,header:()=>'',csrf:()=>null,absorb:()=>new Promise(resolve=>{finish=resolve})}
 const api=client({request:o=>o.success(response({private:'old-user'}))},jar)
 const pending=api.get('/users/self');await tick();epoch++;finish()
 await assert.rejects(pending,e=>e.kind==='sessionChanged')
})
test('upload rechecks session after CSRF preparation and before native dispatch',async()=>{
 let epoch=0,ready=false,uploads=0
 const jar={epoch:()=>epoch,header:()=>epoch?'new-user':'old-user',
  csrf(){if(!ready)return null;queueMicrotask(()=>{epoch++});return 'csrf-one'},
  async absorb(){ready=true}}
 const api=client({request:o=>o.success(csrf()),uploadFile:o=>{uploads++;o.success({statusCode:200,data:JSON.stringify(response({assetId:'asset-1'}).data)})}},jar)
 await assert.rejects(api.upload('/uploads/image','temporary-image'),e=>e.kind==='sessionChanged')
 assert.equal(uploads,0)
})
test('authenticated asset 401 clears login and discards the downloaded error file',async()=>{
 let expired=0;const removed=[]
 const jar={epoch:()=>0,header:()=>'',csrf:()=>null,absorb:async()=>{}}
 const api=client({request:o=>o.success(response(null,401)),downloadFile:o=>o.success({statusCode:401,tempFilePath:'error-file'}),getFileSystemManager:()=>({unlink:o=>removed.push(o.filePath)})},jar,async()=>{expired++})
 await assert.rejects(api.downloadAsset('/api/assets/a/content?signature=x'),e=>e.status===401)
 assert.equal(expired,1);assert.deepEqual(removed,['error-file'])
})
test('Retry-After retains the sealed assignment answer and prevents immediate replay',async t=>{
 let writes=0
 const app=await setup((o,p)=>p.startsWith('/mobile/context/')?response({allowedActions:['submit'],commandKey:'12345678-1234-1234-1234-123456789abc'}):
  p==='/assignments/task-1'?response({questions:[],mySubmission:null}):(++writes,response(null,429,[],{'Retry-After':'30'})))
 const view=page('operation/index',app,t);view.onLoad({domain:'assignments',id:'task-1',action:'submit'});await view.onShow()
 view.change({currentTarget:{dataset:{key:'content'}},detail:{value:'original'}});view.confirm();await view.submit()
 view.change({currentTarget:{dataset:{key:'content'}},detail:{value:'edited'}});view.confirm();await view.submit()
 assert.equal(view.values.content,'original');assert.equal(view.sealed.content,'original');assert.equal(writes,1)
 view.onUnload()
})
test('native cover picker return does not reload detail or discard the chosen cover',async t=>{
 let finish,prepares=0,uploads=0
 const app=await setup(()=>response(null),'TEACHER')
 app.runtime.operations.detail=async()=>{prepares++;return {title:'Course',actions:[{key:'cover'}]}}
 app.runtime.operations.uploadCover=async()=>{uploads++}
 app.p.chooseMedia=o=>{finish=()=>o.success({tempFiles:[{tempFilePath:'cover-image',fileType:'image',size:12}]})}
 const view=page('detail/index',app,t);view.onLoad({domain:'courses',id:'course-1'});await view.onShow()
 const pending=view.action({currentTarget:{dataset:{key:'cover'}}});await tick()
 if(view.onHide)view.onHide();await view.onShow();finish();await pending
 assert.equal(uploads,1);assert.equal(prepares,2)
 view.onUnload()
})
test('public checkin retains text and capability while native media picker is open',async t=>{
 let finish,uploads=0
 const app=await setup()
 app.runtime.publicCheckins={open:async()=>({checkin:{title:'Checkin',images:[]}}),media:async()=>[],discard(){},
  upload:async()=>{uploads++;return {assetId:'asset-1'}}}
 app.p.chooseMedia=o=>{finish=()=>o.success({tempFiles:[{tempFilePath:'image',fileType:'image',size:12}]})}
 const view=page('public-checkin/index',app,t);view.onLoad({token:'ck_1234567890123456'});await view.load()
 view.change({detail:{value:'draft text'}})
 const pending=view.upload();await tick();view.onHide();await view.onShow();finish();await pending
 assert.equal(uploads,1);assert.equal(view.data.content,'draft text');assert.equal(view.images.length,1)
 view.onUnload()
})

test('expired signed image does not log out a still-valid account',async()=>{
 let expired=0,probes=0
 const jar={epoch:()=>0,header:()=>'',csrf:()=>null,absorb:async()=>{}}
 const api=client({request:o=>{probes++;o.success(response({id:'current-user'}))},downloadFile:o=>o.success({statusCode:401,tempFilePath:'expired-file'})},jar,async()=>{expired++})
 await assert.rejects(api.downloadAsset('/api/assets/a/content?expires=1&signature=x'),e=>e.kind==='unavailable')
 assert.equal(expired,0);assert.equal(probes,1)
})

test('new deep link wins over an older pending entry resolution',async t=>{
 const app=await setup();let finish
 app.pendingEntry={kind:'course',id:'old-course',requiresAuth:true}
 app.runtime.domains={detail:async(_,id)=>id==='old-course'?new Promise(resolve=>{finish=resolve}):{title:'new'}}
 const view=page('entry/index',app,t),old=view.enter();await tick()
 app.pendingEntry={kind:'course',id:'new-course',requiresAuth:true};await view.enter();finish({title:'old'});await old
 assert.equal(app.p.navigation.at(-1),'/pages/detail/index?domain=courses&id=new-course')
 assert.equal(app.p.navigation.length,1);view.onUnload()
})
test('late login completion cannot redirect a page the user already left',async t=>{
 const app=await setup(),view=page('auth/login/index',app,t);let finish
 app.runtime.session.login=()=>new Promise(resolve=>{finish=resolve})
 Object.assign(view.data,{username:'synthetic',password:'synthetic123'});const pending=view.submit()
 view.onUnload();finish();await pending
 assert.equal(app.p.navigation.length,0);assert.equal(view.data.password,'')
})
test('workspace awaiting foreground bootstrap does not load after unload',async t=>{
 const app=await setup();let finish,loads=0;app.ready=new Promise(resolve=>{finish=resolve})
 app.runtime.operations.detail=async()=>{loads++;return {title:'private'}}
 const view=page('detail/index',app,t);view.onLoad({domain:'courses',id:'course-1'})
 const pending=view.onShow();view.onUnload();finish();await pending
 assert.equal(loads,0);assert.equal(view.data.title,'Huisurvey')
})
test('late tool policy and organization form cannot restore internal authority snapshots',async t=>{
 const app=await setup(()=>response(null),'ADMIN');let finish
 app.runtime.toolPolicies={read:()=>new Promise(resolve=>{finish=()=>resolve({policy:{mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]},allowedActions:['UPDATE']})})}
 const view=page('tool-policy/index',app,t);view.onLoad({family:'SCALE',key:'tool',version:'1'})
 const pending=view.onShow();await tick();view.onUnload();finish();await pending;assert.equal(view.snapshot,null)
 const next=page('organizations/index',app,t)
 app.runtime.organizations={view:async()=>({title:'Organization',actions:[{key:'CREATE_RUN'}]}),form:()=>new Promise(resolve=>{finish=()=>resolve({fields:[{key:'name',value:'private'}]})})}
 next.onLoad({view:'runs',organizationId:'org-1'});await next.onShow()
 const action=next.action({currentTarget:{dataset:{key:'CREATE_RUN'}}});await tick();next.onUnload();finish();await action;assert.equal(next.form,null)
})

test('encrypted login storage failure stays visible without persisting a session',async t=>{
 const u=user(),p=platform(o=>o.url.endsWith('/auth/csrf')?csrf():o.url.endsWith('/auth/login')?response({user:u},200,session()):response(u))
 p.setStorage=o=>queueMicrotask(()=>o.fail({errMsg:'setStorage:fail quota secret-device-path'}))
 const app={p,runtime:createRuntime(p,origin),ready:Promise.resolve()},view=page('auth/login/index',app,t)
 Object.assign(view.data,{username:'synthetic',password:'synthetic123'});await view.submit()
 assert.match(view.data.errorMessage,/无法安全保存登录/);assert.ok(!view.data.errorMessage.includes('secret'))
 assert.equal(app.runtime.session.get().user,null);assert.equal(p.stored.size,0);assert.equal(p.navigation.length,0)
 view.onUnload()
})
test('clearing an absent session is successful without a synchronous storage fallback',async()=>{
 const {createStorage}=require('../core/storage/index')
 const p={removeStorage:o=>o.fail({errMsg:'removeStorage:fail data not found'})}
 await assert.doesNotReject(createStorage(p,origin).writeSession(null))
})
