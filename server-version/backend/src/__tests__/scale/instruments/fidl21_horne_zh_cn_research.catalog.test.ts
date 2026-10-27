import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/fidl21_horne_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'

describe('FIDL-21 catalog-only identity, NOTRUN',()=>{
 it('keeps item metadata without fabricating a questionnaire',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.catalog.administration.itemCount).toBe(21)
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(source.candidatePreview?.status).toBe('CATALOG_ONLY')
  expect(source.executable).toBeUndefined()
  expect(projectScalePackage(source)).toBeUndefined()
 })
 it('retains five factor labels and source blockers',()=>{
  expect(source.candidatePreview?.reportPlan?.dimensionLabels).toHaveLength(5)
  expect(source.candidatePreview?.blockers).toContain('REVERSE_ITEMS_UNVERIFIED')
 })
})
