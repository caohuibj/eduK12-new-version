import {describe,it,expect,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {freezeSituationalRuntimeAtAttemptStart} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import {resolveSituationalScientificContext} from '../../modules/situational/scientific-maturity'
import {validateSituationPackage} from '../../modules/situational/situation-package'
import {adaptCatalogSjt,NATIVE_SJT_ADAPTER_VERSION} from '../../modules/survey/catalog.sources'
import {assertSurveyNativeSituationalDefinition,compileSurveyNativeSituationalHeader,
  frozenSurveyNativeSituationalRuntime,surveyNativeSituationalRequiresStageNotice} from '../../modules/survey/situational-native.definition'
import {freezeSurveyMeasurementNotice,SURVEY_COGNITIVE_NOTICE,SURVEY_STAGED_SJT_NOTICE,SURVEY_LINEAR_SJT_NOTICE,hasSurveyLinearSituationalNotice,hasSurveyStagedSituationalNotice,disclosedSurveyConsent} from '../../modules/survey/measurement.notice'
import {compileSjtNativeV1Fixture,createSjtNativeV1FinalFixture} from '../fixtures/sjt-native-v1.fixture'
import {createSjtNativeStagedPackage} from '../fixtures/sjt-native-staged.fixture'

vi.mock('../../modules/situational/onboarding/scientific-registry',async original=>{
  const actual=await original<typeof import('../../modules/situational/onboarding/scientific-registry')>()
  const fixture=await import('../fixtures/sjt-native-v1.fixture')
  return {...actual,getSituationalScientificDeclaration:(key:string,version:string)=>
    key===fixture.SJT_NATIVE_V1_FIXTURE_KEY&&version==='1.0.0'
      ?fixture.createSjtNativeV1ScientificDeclaration():actual.getSituationalScientificDeclaration(key,version)}
})

describe('Survey native V1 TEXT uses the existing scientific contract',()=>{
  const compiled=compileSjtNativeV1Fixture(),pkg={...compiled.package,releaseStatus:'PUBLISHED' as const}
  const ref={kind:'SJT' as const,sourceId:'registry:'+pkg.key,sourceVersion:pkg.instrumentVersion}
  it('revalidates all original synthetic goldens and preserves the exact V1 definition/runtime',()=>{
    expect(validateSituationPackage(pkg).valid).toBe(true)
    expect(pkg.goldenCases.length).toBeGreaterThan(1)
    const source=adaptCatalogSjt(ref,'Original synthetic V1',pkg)
    expect(source.adapterVersion).toBe(NATIVE_SJT_ADAPTER_VERSION)
    expect(source.compiledDefinition).toEqual(pkg.definition)
    expect(source.definitionDigest).toBe(canonicalHash(pkg.definition))
    const frozenAt='2026-10-24T11:00:00.000Z'
    const {snapshot}=frozenSurveyNativeSituationalRuntime({kind:'SJT',executionProtocol:source.nativeSituational!.protocol,
      compiledDefinition:source.compiledDefinition,nativeSituational:{...source.nativeSituational,attemptEpoch:1,frozenAt}})
    const training=freezeSituationalRuntimeAtAttemptStart({instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,
      definition:pkg.definition,scientificContext:resolveSituationalScientificContext(pkg),frozenAt:new Date(frozenAt)})
    expect(snapshot).toEqual(training)
    expect(snapshot.definitionHash).toBe(compiled.definitionHash)
    expect(createSjtNativeV1FinalFixture().finalInput).not.toHaveProperty('researchCapture')
  })
  it('does not invent staged collection for V1 or alter actual V2/cognitive notices',()=>{
    const v1=surveyNativeSituationalRequiresStageNotice(pkg.definition)
    const v2=surveyNativeSituationalRequiresStageNotice(createSjtNativeStagedPackage().definition)
    expect(v1).toBe(false);expect(v2).toBe(true)
    expect(freezeSurveyMeasurementNotice({cognitive:false,stagedSituational:v1,linearSituational:true})).toEqual(SURVEY_LINEAR_SJT_NOTICE)
    expect(freezeSurveyMeasurementNotice({cognitive:true,stagedSituational:v1})).toEqual(SURVEY_COGNITIVE_NOTICE)
    expect(freezeSurveyMeasurementNotice({cognitive:false,stagedSituational:v2})).toEqual(SURVEY_STAGED_SJT_NOTICE)
    expect(freezeSurveyMeasurementNotice({cognitive:true,stagedSituational:true})).toEqual({version:'SURVEY_COMBINED_TASK_NOTICE_V1',includes:['COGNITIVE','STAGED_SJT'],text:SURVEY_COGNITIVE_NOTICE.text+'\n\n'+SURVEY_STAGED_SJT_NOTICE.text})
    const mixed=freezeSurveyMeasurementNotice({cognitive:true,stagedSituational:true,linearSituational:true})!
    expect(mixed.version).toBe('SURVEY_COMBINED_TASK_NOTICE_V2')
    expect(hasSurveyLinearSituationalNotice(mixed)).toBe(true)
    expect(hasSurveyStagedSituationalNotice(mixed)).toBe(true)
    expect(disclosedSurveyConsent('Consent',{measurementNotice:mixed})).toBe('Consent\n\n'+mixed.text)
    for(const altered of [{...mixed,text:'changed'},{...mixed,includes:['LINEAR_SJT','UNKNOWN']},{...mixed,includes:['LINEAR_SJT']}]){
      expect(hasSurveyLinearSituationalNotice(altered)).toBe(false)
      expect(hasSurveyStagedSituationalNotice(altered)).toBe(false)
    }
  })
  it('retains unsupported media, disguised flow and research-allocation guards',()=>{
    for(const extra of [{flow:{}},{researchAssignment:{}},{researchAssignment:null}]){
      expect(()=>assertSurveyNativeSituationalDefinition({...pkg.definition,...extra} as never)).toThrow()
    }
    const media=structuredClone(pkg.definition);media.scenes[0].stimulus={type:'IMAGE'} as never
    expect(()=>assertSurveyNativeSituationalDefinition(media)).toThrow()
    const unstaged=structuredClone(createSjtNativeStagedPackage().definition)
    if(unstaged.schemaVersion===2)for(const node of unstaged.flow.nodes)if(node.nodeType==='SCENE')delete node.responseStages
    expect(()=>assertSurveyNativeSituationalDefinition(unstaged)).toThrow()
  })
  it('requires published source and source redistribution rights independently of runtime support',()=>{
    expect(()=>compileSurveyNativeSituationalHeader(compiled.package)).toThrow()
    const restricted=structuredClone(pkg);restricted.definition.license.redistribution='restricted'
    expect(()=>adaptCatalogSjt(ref,'Synthetic restricted negative',restricted)).toThrow('SOURCE_RIGHTS_DO_NOT_ALLOW_SURVEY_REDISTRIBUTION')
  })
})
