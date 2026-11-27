export type ToolLicenseEnrollment = {
 mode:'OFF'|'LEGACY'|'SCHEDULED'|'REQUIRED'
 effectiveAt:string|null
}

export const firstLicenseCutover='首次许可生效时，此对象开始按工具范围、期限及额度发布。加入后，期次到期或终止时须有有效许可才能继续发布。'

export function toolLicenseRolloutLabel(value:ToolLicenseEnrollment, formatTime:(value:string)=>string) {
 switch(value.mode){
  case 'OFF': return '本入口的商业发布校验已关闭'
  case 'LEGACY': return '尚未加入商业发布校验，按本入口原有权限发布'
  case 'SCHEDULED': return value.effectiveAt
    ? formatTime(value.effectiveAt)+' 起进入商业发布校验'
    : '待加入商业发布校验'
  case 'REQUIRED': return value.effectiveAt
    ? formatTime(value.effectiveAt)+' 起发布须有有效许可'
    : '发布须有有效许可'
 }
}
