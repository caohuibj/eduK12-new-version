const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {createRequire}=require('node:module')
const {createParentService}=require('../domains/parents/service')
const {navigationFor}=require('../app/navigation/index')
const {platform}=require('./helpers.cjs')
function session(enabled=true) {
 const listeners=[]
 let state={user:{id:'self'},activeRole:'PARENT',capabilities:{canReadProfile:true,canManageParentLinks:enabled,canReadChildren:enabled,canReadChildReports:enabled}}
 return {get:()=>state,subscribe(fn){listeners.push(fn);return()=>{}},logout(){state={user:null,activeRole:null,capabilities:{}};listeners.forEach(fn=>fn(state))}}
}
function page(service,s,t,options={view:'links'}) {
 const file=path.resolve(__dirname,'../pages/parents/index.js');const app={runtime:{session:s,parents:service},ready:Promise.resolve()},p=platform(()=>{})
 const previous={getApp:global.getApp,wx:global.wx};global.getApp=()=>app;global.wx=p;t.after(()=>{global.getApp=previous.getApp;global.wx=previous.wx})
 let spec;vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),getApp:()=>app,wx:p,Page:value=>{spec=value},Promise})
 const instance=Object.assign({},spec,{data:structuredClone(spec.data),setData(data){Object.assign(this.data,data)}});instance.onLoad(options)
 return {instance,p}
}
const links={title:'家长关联',links:[{id:'link-1',canApprove:true,canRevoke:true}],canInvite:true,canClaim:false,consent:{text:'服务端同意说明',version:'link-v1'}}
test('disabled capabilities hide child navigation and block domain requests',async()=>{
 let requests=0;const s=session(false),service=createParentService({get(){requests++}},s)
 await assert.rejects(service.view({view:'children'}),error=>error.kind==='forbidden')
 await assert.rejects(service.view({view:'reports',childId:'child-1'}),error=>error.kind==='forbidden')
 assert.equal(requests,0);assert.ok(!navigationFor(s.get()).some(item=>item.key==='children'))
})
test('child requests carry child scope and reject injected identifiers before transport',async()=>{
 const paths=[];const service=createParentService({async get(value){paths.push(value);return {list:[],hasMore:false}}},session())
 await service.view({view:'reports',childId:'child-1'},2)
 assert.equal(paths[0],'/parents/me/children/child-1/reports?page=2&pageSize=20')
 await assert.rejects(service.view({view:'reports',childId:'../child-2'}));assert.equal(paths.length,1)
})
test('association confirmation presents server consent and duplicate tap sends one write',async t=>{
 let release,writes=0,version
 const service={view:async()=>links,approve:async(id,value)=>{writes++;version=value;await new Promise(resolve=>{release=resolve})}}
 const s=session(),{instance:p}=page(service,s,t);await p.onShow()
 p.confirmLink({currentTarget:{dataset:{id:'link-1',action:'approve'}}})
 assert.equal(p.data.confirmation.text,'服务端同意说明');assert.equal(writes,0)
 const pending=p.confirm();await p.confirm();assert.equal(writes,1);assert.equal(version,'link-v1')
 release();await pending;assert.equal(p.data.confirmation,null);assert.equal(p.data.status,'ready');p.onUnload()
})
test('actions absent from server response cannot be confirmed',async t=>{
 let writes=0;const service={view:async()=>({...links,links:[{id:'link-1',canApprove:false,canRevoke:false}]}),approve:async()=>{writes++}}
 const {instance:p}=page(service,session(),t);await p.onShow();p.confirmLink({currentTarget:{dataset:{id:'link-1',action:'approve'}}});await p.confirm();assert.equal(p.data.confirmation,null);assert.equal(writes,0);p.onUnload()
})
test('invitation is not restored by an in-flight response after logout',async t=>{
 let release;const service={view:async()=>links,invite:async()=>new Promise(resolve=>{release=resolve})}
 const s=session(),{instance:p}=page(service,s,t);await p.onShow();p.setData({inviteInput:'private-input'})
 const pending=p.invite({currentTarget:{dataset:{id:'course-1'}}});s.logout();release({inviteCode:'a'.repeat(24),expiresAt:'future'});await pending
 assert.equal(p.data.invitation,null);assert.equal(p.data.inviteInput,'');assert.equal(p.data.links.length,0);p.onUnload()
})
test('child switcher opens the selected child report list without inheriting another child',async t=>{
 const service={view:async()=>({title:'选择孩子',list:[{id:'child-2',canOpen:true}],hasMore:false})}
 const {instance:p,p:platform}=page(service,session(),t,{view:'children',next:'reports'});await p.onShow();p.select({detail:{id:'child-2'}})
 assert.equal(platform.navigation.at(-1),'/pages/parents/index?view=reports&childId=child-2');p.onUnload()
})
test('failed consent retains one command key, never auto-replays, and explains independent disclosure',async t=>{
 let writes=0;const preview={relationshipId:'link-1',artifactId:'artifact-1',commandKey:'server-command',consentVersion:'report-v1'}
 const service={view:async()=>({title:'预览',preview,report:{title:'已发布内容',blocks:[]}}),accept:async value=>{writes++;assert.equal(value.commandKey,'server-command');if(writes===1)throw new Error('网络暂不可用')}}
 const {instance:p}=page(service,session(),t,{view:'consent'});await p.onShow();await p.accept();assert.equal(writes,1);assert.equal(p.data.actionError,'网络暂不可用');assert.equal(p.data.status,'ready')
 await p.accept();assert.equal(writes,2);assert.match(p.data.notice,/还需报告披露授权/);await p.accept();assert.equal(writes,2);p.onUnload();assert.equal(p.data.preview,null)
})
test('report rendering preserves canonical text and does not infer scores or recommendation',async()=>{
 const value={schemaVersion:1,audience:'PARENT',title:'已发布标题',summary:'已发布说明',blocks:[{title:'学习情境',text:'既定解释'}]}
 const service=createParentService({get:async()=>value},session());const result=await service.view({view:'report',childId:'child-1',artifactId:'report-1'})
 assert.equal(result.report.summary,value.summary);assert.deepEqual(result.report.blocks,value.blocks);assert.equal(result.report.score,undefined)
})

test('enabled parent home uses two bounded business calls without per-child requests',async()=>{
 const {createWorkspaceService}=require('../workspaces/service');let calls=0
 const home=createWorkspaceService({list:async()=>{calls++;return {list:[],total:0}}},session(),{view:async()=>{calls++;return {list:[{id:'child-1',title:'孩子',canOpen:true}]}}})
 const result=await home.home();assert.equal(calls,2);assert.equal(result.blocks[0].domain,'children');assert.equal(result.blocks[0].list[0].domain,'children')
})

test('failed reauthorization discards the previously loaded report from page memory',async t=>{
 let permitted=true;const service={view:async()=>{if(!permitted)throw new Error('内容不存在或无权访问');return {title:'报告',report:{summary:'私密已授权内容',blocks:[]}}}}
 const {instance:p}=page(service,session(),t,{view:'report',childId:'child-1',artifactId:'artifact-1'});await p.onShow();assert.ok(p.data.report)
 permitted=false;await p.retry();assert.equal(p.data.status,'error');assert.equal(p.data.report,null);p.onUnload()
})
