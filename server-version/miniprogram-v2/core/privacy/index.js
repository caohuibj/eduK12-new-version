const { ApiError } = require('../errors/index')
function createPrivacy(platform) {
  const listeners = new Set()
  let state = {open:false,contractName:'小程序隐私保护指引',errorMessage:''}
  let resolveAuthorization = null, flight = null, generation = 0, authorizationGuard = null
  const publish = value => {state=Object.assign({},state,value);listeners.forEach(listener=>listener(state))}
  if (platform.onNeedPrivacyAuthorization) platform.onNeedPrivacyAuthorization(resolve => {
    if(!authorizationGuard||!authorizationGuard()){resolve({event:'disagree'});return}
    if (resolveAuthorization) resolveAuthorization({event:'disagree'})
    resolveAuthorization=resolve
    publish({open:true,errorMessage:''})
  })
  return {
    subscribe(listener){listeners.add(listener);listener(state);return()=>listeners.delete(listener)},
    async ensure(canContinue=()=>true) {
      if (flight) return flight
      const started=generation,active=()=>started===generation&&canContinue(),operation=(async()=>{
        if (!platform.getPrivacySetting || !platform.requirePrivacyAuthorize || !platform.onNeedPrivacyAuthorization) {
          throw new ApiError('unsupportedPlatform','当前微信版本无法确认图片隐私授权，请升级微信后重试')
        }
        const settings=await new Promise((resolve,reject)=>platform.getPrivacySetting({success:resolve,fail:()=>reject(new ApiError('privacyUnavailable','无法读取隐私授权状态，请重试'))}))
        if(!active())throw new ApiError('cancelled','已取消选图')
        if (typeof settings.needAuthorization!=='boolean') throw new ApiError('privacyUnavailable','隐私授权状态无效，请重试')
        publish({contractName:settings.privacyContractName||'小程序隐私保护指引',errorMessage:''})
        if (!settings.needAuthorization) return
        authorizationGuard=active
        await new Promise((resolve,reject)=>platform.requirePrivacyAuthorize({success:resolve,fail:()=>reject(new ApiError('privacyDenied','尚未同意图片隐私授权，可以继续使用其他功能'))}))
        if(!active())throw new ApiError('cancelled','已取消选图')
      })()
      flight=operation
      try {return await operation} finally {if(flight===operation){flight=null;authorizationGuard=null}}
    },
    agree(buttonId) {
      if (!resolveAuthorization) return
      const resolve=resolveAuthorization;resolveAuthorization=null;publish({open:false})
      resolve({event:'agree',buttonId})
    },
    cancel() {
      generation++
      const resolve=resolveAuthorization;resolveAuthorization=null;publish({open:false})
      if (resolve) resolve({event:'disagree'})
    },
    async openContract() {
      if (!platform.openPrivacyContract) throw new ApiError('unsupportedPlatform','请升级微信后查看隐私保护指引')
      try {await new Promise((resolve,reject)=>platform.openPrivacyContract({success:resolve,fail:reject}))}
      catch(_){publish({errorMessage:'暂时无法打开隐私保护指引，请重试'});throw new ApiError('privacyUnavailable','暂时无法打开隐私保护指引，请重试')}
    },
  }
}
module.exports={createPrivacy}
