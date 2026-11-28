import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { buildEventReport as buildSharedEventReport } from '../../copsoq-iii-events/1.0.0/report-summary.mjs'

/** Select only this S1 Chinese candidate's Form identities before reusing the
 * established COPSOQ frequency/source projection. Existing English entries
 * or other same-code forms cannot supply rows for the Chinese report.
 */
export function buildEventReport(entry, items) {
  const keys = entry.claims.instrumentKeys
  const code = entry.code.toLowerCase()
  const selections = new Map(Object.entries(keys).map(([kind, key]) => [key, 'copsoq3_' + code + '_' + kind]))
  const boundItems = items.filter(item => selections.has(item.instrumentKey))
    .map(item => ({ ...item, instrumentKey: selections.get(item.instrumentKey) }))
  return buildSharedEventReport(entry, boundItems)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [code, file] = process.argv.slice(2)
  if (!code || !file || process.argv.length !== 4) {
    throw new Error('Usage: node report-summary.mjs EVENT_CODE survey-descriptive-summary.json')
  }
  const payload = JSON.parse(readFileSync(file, 'utf8'))
  const data = payload.data ?? payload
  const index = JSON.parse(readFileSync(new URL('./index.json', import.meta.url), 'utf8'))
  const entry = index.find(item => item.code === code.toUpperCase())
  if (!entry || !Array.isArray(data.items)) {
    throw new Error('Choose a recognized Chinese S1 event and an authorized Survey descriptive summary')
  }
  process.stdout.write(JSON.stringify(buildEventReport(entry, data.items), null, 2) + '\n')
}
