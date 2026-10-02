const fs=require('node:fs');const path=require('node:path')
const root=path.resolve(__dirname,'../../..');const file=path.join(root,'server-version/frontend/src/App.tsx');const source=fs.readFileSync(file,'utf8')
const rows=[]
for(const match of source.matchAll(/<Route\b([\s\S]*?)(?:\/>|<\/Route>)/g)) {
 const route=match[1].match(/\bpath="([^"]+)"/);if(!route)continue
 const value=route[1]; const body=match[1];let roles=[]
 const explicit=body.match(/roles=\{\[([^\]]+)\]\}/)
 if(explicit)roles=[...explicit[1].matchAll(/'(STUDENT|PARENT|TEACHER|ADMIN)'/g)].map(m=>m[1])
 else if(body.includes('ParentProtectedRoute'))roles=['PARENT']
 else if(body.includes('StudentProtectedRoute'))roles=['STUDENT']
 else if(body.includes('LegacyRelationalTasksRoute'))roles=['STUDENT','PARENT','TEACHER']
 else if(body.includes('ScaleLibraryRoute'))roles=['STUDENT','TEACHER','ADMIN']
 else if(body.includes('ProtectedRoute'))roles=['TEACHER','ADMIN']
 else if(value.includes('login')||value.includes('register')||value.startsWith('/public/'))roles=['PUBLIC']
 else roles=['CONTRACT_REVIEW_REQUIRED']
 const domain=/login|register|profile|password/.test(value)?'account':/cognitive/.test(value)?'assessments':/report|result|longitudinal/.test(value)?'reports':/organization/.test(value)?'organizations':/course|dashboard/.test(value)?'courses':/user|teacher-code/.test(value)?'administration':/student|assignment|checkin/.test(value)?'tasks':/classroom/.test(value)?'classroom':'assessments'
 const base={webRoute:value,roles,domain,source:'server-version/frontend/src/App.tsx:'+String(source.slice(0,match.index).split('\n').length),implementationType:/cognitive/.test(value)?'WEB_RUNTIME':'NATIVE',status:domain==='assessments'||domain==='reports'?'PLANNED_PR3':'PLANNED_PR2',miniDestination:null,capability:null,apiDependency:[],test:null}
 const implemented={ '/student': ['courses','canReadCourses','/courses/my'], '/dashboard':['courses','canReadCourses','/courses'], '/users':['users','canReadUsers','/users'], '/organizations':['organizations','canDiscoverOrganizations','/organizations'], '/my-assessments':['assessments','canReadOwnAssessments','/my-assessments'] }[value]
 if(implemented)Object.assign(base,{miniDestination:'/pages/list/index?domain='+implemented[0],capability:implemented[1],apiDependency:[implemented[2]],status:'FOUNDATION_READ_ONLY',test:'tests/pages.test.cjs + tests/runtime.test.cjs (fixture; real-device pending)'})
 rows.push(base)
}
const target=path.join(root,'docs/miniprogram-v2/web-feature-inventory.json');const content=JSON.stringify({baseline:'1ff0e8ef',generatedFrom:'server-version/frontend/src/App.tsx',note:'Route evidence inventory; CONTRACT_REVIEW_REQUIRED roles require manual authority review. Foundation lists do not imply action/runner/report parity.',features:rows},null,2)+'\n'
if(process.argv.includes('--check')) {if(fs.readFileSync(target,'utf8')!==content)throw new Error('Feature inventory is stale')}
else fs.writeFileSync(target,content)
console.log('Web route inventory: '+rows.length+' routes')
