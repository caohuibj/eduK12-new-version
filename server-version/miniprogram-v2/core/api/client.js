const { ApiError, fromResponse } = require('../errors/index')
const PUBLIC_AUTH = /^\/auth\/(login|csrf|student-register|teacher-register|verify-teacher-code)$/
function createApiClient({platform, config, jar, network, telemetry, onExpired = () => {}}) {
  let csrfFlight = null
  function validate(path) {
    if (typeof path !== 'string' || !/^\/[a-zA-Z0-9]/.test(path) || /[\\#\r\n]/.test(path) || path.includes('://') || path.includes('..')) throw new ApiError('invalidRequest', '请求地址无效')
  }
  function headers(scope,method,path,options={}){
    const result={'Cache-Control':'no-store'}
    if(scope==='session'){if(jar.header())result.Cookie=jar.header();if(method!=='GET'&&jar.csrf())result['X-CSRF-Token']=jar.csrf()}
    if(options.publicCheckin){const c=options.publicCheckin;if(scope!=='public'||!/^\/(?:checkins\/public\/|public\/assets\/)/.test(path)||typeof c.token!=='string'||!/^[A-Za-z0-9_-]{16,512}$/.test(c.token)||!/^session_[a-z0-9]{16}$/.test(c.sessionId)||!/^v1\.\d+\.[A-Za-z0-9_-]{40,100}$/.test(c.sessionCapability))throw new ApiError('invalidRequest','公开打卡凭据无效');if(path.startsWith('/checkins/public/')&&path.split('/')[3]!==c.token)throw new ApiError('invalidRequest','公开打卡链接不匹配');result['X-Checkin-Token']=c.token;result['X-Checkin-Session-Id']=c.sessionId;result['X-Checkin-Session-Capability']=c.sessionCapability}
    return result
  }
  async function transport(method, path, data, scope, expectedEpoch, options = {}) {
    if (!network.isOnline()) throw new ApiError('offline', '网络不可用，请检查连接', {retryable: true})
    if (expectedEpoch !== jar.epoch()) throw new ApiError('sessionChanged', '登录状态已变化，请重试')
    const header = Object.assign({'Content-Type':'application/json'},headers(scope,method,path,options))
    if (options.idempotencyKey !== undefined) {
      if (typeof options.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(options.idempotencyKey)) throw new ApiError('invalidRequest','提交标识无效')
      header['Idempotency-Key'] = options.idempotencyKey
    }
    const started = Date.now()
    const response = await new Promise((resolve, reject) => {
      platform.request({url: config.apiBase + path, method, data, header, timeout: config.timeout,
        success: resolve, fail: () => reject(new ApiError('network', '连接失败，请重试', {retryable: true}))})
    })
    if (scope === 'session' && expectedEpoch !== jar.epoch()) throw new ApiError('sessionChanged', '登录状态已变化，请重试')
    if (scope === 'session') await jar.absorb(response, expectedEpoch)
    telemetry.record({kind: 'request', status: response.statusCode, durationMs: Date.now() - started})
    if (response.statusCode < 200 || response.statusCode >= 300 || !response.data || response.data.code !== 0) {
      const error = fromResponse(response)
      if (error.status === 401 && scope === 'session' && !PUBLIC_AUTH.test(path.split('?')[0])) await onExpired(expectedEpoch)
      throw error
    }
    if (typeof response.data.message !== 'string' || !Object.prototype.hasOwnProperty.call(response.data, 'data')) throw new ApiError('invalidResponse', '服务响应无效，请重试')
    return response.data.data
  }
  async function ensureCsrf(expectedEpoch) {
    if (jar.csrf()) return
    if (!csrfFlight || csrfFlight.epoch !== expectedEpoch) {
      const promise = transport('GET', '/auth/csrf', undefined, 'session', expectedEpoch).then(data => {
        if (!data || typeof data.csrfToken !== 'string' || jar.csrf() !== data.csrfToken) throw new ApiError('invalidResponse', '无法验证登录安全状态，请重试')
      })
      csrfFlight = {epoch: expectedEpoch, promise}
      promise.finally(() => { if (csrfFlight && csrfFlight.promise === promise) csrfFlight = null }).catch(() => {})
    }
    return csrfFlight.promise
  }
  async function request(method, path, data, options = {}) {
    validate(path)
    method = method.toUpperCase()
    if (!['GET','POST','PUT','PATCH','DELETE'].includes(method)) throw new ApiError('invalidRequest', '请求方法无效')
    const scope = options.scope || (path.startsWith('/public/') || path.startsWith('/checkins/public/') ? 'public' : 'session')
    if (!['session','public'].includes(scope)) throw new ApiError('invalidRequest', '请求认证类型无效')
    const expectedEpoch = jar.epoch()
    if (scope === 'session' && method !== 'GET') await ensureCsrf(expectedEpoch)
    try { return await transport(method, path, data, scope, expectedEpoch, options) }
    catch (error) {
      // Never replay a mutation. One bounded retry for safe reads; Retry-After is surfaced to the UI.
      if (method === 'GET' && error.retryable && !error.retryAfterMs && options.retry !== false && error.status !== 429) return transport(method, path, data, scope, expectedEpoch, options)
      throw error
    }
  }
  async function upload(path,filePath,options={}){
    validate(path)
    if(!/^\/(?:uploads\/image|courses\/[A-Za-z0-9_-]{1,128}\/cover|checkins\/[A-Za-z0-9_-]{1,128}\/submission-image|checkins\/public\/[A-Za-z0-9_-]{16,512}\/upload)$/.test(path)||typeof filePath!=='string'||!filePath||filePath.length>2048)throw new ApiError('invalidRequest','上传入口无效')
    const scope=path.startsWith('/checkins/public/')?'public':'session',epoch=jar.epoch()
    if(!network.isOnline())throw new ApiError('offline','网络不可用')
    if(scope==='session')await ensureCsrf(epoch)
    const header=headers(scope,'POST',path,options)
    const result=await new Promise((resolve,reject)=>platform.uploadFile({url:config.apiBase+path,filePath,name:path.endsWith('/cover')?'cover':scope==='public'?'file':'image',formData:options.formData||{},header,timeout:60000,success:resolve,fail:()=>reject(new ApiError('network','图片上传结果未知，请刷新确认'))}))
    if(scope==='session'&&epoch!==jar.epoch())throw new ApiError('sessionChanged','登录状态已变化')
    if(scope==='session')await jar.absorb(result,epoch)
    try{result.data=JSON.parse(result.data)}catch(_){throw new ApiError('invalidResponse','上传响应无效')}
    if(result.statusCode<200||result.statusCode>=300||!result.data||result.data.code!==0){const e=fromResponse(result);if(e.status===401&&scope==='session')await onExpired(epoch);throw e}
    const asset=result.data.data;if(path.endsWith('/cover')&&asset&&typeof asset.coverUrl==='string')return asset;
    if(!asset||typeof asset.assetId!=='string')throw new ApiError('invalidResponse','上传未返回资源标识');return asset
  }
  function assetPath(url){const raw=typeof url==='string'&&url.startsWith(config.apiBase+'/')?url.slice(config.apiBase.length):url;if(typeof raw!=='string')throw new ApiError('invalidRequest','资源地址无效');const path=raw.startsWith('/api/')?raw.slice(4):raw;validate(path);if(!/^\/(?:public\/)?assets\/[A-Za-z0-9_-]{1,128}\/content\?/.test(path))throw new ApiError('invalidRequest','资源地址无效');return path}
  async function downloadAsset(url,options={}){
    const path=assetPath(url),scope=path.startsWith('/public/')?'public':'session',epoch=jar.epoch();if(!network.isOnline())throw new ApiError('offline','网络不可用');const result=await new Promise((resolve,reject)=>platform.downloadFile({url:config.apiBase+path,header:headers(scope,'GET',path,options),timeout:60000,success:resolve,fail:()=>reject(new ApiError('network','资源下载失败，请重试'))}));if(scope==='session'&&epoch!==jar.epoch()){discardFile(result.tempFilePath);throw new ApiError('sessionChanged','登录状态已变化')}if(result.statusCode!==200||!result.tempFilePath){discardFile(result.tempFilePath);throw new ApiError('unavailable','资源链接已失效，请刷新获取')}return result.tempFilePath
  }
  function discardFile(path){if(typeof path!=='string'||!path||!platform.getFileSystemManager)return;try{platform.getFileSystemManager().unlink({filePath:path,fail:()=>{}})}catch(_){}}
  return {publicCheckinUrl(token){if(typeof token!=='string'||!/^ck_[a-z0-9]{16}$/.test(token))throw new ApiError('invalidRequest','打卡链接无效');return config.apiBase.replace(/\/api$/,'')+'/public/checkin/'+token},request,upload,downloadAsset,discardFile,assetUrl:url=>config.apiBase+assetPath(url), get: (path, options) => request('GET', path, undefined, options), post: (path,data,options) => request('POST',path,data,options), put: (path,data,options) => request('PUT',path,data,options), patch: (path,data,options) => request('PATCH',path,data,options), delete: (path,options) => request('DELETE',path,undefined,options)}
}
module.exports = { createApiClient }
