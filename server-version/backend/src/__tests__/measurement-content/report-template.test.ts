import { describe,expect,it } from 'vitest'
import { reportTemplateSchema,validateReportTemplateBindings } from '../../modules/measurement-content/report-template'
describe('report content is not a second numeric authority',()=>{
  it('allows prose and exact metric/band references without duplicated rules',()=>{
    const template=reportTemplateSchema.parse({title:'反馈',blocks:[{type:'REFERENCE_BAND',metricKey:'total',bandKey:'middle',text:'描述性解释'},{type:'METRIC',metricKey:'total',display:'RAW'}]})
    expect(()=>validateReportTemplateBindings(template,['total'],[])).not.toThrow()
  })
  it('rejects top-level and nested thresholds, scoring, scripts, and arbitrary numeric expressions',()=>{
    for(const field of ['thresholds','percentileTable','scoring','quality','script','expression']){
      expect(()=>reportTemplateSchema.parse({title:'反馈',[field]:[1,2]})).toThrow()
      expect(()=>reportTemplateSchema.parse({blocks:[{type:'REFERENCE_BAND',metricKey:'total',bandKey:'middle',text:'描述',[field]:[1,2]}]})).toThrow()
    }
    expect(()=>reportTemplateSchema.parse({blocks:[{type:'TEXT',text:'说明',minInclusive:10}]})).toThrow()
  })
  it('requires declared metrics and frozen asset identities',()=>{
    expect(()=>validateReportTemplateBindings(reportTemplateSchema.parse({blocks:[{type:'METRIC',metricKey:'other',display:'RAW'}]}),['total'],[])).toThrow('REPORT_TEMPLATE_METRIC_UNKNOWN')
    expect(()=>validateReportTemplateBindings(reportTemplateSchema.parse({blocks:[{type:'ASSET',assetId:'image',alt:'图示'}]}),[],[])).toThrow('REPORT_TEMPLATE_ASSET_UNKNOWN')
  })
})
