/** Offline conversion only. Run with tsx from server-version/backend; no DB or network access. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildMatrixResponseInterchange } from '../modules/cognitive/banks/research-matrix-interchange'
import type { ResearchTrialDataset } from '../modules/cognitive/research-trial-dataset'

const args = process.argv.slice(2)
const arg = (name: string): string | undefined => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const main = () => {
  const allowed = new Set(['--input', '--out', '--config-version', '--matrix-type', '--sample-description', '--timeout-policy'])
  if (args.some((a) => a.startsWith('--') && !allowed.has(a))) throw Error('Unknown option')
  const input = arg('--input')
  const out = arg('--out')
  const configVersion = arg('--config-version')
  const matrixType = arg('--matrix-type')
  const sampleDescription = arg('--sample-description')
  const timeoutPolicy = arg('--timeout-policy') ?? 'missing'
  if (!input || !out || !configVersion || !sampleDescription ||
      (matrixType !== '2x2' && matrixType !== '3x3') ||
      (timeoutPolicy !== 'missing' && timeoutPolicy !== 'incorrect')) {
    throw Error('Required: --input dataset.json --out matrix.json --config-version VERSION --matrix-type 2x2|3x3 --sample-description TEXT [--timeout-policy missing|incorrect]')
  }
  if (existsSync(out)) throw Error('Refusing to overwrite frozen response-matrix output')
  const data = JSON.parse(readFileSync(input, 'utf8')) as ResearchTrialDataset
  const result = buildMatrixResponseInterchange(data, {
    configVersion, matrixType, sampleDescription, timeoutPolicy,
  })
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ out, persons: result.personIds.length, items: result.itemIds.length, exclusions: result.exclusions }))
}
main()
