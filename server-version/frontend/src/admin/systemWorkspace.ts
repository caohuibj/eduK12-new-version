export const SYSTEM_HOME='/admin/system'
export const SYSTEM_SURVEY_AUDIT='/admin/system/survey-audit'
const systemPages=[SYSTEM_HOME,SYSTEM_SURVEY_AUDIT,'/admin/permissions','/admin/reporting-content','/admin/entrances','/admin/scale-library-governance','/admin/instrument-authorizations','/admin/survey-system']
export function isSystemLoginTarget(target:string|null){
 if(!target?.startsWith('/')||target.startsWith('//'))return false
 return systemPages.includes(target.split(/[?#]/)[0])
}
/** Presentation only; AdminAccess and current backend authority remain mandatory. */
export const isSystemWorkspacePath=(path:string)=>systemPages.includes(path)||path==='/admin/survey-researchers'
