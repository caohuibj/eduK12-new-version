const fs=require('node:fs');const path=require('node:path')
const root=path.resolve(__dirname,'../../..'),rows=[]
const test='tests/operations.test.cjs + backend miniprogramOperationsHttp.postgres.integration.test.ts; WeChat device pending'
function mapping(route){
 if(route==='/parent')return {domain:'parents',miniDestination:'/pages/home/index',status:'LOCAL_CORE_IMPLEMENTED',capability:'canReadChildren',apiDependency:['/parent-links','/parents/me/children'],limitation:'Default disabled; formal report producer and source integration pending PR3.'}
 if(route==='/'||/login|register/.test(route))return {domain:'account',miniDestination:'/pages/auth/login/index',status:'LOCAL_PR1_IMPLEMENTED',capability:null,apiDependency:['/auth/login','/auth/student-register','/auth/teacher-register'],limitation:'Uses current account login; old course-login flow is not restored.'}
 if(/profile/.test(route))return {domain:'account',miniDestination:'/pages/profile/index',status:'LOCAL_PR1_IMPLEMENTED',capability:'canReadProfile',apiDependency:['/users/:id','/auth/change-password','/auth/logout']}
 // Classroom must precede generic student/assignment rules.
 if(/classroom/.test(route)&&!route.startsWith('/bigscreen'))return {domain:'classroom',miniDestination:route.startsWith('/student/')?'/pages/classroom/index':'/pages/list/index?domain=classrooms',status:'LOCAL_CORE_IMPLEMENTED',capability:route.startsWith('/student/')?'canJoinClassroom':'canReadClassrooms',apiDependency:['/classrooms','/mobile/classrooms/:id/state','/mobile/classrooms/:id/:command'],limitation:'Native live flag disabled; joins use six-digit code; QR image and full classroom export/bigscreen are not native.'}
 if(route.startsWith('/public/checkin/'))return {domain:'checkins',miniDestination:'/pages/public-checkin/index',status:'LOCAL_CORE_IMPLEMENTED',capability:'PUBLIC_CHECKIN_SESSION',apiDependency:['/checkins/public/:token','/checkins/public/:token/upload','/checkins/public/:token/submit']}
 if(/report|result/.test(route))return {domain:'reports',status:'PLANNED_PR3',limitation:'Canonical report rendering and formal PARENT producer pending.'}
 if(route==='/my-assessments'||route==='/relational/tasks'||route==='/organization-tasks'||(/situational|cognitive/.test(route)&&/(history|situational$|cognitive$)/.test(route))||/^\/student\/(scales|questionnaires)$/.test(route))return {domain:'assessments',miniDestination:'/pages/list/index?domain=assessments',status:'ENTRY_ONLY_PR3',capability:'canReadOwnAssessments',apiDependency:['/my-assessments'],limitation:'Inbox preserves server eligibility/truncated state; runners remain closed.'}
 if(/^\/(student|teacher|relational|public)\/(.*(?:scales|questionnaires|questionnaire|cognitive|composite|situational|studies)|attempts)/.test(route)||route.startsWith('/relational/attempts/'))return {domain:'assessments',status:'PLANNED_PR3',limitation:'FINAL_ONLY renderer/recovery/timing not implemented.'}
 if(route.startsWith('/scale-library'))return {domain:'catalog',miniDestination:'/pages/list/index?domain=catalog',status:'LOCAL_CATALOG_IMPLEMENTED',capability:'canReadCatalog',apiDependency:['/scale-library','/parent-tool-policies/SCALE/:key/:version'],limitation:'Tool ceiling settings require current SYSTEM_ADMIN; setting a ceiling does not publish content.'}
 if(route.startsWith('/organizations'))return {domain:'organizations',miniDestination:'/pages/organizations/index',status:'PARTIAL_PR2',capability:'canDiscoverOrganizations',apiDependency:['/organizations','/organizations/:id/context','/organizations/:id/runs'],limitation:'Create/add-member and Run delivery implemented. Member role/capability changes await explicit approval; structure and advanced governance remain Web-only.'}
 if(route==='/users'||route==='/teacher-codes')return {domain:'administration',miniDestination:'/pages/list/index?domain='+ (route==='/users'?'users':'teacherCodes'),status:'LOCAL_CORE_IMPLEMENTED',capability:route==='/users'?'canReadUsers':'canReadTeacherCodes',apiDependency:[route,'/mobile/context/:domain'],limitation:'Account lifecycle additionally requires current SYSTEM_ADMIN; no implicit parent-child authority.'}
 if(route==='/students'||/courses\/.*students/.test(route))return {domain:'students',miniDestination:'/pages/list/index?domain=students',status:'LOCAL_CORE_IMPLEMENTED',capability:'canReadStudents',apiDependency:['/mobile/students','/courses/:id/students']}
 if(route==='/student'||route==='/dashboard'||route==='/courses'||route.startsWith('/courses/')||route.startsWith('/student/courses/'))return {domain:'courses',miniDestination:route==='/student'||route==='/dashboard'?'/pages/home/index':'/pages/list/index?domain=courses',status:'LOCAL_CORE_IMPLEMENTED',capability:'canReadCourses',apiDependency:['/mobile/lists/courses','/courses','/courses/:id','/mobile/context/courses'],limitation:'Server-native daily management; no per-row cover signing in mobile lists.'}
 if(/assignments|checkins/.test(route))return {domain:/checkins/.test(route)?'checkins':'assignments',miniDestination:'/pages/list/index?domain='+(/checkins/.test(route)?'checkins':'assignments'),status:'LOCAL_CORE_IMPLEMENTED',capability:/checkins/.test(route)?'canReadCheckins':'canReadAssignments',apiDependency:['/mobile/lists/:domain','/:domain/:id','/:domain/:id/submit'],limitation:'Canonical create/edit/submit/revision/grade/image flows; no client scoring.'}
 if(/scales|questionnaires|bundle-products|composite-assessments|cognitive-assignments|sjt-authoring|instrument-authorizations|material-grants/.test(route))return {domain:'content-management',status:'PENDING_PARITY_REVIEW',limitation:'Scientific authoring/lifecycle is not equivalent to native catalog or Run delivery; retained as explicit unmet Web parity, not silently marked PR3.'}
 if(/^\/(videos|images|documents)$/.test(route))return {domain:'media-library',status:'PENDING_PR2',limitation:'Image uploads exist within course/task flows; standalone media library management not implemented.'}
 return {domain:'other',status:'WEB_REFERENCE_ONLY',limitation:'Bigscreen/development lab/fallback require applicability review.'}
}
function scan(relative,organization=false){
 const source=fs.readFileSync(path.join(root,relative),'utf8')
 for(const match of source.matchAll(/<Route\b([\s\S]*?)(?:\/>|<\/Route>)/g)){
  const route=match[1].match(/\bpath="([^"]+)"/);if(!route)continue
  const value=route[1],body=match[1];let roles=[];const explicit=body.match(/roles=\{\[([^\]]+)\]\}/)
  if(explicit)roles=[...explicit[1].matchAll(/'(STUDENT|PARENT|TEACHER|ADMIN)'/g)].map(m=>m[1])
  else if(organization)roles=['STUDENT','PARENT','TEACHER','ADMIN']
  else if(body.includes('ParentProtectedRoute'))roles=['PARENT']
  else if(body.includes('StudentProtectedRoute'))roles=['STUDENT']
  else if(body.includes('LegacyRelationalTasksRoute'))roles=['STUDENT','PARENT','TEACHER']
  else if(body.includes('ScaleLibraryRoute'))roles=['STUDENT','TEACHER','ADMIN']
  else if(body.includes('ProtectedRoute'))roles=['TEACHER','ADMIN']
  else if(value==='/'||value.includes('login')||value.includes('register')||value.startsWith('/public/')||value.startsWith('/bigscreen'))roles=['PUBLIC']
  else roles=['CONTRACT_REVIEW_REQUIRED']
  rows.push({webRoute:value,roles,source:relative+':'+String(source.slice(0,match.index).split('\n').length),implementationType:'NATIVE',miniDestination:null,capability:null,apiDependency:[],test,...mapping(value)})
 }
 if(organization)for(const value of ['/organizations','/organizations/new','/my-assessments','/organization-tasks'])rows.push({webRoute:value,roles:['STUDENT','PARENT','TEACHER','ADMIN'],source:relative+':'+String(source.slice(0,Math.max(0,source.indexOf("'"+value+"'"))).split('\n').length),implementationType:'NATIVE',miniDestination:null,capability:null,apiDependency:[],test,...mapping(value)})
}
scan('server-version/frontend/src/App.tsx');scan('server-version/frontend/src/pages/organization/OrganizationProductRoutes.tsx',true)
const target=path.join(root,'docs/miniprogram-v2/web-feature-inventory.json'),content=JSON.stringify({baseline:'1ff0e8ef',generatedFrom:['server-version/frontend/src/App.tsx','server-version/frontend/src/pages/organization/OrganizationProductRoutes.tsx'],note:'Route evidence does not prove complete parity. LOCAL means local implementation/tests only; all native compile/device gates pending. Pending authoring/media/governance are retained explicitly.',features:rows},null,2)+'\n'
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==content)throw new Error('Feature inventory is stale')}else fs.writeFileSync(target,content)
console.log('Web route inventory: '+rows.length+' routes')
