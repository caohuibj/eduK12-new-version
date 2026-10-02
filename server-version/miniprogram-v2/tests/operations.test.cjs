const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module')
const {platform,response,csrf,session,user}=require('./helpers.cjs')
const {createRuntime}=require('../app/bootstrap/index'),{createOperations}=require('../domains/operations/service'),{createOrganizationService}=require('../domains/organizations/service'),{createClassroomService}=require('../domains/classrooms/service'),{createPublicCheckinService}=require('../domains/public-checkin/service'),{createToolPolicyService}=require('../domains/parents/tool-policy'),{createDomainService}=require('../domains/shared/service')
const origin='https://acceptance.example',root=path.resolve(__dirname,'..'),key='12345678-1234-1234-1234-123456789abc'
function setup(role='STUDENT',handler=()=>{throw new Error('unexpected fixture')},extra={}){
 const u=user(role);Object.assign(u.mobile.capabilities,extra)
 const p=platform(o=>{const endpoint=o.url.slice((origin+'/api').length).split('?')[0];if(endpoint==='/auth/csrf')return csrf();if(endpoint==='/auth/login')return response({user:u},200,session());if(endpoint==='/auth/me')return response(u);if(endpoint==='/capabilities')return response({cognitive:false});if(endpoint==='/auth/logout')return response(null);return handler(o,endpoint)})
 const runtime=createRuntime(p,origin);runtime.operations=createOperations(runtime.api,runtime.session);runtime.organizations=createOrganizationService(runtime.api,runtime.session);runtime.classrooms=createClassroomService(runtime.api,runtime.session);runtime.publicCheckins=createPublicCheckinService(runtime.api);runtime.toolPolicies=createToolPolicyService(runtime.api,runtime.session);runtime.domains=createDomainService(runtime.api,runtime.session);runtime.domains.operations=runtime.operations
 return {runtime,p,ready:Promise.resolve()}
}
async function authenticated(app){await app.runtime.session.login({username:'synthetic',password:'synthetic123'});return app}
function page(name,app,t){const file=path.join(root,'pages',name+'.js');let spec;const timers=new Map();let timerId=0;const previous={getApp:global.getApp,wx:global.wx};global.getApp=()=>app;global.wx=app.p;t.after(()=>Object.assign(global,previous));vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),getApp:()=>app,wx:app.p,Page:value=>spec=value,console,Promise,Date,setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id)});return Object.assign({},spec,{data:structuredClone(spec.data),timers,setData(v){Object.assign(this.data,v)}})}
const context=allowed=>response({allowedActions:allowed,commandKey:key,fields:{}})
test('role-feature-action discovery prevents local teacher and parent grants',async()=>{
 const parent=await authenticated(setup('PARENT'));await assert.rejects(parent.runtime.operations.list('users'),e=>e.kind==='forbidden');await assert.rejects(parent.runtime.operations.list('courses'),e=>e.kind==='forbidden')
 const teacher=await authenticated(setup('TEACHER'));await assert.rejects(teacher.runtime.operations.list('users'),e=>e.kind==='forbidden');await assert.rejects(teacher.runtime.toolPolicies.read({family:'SCALE',key:'x',version:'1'}),e=>e.kind==='forbidden')
})
test('course list uses one bounded discovery response and ordinary detail uses two calls',async()=>{
 const app=await authenticated(setup('TEACHER',(o,p)=>p==='/mobile/lists/courses'?response({list:[{id:'course-1',title:'Course'}],total:1,page:1,pageSize:20,allowedActions:['create'],commandKey:key}):p==='/courses/course-1'?response({title:'Course',images:[]}):context(['edit'])))
 const before=app.p.calls.length,result=await app.runtime.operations.list('courses');assert.equal(app.p.calls.length-before,1);assert.equal(result.actions[0].key,'create')
 const next=app.p.calls.length;assert.equal((await app.runtime.operations.detail('courses','course-1')).actions[0].key,'edit');assert.equal(app.p.calls.length-next,2)
})
test('student assignment payload binds canonical answer ids, revision and one server key',async()=>{
 const app=await authenticated(setup('STUDENT',(o,p)=>p.startsWith('/mobile/context/')?context(['submit']):p==='/assignments/task-1'?response({title:'Task',questions:[{id:'q1',type:'multiple_choice',question:'Q',options:[{key:'A',text:'A'},{key:'B',text:'B'}]}],mySubmission:{revision:3,content:'old',answers:{q1:'A,B'}}}):response({revision:4})))
 const form=await app.runtime.operations.prepare('assignments','task-1','submit');assert.deepEqual(form.fields.find(f=>f.key==='answer:q1').value,['A','B']);await app.runtime.operations.execute('assignments','task-1','submit',form,{'answer:q1':['B'],content:'new'})
 const sent=app.p.calls.at(-1);assert.equal(sent.header['Idempotency-Key'],key);assert.deepEqual(sent.data,{content:'new',expectedRevision:3,answers:{q1:'B'}})
 await assert.rejects(app.runtime.operations.execute('assignments','other','submit',form,{}),e=>e.kind==='invalidRequest')
})
test('actual operation page keeps draft after selector, coalesces taps and retains exact uncertain submit',async t=>{
 let writes=0,release,selected
 const app=await authenticated(setup('STUDENT',(o,p)=>p.startsWith('/mobile/context/')?context(['submit']):p==='/assignments/task-1'?response({questions:[],mySubmission:null}):new Promise((resolve,reject)=>{writes++;release=()=>reject(new Error('network'));})))
 const view=page('operation/index',app,t);view.onLoad({domain:'assignments',id:'task-1',action:'submit'});await view.onShow();view.change({currentTarget:{dataset:{key:'content'}},detail:{value:'draft'}});await view.onShow();assert.equal(view.values.content,'draft');view.confirm();const pending=view.submit();await view.submit();await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,1);release();await pending;assert.equal(view.sealed.content,'draft');view.change({currentTarget:{dataset:{key:'content'}},detail:{value:'changed'}});assert.equal(view.values.content,'draft');assert.equal(view.data.sealed,true);view.onUnload()
})
test('validation failure permits correction; uncertain create requires reconciliation',async t=>{
 const app=await authenticated(setup('TEACHER',(o,p)=>p.startsWith('/mobile/context/')?context(['create']):Promise.reject(new Error('lost')))),view=page('operation/index',app,t)
 view.onLoad({domain:'courses',action:'create'});await view.onShow();view.confirm();await view.submit();assert.equal(view.data.conflict,false);assert.match(view.data.formError,/课程名称/)
 view.change({currentTarget:{dataset:{key:'title'}},detail:{value:'Course'}});view.confirm();await view.submit();assert.equal(view.data.conflict,true);assert.match(view.data.formError,/确认结果未知/);view.onUnload()
})
test('logout clears form memory and prevents late mutation confirmation',async t=>{
 let release;const app=await authenticated(setup('TEACHER',(o,p)=>p.startsWith('/mobile/context/')?context(['create']):new Promise(resolve=>release=()=>resolve(response({id:'created'}))))),view=page('operation/index',app,t)
 view.onLoad({domain:'courses',action:'create'});await view.onShow();view.change({currentTarget:{dataset:{key:'title'}},detail:{value:'private draft'}});view.confirm();const pending=view.submit();await new Promise(resolve=>setImmediate(resolve));await app.runtime.session.logout();release();await pending;assert.equal(view.form,null);assert.equal(Object.keys(view.values).length,0);assert.equal(view.data.result,null);view.onUnload()
})
test('full screen multi-selector preserves selections through pagination and emits canonical ids',async t=>{
 let emitted;const app=await authenticated(setup('ADMIN',(o,p)=>response({list:o.url.includes('page=2')?[{id:'two',nickname:'Second'}]:[{id:'one',nickname:'First'}],total:21,page:o.url.includes('page=2')?2:1,pageSize:20}))),view=page('select/index',app,t)
 view.getOpenerEventChannel=()=>({emit:(name,data)=>emitted={name,data}});app.p.navigateBack=()=>{};view.onLoad({domain:'shareTargets',parent:'course-1',multiple:'1'});await view.onShow();view.select({detail:{id:'one'}});await view.more();view.select({detail:{id:'two'}});view.done();assert.equal(emitted.name,'selected');assert.deepEqual(Array.from(emitted.data.value),['one','two']);assert.ok(app.p.calls.some(c=>c.url.includes('/mobile/courses/course-1/share-options')));view.onUnload()
})
test('organization form narrows one policy tuple and exact population instead of copying all released roles',async()=>{
 const resource={family:'SCALE',key:'tool',version:'1',title:'Tool',subjectRoles:['STUDENT','PARENT'],respondentRoles:['STUDENT','PARENT'],relationshipKinds:['SELF','PARENT_CHILD'],perspectives:['SELF_REPORT','OBSERVER_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'policy',minimumRespondents:null}
 const app=await authenticated(setup('TEACHER',(o,p)=>p.endsWith('/context')?response({organization:{},allowedActions:['ASSESSMENT_DELIVERY']}):p.endsWith('/run-resources')?response({list:[resource]}):o.method==='GET'?response({availableActions:['ADD_TRACK']}):response({id:'track'})))
 const options={organizationId:'org-1',runId:'run-1',action:'ADD_TRACK'},form=await app.runtime.organizations.form(options);await app.runtime.organizations.execute(options,form,{subjectKind:'MEMBERSHIP_IDS',subjectIds:'member-1,member-2'})
 const body=app.p.calls.at(-1).data;assert.deepEqual(body.requestedPolicy.subjectRoles,['STUDENT']);assert.deepEqual(body.subjectSelector,{kind:'MEMBERSHIP_IDS',membershipIds:['member-1','member-2']});assert.equal(body.respondentSelector.kind,'ALL_CURRENT')
})
test('run page previews one version before publishing and clears preview after conflict',async t=>{
 let version=5;const app=await authenticated(setup('TEACHER',(o,p)=>p.endsWith('/preview')?response({version:5,tracks:[{subjectCount:2,respondentCount:3,executionCount:4}]}):p.endsWith('/publish')?response(null,409):response({run:{name:'Run',status:'DRAFT',version},tracks:[],availableActions:['PREVIEW_PUBLISH']}))),view=page('organizations/index',app,t)
 view.onLoad({view:'run',organizationId:'org-1',runId:'run-1'});await view.onShow();await view.action({currentTarget:{dataset:{key:'PREVIEW_PUBLISH'}}});assert.equal(view.previewVersion,5);view.confirm();await view.submit();const sent=app.p.calls.find(o=>o.url.endsWith('/publish'));assert.deepEqual(sent.data,{expectedVersion:5});assert.match(view.data.formError,/重新预览/);view.onUnload()
})
function classroomState(proof='2026-10-02T00:00:00.000Z'){return {classroom:{name:'Class',status:'ACTIVE'},question:{id:'q1',startedAt:proof,timeLimit:60,questionContent:{type:'multiple_choice',question:'Q',options:[{value:'A',label:'A'},{value:'B',label:'B'}]}},serverNow:proof,availableActions:['SUBMIT','LEAVE'],submitted:false}}
test('classroom page stops background polls and clears previous round draft',async t=>{
 let snapshot=classroomState();const app=await authenticated(setup('STUDENT',(o,p)=>response(snapshot),{canUseClassroomRuntime:true,canJoinClassroom:true})),view=page('classroom/index',app,t)
 view.onLoad({id:'class-1'});await view.onShow();assert.equal(view.timers.size,1);view.changeAnswer({detail:{value:['A']}});snapshot=classroomState('2026-10-02T00:01:00.000Z');await view.poll();assert.equal(view.answer,'');view.onHide();assert.equal(view.timers.size,0);assert.equal(view.data.question,null);await view.onShow();assert.equal(view.timers.size,1);view.onUnload();assert.equal(view.timers.size,0)
})
test('classroom answer uses startedAt proof, canonical multi-answer and suppresses duplicate tap',async t=>{
 let release,writes=0;const snapshot=classroomState();const app=await authenticated(setup('STUDENT',(o,p)=>o.method==='GET'?response(snapshot):new Promise(resolve=>{writes++;release=()=>resolve(response({submitted:true}))}),{canUseClassroomRuntime:true})),view=page('classroom/index',app,t)
 view.onLoad({id:'class-1'});await view.onShow();view.changeAnswer({detail:{value:['A','B']}});const pending=view.submit();await view.submit();await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,1);const body=app.p.calls.at(-1).data;assert.deepEqual(JSON.parse(JSON.stringify(body)),{questionId:'q1',startedAt:snapshot.question.startedAt,answer:'A,B'});snapshot.availableActions=['LEAVE'];snapshot.submitted=true;release();await pending;assert.equal(view.data.canSubmit,false);assert.equal(view.data.submitted,true);view.onUnload()
})
test('late classroom poll after page hide cannot restore question or restart polling',async t=>{
 let release;const app=await authenticated(setup('STUDENT',(o,p)=>response(classroomState()),{canUseClassroomRuntime:true})),view=page('classroom/index',app,t)
 view.onLoad({id:'class-1'});await view.onShow();app.runtime.classrooms.state=()=>new Promise(resolve=>release=resolve);const pending=view.poll();view.onHide();release(classroomState());await pending;assert.equal(view.data.question,null);assert.equal(view.timers.size,0);view.onUnload()
})
test('public checkin requests bind header capabilities and omit logged-in Cookie and CSRF',async()=>{
 const app=await authenticated(setup('STUDENT',(o,p)=>p.endsWith('/submit')?response({submitted:true}):response({checkin:{title:'Public'},sessionId:'session_1234567890abcdef',sessionCapability:'v1.9999999999.'+'a'.repeat(43),sessionExpiresAt:'2099-01-01T00:00:00.000Z'}))),token='p'.repeat(32),context=await app.runtime.publicCheckins.open(token)
 await app.runtime.publicCheckins.submit(context,'Public text',[]);const call=app.p.calls.at(-1);assert.equal(call.header.Cookie,undefined);assert.equal(call.header['X-CSRF-Token'],undefined);assert.equal(call.header['X-Checkin-Token'],token);assert.equal(call.header['X-Checkin-Session-Capability'],context.sessionCapability);assert.equal(call.data.studentId,undefined)
 await assert.rejects(app.runtime.api.post('/users',{}, {scope:'public',publicCheckin:context}),e=>e.kind==='invalidRequest')
})
test('upload layer coalesces CSRF, uses bounded allowlist and never retries mutation',async()=>{
 const app=await authenticated(setup('STUDENT')),calls=[];app.p.uploadFile=o=>{calls.push(o);queueMicrotask(()=>o.fail({}))};await assert.rejects(app.runtime.api.upload('/checkins/task-1/submission-image','synthetic-image'),e=>e.kind==='network');assert.equal(calls.length,1);assert.ok(calls[0].header.Cookie);assert.ok(calls[0].header['X-CSRF-Token']);await assert.rejects(app.runtime.api.upload('/uploads/unsafe','synthetic-image'),e=>e.kind==='invalidRequest')
})
test('asset download rejects foreign URLs before native request and discards stale private file',async()=>{
 const app=await authenticated(setup('STUDENT')),calls=[],discard=[];let finish;app.p.downloadFile=o=>{calls.push(o);finish=()=>o.success({statusCode:200,tempFilePath:'tmp-image'})};app.p.getFileSystemManager=()=>({unlink:o=>discard.push(o.filePath)})
 await assert.rejects(app.runtime.api.downloadAsset('https://evil.example/api/assets/a/content?expires=1&signature=x'),e=>e.kind==='invalidRequest');assert.equal(calls.length,0)
 const pending=app.runtime.api.downloadAsset('/api/assets/asset-1/content?expires=1&signature=x');await app.runtime.session.logout();finish();await assert.rejects(pending,e=>e.kind==='sessionChanged');assert.deepEqual(discard,['tmp-image'])
})
test('current discovery alone cannot fabricate tool edit permission; confirmed save keeps version and command',async t=>{
 let writes=0;const app=await authenticated(setup('ADMIN',(o,p)=>o.method==='GET'?response({version:7,policy:{mode:'INDIVIDUAL_SUMMARY',metricKeys:['m'],longitudinalMetricKeys:[]},commandKey:key,allowedActions:['UPDATE']}):++writes===1?Promise.reject(new Error('lost')):response({version:8}),{canManageParentToolDisclosure:true})),view=page('tool-policy/index',app,t)
 view.onLoad({family:'SCALE',key:'tool',version:'1.0.0'});await view.onShow();view.confirm();await view.save();assert.equal(view.sealed.mode,'INDIVIDUAL_SUMMARY');view.confirm();await view.save();const sent=app.p.calls.filter(c=>c.method==='PUT');assert.equal(sent.length,2);assert.deepEqual(sent[0].data,sent[1].data);assert.equal(sent[0].data.expectedVersion,7);assert.equal(sent[0].data.commandKey,key);view.onUnload()
})

test('public multipart uses canonical file field and does not carry session headers',async()=>{
 const app=await authenticated(setup('STUDENT')),calls=[];app.p.uploadFile=o=>{calls.push(o);o.success({statusCode:200,data:JSON.stringify({code:0,message:'ok',data:{assetId:'asset-1'}})})};const c={token:'ck_1234567890abcdef',sessionId:'session_1234567890abcdef',sessionCapability:'v1.9999999999.'+'a'.repeat(43),sessionExpiresAt:'2099-01-01T00:00:00.000Z'};await app.runtime.publicCheckins.upload(c,'synthetic');assert.equal(calls[0].name,'file');assert.equal(calls[0].header.Cookie,undefined);assert.equal(calls[0].header['X-CSRF-Token'],undefined);assert.deepEqual(calls[0].formData,{sessionId:c.sessionId})
})
test('bounded record rows retain their source page and canonical token revoke path',async()=>{
 const app=await authenticated(setup('TEACHER',(o,p)=>o.method==='GET'?response({list:[{id:'student-2',username:'Second'}],total:40,page:2,pageSize:20}):response(null))),result=await app.runtime.operations.list('students',{page:2});assert.equal(result.list[0].sourcePage,2);await app.runtime.operations.revokeToken('token-1');assert.equal(app.p.calls.at(-1).url,origin+'/api/checkins/tokens/token-1')
})
test('canonical classroom and public checkin QR route through dedicated adapters',async()=>{
 const {parseEntry,resolveEntry}=require('../app/entry/index');const app=await authenticated(setup('STUDENT',()=>response({}),{canJoinClassroom:true}));const a=parseEntry({q:encodeURIComponent(origin+'/student/classroom/enter?code=123456')},origin),b=parseEntry({q:encodeURIComponent(origin+'/public/checkin/ck_1234567890abcdef')},origin);assert.match((await resolveEntry(a,app.runtime.session.get(),app.runtime.domains)).destination,/classroom/);assert.match((await resolveEntry(b,{user:null},{})).destination,/public-checkin/)
})

test('teacher end command binds the current question round',async t=>{
 const snapshot=classroomState();snapshot.availableActions=['END','CLOSE'];const app=await authenticated(setup('TEACHER',o=>response(o.method==='GET'?snapshot:{}),{canUseClassroomRuntime:true})),view=page('classroom/index',app,t)
 view.onLoad({id:'class-1'});await view.onShow();await view.end();const sent=app.p.calls.find(c=>c.url.endsWith('/end'));assert.deepEqual(JSON.parse(JSON.stringify(sent.data)),{questionId:'q1',startedAt:snapshot.question.startedAt});view.onUnload()
})

test('R1: failed multi-answer survives background and retries the exact sealed round',async t=>{
 let writes=0,snapshot=classroomState();const bodies=[]
 const app=await authenticated(setup('STUDENT',(o,p)=>{if(o.method==='GET')return response(snapshot);bodies.push(structuredClone(o.data));if(++writes===1)throw new Error('lost receipt');snapshot={...snapshot,submitted:true,availableActions:['LEAVE']};return response({submitted:true})},{canUseClassroomRuntime:true})),view=page('classroom/index',app,t)
 view.onLoad({id:'class-1'});await view.onShow();view.changeAnswer({detail:{value:['B','A']}});await view.submit();assert.equal(view.sealed.answer,'B,A');view.onHide();assert.equal(view.snapshot,null);assert.equal(view.answer,'');await view.onShow();assert.equal(view.data.pendingSubmission,true);view.changeAnswer({detail:{value:['A']}});assert.equal(view.answer,'');await view.submit();assert.equal(writes,2);assert.deepEqual(bodies[1],bodies[0]);assert.equal(view.data.submitted,true);assert.equal(view.sealed,null);view.onUnload()
})
test('R1: lost receipt reconciles confirmed state, while a new round invalidates the old payload',async t=>{
 let snapshot=classroomState(),writes=0;const app=await authenticated(setup('STUDENT',o=>{if(o.method==='GET')return response(snapshot);writes++;throw new Error('lost')},{canUseClassroomRuntime:true})),view=page('classroom/index',app,t)
 view.onLoad({id:'class-1'});await view.onShow();view.changeAnswer({detail:{value:['A']}});await view.submit();view.onHide();snapshot={...snapshot,submitted:true,availableActions:['LEAVE']};await view.onShow();assert.equal(view.sealed,null);assert.equal(view.data.submitted,true);await view.submit();assert.equal(writes,1)
 snapshot=classroomState('2026-10-02T00:01:00.000Z');await view.poll();view.changeAnswer({detail:{value:['B']}});await view.submit();view.onHide();snapshot=classroomState('2026-10-02T00:02:00.000Z');await view.onShow();assert.equal(view.sealed,null);await view.submit();assert.equal(writes,2);assert.match(view.data.commandError,/填写答案/);view.onUnload()
})
test('R1: late foreground response, leave and logout cannot restore sealed private answers',async t=>{
 const app=await authenticated(setup('STUDENT',o=>response(o.method==='GET'?classroomState():{}),{canUseClassroomRuntime:true})),view=page('classroom/index',app,t);app.p.navigateBack=()=>{}
 view.onLoad({id:'class-1'});await view.onShow();view.sealed={questionId:'q1',startedAt:classroomState().question.startedAt,answer:'A'};await view.leave();assert.equal(view.sealed,null);assert.equal(view.snapshot,null);view.onUnload()
 const second=page('classroom/index',app,t);second.onLoad({id:'class-1'});let finish;app.runtime.classrooms.state=()=>new Promise(resolve=>finish=resolve);const pending=second.onShow();await new Promise(resolve=>setImmediate(resolve));second.onHide();finish(classroomState());await pending;assert.equal(second.snapshot,null);assert.equal(second.timers.size,0)
 second.sealed={answer:'private'};await app.runtime.session.logout();assert.equal(second.sealed,null);assert.equal(second.snapshot,null);second.onUnload()
})
for(const [role,viewName] of [['TEACHER','submissions'],['STUDENT','others']])test('R2: '+role+' authorized checkin record displays image-only and text plus multiple images',async t=>{
 let content='';const urls=['/api/assets/a/content?expires=1&signature=x','/api/assets/b/content?expires=1&signature=y'],discard=[]
 const app=await authenticated(setup(role,(o,p)=>{assert.equal(p,'/checkins/checkin-1/'+(viewName==='others'?'others-submissions':'submissions'));return response({list:[{id:'submission-1',content,images:urls}],page:2,pageSize:20,total:21})}));app.p.downloadFile=o=>o.success({statusCode:200,tempFilePath:'tmp-'+o.url.split('/assets/')[1][0]});app.p.getFileSystemManager=()=>({unlink:o=>discard.push(o.filePath)})
 const record=page('record/index',app,t);record.onLoad({domain:'checkins',parent:'checkin-1',view:viewName,id:'submission-1',page:'2'});await record.onShow();assert.equal(record.data.content,'');assert.equal(record.data.images.length,2);assert.ok(record.data.images.every(i=>i.url.startsWith('tmp-')));content='Important text';await record.retry();assert.equal(record.data.content,content);assert.equal(record.data.images.length,2);assert.equal(discard.length,2);record.onHide();assert.equal(record.data.images.length,0);assert.equal(discard.length,4);record.onUnload()
})
test('R2: expired and failed images can refresh through the same authorized list; foreign URLs never download',async t=>{
 let version=1,calls=0;const app=await authenticated(setup('TEACHER',()=>response({list:[{id:'submission-1',content:'text',images:['/api/assets/a/content?expires='+version+'&signature=x','https://foreign.example/api/assets/b/content?expires=1&signature=y']}]})))
 app.p.downloadFile=o=>{calls++;o.success({statusCode:version===1?403:200,tempFilePath:version===1?'expired-file':'fresh-file'})};const discarded=[];app.p.getFileSystemManager=()=>({unlink:o=>discarded.push(o.filePath)})
 const record=page('record/index',app,t);record.onLoad({domain:'checkins',parent:'checkin-1',view:'submissions',id:'submission-1'});await record.onShow();assert.equal(calls,1);assert.match(record.data.images[0].error,/失效/);assert.equal(record.data.images[1].url,'');assert.deepEqual(discarded,['expired-file']);version=2;await record.retry();assert.equal(calls,2);assert.equal(record.data.images[0].url,'fresh-file');record.imageError({detail:{index:0}});assert.match(record.data.images[0].error,/无法显示/);await record.retry();assert.equal(record.data.images[0].url,'fresh-file');record.onUnload();assert.ok(discarded.includes('fresh-file'))
})
test('R2: denied classmates and late downloads after hide or logout expose no images',async t=>{
 const denied=await authenticated(setup('STUDENT',()=>response(null,403)));let downloads=0;denied.p.downloadFile=()=>downloads++;const forbidden=page('record/index',denied,t);forbidden.onLoad({domain:'checkins',parent:'checkin-1',view:'others',id:'submission-1'});await forbidden.onShow();assert.equal(forbidden.data.status,'error');assert.equal(downloads,0);forbidden.onUnload()
 const app=await authenticated(setup('TEACHER',()=>response({list:[{id:'submission-1',images:['/api/assets/a/content?expires=1&signature=x']}]}))),discard=[];let finish;app.p.downloadFile=o=>finish=()=>o.success({statusCode:200,tempFilePath:'late-file'});app.p.getFileSystemManager=()=>({unlink:o=>discard.push(o.filePath)})
 const record=page('record/index',app,t);record.onLoad({domain:'checkins',parent:'checkin-1',view:'submissions',id:'submission-1'});const pending=record.onShow();await new Promise(resolve=>setImmediate(resolve));record.onHide();finish();await pending;assert.equal(record.data.images.length,0);assert.equal(record.recordImages.length,0);assert.deepEqual(discard,['late-file'])
 const again=record.onShow();await new Promise(resolve=>setImmediate(resolve));await app.runtime.session.logout();finish();await again;assert.equal(record.recordImages.length,0);assert.equal((record.data.images||[]).length,0);assert.equal(discard.length,2);record.onUnload()
})
test('R3: clearing an existing assignment deadline rejects before save and retains the original for correction',async t=>{
 const original='2099-01-01T00:00:00.000Z';let writes=0;const app=await authenticated(setup('TEACHER',(o,p)=>p.startsWith('/mobile/context/')?context(['edit']):o.method==='GET'?response({title:'Task',deadline:original,questions:[]}):(++writes,response({deadline:o.data.deadline})))),view=page('operation/index',app,t)
 view.onLoad({domain:'assignments',id:'task-1',action:'edit'});await view.onShow();view.change({currentTarget:{dataset:{key:'deadline'}},detail:{value:''}});view.confirm();await view.submit();assert.equal(writes,0);assert.equal(view.data.result,null);assert.match(view.data.formError,/不支持清除/);assert.match(view.data.formError,/2099-01-01/);assert.equal(view.form.fields.find(f=>f.key==='deadline').value,original);assert.equal(view.sealed,null);view.change({currentTarget:{dataset:{key:'deadline'}},detail:{value:'2099-02-01T12:00:00Z'}});view.confirm();await view.submit();assert.equal(writes,1);assert.equal(app.p.calls.at(-1).data.deadline,'2099-02-01T12:00:00.000Z');assert.ok(view.data.result);view.onUnload()
})
test('R3: unchanged assignment date, unset creation and nullable checkin date follow distinct contracts',async()=>{
 const original='2099-01-01T00:00:00.000Z';const app=await authenticated(setup('TEACHER',(o,p)=>p.startsWith('/mobile/context/')?context(['edit','create']):o.method==='GET'?response({title:'Task',deadline:original,endTime:original,questions:[]}):response({id:'saved'})))
 const edit=await app.runtime.operations.prepare('assignments','task-1','edit');await app.runtime.operations.execute('assignments','task-1','edit',edit,{title:'Renamed'});assert.equal(Object.hasOwn(app.p.calls.at(-1).data,'deadline'),false)
 const create=await app.runtime.operations.prepare('assignments',undefined,'create');await app.runtime.operations.execute('assignments',undefined,'create',create,{title:'New',courseId:'course-1',deadline:''});assert.equal(Object.hasOwn(app.p.calls.at(-1).data,'deadline'),false)
 const checkin=await app.runtime.operations.prepare('checkins','checkin-1','edit');await app.runtime.operations.execute('checkins','checkin-1','edit',checkin,{endTime:''});assert.equal(app.p.calls.at(-1).data.endTime,null)
})
