#!/usr/bin/env node
/**
 * Assert the canonical Compose file isolates API consumers from media workers.
 * Reads `docker compose config --format json` (or a saved JSON file).
 */
import { readFileSync } from 'node:fs'

const source = process.argv[2]
if (!source) {
  console.error('usage: assert-compose-worker-topology.mjs <compose-config.json>')
  process.exit(2)
}

const config = JSON.parse(readFileSync(source, 'utf8'))
const services = config.services || {}
const fail = (message) => {
  console.error(`compose worker topology: ${message}`)
  process.exit(1)
}

const envOf = (service) => {
  const raw = service?.environment
  if (!raw) return {}
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map((entry) => {
      const separator = String(entry).indexOf('=')
      if (separator < 0) return [String(entry), '']
      return [entry.slice(0, separator), entry.slice(separator + 1)]
    }))
  }
  return raw
}

const commandOf = (service) => {
  const command = service?.command
  if (Array.isArray(command)) return command.join(' ')
  return String(command || '')
}

if (!services.backend) fail('backend service is missing')
if (!services.worker) fail('worker service is missing')

const backendEnv = envOf(services.backend)
const workerEnv = envOf(services.worker)

if (!Object.prototype.hasOwnProperty.call(backendEnv, 'BACKGROUND_WORKERS_ENABLED')) {
  fail('backend is missing BACKGROUND_WORKERS_ENABLED')
}
if (backendEnv.BACKGROUND_WORKERS_ENABLED !== 'false') {
  fail(`backend BACKGROUND_WORKERS_ENABLED must default to false, got ${JSON.stringify(backendEnv.BACKGROUND_WORKERS_ENABLED)}`)
}
if (workerEnv.BACKGROUND_WORKERS_ENABLED !== 'true') {
  fail(`worker BACKGROUND_WORKERS_ENABLED must be true, got ${JSON.stringify(workerEnv.BACKGROUND_WORKERS_ENABLED)}`)
}
if (workerEnv.PRISMA_CONNECTION_POOL_SIZE !== '4') {
  fail(`worker PRISMA_CONNECTION_POOL_SIZE must default to 4, got ${JSON.stringify(workerEnv.PRISMA_CONNECTION_POOL_SIZE)}`)
}
if (!commandOf(services.worker).includes('dist/workers/main.js')) {
  fail(`worker command must run dist/workers/main.js, got ${JSON.stringify(services.worker.command)}`)
}
if (commandOf(services.backend).includes('dist/workers/main.js')) {
  fail('backend must not use the worker entrypoint')
}

console.log('compose worker topology: ok')
