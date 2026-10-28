import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { cognitiveSeeds } from '../generated/seeds'
import { nativeCognitiveConfigSeeds } from '../content-candidates/native-registry/config-seeds'
import { getCognitiveV2TaskDefinition } from '../v2/registry'
import { evaluateCognitiveProductReadiness } from '../library/product-readiness'
import { assertCognitiveProductEligible } from '../product-eligibility'
import type { CognitiveSeed } from '../task-seed.types'

const text=z.string().min(1).max(200)
export const cognitiveInstallSelectionSchema=z.object({schemaVersion:z.literal(1),items:z.array(z.object({
  testType:text,configVersion:text,engineVersion:text,scoringVersion:text,
}).strict()).min(1).max(100)}).strict()
type Selection=z.infer<typeof cognitiveInstallSelectionSchema>
type Identity=Selection['items'][number]
type Db=Pick<Prisma.TransactionClient,'user'|'cognitiveTestConfig'|'assessmentManagementEvent'>
export type CognitiveInstallRow=Identity&{
  action:'CREATE_DRAFT'|'ALREADY_PRESENT'|'BLOCKED'|'CREATED_DRAFT'
  reasons:string[];configId?:string;status?:'DRAFT'|'PUBLISHED'|'RETIRED';sourceHash?:string
}
const key=(item:Identity)=>JSON.stringify([item.testType,item.configVersion])
const core=(value:{name:string;engineVersion:string;scoringVersion:string;config:unknown})=>({
  name:value.name,engineVersion:value.engineVersion,scoringVersion:value.scoringVersion,config:value.config,
})
async function assertActor(db:Db,actorUserId:string){
  const actor=await db.user.findUnique({where:{id:actorUserId}})
  if(!actor||actor.platformRole!=='SYSTEM_ADMIN'||!actor.isActive||actor.isFrozen
    ||actor.expiresAt&&actor.expiresAt<=new Date())throw new Error('ACTIVE_SYSTEM_ADMIN_REQUIRED')
}
function resolveSources(selection:Selection){
  const counts=new Map<string,number>()
  selection.items.forEach(item=>counts.set(key(item),(counts.get(key(item))??0)+1))
  return selection.items.map(item=>{
    const reasons:string[]=[],matches=[...cognitiveSeeds,...nativeCognitiveConfigSeeds].filter(seed=>seed.testType===item.testType&&seed.configVersion===item.configVersion)
    if(counts.get(key(item))!==1)reasons.push('DUPLICATE_CONFIG_SELECTION')
    if(matches.length!==1)reasons.push(matches.length?'AMBIGUOUS_REGISTERED_SEED':'CONFIG_SEED_NOT_REGISTERED')
    const seed=matches.length===1?matches[0]:undefined
    if(seed&&(seed.engineVersion!==item.engineVersion||seed.scoringVersion!==item.scoringVersion))reasons.push('EXECUTION_IDENTITY_MISMATCH')
    if(seed&&!reasons.length){
      assertCognitiveProductEligible(item.testType)
      const definition=getCognitiveV2TaskDefinition(item.testType,item.engineVersion,item.scoringVersion)
      if(!definition)reasons.push('EXECUTION_IDENTITY_NOT_REGISTERED')
      else reasons.push(...evaluateCognitiveProductReadiness(definition,seed.config).blockers.map(issue=>`${issue.stage}/${issue.code}`))
    }
    return {item,seed,reasons}
  })
}
async function inspect(db:Db,item:Identity,seed:CognitiveSeed|undefined,reasons:string[]):Promise<CognitiveInstallRow>{
  if(!seed||reasons.length)return {...item,action:'BLOCKED',reasons}
  const sourceHash=canonicalHash(core(seed)),existing=await db.cognitiveTestConfig.findUnique({
    where:{testType_configVersion:{testType:item.testType,configVersion:item.configVersion}},
  })
  if(!existing)return {...item,action:'CREATE_DRAFT',reasons:[],sourceHash}
  if(canonicalHash(core(existing))!==sourceHash)return {...item,action:'BLOCKED',reasons:['IMMUTABLE_CONFIG_CONFLICT'],configId:existing.id,status:existing.status,sourceHash}
  return {...item,action:'ALREADY_PRESENT',reasons:[],configId:existing.id,status:existing.status,sourceHash}
}

/** Select existing code-registered seeds only. This is not runtime code upload,
 * scientific endorsement, public release, or an entry permission grant. */
export async function planCognitiveConfigInstall(db:Db,raw:unknown,actorUserId:string){
  const selection=cognitiveInstallSelectionSchema.parse(raw);await assertActor(db,actorUserId)
  const sources=resolveSources(selection),rows:CognitiveInstallRow[]=[]
  for(const source of sources)rows.push(await inspect(db,source.item,source.seed,source.reasons))
  return {schemaVersion:1 as const,mode:'PREVIEW' as const,rows,hasBlocked:rows.some(row=>row.action==='BLOCKED')}
}

/** One transaction for selected eligible drafts. Ineligible items are explicitly
 * reported, not silently promoted; a DB error rolls back all writes in this call.
 * Same-identity existing rows keep their original lifecycle/access policy. */
export async function installCognitiveConfigs(db:PrismaClient,raw:unknown,actorUserId:string){
  const selection=cognitiveInstallSelectionSchema.parse(raw),sources=resolveSources(selection)
  return db.$transaction(async tx=>{
    await assertActor(tx,actorUserId)
    const rows:CognitiveInstallRow[]=[]
    for(const source of sources){
      const row=await inspect(tx,source.item,source.seed,source.reasons)
      if(row.action!=='CREATE_DRAFT'||!source.seed){rows.push(row);continue}
      const seed=source.seed
      const created=await tx.cognitiveTestConfig.create({data:{testType:seed.testType,configVersion:seed.configVersion,
        name:seed.name,engineVersion:seed.engineVersion,scoringVersion:seed.scoringVersion,
        config:seed.config as Prisma.InputJsonValue,status:'DRAFT',accessPolicy:'GRANT'}})
      await tx.assessmentManagementEvent.create({data:{actorId:actorUserId,resourceId:created.id,action:'COGNITIVE_CONFIG_INSTALL',
        metadata:{schemaVersion:1,...source.item,sourceHash:row.sourceHash,status:'DRAFT',accessPolicy:'GRANT'}}})
      rows.push({...row,action:'CREATED_DRAFT',configId:created.id,status:'DRAFT'})
    }
    return {schemaVersion:1 as const,mode:'APPLY' as const,rows,hasBlocked:rows.some(row=>row.action==='BLOCKED')}
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:15000})
}
