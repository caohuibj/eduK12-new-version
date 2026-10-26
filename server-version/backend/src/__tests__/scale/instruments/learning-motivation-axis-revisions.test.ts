import { describe,it,expect } from 'vitest'
import { getScaleInstrumentSource } from '../../../modules/scale/onboarding/instrument-registry'
import { allowsScaleAxisRevision } from '../../../modules/scale/onboarding/axis-snapshots'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
const old=getScaleInstrumentSource('academic_self_concept_chemistry_zh_cn','1.0.0')!.executable!.definition
it('allows report-only revisions with stable measurement identity; rejects unversioned or changed items',()=>{
 const next=structuredClone(old);next.report.reportVersion='1.2.0';next.report.interpretations[0].summary+='new copy'
 expect(allowsScaleAxisRevision(old,next)).toBe(true);expect(hashScaleDefinition(old)).toBe(hashScaleDefinition(next))
 next.report.reportVersion=old.report.reportVersion;expect(allowsScaleAxisRevision(old,next)).toBe(false)
 next.report.reportVersion='1.2.0';next.items[0].content+='changed item';expect(allowsScaleAxisRevision(old,next)).toBe(false)
})
it('new references require new version identities and never imply new raw scoring',()=>{
 const next=structuredClone(old);if(next.referencePolicy.type!=='declared')throw Error('fixture')
 next.referencePolicy.selections[0].referenceVersion='wave1-v2';expect(allowsScaleAxisRevision(old,next)).toBe(true);expect(hashScaleDefinition(old)).toBe(hashScaleDefinition(next))
 next.referencePolicy.selections[0].referenceVersion=old.referencePolicy.type==='declared'?old.referencePolicy.selections[0].referenceVersion:'';next.referencePolicy.selections[0].referenceKind='descriptive_sample';expect(allowsScaleAxisRevision(old,next)).toBe(false)
})
it('changes only the revised reference version and retains an independent selected reference',()=>{
 const before=structuredClone(old)
 if(before.referencePolicy.type!=='declared')throw Error('fixture')
 before.referencePolicy.selections.push({scoreKey:before.referencePolicy.selections[0].scoreKey,referenceVersion:'independent-v1',referenceKind:'descriptive_sample'})
 const next=structuredClone(before)
 if(next.referencePolicy.type!=='declared')throw Error('fixture')
 next.referencePolicy.selections[0].referenceVersion='bibliography-v2'
 expect(allowsScaleAxisRevision(before,next)).toBe(true)
 expect(next.referencePolicy.selections[1]).toEqual(before.referencePolicy.selections[1])
 expect(hashScaleDefinition(next)).toBe(hashScaleDefinition(before))
 const removed=structuredClone(before)
 if(removed.referencePolicy.type!=='declared')throw Error('fixture')
 removed.referencePolicy.selections.pop()
 expect(allowsScaleAxisRevision(before,removed)).toBe(false)
})
