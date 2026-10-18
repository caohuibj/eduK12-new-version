import { createHash } from 'node:crypto'
import baseline from './fixtures/survey-sjt-pre-extraction.json'
import { compileResearchSjt } from '../../modules/survey/builder.compiler'
import independentFixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { describe, expect, it } from 'vitest'
import { compileSjtOnlineDocument, assertSjtOnlineReleaseReady, normalizeSjtOnlineResponses,
  publicSjtOnlineMetadata, validateSjtOnlineMetadata, type SjtOnlineDocument,
} from '../../modules/situational/authoring/online'
import { compileSurveySjtV2 } from '../../modules/survey/sjt-v2.compiler'
import { compileSjtV2 } from '../../modules/assessment-core/sjt/compiler'
import { SJT_V2_LIMITS } from '../../modules/assessment-core/sjt/definition'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { validateSituationPackage } from '../../modules/situational/situation-package'
import { SjtTemplateError } from '../../modules/situational/authoring/template'

const fixture=():SjtOnlineDocument=>({templateVersion:'sjt-online-v1',instrumentKey:'teacher-online',
  instrumentVersion:'0.1.0',title:'共同备课',display:{schemaVersion:2,respondentType:'teacher_self_report',
    title:'共同备课',author:'教研组',sourceNote:'自编情境',licenseStatus:'self_authored',redistribution:'allowed',
    orderPolicy:'FIXED',metrics:[{metricKey:'coordination',label:'协调',direction:'descriptive'}],
    scoring:{modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',sourceNote:''},
    scenes:[{sceneKey:'planning',title:'共同备课',stimulus:'团队正在安排下一周教学。',questions:[{
      questionKey:'action',prompt:'你会怎样做？',responseType:'MULTIPLE',aggregationPolicy:'SUM',
      minSelections:1,maxSelections:2,required:false,allowRefusal:true,
      options:[{optionKey:'discuss',label:'共同讨论',contributions:{coordination:2}},
        {optionKey:'plan',label:'整理计划',contributions:{coordination:4}}],
    }]}]},goldenCases:[
    {name:'讨论',responses:[{sceneKey:'sjt_q_action',channelKey:'action',status:'ANSWERED',responseValue:['discuss']}],expected:{coordination:2}},
    {name:'计划',responses:[{sceneKey:'sjt_q_action',channelKey:'action',status:'ANSWERED',responseValue:['plan']}],expected:{coordination:4}},
    {name:'组合',responses:[{sceneKey:'sjt_q_action',channelKey:'action',status:'ANSWERED',responseValue:['plan','discuss']}],expected:{coordination:6}},
    {name:'缺失',responses:[],expected:{coordination:null}},
    {name:'拒答',responses:[{sceneKey:'sjt_q_action',channelKey:'action',status:'REFUSED'}],expected:{coordination:null}},
  ]})

describe('online SJT authoring shared-core contract',()=>{
  it('preserves V1 and V2 byte-identical output and hashes from pre-extraction commit 8f4a528',()=>{
    expect(baseline.baseCommit).toBe('8f4a5288dbe17387d4dad96e1cdf854412c4e009')
    for(const fixture of baseline.fixtures){
      const compiled=compileResearchSjt(baseline.instrumentKey,fixture.input)
      expect(JSON.stringify(compiled)).toBe(JSON.stringify(fixture.output))
      expect(createHash('sha256').update(JSON.stringify(compiled)).digest('hex')).toBe(fixture.serializedSha256)
      expect(compiled.definitionHash).toBe(fixture.output.definitionHash)
      expect(compiled.contentDigest).toBe(fixture.output.contentDigest)
    }
  })
  it('checks an independent two-scene three-question hand-calculated oracle for both models',()=>{
    const author=compileSjtOnlineDocument(independentFixture)
    expect(()=>assertSjtOnlineReleaseReady(author)).not.toThrow()
    expect(author.package.goldenCases[0].expected.metrics.cooperation).toBe(9)
    const expert=JSON.parse(JSON.stringify(independentFixture))
    expert.display.scoring.modelKey='EXPERT_KEY'
    const expected=[3,8/3,8/3,5/3,11/3,10/3,null,null]
    expert.goldenCases.forEach((c:{expected:{cooperation:number|null}},i:number)=>{c.expected.cooperation=expected[i]})
    const compiled=compileSjtOnlineDocument(expert)
    expect(()=>assertSjtOnlineReleaseReady(compiled)).not.toThrow()
    expect(validateSituationPackage(compiled.package).valid).toBe(true)
  })
  it('retains the exact Survey wrapper compiler envelope and digest',()=>{
    const display=fixture().display
    const survey=compileSurveySjtV2('study',display)
    expect(survey).toEqual(compileSjtV2('study',display,{compilerVersion:'survey-sjt-fixed-v2.1',physicalPrefix:'survey_q_',scoringPrefix:'survey-sjt-v2-',reportVersion:'survey-sjt-private-v2',metricChannelKey:'survey_response',packageKey:'research-'+canonicalHash('study').slice(0,24),instrumentVersion:'0.2.0'}))
    expect(survey.compilerVersion).toBe('survey-sjt-fixed-v2.1')
    expect(survey.package.key).toBe('research-'+canonicalHash('study').slice(0,24))
    expect(survey.package.instrumentVersion).toBe('0.2.0')
    expect(survey.package.definition.scenes[0].sceneKey).toBe('survey_q_action')
    expect(survey.contentDigest).toBe(canonicalHash(JSON.parse(JSON.stringify({compilerVersion:'survey-sjt-fixed-v2.1',definition:display,package:survey.package}))))
  })
  it('requires independent manual expectations and all derived combinations, missing and refusal',()=>{
    const document=fixture(),compiled=compileSjtOnlineDocument(document)
    expect(()=>assertSjtOnlineReleaseReady(compiled)).not.toThrow()
    expect(validateSituationPackage(compiled.package).valid).toBe(true)
    expect(compiled.package.definition.scoring.scoringVersion).toBe('sjt-online-v1-author-sum-1')
    for(const remove of ['组合','缺失','拒答']){
      const d=fixture();d.goldenCases=d.goldenCases.filter(c=>c.name!==remove)
      expect(()=>assertSjtOnlineReleaseReady(compileSjtOnlineDocument(d))).toThrow(SjtTemplateError)
    }
    const incorrect=fixture();incorrect.goldenCases[0].expected.coordination=999
    expect(()=>compileSjtOnlineDocument(incorrect)).toThrow(SjtTemplateError)
    const missing=fixture();missing.goldenCases[0].expected={}
    expect(()=>compileSjtOnlineDocument(missing)).toThrow(SjtTemplateError)
    expect(document).toEqual(fixture())
  })
  it('allows empty-golden and unknown-license drafts but never releases them',()=>{
    const d=fixture();d.goldenCases=[]
    expect(()=>assertSjtOnlineReleaseReady(compileSjtOnlineDocument(d))).toThrow(SjtTemplateError)
    d.display.licenseStatus='unknown'
    expect(()=>compileSjtOnlineDocument(d)).not.toThrow()
    expect(()=>assertSjtOnlineReleaseReady(compileSjtOnlineDocument(d))).toThrow(SjtTemplateError)
  })
  it('preserves raw array order and timing while deriving one canonical scorer choice',()=>{
    const d=fixture(),c=compileSjtOnlineDocument(d)
    const raw=[{sceneKey:'sjt_q_action',channelKey:'action',status:'ANSWERED' as const,
      responseValue:['plan','discuss'],responseTimeMs:1234,answeredAt:'2026-10-18T10:00:00.000Z',
      responseRevision:1,historyIdentity:'a'.repeat(64),stageConfirmed:true}]
    const n=normalizeSjtOnlineResponses(d.display,c.package.definition,raw)
    expect(n.rawResponses).toEqual(raw)
    expect(n.responses[0]).toMatchObject({responseTimeMs:1234,answeredAt:raw[0].answeredAt,responseRevision:1,
      historyIdentity:'a'.repeat(64),stageConfirmed:true})
    expect(n.responses[0].responseValue).toMatch(/^m[a-f0-9]{22}$/)
    const reversed=normalizeSjtOnlineResponses(d.display,c.package.definition,[{...raw[0],responseValue:['discuss','plan']}])
    expect(reversed.responses).toEqual(n.responses)
    expect(reversed.rawResponses).not.toEqual(n.rawResponses)
    expect(normalizeSjtOnlineResponses(d.display,c.package.definition,[]).rawResponses).toEqual([])
    expect(normalizeSjtOnlineResponses(d.display,c.package.definition,[{sceneKey:'sjt_q_action',channelKey:'action',status:'BLANK'}]).responses).toEqual([])
  })
  it('rejects duplicate, unknown, forged derived, untyped and contradictory response states',()=>{
    const d=fixture(),c=compileSjtOnlineDocument(d),r=d.goldenCases[0].responses[0]
    for(const raw of [[r,r],[{...r,channelKey:'forged'}],[{...r,sceneKey:'planning'}],
      [{...r,responseValue:'m'+'a'.repeat(22)}],[{...r,responseValue:[]}],
      [{...r,status:'REFUSED'}],[{...r,status:'BLANK'}],[{...r,score:99}],
      [{...r,responseValue:['discuss','discuss']}],[{...r,responseValue:['forged']}],
      [{...r,responseValue:4}]])expect(()=>normalizeSjtOnlineResponses(d.display,c.package.definition,raw)).toThrow(SjtTemplateError)
    d.display.scenes[0].questions[0].required=true;d.goldenCases=[]
    const required=compileSjtOnlineDocument(d)
    expect(()=>normalizeSjtOnlineResponses(d.display,required.package.definition,[])).toThrow(SjtTemplateError)
    expect(()=>normalizeSjtOnlineResponses(d.display,required.package.definition,[{sceneKey:'sjt_q_action',channelKey:'action',status:'REFUSED'}])).not.toThrow()
  })
  it('binds metadata to the exact scorer and strips all scoring keys from public display',()=>{
    const c=compileSjtOnlineDocument(fixture()),m=c.package.online
    expect(validateSjtOnlineMetadata(m,c.package.definition)).toEqual(m)
    const publicJson=JSON.stringify(publicSjtOnlineMetadata(m))
    for(const hidden of ['contributions','scoring','expertKey','author','sourceNote'])expect(publicJson).not.toContain('"'+hidden+'"')
    const changed=JSON.parse(JSON.stringify(m))
    changed.display.scenes[0].questions[0].options[0].contributions.coordination=999
    changed.displayHash=canonicalHash(changed.display)
    expect(()=>validateSjtOnlineMetadata(changed,c.package.definition)).toThrow(SjtTemplateError)
    expect(()=>validateSjtOnlineMetadata({...m,unknown:true},c.package.definition)).toThrow(SjtTemplateError)
  })
  it('retains the explicit bounds and rejects non-text content and wrong respondent scope',()=>{
    expect(SJT_V2_LIMITS).toEqual({scenes:20,questionsPerScene:10,questions:100,metrics:20,singleOptions:12,multipleOptions:6,derivedChoices:24,scoredCells:16000})
    const d=fixture();d.display.respondentType='participant_self_report'
    expect(()=>compileSjtOnlineDocument(d)).toThrow(SjtTemplateError)
    const image=fixture();(image.display.scenes[0] as unknown as Record<string,unknown>).image={url:'https://example.org/image.png'}
    expect(()=>compileSjtOnlineDocument(image)).toThrow(SjtTemplateError)
  })
  it('requires independent coverage for every nonanswer option without any zero contribution',()=>{
    const d=fixture(),q=d.display.scenes[0].questions[0]
    q.options.push({optionKey:'declined',label:'不愿回答',nonanswerReason:'DECLINED',contributions:{}},
      {optionKey:'uncertain',label:'无法判断',nonanswerReason:'UNABLE_TO_JUDGE',contributions:{}})
    expect(()=>assertSjtOnlineReleaseReady(compileSjtOnlineDocument(d))).toThrow(SjtTemplateError)
    for(const key of ['declined','uncertain'])d.goldenCases.push({name:key,responses:[{
      sceneKey:'sjt_q_action',channelKey:'action',status:'ANSWERED',responseValue:[key],
    }],expected:{coordination:null}})
    const c=compileSjtOnlineDocument(d)
    expect(()=>assertSjtOnlineReleaseReady(c)).not.toThrow()
    expect(c.package.definition.scoring.model?.expertKey?.some(e=>e.optionKey==='declined'||e.optionKey==='uncertain')).toBe(false)
    q.options[2].contributions={coordination:0}
    expect(()=>compileSjtOnlineDocument(d)).toThrow(SjtTemplateError)
  })
  it('uses the same expert mean and MULTIPLE MEAN semantics with explicit expected values',()=>{
    const d=fixture();d.display.scoring={modelKey:'EXPERT_KEY',modelVersion:'1',sourceNote:'教研团队独立专家键'}
    d.display.scenes[0].questions[0].aggregationPolicy='MEAN'
    d.goldenCases.find(c=>c.name==='组合')!.expected.coordination=3
    const c=compileSjtOnlineDocument(d)
    expect(()=>assertSjtOnlineReleaseReady(c)).not.toThrow()
    expect(c.package.definition.scoring.scoringVersion).toBe('sjt-online-v1-expert-mean-1')
  })
})
