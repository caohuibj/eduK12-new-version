import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload,encryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {personalTrackingPlanSchema,projectPersonalChanges,type PersonalChanges} from '../reporting/personal-tracking'
import {hashResearchCredential} from './identity.service'
import {SurveyWaveError} from './waves.service'
import {surveyPersonalLeaf} from './personal-tracking'
import type {ResearchFrozenPublication} from './publication.service'
import type {SurveyComputedFinal} from './final.compute'

const unavailable=():never=>{throw new SurveyWaveError(403,'本人变化报告不可访问')}
type Proof={publicId:string;attemptId:string;researchCode?:string;accessCredential:string}
/** On-demand only. Current bearer, participant status, completed parent and
 * consent are checked for every read, including previously generated snapshots.
 * No per-answer or FINAL aggregation and no reference/norm resolution. */
export async function readSurveyPersonalChanges(input:Proof){
  if(process.env.SURVEY_WORKSPACE_ENABLED!=='true'||process.env.SURVEY_PUBLICATION_ENABLED!=='true')unavailable()
  return prisma.$transaction(async tx=>{
    const projects=await tx.$queryRaw<Array<{id:string;plan:Prisma.JsonValue|null}>>`
      SELECT id,longitudinal_plan AS plan FROM survey_projects
      WHERE public_id=${input.publicId} AND collection_mode='LINKED_WAVES' FOR SHARE`
    const project=projects[0]
    if(!project||!input.researchCode)unavailable()
    // UPDATE lock serializes append-only snapshot writes with withdrawal and
    // credential revocation. It is not an authority cache.
    const people=await tx.$queryRaw<Array<{id:string}>>`
      SELECT id FROM survey_participants WHERE project_id=${project!.id}
        AND research_code=${input.researchCode!} AND credential_hash=${hashResearchCredential(input.accessCredential)}
        AND status='ACTIVE' AND credential_revoked_at IS NULL FOR UPDATE`
    const person=people[0]
    if(!person)unavailable()
    const end=await tx.surveyWaveAttempt.findFirst({where:{id:input.attemptId,projectId:project!.id,
      participantId:person!.id,status:'COMPLETED',excludedAt:null},include:{wave:true,final:true}})
    if(!end?.final)unavailable()
    if(!project!.plan)return {status:'NOT_CONFIGURED' as const}
    const plan=personalTrackingPlanSchema.parse(project!.plan)
    const waves=await tx.surveyWave.findMany({where:{projectId:project!.id,ordinal:{lte:end!.wave.ordinal}},
      orderBy:{ordinal:'asc'},take:100,include:{publication:true,finals:{
        where:{attempt:{participantId:person!.id,status:'COMPLETED',excludedAt:null}},
        orderBy:[{completedAt:'desc'},{id:'desc'}],take:1,include:{attempt:{include:{consents:true}}}}}})
    const baseline=waves.find(w=>w.id===plan.baselineWaveId)
    if(!baseline)unavailable()
    const tracked=waves.filter(w=>w.ordinal>=baseline!.ordinal)
    if(tracked.some(w=>w.publication&&(w.publication.compiledSnapshot as unknown as ResearchFrozenPublication).longitudinal?.planId!==plan.id))unavailable()
    if(!tracked.some(w=>w.id===plan.baselineWaveId)||!tracked.some(w=>w.id===end!.waveId))unavailable()
    const now=new Date()
    const sources=tracked.map(wave=>{
      const publication=wave.publication
      if(!publication)return {wave,snapshot:null,final:undefined,closed:false}
      const snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication
      if(snapshot.projectId!==project!.id||snapshot.waveId!==wave.id||canonicalHash(snapshot)!==publication.definitionDigest)unavailable()
      const final=wave.finals[0]
      if(final&&(final.publicationId!==publication.id||final.definitionDigest!==publication.definitionDigest||
        !final.attempt.consents.some(c=>c.accepted&&c.consentVersion===wave.consentVersion&&c.projectId===project!.id&&c.waveId===wave.id)))unavailable()
      const endAt=wave.finishUntil??wave.closesAt
      return {wave,snapshot,final,closed:wave.hardStopAt!==null||(endAt!==null&&endAt<=now)}
    })
    // Source identity includes missing waves, the selected complete parent and
    // its exact publication/disclosure. Future T3 never rewrites a T1–T2 view.
    const sourceHash=canonicalHash({kind:'SURVEY_PERSONAL_CHANGES_V2',plan,subjectId:person!.id,
      sources:sources.map(s=>({waveId:s.wave.id,ordinal:s.wave.ordinal,digest:s.wave.publication?.definitionDigest??null,
        finalId:s.final?.id??null,resultHash:s.final?.resultsHash??null,completedAt:s.final?.completedAt.toISOString()??null,closed:s.closed}))})
    const [cached]=await tx.$queryRaw<Array<{cipher:string|null}>>`
      SELECT longitudinal_snapshots->>${sourceHash} AS cipher FROM survey_participants WHERE id=${person!.id}`
    if(cached?.cipher){
      const saved=decryptUnifiedRuntimePayload<{sourceHash:string;generatedAt:string;report:PersonalChanges}>(cached.cipher)
      if(saved.sourceHash!==sourceHash)unavailable()
      return {reportId:sourceHash,generatedAt:saved.generatedAt,...saved.report}
    }
    const leaves=sources.flatMap(({wave,snapshot,final,closed})=>{
      if(!final||!snapshot)return []
      const result=decryptUnifiedRuntimePayload<SurveyComputedFinal>(final.resultsCipher)
      if(canonicalHash(result)!==final.resultsHash||result.definitionDigest!==final.definitionDigest)unavailable()
      return [surveyPersonalLeaf({scopedSubjectId:person!.id,waveId:wave.id,ordinal:wave.ordinal,attemptId:final.attemptId,
        resultId:final.id,sourceHash:final.resultsHash,completedAt:final.completedAt.toISOString(),snapshot,result,collectionClosed:closed})]
    })
    const report=projectPersonalChanges(plan,tracked.map(w=>({id:w.id,ordinal:w.ordinal})),leaves)
    if(report.status!=='AVAILABLE')return report
    const generatedAt=now.toISOString(),cipher=encryptUnifiedRuntimePayload({sourceHash,generatedAt,report})
    // Append a compact encrypted projection to existing participant storage.
    // Immutable FINALs and existing reports are never updated or duplicated.
    await tx.$executeRaw`UPDATE survey_participants SET longitudinal_snapshots=
      longitudinal_snapshots||jsonb_build_object(${sourceHash},${cipher}) WHERE id=${person!.id}`
    return {reportId:sourceHash,generatedAt,...report}
  })
}
