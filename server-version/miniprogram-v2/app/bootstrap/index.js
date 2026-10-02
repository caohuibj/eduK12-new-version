const { createConfig } = require('../../core/config/index')
const { createStorage } = require('../../core/storage/index')
const { createCookieJar } = require('../../core/auth/cookies')
const { createNetwork } = require('../../core/network/index')
const { createTelemetry } = require('../../core/telemetry/index')
const { createApiClient } = require('../../core/api/client')
const { createAccountService } = require('../../domains/account/service')
const { createSession } = require('../session/index')
function createRuntime(platform, origin) {
  const config = createConfig(origin); const storage = createStorage(platform, origin)
  const jar = createCookieJar(storage); const network = createNetwork(platform); const telemetry = createTelemetry()
  let session
  const api = createApiClient({platform, config, jar, network, telemetry, onExpired: epoch => session.expire(epoch)})
  const account = createAccountService(api)
  session = createSession({account, jar, telemetry})
  return {api, account, session, network, config}
}
module.exports = { createRuntime }
