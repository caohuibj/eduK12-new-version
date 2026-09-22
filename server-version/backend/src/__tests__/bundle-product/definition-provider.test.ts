import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createCodeBundleDefinitionProvider } from '../../modules/bundle-product/code-catalog'
import { BundleDefinitionProvider, freezeBundleProductionDefinition, readFrozenBundleProductionDefinition } from '../../modules/bundle-product/definition-provider'
const catalog=createCodeBundleDefinitionProvider()
const entry=()=>catalog.exact('integrated_gonogo_adexi_adult_zh_cn_v1','1.0.0')!
const freeze=()=>freezeBundleProductionDefinition(entry(),{frozenAt:'2026-09-22T00:00:00.000Z',sourceReference:'code:test'})
describe('Bundle production definition provider and full freeze',()=>{
  it('keeps all existing draft products blocked and observer products separate',()=>{
    expect(catalog.list().filter(entry => !entry.declarativePackage)).toHaveLength(7)
    for(const item of catalog.list()) {
      expect(item.definition.status).toBe('DRAFT')
      expect(catalog.publicationBlockers(item.definition.bundleKey,item.definition.bundleVersion)).toContain('BUNDLE_NOT_PUBLISHED')
      if(item.definition.category==='observer') expect(catalog.publicationBlockers(item.definition.bundleKey,item.definition.bundleVersion)).toContain('OBSERVER_DELIVERY_REQUIRES_DEDICATED_PRODUCT')
    }
  })
  it('rejects aliases and duplicate definitions; never resolves an unknown exact version to latest',()=>{
    expect(()=>catalog.exact(entry().definition.bundleKey,'latest')).toThrow()
    expect(catalog.exact(entry().definition.bundleKey,'9.0.0')).toBeNull()
    expect(()=>new BundleDefinitionProvider([entry(),entry()])).toThrow()
  })
  it('isolates returned definitions from caller mutation',()=>{
    const copy=entry();copy.definition.name='changed';copy.reportDefinition.title='changed'
    expect(entry().definition.name).not.toBe('changed')
    expect(entry().reportDefinition.title).not.toBe('changed')
  })
  it('freezes context/report content with stable content identity and separate freeze provenance',()=>{
    const a=freeze()
    const b=freezeBundleProductionDefinition(entry(),{frozenAt:'2026-09-23T00:00:00.000Z',sourceReference:'code:test'})
    expect(a.contentHash).toBe(b.contentHash)
    expect(a.freezeHash).not.toBe(b.freezeHash)
    expect(readFrozenBundleProductionDefinition(a)).toEqual(a)
    expect(a.contextDefinition?.fields[0].contextKey).toBe('subject_age_years')
  })
  it.each(['report','context','snapshot','source','extra'])('rejects tampered %s',part=>{
    const a:any=freeze()
    if(part==='report')a.reportDefinition.title='changed'
    if(part==='context')a.contextDefinition.fields[0].required=false
    if(part==='snapshot')a.bundleSnapshot.engine.version='9.0.0'
    if(part==='source')a.source.reference='changed'
    if(part==='extra')a.reportPackageKey='legacy-mixed'
    expect(()=>readFrozenBundleProductionDefinition(a)).toThrow()
  })
  it('checks exact report identity even if an attacker recomputes envelope hashes',()=>{
    const a=freeze();a.reportDefinition.version='9.0.0'
    const {frozenAt,source,freezeHash,contentHash,...content}=a
    const next={...content,frozenAt,source,contentHash:canonicalHash(content)}
    expect(()=>readFrozenBundleProductionDefinition({...next,freezeHash:canonicalHash(next)})).toThrow('BUNDLE_REPORT_DEFINITION_MISMATCH')
  })
  it('reads historical freeze without live status or catalog lookup',()=>{
    const a=freeze()
    const changed=entry();changed.definition.status='RETIRED';changed.reportDefinition.title='new live title'
    const retired=new BundleDefinitionProvider([changed])
    expect(retired.publicationBlockers(changed.definition.bundleKey,changed.definition.bundleVersion)).toContain('BUNDLE_NOT_PUBLISHED')
    expect(readFrozenBundleProductionDefinition(a).reportDefinition.title).toBe(a.reportDefinition.title)
  })
  it('blocks publication when age eligibility cannot be collected or Form identity differs',()=>{
    const withoutAge=entry();withoutAge.contextDefinition!.fields[0].required=false
    const ageProvider=new BundleDefinitionProvider([withoutAge])
    expect(ageProvider.publicationBlockers(withoutAge.definition.bundleKey,'1.0.0')).toContain('AGE_POPULATION_REQUIRES_DECLARED_CONTEXT')
    const wrongForm=entry();wrongForm.definition.slots.push({slotKey:'context',unitType:'FORM',position:2,required:true,instrumentKey:'wrong-context',instrumentVersion:'1.0.0',respondentType:'SELF'})
    const formProvider=new BundleDefinitionProvider([wrongForm])
    expect(formProvider.publicationBlockers(wrongForm.definition.bundleKey,'1.0.0')).toContain('FORM_SLOT_CONTEXT_IDENTITY_MISMATCH')
  })

})
