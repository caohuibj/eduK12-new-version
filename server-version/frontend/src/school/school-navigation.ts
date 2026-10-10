import { BookOpen, CalendarDays, ChartNoAxesCombined, ClipboardList, HeartHandshake, House, School, ShieldCheck, Users, type LucideIcon } from 'lucide-react'

export type SchoolAccess={orgRole:string|null;canGovern:boolean;personas:string[];capabilities:string[];explicitDenies:string[]}
export type SchoolNavigationItem={id:string;label:string;group:string;description:string;icon:LucideIcon}
export const workspacePath=(id:string)=>id==='overview'?'/workspace':`/workspace/${id}`
export const workspaceHref=(id:string)=>{const source=new URLSearchParams(window.location.search);const query=new URLSearchParams();for(const name of ['organizationId','classUnitId']){const value=source.get(name);if(value)query.set(name,value)}return workspacePath(id)+(query.size?'?'+query.toString():'')}
export const workspacePage=(path:string)=>path==='/workspace'||path==='/'?'overview':path.startsWith('/workspace/')?path.slice('/workspace/'.length):'overview'

/** Presentation only: mounted features retain their existing API and capability gates. */
export function schoolNavigation(role:string,status:string,access:SchoolAccess|null,parentReports:boolean):SchoolNavigationItem[]{
 const items:SchoolNavigationItem[]=[{id:'overview',label:'校园概览',group:'校园空间',description:'从这里进入你的校园功能。',icon:House}]
 const add=(id:string,label:string,group:string,description:string,icon:LucideIcon)=>items.push({id,label,group,description,icon})
 const admin=access?.orgRole==='ORG_ADMIN'&&access.canGovern===true
 const psych=!!access?.personas.includes('COUNSELOR')&&!!access.capabilities.includes('PSYCHOLOGY_STAFF')&&!access.explicitDenies.some(x=>['*','PSYCHOLOGY_STAFF','CLASS_APPROVE','ORGANIZATION_GOVERNANCE'].includes(x))
 const denied=(names:string[])=>!!access?.explicitDenies.some(x=>names.includes(x))
 if(role==='STUDENT'&&status==='APPROVED'){
  add('tasks','我的校园任务','活动与反馈','查看学校安排的活动，按自己的节奏参与。',CalendarDays)
  add('feedback','我的反馈','活动与反馈','查看向你开放的校园反馈。',BookOpen)
  add('family','亲子关联','关系与授权','确认家长关联，了解每一份授权。',HeartHandshake)
  add('peer','同伴授权','关系与授权','管理同伴观察的参与授权。',Users)
  if(parentReports)add('sharing','家长报告授权','关系与授权','独立管理向家长分享报告的授权。',ShieldCheck)
 }else if(role==='PARENT'){
  add('tasks','我的观察任务','家校陪伴','完成学校安排的家长观察任务。',ClipboardList)
  add('family','亲子关联','家校陪伴','建立并查看经过孩子确认的亲子关系。',HeartHandshake)
  add('peer','参与授权','家校陪伴','查看和管理家校观察的参与授权。',Users)
  if(parentReports)add('parent-reports','家长报告','家校陪伴','查看经过独立批准并向你披露的报告。',BookOpen)
 }else if(role==='TEACHER'||role==='ADMIN'){
  if(access){
   if(access.personas.includes('TEACHER'))add('tasks','学生观察任务','校园活动','查看你的教师观察任务。',ClipboardList)
   add('activities','活动管理','校园活动','查看校园活动、任务与参与安排。',CalendarDays)
   add('classes','学校与班级','学校管理','查看学校和班级；管理员可维护年级与班级。',School)
   if(admin||psych){
    add('admission','班级注册与审批','学校管理','处理注册进度、名册与班级审批。',ClipboardList)
    add('recovery','学生账号恢复','学校管理','依照既有流程协助学生恢复校园账号。',ShieldCheck)
   }
   if(admin){
    add('relationships','校园关系','学校管理','维护任教、班级和家校关系。',Users)
    add('staff','人员邀请','学校管理','分别配置教师、心理教师与管理权限。',Users)
   }
   if((admin||psych)&&!denied(['*','REPORT_READ','ORG_GROUP_REPORT_V1'])){
    add('group-reports','群体报告','报告与支持','查看学校授权范围内的群体报告。',ChartNoAxesCombined)
    add('group-trends','群体纵向分析','报告与支持','按时间查看群体变化。',ChartNoAxesCombined)
   }
   if(psych){
    if(!denied(['*','PSYCHOLOGY_STAFF','REPORT_READ','ORG_PROTECTED_FEEDBACK_V1']))add('protected-reports','保护性反馈','报告与支持','查看经过专业审核的保护性反馈。',BookOpen)
    if(!denied(['*','PSYCHOLOGY_STAFF','REPORT_READ','ORG_INDIVIDUAL_REPORT_V1']))add('individual-trends','个体纵向分析','报告与支持','在授权范围内查看个体变化。',ChartNoAxesCombined)
    add('professional-reports','专业报告','报告与支持','处理心理专业报告和解读。',BookOpen)
    if(parentReports&&access.capabilities.includes('PARENT_REPORT_DISCLOSURE')&&!denied(['*','REPORT_READ','PARENT_REPORT_DISCLOSURE']))add('report-review','家长报告审核','报告与支持','独立审核向家长披露的报告。',ShieldCheck)
   }
   if(parentReports&&admin)add('report-officers','披露人员授权','学校管理','单独管理家长报告披露人员。',ShieldCheck)
  }
 }
 add('account','我的账号','账号','查看校园账号与安全验证。',ShieldCheck)
 return items
}
