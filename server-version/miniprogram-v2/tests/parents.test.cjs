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
 let writes=0;let accepted=false;const preview={relationshipId:'link-1',artifactId:'artifact-1',commandKey:'server-command',consentVersion:'report-v1',canConsent:true}
 const service={view:async()=>({title:'预览',preview:{...preview,canConsent:!accepted},report:{title:'已发布内容',blocks:[]}}),accept:async value=>{writes++;assert.equal(value.commandKey,'server-command');if(writes===1)throw new Error('网络暂不可用');accepted=true}}
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

function consentDTO(accepted=true){return {relationshipId:'link-1',artifactId:'artifact-1',parentName:'获准家长',commandKey:'preview-command',consentVersion:'report-v1',consentText:'服务器说明',consentStatus:accepted?'ACCEPTED':'NOT_ACCEPTED',canConsent:!accepted,canRevoke:accepted,projection:{schemaVersion:1,audience:'PARENT',artifactId:'artifact-1',title:'家长版',summary:'摘要',blocks:[]}}}
test('student preview exposes server consent state and permits individual withdrawal before or after disclosure',async t=>{
 for(const granted of [false,true]){
  let accepted=true;const writes=[],api={get:async()=>({...consentDTO(accepted),granted}),post:async(path,body)=>{writes.push({path,body});accepted=false;return {revoked:true}}},service=createParentService(api,session())
  const {instance:p}=page(service,session(),t,{view:'consent',relationshipId:'link-1',artifactId:'artifact-1'});await p.onShow()
  assert.equal(p.data.preview.canConsent,false);assert.equal(p.data.report.canRevoke,true);p.confirmReport();assert.equal(p.data.confirmation.artifactId,'artifact-1');assert.match(p.data.confirmation.text,/其他报告授权保留/)
  await p.confirm();assert.equal(writes.length,1);assert.equal(writes[0].path,'/parent-links/link-1/reports/artifact-1/revoke')
  assert.equal(p.data.preview.canConsent,true);assert.equal(p.data.report.canRevoke,false);assert.match(p.data.notice,/家长关联和其他报告授权保留/);p.onUnload()
 }
})
test('successful student consent rereads server state and offers withdrawal without reopening the link',async t=>{
 let accepted=false,writes=0;const s=session(),service=createParentService({get:async()=>consentDTO(accepted),post:async()=>{accepted=true;writes++;return {consentId:'consent-1'}}},s)
 const {instance:p}=page(service,s,t,{view:'consent',relationshipId:'link-1',artifactId:'artifact-1'});await p.onShow();assert.equal(p.data.report.canRevoke,false)
 await p.accept();assert.equal(p.data.preview.consentStatus,'ACCEPTED');assert.equal(p.data.report.canRevoke,true);await p.accept();assert.equal(writes,1);p.confirmReport();assert.equal(p.data.confirmation.action,'withdraw');p.onUnload()
})
test('preview cannot invent a withdrawal action or change its relationship/artifact binding',async t=>{
 const dto=consentDTO(false),service=createParentService({get:async()=>dto},session()),{instance:p}=page(service,session(),t,{view:'consent',relationshipId:'link-1',artifactId:'artifact-1'})
 await p.onShow();p.confirmReport();assert.equal(p.data.confirmation,null);p.onUnload()
 for(const field of ['relationshipId','artifactId']){const service=createParentService({get:async()=>({...consentDTO(),[field]:'other-id'})},session());await assert.rejects(service.view({view:'consent',relationshipId:'link-1',artifactId:'artifact-1'}),{kind:'invalidResponse'})}
})
test('hide or logout during withdrawal does not restore private report or reopen stale confirmation',async t=>{
 for(const transition of ['hide','logout','unload']){
  let release;const s=session(),service=createParentService({get:async()=>consentDTO(),post:async()=>new Promise(resolve=>{release=()=>resolve({revoked:true})})},s),{instance:p}=page(service,s,t,{view:'consent',relationshipId:'link-1',artifactId:'artifact-1'})
  await p.onShow();p.confirmReport();const pending=p.confirm();if(transition==='hide')p.onHide();else if(transition==='unload')p.onUnload();else s.logout();release();await pending
  assert.equal(p.data.confirmation,null);assert.equal(p.data.report,null);assert.equal(p.data.preview,null);assert.equal(p.data.reportBlocks.length,0);p.onUnload()
 }
})
