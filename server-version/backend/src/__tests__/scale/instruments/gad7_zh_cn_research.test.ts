import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/gad7_zh_cn_research/1.1.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
const pkg = projectScalePackage(source)!
const d = pkg.definition
const answers = d.items.slice(0,7).map(item => ({ itemCode: item.itemCode, responseValue: '0' }))
const result = (a = answers) => buildScaleResult({ scaleId: 'synthetic-local-only', instrumentKey: source.identity.instrumentKey, name: source.catalog.identity.canonicalName, instrumentVersion: source.identity.instrumentVersion, definition: d, answers: a })
describe('gad7 1.1.0 adult research contract', () => {
 it('passes strict source validation with distinct historical identity',()=>{expect(()=>defineScaleInstrumentSource(source)).not.toThrow();expect(validateScalePackage(pkg).valid).toBe(true);expect(source.identity.instrumentVersion).toBe('1.1.0');expect(pkg.releaseStatus).toBe('DRAFT');expect(source.localization?.reviewStatus).toBe('PENDING');expect(source.scientificReview).toBeUndefined()})
 it('keeps all original scored items ordered with identity transforms',()=>{expect(d.items).toHaveLength(7);expect(d.items.map(x=>x.sortOrder)).toEqual(Array.from({length:7},(_,i)=>i));expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true);expect(d.scoring.scores[0].source.items.map(x=>x.itemCode)).toEqual(d.items.slice(0,7).map(x=>x.itemCode));expect(d.scoring.scores[0].source.aggregation).toBe('sum')})
 for(const f of pkg.goldenCases)it('scores '+f.name,()=>{const a=scoreScale(d,f.answers);expect(a.quality.status).toBe('interpretable');expect(Object.fromEntries(a.scores.map(x=>[x.key,x.value]))).toEqual(f.expected.scores)})
 it('rejects unknown responses and never fills missing as zero',()=>{expect(()=>result([{...answers[0],responseValue:'99'},...answers.slice(1)])).toThrow('量表回答不合法');const a=result(answers.slice(1));expect(a.quality.status).toBe('invalid');expect(a.scores[0].value).toBeNull();expect(a.interpretations).toEqual([]);expect(a.references).toEqual([]);expect(a.disclaimer).toBe(d.report.disclaimer)})
 it('returns real descriptive reports without external threshold activation',()=>{const a=parseScaleResultV2(JSON.parse(JSON.stringify(result())));expect(a.scores[0].value).toBe(0);expect(a.scores[0].range).toMatchObject({min:0,max:21});expect(a.interpretations).toHaveLength(1);expect(a.interpretations[0].label).toBeNull();expect(a.interpretations[0].referenceVersion).toBeNull();expect(a.interpretations[0].interpretation.length).toBeGreaterThanOrEqual(100);expect(a.references).toEqual([]);expect(d.referencePolicy).toEqual({type:'none'});expect(d.report.interpretations[0].bands).toEqual([]);expect(d.report.audienceContract?.respondent).toBe('ADULT_SELF')})
 it('preserves first scoring/report axes under new content identity',()=>{expect(d.scoring.scoringVersion).toBe('1.0.0');expect(d.report.reportVersion).toBe('1.0.0');const c=structuredClone(d);c.report.disclaimer+='说明';expect(hashScaleDefinition(c)).toBe(hashScaleDefinition(d));c.items[0].content+='题文';expect(hashScaleDefinition(c)).not.toBe(hashScaleDefinition(d))})
 it('preserves standalone seven-item form and two-week context',()=>{expect(d.responseSets[0].options.map(x=>x.score)).toEqual([0,1,2,3]);expect(d.items.every(x=>x.content.includes('过去两周'))).toBe(true);expect(d.report.disclaimer).toContain('分数低也不能排除');expect(d.license?.note).toContain('复制、翻译')})
})
