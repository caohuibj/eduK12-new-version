import React from 'react';import{createRoot}from'react-dom/client';import{EducationPackageLibrary}from'../src/components/education-tools/EducationPackageLibrary';import{EducationAssessmentResourcePicker}from'../src/components/education-tools/EducationAssessmentResourcePicker';
const api=async(path:string,method='GET',data?:unknown)=>{const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const body=await r.json();if(!r.ok)throw Object.assign(Error(body.message),{status:r.status});return body.data};
async function mount(){const c=await api('/fixture-config');const adapter={list:()=>api('/task-resources'),addTrack:async()=>{throw Error('Not part of this connection probe')}};
createRoot(document.getElementById('root')!).render(<><EducationPackageLibrary api={api} organizationId={c.organizationId} actorId={c.actorId} entry="SCHOOL"/><EducationAssessmentResourcePicker scope={c.scope} adapter={adapter} disabled={false} onBusy={()=>{}} onRefresh={async()=>{}}/></>);

}void mount();
