/** Public qualification errors contain fixed diagnostics only; details stay private. */
export function publicFailure(error){
 const names=new Set(['Error','AssertionError','TypeError','RangeError','SyntaxError','AbortError','TimeoutError'])
 return {name:names.has(error?.name)?error.name:'Error',message:'Qualification phase failed; inspect its private error log.'}
}
export function publicRoute(route){
 return route.replace(/(\/public\/composite-assessments\/)(?!attempts\/)[^/?]+/,'$1[token]').replace(/\?.*$/,'')
}
export function publicPostgresFailure(error){
 return {category:'POSTGRES_TRANSACTION_REJECTED',code:/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:'UNKNOWN'}
}
