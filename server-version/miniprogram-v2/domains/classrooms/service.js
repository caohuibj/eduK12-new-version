const { ApiError } = require('../../core/errors/index')
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new ApiError('invalidRequest','课堂标识无效');return encodeURIComponent(value)}
function createClassroomService(api,session){
 function requireCapability(name){if(!session.get().capabilities[name])throw new ApiError('forbidden','实时课堂入口不可用')}
 async function join(code){requireCapability('canJoinClassroom');if(!/^\d{6}$/.test(code))throw new ApiError('invalidRequest','请输入六位课堂码');return api.post('/mobile/classrooms/join',{code})}
 async function state(classroomId){requireCapability('canUseClassroomRuntime');const data=await api.get('/mobile/classrooms/'+id(classroomId)+'/state');if(!Array.isArray(data.availableActions)||!data.classroom||!Number.isFinite(Date.parse(data.serverNow)))throw new ApiError('invalidResponse','课堂状态响应无效');return data}
 async function command(classroomId,action,body,snapshot){requireCapability('canUseClassroomRuntime');if(!['START','END','CLOSE','SUBMIT','LEAVE'].includes(action)||!snapshot.availableActions.includes(action))throw new ApiError('forbidden','课堂操作已变化，请刷新');return api.post('/mobile/classrooms/'+id(classroomId)+'/'+action.toLowerCase(),body)}
 return {join,state,command}
}
module.exports={createClassroomService}
