import type {Prisma} from '@prisma/client'
import type {ResearchFrozenPublication} from './publication.service'
import type {FrozenUnitResult,SurveyComputedFinal} from './final.compute'
import type {SurveyCognitiveReference} from './cognitive.definition'
import {SURVEY_NATIVE_SJT_PROTOCOL,type SurveySituationalReceiptReference} from './situational-native.contract'
import {verifySurveyCognitiveReferences,loadSurveyCognitiveResults,assertSurveyCognitiveLockedAnswers} from './cognitive.results'
import {loadSurveySituationalResults} from './situational-native.results'
import {cognitiveParentUnit} from './measurement.result'
/** Caller holds the fresh authorized parent lock. Both FINAL and SCREEN_OUT
 * consume the same original child facts; this does not create a second result. */
export async function loadSurveyTaskReceipts(tx:Prisma.TransactionClient,scope:{
  projectId:string;waveId:string;attemptId:string;publicationId:string;snapshot:ResearchFrozenPublication
},input:{answers:Record<string,unknown>;cognitiveReferences?:SurveyCognitiveReference[];
  situationalReferences?:SurveySituationalReceiptReference[]}){
  const {snapshot}=scope
  if(snapshot.units.some(unit=>unit.kind==='COGNITIVE'||unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL))
    await assertSurveyCognitiveLockedAnswers(tx,scope.attemptId,input.answers)
  const cognitiveResults=new Map<string,FrozenUnitResult>()
  const cognitive:SurveyCognitiveReference[]=[]
  if(snapshot.units.some(unit=>unit.kind==='COGNITIVE')||input.cognitiveReferences?.length){
    const references=await verifySurveyCognitiveReferences(tx,{...scope,references:input.cognitiveReferences??[]})
    const results=await loadSurveyCognitiveResults(tx,{...scope,references})
    for(const loaded of results){
      const unit=snapshot.units.find(unit=>unit.instrumentKey===loaded.reference.slotKey)!
      cognitiveResults.set(unit.instrumentKey,cognitiveParentUnit(unit,loaded))
      cognitive.push(loaded.reference)
    }
  }
  const nativeSituationalResults=new Map<string,FrozenUnitResult>()
  const situational:SurveySituationalReceiptReference[]=[]
  if(snapshot.units.some(unit=>unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL)||input.situationalReferences?.length){
    const results=await loadSurveySituationalResults(tx,{surveyAttemptId:scope.attemptId,
      surveyPublicationId:scope.publicationId,snapshot,references:input.situationalReferences??[]})
    for(const loaded of results){nativeSituationalResults.set(loaded.slotKey,loaded.unitResult);situational.push(loaded.reference)}
  }
  return {cognitiveResults,nativeSituationalResults,acceptedTaskReferences:{cognitive,situational}}
}
export function assertSurveyReachedTaskReceipts(result:SurveyComputedFinal,
  receipts:Awaited<ReturnType<typeof loadSurveyTaskReceipts>>,fail:(message:string)=>never){
  const cognitive=result.units.filter(unit=>unit.kind==='COGNITIVE'&&!unit.notExecuted)
  if(cognitive.length!==receipts.cognitiveResults.size||cognitive.some(unit=>!receipts.cognitiveResults.has(unit.instrumentKey)))
    fail('认知结果引用集合与最终可达路径不一致')
  const situational=result.units.filter(unit=>unit.nativeReference&&!unit.notExecuted)
  if(situational.length!==receipts.nativeSituationalResults.size||situational.some(unit=>!receipts.nativeSituationalResults.has(unit.instrumentKey)))
    fail('情境化结果引用集合与最终路径不一致')
}
