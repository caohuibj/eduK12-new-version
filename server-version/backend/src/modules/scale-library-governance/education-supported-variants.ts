import type {EducationLibraryProduct} from './contracts'

// Runtime support, not the full authoring vocabulary or an authorization grant.
// Keep approved declarations intact; unsupported pairs can be adapted later.
const supported:Readonly<Record<EducationLibraryProduct,readonly string[]>>={
 SCHOOL:['STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT'],
 TEACHER:['TEACHER:SELF'],
}
export function isSupportedEducationLibraryVariant(product:EducationLibraryProduct,variantKey:string):boolean{
 return supported[product].includes(variantKey)
}
