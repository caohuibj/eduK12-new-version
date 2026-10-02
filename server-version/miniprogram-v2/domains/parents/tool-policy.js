const { ApiError }=require('../../core/errors/index')
function createToolPolicyService(api,session){
 function path(ref){if(!session.get().capabilities.canManageParentToolDisclosure)throw new ApiError('forbidden','只有超级管理员可以修改披露设置');if(!['SCALE','FORM','BUNDLE','COGNITIVE','SITUATIONAL'].includes(ref.family)||!/^[A-Za-z0-9_-]{1,128}$/.test(ref.key)||!/^[A-Za-z0-9_.-]{1,128}$/.test(ref.version)||ref.version.includes('..'))throw new ApiError('invalidRequest','测量工具标识无效');return '/parent-tool-policies/'+ref.family+'/'+encodeURIComponent(ref.key)+'/'+encodeURIComponent(ref.version)}
 return {read:async ref=>api.get(path(ref)),save:async(ref,snapshot,policy)=>{if(!snapshot.allowedActions.includes('UPDATE'))throw new ApiError('forbidden','不能修改当前设置');return api.put(path(ref),{policy,expectedVersion:snapshot.version,commandKey:snapshot.commandKey})}}
}
module.exports={createToolPolicyService}
