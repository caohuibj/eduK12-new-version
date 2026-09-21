import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listScaleInstrumentSources } from '../src/modules/scale/onboarding/instrument-registry'
import { evaluateScaleSourceScientificQualification } from '../src/modules/scale/library/scientific-qualification'
import { qualificationAllowsScientificMaturity } from '../src/modules/assessment-governance/scientific-qualification'

const main = async () => {
  const manifest = JSON.parse(readFileSync(resolve('scripts/scale-onboarding-boundaries.json'), 'utf8'))
  for (const source of listScaleInstrumentSources()) {
    if (!source.executable) continue
    const decision = evaluateScaleSourceScientificQualification(source)
    if (!qualificationAllowsScientificMaturity(source.catalog.scientificMaturity, decision)) {
      throw new Error(`SCIENTIFIC_CLAIM_NOT_QUALIFIED:${source.identity.instrumentKey}:${JSON.stringify(decision)}`)
    }
    for (const plugin of source.executable.scorerPlugins ?? []) {
      const pin = manifest.immutableScorers.find((row: { key: string; version: string }) => row.key === plugin.key && row.version === plugin.version)
      if (!pin) throw new Error(`SCORER_PIN_MISSING:${plugin.key}@${plugin.version}`)
      const module = await import(pathToFileURL(resolve(pin.path)).href)
      if (module[pin.exportName] !== plugin.scorer) throw new Error(`SCORER_IMPLEMENTATION_MISMATCH:${plugin.key}@${plugin.version}`)
    }
  }
  console.log('Scale source qualification and scorer registrations verified')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
