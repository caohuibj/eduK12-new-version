import { describe,it,expect } from 'vitest'
import { getScaleInstrumentSource } from '../../../modules/scale/onboarding/instrument-registry'
import { allowsScaleAxisRevision } from '../../../modules/scale/onboarding/axis-snapshots'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
const old=getScaleInstrumentSource('academic_self_concept_chemistry_zh_cn','1.0.0')!.executable!.definition
it('allows report-only revisions with stable measurement identity; rejects unversioned or changed items',()=>{
 const next=structuredClone(old);next.report.reportVersion='1.1.0';next.report.interpretations[0].summary+='new copy'
 expect(allowsScaleAxisRevision(old,next)).toBe(true);expect(hashScaleDefinition(old)).toBe(hashScaleDefinition(next))
 next.report.reportVersion='1.0.0';expect(allowsScaleAxisRevision(old,next)).toBe(false)
 next.report.reportVersion='1.1.0';next.items[0].content+='changed item';expect(allowsScaleAxisRevision(old,next)).toBe(false)
})
it('new references require new version identities and never imply new raw scoring',()=>{
 const next=structuredClone(old);if(next.referencePolicy.type!=='declared')throw Error('fixture')
 next.referencePolicy.selections[0].referenceVersion='wave1-v2';expect(allowsScaleAxisRevision(old,next)).toBe(true);expect(hashScaleDefinition(old)).toBe(hashScaleDefinition(next))
 next.referencePolicy.selections[0].referenceVersion='wave1-20261001-v1';next.referencePolicy.selections[0].referenceKind='descriptive_sample';expect(allowsScaleAxisRevision(old,next)).toBe(false)
})
