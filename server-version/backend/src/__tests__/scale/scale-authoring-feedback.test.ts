import { buildScaleBundleBridge } from '../../modules/assessment-bundle/sources'
import { createCanonicalUnitResultEnvelope, parseCanonicalUnitResultEnvelope, type CanonicalUnitResultCoreV1 } from '../../modules/assessment-runtime/unit-result'
import { buildQuestionnaireCollectionReportFromUnifiedInput, buildQuestionnaireCollectionReport, collectionReportForStorage } from '../../modules/reporting/questionnaire-collection-report'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import type { ScaleProjectionContext } from '../../modules/scale/projection/types'
import { projectScaleResult } from '../../modules/scale/projection/scale-result.projector'
import { buildScaleUnitReport, projectScaleUnitReport } from '../../modules/reporting/scale-unit-report'
import { createPublicTemplateStore, type PublicTemplateRow } from '../../modules/assessment-runtime/public-templates'
import { prepareCompactScaleFacts, decodeScaleFacts, restoreCompactScaleFacts } from '../../modules/assessment-runtime/compact-scale-facts'
import { describe, expect, it, vi } from 'vitest'
import { createCustomScaleDefinition, hashScaleDefinition, runnerDefinition, validateScaleDefinition, type ScaleDefinitionV2 } from '../../modules/scale/scale-definition'
import { missingRequiredScaleItemCodes, scoreScale, validateScaleAnswers } from '../../modules/scale/scale-scoring'
import { rawScoreFeedbackSchema, matchRawScoreFeedback, type RawScoreFeedback } from '../../modules/scale/raw-score-feedback'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { validateSurveyDraft } from '../../modules/survey/builder.definition'
import { buildScaleResult } from '../../modules/scale/scale-result'

const config = (): RawScoreFeedback => ({ schemaVersion: 1, rules: [{ scoreKey: 'total', ranges: [
  { key: 'low', min: 1, max: 3, includeMax: false, text: '较少' },
  { key: 'high', min: 3, max: 5, includeMax: true, text: '较多' },
] }] })
const definition = (): ScaleDefinitionV2 => {
  const d = createCustomScaleDefinition()
  d.items = ['a', 'b', 'attention', 'social'].map((itemCode, sortOrder) => ({ itemCode, sortOrder, content: itemCode, required: true, type: 'single', randomizeOptions: false, responseSetKey: 'default',
    ...(itemCode === 'attention' ? { purpose: 'ATTENTION_CHECK' as const, attentionTarget: 'option_2' } : itemCode === 'social' ? { purpose: 'SOCIAL_DESIRABILITY' as const } : {}) }))
  d.scoring.itemRules = ['a', 'b'].map(itemCode => ({ itemCode, transform: { type: itemCode === 'b' ? 'reverse' : 'identity' } }))
  d.scoring.scores = [{ key: 'total', type: 'total', label: '总分', direction: 'descriptive', canonical: true, displayPrecision: 1,
    source: { type: 'items', items: ['a', 'b'].map(itemCode => ({ itemCode, weight: 1 })), aggregation: 'mean' } }]
  d.report.interpretations = [{scoreKey:'total',headline:'总分',source:{type:'score_only'},summary:'描述性结果',bands:[],guidance:[]}]
  d.report.primaryScoreKeys = ['total']; d.report.scoreOrder = ['total']; d.report.rawScoreFeedback = config()
  return d
}
const survey = () => ({ schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean',
  responseOptions: [1,2,3,4,5].map(score => ({ optionKey: `o${score}`, label: `${score}`, score })),
  dimensions: [{ dimensionKey: 'd', label: '维度', direction: 'descriptive' }],
  items: [
    { itemKey: 'a', prompt: '内容', required: true, reverse: false, dimensionKeys: ['d'] },
    { itemKey: 'attention', prompt: '请选择第二项', required: true, reverse: false, dimensionKeys: [], purpose: 'ATTENTION_CHECK', attentionTarget: 'o2' },
    { itemKey: 'social', prompt: '我从不撒谎', required: true, reverse: false, dimensionKeys: [], purpose: 'SOCIAL_DESIRABILITY' },
  ], totalScore: { key: 'total', label: '总分', itemKeys: ['a'], aggregation: 'sum' }, rawScoreFeedback: config(),
})

