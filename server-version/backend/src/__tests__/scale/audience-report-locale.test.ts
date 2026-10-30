import {describe,it,expect} from 'vitest'
import {SCALE_INSTRUMENT_SOURCE as source} from '../../modules/scale/instruments/bat12_2020_en/1.0.0/instrument'
import {validateAudienceReport} from '../../modules/scale/library/audience-report-gate'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {allowsScaleAxisRevision} from '../../modules/scale/onboarding/axis-snapshots'
import {snapshotScaleInstrumentSource} from '../../modules/scale/onboarding/source-snapshot'
import {scaleLocalizationReasons} from '../../modules/scale/policy/localization'
import type {ScaleDeploymentPolicy} from '../../modules/scale/policy/deployment'

describe('cross-language report axis',()=>{
  it('accepts the actual English BAT12 questionnaire with Chinese teacher feedback without widening questionnaire locale or source rights',()=>{
    const d=source.executable!.definition
    expect(source.instruction!.language).toBe('en')
    expect(d.versionAxes!.locale).toBe('en')
    expect(d.report.audienceContract).toMatchObject({locale:'zh-CN',respondent:'ADULT_SELF',audience:'teacher'})
    expect(validateAudienceReport(d)).toEqual([])
    const policy={locale:'en',localizationVersion:source.localization!.localizationVersion} as ScaleDeploymentPolicy
    expect(scaleLocalizationReasons(source,policy)).toEqual([])
    expect(scaleLocalizationReasons(source,{...policy,locale:'zh-CN'})).toContain('DEPLOYMENT_CONTENT_LOCALE_MISMATCH')
    expect(source.disclosure!.audiences.subject).toMatchObject({references:false,scoreDerivedLabels:false,educationalContent:false})
  })
  it('binds report locale to the existing report revision and frozen source without changing measurement identity or old bytes',()=>{
    const bytes=JSON.stringify(source),old=source.executable!.definition,next=structuredClone(source)
    next.executable!.definition.report.audienceContract!.locale='en'
    expect(hashScaleDefinition(next.executable!.definition)).toBe(hashScaleDefinition(old))
    expect(canonicalHash(snapshotScaleInstrumentSource(next))).not.toBe(canonicalHash(snapshotScaleInstrumentSource(source)))
    expect(allowsScaleAxisRevision(old,next.executable!.definition)).toBe(false)
    next.executable!.definition.report.reportVersion='1.0.1'
    expect(allowsScaleAxisRevision(old,next.executable!.definition)).toBe(true)
    expect(JSON.stringify(source)).toBe(bytes)
    expect(old.report.audienceContract!.locale).toBe('zh-CN')
  })
})
