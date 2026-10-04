const {test}=require('node:test'),assert=require('node:assert/strict')
const {createPrivacy}=require('../core/privacy/index'),{createMedia}=require('../core/media/index')
const {resolveEnvironment}=require('../core/config/environment-resolver')
const {timestamp,parseTimestamp,answerRows}=require('../core/format/index')
const {createOperations}=require('../domains/operations/service')
const {checkReleaseConfig,sourceFootprint}=require('../scripts/release-readiness.cjs')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(resolve=>setImmediate(resolve))
function privatePlatform() {
 let listener
 const calls=[]
 const p={calls,onNeedPrivacyAuthorization(fn){listener=fn},
  getPrivacySetting(o){o.success({needAuthorization:true,privacyContractName:'合成隐私指引'})},
  requirePrivacyAuthorize(o){listener(result=>result.event==='agree'?o.success({}):o.fail({errMsg:'deny'}))},
  openPrivacyContract(o){o.success({})},
  chooseMedia(o){calls.push(o);o.success({tempFiles:[{tempFilePath:'synthetic-image',size:12,fileType:'image'}]})}}
 return p
}
test('real privacy component requires explicit native agreement before choosing images',async()=>{
 const p=privatePlatform(),privacy=createPrivacy(p),media=createMedia(p,privacy);let component
 vm.runInNewContext(fs.readFileSync(path.join(root,'design-system/components/privacy/index.js'),'utf8'),{getApp:()=>({runtime:{privacy}}),Component:c=>component=c})
 const view=Object.assign({},component.methods,{data:structuredClone(component.data),setData(v){Object.assign(this.data,v)}})
 component.lifetimes.attached.call(view)
 const pending=media.chooseImages(1);await tick()
 assert.equal(view.data.open,true);assert.equal(view.data.contractName,'合成隐私指引');assert.equal(p.calls.length,0)
 view.agree();const files=await pending;assert.equal(files.length,1);assert.equal(view.data.open,false)
 assert.equal(p.calls.length,1);component.lifetimes.detached.call(view)
})
test('privacy refusal, missing API and privacy read failure never open the native chooser',async()=>{
 const p=privatePlatform(),privacy=createPrivacy(p),media=createMedia(p,privacy)
 const pending=media.chooseImages(1);await tick();privacy.cancel();await assert.rejects(pending,e=>e.kind==='privacyDenied');assert.equal(p.calls.length,0)
 const old={chooseMedia(){throw new Error('should not choose')}}
 await assert.rejects(createMedia(old,createPrivacy(old)).chooseImages(1),e=>e.kind==='unsupportedPlatform')
 p.getPrivacySetting=o=>o.fail({errMsg:'sensitive internal path'});await assert.rejects(media.chooseImages(1),e=>e.kind==='privacyUnavailable'&&!e.message.includes('sensitive'))
})
test('leaving during privacy discovery cancels the request before it opens a dialog',async()=>{
 const p=privatePlatform();let finish,dialogs=0
 p.getPrivacySetting=o=>{finish=()=>o.success({needAuthorization:true})};p.requirePrivacyAuthorize=()=>{dialogs++}
 const privacy=createPrivacy(p),media=createMedia(p,privacy),pending=media.chooseImages(1)
 privacy.cancel();finish();await assert.rejects(pending,e=>e.kind==='cancelled');assert.equal(dialogs,0);assert.equal(p.calls.length,0)
})
test('identity change after privacy discovery prevents the native chooser',async()=>{
 const p=privatePlatform();let valid=true
 p.getPrivacySetting=o=>{valid=false;o.success({needAuthorization:false})}
 const privacy=createPrivacy(p),media=createMedia(p,privacy)
 await assert.rejects(media.chooseImages(1,()=>valid),e=>e.kind==='cancelled');assert.equal(p.calls.length,0)
})
test('media picker rejects duplicate taps, invalid image sizes and handles user cancellation safely',async()=>{
 const p=privatePlatform();p.getPrivacySetting=o=>o.success({needAuthorization:false});let finish
 p.chooseMedia=o=>{finish=()=>o.fail({errMsg:'chooseMedia:fail cancel temporary secret'})}
 const media=createMedia(p,createPrivacy(p)),pending=media.chooseImages(1)
 await tick();await assert.rejects(media.chooseImages(1),e=>e.kind==='busy')
 finish();await assert.rejects(pending,e=>e.kind==='cancelled'&&!e.message.includes('secret'))
 for(const file of [{tempFilePath:'x',size:10*1024*1024+1},{tempFilePath:'x',size:0},{size:12}]) {
  p.chooseMedia=o=>o.success({tempFiles:[file]});await assert.rejects(media.chooseImages(1),e=>['invalidRequest','mediaUnavailable'].includes(e.kind))
 }
 p.chooseMedia=o=>o.success({tempFiles:[{tempFilePath:'x',size:12,fileType:'image'}]})
 assert.equal((await media.chooseImages(1)).length,1)
})
const environments={origins:{develop:'https://qa.eduk12.top',trial:'https://trial.eduk12.top',release:'https://eduk12.top'}}
const platformFor=(envVersion,appId='wx0123456789abcdef')=>({getAccountInfoSync:()=>({miniProgram:{envVersion,appId}})})
test('WeChat build channel chooses its explicit server and development cannot fall back to production',()=>{
 for(const channel of ['develop','trial','release'])assert.equal(resolveEnvironment(platformFor(channel),environments).origin,environments.origins[channel])
 assert.throws(()=>resolveEnvironment(platformFor('develop'),{origins:{develop:'https://eduk12.top',release:'https://eduk12.top'}}),/不能连接正式/)
 assert.throws(()=>resolveEnvironment(platformFor('develop'),{origins:{develop:'https://EDUK12.TOP:443',release:'https://eduk12.top'}}),/不能连接正式/)
 assert.throws(()=>resolveEnvironment(platformFor('develop'),{origins:{}}),/未配置/)
 assert.throws(()=>resolveEnvironment(platformFor('release','touristappid'),environments),/正式小程序身份/)
 assert.throws(()=>resolveEnvironment({},environments),/无法确认/)
 assert.throws(()=>resolveEnvironment(platformFor('release'),{origins:{release:'https://127.0.0.1'}}),/未完成配置/)
})
test('calendar input requires timezone and rejects normalized invalid dates',()=>{
 assert.equal(parseTimestamp('2026-10-30T18:00:00+09:00','截止时间').toISOString(),'2026-10-30T09:00:00.000Z')
 assert.equal(parseTimestamp('2028-02-29T00:00Z','截止时间').toISOString(),'2028-02-29T00:00:00.000Z')
 for(const value of ['2026-02-29T12:00Z','2026-02-31T12:00Z','2026-13-01T00:00Z','2026-10-30T18:00','2026-10-30T25:00Z','2026-10-30T18:00+14:01'])assert.throws(()=>parseTimestamp(value,'截止时间'),e=>e.kind==='invalidRequest')
 assert.match(timestamp('2026-10-30T09:00:00Z'),/2026年10月30日.*UTC[+-]/)
 assert.equal(timestamp('not-date'),'时间无效')
})
test('teacher answers use question type, one-based labels and canonical option labels',()=>{
 const q=[{id:'q1',type:'single_choice',question:'颜色',options:[{key:'C',text:'绿色系'}]},{id:'q2',type:'multiple_choice',question:'多选',options:[{key:'red',text:'红色'},{key:'green',text:'绿色'}]},{type:'text',question:'说明'}]
 const rows=answerRows(q,{q1:'C',q2:'["red","green"]','2':'合成主观答案'})
 assert.equal(rows[0].value,'绿色系');assert.match(rows[0].label,/题目 1（单选题）/)
 assert.equal(rows[1].value,'红色、绿色');assert.match(rows[2].label,/题目 3（主观题）/);assert.equal(rows[2].value,'合成主观答案')
 assert.equal(answerRows([{type:'text'}],{})[0].value,'未作答')
})
test('course shortcuts preselect only a server-authorized course',async()=>{
 const session={get:()=>({capabilities:{canReadAssignments:true,canReadCourses:true}})}
 let allowed=true
 const api={get:async p=>p==='/mobile/context/assignments'?{allowedActions:['create'],commandKey:'key'}:p==='/courses/course-1'?{title:'当前课程'}:p==='/mobile/context/courses/course-1'?{allowedActions:allowed?['createAssignment']:[]}:Promise.reject(new Error(p))}
 const ops=createOperations(api,session),form=await ops.prepare('assignments',undefined,'create','course-1')
 const course=form.fields.find(f=>f.key==='courseId');assert.equal(course.value,'course-1');assert.equal(course.selectionLabel,'当前课程')
 allowed=false;await assert.rejects(ops.prepare('assignments',undefined,'create','course-1'),e=>e.kind==='forbidden')
})
test('release configuration gate rejects placeholders, production test hosts and disabled URL checking',()=>{
 const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'))
 const actual=checkReleaseConfig({...project,appid:'touristappid'},{origins:{develop:'',trial:'',release:'https://eduk12.top'}});assert.ok(actual.some(e=>e.includes('AppID')));assert.ok(actual.some(e=>e.includes('develop')));assert.ok(actual.some(e=>e.includes('trial')))
 const configured={...project,appid:'wx0123456789abcdef'};assert.deepEqual(checkReleaseConfig(configured,environments),[])
 const invalid=checkReleaseConfig({...configured,setting:{urlCheck:false}}, {origins:{develop:'https://eduk12.top',trial:'https://trial.eduk12.top',release:'https://eduk12.top'}})
 assert.ok(checkReleaseConfig(configured,{origins:{...environments.origins,develop:'https://EDUK12.TOP:443'}}).some(e=>e.includes('develop')));
 assert.ok(invalid.some(e=>e.includes('urlCheck')));assert.ok(invalid.some(e=>e.includes('develop')))
})
test('upload source inventory excludes tests, scripts and private developer configuration',()=>{
 const project=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8')),result=sourceFootprint(root,project)
 assert.ok(result.bytes>0);assert.ok(result.files.includes('app.js'))
 assert.ok(!result.files.some(f=>f.startsWith('tests/')||f.startsWith('scripts/')||f==='project.private.config.json'))
})

