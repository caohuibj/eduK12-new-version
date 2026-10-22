const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module')
const {platform,response,csrf,session,user}=require('./helpers.cjs')
const {createRuntime}=require('../app/bootstrap/index')
const {createTrainingService}=require('../domains/training/service')
const {navigationFor,shortcutsFor}=require('../app/navigation/index')
const entry=require('../app/training/entry')
const origin='https://acceptance.example',root=path.resolve(__dirname,'..')
const identity=(role='STUDENT',domain='TRAINING')=>({...user(role),accountDomain:domain})
function auth(who){return platform(o=>{const url=o.url.split('/api')[1];if(url==='/auth/csrf')return csrf();if(url==='/auth/training-login')return response({},200,session());if(url==='/auth/me')return response(who);if(url==='/capabilities')return response({cognitive:true});throw Error('unexpected '+url)})}
const state=()=>({user:identity(),product:'training-student',capabilities:{canReadCourses:true,canReadOwnAssessments:true,canReadAssignments:true,canReadCheckins:true,canUseAssessmentRuntime:true},runtime:{cognitive:true}})
function service(routes,s=state()){const calls=[];return {calls,service:createTrainingService({get:async url=>{calls.push(url);const match=routes[url];if(match instanceof Error)throw match;if(match===undefined)throw Error('unexpected '+url);return typeof match==='function'?match():structuredClone(match)}},{get:()=>s})}}
function page(name,app,p,t){const file=path.join(root,'pages',name+'.js');let spec;const old={getApp:global.getApp,wx:global.wx};global.getApp=()=>app;global.wx=p;t.after(()=>Object.assign(global,old));vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),getApp:()=>app,wx:p,Page:v=>spec=v,Promise,console});return {...spec,data:structuredClone(spec.data),setData(v){Object.assign(this.data,v)}}}
const course={id:'course1',title:'培训课',courseType:'TRAINING'}
const available=(extra={})=>({'/courses/course1':course,'/questionnaires/available?courseId=course1':{list:[]},'/scales/available':{list:[]},'/cognitive/assignments/my':[],'/composite-assessments/available':{list:[]},...extra})
test('dedicated Training login pins expectedRole and strips unrelated discovery without granting runtime',async()=>{
 const p=auth(identity()),r=createRuntime(p,origin,{studentOnly:true});await r.session.login({username:'student',password:'synthetic',expectedRole:'TEACHER'})
 const sent=p.calls.find(o=>o.url.endsWith('/auth/training-login'));assert.equal(sent.data.expectedRole,'STUDENT');assert.ok(!p.calls.some(o=>o.url.endsWith('/auth/login')))
 const s=r.session.get();assert.equal(s.product,'training-student');assert.equal(s.capabilities.canReadCourses,true);assert.equal(s.capabilities.canDiscoverOrganizations,false);assert.equal(s.capabilities.canReadCatalog,false);assert.equal(s.capabilities.canUseAssessmentRuntime,false);assert.deepEqual(navigationFor(s),[]);assert.deepEqual(shortcutsFor(s),[])
 assert.throws(()=>r.account.register('teacher',{}),/仅开放学员/)
})
for(const [role,domain]of [['TEACHER','TRAINING'],['ADMIN','LEGACY'],['PARENT','LEGACY'],['STUDENT','SCHOOL'],['STUDENT',undefined]])test('reject restored identity '+role+'/'+domain,async()=>{
 const who=identity(role,domain);if(domain===undefined)delete who.accountDomain
 const p=auth(who),r=createRuntime(p,origin,{studentOnly:true});await assert.rejects(r.session.login({username:'x',password:'synthetic'}),/仅供 Training 学员/);assert.equal(r.session.get().user,null);assert.ok([...p.stored.values()].every(value=>!JSON.stringify(value).includes('test-session')))
})
test('cursor is encoded and course type guard rejects campus/library before reading tasks',async()=>{
 const a=service({'/courses/my?cursor=a%2Bb%26c':{list:[course],nextCursor:'next'},'/courses/course1':{...course,courseType:'CAMPUS_ACTIVITY'}})
 assert.equal((await a.service.courses('a+b&c')).nextCursor,'next');await assert.rejects(a.service.section('course1','assignments'),/只开放培训课程/);assert.equal(a.calls.length,2)
})
test('revoked membership halts course reads before assessment APIs',async()=>{const a=service({'/courses/course1':Error('成员资格已撤销')});await assert.rejects(a.service.section('course1','assessments'),/已撤销/);assert.deepEqual(a.calls,['/courses/course1'])})
test('archived composite continues the existing frozen attempt and keeps separate completed feedback',async()=>{
 const a=service(available({'/composite-assessments/available':{list:[{id:'bundle',name:'历史组合',course:{id:'course1'},availability:'OPEN',canContinue:true,canStartNewAttempt:false,attempt:{id:'existing',status:'IN_PROGRESS'},latestCompletedAttempt:{id:'done',status:'COMPLETED'}}]}}))
 const e=await a.service.assessmentEntry('course1','composite:bundle');assert.equal(e.launch.rootId,'existing');assert.equal(e.launch.family,'COMPOSITE');assert.equal(e.row.action,'继续测评');assert.equal(e.row.reportHref,'/student/composite/attempts/done/report')
})
test('emergency pause removes continuation, deadline does not fabricate admission, other courses/public are excluded',async()=>{
 const a=service(available({'/questionnaires/available?courseId=course1':{list:[{id:'public',name:'公开',courses:[]}]},'/scales/available':{list:[{id:'foreign',courses:[{id:'course2'}]}]},'/composite-assessments/available':{list:[{id:'paused',name:'暂停',course:{id:'course1'},admissionPaused:true,availability:'OPEN',canContinue:false,canStartNewAttempt:false,attempt:{id:'pending',status:'IN_PROGRESS'},latestCompletedAttempt:{id:'done',status:'COMPLETED'}},{id:'closed',name:'截止',course:{id:'course1'},availability:'EXPIRED',canContinue:true,canStartNewAttempt:false,attempt:{id:'pending2',status:'IN_PROGRESS'}}]}}))
 const r=await a.service.section('course1','assessments');assert.deepEqual(r.items.map(v=>v.key),['composite:paused','composite:closed']);assert.equal(r.items[0].href,'/student/composite/attempts/done/report');assert.equal(r.items[1].href,null)
})
test('multi-course delivery is checked against all task pages and partial failures stay visible',async()=>{
 const a=service(available({'/scales/available':Error('暂不可用'),'/composite-assessments/available':{list:[{id:'multi',name:'多课程',course:null,productKind:'QUESTIONNAIRE',availability:'OPEN',canContinue:false,canStartNewAttempt:true}]},'/courses/my/tasks?page=1&pageSize=100&courseId=course1':{list:[{id:'other',kind:'ASSIGNMENT'}],total:2},'/courses/my/tasks?page=2&pageSize=100&courseId=course1':{list:[{id:'multi',kind:'COMPOSITE',courses:[{id:'course1'}]}],total:2}}))
 const r=await a.service.section('course1','assessments');assert.equal(r.items[0].key,'composite:multi');assert.match(r.errors[0],/量表读取失败/)
})
test('assignment status distinguishes draft, submitted and expired without suppressing detail',async()=>{
 const a=service({'/courses/course1':course,'/courses/course1/assignments':{list:[{id:'draft',title:'草稿',mySubmission:{status:'DRAFT'}},{id:'done',mySubmission:{status:'GRADED'},deadline:'2000-01-01'},{id:'expired',deadline:'2000-01-01'}]}})
 const r=await a.service.section('course1','assignments');assert.deepEqual(r.items.map(v=>v.status),['已保存草稿','已提交','已截止']);assert.ok(r.items.every(v=>v.href))
})
test('Training QR accepts only same-origin course and checks access before navigation',async()=>{
 assert.throws(()=>entry.parseEntry({kind:'classroom',id:'123456'},origin),/仅支持 Training/);assert.throws(()=>entry.parseEntry({q:'https://foreign.example/student/courses/one'},origin),/无效/)
 const parsed=entry.parseEntry({q:origin+'/student/courses/course1'},origin);let called=0
 assert.equal((await entry.resolveEntry(parsed,state(),{course:async()=>called++})).destination,'/pages/course/index?id=course1');assert.equal(called,1)
 assert.equal((await entry.resolveEntry(parsed,{user:null},{})).destination,'/pages/auth/login/index')
})
test('native course home retains pages on failure, deduplicates, and ignores late page after refresh',async t=>{
 const s=state();let release,mode=0
 const app={ready:Promise.resolve(),runtime:{session:{get:()=>s,subscribe:()=>()=>{}},training:{courses:async cursor=>{if(!cursor)return {courses:[{id:'one',title:'first'}],nextCursor:'next'};if(mode===0)throw Error('暂时断网');if(mode===1)return {courses:[{id:'one',title:'updated'},{id:'two'}],nextCursor:'later'};return new Promise(resolve=>release=resolve)}}}}
 const p=platform(()=>{}),home=page('home/index',app,p,t);home.onLoad({});await home.onShow();assert.equal(home.data.training,true);assert.deepEqual(home.data.navItems,[])
 await home.moreCourses();assert.equal(home.data.courses.length,1);assert.equal(home.data.nextCursor,'next');assert.equal(home.data.moreError,'暂时断网')
 mode=1;await home.moreCourses();assert.equal(home.data.courses.length,2);assert.equal(home.data.courses[0].title,'updated')
 mode=2;const pending=home.moreCourses();await home.load(true);release({courses:[{id:'late'}],nextCursor:null});await pending;assert.equal(home.data.courses.length,1);assert.equal(home.data.courses[0].id,'one');home.onUnload()
})
test('course assessment page resumes original root without issuing a new begin',async t=>{
 const s=state();let begins=0
 const app={ready:Promise.resolve(),runtime:{session:{get:()=>s,subscribe:()=>()=>{}},training:{assessmentEntry:async()=>({row:{name:'归档作答',status:'进行中'},launch:{family:'COMPOSITE',resourceId:'bundle',rootId:'existing',webTarget:'/student/composite/attempts/existing'}})},assessments:{begin:async()=>{begins++;throw Error('must not begin')}}}}
 const p=platform(()=>{}),assessment=page('assessment-entry/index',app,p,t);assessment.onLoad({mode:'course',id:'composite:bundle',courseId:'course1'});await assessment.onShow();assert.equal(assessment.data.canStart,true);await assessment.start();assert.equal(begins,0);assert.match(p.navigation.at(-1),/rootId=existing/);assessment.onUnload()
})
test('new course page switches sections and routes task context without global navigation',async t=>{
 const s=state(),app={ready:Promise.resolve(),runtime:{session:{get:()=>s,subscribe:()=>()=>{}},training:{section:async(_,kind)=>({course,items:[{key:'task1',name:kind,href:true}],errors:[]})}}}
 const p=platform(()=>{}),coursePage=page('course/index',app,p,t);coursePage.onLoad({id:'course1'});await coursePage.onShow();await coursePage.switchSection({detail:{key:'checkins'}});coursePage.select({currentTarget:{dataset:{key:'task1'}}});assert.match(p.navigation.at(-1),/domain=checkins&id=task1&courseId=course1/);coursePage.onUnload()
})
test('own submission keeps server feedback and Web-indexed answers without exposing another student',async()=>{
 const a=service({})
 const result=await a.service.ownSubmission('assignments','task1',{questions:[{id:'q1',type:'single_choice',question:'选择',options:[{key:'A',text:'选项甲'}]}],mySubmission:{status:'GRADED',answers:{0:'A'},comment:'已阅',content:'我的内容'}})
 assert.equal(result.content,'我的内容');assert.ok(result.facts.some(v=>v.value==='选项甲'));assert.ok(result.facts.some(v=>v.label==='培训师评语'&&v.value==='已阅'));assert.deepEqual(a.calls,[])
})
test('identity discovery mismatch clears stored session instead of keeping the previous workspace',async()=>{
 const who=identity();who.mobile.activeRole='TEACHER';const p=auth(who),r=createRuntime(p,origin,{studentOnly:true});await assert.rejects(r.session.login({username:'x',password:'synthetic'}),/身份信息无效/);assert.equal(r.session.get().user,null)
})
test('late private submission images are discarded after detail unload',async t=>{
 const s=state();let release;const discarded=[]
 const app={ready:Promise.resolve(),runtime:{session:{get:()=>s,subscribe:()=>()=>{}},training:{section:async()=>({items:[{key:'task1'}]}),ownSubmission:async()=>({content:'private',facts:[],images:[{url:'/asset'}]})},operations:{detail:async()=>({title:'任务',entity:{}})},api:{downloadAsset:()=>new Promise(resolve=>release=resolve),discardFile:file=>discarded.push(file)}}}
 const p=platform(()=>{}),detail=page('detail/index',app,p,t);detail.onLoad({domain:'checkins',id:'task1',courseId:'course1'});const pending=detail.onShow();while(!release)await new Promise(resolve=>setImmediate(resolve));detail.onUnload();release('temporary-private-image');await pending;assert.deepEqual(discarded,['temporary-private-image']);assert.equal(detail.data.ownSubmission,undefined)
})
