import { cognitiveSeeds } from '../../cognitive/generated/seeds'
import { getExecutableScalePackage } from '../../scale/onboarding/executable-registry'
import { getSituationPackage } from '../../situational/situation-package.registry'
import { getCognitiveRegistryEntry, hasCognitiveProfile } from '../../cognitive/cognitive.registry'
import { parseBundleContextDefinition } from '../context'
import { parseDeclarativePackage } from './contract'
export function dependencyBlockers(raw: unknown): string[] {
  const p=parseDeclarativePackage(raw), errors:string[]=[]
  for(const slot of p.manifest.definition.slots) {
    const mappings=p.evidence.filter(e=>e.slotKey===slot.slotKey)
    if(slot.unitType==='SCALE') {
      const pkg=getExecutableScalePackage(slot.instrumentKey,slot.instrumentVersion)
      if(!pkg) { errors.push(`${slot.slotKey}: unknown SCALE identity`);continue }
      for(const e of mappings) if(!pkg.definition.scoring.scores.some(s=>s.key===e.selector)||e.valueType!=='number'||e.unit!=='points') errors.push(`${e.evidenceKey}: SCALE selector/type/unit mismatch (points required)`)
    } else if(slot.unitType==='SITUATIONAL') {
      const pkg=getSituationPackage(slot.instrumentKey,slot.instrumentVersion)
      if(!pkg) { errors.push(`${slot.slotKey}: unknown SITUATIONAL identity`);continue }
      for(const e of mappings) if(!pkg.definition.scoring.publishedMetrics.some(m=>m.key===e.selector)||e.valueType!=='number'||e.unit!=='points') errors.push(`${e.evidenceKey}: SITUATIONAL selector/type/unit mismatch (points required)`)
    } else if(slot.unitType==='COGNITIVE') {
      const dep=p.manifest.cognitiveDependencies.find(d=>d.slotKey===slot.slotKey)!
      if (!cognitiveSeeds.some(s => s.testType === slot.instrumentKey && s.configVersion === dep.configVersion && s.engineVersion === dep.engineVersion && s.scoringVersion === dep.scoringVersion)) errors.push(`${slot.slotKey}: unknown COGNITIVE config identity`)
      const entry=getCognitiveRegistryEntry(slot.instrumentKey,dep.engineVersion,dep.scoringVersion)
      if(!entry||!hasCognitiveProfile(entry,dep.profile)) {errors.push(`${slot.slotKey}: unknown COGNITIVE identity/profile`);continue}
      for(const e of mappings) {const metric=entry.metricDefinitions[e.selector];if(!metric||metric.valueType!==e.valueType||metric.unit!==e.unit)errors.push(`${e.evidenceKey}: COGNITIVE selector/type/unit mismatch`)}
    } else {
      const context=p.context?parseBundleContextDefinition(p.context):null
      if(!context||slot.instrumentKey!==context.contextDefinitionKey||slot.instrumentVersion!==context.contextDefinitionVersion)errors.push(`${slot.slotKey}: FORM context mismatch`)
      for(const e of mappings){const field=context?.fields.find(f=>f.contextKey===e.selector);if(!field||(field.valueType==='enum'?'string':field.valueType)!==e.valueType||e.unit!=='context')errors.push(`${e.evidenceKey}: context type/unit mismatch`)}
    }
  }
  return errors.sort()
}