test('late native privacy callback cannot reopen consent after the page has left',async()=>{
 const p=privatePlatform(),invoke=p.requirePrivacyAuthorize;let finish,valid=true,open=false
 p.requirePrivacyAuthorize=o=>{finish=()=>invoke(o)}
 const privacy=createPrivacy(p);privacy.subscribe(state=>{open=state.open})
 const media=createMedia(p,privacy),pending=media.chooseImages(1,()=>valid)
 await tick();valid=false;finish();assert.equal(open,false)
 await assert.rejects(pending,e=>['cancelled','privacyDenied'].includes(e.kind));assert.equal(p.calls.length,0)
})

test('Web index and native ID submissions produce the same complete answer review',()=>{
 const questions=[{id:'q-color',type:'single_choice',question:'color',options:[{key:'B',text:'Green'}]},{id:'q-multi',type:'multiple_choice',question:'multiple',options:[{key:'red',text:'Red'},{key:'blue',text:'Blue'}]},{id:'q-text',type:'text',question:'text'}]
 const native=answerRows(questions,{'q-color':'B','q-multi':['red','blue'],'q-text':'Answer'})
 const web=answerRows(questions,{'0':'B','1':'["red","blue"]','2':'Answer'})
 assert.deepEqual(web,native);assert.equal(web.length,3)
 assert.equal(web[0].value,'Green');assert.equal(web[2].value,'Answer')
 const mixed=answerRows(questions,{'0':'B','q-color':'A','q-multi':'red,blue','2':'Answer','orphan':'Historical'})
 assert.equal(mixed.length,4);assert.equal(mixed[0].value,'Green');assert.equal(mixed[3].value,'Historical')
})
