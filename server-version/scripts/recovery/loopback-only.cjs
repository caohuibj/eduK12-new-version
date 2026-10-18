'use strict'

// Development-only preload. Keep the unmodified compiled API on loopback
// without changing global network settings or production listen defaults.
const net = require('node:net')
const originalListen = net.Server.prototype.listen
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'number') {
    if (typeof args[1] === 'string' && args[1] !== '127.0.0.1') {
      throw new Error('RECOVERY_NON_LOOPBACK_LISTENER')
    }
    if (typeof args[1] !== 'string') args.splice(1, 0, '127.0.0.1')
  } else if (args[0] && typeof args[0] === 'object' && 'port' in args[0]) {
    if (args[0].host && args[0].host !== '127.0.0.1') {
      throw new Error('RECOVERY_NON_LOOPBACK_LISTENER')
    }
    args[0] = { ...args[0], host: '127.0.0.1' }
  } else {
    throw new Error('RECOVERY_UNSUPPORTED_LISTENER')
  }
  return originalListen.apply(this, args)
}
