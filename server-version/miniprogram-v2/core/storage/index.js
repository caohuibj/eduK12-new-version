const { ApiError } = require('../errors/index')
function createStorage(platform, origin) {
  const prefix = 'huisurvey:v2:' + encodeURIComponent(origin) + ':'
  let queue = Promise.resolve()
  const call = (method, args) => new Promise((resolve, reject) => platform[method](Object.assign({}, args, {success: resolve, fail: reject})))
  const draftPrefix = prefix + 'draft:'
  const draftIndex = prefix + 'draft-index'
  const missing = Symbol('missing storage record')
  const enqueue = operation => {const result=queue.catch(()=>{}).then(operation);queue=result;return result}
  const notFound = error => Boolean(error && typeof error.errMsg === 'string' && /^(?:(?:getStorage|removeStorage):fail[: ]*)?(?:data not found|数据不存在|数据未找到)\s*$/i.test(error.errMsg))
  const remove = async key => {
    try {return await call('removeStorage',{key})} catch(error) {
      if (notFound(error)) return
      if (platform.removeStorageSync) {platform.removeStorageSync(key);return}
      throw new ApiError('storageUnavailable','无法清理本机草稿，请重试')
    }
  }
  async function read(key) {
    if (!platform.canIUse || !platform.canIUse('getStorage.object.encrypt')) throw new ApiError('storageUnavailable','当前微信版本无法安全读取草稿')
    try {return (await call('getStorage',{key,encrypt:true})).data} catch(error) {
      if (notFound(error)) return missing
      throw new ApiError('storageUnavailable','无法读取本机草稿，请重试')
    }
  }
  async function index() {
    const list=await read(draftIndex)
    if (list===missing) return []
    if (!Array.isArray(list)||list.length>50||new Set(list).size!==list.length||list.some(k=>typeof k!=='string'||!k.startsWith(draftPrefix))) throw new ApiError('storageUnavailable','草稿目录不可验证，停止保存')
    return list
  }
  async function write(key,data) {
    if (!platform.canIUse||!platform.canIUse('setStorage.object.encrypt')) throw new ApiError('storageUnavailable','当前微信版本无法安全保存草稿')
    try {return await call('setStorage',{key,data,encrypt:true})} catch(_) {throw new ApiError('storageUnavailable','草稿保存失败，答案尚未提交；请释放存储后重试')}
  }
  // Reserve the index before first write so every successfully sealed body is discoverable.
  // A failed/interrupted create or delete may leave a missing body; only that entry is repaired.
  // All reads and repairs share the write queue, so an in-flight reservation is never pruned.
  async function recoverIndex() {
    const keys=await index(), rows=[]
    for (const full of keys) {
      const value=await read(full)
      if (value!==missing) rows.push({full,value})
    }
    if (rows.length!==keys.length) await write(draftIndex,rows.map(row=>row.full))
    return rows
  }
  return {
    readDraft(key) {return enqueue(async()=>{
      await recoverIndex()
      const value=await read(draftPrefix+key)
      if (value===missing) return null
      if (value===null||value===undefined) throw new ApiError('draftConflict','本机草稿不可验证，请先核对服务器状态')
      return value
    })},
    listDrafts() {return enqueue(async()=> (await recoverIndex()).map(row=>({key:row.full.slice(draftPrefix.length),value:row.value})))},
    writeDraft(key,data,guard,assertExisting) {return enqueue(async()=>{
      guard()
      if (JSON.stringify(data).length>262144) throw new ApiError('storageUnavailable','草稿超过本机保存上限')
      const full=draftPrefix+key,rows=await recoverIndex(),list=rows.map(row=>row.full)
      guard()
      const existing=rows.find(row=>row.full===full)
      if (existing&&assertExisting) assertExisting(existing.value)
      if (!list.includes(full)) {
        if (list.length>=50) throw new ApiError('storageUnavailable','本机草稿数量已达上限')
        await write(draftIndex,list.concat(full))
      }
      guard();await write(full,data);guard()
    })},
    removeDraft(key,guard) {return enqueue(async()=>{
      guard();const full=draftPrefix+key,list=await index();guard()
      await remove(full);guard()
      await write(draftIndex,list.filter(k=>k!==full));guard()
    })},
    clearDrafts() {return enqueue(async()=>{const list=await index();for(const key of list) await remove(key);await remove(draftIndex)})},
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
