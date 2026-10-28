import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { evaluateScaleProductReadiness } from '../src/modules/scale/library/product-readiness'
import { projectScalePackage } from '../src/modules/scale/onboarding/define-instrument'
import { listScaleInstrumentSources, listScaleInstrumentSourceDiagnostics } from '../src/modules/scale/onboarding/instrument-registry'
import { evaluateScaleSourceScientificQualification } from '../src/modules/scale/library/scientific-qualification'
import { qualificationAllowsScientificMaturity } from '../src/modules/assessment-governance/scientific-qualification'

const main = async () => {
  const manifest = JSON.parse(readFileSync(resolve('scripts/scale-onboarding-boundaries.json'), 'utf8'))
  for (const diagnostic of listScaleInstrumentSourceDiagnostics()) {
    if (diagnostic.releaseStatus === 'PUBLISHED') throw new Error(`PUBLISHED_SOURCE_SCHEMA_INVALID:${JSON.stringify(diagnostic)}`)
    console.warn(`CANDIDATE_SOURCE_SCHEMA_INVALID:${JSON.stringify(diagnostic)}`)
  }
  for (const source of listScaleInstrumentSources()) {
    if (!source.executable) continue
    if (source.executable.releaseStatus === 'PUBLISHED' && !evaluateScaleProductReadiness(projectScalePackage(source)!).ready) throw new Error(`PRODUCT_NOT_READY:${source.identity.instrumentKey}`)
    const decision = evaluateScaleSourceScientificQualification(source)
    if (!qualificationAllowsScientificMaturity(source.catalog.scientificMaturity, decision)) {
      console.warn(`MANUAL_SCIENTIFIC_REVIEW:${source.identity.instrumentKey}:${JSON.stringify(decision)}`)
    }
    for (const plugin of source.executable.scorerPlugins ?? []) {
      const pin = manifest.immutableScorers.find((row: { key: string; version: string }) => row.key === plugin.key && row.version === plugin.version)
      if (!pin) throw new Error(`SCORER_PIN_MISSING:${plugin.key}@${plugin.version}`)
      const module = await import(pathToFileURL(resolve(pin.path)).href)
      if (module[pin.exportName] !== plugin.scorer) throw new Error(`SCORER_IMPLEMENTATION_MISMATCH:${plugin.key}@${plugin.version}`)
    }
  }
  console.log('Scale product structure and scorer registrations verified; scientific diagnostics are manual')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
