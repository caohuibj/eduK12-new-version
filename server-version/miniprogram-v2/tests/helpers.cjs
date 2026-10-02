const assert=require('node:assert/strict')
function mobile(role, mustChangePassword=false) {
 const staff=['TEACHER','ADMIN'].includes(role)
 return {schemaVersion:1,availableRoles:[role],activeRole:role,capabilities:{canReadProfile:true,canReadOwnAssessments:!mustChangePassword,canReadStudentTasks:!mustChangePassword&&role==='STUDENT',canReadCourses:!mustChangePassword&&(staff||role==='STUDENT'),canManageCourse:!mustChangePassword&&staff,canDiscoverOrganizations:!mustChangePassword,canReadUsers:!mustChangePassword&&role==='ADMIN',canReadChildren:false,canReadChildReports:false}}
}
function user(role='STUDENT',mustChangePassword=false){return {id:role+'-user',username:role.toLowerCase(),nickname:'测试用户',role,mustChangePassword,mobile:mobile(role,mustChangePassword)}}
function response(data,statusCode=200,cookies=[],header={}){return {statusCode,cookies,header,data:{code:statusCode===200?0:-1,message:'操作成功',data}}}
function platform(handler) {
 const stored=new Map(); const calls=[]; const navigation=[]
 const p={calls,stored,navigation,canIUse:()=>true,
 request(options){calls.push(options);Promise.resolve().then(()=>handler(options)).then(options.success,options.fail)},
 setStorage(options){assert.equal(options.encrypt,true);stored.set(options.key,structuredClone(options.data));queueMicrotask(()=>options.success({}))},
 getStorage(options){assert.equal(options.encrypt,true);queueMicrotask(()=>stored.has(options.key)?options.success({data:structuredClone(stored.get(options.key))}):options.fail({}))},
 removeStorage(options){stored.delete(options.key);queueMicrotask(()=>options.success({}))},
 getNetworkType(options){options.success({networkType:'wifi'})},onNetworkStatusChange(listener){p.networkChange=listener},
 reLaunch(value){navigation.push(value.url)},navigateTo(value){navigation.push(value.url)},stopPullDownRefresh(){},showToast(){},scanCode(){},
 }
 return p
}
const csrf=()=>response({csrfToken:'csrf-one'},200,['ptool_csrf=csrf-one; Path=/; Secure; Max-Age=604800'])
const session=()=>['ptool_session=test-session; Path=/; HttpOnly; Secure; Max-Age=604800']
module.exports={platform,response,csrf,session,user,mobile}
