import {describe,it,expect} from 'vitest'
import {frozenReportTemplateSchema,reportTemplateSchema} from '../../modules/measurement-content/report-template'
import {renderDeclaredReport} from '../../modules/measurement-content/report-renderer'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
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
  it('enforces independent visibility on both forms of artwork and all report blocks',()=>{
    const illustrated={...template,illustrationKey:'legacy-image',artworkKey:'example/1.0.0/illustrations',
      blocks:[...template.blocks,
        {type:'TEXT' as const,text:'educational'},
        {type:'CHART' as const,style:'BAR' as const,metricKeys:['total']},
        {type:'ASSET' as const,assetId:'public-image',alt:'image'}]}
    const rule={...DISCLOSURE_PRESETS.EDUCATIONAL_ONLY(),artwork:false}
    const rendered=renderDeclaredReport(illustrated,[fact],[reference],rule)
    expect(rendered).not.toHaveProperty('artworkKey')
    expect(rendered).not.toHaveProperty('illustrationKey')
    expect(rendered.blocks).toEqual([{type:'TEXT',text:'educational'}])
    const artworkOnly=renderDeclaredReport(illustrated,[fact],[reference],{...DISCLOSURE_PRESETS.NONE(),artwork:true})
    expect(artworkOnly).toMatchObject({artworkKey:illustrated.artworkKey,illustrationKey:illustrated.illustrationKey,
      blocks:[{type:'ASSET',assetId:'public-image',alt:'image'}]})
  })
  it('uses a frozen shared theoretical table only when the exact population context is missing',()=>{
    const shared=frozenReportTemplateSchema.parse({blocks:[
      {type:'REFERENCE_BAND',metricKey:'total',referenceKind:'theoretical_range',bandKey:'lower',text:'first'},
      {type:'REFERENCE_BAND',metricKey:'total',referenceKind:'theoretical_range',bandKey:'upper',text:'second'},
    ],standardScoreBands:{metricKey:'total',ranges:[{key:'lower',lower:1,upper:3},{key:'upper',lower:3,upper:5}]}})
    const unavailable={metricKey:'total',referenceKind:'theoretical_range' as const,status:'UNAVAILABLE' as const,bandKey:null}
    expect(renderDeclaredReport(shared,[fact],[{...unavailable,reason:'MISSING_CONTEXT'}]).blocks).toEqual([expect.objectContaining({text:'first'})])
    expect(renderDeclaredReport(shared,[fact],[{...unavailable,reason:'REVOKED'}]).blocks).toEqual([])
    expect(renderDeclaredReport(shared,[fact],[{...unavailable,reason:'MISSING_CONTEXT'}],DISCLOSURE_PRESETS.SCORES()).blocks).toEqual([])
  })
})
