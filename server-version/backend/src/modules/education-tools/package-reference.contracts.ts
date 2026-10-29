import {z} from 'zod'
import {educationApplicabilitySchema} from '../scale-library-governance/education-applicability'

const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/),version=z.string().regex(/^\d+\.\d+\.\d+$/).max(32)
export const educationPackageReferenceSchema=z.discriminatedUnion('provider',[
 z.object({provider:z.literal('NATIVE_RELEASE'),versionId:id,contentHash:hash}).strict(),
 z.object({provider:z.literal('CODE_BUNDLE'),bundleKey:z.string().regex(/^[a-z][a-z0-9_]*$/).max(100),bundleVersion:version,contentHash:hash}).strict(),
 z.object({provider:z.literal('GOVERNED_PACKAGE'),versionId:id,contentHash:hash}).strict(),
])
export type EducationPackageReference=z.infer<typeof educationPackageReferenceSchema>
export const educationPackageUseSchema=z.object({sourceRef:educationPackageReferenceSchema,grantId:id,grantVersion:z.number().int().positive()}).strict()
export type EducationPackageUse=z.infer<typeof educationPackageUseSchema>
/** One exact whole source. This protocol has no editable items, overrides,
 * flow, parameters, report, leaf selection or additional package fields. */
export const educationPackageSelectionSchema=z.object({sourceRef:educationPackageReferenceSchema}).strict()
export const educationPackageKey=(source:EducationPackageReference)=>'education-package:'+source.provider+':'+
 (source.provider==='CODE_BUNDLE'?source.bundleKey+'@'+source.bundleVersion:source.versionId)+':'+source.contentHash
export function parseEducationPackageKey(key:string):EducationPackageReference|null{
 const [prefix,provider,source,contentHash,...extra]=key.split(':')
 if(prefix!=='education-package'||extra.length||key.length>240)return null
 const [bundleKey,bundleVersion,...trailing]=source?.split('@')??[]
 if(provider==='CODE_BUNDLE'&&trailing.length)return null
 const parsed=educationPackageReferenceSchema.safeParse(provider==='CODE_BUNDLE'?{provider,bundleKey,bundleVersion,contentHash}:{provider,versionId:source,contentHash})
 return parsed.success?parsed.data:null
}
export function supportsGovernedPackageSelf(raw:unknown,entry:'SCHOOL'|'TEACHER'){
 const declaration=educationApplicabilitySchema.safeParse(raw),population=entry==='SCHOOL'?'STUDENT':'TEACHER'
 return declaration.success&&declaration.data.administrations.some(a=>a.population===population&&a.responseMode==='SELF')
}
