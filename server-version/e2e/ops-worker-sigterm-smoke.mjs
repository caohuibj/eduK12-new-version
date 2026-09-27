#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workerEntry = path.join(root, 'backend/dist/workers/main.js')
const timeoutMs = 20_000
let output = ''

const child = spawn(process.execPath, [workerEntry], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    BACKGROUND_WORKERS_ENABLED: 'true',
    ASSET_MIGRATION_COMPLETE: 'true',
    WORKER_SHUTDOWN_TIMEOUT_SECONDS: '5',
    VIDEO_CONCURRENCY: '1',
    IMAGE_CONCURRENCY: '1',
    EXPORT_CONCURRENCY: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

const waitFor = async (predicate, message) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    if (child.exitCode !== null) throw new Error(`${message}; worker exited early with ${child.exitCode}\n${output.slice(-4000)}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${message}\n${output.slice(-4000)}`)
}

await waitFor(() => output.includes('Background worker process is consuming'), 'worker did not start')
child.kill('SIGTERM')
await waitFor(() => child.exitCode !== null, 'worker did not exit after SIGTERM')

assert.equal(child.exitCode, 0, output.slice(-4000))
assert.match(output, /SIGTERM received: stopping background workers/)
assert.match(output, /队列已关闭/)
console.log('PASS worker SIGTERM pauses/closes queues and exits cleanly')
