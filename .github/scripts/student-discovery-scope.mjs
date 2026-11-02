import {readFileSync} from 'node:fs';
export const studentDiscoveryChecks=JSON.parse(readFileSync(new URL('../config/student-discovery-checks.json',import.meta.url),'utf8'));
function outside(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);if(a<0||b<0)throw Error('Missing catalog boundary');return text.slice(0,a)+text.slice(b);}
// Reuse catalog CI only for the read projection and its opt-in consumers.
// Unknown files and edits outside the shared composite read surface retain normal CI.
export function studentDiscoveryScope(entries,readers={}){
 const {sources,tests,controls}=studentDiscoveryChecks;
 const allowed=new Set([...sources,...tests,...controls]);
 if(!entries.some(e=>sources.includes(e.file))||entries.some(e=>!allowed.has(e.file)||e.newMode!=='100644'||!(e.status==='M'&&e.oldMode==='100644'||e.status==='A'&&e.oldMode==='000000')))return false;
 if(!readers.readBaseFile||!readers.readHeadFile)return false;
 try{
  for(const file of sources.filter(f=>['server-version/backend/src/modules/composite/composite.service.ts','server-version/backend/src/modules/composite/composite.controller.ts','server-version/backend/src/services/studentTasks.ts'].includes(f))){
   const base=readers.readBaseFile(file),head=readers.readHeadFile(file);
   if(typeof base!=='string'||typeof head!=='string')return false;
   const normalize=text=>file==='server-version/backend/src/modules/composite/composite.service.ts'?outside(text,'export const listAvailableForStudent','\nconst assertStudentEligibility')
    :file==='server-version/backend/src/modules/composite/composite.controller.ts'?outside(text,'  async available(','\n  async startAttempt(')
    :text.replace('listAvailableForStudent(userId, now.getTime(), options.courseId, true)','listAvailableForStudent(userId, now.getTime(), options.courseId)');
   if(normalize(base)!==normalize(head))return false;
  }
  return true;
 }catch{return false;}
}