describe('raw score feedback authoring', () => {
  it('matches left-closed right-open intervals and final closed maximum without rounding', () => {
    expect(rawScoreFeedbackSchema.parse(config())).toEqual(config())
    for (const [value, key] of [[1,'low'],[2.999999,'low'],[3,'high'],[5,'high']] as const) expect(matchRawScoreFeedback(config(),'total',value)?.rangeKey).toBe(key)
    expect(matchRawScoreFeedback(config(),'total',null)).toBeNull()
    expect(matchRawScoreFeedback(config(),'unknown',3)).toBeNull()
    expect(matchRawScoreFeedback(config(),'total',5.00001)).toBeNull()
  })
  it('uses explicit fallback for gaps and rejects gaps without fallback', () => {
    const c = config(); c.rules[0].ranges[1].min = 4
    expect(rawScoreFeedbackSchema.safeParse(c).success).toBe(false)
    c.rules[0].fallback = { text: '未匹配' }
    expect(rawScoreFeedbackSchema.safeParse(c).success).toBe(true)
    expect(matchRawScoreFeedback(c,'total',3)?.text).toBe('未匹配')
  })
  it.each(['overlap','empty','nonfinalclosed','duplicate'] as const)('rejects %s interval rules', kind => {
    const c = config()
    if(kind==='overlap')c.rules[0].ranges[1].min=2
    if(kind==='empty')c.rules[0].ranges[0].max=1
    if(kind==='nonfinalclosed')c.rules[0].ranges[0].includeMax=true
    if(kind==='duplicate')c.rules.push(c.rules[0])
    expect(rawScoreFeedbackSchema.safeParse(c).success).toBe(false)
  })
  it('rejects remote image URLs and preserves frozen asset identity', () => {
    const c = config(); const images = [{ asset: { assetId: 'img1', contentHash: 'a'.repeat(64), mimeType: 'image/png' as const }, altText: '反馈图', order: 0 }]
    c.rules[0].ranges[0].images=images
    expect(matchRawScoreFeedback(rawScoreFeedbackSchema.parse(c),'total',2)?.images).toEqual(images)
    images[0].asset.assetId='https://external.test/x.png'
    expect(rawScoreFeedbackSchema.safeParse(c).success).toBe(false)
  })
  it('validates score-key binding and keeps STANDARD protected', () => {
    const d=definition(); d.report.rawScoreFeedback!.rules[0].scoreKey='missing'
    expect(validateScaleDefinition(d,{instrumentClass:'CUSTOM_DESCRIPTIVE'}).issues.some(i=>i.path.includes('rawScoreFeedback'))).toBe(true)
    expect(validateScaleDefinition(definition(),{instrumentClass:'STANDARD'}).issues.some(i=>i.path==='report.rawScoreFeedback')).toBe(true)
  })
})

describe('unscored quality items', () => {
  it('excludes quality responses from transformed item scores, sums, means, denominators and feedback', () => {
    const d=definition(); const validation=validateScaleDefinition(d,{instrumentClass:'CUSTOM_DESCRIPTIVE'})
    expect(validation.issues.filter(i=>i.severity==='error')).toEqual([])
    const answers={a:'option_1',b:'option_4',attention:'option_5',social:'option_5'}
    const result=scoreScale(d,answers)
    expect(result.itemScores.map(i=>i.itemCode)).toEqual(['a','b'])
    expect(result.scores[0].value).toBe(1.5)
    expect(result.scores[0].expectedItems).toEqual(['a','b'])
    expect(result.quality).toEqual({status:'interpretable',flags:[]})
    expect(matchRawScoreFeedback(d.report.rawScoreFeedback,'total',result.scores[0].value)?.rangeKey).toBe('low')
    d.scoring.scores[0].source.aggregation='sum'
    expect(scoreScale(d,answers).scores[0].value).toBe(3)
  })
  it('retains ordinary required-answer validation but does not grade attention answers', () => {
    const d=definition(); const answers=d.items.map(i=>({itemCode:i.itemCode,responseValue:'option_1'}))
    expect(()=>validateScaleAnswers(d,answers)).not.toThrow()
    expect(missingRequiredScaleItemCodes(d,answers.filter(a=>a.itemCode!=='attention'))).toEqual(['attention'])
    expect(scoreScale(d,Object.fromEntries(answers.map(a=>[a.itemCode,a.responseValue]))).quality.flags).toEqual([])
  })
  it('never leaks target or purpose to participant runner', () => {
    const runner=runnerDefinition(definition())
    expect(JSON.stringify(runner)).not.toContain('attentionTarget')
    expect(JSON.stringify(runner)).not.toContain('ATTENTION_CHECK')
    expect(runner.items).toHaveLength(4)
  })
  it('rejects scoring references even when authoring validation is bypassed', () => {
    const d=definition(); if(d.scoring.scores[0].source.type==='items')d.scoring.scores[0].source.items.push({itemCode:'attention',weight:1})
    expect(validateScaleDefinition(d).issues.some(i=>i.message.includes('质量题不能纳入'))).toBe(true)
    expect(()=>scoreScale(d,{})).toThrow('质量题不能纳入计分')
  })
  it('rejects quality reverse transforms and invalid target values', () => {
    const d=definition(); d.scoring.itemRules.push({itemCode:'attention',transform:{type:'reverse'}});d.items[2].attentionTarget='missing'
    expect(validateScaleDefinition(d).issues.filter(i=>i.severity==='error').map(i=>i.path)).toEqual(expect.arrayContaining(['items.2.attentionTarget','scoring.itemRules.2.transform']))
  })
  it('does not inject defaults into old item definitions or change their hash', () => {
    const d=definition(); d.items=d.items.slice(0,2);delete d.report.rawScoreFeedback
    const before=hashScaleDefinition(d), parsed=validateScaleDefinition(d).definition!
    expect(parsed.items[0]).not.toHaveProperty('purpose')
    expect(parsed.report).not.toHaveProperty('rawScoreFeedback')
    expect(hashScaleDefinition(parsed)).toBe(before)
  })
  it('emits matches in built reports without changing scores', () => {
    const d=definition()
    const result=buildScaleResult({scaleId:'s',instrumentKey:'S',name:'S',instrumentVersion:'1',definition:d,answers:d.items.map(i=>({itemCode:i.itemCode,responseValue:'option_3'}))})
    expect(result.scores[0].value).toBe(3)
    expect(result.rawScoreFeedback?.[0].rangeKey).toBe('high')
  })
})

