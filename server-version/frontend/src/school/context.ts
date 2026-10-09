export const SCHOOL_HOST='school.eduk12.top'
// Exact host identity controls presentation only. Backend account-domain and
// organization permissions are authoritative, regardless of HTTP hostname.
export const isSchoolHost=(hostname=typeof window==='undefined'?'':window.location.hostname):boolean=>{
  const value=hostname.toLowerCase().replace(/\.$/,'')
  return value===SCHOOL_HOST || (import.meta.env.DEV && value==='school.localhost')
}
