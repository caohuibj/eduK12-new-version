export const HUITEACHER_HOST='teacher.eduk12.top'

// Presentation-only host selection. The backend is authoritative for session,
// education-school entitlement, product grants and assessment/report scope.
export const isHuiteacherHost=(
  hostname=typeof window==='undefined'?'':window.location.hostname,
):boolean=>{
  const normalized=hostname.toLowerCase().replace(/\.$/,'')
  return normalized===HUITEACHER_HOST
    || (import.meta.env.DEV && normalized==='teacher.localhost')
}
