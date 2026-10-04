const { createConfig, canonicalOrigin } = require('./index')
function resolveEnvironment(platform,environment) {
  const info=platform.getAccountInfoSync?.().miniProgram
  if (!info||!['develop','trial','release'].includes(info.envVersion)) throw new Error('无法确认小程序版本，请使用微信开发者工具或正式微信打开')
  const origin=canonicalOrigin(environment.origins?.[info.envVersion])
  if (!origin) throw new Error('当前版本尚未配置服务地址，请联系管理员')
  createConfig(origin)
  const host=origin.replace(/^https:\/\//,'').split(':')[0]
  if (/^\d+(?:\.\d+){3}$/.test(host)||host==='localhost'||/\.(?:invalid|example|test)$/.test(host)) throw new Error('当前版本的服务地址未完成配置，请联系管理员')
  if (info.envVersion!=='release'&&origin===canonicalOrigin(environment.origins.release)) throw new Error('验收版本不能连接正式服务，请配置独立的验收环境')
  if (info.envVersion==='release'&&!/^wx[a-f0-9]{16}$/i.test(info.appId||'')) throw new Error('当前版本尚未配置正式小程序身份，请联系管理员')
  return {origin,envVersion:info.envVersion}
}
module.exports={resolveEnvironment}
