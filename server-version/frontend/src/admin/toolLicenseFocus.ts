export const products={SCHOOL:'School',TEACHER:'Teacher',TRAINING:'Training',SURVEY:'Survey'} as const
export type Product=keyof typeof products
export type ToolLicenseFocus={product?:Product;toolKey?:string;subjectId?:string}

export function readToolLicenseFocus(params:URLSearchParams):ToolLicenseFocus{
 const entry=params.get('product'),key=params.get('toolKey')
 const subjectId=params.get('subjectId')
 const valid=key&&key.length<=300&&/^(SCALE|FORM|COGNITIVE|SJT|COMBINATION|BUNDLE):.+$/u.test(key)
  &&Array.from(key).every(char=>char.charCodeAt(0)>32&&char.charCodeAt(0)!==127)
 return {
  product:entry&&Object.prototype.hasOwnProperty.call(products,entry)?entry as Product:undefined,
  toolKey:valid?key:undefined,
  subjectId:subjectId&&/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(subjectId)?subjectId:undefined,
 }
}

export function toolLicenseReviewPath(product:Product,subjectId:string,toolKey:string){
 return '/admin/permissions?'+new URLSearchParams({view:'tools',product,subjectId,toolKey})
}

export function toolLicenseReviewReturnTo(path:string,search:string){
 if(path!=='/admin/permissions')return null
 const params=new URLSearchParams(search)
 if(params.get('view')!=='tools')return null
 const {product,subjectId,toolKey}=readToolLicenseFocus(params)
 return product&&subjectId&&toolKey?toolLicenseReviewPath(product,subjectId,toolKey):null
}
