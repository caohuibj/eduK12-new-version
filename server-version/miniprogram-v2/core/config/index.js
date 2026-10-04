function canonicalOrigin(value) {return typeof value==='string'?value.toLowerCase().replace(/:443$/, ''):value}
function createConfig(origin) {
  if (typeof origin !== 'string' || !/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin)) {
    throw new Error('请配置 HTTPS 后端地址')
  }
  return Object.freeze({ origin, apiBase: origin + '/api', timeout: 12000 })
}
module.exports = { createConfig, canonicalOrigin }
