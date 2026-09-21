import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/modules/situational/instruments')
const [identity, flag, from] = process.argv.slice(2)
const parse = value => {
  const match = value?.match(/^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/)
  if (!match) throw new Error('Expected instrument-key@1.0.0')
  return { instrumentKey: match[1], instrumentVersion: match[2] }
}
if (flag !== '--from') throw new Error('Usage: situational:scaffold -- new-key@1.0.0 --from existing-key@1.0.0')
const target = parse(identity), source = parse(from)
const dir = path.join(root, target.instrumentKey, target.instrumentVersion)
if (fs.existsSync(dir)) throw new Error('Refusing to overwrite an existing identity')
const content = JSON.parse(fs.readFileSync(path.join(root, source.instrumentKey, source.instrumentVersion, 'instrument.json'), 'utf8'))
content.identity = target; content.catalogOrder = 1000
fs.mkdirSync(dir, { recursive: true })
for (const [name, value] of Object.entries({ instrument: content, publication: { releaseStatus: 'DRAFT' }, scientific: { schemaVersion: 1, scientificMaturity: 'PILOT', governanceRevision: 1 } })) fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(value, null, 2) + '\n')
console.log('Created DRAFT/PILOT content copy. Edit definition and goldens, regenerate manifest, then run onboarding-check. No approval or publication was copied.')
