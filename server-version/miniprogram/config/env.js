// This file is replaced by the miniprogram build step for development,
// staging, and production. It is intentionally immutable at runtime: pages
// never accept a user-provided API host.
const BUILD_ENV = 'production'

const ENVIRONMENTS = Object.freeze({
  development: Object.freeze({
    name: 'development',
    baseUrl: 'http://localhost:3000',
    socketUrl: 'ws://localhost:3000/classroom',
  }),
  staging: Object.freeze({
    name: 'staging',
    baseUrl: 'https://staging-api.eduk12.top',
    socketUrl: 'wss://staging-api.eduk12.top/classroom',
  }),
  production: Object.freeze({
    name: 'production',
    baseUrl: 'https://api.eduk12.top',
    socketUrl: 'wss://api.eduk12.top/classroom',
  }),
})

const selected = ENVIRONMENTS[BUILD_ENV] || ENVIRONMENTS.production

module.exports = Object.freeze({
  BUILD_ENV,
  BASE_URL: selected.baseUrl,
  SOCKET_URL: selected.socketUrl,
})
