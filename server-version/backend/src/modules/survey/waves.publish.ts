import { randomBytes,randomUUID,createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { freezeResearchWaveDraft, type ResearchFrozenPublication } from './publication.service'
import { SurveyWaveError } from './waves.service'

type Tx=Prisma.TransactionClient
const token=()=>randomBytes(32).toString('base64url')
const hash=(x:string)=>createHash('sha256').update(x).digest('hex')
const fail=(message:string):never=>{throw new SurveyWaveError(409,message)}
const enabled=()=>{if(process.env.SURVEY_PUBLICATION_ENABLED!=='true')
  fail('研究专用公开发布仍未完成正式验收，暂不可使用')}
async function lockOwner(tx:Tx,userId:string,projectId:string){
  const rows=await tx.$queryRaw<Array<{id:string;status:string;publicId:string|null}>>`
    SELECT p.id,p.status,p.public_id AS "publicId" FROM survey_projects p
    JOIN users u ON u.id=p.owner_user_id
    JOIN survey_researcher_grants g ON g.user_id=u.id
    JOIN survey_mfa_credentials m ON m.user_id=u.id
    WHERE p.id=${projectId} AND p.owner_user_id=${userId}
      AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled
    FOR UPDATE OF p
  `
  if(!rows.length)fail('研究项目不存在或当前研究者资格无效')
  return rows[0]
}
async function lockWave(tx:Tx,projectId:string,waveId:string) {
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT id FROM survey_waves WHERE id=${waveId} AND project_id=${projectId} FOR UPDATE
  `
  if(!rows.length)fail('研究波次不存在')
  return tx.surveyWave.findUniqueOrThrow({where:{id:waveId}})
}
function assertRuntime(publication:{compiledSnapshot:Prisma.JsonValue;definitionDigest:string}){
  if(canonicalHash(JSON.parse(JSON.stringify(publication.compiledSnapshot)))!==publication.definitionDigest)
    fail('冻结研究内容来源不完整')
  const snapshot=publication.compiledSnapshot as unknown as ResearchFrozenPublication
  if(snapshot.schemaVersion!==1||snapshot.purpose!=='RESEARCH_ONLY'||
    snapshot.runtimeStatus!=='SURVEY_FINAL_V1'||!snapshot.units.length)
    fail('此研究版本未具备已验证的 Survey FINAL 执行定义')
  return snapshot
}
export async function prepareWave(userId:string,projectId:string,waveId:string,revision:number){
  enabled()
  return freezeResearchWaveDraft({actorUserId:userId,projectId,waveId,revision})
}
export async function openWave(userId:string,projectId:string,waveId:string,revision:number){
  enabled()
  const entrySecret=token()
  return prisma.$transaction(async tx=>{
    const project=await lockOwner(tx,userId,projectId)
    if(!['DRAFT','ACTIVE'].includes(project.status))fail('项目尚不能开放新采集')
    const wave=await lockWave(tx,projectId,waveId)
    if(wave.status!=='DRAFT'||!wave.publicationId||wave.revision!==revision)
      fail('波次没有冻结的研究内容，或草稿已变化')
    const publication=await tx.surveyPublication.findFirst({
      where:{id:wave.publicationId,projectId},
    })
    if(!publication)fail('冻结发布定义缺失')
    assertRuntime(publication)
    const now=new Date()
    const open=wave.opensAt||now,close=wave.closesAt||new Date(now.getTime()+30*86400000)
    if(close<=now||close<=open)fail('波次采集时间窗无效')
    if(close.getTime()-now.getTime()>365*86400000)fail('单次公开链接不允许超过一年')
    const publicId=project.publicId||randomUUID()
    const expiresAt=close
    await tx.surveyEntryToken.create({data:{
      id:randomUUID(),projectId,waveId,tokenHash:hash(entrySecret),expiresAt,
    }})
    const updated=await tx.surveyWave.updateMany({
      where:{id:waveId,projectId,status:'DRAFT',revision},
      data:{status:'OPEN',opensAt:open,closesAt:close,finishUntil:wave.finishUntil||close,
        revision:{increment:1},updatedAt:now},
    })
    if(updated.count!==1)fail('波次开放发生并发冲突')
    if(project.status==='DRAFT'){
      await tx.surveyProject.update({
        where:{id:projectId},data:{status:'ACTIVE',publicId,revision:{increment:1}},
      })
    }else if(!project.publicId){
      await tx.surveyProject.update({where:{id:projectId},data:{publicId,revision:{increment:1}}})
    }
    await tx.surveyEvent.create({data:{
      id:randomUUID(),actorUserId:userId,projectId,action:'WAVE_RESEARCH_OPENED',
      metadata:{waveId,publicationId:wave.publicationId,definitionDigest:publication.definitionDigest},
    }})
    return {publicId,waveId,publicationId:wave.publicationId,
      researchUrl:'https://survey.eduk12.top/r/'+publicId+'#entry='+entrySecret,
      entrySecret,expiresAt}
  })
}
type WaveTransition='PAUSE'|'RESUME'|'CLOSE'|'HARD_STOP'
export async function transitionWave(userId:string,projectId:string,waveId:string,revision:number,action:WaveTransition){
  enabled()
  return prisma.$transaction(async tx=>{
    const project=await lockOwner(tx,userId,projectId)
    const wave=await lockWave(tx,projectId,waveId)
    if(wave.revision!==revision||!wave.publicationId)fail('波次版本已经变化')
    const allowed=action==='PAUSE'?wave.status==='OPEN':
      action==='RESUME'?wave.status==='PAUSED':
      ['OPEN','PAUSED'].includes(wave.status)
    if(!allowed)fail('当前波次状态不允许此操作')
    if(action==='RESUME'&&project.status!=='ACTIVE')fail('项目尚未恢复采集资格')
    const now=new Date()
    const nextStatus=action==='PAUSE'?'PAUSED':action==='RESUME'?'OPEN':'CLOSED'
    const changes:Prisma.SurveyWaveUpdateManyMutationInput={
      status:nextStatus,revision:{increment:1},updatedAt:now,
    }
    if(action==='CLOSE'){
      const latest=new Date(now.getTime()+2*3600000)
      changes.finishUntil=wave.finishUntil&&wave.finishUntil<latest?wave.finishUntil:latest
    }
    if(action==='HARD_STOP'){
      changes.hardStopAt=now
      changes.finishUntil=now
    }
    const row=await tx.surveyWave.updateMany({
      where:{id:waveId,projectId,status:wave.status,revision},data:changes,
    })
    if(row.count!==1)fail('波次状态变更并发冲突')
    if(action==='HARD_STOP'||action==='CLOSE')
      await tx.surveyEntryToken.updateMany({
        where:{projectId,waveId,revokedAt:null},data:{revokedAt:now},
      })
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:userId,projectId,
      action:'WAVE_RESEARCH_'+action,metadata:{waveId}}})
    return {waveId,status:nextStatus,revision:revision+1}
  })
}
