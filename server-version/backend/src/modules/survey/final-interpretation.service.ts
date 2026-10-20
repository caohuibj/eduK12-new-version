import {projectStoredMeasurement} from '../assessment-runtime/measurement-result'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {decodeSurveyAttemptContentBinding,type SurveyAttemptContentBinding} from './content-binding.service'
import type {ResearchFrozenPublication} from './publication.service'
import type {SurveyComputedFinal} from './final.compute'
import {SurveyWaveError} from './waves.service'

import {interpretContentBinding,FinalInterpretationIdentityError,type FinalInterpretation,type InterpretationFacts} from '../measurement-content/final-interpretation'
export type {ReferenceInterpretation as SurveyReferenceInterpretation,FinalInterpretation as SurveyFinalInterpretation} from '../measurement-content/final-interpretation'
type SurveyFinalInterpretation=FinalInterpretation
const fail=():never=>{throw new SurveyWaveError(409,'研究解释的冻结版本身份不一致')}
/** Called only in the authorized FINAL transaction, after the one authoritative
 * score computation. Stores personal numeric outcomes, not reference definitions
 * or report prose. Historical reads use this result and never call the selector.
 */
export async function interpretSurveyFinal(tx:Prisma.TransactionClient,input:{projectId:string;waveId:string;attemptId:string;
  publicationId:string;definitionDigest:string;selectedSnapshot:ResearchFrozenPublication;calculated:SurveyComputedFinal}):Promise<SurveyFinalInterpretation|undefined>{
  if(!input.selectedSnapshot.units.some(unit=>unit.measurementRelease))return undefined
  const rows=await tx.$queryRaw<Array<{cipher:string|null;hash:string|null;owner_id:string}>>(Prisma.sql`
    SELECT a.content_binding_cipher AS cipher,a.content_binding_hash AS hash,p.owner_user_id AS owner_id
    FROM survey_wave_attempts a JOIN survey_projects p ON p.id=a.project_id
    WHERE a.id=${input.attemptId} AND a.project_id=${input.projectId} AND a.wave_id=${input.waveId} FOR SHARE OF a,p`)
  if(rows.length!==1)fail()
  const row=rows[0],binding=decodeSurveyAttemptContentBinding({...input,contentBindingCipher:row.cipher,contentBindingHash:row.hash})
  if(!binding)return undefined // Explicit legacy behavior; never infer new interpretation identity.
  return interpretSurveyContentBinding(tx,{binding,ownerId:row.owner_id,readFacts:(unit,measurement)=>{
    const result=input.calculated.units.find(r=>r.instrumentKey===unit.instrumentKey)
    const frozen=input.selectedSnapshot.units.find(r=>r.instrumentKey===unit.instrumentKey)
    if(!result||!frozen||result.sourceDigest!==frozen.sourceDigest||result.scoringDigest!==frozen.scoringDigest
      ||measurement.family!==result.kind)fail()
    const facts=result!.measurement??(result!.privateScoring?projectStoredMeasurement({
      identity:{schemaVersion:1,kind:measurement.family,sourceDigest:result!.sourceDigest,scoringDigest:result!.scoringDigest,
        engineVersion:measurement.content.runnerVersion,scoringVersion:measurement.content.scoringVersion,protocolDigest:null},
      storedResult:result!.privateScoring,metricUnits:Object.fromEntries(measurement.content.metrics.map(m=>[m.metricKey,m.unit]))}):undefined)
    return {notExecuted:Boolean(result!.notExecuted),quality: facts?.quality.status,
      metrics:facts?.metrics.map(metric=>({key:metric.key,value:typeof metric.value==='number'?metric.value:null,status:metric.status}))??[]}
  }})
}
export type SurveyInterpretationFacts=InterpretationFacts
/** Internal shared interpreter. Callers supply only verified authoritative FINAL
 * projections after their entry/data authorization; never bind this input to HTTP.
 * FINAL and an explicit new interpretation use the same ReferenceCore once.
 */
export async function interpretSurveyContentBinding(tx:Prisma.TransactionClient,input:{
  binding:SurveyAttemptContentBinding;ownerId:string;releases?:Map<string,StoredRelease>;
  readFacts:(unit:SurveyAttemptContentBinding['units'][number],measurement:Extract<StoredRelease,{layer:'MEASUREMENT'}>)=>SurveyInterpretationFacts
}):Promise<SurveyFinalInterpretation>{
  const {binding}=input
  const cache=input.releases??new Map<string,StoredRelease>()
  const read=async(id:string,hash:string)=>{
    let release=cache.get(id)
    if(!release){release=(await getContentRelease(tx,id,true))??undefined;if(release)cache.set(id,release)}
    if(!release||release.contentHash!==hash||release.scope.kind!=='PRIVATE'||release.scope.product!=='SURVEY'
      ||release.scope.ownerId!==input.ownerId||release.scope.resourceId!==binding.projectId)fail()
    return release!
  }
  try {
    return await interpretContentBinding({binding,contentBindingHash:canonicalHash(binding),readRelease:read,readFacts:input.readFacts})
  } catch(error) {
    if(error instanceof FinalInterpretationIdentityError)fail()
    throw error
  }
}
