import { canonicalHash } from '../../assessment-runtime/canonical'
import { calculateScoreRanges } from '../../scale/scale-scoring'
import { hashScaleDefinition } from '../../scale/scale-definition'
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
  if(p.schemaVersion===2)for(const b of p.profile.bindings){
    const e=p.evidence.find(e=>e.evidenceKey===b.evidenceKey)!,pkg=getExecutableScalePackage(b.source.instrumentKey,b.source.instrumentVersion)
    const d=pkg?.definition,score=d?.scoring.scores.find(s=>s.key===e.selector)
    const range=d?calculateScoreRanges(d).get(e.selector):undefined
    if(!d || canonicalHash(d)!==b.source.runtimeDefinitionHash || range?.min!==b.transformation.min || range?.max!==b.transformation.max || hashScaleDefinition(d)!==b.source.measurementHash || d.scoring.scoringVersion!==b.source.scoringVersion ||
      d.versionAxes?.localizationVersion!==b.source.localizationVersion || d.versionAxes?.subjectKey!==(b.source.subjectKey??p.profile.applicability.domain) ||
      d.scoring.scorerKey || score?.source.type!=='items' || score.source.items.length!==b.source.expectedItems || score.source.aggregation!=='mean')
      errors.push(b.evidenceKey+': PROFILE frozen measurement/scoring/locale/item identity mismatch')
  }
  if(p.schemaVersion===3){
    const scaleScore=(key:string)=>{
      const e=p.evidence.find(e=>e.evidenceKey===key),slot=p.manifest.definition.slots.find(s=>s.slotKey===e?.slotKey)
      if(!e||slot?.unitType!=='SCALE')return null
      const pkg=getExecutableScalePackage(slot.instrumentKey,slot.instrumentVersion)
      return pkg?{score:pkg.definition.scoring.scores.find(s=>s.key===e.selector),range:calculateScoreRanges(pkg.definition).get(e.selector)}:null
    }
    for(const d of p.rules.derivations){
      if(d.op==='RANGE_POSITION'){
        const source=scaleScore(d.input)
        if(source&&(source.range?.min!==d.min||source.range?.max!==d.max))errors.push(d.key+': theoretical range differs from the exact source metric')
      }
      if(d.op==='EXACT_MAX_SET'){
        const metrics=d.inputs.map(scaleScore)
        if(metrics.some(m=>!m||m.score?.source.type!=='items'||m.score.source.aggregation!=='mean')||metrics.some(m=>m?.range?.min!==metrics[0]?.range?.min||m?.range?.max!==metrics[0]?.range?.max))errors.push(d.key+': maximum set requires same-range means from one exact SCALE source')
      }
    }
    for(const row of p.report.rows)if(row.range){
      if(row.valueRef.kind==='evidence'){
        const source=scaleScore(row.valueRef.key)
        if(source&&(source.range?.min!==row.range.min||source.range?.max!==row.range.max))errors.push(row.rowKey+': display range differs from the exact source metric')
      }else if(p.rules.derivations.find(d=>d.key===row.valueRef.key)?.op==='RANGE_POSITION'&&(row.range.min!==0||row.range.max!==1))errors.push(row.rowKey+': range-position display must retain 0..1')
    }
  }
  return errors.sort()
}
