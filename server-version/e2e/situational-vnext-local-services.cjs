// Synthetic-only local acceptance helper. Never run against a developer/production database.
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const root = path.resolve(__dirname, '..')
const dbUrl = process.env.SITUATIONAL_VNEXT_DATABASE_URL
if (!dbUrl || !/^postgresql:\/\/situational_test:.*@127\.0\.0\.1:55473\/situational_vnext/.test(dbUrl)) throw new Error('Dedicated VNext synthetic database required')
const logDir = process.env.SITUATIONAL_VNEXT_EVIDENCE_DIR || '/tmp/eduk12-situational-vnext-evidence'
fs.mkdirSync(logDir, { recursive: true })
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: dbUrl, REDIS_URL: 'redis://127.0.0.1:55474', PORT: '31473', CORS_ORIGIN: 'http://127.0.0.1:51473', COOKIE_SECURE: 'false', TRUST_PROXY_HOPS: '0', BACKGROUND_WORKERS_ENABLED: 'false', SOCKET_REDIS_REQUIRED: 'true', COGNITIVE_MODULE_ENABLED: 'true', SITUATIONAL_VNEXT_E2E_FIXTURE: 'true', UPLOAD_DIR: path.join(logDir, 'uploads'), LOG_LEVEL: 'warn' }
const keysFile = path.join(logDir, 'synthetic-service-keys.json')
const keys = fs.existsSync(keysFile) ? JSON.parse(fs.readFileSync(keysFile, 'utf8')) : Object.fromEntries(['JWT_SECRET', 'DATA_ENCRYPTION_KEY', 'DATA_PSEUDONYM_KEY', 'ASSET_SIGNING_SECRET'].map(key => [key, randomBytes(32).toString('hex')]))
fs.writeFileSync(keysFile, JSON.stringify(keys), { mode: 0o600 })
Object.assign(env, keys)
// No SITUATIONAL_RESEARCH_EXPORT_GRANTS: HTTP authorization must deny by default.
delete env.SITUATIONAL_RESEARCH_EXPORT_GRANTS
const backendLog = fs.openSync(path.join(logDir, 'backend.log'), 'w'), frontendLog = fs.openSync(path.join(logDir, 'frontend.log'), 'w')
const backend = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/index.ts'], { cwd: path.join(root, 'backend'), env, stdio: ['ignore', backendLog, backendLog] })
const frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '51473', '--strictPort'], { cwd: path.join(root, 'frontend'), env: { ...process.env, E2E_BACKEND_URL: 'http://127.0.0.1:31473', VITE_COGNITIVE_MODULE_ENABLED: 'true' }, stdio: ['ignore', frontendLog, frontendLog] })
let closing = false
const stop = () => { if (closing) return; closing = true; backend.kill('SIGTERM'); frontend.kill('SIGTERM') }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
backend.on('exit', code => { console.log(`Synthetic backend exited: ${code}`); stop() })
frontend.on('exit', code => { console.log(`Synthetic frontend exited: ${code}`); stop() })
console.log(`Synthetic acceptance services: API 31473, browser 51473; evidence ${logDir}`)
