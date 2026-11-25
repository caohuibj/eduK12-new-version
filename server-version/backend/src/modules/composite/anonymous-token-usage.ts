import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { compositeConflict } from './composite.errors'

const SHARDS = 64
/** Unlimited public links do not need a globally serialized quota counter.
 * Every successful START still durably counts once, in the same transaction.
 * A token SHARE fence preserves revoke/expiry/config races. Finite quotas retain
 * an exclusive final claim and include every previously committed shard. */
async function claimTokenUsageInTx(tx: Pick<Prisma.TransactionClient,'$queryRaw'>,
 token: {id:string;maxUses:number}, credentialIdentity: string): Promise<void> {
 if (token.maxUses === 0) {
  const shard = createHash('sha256').update(credentialIdentity).digest()[0] % SHARDS
  const rows = await tx.$queryRaw<Array<{tokenId:string}>>(Prisma.sql`
   WITH live_token AS MATERIALIZED (
    SELECT id FROM composite_assessment_access_tokens
    WHERE id=${token.id} AND max_uses=0 AND is_active=TRUE
      AND expires_at>(clock_timestamp() AT TIME ZONE 'UTC') FOR SHARE
   )
   INSERT INTO composite_access_token_usage_shards(token_id,shard,used_count)
   SELECT id,${shard},1 FROM live_token
   ON CONFLICT(token_id,shard) DO UPDATE SET used_count=composite_access_token_usage_shards.used_count+1
   RETURNING token_id AS "tokenId"`)
  if(rows.length!==1)throw compositeConflict('公开链接已停用、过期或参与上限已变更，请刷新后重试')
  return
 }
 // A separate statement after this lock sees all shard commits that completed
 // while waiting. A single UPDATE/subquery would retain its older MVCC snapshot.
 // Parent INSERTs already own FK KEY SHARE locks on this token. NO KEY UPDATE
 // serializes quota claims without a conflicting FK-lock upgrade deadlock.
 const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM composite_assessment_access_tokens WHERE id=${token.id} FOR NO KEY UPDATE`
 if(!locked.length)throw compositeConflict('公开链接不存在')
 const rows=await tx.$queryRaw<Array<{id:string}>>`UPDATE composite_assessment_access_tokens t
  SET used_count=t.used_count+1 WHERE t.id=${token.id} AND t.is_active=TRUE
   AND t.expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
   AND (t.max_uses=0 OR t.used_count+COALESCE((SELECT SUM(s.used_count) FROM composite_access_token_usage_shards s WHERE s.token_id=t.id),0)<t.max_uses)
  RETURNING t.id`
 if(rows.length!==1)throw compositeConflict('公开链接已达到最大参与次数或已停用')
}

/** Normalize a wall-clock expiry reached while waiting for a shard row. */
export async function claimAnonymousTokenUsage(tx: Pick<Prisma.TransactionClient,'$queryRaw'>,
 token: {id:string;maxUses:number}, credentialIdentity: string): Promise<void> {
 try { await claimTokenUsageInTx(tx,token,credentialIdentity) }
 catch(error) {
  const failure=error as {code?:string;message?:string;meta?:{code?:string;message?:string}}
  const text=String(failure.meta?.message??failure.message??'')
  if((failure.code==='23514'||failure.meta?.code==='23514') &&
   /Public token (is no longer eligible for an unlimited claim|quota exhausted)/.test(text))
   throw compositeConflict('公开链接已停用、过期或达到最大参与次数')
  throw error
 }
}

/** API usedCount remains the exact historical base plus new durable shards. */
export async function withAnonymousTokenUsage<T extends {id:string;usedCount:number}>(
 db: Pick<Prisma.TransactionClient,'$queryRaw'>, tokens: readonly T[]): Promise<T[]> {
 if(!tokens.length)return []
 const rows=await db.$queryRaw<Array<{tokenId:string;uses:bigint}>>(Prisma.sql`
  SELECT token_id AS "tokenId",SUM(used_count)::bigint AS uses FROM composite_access_token_usage_shards
  WHERE token_id IN (${Prisma.join(tokens.map(t=>t.id))}) GROUP BY token_id`)
 const totals=new Map(rows.map(r=>[r.tokenId,Number(r.uses)]))
 return tokens.map(token=>{
  const usedCount=token.usedCount+(totals.get(token.id)??0)
  if(!Number.isSafeInteger(usedCount))throw new Error('Public token usage exceeds safe integer range')
  return {...token,usedCount}
 })
}