describe('Survey research scale compilation', () => {
  it('preserves quality metadata privately but compiles only content scoring and independent total', () => {
    const d=compileResearchScale('研究',survey())
    expect(d.items).toHaveLength(3)
    expect(d.items[1].attentionTarget).toBe('o2')
    expect(d.scoring.itemRules.map(r=>r.itemCode)).toEqual(['a'])
    expect(d.scoring.scores.map(s=>s.key)).toEqual(['d','total'])
    expect(scoreScale(d,{a:'o3',attention:'o5',social:'o5'}).scores.map(s=>s.value)).toEqual([3,3])
    expect(d.report.rawScoreFeedback).toEqual(config())
  })
  it('rejects quality-only scales, dimension membership and total references', () => {
    const d=survey(); d.items=d.items.slice(1)
    expect(validateSurveyDraft('SCALE',d,true).issues.some(i=>i.path==='items')).toBe(true)
    const invalid=survey();invalid.items[1].dimensionKeys=['d'];invalid.totalScore.itemKeys=['attention']
    const issues=validateSurveyDraft('SCALE',invalid,true).issues
    expect(issues.some(i=>i.path==='items.1.dimensionKeys')).toBe(true)
    expect(issues.some(i=>i.path==='totalScore.itemKeys')).toBe(true)
  })
})


