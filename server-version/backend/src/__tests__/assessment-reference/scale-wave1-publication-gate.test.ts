import { expect, it } from 'vitest'
import { validateScaleDefinition } from '../../modules/scale/scale-definition'
import { WHO5_ZH_CN_V1_PACKAGE } from '../../modules/scale/scale-package.registry'
it('applies the audience report gate to direct publication as well as onboarding',()=>{
 const d=structuredClone(WHO5_ZH_CN_V1_PACKAGE.definition)
 d.versionAxes={schemaVersion:1,subjectKey:'physics',locale:'zh-CN',localizationVersion:'1.0.0'}
 expect(validateScaleDefinition(d,{forPublish:true}).issues.some(i=>i.message==='AUDIENCE_LANGUAGE_QC_REQUIRED')).toBe(true)
 delete d.versionAxes
 expect(validateScaleDefinition(d,{forPublish:true}).issues.some(i=>i.message==='AUDIENCE_LANGUAGE_QC_REQUIRED')).toBe(false)
})
