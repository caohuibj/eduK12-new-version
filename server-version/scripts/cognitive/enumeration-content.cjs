const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '../../..')
const source = path.join(root, 'server-version/backend/src/modules/cognitive/content-candidates/enumeration/protocol.ts')
const target = path.join(root, 'server-version/frontend/src/modules/cognitive/tasks/enumeration/generated/protocol.ts')
const text = fs.readFileSync(source, 'utf8')
const hash = crypto.createHash('sha256').update(text).digest('hex')
const output = '// Generated from frozen pure enumeration protocol. Source SHA256: ' + hash + '\n' + text
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) throw Error('Enumeration protocol projection drift')
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, output)
}
const reportSource = path.join(root, 'server-version/backend/src/modules/cognitive/content-candidates/enumeration/report.ts')
const reportText = fs.readFileSync(reportSource, 'utf8')
if (!reportText.includes('export function projectEnumerationReport(')) throw Error('Missing enumeration report projection')
const reportHash = crypto.createHash('sha256').update(reportText).digest('hex')
// Report module is browser-pure and imports only the sibling generated pure protocol.
const reportOutput = '// Generated report projection. Source SHA256: ' + reportHash + '\n' + reportText
const reportTarget = path.join(path.dirname(target), 'report.ts')
if (process.argv.includes('--check')) {
  if (!fs.existsSync(reportTarget) || fs.readFileSync(reportTarget,'utf8') !== reportOutput) throw Error('Enumeration report projection drift')
} else fs.writeFileSync(reportTarget, reportOutput)
console.log('Enumeration pure protocol projection: ' + hash + '; report: ' + reportHash)
