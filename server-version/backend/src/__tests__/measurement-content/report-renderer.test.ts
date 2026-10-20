import {describe,it,expect} from 'vitest'
import {reportTemplateSchema} from '../../modules/measurement-content/report-template'
import {renderDeclaredReport} from '../../modules/measurement-content/report-renderer'
const template=reportTemplateSchema.parse({blocks:[{type:'METRIC',metricKey:'total',display:'RAW'},
  {type:'REFERENCE_BAND',metricKey:'total',referenceKind:'normative_distribution',bandKey:'high',text:'norm'},
  {type:'REFERENCE_BAND',metricKey:'total',referenceKind:'criterion_threshold',bandKey:'high',text:'criterion'}]})
const fact={metricKey:'total',value:3,unit:'points',status:'INTERPRETABLE' as const}
const reference={metricKey:'total',referenceKind:'criterion_threshold' as const,bandKey:'high',status:'AVAILABLE' as const}
describe('declarative report rendering',()=>{
  it('selects the frozen reference kind without recalculating thresholds',()=>{
    expect(renderDeclaredReport(template,[fact],[reference]).blocks).toHaveLength(2)
    expect(renderDeclaredReport(template,[fact],[reference]).blocks[1]).toMatchObject({text:'criterion'})
  })
  it('retains raw facts without reference, suppresses uncertain interpretations',()=>{
    expect(renderDeclaredReport(template,[fact],[]).blocks).toEqual([expect.objectContaining({value:3})])
    expect(renderDeclaredReport(template,[fact],[reference,reference]).blocks).toHaveLength(1)
  })
  it('never displays a nonfinite or invalid fact or its interpretation',()=>{
    for(const value of [NaN,Infinity,null])expect(renderDeclaredReport(template,[{...fact,value}],[reference]).blocks).toEqual([expect.objectContaining({value:null,status:'UNAVAILABLE'})])
    expect(renderDeclaredReport(template,[{...fact,status:'INVALID'}],[reference]).blocks).toEqual([expect.objectContaining({value:null,status:'INVALID'})])
  })
  it('rejects duplicate facts instead of silently picking one',()=>{
    expect(()=>renderDeclaredReport(template,[fact,fact],[reference])).toThrow('REPORT_DUPLICATE_METRIC_FACT')
  })
})
