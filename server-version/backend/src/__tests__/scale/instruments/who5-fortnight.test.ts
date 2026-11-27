import {describe, expect, it} from 'vitest'
import {validateScaleInstrumentSource} from '../../../modules/scale/onboarding/validate-instrument'
import {buildScaleResult} from '../../../modules/scale/scale-result'
import {renderDeclaredReport} from '../../../modules/measurement-content/report-renderer'
import {composeTriplet, sourceParts, type Axis, type Part} from '../../../modules/survey/standard-triplet.model'
import {SCALE_INSTRUMENT_SOURCE as source} from '../../../modules/scale/instruments/who5/1.0.1/instrument'
import {SCALE_INSTRUMENT_SOURCE as original} from '../../../modules/scale/instruments/who5/1.0.0/instrument'

const exec = source.executable!
const parts = Object.fromEntries(sourceParts('who5','1.0.1').map(part => [part.axis,part])) as Record<Axis,Part>
const combination = composeTriplet('who5', parts)
const responses = exec.definition.responseSets[0].options
const answersFor = (values: number[]) => values.map((n,i) => ({
  itemCode: exec.definition.items[i].itemCode,
  responseValue: responses.find(option => option.score === n)!.value,
}))
const project = (values:number[]) => buildScaleResult({
  scaleId:'who5', name:'WHO-5', instrumentKey:'who5', instrumentVersion:'1.0.1',
  definition:combination.definition, referenceSets:combination.references, answers:answersFor(values),
})

describe('WHO-5 two-week report', () => {
  it('keeps the original items, options, legacy report and non-commercial scope', () => {
    const validation = validateScaleInstrumentSource(source, {requireInstruction:true})
    expect(validation.issues.filter(issue => issue.severity === 'error')).toEqual([])
    expect(exec.definition.items).toEqual(original.executable.definition.items)
    expect(exec.definition.responseSets).toEqual(original.executable.definition.responseSets)
    expect(original.executable.definition.report.reportVersion).toBe('1.0.0')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL'])
    expect(combination.blockers).toEqual([])
  })
  it('selects one authorized report paragraph for every attainable total including 12 and 13', () => {
    for(let total=0;total<=25;total++) {
      const scores = Array.from({length:5},(_,i) => Math.max(0,Math.min(5,total-i*5)))
      const result = project(scores)
      const band = total < 13 ? 'who5_under_13' : 'who5_from_13'
      expect(result.scores.map(s=>s.value)).toEqual([total,4*total])
      expect(result.references.map(r=>r.criterionBand?.key)).toEqual([band])
      const rendered = renderDeclaredReport(combination.template!, result.scores.map(s=>({
        metricKey:s.key,value:s.value,unit:'points',status:'INTERPRETABLE',
      })), result.references.map(r=>({metricKey:r.scoreKey,referenceKind:r.referenceKind,
        status:r.status==='available'?'AVAILABLE':'UNAVAILABLE',bandKey:r.criterionBand?.key??null})))
      expect(rendered.illustrationKey).toBe('who5-fortnight-v1')
      const matched=rendered.blocks.filter((b:any)=>b.type==='REFERENCE_BAND')
      expect(matched).toHaveLength(1)
      expect(matched[0]).toMatchObject({bandKey:band, referenceKind:'criterion_threshold'})
    }
    expect(project([3,3,2,2,2]).interpretations).toEqual(project([5,4,3,0,0]).interpretations)
    const missing=project([4,4,4,4])
    expect(missing.scores.map(s=>s.value)).toEqual([null,null])
    expect(missing.references).toEqual([])
  })
})
