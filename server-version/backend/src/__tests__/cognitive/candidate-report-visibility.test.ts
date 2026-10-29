import {describe,expect,it} from 'vitest'
import {validateTaskDefinition} from '../../modules/cognitive/v2/publication-gate'
import {compileCognitiveRuntime} from '../../modules/assessment-runtime/compiler'
import {blinkDefinition} from '../../modules/cognitive/content-candidates/attentional-blink/package'
import {balloonEffortDefinition} from '../../modules/cognitive/content-candidates/balloon-effort/package'
import {dualDefinition} from '../../modules/cognitive/content-candidates/dual-arrow/package'
import {gradDefinition} from '../../modules/cognitive/content-candidates/gradcpt/package'
import {horizonDefinition} from '../../modules/cognitive/content-candidates/horizon-exploration/package'
import {searchDefinition} from '../../modules/cognitive/content-candidates/visual-search/package'

// Descriptor corrections only: existing approved report fields, not raw
// research maps, become available to the generic report contract. No scoring,
// stimulus, sequence, timing, quality or authorization behavior changes here.
const candidates=[blinkDefinition,balloonEffortDefinition,dualDefinition,gradDefinition,horizonDefinition,searchDefinition]
describe('existing candidate report visibility matches declared public tiers',()=>{
 it.each(candidates.map(definition=>({name:definition.testType,definition})))('$name',({definition})=>{
  expect(validateTaskDefinition(definition as any).filter(issue=>issue.severity==='error')).toEqual([])
  expect(compileCognitiveRuntime({definition:definition as any}).runtimeCapabilities.supported).toBe(true)
  for(const [field,tier] of [['headlineMetrics','headline'],['userMetrics','user'],['detailMetrics','detail']] as const){
   for(const key of definition.report[field])expect(definition.metrics[key].visibility).toBe(tier)
  }
  expect(definition.metrics.reportBinding.visibility).toBe('research_only')
  expect(definition.metrics.reportBinding.export?.summary).toBe(false)
  for(const metric of Object.values(definition.metrics)){
   if(['object','array'].includes(metric.valueType))expect(metric.visibility).toBe('research_only')
  }
  expect(definition.publication.status).toBe('DRAFT')
  expect(definition.references).toEqual([])
 })
})
