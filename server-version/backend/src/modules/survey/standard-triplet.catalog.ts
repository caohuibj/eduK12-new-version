import {isAssessmentOperationallyPaused} from '../assessment-governance/operational-hold'
import {Prisma,type PrismaClient} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease} from '../measurement-content/repository'
import {AdminPermissionError} from '../admin-permissions/service'
import {tripletSnapshot} from './standard-triplet.model'
import type {StandardRelease} from './standard-triplet.service'
type Db=PrismaClient|Prisma.TransactionClient
export const isSurveyStandardSource=(id:string)=>id.startsWith('survey-standard:')
export async function readOnlineStandardSnapshot(db:Db,sourceId:string,version:string){
 const id=sourceId.slice('survey-standard:'.length)
 const [r]=await db.$queryRaw<StandardRelease[]>`SELECT * FROM survey_standard_releases WHERE id=${id} FOR SHARE`
 if(!r||r.state!=='ONLINE'||r.combination_hash!==version||r.snapshot.combinationHash!==version||!r.measurement_release)throw new AdminPermissionError(409,'该三版本组合尚未通过试运行或已停止新增使用')
 if(isAssessmentOperationallyPaused({family:'SCALE',key:r.snapshot.toolKey,version:r.snapshot.instrumentVersion}))throw new AdminPermissionError(409,'该工具已被系统紧急停用')
 for(const part of Object.values(r.snapshot.parts))if(canonicalHash(part.payload)!==part.hash)throw new AdminPermissionError(409,'已批准版本内容不一致')
 const measurement=await getContentRelease(db,r.measurement_release.releaseId,true)
 if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status!=='PUBLISHED'||measurement.contentHash!==r.measurement_release.contentHash)throw new AdminPermissionError(409,'已批准内容版本不可用于新增投放')
 return tripletSnapshot(r.snapshot,r.id,r.measurement_release)
}