describe('frozen feedback report boundary', () => {
  const result = () => { const d=definition(); return buildScaleResult({scaleId:'s',instrumentKey:'S',name:'S',instrumentVersion:'1',definition:d,answers:d.items.map(i=>({itemCode:i.itemCode,responseValue:'option_3'}))}) }
  const context = (full=true): ScaleProjectionContext => {
    const caps=full?DISCLOSURE_PRESETS.FULL_REPORT():DISCLOSURE_PRESETS.SCORES()
    return {principalId:'owner',audience:'respondent',purpose:'result',accessDecision:{source:'RESOURCE_AUTHORIZATION',allowed:true,capabilities:caps},
      frozenPolicy:{disposition:'FROZEN_V2',disclosure:{schemaVersion:1,policyVersion:'v1',audiences:{respondent:caps},unknownAudience:'DENY'}},currentRestrictions:caps,relationalDisposition:'NON_RELATIONAL'}
  }
  it('projects feedback only with individual interpretation and audience permissions',()=>{
    const r=result(),project=(c:ScaleProjectionContext)=>projectScaleResult({result:r,instrument:r.instrument,context:c})
    expect(project(context())).toHaveProperty('rawScoreFeedback.0.rangeKey','high')
    expect(project(context(false))).not.toHaveProperty('rawScoreFeedback')
    const noLabels=context(); noLabels.currentRestrictions={...noLabels.currentRestrictions,scoreDerivedLabels:false}
    expect(project(noLabels)).toHaveProperty('rawScoreFeedback.0.rangeKey',null)
    r.method.reportAudience='teacher'
    expect(project(context())).not.toHaveProperty('rawScoreFeedback')
  })
  it('includes actual assessment id only for permitted collection feedback',()=>{
    const report=buildScaleUnitReport({assessmentId:'actual-assessment',scaleId:'s',scaleName:'S',result:result()})
    expect(projectScaleUnitReport(report,context())).toHaveProperty('assessmentId','actual-assessment')
    expect(projectScaleUnitReport(report,context(false))).not.toHaveProperty('assessmentId')
    report.method!.reportAudience='teacher'
    expect(projectScaleUnitReport(report,context())).not.toHaveProperty('rawScoreFeedback')
  })
  const envelopeFor=(r:ReturnType<typeof result>)=>{
    const core:CanonicalUnitResultCoreV1={schemaVersion:1,unitType:'SCALE',instrumentKey:'S',instrumentVersion:'1',sourceDefinitionHash:r.method.definitionHash,
      compilerVersion:'test-v1',compiledRuntimeHash:'e'.repeat(64),scorerKey:'scale.default',scorerVersion:r.method.scoringVersion,quality:r.quality,
      metrics:r.scores.map(score=>({key:score.key,value:score.value,unit:'score',quality:score.status})),facts:[],references:[],contextHash:null,
      scientificProvenance:{instrumentKey:'S',instrumentVersion:'1'}}
    return createCanonicalUnitResultEnvelope({core,completedAt:'2026-10-21T00:00:00.000Z',persistenceProvenance:{sourceType:'ASSESSMENT',sourceAttemptId:'actual',sourceSubmissionId:'submission'},bundleBridge:buildScaleBundleBridge(r)})
  }
  it('rebuilds unified collection feedback and source id from integrity-bound matched bridge, without recomputation',()=>{
    const r=result();r.method.reportAudience='student'
    const envelope=envelopeFor(r), decoded=parseCanonicalUnitResultEnvelope(envelope)
    const built=buildQuestionnaireCollectionReportFromUnifiedInput({questionnaireName:'Q',scales:[{itemId:'slot',scaleId:'s',scaleCode:'S',scaleName:'S',completedAt:decoded.completedAt,totalTime:null,core:decoded.core,sourceAttemptId:decoded.persistenceProvenance.sourceAttemptId,bundleBridge:decoded.bundleBridge}],formSections:[]})
    expect(built.unitReports[0].rawScoreFeedback).toEqual(r.rawScoreFeedback)
    const stored=collectionReportForStorage(built)
    const projected=buildQuestionnaireCollectionReport({questionnaire:{name:'Q'},aggregateReport:stored},{contextForScale:()=>context()})
    expect(projected.unitReports[0]).toHaveProperty('assessmentId','actual')
    expect(projected.unitReports[0].rawScoreFeedback).toEqual(r.rawScoreFeedback)
    const denied=buildQuestionnaireCollectionReport({questionnaire:{name:'Q'},aggregateReport:stored},{contextForScale:()=>context(false)})
    expect(denied.unitReports[0]).not.toHaveProperty('rawScoreFeedback')
    const tampered=structuredClone(envelope);tampered.bundleBridge!.rawScoreFeedback![0].text='篡改'
    expect(()=>parseCanonicalUnitResultEnvelope(tampered)).toThrow('bundleBridgeHash mismatch')
  })
  it('roundtrips matched feedback through compact frozen facts without quality item scoring',async()=>{
    vi.stubEnv('DATA_ENCRYPTION_KEY','c'.repeat(64))
    try {
      const rows=new Map<string,PublicTemplateRow>()
      const store=createPublicTemplateStore({read:async hashes=>hashes.flatMap(h=>rows.has(h)?[rows.get(h)!]:[]),append:async values=>{for(const row of values)rows.set(row.templateHash,row)}})
      const r=result(),d=definition(),answers=d.items.map(i=>({itemCode:i.itemCode,responseValue:'option_3'}))
      const encrypted=await prepareCompactScaleFacts({result:r,itemOrder:d.items.map(i=>i.itemCode),binding:{assessmentId:'actual',attemptEpoch:1,submissionId:'submission',payloadHash:'d'.repeat(64)},canonical:envelopeFor(r)},store)
      const restored=await restoreCompactScaleFacts(decodeScaleFacts(encrypted),{full:true,answers},store)
      expect(restored.result).toEqual(r)
      expect(restored.canonical).toEqual(envelopeFor(r))
      expect(restored.result.itemScores.map(i=>i.itemCode)).toEqual(['a','b'])
    } finally { vi.unstubAllEnvs() }
  })
})
