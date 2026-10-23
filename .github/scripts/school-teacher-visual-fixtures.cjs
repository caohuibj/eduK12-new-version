'use strict';
// Synthetic UI DTOs only. No backend authorization or persistence claim.
const ORG='11111111-1111-4111-8111-111111111111';
const long='合成学校与教师发展协作中心 · 长名称布局检查';
const definition={schemaVersion:2,pages:[{pageKey:'page',title:'第一页',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'请描述本次学习与校园活动的体验',required:false,allowRefusal:false,options:[],rows:[]}]}]};
const privateForm={id:'draft',kind:'FORM',title:'合成表单 · 校园活动与成长体验',revision:1,contentHash:'synthetic-hash-1',definition};
const schoolForm={id:'f1',title:'合成学校表单',status:'DRAFT',revision:1,definitionDigest:'synthetic-hash-1',definition};
const schoolUser={id:'psych',username:'合成心理教师 · 长姓名测试',role:'TEACHER',accountDomain:'SCHOOL',mustChangePassword:false};
const teacherUser={id:'teacher',username:'合成教师 · 长姓名测试',role:'TEACHER',mustChangePassword:false,organizations:[{organizationId:ORG,organizationName:long,productAdmin:true}]};
function apiResponse(method,pathname,search,state){
 if(method!=='GET')throw Error('Unexpected mutation: '+method+' '+pathname);
 const denied=()=>({status:401,data:null,code:'UNAUTHENTICATED',message:'合成未登录状态'});
 if(pathname==='/api/capabilities')return {data:{cognitive:false,parentPortal:false}};
 if(pathname==='/api/auth/me')return state.adminSession?{data:{id:'admin',username:'合成管理员 · 长姓名测试',role:'TEACHER',businessRole:'TEACHER',platformRole:'STANDARD',entryGrants:state.denied?[]:[{entry:'HUISCHOOL',version:1},{entry:'HUITEACHER',version:1}],mustChangePassword:false}}:denied();
 if(pathname==='/api/organizations')return {data:{allowedActions:[],platformRole:'STANDARD',list:[],total:0,page:1,pageSize:20}};
 if(['/api/relational-assessments/catalog','/api/relational-assessments/tasks'].includes(pathname))return {data:{list:[]}};
 if(pathname===`/api/platform/education/organizations/${ORG}/products`)return {data:[{product:'HUISCHOOL',status:'ACTIVE',revision:1},{product:'HUITEACHER',status:'ACTIVE',revision:1}]};
 if(pathname===`/api/platform/education/organizations/${ORG}/teacher-admins`)return {data:{list:[],truncated:false}};
 const school=pathname.startsWith('/api/campus/'),teacher=pathname.startsWith('/api/huiteacher/');
 if(!school&&!teacher)throw Error('Unexpected API: '+method+' '+pathname+search);
 const route=pathname.replace(school?'/api/campus':'/api/huiteacher','');
 if(route==='/auth/me')return state.session?{data:school?schoolUser:teacherUser}:denied();
 if(!state.session)throw Error('Anonymous product requested protected API: '+route);
 if(route===`/organizations/${ORG}/tool-authoring-capabilities`)return {data:{canAuthor:school,authorableToolKinds:school?['SCALE','FORM']:[]}};
 if(school){
  if(route==='/organizations')return {data:{list:[{id:ORG,name:long,orgRole:'MEMBER'}]}};
  if(route==='/reports/availability')return {data:{parentReportsEnabled:false}};
  if(route===`/organizations/${ORG}/context`)return {data:{access:{orgRole:'MEMBER',canGovern:false,personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[]}}};
  if(route===`/organizations/${ORG}/private-tools`)return {data:{list:[privateForm],nextCursor:null}};
  if(route===`/organizations/${ORG}/private-tools/draft`)return {data:privateForm};
  if(route===`/organizations/${ORG}/private-tools/draft/versions`)return {data:{list:[],nextCursor:null}};
 }else{
  if(route===`/organizations/${ORG}/forms`)return {data:{list:[schoolForm]}};
  if(route===`/organizations/${ORG}/forms/f1`)return {data:schoolForm};
  if([`/organizations/${ORG}/staff-class-assignments`,`/organizations/${ORG}/student-class-assignments`].includes(route))return {data:{list:[],total:0}};
  if(['/personal-scale/catalog','/personal-scale/assessments','/my-form-tasks','/my-private-form-tasks','/my-scale-tasks',`/organizations/${ORG}/evaluation-targets`,`/organizations/${ORG}/evaluation-events`].includes(route))return {data:{list:[],nextCursor:null}};
 }
 if([`/organizations/${ORG}/units`,`/organizations/${ORG}/members`].includes(route))return {data:{list:[]}};
 throw Error('Unexpected product API: '+method+' '+pathname+search);
}
module.exports={ORG,privateForm,schoolForm,apiResponse};
