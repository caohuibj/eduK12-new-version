import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildFrequencyReport } from '../descriptive-reports/report-summary.mjs'

const [group, inputPath] = process.argv.slice(2)
if (!group || !inputPath || process.argv.length !== 4) throw new Error('Usage: node report-summary.mjs GROUP SURVEY-ITEM-ANALYSIS.json')

const index = JSON.parse(readFileSync(new URL('./index.json', import.meta.url), 'utf8'))
const entry = index.find(row => row.code === group)
if (!entry) throw new Error('Unknown DMEE group: ' + group)

const form = readFileSync(new URL(entry.formPath, import.meta.url))
if (createHash('sha256').update(form).digest('hex') !== entry.formPayloadSha256) throw new Error('Use the frozen Simplified Chinese DMEE Form in the index')
const { definition } = JSON.parse(form)
const payload = JSON.parse(readFileSync(inputPath, 'utf8'))
const formDefinition = Buffer.from(JSON.stringify(definition, null, 2) + '\n')
process.stdout.write(JSON.stringify(buildFrequencyReport(entry, formDefinition, payload.data ?? payload), null, 2) + '\n')
