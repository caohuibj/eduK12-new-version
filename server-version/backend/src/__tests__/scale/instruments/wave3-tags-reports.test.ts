import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { SCALE_INSTRUMENT_SOURCE as cfsr } from '../../../modules/scale/instruments/cfsr12_zh_cn_research/1.0.1/instrument'
import { SCALE_INSTRUMENT_SOURCE as ebq } from '../../../modules/scale/instruments/ebq16_zh_cn_research/1.0.1/instrument'
import { SCALE_INSTRUMENT_SOURCE as mpmi } from '../../../modules/scale/instruments/mpmi_s22_zh_cn_research/1.0.0/instrument'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { buildScaleResult } from '../../../modules/scale/scale-result'
import { defineScaleInstrumentSource } from '../../../modules/scale/onboarding/define-instrument'

const revisions: Array<{instrumentKey:string;measurementHash:string;oldCatalogManifestVersion:number;newReportVersion:string;oldReportVersion:string;oldTags:string[]}>=JSON.parse(readFileSync(resolve('../../docs/scale-instruments/batches/20261026-wave3/catalog-report-revisions.json'),'utf8'))
const axes=['domain','construct','orientation','population','response','use','license','language_validation']
describe('Wave3 rich tags and readable feedback, offline editorial checks',()=>{
  for(const source of [cfsr,ebq,mpmi]){
    it(source.identity.instrumentKey+' has factual eight-axis tags plus Chinese search terms',()=>{
      const tags=source.catalog.construct.constructOverlapTags
      expect(new Set(tags).size).toBe(tags.length)
      expect(tags.length).toBeGreaterThanOrEqual(40)
      expect(axes.every(axis=>tags.some(t=>t.startsWith(axis+':')))).toBe(true)
      expect(tags.filter(t=>/[\u4e00-\u9fff]/.test(t)).length).toBeGreaterThanOrEqual(8)
      expect(tags).toContain('license:attribution_required')
      expect(tags).toContain('license:source_allows_commercial_use')
      expect(tags).toContain('use:not_diagnostic')
      expect(tags).toContain('language_validation:china_validation_not_established')
    })
    it(source.identity.instrumentKey+' actually builds plain-language feedback with optional text-only takeaway',()=>{
      expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
      const e=source.executable!,fixture=e.goldenCases.find(f=>f.name.startsWith('mixed'))!
      const r=buildScaleResult({scaleId:'synthetic-wave3',instrumentKey:source.identity.instrumentKey,instrumentVersion:source.identity.instrumentVersion,name:source.catalog.identity.canonicalName,definition:e.definition,answers:fixture.answers})
      expect(r.method.reportVersion).toBe(e.definition.report.reportVersion)
      expect(r.interpretations.length).toBe(e.definition.scoring.scores.length)
      for(const i of r.interpretations){
        expect(i.interpretation.length).toBeGreaterThanOrEqual(100)
        expect(i.interpretation).not.toMatch(/CFA|Cronbach|ReferenceSet|canonical|百分位|标准差|\d/)
        expect(i.guidance.some(g=>g.category==='reflection')).toBe(true)
        expect(i.guidance.some(g=>g.category==='strategy')).toBe(true)
      }
    })
  }
  for(const source of [cfsr,ebq]){
    it(source.identity.instrumentKey+' changes only catalog/report identities while preserving measurement and parameters',()=>{
      const audit=revisions.find(r=>r.instrumentKey===source.identity.instrumentKey)!
      expect(hashScaleDefinition(source.executable!.definition)).toBe(audit.measurementHash)
      expect(source.catalog.catalogManifestVersion).toBe(audit.oldCatalogManifestVersion+1)
      expect(source.executable!.definition.report.reportVersion).toBe(audit.newReportVersion)
      expect(audit.newReportVersion).not.toBe(audit.oldReportVersion)
      expect(source.executable!.definition.scoring.scoringVersion).toBe('1.0.0')
      expect(source.localization?.localizationVersion).toBe('1.0.1')
      expect(source.executable!.references).toEqual([])
      expect(source.executable!.definition.referencePolicy).toEqual({type:'none'})
      for(const tag of audit.oldTags)expect(source.catalog.construct.constructOverlapTags).toContain(tag)
    })
  }
})
