export const schoolSearchText=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('zh-CN')
export const schoolDeadline=(value:string|null)=>{const parsed=value?Date.parse(value):NaN;return Number.isFinite(parsed)?parsed:Number.POSITIVE_INFINITY}
