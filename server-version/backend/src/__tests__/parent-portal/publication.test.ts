import {describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {buildParentProjection,createParentTemplateRegistry,type ParentTemplate} from '../../modules/parent-portal/templates'
import {verifyParentPublication} from '../../modules/parent-portal/publication'
const ref={family:'BUNDLE' as const,key:'test-bundle',version:'1.0.0'}
const education:ParentTemplate={key:'family-test',version:'1.0.0',status:'PUBLISHED',title:'家长教育反馈',mode:'EDUCATIONAL_SUMMARY',toolRef:ref,metrics:[{metricId:'score',sourceMetricKey:'score',label:'服务器指标',aggregation:'MEAN',longitudinal:true}],disclaimer:'教育反馈，不包含原始作答。'}
const protectedRecord=(metric:any={state:'present',aggregations:{mean:2}}):any=>({id:'artifact',organizationId:'org',analysisKind:'PROTECTED_FEEDBACK',snapshotHash:'a'.repeat(64),artifactPayload:{fixedPopulationDisclosure:{complete:true},projection:{state:'present',metrics:{score:metric}}}})
describe('Independent PARENT publication content and integrity',()=>{
 it('registers completion only by default and never manufactures educational content',()=>{
  const registry=createParentTemplateRegistry()
  const template=registry.resolve('parent-report-availability','1.0.0',ref)
  expect(buildParentProjection(protectedRecord(),'student',template)).toMatchObject({summary:'',blocks:[],disclosedMetricKeys:[],policy:{mode:'COMPLETION_ONLY',rawAnswers:false,itemLevel:false,researchExport:false}})
  expect(()=>registry.resolve('family-test','1.0.0',ref)).toThrow()
 })
 it('requires an exact reviewed template and prevents mutation of registered content',()=>{
  const input=structuredClone(education),registry=createParentTemplateRegistry([input]);input.title='modified'
  const resolved=registry.resolve(input.key,input.version,ref);expect(resolved.title).toBe(education.title)
  resolved.metrics[0].label='tampered';expect(registry.resolve(input.key,input.version,ref).metrics[0].label).toBe('服务器指标')
  expect(()=>registry.resolve(input.key,input.version,{...ref,version:'2.0.0'})).toThrow()
  for(const value of [{...education,status:'DRAFT'},{...education,metrics:[]},{...education,disclaimer:''},{...education,metrics:[{...education.metrics[0],aggregation:'ANY'}]},{...education,metrics:[education.metrics[0],education.metrics[0]]}])expect(()=>createParentTemplateRegistry([value as any])).toThrow()
 })
 it('requires fixed population proof and omits suppressed values, identities and counts',()=>{
  const record=protectedRecord();record.artifactPayload.projection.respondentIds=['secret'];record.artifactPayload.projection.respondentN=12
  const projection=buildParentProjection(record,'student',education)
  expect(projection.blocks[0]).toEqual({title:'服务器指标',text:'2'});expect(JSON.stringify(projection)).not.toContain('respondent')
  expect(buildParentProjection(protectedRecord({state:'suppressed',aggregations:{mean:99}}),'student',education).disclosedMetricKeys).toEqual([])
  delete record.artifactPayload.fixedPopulationDisclosure;expect(()=>buildParentProjection(record,'student',education)).toThrow()
 })
 it('renders missing waves and only server-authorized deltas, without calculating change',()=>{
  const record:any={...protectedRecord(),analysisKind:'INDIVIDUAL_LONGITUDINAL',artifactPayload:{projection:{waves:[{waveId:'w1',ordinal:1,metrics:{score:{state:'present',value:1}}},{waveId:'w2',ordinal:2,metrics:{score:{state:'missing'}}},{waveId:'w3',ordinal:3,metrics:{score:{state:'present',value:8}}}],comparisons:[{fromWaveId:'w1',toWaveId:'w2',metrics:{score:{comparability:{allowedOperations:[]},delta:999}}},{fromWaveId:'w1',toWaveId:'w3',metrics:{score:{comparability:{allowedOperations:['NUMERIC_DELTA']},delta:6}}}]}}}
  const text=buildParentProjection(record,'student',education).blocks[0].text
  expect(text).toContain('第 2 次：未提供可披露值');expect(text).toContain('变化值 6');expect(text).not.toContain('999');expect(text).not.toContain('变化值 7')
  expect(()=>buildParentProjection(record,'student',{...education,metrics:[{...education.metrics[0],longitudinal:false}]})).toThrow()
 })
 it('binds publication, source, subject, organization, projection, policy and template',()=>{
  const projection=buildParentProjection(protectedRecord(),'student',education),source={artifactId:'artifact',sourceHash:'a'.repeat(64),subjectUserId:'student',organizationId:'org'}
  const payload={schemaVersion:1,audience:'PARENT',publicationId:'publication',...source,template:education,projection}
  const row={id:'publication',...source,projection,projectionHash:canonicalHash(projection),payload,publicationHash:canonicalHash(payload),templateHash:canonicalHash(education),revokedAt:null}
  expect(verifyParentPublication(row,source)).toEqual(projection)
  for(const patch of [{id:'other'},{sourceHash:'b'.repeat(64)},{subjectUserId:'other'},{organizationId:'other'},{publicationHash:'b'.repeat(64)},{templateHash:'b'.repeat(64)},{revokedAt:new Date()},{projection:{...projection,title:'tampered'}}])expect(()=>verifyParentPublication({...row,...patch},source)).toThrow()
  const wrong={...payload,template:{...education,mode:'COMPLETION_ONLY'}};expect(()=>verifyParentPublication({...row,payload:wrong,publicationHash:canonicalHash(wrong),templateHash:canonicalHash(wrong.template)},source)).toThrow()
 })
})
