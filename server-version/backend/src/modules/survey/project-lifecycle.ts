import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { SurveyWaveError } from './waves.service'

type ProjectAction='PAUSE'|'RESUME'|'CLOSE'
const fail=(msg:string):never=>{throw new SurveyWaveError(409,msg)}
const enabled=()=>{if(process.env.SURVEY_PUBLICATION_ENABLED!=='true')
  fail('Survey 项目采集管理尚未通过最终验收')}
export async function transitionResearchProject(input:{
  actorUserId:string;projectId:string;revision:number;action:ProjectAction
}){
  enabled()
  return prisma.$transaction(async tx=>{
    // Lock active DB entitlement and project together. JWT claims do not grant
    // research/project authority, and a cross-project ID never gains access.
    const [owner]=await tx.$queryRaw<Array<{id:string;status:string;revision:number}>>`
      SELECT p.id,p.status,p.revision FROM "survey_projects" p
      JOIN "users" u ON u.id=p.owner_user_id
      JOIN "survey_researcher_grants" g ON g.user_id=u.id
      JOIN "survey_mfa_credentials" m ON m.user_id=u.id
      WHERE p.id=${input.projectId} AND p.owner_user_id=${input.actorUserId}
        AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
        AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
        AND g.status='ACTIVE' AND m.enabled
      FOR UPDATE OF p
    `
    if(!owner)fail('项目不存在或研究者资格已失效')
    if(owner.revision!==input.revision)fail('项目已由另一个会话更新')
    const action=input.action
    const valid=action==='PAUSE'?owner.status==='ACTIVE':
      action==='RESUME'?owner.status==='PAUSED':
      ['ACTIVE','PAUSED'].includes(owner.status)
    if(!valid)fail('当前研究项目状态不允许此操作')
    const target=action==='PAUSE'?'PAUSED':action==='RESUME'?'ACTIVE':'CLOSED'
    const changed=await tx.surveyProject.updateMany({
      where:{id:input.projectId,ownerUserId:input.actorUserId,
        status:owner.status,revision:input.revision},
      data:{status:target,revision:{increment:1},updatedAt:new Date()},
    })
    if(changed.count!==1)fail('项目状态发生并发变化')
    if(action==='CLOSE'){
      const now=new Date(),grace=new Date(now.getTime()+2*3600000)
      const waves=await tx.surveyWave.findMany({
        where:{projectId:input.projectId,status:{in:['OPEN','PAUSED']}},
        select:{id:true,finishUntil:true},
      })
      // Stop all new admission immediately but preserve a bounded chance for
      // legitimately started attempts to finish unless a specific HARD_STOP.
      for(const w of waves)await tx.surveyWave.update({
        where:{id:w.id},data:{
          status:'CLOSED',revision:{increment:1},
          finishUntil:w.finishUntil&&w.finishUntil<grace?w.finishUntil:grace,
          updatedAt:now,
        },
      })
      await tx.surveyEntryToken.updateMany({
        where:{projectId:input.projectId,revokedAt:null},data:{revokedAt:now},
      })
    }
    await tx.surveyEvent.create({data:{
      id:randomUUID(),actorUserId:input.actorUserId,projectId:input.projectId,
      action:'RESEARCH_PROJECT_'+action,metadata:{from:owner.status,to:target},
    }})
    return {projectId:input.projectId,status:target,revision:input.revision+1}
  })
}
