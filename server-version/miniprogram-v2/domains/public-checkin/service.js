const { ApiError } = require('../../core/errors/index')
const tokenPath=token=>{if(typeof token!=='string'||!/^[A-Za-z0-9_-]{16,512}$/.test(token))throw new ApiError('invalidEntry','公开链接无效');return '/checkins/public/'+encodeURIComponent(token)}
function createPublicCheckinService(api){
 async function open(token){const data=await api.get(tokenPath(token),{scope:'public'});if(!data.checkin||!/^session_[a-z0-9]{16}$/.test(data.sessionId)||typeof data.sessionCapability!=='string'||!Number.isFinite(Date.parse(data.sessionExpiresAt)))throw new ApiError('invalidResponse','公开打卡响应无效');return Object.assign({},data,{token})}
 function capability(context){if(!context||Date.now()>=Date.parse(context.sessionExpiresAt))throw new ApiError('unavailable','打卡凭据已过期，请重新打开链接');return {publicCheckin:context,scope:'public'}}
 async function upload(context,filePath){return api.upload(tokenPath(context.token)+'/upload',filePath,Object.assign(capability(context),{formData:{sessionId:context.sessionId}}))}
 async function submit(context,content,images){if(typeof content!=='string'||content.length>1000||images.length>9)throw new ApiError('invalidRequest','打卡内容超出允许范围');return api.post(tokenPath(context.token)+'/submit',{sessionId:context.sessionId,content,images:images.map(i=>({assetId:i.assetId}))},capability(context))}
 async function media(context,images){const local=[];try{for(const image of images){if(!image||typeof image.url!=='string')continue;local.push({url:await api.downloadAsset(image.url,capability(context))})}return local}catch(error){local.forEach(i=>api.discardFile(i.url));throw error}}
 return {open,upload,submit,media,discard:images=>(images||[]).forEach(i=>api.discardFile(i.url))}
}
module.exports={createPublicCheckinService}
