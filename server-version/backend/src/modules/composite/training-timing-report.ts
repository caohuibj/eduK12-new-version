import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {projectTrainingTimingFact} from '../assessment-runtime/training-scale-timing'
/** Timing is added only AFTER cached scientific report projection. Fresh permission
 * is read every time; cached bytes never contain a timing authorization decision. */
export async function withTrainingTimingReport(report:Record<string,any>,parent:{id:string;trainingTimingSnapshot?:unknown;compositeAssessment:{productKind?:string;timingExportEnabled?:boolean;revision?:number}},audience:string){
 if(!['teacher','researcher'].includes(audience)||parent.compositeAssessment.productKind!=='QUESTIONNAIRE'||!parent.compositeAssessment.timingExportEnabled)return report
 // Current permission is supplied by the mandatory fresh owner/header read,
 // never from the cached report. Disabled/legacy/participant paths add no query.
 const children=parent.trainingTimingSnapshot?await prisma.assessment.findMany({where:{compositeAttemptId:parent.id},select:{compositeItemId:true,timingEncrypted:true}}):[]
 const byId=new Map(children.map(child=>[child.compositeItemId,projectTrainingTimingFact(parent.trainingTimingSnapshot,child.timingEncrypted?decryptUnifiedRuntimePayload(child.timingEncrypted):null)]))
 return {...report,timingPolicyFingerprint:canonicalHash({enabled:true,revision:parent.compositeAssessment.revision??0,snapshot:parent.trainingTimingSnapshot??null}),unitReports:(report.unitReports??[]).map((unit:any)=>unit.type==='SCALE'?{...unit,trainingTiming:byId.get(unit.itemId)??projectTrainingTimingFact(parent.trainingTimingSnapshot,null)}:unit)}
}
