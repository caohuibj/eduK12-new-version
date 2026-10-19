'use strict'
require('./loopback-only.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')

for (const options of [0, { port: 0 }]) {
  test(`default binding is loopback: ${JSON.stringify(options)}`, async () => {
    const server = net.createServer()
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(options, resolve)
    })
    try { assert.equal(server.address().address, '127.0.0.1') }
    finally { await new Promise(resolve => server.close(resolve)) }
  })
}
test('explicit non-loopback bindings fail before listen', () => {
  for (const host of ['0.0.0.0', '::', '192.0.2.1']) {
    assert.throws(() => net.createServer().listen(0, host), /NON_LOOPBACK/)
    assert.throws(() => net.createServer().listen({ port: 0, host }), /NON_LOOPBACK/)
  }
})
test('unknown listen overloads fail closed', () => {
  assert.throws(() => net.createServer().listen('/tmp/unused-recovery.sock'), /UNSUPPORTED/)
})
