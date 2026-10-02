const { ApiError } = require('../errors/index')
function createStorage(platform, origin) {
  const prefix = 'huisurvey:v2:' + encodeURIComponent(origin) + ':'
  let queue = Promise.resolve()
  const call = (method, args) => new Promise((resolve, reject) => platform[method](Object.assign({}, args, {success: resolve, fail: reject})))
  return {
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
