const { ApiError } = require('../errors/index')
function createStorage(platform, origin) {
  const prefix = 'huisurvey:v2:' + encodeURIComponent(origin) + ':'
  let queue = Promise.resolve()
  const call = (method, args) => new Promise((resolve, reject) => platform[method](Object.assign({}, args, {success: resolve, fail: reject})))
  const draftIndex=prefix+'draft-index'
  const enqueue=operation=>{const result=queue.catch(()=>{}).then(operation);queue=result;return result}
  const remove=async key=>{try{return await call('removeStorage',{key})}catch(_){if(platform.removeStorageSync){platform.removeStorageSync(key);return}throw new ApiError('storageUnavailable','无法清理本机草稿，请重试')}}
  async function read(key){if(!platform.canIUse||!platform.canIUse('getStorage.object.encrypt'))throw new ApiError('storageUnavailable','当前微信版本无法安全读取草稿');try{return (await call('getStorage',{key,encrypt:true})).data}catch(e){if(!e||!e.errMsg||/not found|不存在|data not found/i.test(e.errMsg))return null;throw new ApiError('storageUnavailable','无法读取本机草稿，请重试')}}
  async function index(){const list=await read(draftIndex);if(list===null)return [];if(!Array.isArray(list)||list.length>50||list.some(k=>typeof k!=='string'||!k.startsWith(prefix+'draft:')))throw new ApiError('storageUnavailable','草稿目录不可验证，停止保存');return list}
  async function write(key,data){if(!platform.canIUse||!platform.canIUse('setStorage.object.encrypt'))throw new ApiError('storageUnavailable','当前微信版本无法安全保存草稿');try{return await call('setStorage',{key,data,encrypt:true})}catch(_){throw new ApiError('storageUnavailable','草稿保存失败，答案尚未提交；请释放存储后重试')}}
  return {
    readDraft(key){return read(prefix+'draft:'+key)},
    async listDrafts(){const keys=await index();return Promise.all(keys.map(async full=>({key:full.slice((prefix+'draft:').length),value:await read(full)})))},
    writeDraft(key,data,guard){return enqueue(async()=>{guard();if(JSON.stringify(data).length>262144)throw new ApiError('storageUnavailable','草稿超过本机保存上限');const full=prefix+'draft:'+key,list=await index();guard();if(!list.includes(full)){if(list.length>=50)throw new ApiError('storageUnavailable','本机草稿数量已达上限');await write(draftIndex,list.concat(full))}guard();await write(full,data);guard()})},
    removeDraft(key,guard){return enqueue(async()=>{guard();const full=prefix+'draft:'+key,list=await index();guard();await remove(full);await write(draftIndex,list.filter(k=>k!==full))})},
    clearDrafts(){return enqueue(async()=>{const list=await index();for(const key of list)await remove(key);await remove(draftIndex)})},
    async readSession() {
      if (!platform.canIUse || !platform.canIUse('getStorage.object.encrypt')) return null
      try { const res = await call('getStorage', {key: prefix + 'session', encrypt: true}); return res.data } catch (_) { return null }
    },
    writeSession(value) {
      const operation = queue.catch(() => {}).then(async () => {
        if (value === null) {
          try { return await call('removeStorage', {key: prefix + 'session'}) }
          catch (_) {
            if (platform.removeStorageSync) { platform.removeStorageSync(prefix + 'session'); return }
            throw new ApiError('storageUnavailable', '无法清理本地登录，请重试退出')
          }
        }
        if (!platform.canIUse || !platform.canIUse('setStorage.object.encrypt')) throw new ApiError('storageUnavailable', '当前微信版本无法安全保存登录，请升级微信')
        return call('setStorage', {key: prefix + 'session', data: value, encrypt: true})
      })
      queue = operation; return operation
    },
  }
}
module.exports = { createStorage }
