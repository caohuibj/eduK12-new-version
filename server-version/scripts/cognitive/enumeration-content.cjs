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
const reportSource = path.join(root, 'server-version/backend/src/modules/cognitive/content-candidates/enumeration/scorer.ts')
const reportText = fs.readFileSync(reportSource, 'utf8')
const marker = 'export function projectEnumerationReport('
if (reportText.indexOf(marker) < 0) throw Error('Missing closed enumeration report projection')
const projection = reportText.slice(reportText.indexOf(marker)).replace("Pick<CognitiveScoreResult, 'metrics' | 'quality'>", 'EnumerationPublicResult')
if (projection.includes('CognitiveScoreResult')) throw Error('Unexpected report dependency')
const reportHash = crypto.createHash('sha256').update(reportText).digest('hex')
const reportOutput = '// Generated closed projection from scorer SHA256: ' + reportHash + '\n'
  + "export interface EnumerationPublicResult { metrics: Record<string, unknown>; quality: { state: 'interpretable'|'limited'|'invalid'; flags: Record<string,boolean>; reasons:string[] } }\n" + projection
const reportTarget = path.join(path.dirname(target), 'report.ts')
if (process.argv.includes('--check')) {
  if (!fs.existsSync(reportTarget) || fs.readFileSync(reportTarget,'utf8') !== reportOutput) throw Error('Enumeration report projection drift')
} else fs.writeFileSync(reportTarget, reportOutput)
console.log('Enumeration pure protocol projection: ' + hash + '; closed report: ' + reportHash)
