import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readCompositeFinalRaw} from '../assessment-runtime/composite-final.reader'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {projectTrainingTimingFact} from '../assessment-runtime/training-scale-timing'
/** Timing is added only AFTER cached scientific report projection. Fresh permission
 * is read every time; cached bytes never contain a timing authorization decision. */
export async function withTrainingTimingReport(report:Record<string,any>,parent:{id:string;attemptEpoch?:number;publicationHash?:string|null;trainingTimingSnapshot?:unknown;compositeAssessment:{productKind?:string;timingExportEnabled?:boolean;revision?:number}},audience:string,preloaded?:{attemptEpoch:number;children:Array<{compositeAttemptId:string|null;compositeItemId:string|null;attemptEpoch:number;timingEncrypted?:string|null}>}){
 if(!['teacher','researcher'].includes(audience)||parent.compositeAssessment.productKind!=='QUESTIONNAIRE'||!parent.compositeAssessment.timingExportEnabled)return report
 // Current permission is supplied by the mandatory fresh owner/header read,
 // never from the cached report. Disabled/legacy/participant paths add no query.
 if(preloaded?.children.some(child=>child.compositeAttemptId!==parent.id||child.attemptEpoch!==preloaded.attemptEpoch))throw new Error('Timing report batch source binding mismatch')
 const byId=new Map<string|null,ReturnType<typeof projectTrainingTimingFact>>()
 if(parent.trainingTimingSnapshot&&parent.publicationHash){
  const loadedRaw=await readCompositeFinalRaw(prisma,{attemptId:parent.id,attemptEpoch:parent.attemptEpoch??preloaded?.attemptEpoch??1})
  if(loadedRaw){
   for(const unit of Object.values(loadedRaw.raw.units)){
    if(unit.unitType!=='SCALE')continue
    byId.set(unit.itemId,projectTrainingTimingFact(parent.trainingTimingSnapshot,unit.trainingTimingFact??null))
   }
  }
 }else{
  const children=parent.trainingTimingSnapshot?(preloaded?.children??await prisma.assessment.findMany({where:{compositeAttemptId:parent.id},select:{compositeItemId:true,timingEncrypted:true}})):[]
  for(const child of children){
   byId.set(child.compositeItemId,projectTrainingTimingFact(parent.trainingTimingSnapshot,child.timingEncrypted?decryptUnifiedRuntimePayload(child.timingEncrypted):null))
  }
 }
 return {...report,timingPolicyFingerprint:canonicalHash({enabled:true,revision:parent.compositeAssessment.revision??0,snapshot:parent.trainingTimingSnapshot??null}),unitReports:(report.unitReports??[]).map((unit:any)=>unit.type==='SCALE'?{...unit,trainingTiming:byId.get(unit.itemId)??projectTrainingTimingFact(parent.trainingTimingSnapshot,null)}:unit)}
}
