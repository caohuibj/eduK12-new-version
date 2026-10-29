import {describe,it,expect} from 'vitest'
import {projectThreeLayerReport} from '../../modules/cognitive/v2/report'
import {spatialMemoryDefinition as d} from '../../modules/cognitive/content-candidates/precision-working-memory/package'
import {createSpatialMemoryPresentation} from '../../modules/cognitive/content-candidates/precision-working-memory/participant-presentation'
const key='set1MeanAbsoluteErrorDeg'
function render(value:unknown,presentation=createSpatialMemoryPresentation(),state:'interpretable'|'limited'|'invalid'='interpretable'){
 const metrics={[key]:value,reportBinding:{never:'public'}},flags={noValidRecords:state==='invalid'}
 return projectThreeLayerReport({testType:d.testType,configVersion:'0.1.0',engineVersion:d.engineVersion,scoringVersion:d.scoringVersion,protocolSignature:'quantity-test',profile:'experience',participantPresentation:presentation,
  definition:{...d.report,headlineMetrics:[key],userMetrics:[],detailMetrics:[]},metricDefinitions:d.metrics,qualityDefinitions:d.quality,metrics,score:{metrics,quality:{state,flags,reasons:[]},audit:{trialCount:1,scorerVersion:d.scoringVersion}}})
}
describe('frozen natural-unit quantity presentation',()=>{
 it('formats only the opted-in angular wrapper, preserves zero/null, and leaves old frozen formatting unchanged',()=>{
  expect(render({value:12.345,unit:'deg'}).headline[0].formatted).toBe('12.35°')
  expect(render({value:0,unit:'deg'}).headline[0].formatted).toBe('0°')
  expect(render(null).headline[0].formatted).toBe('—')
  const old=createSpatialMemoryPresentation();delete old.metricFormats;old.presentationVersion='0.1.0'
  expect(render({value:12,unit:'deg'},old).headline[0].formatted).toContain('value-back')
  expect(render({value:2,unit:'ms'}).headline[0].formatted).toBe('—')
  expect(render({value:2,unit:'deg',hidden:123}).headline[0].formatted).toBe('—')
  expect(render({value:2,unit:'deg'},undefined,'invalid').headline).toEqual([])
 })
})
