import {randomUUID} from 'node:crypto'
import {createReportOutboxFixture as simple} from './fixture-simple'
const root=process.env.BENCH_SOURCE_ROOT!,imp=(p:string)=>import(root+'/'+p)
export async function prepareTraining(db:any,kind:string,request:any){
 if(kind!=='simple')throw new Error('Only simple synthetic fixture supported');const n=2,q=20;
 const f:any=await simple(db,n,q);
 const {generateToken}=await imp('src/utils/jwt.ts');const token=generateToken({userId:f.participant.id,role:'STUDENT',tokenVersion:f.participant.tokenVersion,accountDomain:f.participant.accountDomain});const csrf='synthetic-csrf-'+randomUUID();const headers={Cookie:'ptool_session='+token+'; ptool_csrf='+csrf,'x-csrf-token':csrf,Origin:'https://training.eduk12.top'};
 const base='/api/composite-assessments/attempts/'+f.parent.id;const delivery=await request('GET',base+'?view=current-unit',undefined,headers);check(delivery);
 const children=await db.assessment.findMany({where:{compositeAttemptId:f.parent.id},select:{id:true,compositeItemId:true}});
 const units:any[]=f.inputs.map((i:any)=>{const {userId,compositeAttemptId,assessmentId,...payload}=i;return{kind:'SCALE',path:base+'/items/'+children.find((x:any)=>x.id===assessmentId).compositeItemId+'/scale/submit',payload}});
 return{entry:'training',kind,n,q,base,headers,units,delivery,attemptId:f.parent.id}
}
export function check(r:any){if(r.status!==200||r.body.code!==0)throw new Error('HTTP request failed with status '+r.status)}
export async function verifyStored(db:any,f:any){const p=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attemptId}});const n=await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:f.attemptId}});if(p.status!=='COMPLETED'||n!==2)throw new Error('Durability mismatch');return {status:p.status,snapshots:n}}
