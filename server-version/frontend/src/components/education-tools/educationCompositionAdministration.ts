export type CompositionResponseMode='SELF'|'PARENT_REPORT'|'TEACHER_REPORT'
export type CompositionAdministration={population:'STUDENT';responseMode:CompositionResponseMode}|{population:'TEACHER';responseMode:'SELF'}

/** Fixed-version display metadata only; the server resolves task identities. */
export function compositionAdministrationForEntry(value:unknown,entry:'SCHOOL'|'TEACHER'):CompositionAdministration|null{
 if(!value||typeof value!=='object')return null
 const {population,responseMode}=value as Record<string,unknown>
 if(entry==='TEACHER')return population==='TEACHER'&&responseMode==='SELF'?{population,responseMode}:null
 return population==='STUDENT'&&(responseMode==='SELF'||responseMode==='PARENT_REPORT'||responseMode==='TEACHER_REPORT')?{population,responseMode}:null
}
export function compositionAdministrationLabel(value:CompositionAdministration|undefined){
 return !value?'作答方式不可读取':value.population==='TEACHER'?'教师自评':value.responseMode==='SELF'?'学生自评':value.responseMode==='PARENT_REPORT'?'家长观察学生':'教师观察学生'
}
