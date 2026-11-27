import {describe,expect,it} from 'vitest'
import {buildScaleReportArtworkRegistry} from './scale-report-artwork-registry'

describe('scale report artwork registry',()=>{
 it('binds a version-local manifest to its exact report and images',()=>{
  const directory='/src/scale-report-artwork/example_scale/1.2.0/R1.0.0'
  const registry=buildScaleReportArtworkRegistry({[directory+'/report-artwork.json']:{schemaVersion:1,artworkKey:'example_scale/1.2.0/R1.0.0',
   hero:{file:'hero.webp',alt:'报告主题插画',width:1200,height:800},bands:[{scoreKey:'total',bandKey:'low',file:'low.webp',alt:'低分段行动插画',width:512,height:512}]}},
  {[directory+'/hero.webp']:'/assets/hero.webp',[directory+'/low.webp']:'/assets/low.webp'})
  expect(registry.get('example_scale/1.2.0/R1.0.0')).toMatchObject({hero:{src:'/assets/hero.webp'},bands:new Map([['total\0low',{src:'/assets/low.webp',alt:'低分段行动插画',width:512,height:512}]])})
 })
 it('fails closed for path drift and missing files without hiding a valid declaration',()=>{
  const a='/src/scale-report-artwork/example_scale/1.2.0/R1.0.0',b='/src/scale-report-artwork/other_scale/1.0.0/R1.0.0'
  const manifest={schemaVersion:1,artworkKey:'example_scale/1.2.0/R1.0.0',bands:[{scoreKey:'total',bandKey:'low',file:'low.webp',alt:'配图',width:512,height:512}]}
  expect(buildScaleReportArtworkRegistry({[a+'/report-artwork.json']:{...manifest,artworkKey:'wrong/1.0.0/R1.0.0'}},{[a+'/low.webp']:'/low.webp'}).size).toBe(0)
  expect(buildScaleReportArtworkRegistry({[a+'/report-artwork.json']:manifest},{}).size).toBe(0)
  expect(buildScaleReportArtworkRegistry({[a+'/report-artwork.json']:manifest,[b+'/report-artwork.json']:{...manifest}},{[a+'/low.webp']:'/low.webp',[b+'/low.webp']:'/other.webp'}).size).toBe(1)
 })
})
