export type ExpertTargetKind='PERSON'|'TEAM'|'ORGANIZATION'|'ACTIVITY'|'ARTIFACT'|'PROJECT'
export type CompositionResponseMode='SELF'|'PARENT_REPORT'|'TEACHER_REPORT'|'STUDENT_REPORT'|'EXPERT_REPORT'
export type CompositionAdministration={population:'STUDENT';responseMode:'SELF'|'PARENT_REPORT'|'TEACHER_REPORT'}|{population:'TEACHER';responseMode:'SELF'|'STUDENT_REPORT'}|
 {population:'TEACHER';responseMode:'EXPERT_REPORT';targetKind:ExpertTargetKind}

/** Fixed-version display metadata only; the server resolves task identities. */
export function compositionAdministrationForEntry(value:unknown,entry:'SCHOOL'|'TEACHER'):CompositionAdministration|null{
 if(!value||typeof value!=='object')return null
 const {population,responseMode,targetKind}=value as Record<string,unknown>
 if(entry==='TEACHER'&&population==='TEACHER'&&responseMode==='EXPERT_REPORT')return typeof targetKind==='string'&&['PERSON','TEAM','ORGANIZATION','ACTIVITY','ARTIFACT','PROJECT'].includes(targetKind)
  ?{population,responseMode,targetKind:targetKind as ExpertTargetKind}:null
 if(entry==='TEACHER')return population==='TEACHER'&&(responseMode==='SELF'||responseMode==='STUDENT_REPORT')?{population,responseMode}:null
 return population==='STUDENT'&&(responseMode==='SELF'||responseMode==='PARENT_REPORT'||responseMode==='TEACHER_REPORT')?{population,responseMode}:null
}
export function compositionAdministrationLabel(value:CompositionAdministration|undefined){
 return !value?'作答方式不可读取':value.population==='TEACHER'?(value.responseMode==='EXPERT_REPORT'?'受邀专家观察 · '+value.targetKind:value.responseMode==='STUDENT_REPORT'?'学生评价教师':'教师自评'):value.responseMode==='SELF'?'学生自评':value.responseMode==='PARENT_REPORT'?'家长观察学生':'教师观察学生'
}
