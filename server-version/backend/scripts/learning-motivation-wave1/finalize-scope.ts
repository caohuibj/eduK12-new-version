import { hashScaleDefinition } from '../../src/modules/scale/scale-definition'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scaleScientificReviewScopeHash } from '../../src/modules/scale/library/scientific-review-scope'
import type { ScaleInstrumentSourceV1 } from '../../src/modules/scale/onboarding/types'
const base=resolve('src/modules/scale/instruments')
for(const key of readdirSync(base).filter(k=>/^(academic_self_concept|domain_fixed_mindset|value_cost|tutoring_necessity|academic_self_efficacy|teacher_subject_liking)_/.test(k))){
 const file=resolve(base,key,'1.0.0/source.json');const source=JSON.parse(readFileSync(file,'utf8')) as ScaleInstrumentSourceV1
 for(const ref of source.executable!.references)for(const entry of ref.entries)entry.governance!.measurementHash=hashScaleDefinition(source.executable!.definition)
 if(source.scientificReview)source.scientificReview.scopeHash=scaleScientificReviewScopeHash(source)
 writeFileSync(file,JSON.stringify(source,null,2)+'\n')
}
